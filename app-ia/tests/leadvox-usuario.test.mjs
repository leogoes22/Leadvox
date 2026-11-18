import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {createChatClient,entrarUsuarioChat} from '../integrations/chat-leadvox.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const TOKEN='eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6MTd9.api',ROOT='https://chat2api.leadvox.com.br/v1';

test('login do usuário: POST /auth/login na raiz da LeadVox; recusado vira CHAT_LOGIN_RECUSADO', async () => {
 const pedidos=[];
 const r=await entrarUsuarioChat({root:ROOT,email:' IA@Loja.com ',senha:'s3nha',fetchImpl:async(u,init)=>{pedidos.push({u,body:JSON.parse(init.body)});return ok({token:'jwt-tela',profile:'admin',username:'IA'});}});
 assert.deepEqual(r,{jwt:'jwt-tela',perfil:'admin',usuario:'IA'});
 assert.deepEqual(pedidos,[{u:'https://chat2api.leadvox.com.br/auth/login',body:{email:'IA@Loja.com',password:'s3nha'}}]);
 await assert.rejects(entrarUsuarioChat({root:ROOT,email:'a@b.com',senha:'x',fetchImpl:async()=>ok({error:'ERR_INVALID_CREDENTIALS'},401)}),e=>e.code==='CHAT_LOGIN_RECUSADO');
});

test('rotas da tela usam o login do usuário (sem o token da API); sessão vencida entra de novo uma vez', async () => {
 const pedidos=[],sessoes=[];let n=0;
 const c=createChatClient({root:ROOT,apiId:'5ac8',token:TOKEN,sessao:async renovar=>{sessoes.push(renovar);return renovar?'jwt-novo':'jwt-velho';},
  fetchImpl:async(u,init)=>{pedidos.push({u,auth:init.headers.Authorization,method:init.method});n++;
   if(init.headers.Authorization==='Bearer jwt-velho')return ok({error:'Invalid token.'},403);return ok([{id:33,name:'Comercial'}]);}});
 assert.equal(c.temSessao,true);
 assert.deepEqual(await c.pipelines(),[{id:33,name:'Comercial'}]);
 assert.deepEqual(sessoes,[false,true]);
 assert.deepEqual(pedidos.map(p=>p.u),['https://chat2api.leadvox.com.br/pipelines?includeSteps=true','https://chat2api.leadvox.com.br/pipelines?includeSteps=true']);
 assert.ok(pedidos.every(p=>!p.u.includes('token=')),'o token da API não vai nas rotas da tela');
 assert.equal(pedidos[1].auth,'Bearer jwt-novo');
 // a API externa (/v1) continua com o token da API
 pedidos.length=0;await c.tags();assert.match(pedidos[0].u,/^https:\/\/chat2api\.leadvox\.com\.br\/v1\/api\/external\/5ac8\/tags\?token=/);assert.equal(pedidos[0].auth,'Bearer '+TOKEN);
 // mover o card também vai com o login do usuário
 pedidos.length=0;sessoes.length=0;await c.moveOpportunity(7,144,'won');
 assert.equal(pedidos[0].u,'https://chat2api.leadvox.com.br/opportunity/7/status');assert.equal(pedidos[0].method,'PUT');
});

// servidor do painel com o usuário da LeadVox salvo (ou não)
async function painel(t,{usuario=true,login=ok({token:'jwt-tela'}),rotas}){
 const chamadas=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_chat_secret'))return ok([{api_root:ROOT,api_id:'5ac8',token:TOKEN}]);
  if(u.includes('/rpc/lv_integration_secret'))return ok(usuario?[{settings:{email:'ia@loja.com'},secret:'s3nha'}]:[]);
  if(u.includes('/rpc/lv_set_integration')){chamadas.push({salvar:JSON.parse(init.body)});return ok(null,204);}
  if(u.endsWith('/auth/login')){chamadas.push({login:JSON.parse(init.body)});return login;}
  const url=new URL(u);chamadas.push({rota:url.pathname,auth:init?.headers?.Authorization});return rotas(url,init);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 return {chamadas,
  get:q=>fetch(base+'/api/account/'+q,{headers:{Cookie:'__Host-lv_session=x'}}),
  post:(a,b)=>fetch(base+'/api/account/'+a,{method:'POST',headers:{Origin:base,Cookie:'__Host-lv_session=x'},body:JSON.stringify(b)})};
}
const rotasFunil=u=>{
 if(u.pathname==='/pipelines')return ok([{id:33,name:'Comercial',isDefault:true,steps:[{id:143,name:'Novo',order:1}]}]);
 if(u.pathname==='/opportunity/pipeline-startup')return ok({columns:{143:{opportunities:[],hasMore:false,count:0}},totals:{}});
 return ok({},404);
};

