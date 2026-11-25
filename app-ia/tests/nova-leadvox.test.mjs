import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatClient,parseChatUrl,chatUrlProblem,ehNovaLeadvox,canalDaLista,normalizeItems,normalizeOpportunities,lerFunil} from '../integrations/chat-leadvox.mjs';
import {ligacaoMotor,DESLOCA_NL} from '../account-api.mjs';

const API='03db0c27-fe76-447b-ba24-81715a75b1b2',ROOT='https://apicrm.leadvox.com.br/v2',TOKEN='tokenopaco1234567890';
// API de mentira da nova LeadVox: devolve o que está no mapa (rota → corpo) e anota cada pedido
const falsa=(mapa,pedidos=[])=>async(url,opt={})=>{
 const rota=String(url).replace(ROOT+'/api/external/'+API,'')||'/';
 pedidos.push({rota,metodo:opt.method||'GET',auth:opt.headers?.Authorization,url:String(url),corpo:opt.body?JSON.parse(opt.body):null});
 const r=mapa[rota];
 if(r===undefined)return {ok:false,status:404,json:async()=>({error:'ERR_NOT_FOUND'})};
 if(r&&r.__status)return {ok:false,status:r.__status,json:async()=>r.body};
 return {ok:true,status:200,json:async()=>r};
};
const cliente=(mapa,pedidos)=>createChatClient({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa(mapa,pedidos)});

test('endereço: a URL da nova LeadVox com o token separado é aceita; a do CRM antigo continua valendo', () => {
 const url=ROOT+'/api/external/'+API;
 assert.equal(chatUrlProblem(url,TOKEN),null);
 assert.equal(chatUrlProblem(url,''),'token');
 const p=parseChatUrl(url,'Bearer '+TOKEN);
 assert.deepEqual(p,{root:ROOT,apiId:API,token:TOKEN});
 assert.equal(chatUrlProblem('https://chatapi.leadvox.com.br/v1/api/external/12/?token=abcdefghijkl'),null);
 assert.equal(chatUrlProblem('https://outro.com.br/v2/api/external/12/?token=abcdefghijkl'),'host');
 assert.equal(ehNovaLeadvox(ROOT),true);assert.equal(ehNovaLeadvox('https://chatapi.leadvox.com.br/v1'),false);
});

test('cliente: lista departamentos, vendedores e etiquetas só com o token Bearer (sem token na URL)', async () => {
 const pedidos=[];
 const c=cliente({'/listQueues':[{id:13,queue:'Comercial',color:'#2be87b'},{id:12,queue:'Administrativo'}],
  '/listUsers':{users:[{id:5,name:'Amanda',inactive:false},{id:6,name:'Bruno',inactive:true}]},
  '/listTags':{data:[{id:1,tag:'📍 Site',color:'#8B5CF6'}]},'/listReasons':{reasons:[{id:3,name:'Veículo Vendido'}]}},pedidos);
 assert.equal(c.provedor,'novaleadvox');
 assert.deepEqual(normalizeItems(await c.departments()).map(x=>x.name),['Comercial','Administrativo']);
 assert.deepEqual((await c.usuariosAtivos()).map(u=>u.name),['Amanda']);
 assert.equal((await c.users()).length,2);
 assert.equal(normalizeItems(await c.tags())[0].name,'📍 Site');
 assert.equal(normalizeItems(await c.closingReasons())[0].name,'Veículo Vendido');
 assert.deepEqual(await c.leadOrigins(),[]);assert.deepEqual(await c.templates(),[]);
 assert.ok(pedidos.length>=5);
 for(const p of pedidos){assert.equal(p.auth,'Bearer '+TOKEN);assert.ok(!p.url.includes('token='),'token não vai na URL');}
});

test('cliente: token recusado (inclusive o 404 ERR_API_CONFIG_NOT_FOUND da nova LeadVox) vira credencial inválida', async () => {
 for(const r of [{__status:401,body:{}},{__status:404,body:{error:'ERR_API_CONFIG_NOT_FOUND'}},{__status:403,body:{}}]){
  await assert.rejects(()=>cliente({'/listUsers':r}).users(),e=>e.code==='CHAT_UNAUTHORIZED');
 }
 await assert.rejects(()=>cliente({'/listUsers':{__status:500,body:{}}}).users(),e=>e.code==='CHAT_REQUEST_FAILED');
 await assert.rejects(()=>cliente({'/listUsers':{success:false,error:'x'}}).users(),e=>e.code==='CHAT_REQUEST_FAILED');
 await assert.rejects(()=>cliente({'/listUsers':{ola:'sem lista'}}).users(),e=>e.code==='CHAT_USERS_UNAVAILABLE'&&e.tentativas.length===1);
});

