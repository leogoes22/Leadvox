import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {createApp} from '../server.mjs';
import {normalizarDominio,hostsDe,principalDe,registrosDns,verificarDominio,assinarResultado,consultarDisponibilidade,DESTINO,GITHUB_IPS} from '../integrations/dominio.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222',conta='loja-teste-ab12cd34';
const sql=readFileSync(new URL('../database/site_dominio.sql',import.meta.url),'utf8');

test('endereço: limpa o que o lojista cola e recusa endereço da LeadVox', () => {
 assert.equal(normalizarDominio('https://WWW.SuaLoja.com.br/estoque?x=1'),'www.sualoja.com.br');
 assert.equal(normalizarDominio('sualoja.com.br.'),'sualoja.com.br');
 for(const ruim of ['','loja','http://','ia.leadvox.com.br','x.sslip.io','leogoes22.github.io','a b.com','-x.com.br'])assert.equal(normalizarDominio(ruim),'',ruim);
 assert.deepEqual(hostsDe({dominio:'sualoja.com.br',tipo:'principal'}),['sualoja.com.br','www.sualoja.com.br']);
 assert.deepEqual(hostsDe({dominio:'estoque.sualoja.com.br',tipo:'subdominio'}),['estoque.sualoja.com.br']);
 assert.equal(principalDe({dominio:'sualoja.com.br',tipo:'principal',preferido:'www'}),'www.sualoja.com.br');
 assert.equal(principalDe({dominio:'sualoja.com.br',tipo:'principal',preferido:'raiz'}),'sualoja.com.br');
});

test('registros DNS: VPS da LeadVox ou GitHub Pages, com o TXT de controle', () => {
 let r=registrosDns({dominio:'sualoja.com.br',tipo:'principal',token:'abc123'});
 assert.deepEqual(r.map(x=>[x.tipo,x.nome,x.valor]),[['TXT','_leadvox','leadvox=abc123'],['A','@',DESTINO.ip],['CNAME','www',DESTINO.host]]);
 r=registrosDns({dominio:'estoque.sualoja.com.br',tipo:'subdominio',token:'abc123'});
 assert.deepEqual(r.map(x=>[x.tipo,x.nome,x.valor,x.completo]),[['TXT','_leadvox.estoque','leadvox=abc123','_leadvox.estoque.sualoja.com.br'],['CNAME','estoque',DESTINO.host,'estoque.sualoja.com.br']]);
 r=registrosDns({dominio:'mgmotosrj.com.br',tipo:'principal',token:'t',hospedagem:{tipo:'github',repo:'leogoes22/mgmotos'}});
 assert.deepEqual(r.filter(x=>x.tipo==='A').map(x=>x.valor),GITHUB_IPS);
 assert.equal(r.find(x=>x.tipo==='CNAME').valor,'leogoes22.github.io');
});

// DNS e sites de mentira
function mundo({txt=[],a={},cname={},paginas={}}){
 const dns={resolveTxt:async h=>{if(h==='_leadvox.sualoja.com.br'||h==='_leadvox.estoque.sualoja.com.br')return txt.map(t=>[t]);throw Error('ENODATA');},
  resolve4:async h=>{if(a[h])return a[h];throw Error('ENOTFOUND');},resolveCname:async h=>{if(cname[h])return cname[h];throw Error('ENODATA');}};
 const fetchImpl=async url=>{const h=new URL(url).host,p=paginas[h];if(!p)throw Error('certificado inválido');
  return {status:p.status||200,headers:{get:k=>k==='location'?p.location||null:null},text:async()=>p.html||''};};
 return {dns,fetchImpl};
}
const base={dominio:'sualoja.com.br',tipo:'principal',preferido:'www',token:'tok1',conta};

test('verificação: sem o TXT fica pendente; com o TXT e sem HTTPS fica confirmado, com a pendência da LeadVox à mostra', async () => {
 let r=await verificarDominio(base,mundo({}));
 assert.equal(r.status,'pendente');assert.equal(r.propriedade,false);assert.match(r.proximo,/TXT/);
 r=await verificarDominio(base,mundo({txt:['leadvox=tok1'],a:{'sualoja.com.br':[DESTINO.ip],'www.sualoja.com.br':[DESTINO.ip]},cname:{'www.sualoja.com.br':[DESTINO.host+'.']}}));
 assert.equal(r.status,'verificado');assert.ok(r.dns.every(x=>x.ok));assert.ok(r.https.every(x=>!x.ok));
 assert.ok(r.pendencias.some(p=>p.quem==='leadvox'&&/HTTPS/.test(p.texto)));
});