test('Oportunidades: com o usuário salvo, entra e lê o funil pelas rotas da tela', async t => {
 const p=await painel(t,{rotas:rotasFunil});
 const r=await p.get('oportunidades?organization='+org);
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.funil,'33');
 assert.deepEqual(p.chamadas.find(c=>c.login).login,{email:'ia@loja.com',password:'s3nha'});
 assert.equal(p.chamadas.find(c=>c.rota==='/pipelines').auth,'Bearer jwt-tela');
});

test('Oportunidades: sem o usuário, a LeadVox recusa a tela e o painel pede para conectar o usuário', async t => {
 const p=await painel(t,{usuario:false,rotas:u=>u.pathname==='/pipelines'?ok({error:'Invalid token.'},403):ok({error:'ERR_CONTACT_PIPELINE_NOT_FOUND'},404)});
 const r=await p.get('oportunidades?organization='+org);
 assert.equal(r.status,409);assert.match((await r.json()).error,/Conecte um usuário da LeadVox em Credenciais de API/);
 assert.equal(p.chamadas.some(c=>c.login),false);
});

test('Oportunidades: login recusado vira mensagem clara', async t => {
 const p=await painel(t,{login:ok({error:'ERR_INVALID_CREDENTIALS'},401),rotas:rotasFunil});
 const r=await p.get('oportunidades?organization='+'33333333-3333-4333-8333-333333333333');
 assert.equal(r.status,400);assert.match((await r.json()).error,/não aceitou o usuário salvo/);
});

test('Credenciais: salvar o usuário testa o login e o funil antes; a senha vai só para o Vault', async t => {
 let p=await painel(t,{usuario:false,rotas:rotasFunil});
 let r=await p.post('integrations',{organization:org,provider:'leadvox_usuario',email:' IA@Loja.com ',senha:'s3nha'});
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.email,'ia@loja.com');assert.equal('senha' in d,false);
 const salvo=p.chamadas.find(c=>c.salvar).salvar;assert.equal(salvo.prov,'leadvox_usuario');assert.equal(salvo.sec,'s3nha');assert.equal(salvo.conf.email,'ia@loja.com');assert.equal('senha' in salvo.conf,false);
 assert.equal(p.chamadas.find(c=>c.rota==='/pipelines').auth,'Bearer jwt-tela');
 p=await painel(t,{usuario:false,login:ok({error:'x'},401),rotas:rotasFunil});
 r=await p.post('integrations',{organization:org,provider:'leadvox_usuario',email:'ia@loja.com',senha:'errada'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/não aceitou esse e-mail e senha/);assert.equal(p.chamadas.some(c=>c.salvar),false);
 p=await painel(t,{usuario:false,rotas:u=>ok({error:'Invalid token.'},403)});
 r=await p.post('integrations',{organization:org,provider:'leadvox_usuario',email:'ia@loja.com',senha:'s3nha'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/não abre o funil/);assert.equal(p.chamadas.some(c=>c.salvar),false);
});

test('banco e painel: conexão leadvox_usuario liberada e campo em Credenciais de API', () => {
 const sql=ler('../database/leadvox_usuario.sql');
 assert.match(sql,/check\(provider in\('estoque','asaas','elevenlabs','meta','meta_ads','leadvox_usuario'\)\)/);
 assert.match(sql,/prov not in\('estoque','asaas','elevenlabs','meta','meta_ads','leadvox_usuario'\)/);
 assert.match(sql,/grant execute on function public\.iag_leadvox_usuario\(text\) to service_role;/);
 assert.match(sql,/revoke all on function public\.iag_leadvox_usuario\(text\) from public,anon,authenticated;/);
 const html=ler('../public/index.html'),js=ler('../public/painel.js');
 assert.match(html,/id="luForm"/);assert.match(html,/id="luSenha" type="password"/);
 assert.match(js,/provider: 'leadvox_usuario', email: \$\('luEmail'\)\.value, senha: \$\('luSenha'\)\.value/);
});