test('funil: pipelines com etapas, oportunidades por etapa com o nome dos campos do CRM antigo', async () => {
 const c=cliente({'/pipeline/list':[{id:4,name:'Negociação Comercial'}],
  '/stage/list':[{id:21,name:'Qualificando pela IA',order:1,pipelineId:4},{id:22,name:'Ganho',order:2,pipelineId:4},{id:99,name:'De outro funil',order:1,pipelineId:7}],
  '/listOpportunities':{data:[{id:1,name:'Kicks 2022',value:90000,status:'open',pipelineId:4,stageId:21,contact:{name:'Leonardo',number:'5521988943529'},closingForecast:'2026-12-01'},
   {id:2,name:'Outra',value:1000,status:'open',pipelineId:4,stageId:22}]}});
 const f=await lerFunil(c,{status:'open'});
 assert.deepEqual(f.funis.map(x=>x.name),['Negociação Comercial']);
 assert.deepEqual(f.etapas.map(e=>e.name),['Qualificando pela IA','Ganho']);
 assert.equal(f.totais['21'].count,1);assert.equal(f.totais['21'].valor,90000);
 const [o]=normalizeOpportunities(f.lista).filter(x=>x.id==='1');
 assert.deepEqual([o.nome,o.etapaId,o.valor,o.numero,o.previsao],['Kicks 2022','21',90000,'5521988943529','2026-12-01']);
 const todas=await c.allPipelineSteps();assert.deepEqual(todas.map(s=>s.name),['Qualificando pela IA','Ganho']);
});

test('mover o cartão no funil chama updateOpportunity com a etapa e o status', async () => {
 const pedidos=[];
 await cliente({'/updateOpportunity':{success:true}},pedidos).moveOpportunity('1','22','won');
 assert.deepEqual(pedidos[0].corpo,{opportunityId:1,stageId:22,status:'won'});assert.equal(pedidos[0].metodo,'POST');
});

test('número da API: acha na lista a sessão desta API (ou a única) e recusa quando não dá para saber', () => {
 assert.deepEqual(canalDaLista([{id:5,tenantId:2,name:'WhatsApp Loja Teste'}],API),{tenantId:2,sessionId:5});
 assert.deepEqual(canalDaLista([{id:9,tenantId:2},{id:5,tenantId:2,apiId:API}],API),{tenantId:2,sessionId:5});
 assert.equal(canalDaLista([{id:9,tenantId:2},{id:5,tenantId:2}],API),null,'duas sessões e nenhuma é desta API');
 assert.equal(canalDaLista([{id:5}],API),null,'sem empresa');
 assert.equal(canalDaLista([],API),null);
});

test('ligação com o motor: nova LeadVox usa o endereço da ponte e números deslocados; CRM antigo segue pelo token', async () => {
 const nova=await ligacaoMotor({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({'/listSessions':{data:[{id:5,tenantId:2}]}})});
 assert.equal(nova.tenant,DESLOCA_NL+2);assert.equal(nova.sessao,DESLOCA_NL+5);
 assert.match(nova.url,/^https:\/\/n8n\.leadvox\.com\.br\/webhook\/[0-9a-f-]{36}\/nl-saida\/v1\/api\/external\/03db0c27-[0-9a-f-]+\/\?token=tokenopaco1234567890$/);
 // segunda rota de sessões quando a primeira não responde
 const alt=await ligacaoMotor({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({'/getAllSessionApis':[{id:5,tenantId:2}]})});
 assert.equal(alt.sessao,DESLOCA_NL+5);
 await assert.rejects(()=>ligacaoMotor({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({})}),e=>e.code==='CHAT_SESSION_UNKNOWN');
 const jwt='x.'+Buffer.from(JSON.stringify({tenantId:7,sessionId:3})).toString('base64url')+'.y';
 const antigo=await ligacaoMotor({root:'https://chatapi.leadvox.com.br/v1',apiId:'12',token:jwt});
 assert.deepEqual([antigo.tenant,antigo.sessao],[7,3]);assert.match(antigo.url,/^https:\/\/chatapi\.leadvox\.com\.br\/v1\/api\/external\/12\/\?token=/);
 assert.equal(await ligacaoMotor({root:'https://chatapi.leadvox.com.br/v1',apiId:'12',token:'sem-jwt-aqui'}),null);
});

test('número da API: acha a sessão pelo registro da API (id = código da API, sessionId = número) e a empresa por outra lista', async () => {
 // a lista de APIs traz o registro desta API (e de outra), sem a empresa; a empresa vem do departamento
 const mapa={'/getAllSessionApis':{data:[{id:'outra-api',sessionId:9},{id:API,sessionId:5,name:'SDR IA API'}]},'/listQueues':[{id:13,queue:'Comercial',tenantId:2}]};
 const c=createChatClient({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa(mapa)});
 assert.deepEqual(await c.canal(),{tenantId:2,sessionId:5});
 // sem registro desta API e várias sessões: não adivinha, e o erro diz o que a API respondeu
 const mal=createChatClient({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({'/getAllSessionApis':[{id:'a',sessionId:1},{id:'b',sessionId:2}],'/listSessions':{ola:'x'}})});
 await assert.rejects(()=>mal.canal(),e=>e.code==='CHAT_SESSION_UNKNOWN'&&e.tentativas.some(t=>/2 itens, nenhum é desta API/.test(t))&&e.tentativas.some(t=>/sem lista/.test(t)));
 // achou o número mas nenhuma lista traz a empresa
 const semEmpresa=createChatClient({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({'/getAllSessionApis':[{id:API,sessionId:5}]})});
 await assert.rejects(()=>semEmpresa.canal(),e=>e.tentativas.some(t=>/achei o número 5/.test(t)));
 // token recusado em qualquer rota para tudo
 await assert.rejects(()=>createChatClient({root:ROOT,apiId:API,token:TOKEN,fetchImpl:falsa({'/getAllSessionApis':{__status:401,body:{}}})}).canal(),e=>e.code==='CHAT_UNAUTHORIZED');
});
