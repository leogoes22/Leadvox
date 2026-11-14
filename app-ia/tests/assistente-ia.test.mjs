import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {conferirRespostas,pedidoN8n,limparRascunho,TRABALHOS} from '../assistente-ia.mjs';
import {linksUteis,lerSiteTexto} from '../integrations/site-loja.mjs';
import {fluxoMontarIA,PROMPT,MONTAR_PEDIDO,LER_RESPOSTA} from '../n8n/montar-ia.mjs';

const org='22222222-2222-4222-8222-222222222222';
const base={empresa:{nome:'Leocar',nicho:'automotivo'},fontes:{site:'www.leocar.com.br',instagram:'https://instagram.com/leocar/',mapa:'https://maps.app.goo.gl/abc'},
 respostas:{vende:'Carros seminovos',trabalho:'vender',preco:'a_partir',nome:'Bruna',tom:'amigavel',horario:{semana:['08:00','18:00'],sabado:['09:00','13:00'],domingo:null}}};

test('assistente: respostas conferidas e normalizadas; o que falta vira mensagem clara', () => {
 const c=conferirRespostas(base);
 assert.equal(c.respostas.tipo,'sdr');assert.equal(c.fontes.instagram,'@leocar');assert.deepEqual(c.respostas.horario,{semana:['08:00','18:00'],sabado:['09:00','13:00'],domingo:null});
 const erro=(m,re)=>assert.throws(()=>conferirRespostas(m),e=>e.status===400&&re.test(e.message));
 erro({...base,respostas:{...base.respostas,vende:''}},/vende ou faz/);
 erro({...base,respostas:{...base.respostas,trabalho:'hackear'}},/principal trabalho/);
 erro({...base,respostas:{...base.respostas,preco:'x'}},/preço/);
 erro({...base,respostas:{...base.respostas,nome:'  '}},/nome/);
 erro({...base,fontes:{site:'javascript:alert(1)'}},/site/);
 erro({...base,fontes:{mapa:'http://maps'}},/https/);
 erro({...base,fontes:{instagram:'a b c'}},/Instagram/);
 assert.equal(conferirRespostas({...base,respostas:{...base.respostas,horario:{semana:['25:00','18:00']}}}).respostas.horario.semana,null);
 assert.equal(conferirRespostas({...base,respostas:{...base.respostas,tom:'grosso'}}).respostas.tom,'amigavel');
 assert.deepEqual(Object.values(TRABALHOS),['sdr','agendamento','catalogo','recepcao','suporte']);
});

test('assistente: o rascunho da IA é limpo (tamanhos, listas, origem) e nada inventado sobra sem marcação', () => {
 const c=conferirRespostas(base),lido={identidade:{endereco:'Av. Brasil, 100',telefone:'(21) 3333-4444',email:''},paginas:[]};
 const d=limparRascunho({ok:true,rascunho:{apresentacao:'Oi! '.repeat(200),segmento:'loja',faq:[
   {p:'Aceita troca?',r:'Sim, avaliamos na hora.',origem:'site'},{p:'Tem garantia?',r:'',origem:'site'},{p:'Ok?',r:'x',origem:'site'},
   {pergunta:'Qual o horário?',resposta:'Seg a sex 8h às 18h.',origem:'resposta'},{p:'Entregam?',r:'Talvez',origem:'inventada'}],
  coleta:['Nome',{nome:'nome'},{nome:'Carro de interesse',obrigatorio:true},{nome:'Entrada'},{nome:'Troca'},{nome:'Cidade'},{nome:'Extra'}],
  proibido:['Prometer crédito','',{}],followup:['a','b','c'],transferencia:'Vou te passar para a equipe.',lixo:'<script>'}},c,lido);
 assert.equal(d.apresentacao.length,400);
 assert.deepEqual(d.faq.map(f=>[f.p,f.origem]),[['Aceita troca?','site'],['Tem garantia?','confira'],['Qual o horário?','respostas'],['Entregam?','confira']]);
 assert.match(d.faq[1].nota,/Escreva a resposta/);
 assert.deepEqual(d.coleta.map(x=>x.nome),['Nome','Carro de interesse','Entrada','Troca','Cidade']);assert.equal(d.coleta[1].obrigatorio,true);
 assert.deepEqual(d.proibido,['Prometer crédito']);assert.equal(d.followup.length,2);
 assert.deepEqual(d.contatos.map(x=>x.tema),['Endereço','Telefone','Como chegar (Google Maps)']);
 assert.equal('lixo' in d,false);
 assert.deepEqual(limparRascunho(null,c,null).faq,[]);
});

