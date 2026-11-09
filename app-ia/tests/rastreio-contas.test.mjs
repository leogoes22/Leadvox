import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {buscarAnuncios,conferirLeitura} from '../supabase/functions/rastreio/rastreio.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';

// Graph falso: dois anúncios em contas diferentes (carros e motos) e um anúncio que a conta não enxerga.
const graph=(u,init)=>{
 const auth=init?.headers?.Authorization||'';
 if(auth.includes('ruim'))return ok({error:{message:'Invalid OAuth access token.',code:190}},400);
 if(u.includes('/me?'))return ok({id:'61500',name:'Usuário do sistema'});
 if(u.includes('/111?'))return ok({id:'111',name:'Hatch 2022',account_id:'1094590271672229',campaign:{id:'901',name:'Seminovos com garantia'},adset:{name:'RJ 25-55'}});
 if(u.includes('/222?'))return ok({id:'222',name:'Moto 0 km',account_id:'958660971797474',campaign:{id:'902',name:'Feirão de motos'},adset:{name:'RJ'}});
 if(u.includes('/act_1094590271672229?'))return ok({name:'[C.A] - [P5 Motors Carros]'});
 if(u.includes('/act_958660971797474?'))return ok({name:'[C.A] - [P5 Motors Motos]'});
 return ok({error:{message:'Unsupported get request.',code:100}},400);
};

test('busca na Meta: conta, campanha e conjunto de cada anúncio; anúncio fora de alcance vira erro', async () => {
 const chamadas=[];
 const r=await buscarAnuncios({ids:['111','222','333','111','abc'],token:'EAAGleitura',fetchImpl:async(u,i)=>{chamadas.push([u,i]);return graph(u,i);}});
 const por=Object.fromEntries(r.map(x=>[x.anuncio,x]));
 assert.deepEqual(Object.keys(por).sort(),['111','222','333']);
 assert.deepEqual(por['111'],{anuncio:'111',status:'ok',nome:'Hatch 2022',contaId:'1094590271672229',campanhaId:'901',campanha:'Seminovos com garantia',conjunto:'RJ 25-55',contaNome:'[C.A] - [P5 Motors Carros]'});
 assert.equal(por['222'].contaNome,'[C.A] - [P5 Motors Motos]');
 assert.equal(por['333'].status,'erro');assert.match(por['333'].detalhe,/Unsupported/);
 assert.ok(chamadas.every(([u,i])=>!u.includes('EAAG')&&i.headers.Authorization==='Bearer EAAGleitura'),'token só no cabeçalho');
 await assert.rejects(buscarAnuncios({ids:['111'],token:'EAAGruim',fetchImpl:async(u,i)=>graph(u,i)}),e=>e.codigo===190);
 assert.equal((await conferirLeitura({token:'EAAGleitura',fetchImpl:async(u,i)=>graph(u,i)})).id,'61500');
 await assert.rejects(conferirLeitura({token:'EAAGruim',fetchImpl:async(u,i)=>graph(u,i)}),/não aceitou esse token de leitura/);
});

async function fixture(t,{pendentes=['111','222'],segredos={meta_ads:'EAAGleitura',meta:'EAAGconversoes'},admin=true}={}){
 const calls=[],metas=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.startsWith('https://graph.facebook.com/')){metas.push([u,init]);return graph(u,init);}
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(admin);
  if(fn==='lv_rastreio')return ok({liberado:true,ativo:true,podeEditar:true,token:'b'.repeat(32),pixelId:'932919801382762',temToken:true});
  if(fn==='lv_rastreio_salvar')return ok({liberado:true,...body.conf});
  if(fn==='lv_rastreio_anuncios_pendentes')return ok(pendentes);
  if(fn==='lv_integration_secret'){const v=segredos[body.prov];return ok(v?[{settings:{},secret:v}]:[]);}
  if(fn==='lv_rastreio_anuncios_salvar')return ok(body.itens.length);
  if(fn==='lv_rastreio_relatorio')return ok({totais:{leads:2},contas:[{id:'1094590271672229',nome:'Carros',leads:1}]});
  if(fn==='lv_admin_rastreio_lista')return ok([{id:org,nome:'P5 Motors',ativo:true,contas:2,leads30:142}]);
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,metas,
  get:p=>fetch(base+'/api/account/'+p,{headers:h}),
  post:(p,b)=>fetch(base+'/api/account/'+p,{method:'POST',headers:h,body:JSON.stringify(b)})};
}
const periodo='&ini=2026-10-11&fim=2026-11-09';