test('verificação: "ativo" só com DNS, HTTPS, a página desta loja e o redirecionamento do outro endereço', async () => {
 const certo={txt:['leadvox=tok1'],a:{'sualoja.com.br':[DESTINO.ip],'www.sualoja.com.br':[DESTINO.ip]},
  paginas:{'www.sualoja.com.br':{html:'<html><script src="/site/tema.js" data-loja="'+conta+'" defer></script></html>'},'sualoja.com.br':{status:301,location:'https://www.sualoja.com.br/'}}};
 let r=await verificarDominio(base,mundo(certo));
 assert.equal(r.status,'ativo');assert.equal(r.identidade,true);assert.equal(r.redirecionamento,true);assert.deepEqual(r.pendencias,[]);
 // mesmo IP, outra loja: não é ativo
 r=await verificarDominio(base,mundo({...certo,paginas:{...certo.paginas,'www.sualoja.com.br':{html:'<script data-loja="outra-loja-11112222"></script>'}}}));
 assert.equal(r.status,'verificado');assert.equal(r.identidade,false);
 // sem www não redireciona: não é ativo
 r=await verificarDominio(base,mundo({...certo,paginas:{...certo.paginas,'sualoja.com.br':{html:'outro site'}}}));
 assert.equal(r.status,'verificado');assert.equal(r.redirecionamento,false);
 // TXT de outra loja não vale
 r=await verificarDominio(base,mundo({...certo,txt:['leadvox=outro']}));assert.equal(r.status,'pendente');
});

test('verificação de subdomínio: só ele é conferido (o site principal da loja fica onde está)', async () => {
 const sub={dominio:'estoque.sualoja.com.br',tipo:'subdominio',preferido:'www',token:'tok2',conta};
 const r=await verificarDominio(sub,mundo({txt:['leadvox=tok2'],cname:{'estoque.sualoja.com.br':[DESTINO.host]},a:{'estoque.sualoja.com.br':[DESTINO.ip]},
  paginas:{'estoque.sualoja.com.br':{html:'data-loja="'+conta+'"'}}}));
 assert.deepEqual(r.hosts,['estoque.sualoja.com.br']);assert.equal(r.redirecionamento,null);assert.equal(r.status,'ativo');
});

test('assinatura igual à que o banco confere (HMAC-SHA256 de org|dominio|status|ts)', () => {
 const s=assinarResultado('segredo',org,'sualoja.com.br','ativo',1700000000000);
 assert.equal(s,createHmac('sha256','segredo').update(org+'|sualoja.com.br|ativo|1700000000000').digest('hex'));
 assert.match(sql,/extensions\.hmac\(org::text\|\|'\|'\|\|coalesce\(p_dominio,''\)\|\|'\|'\|\|p_status\|\|'\|'\|\|p_ts::text,k,'sha256'\)/);
});

test('disponibilidade: Registro.br para .br (404 = livre, 200 = registrado)', async () => {
 let pedido='';const f=st=>async url=>{pedido=url;return {status:st};};
 assert.deepEqual(await consultarDisponibilidade('minhaloja.com.br',{fetchImpl:f(404)}),{ok:true,dominio:'minhaloja.com.br',disponivel:true,fonte:'https://rdap.registro.br/domain/minhaloja.com.br'});
 assert.equal((await consultarDisponibilidade('minhaloja.com',{fetchImpl:f(200)})).disponivel,false);assert.match(pedido,/rdap\.org/);
 assert.equal((await consultarDisponibilidade('não',{fetchImpl:f(404)})).ok,false);
});

