import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {abrirLink,lerLink,avaliacoesDoGoogle} from '../integrations/google-avaliacoes.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const LONGO='https://www.google.com/maps/place/Brants+Car/@-22.8012345,-43.3654321,17z/data=!3m1!4b1!4m6!3m5!1s0x99:0x88!8m2!3d-22.8012!4d-43.3654';

// Google de mentira: link curto redireciona; busca de texto acha o lugar; detalhes trazem 5 avaliações
function google({detalhes,status=200}={}){
 const pedidos=[];
 const fetchImpl=async(url,init={})=>{
  pedidos.push({url,init});
  if(url.startsWith('https://maps.app.goo.gl/'))return {status:302,headers:{get:k=>k==='location'?LONGO:null}};
  if(url.endsWith('places:searchText'))return {ok:status<400,status,json:async()=>({places:[{id:'ChIJbrantscar123456'}]})};
  if(url.includes('/places/ChIJ'))return {ok:status<400,status,json:async()=>detalhes||{displayName:{text:'Brants Car'},formattedAddress:'Rua X, Rio',rating:4.8,userRatingCount:132,reviews:[
   {rating:5,text:{text:'Atendimento excelente, carro impecável e entrega rápida. Recomendo demais!'},authorAttribution:{displayName:'Ana Lima'},relativePublishTimeDescription:'há 2 semanas'},
   {rating:3,text:{text:'Demorou um pouco para responder, mas o carro era bom.'},authorAttribution:{displayName:'Carlos'}},
   {rating:4,originalText:{text:'Gostei muito do atendimento do vendedor, muito atencioso.'},text:{text:'(tradução)'},authorAttribution:{displayName:'Bruno Souza'}},
   {rating:5,text:{text:'Top'},authorAttribution:{displayName:'Curto Demais'}},
   {rating:5,text:{text:'Loja séria, documentação resolvida no mesmo dia e preço justo.'},authorAttribution:{displayName:'Dani Rocha'}}]}};
  throw Error('fora do Google: '+url);
 };
 return {fetchImpl,pedidos};
}

test('link do Maps: segue o link curto só dentro do Google e lê nome e coordenadas', async () => {
 const g=google();
 const u=await abrirLink('https://maps.app.goo.gl/abc123',{fetchImpl:g.fetchImpl});
 assert.equal(u.hostname,'www.google.com');
 assert.deepEqual(lerLink(u),{id:'',nome:'Brants Car',lat:-22.8012345,lng:-43.3654321});
 assert.equal(await abrirLink('https://site-malicioso.com/maps',{fetchImpl:g.fetchImpl}),null);
 assert.equal(await abrirLink('http://maps.app.goo.gl/x',{fetchImpl:g.fetchImpl}),null);
 assert.equal(lerLink(new URL('https://www.google.com/maps/search/?api=1&query=Loja&query_place_id=ChIJabcdefghijkl')).id,'ChIJabcdefghijkl');
});

test('avaliações: só 4 e 5 estrelas com texto de verdade, no máximo 3, com o texto original', async () => {
 const g=google();
 const r=await avaliacoesDoGoogle('https://maps.app.goo.gl/abc123',{chave:'k',fetchImpl:g.fetchImpl});
 assert.equal(r.ok,true);assert.deepEqual(r.lugar,{nome:'Brants Car',endereco:'Rua X, Rio',nota:4.8,total:132});
 assert.deepEqual(r.avaliacoes.map(a=>a.nome),['Ana Lima','Dani Rocha','Bruno Souza']);
 assert.equal(r.avaliacoes[2].texto,'Gostei muito do atendimento do vendedor, muito atencioso.');
 const busca=g.pedidos.find(p=>p.url.endsWith('places:searchText'));
 assert.equal(busca.init.headers['X-Goog-Api-Key'],'k');assert.equal(JSON.parse(busca.init.body).locationBias.circle.center.latitude,-22.8012345);
 assert.equal((await avaliacoesDoGoogle('https://maps.app.goo.gl/abc',{chave:'',fetchImpl:g.fetchImpl})).erro,'chave');
 assert.equal((await avaliacoesDoGoogle('https://exemplo.com',{chave:'k',fetchImpl:g.fetchImpl})).erro,'link');
 assert.equal((await avaliacoesDoGoogle('https://maps.app.goo.gl/abc',{chave:'k',fetchImpl:google({status:403}).fetchImpl})).erro,'chave');
});

async function servidor(t,{chave}={}){
 const calls=[],g=google();
 const s=createApp({allowLocal:true,chaveGoogle:chave,fetchSites:g.fetchImpl,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];calls.push(fn);
  if(fn==='lv_site_config')return ok({conta:'loja-teste-ab12cd34'});
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const b='http://127.0.0.1:'+s.address().port,h={Origin:b,Cookie:'__Host-lv_session=sessao-x'};
 return {calls,post:c=>fetch(b+'/api/account/site-google-avaliacoes',{method:'POST',headers:h,body:JSON.stringify(c)})};
}

test('rota: confere quem pode mexer no site; sem a chave da LeadVox avisa; com a chave devolve as avaliações', async t => {
 let f=await servidor(t);
 let r=await f.post({organization:org,link:'https://maps.app.goo.gl/abc123'});assert.equal(r.status,503);assert.match((await r.json()).error,/ainda não foi ligada/);
 assert.ok(f.calls.includes('lv_site_config'));
 f=await servidor(t,{chave:'k'});
 r=await f.post({organization:org,link:'https://maps.app.goo.gl/abc123'});assert.equal(r.status,200);
 assert.equal((await r.json()).avaliacoes.length,3);
 r=await f.post({organization:org,link:'https://maps.app.goo.gl/abc123'});assert.equal(r.status,429,'uma busca a cada 10 s');
 assert.equal((await f.post({organization:'x',link:'y'})).status,400);
});

test('painel: orientação da logo no "i", tratamento da logo no aparelho e logo obrigatória para publicar; a busca no Google fica fora da tela (custo por consulta)', () => {
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
 assert.match(js,/class="dica-i"[^>]*data-dica="Logo ideal: PNG sem fundo/);
 assert.match(js,/async function prepararLogo\(arq\)/);assert.match(js,/body: pr\.blob/);
 assert.match(js,/Sua logo é escura e vai sumir no topo escuro do site/);
 assert.match(js,/Para publicar, envie a logo da loja/);
 assert.doesNotMatch(js,/site-google-avaliacoes|id="smGoogle"/);
 assert.match(js,/no Google Maps, abra a loja → Avaliações/);
 assert.match(readFileSync(new URL('../public/lv.css',import.meta.url),'utf8'),/\.dica-i:hover::after/);
});