test('relatório: anúncios novos são buscados na Meta com o token de leitura e guardados; filtro por conta vai ao banco', async t => {
 const f=await fixture(t);
 const r=await f.get('rastreio-relatorio?organization='+org+periodo+'&conta=1094590271672229');assert.equal(r.status,200);
 assert.ok(f.metas.every(([,i])=>i.headers.Authorization==='Bearer EAAGleitura'));
 const salvo=f.calls.find(c=>c.fn==='lv_rastreio_anuncios_salvar').body;assert.equal(salvo.org,org);
 assert.deepEqual(salvo.itens.map(x=>[x.anuncio,x.contaNome]).sort(),[['111','[C.A] - [P5 Motors Carros]'],['222','[C.A] - [P5 Motors Motos]']]);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_rastreio_relatorio').body,{org,ini:'2026-10-11',fim:'2026-11-09',conta:'1094590271672229'});
 assert.equal((await f.get('rastreio-relatorio?organization='+org+periodo+'&conta=1;drop')).status,400);
 // Sem token de leitura usa o da API de Conversões; sem nenhum token não chama a Meta e o relatório sai mesmo assim.
 const so=await fixture(t,{segredos:{meta:'EAAGconversoes'}});await so.get('rastreio-relatorio?organization='+org+periodo);
 assert.ok(so.metas.length&&so.metas.every(([,i])=>i.headers.Authorization==='Bearer EAAGconversoes'));
 const nada=await fixture(t,{segredos:{}});assert.equal((await nada.get('rastreio-relatorio?organization='+org+periodo)).status,200);assert.equal(nada.metas.length,0);
 const ruim=await fixture(t,{segredos:{meta_ads:'EAAGruim'}});assert.equal((await ruim.get('rastreio-relatorio?organization='+org+periodo)).status,200);
 assert.equal(ruim.calls.some(c=>c.fn==='lv_rastreio_anuncios_salvar'),false);
 const semPendente=await fixture(t,{pendentes:[]});await semPendente.get('rastreio-relatorio?organization='+org+periodo);assert.equal(semPendente.metas.length,0);
});

test('salvar o token de leitura: a Meta confere antes, vai ao cofre como meta_ads e os erros antigos são esquecidos', async t => {
 const f=await fixture(t);
 const r=await f.post('rastreio',{organization:org,pixelId:'932919801382762',tokenAnuncios:'EAAGleituraNova1234567890'});assert.equal(r.status,200);
 assert.doesNotMatch(JSON.stringify(await r.json()),/EAAGleitura/);
 assert.match(f.metas[0][0],/\/me\?fields=id,name$/);
 const set=f.calls.find(c=>c.fn==='lv_set_integration');assert.equal(set.body.prov,'meta_ads');assert.equal(set.body.sec,'EAAGleituraNova1234567890');
 assert.ok(f.calls.some(c=>c.fn==='lv_rastreio_anuncios_reset'));
 const g=await fixture(t);const r2=await g.post('rastreio',{organization:org,pixelId:'932919801382762',tokenAnuncios:'EAAGruimRuimRuim1234567890'});
 assert.equal(r2.status,400);assert.match((await r2.json()).error,/não aceitou esse token de leitura/);assert.equal(g.calls.some(c=>c.fn==='lv_set_integration'),false);
});

test('Super Admin: lista do módulo só para a LeadVox', async t => {
 const f=await fixture(t);const r=await (await f.get('admin-rastreio-lista')).json();assert.equal(r.empresas[0].contas,2);
 const outro=await fixture(t,{admin:false});assert.equal((await outro.get('admin-rastreio-lista')).status,403);
});

test('banco: rastreio_contas.sql confere quem chama, troca o relatório e não usa \\d', () => {
 const sql=readFileSync(new URL('../database/rastreio_contas.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/security definer set search_path=''/g)||[]).length,(sql.match(/create or replace function/g)||[]).length);
 assert.match(sql,/drop function if exists public\.lv_rastreio_relatorio\(uuid,date,date\)/);
 for(const fn of ['lv_rastreio_anuncios_pendentes\\(uuid\\)','lv_rastreio_anuncios_salvar\\(uuid,jsonb\\)','lv_rastreio_anuncios_reset\\(uuid\\)','lv_admin_rastreio_lista\\(\\)','lv_rastreio_relatorio\\(uuid,date,date,text\\)'])
  assert.match(sql,new RegExp('revoke all on function public\\.'+fn+' from public,anon'),fn);
 assert.match(sql,/grant execute on function public\.iag_rastreio_lead\(text,jsonb\) to service_role/);
 assert.match(sql,/lv_is_platform_admin\(\)/);assert.match(sql,/'meta_ads'/);
 assert.doesNotMatch(sql,/\\d/,'o editor do Supabase troca \\d por d: use [0-9]');
});