async function servidor(t,{rpc={},segredo,dns,sites}={}){
 const calls=[];
 const s=createApp({allowLocal:true,segredoDominio:segredo,dns,fetchSites:sites,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(false);
  if(fn in rpc)return ok(typeof rpc[fn]==='function'?rpc[fn](body):rpc[fn]);
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const b='http://127.0.0.1:'+s.address().port,h={Origin:b,Cookie:'__Host-lv_session=sessao-x'};
 return {calls,b,get:p=>fetch(b+p,{headers:h}),post:(p,c)=>fetch(b+p,{method:'POST',headers:h,body:JSON.stringify(c)})};
}
const salvo={conta,publicado:true,hospedagem:{tipo:'leadvox',repo:null},pedidos:[],
 dominio:{dominio:'sualoja.com.br',tipo:'principal',preferido:'www',hosts:['sualoja.com.br','www.sualoja.com.br'],token:'tok1',status:'pendente',checagem:{}}};

test('API do lojista: mostra os registros; endereço inválido não chega ao banco; sem a chave na VPS a verificação avisa', async t => {
 let f=await servidor(t,{rpc:{lv_site_dominio:salvo}});
 let r=await f.get('/api/account/site-dominio?organization='+org);assert.equal(r.status,200);
 let d=await r.json();assert.equal(d.principal,'www.sualoja.com.br');assert.equal(d.registros[0].valor,'leadvox=tok1');assert.equal(d.verificacaoLigada,false);
 r=await f.post('/api/account/site-dominio',{organization:org,acao:'salvar',dominio:'ia.leadvox.com.br',tipo:'principal'});assert.equal(r.status,400);
 assert.ok(!f.calls.some(c=>c.fn==='lv_site_dominio_salvar'));
 r=await f.post('/api/account/site-dominio',{organization:org,acao:'verificar'});assert.equal(r.status,503);assert.match((await r.json()).error,/ainda não foi ligada/);
 f=await servidor(t,{rpc:{lv_site_dominio_salvar:{ok:false,erro:'em_uso'}}});
 r=await f.post('/api/account/site-dominio',{organization:org,acao:'salvar',dominio:'https://www.sualoja.com.br/',tipo:'principal'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/outra loja/);
 assert.equal(f.calls.find(c=>c.fn==='lv_site_dominio_salvar').body.p_dominio,'www.sualoja.com.br');
});

test('API do lojista: a verificação vai ao banco assinada com a chave da VPS', async t => {
 const w=mundo({});
 const f=await servidor(t,{segredo:'chave-vps',dns:w.dns,sites:w.fetchImpl,rpc:{lv_site_dominio:salvo,lv_site_dominio_resultado:{ok:true}}});
 const r=await f.post('/api/account/site-dominio',{organization:org,acao:'verificar'});assert.equal(r.status,200);
 const g=f.calls.find(c=>c.fn==='lv_site_dominio_resultado').body;
 assert.equal(g.p_status,'pendente');assert.equal(g.p_assinatura,createHmac('sha256','chave-vps').update(org+'|sualoja.com.br|pendente|'+g.p_ts).digest('hex'));
 assert.match(g.p_checagem.proximo,/TXT/);
});

test('domínio próprio: abre só o site da loja na raiz, redireciona o outro endereço e não mostra o painel', async t => {
 const dados={ativo:true,modelo:'premium',publicado:true,identidade:{nome:'Loja X',cidade:'Rio',whatsapp:'21988887777'},itens:[]};
 const f=await servidor(t,{rpc:{lv_site_dominio_host:b=>/sualoja\.com\.br$/.test(b.p_host)?{conta,dominio:'sualoja.com.br',tipo:'principal',preferido:'www',hosts:['sualoja.com.br','www.sualoja.com.br'],status:'verificado'}:null,
  lv_site_dados:dados}});
 const com=(host,p)=>new Promise((res,rej)=>{import('node:http').then(({request})=>{const u=new URL(f.b);const q=request({host:u.hostname,port:u.port,path:p,headers:{Host:host}},r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>res({status:r.statusCode,headers:r.headers,body:s}));});q.on('error',rej);q.end();});});
 let r=await com('www.sualoja.com.br','/');assert.equal(r.status,200);assert.match(r.body,new RegExp('data-loja="'+conta+'"'));
 r=await com('www.sualoja.com.br','/estoque.html');assert.equal(r.status,200);
 r=await com('sualoja.com.br','/estoque.html');assert.equal(r.status,301);assert.equal(r.headers.location,'https://www.sualoja.com.br/estoque.html');
 r=await com('www.sualoja.com.br','/painel.js');assert.equal(r.status,404);
 r=await com('www.sualoja.com.br','/site/tema.js');assert.equal(r.status,200);
 r=await com('outra.com.br','/');assert.equal(r.status,200);assert.doesNotMatch(r.body,/data-loja/,'endereço sem dono: segue o painel normal');
});

test('banco: só o servidor assina, endereço confirmado não vai para outra loja, leitura pública só do que tem controle provado', () => {
 assert.match(sql,/grant execute on function public\.lv_site_dominio_host\(text\) to anon,authenticated/);
 assert.match(sql,/where lower\(p_host\)=any\(d\.hosts\) and d\.status in \('verificado','ativo'\)/);
 assert.match(sql,/x\.organization_id<>org and x\.status<>'pendente' and x\.hosts && hs/);
 assert.match(sql,/abs\(agora-p_ts\)>600000/);
 assert.match(sql,/if not public\.lv_is_platform_admin\(\) then raise exception 'forbidden'/);
 assert.match(sql,/titular_documento=doc/);assert.match(sql,/length\(doc\) not in \(11,14\)/);
 assert.doesNotMatch(sql,/lv_admin_dominio_chave\(\)[^;]*to anon/);
 assert.match(readFileSync(new URL('../database/controle.sql',import.meta.url),'utf8'),/site_dominio\.sql/);
});