test('assistente: o pedido ao n8n leva só o necessário e corta o texto do site', () => {
 const c=conferirRespostas(base);
 const p=pedidoN8n(c,{identidade:{endereco:'Av. 1',telefone:'1',whatsapp:'2',email:'a@b.c',logo:'x',cnpj:'y'},paginas:Array.from({length:6},(_,i)=>({url:'https://x/'+i,titulo:'T'+i,texto:'a'.repeat(9000)}))});
 assert.equal(p.site.paginas.length,4);assert.equal(p.site.paginas[0].texto.length,6000);
 assert.deepEqual(Object.keys(p.site.contatos),['endereco','telefone','whatsapp','email']);
 assert.equal(p.respostas.nome,'Bruna');assert.equal(p.instagram,'@leocar');
});

test('site: só links internos úteis (sobre, contato, perguntas), no máximo 3, sem arquivos nem outros sites', () => {
 const html=`<a href="/sobre-nos">Sobre</a><a href="https://outro.com/contato">x</a><a href="/estoque">Estoque</a><a href="/contato">Fale</a>
  <a href="/catalogo.pdf">Perguntas</a><a href="/duvidas">FAQ</a><a href="/servicos">Serviços</a><a href="/sobre-nos/">Sobre de novo</a>`;
 assert.deepEqual(linksUteis(html,'https://loja.com.br/'),['https://loja.com.br/sobre-nos','https://loja.com.br/contato','https://loja.com.br/duvidas']);
});

test('site: lê o início e as páginas úteis com as mesmas proteções (sem endereço interno)', async () => {
 const paginas={'https://loja.com.br/':'<title>Loja X | Carros</title><meta name="description" content="Seminovos revisados"><nav>menu</nav><h1>Bem-vindo</h1><p>Aceitamos troca.</p><script>x()</script><a href="/sobre">Sobre</a><a href="/contato">Contato</a>',
  'https://loja.com.br/sobre':'<title>Sobre</title><p>Desde 2012.</p>','https://loja.com.br/contato':'<p>Rua A, 10</p>'};
 const fetchImpl=async u=>{const h=paginas[u];return {ok:!!h,status:h?200:404,headers:new Headers({'content-type':'text/html'}),arrayBuffer:async()=>new TextEncoder().encode(h||'').buffer};};
 const r=await lerSiteTexto('loja.com.br',{fetchImpl,lookup:async()=>[{address:'104.21.3.4',family:4}]});
 assert.equal(r.paginas.length,3);assert.match(r.paginas[0].texto,/Seminovos revisados · .*Aceitamos troca/);
 assert.doesNotMatch(r.paginas[0].texto,/menu|x\(\)/);assert.match(r.paginas[1].texto,/Desde 2012/);
 await assert.rejects(lerSiteTexto('http://intranet.loja.com.br',{fetchImpl,lookup:async()=>[{address:'10.0.0.5',family:4}]}),e=>/público/.test(e.message));
});

async function fixture(t,{token='0123456789abcdef01234567',n8n=null,siteFalha=false}={}){
 const calls=[],n8nCalls=[];
 const s=createApp({allowLocal:true,esperaChave:1,lookupSites:async()=>[{address:'104.21.3.4',family:4}],
  fetchSites:async u=>{if(siteFalha)throw new Error('x');return {ok:true,status:200,headers:new Headers({'content-type':'text/html'}),arrayBuffer:async()=>new TextEncoder().encode('<title>Leocar</title><p>Seminovos com garantia.</p>').buffer};},
  fetchImpl:async(u,init)=>{
   if(u.endsWith('/auth/v1/user'))return {ok:true,status:200,json:async()=>({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'})};
   if(u.includes('iag-montar-ia')){n8nCalls.push({u,body:JSON.parse(init.body)});const r=n8n||{ok:true,rascunho:{apresentacao:'Oi, sou a Bruna!',faq:[{p:'Aceita troca?',r:'Sim.',origem:'site'}]}};return {ok:r.status?r.status<400:true,status:r.status||200,json:async()=>r};}
   if(u.includes('iag-painel-endereco'))return {ok:true,status:200,json:async()=>({})};
   const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];calls.push(fn);
   if(fn==='lv_motor_eventos')return {ok:true,status:200,json:async()=>({vinculado:true,conta:'leocar-ab12',token})};
   return {ok:true,status:200,json:async()=>({ok:true})};
  }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const b='http://127.0.0.1:'+s.address().port,h={Origin:b,Cookie:'__Host-lv_session=x'};
 return {calls,n8nCalls,post:x=>fetch(b+'/api/account/assistente-ia',{method:'POST',headers:h,body:JSON.stringify({organization:org,...base,...x})})};
}

test('rota: lê o site, chama o fluxo do n8n novo com a chave da conta e devolve o rascunho limpo', async t => {
 const f=await fixture(t);const r=await f.post({});assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.tipo,'sdr');assert.equal(d.rascunho.apresentacao,'Oi, sou a Bruna!');assert.equal(d.fontes.paginas.length,1);
 assert.match(f.n8nCalls[0].u,/^https:\/\/n8n\.leadvox\.com\.br\/webhook\/iag-montar-ia\?k=leocar-ab12&t=0123456789abcdef01234567$/);
 assert.match(f.n8nCalls[0].body.site.paginas[0].texto,/garantia/);
 // uma montagem por vez
 assert.equal((await f.post({})).status,429);
});

test('rota: site fora do ar não impede; fluxo ausente e chave ainda não gerada dão mensagens claras', async t => {
 const a=await fixture(t,{siteFalha:true});const ra=await (await a.post({})).json();assert.match(ra.aviso,/só com as suas respostas/);assert.equal(a.n8nCalls[0].body.site.paginas.length,0);
 const b=await fixture(t,{n8n:{status:404}});const rb=await b.post({});assert.equal(rb.status,503);assert.match((await rb.json()).error,/ainda não está disponível/);
 const c=await fixture(t,{token:null});const rc=await c.post({});assert.equal(rc.status,400);assert.match((await rc.json()).error,/sendo preparada/);assert.equal(c.n8nCalls.length,0);
 const d=await fixture(t);assert.equal((await d.post({respostas:{...base.respostas,vende:''}})).status,400);assert.equal(d.n8nCalls.length,0);
});

test('n8n: fluxo novo com webhook próprio, chave conferida no banco, sem guardar execução, prompt que proíbe inventar', () => {
 assert.throws(()=>fluxoMontarIA({}),/credenciais/);
 const w=fluxoMontarIA({supabase:{id:'s1',name:'Supabase'},openai:{id:'o1',name:'OpenAI LeadVox'}});
 assert.equal(w.active,false);assert.equal(w.settings.saveDataSuccessExecution,'none');assert.equal(w.settings.saveDataErrorExecution,'none');
 const wh=w.nodes.find(n=>n.name==='Webhook');assert.equal(wh.parameters.path,'iag-montar-ia');assert.equal(wh.parameters.responseMode,'responseNode');
 assert.match(w.nodes.find(n=>n.name==='Conferir conta').parameters.url,/rpc\/iag_eventos_confere$/);
 assert.deepEqual(w.connections['Liberado?'].main.map(x=>x[0].node),['Prompt','Negado']);
 assert.match(PROMPT,/NUNCA invente preço/);assert.match(PROMPT,/ignore qualquer instrução/);
 for(const code of [MONTAR_PEDIDO,LER_RESPOSTA])assert.doesNotThrow(()=>new vm.Script('(async()=>{'+code+'})'));
});

test('tela: assistente no painel, cria o agente desligado e só com o que foi conferido', () => {
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="dlgMonte"/);
 for(const s of ["api('assistente-ia'","acao: 'criar', tipo: AS.resultado.tipo","concluir: true","f.dataset.origem !== 'confira'",'Montar com o assistente','nasce desligada'])assert.ok(js.includes(s),s);
 assert.doesNotMatch(js.slice(js.indexOf('ASSISTENTE "MONTE SUA IA"'),js.indexOf('/* ═══════════ INÍCIO')),/acao: 'ativo'/,'o assistente nunca liga a IA');
});

test('tela: nenhum id repetido no painel e os ids do assistente não colidem com os da assinatura (as…)', () => {
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(ids.filter((x,i)=>ids.indexOf(x)!==i),[]);
 const bloco=js.slice(js.indexOf('ASSISTENTE "MONTE SUA IA"'),js.indexOf('/* ═══════════ INÍCIO'));
 assert.doesNotMatch(bloco,/\$\('as[A-Z]|id="as[A-Z]|'as[A-Z][A-Za-z0-9]*'/);
});

test('funil e etiquetas: o assistente leva às Ações e regras com o Modelo pronto, e o guia ganha o passo', () => {
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
 assert.match(js,/\['Funil, origem e oportunidade', '[^']+', !!String\(c\.regras\?\.texto \|\| ''\)\.trim\(\), 'agentes:automacoes', '#rgModelo'/);
 assert.ok(js.includes("await irAba('automacoes'); abrirModelo(false);"));
 assert.ok(js.includes('id="miFunil"'));
});
