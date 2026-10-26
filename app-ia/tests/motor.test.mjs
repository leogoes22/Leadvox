import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {jwtPayload} from '../account-api.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const jwt=p=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.assinatura';

test('tenant and session are read from the LeadVox token payload',()=>{
 assert.deepEqual(jwtPayload(jwt({tenantId:17,sessionId:64})),{tenantId:17,sessionId:64});
 assert.equal(jwtPayload('nao-e-jwt'),null);
});

async function fixture(t,{chat=null,erroSalvar=null,ativo=null}={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_chat_secret')return ok(chat?[chat]:[]);
  if(fn==='lv_motor_status')return ok({vinculado:true,conta:'loja-teste-ab12',agentes:[],tipos:[{codigo:'sdr',nome:'SDR'}]});
  if(fn==='lv_motor_salvar_agente')return ok(erroSalvar?{ok:false,erro:erroSalvar}:{ok:true,versao:4});
  if(fn==='lv_motor_ativo'&&ativo)return ok(ativo);
  if(fn==='lv_motor_agente')return ok({chave:'loja-teste-ab12-x',tipo:'sdr',versao:3,config:{}});
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,post:b=>fetch(base+'/api/account/motor',{method:'POST',headers:h,body:JSON.stringify({organization:org,...b})}),get:q=>fetch(base+'/api/account/motor?organization='+org+(q||''),{headers:h})};
}

test('linking creates the motor account and connects the saved LeadVox number',async t=>{
 const tok=jwt({tenantId:17,sessionId:64});
 const f=await fixture(t,{chat:{api_root:'https://chat2api.leadvox.com.br/v1',api_id:'5ac8-e8dc',token:tok}});
 const r=await f.post({acao:'vincular'});assert.equal(r.status,200);assert.doesNotMatch(await r.text(),new RegExp(tok.split('.')[1]));
 assert.deepEqual(f.calls.map(c=>c.fn),['lv_motor_vincular','lv_chat_secret','lv_motor_conectar','lv_motor_status']);
 const c=f.calls.find(c=>c.fn==='lv_motor_conectar').body;
 assert.equal(c.tenant,17);assert.equal(c.sessao,64);assert.equal(c.url,'https://chat2api.leadvox.com.br/v1/api/external/5ac8-e8dc/?token='+encodeURIComponent(tok));
});
test('connecting without saved LeadVox credentials explains what to do',async t=>{
 const f=await fixture(t);const r=await f.post({acao:'conectar'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/Credenciais de API/);
});
test('saving validates input, sends the version and maps motor conflicts',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post({acao:'salvar',agente:'../x',config:{}})).status,400);
 assert.equal((await f.post({acao:'salvar',agente:'loja-teste-ab12-x',config:[]})).status,400);
 const r=await f.post({acao:'salvar',agente:'loja-teste-ab12-x',config:{identidade:{nome:'Carol'}},versaoBase:3});
 assert.equal(r.status,200);assert.equal((await r.json()).versao,4);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_motor_salvar_agente').body,{org,agente:'loja-teste-ab12-x',config:{identidade:{nome:'Carol'}},versao_base:3,concluir:false});
 const g=await fixture(t,{erroSalvar:'conflito'});const c=await g.post({acao:'salvar',agente:'loja-teste-ab12-x',config:{},versaoBase:1});
 assert.equal(c.status,400);assert.match((await c.json()).error,/salvou este agente depois/);
 assert.equal((await f.get('&agente=loja-teste-ab12-x')).status,200);assert.equal((await f.get('&agente=../x')).status,400);
});
test('turning on an unfinished agent says what is missing',async t=>{
 const f=await fixture(t,{ativo:{ok:false,erro:'pendencias',pendencias:['nao_configurado','sem_conexao']}});
 const r=await f.post({acao:'ativo',agente:'loja-teste-ab12-x',ativo:true});
 assert.equal(r.status,400);assert.match((await r.json()).error,/Para ligar o agente: preencha nome.*; ligue o WhatsApp/);
 const g=await fixture(t);await g.post({acao:'salvar',agente:'loja-teste-ab12-x',config:{},versaoBase:3,concluir:true});
 assert.equal(g.calls.find(c=>c.fn==='lv_motor_salvar_agente').body.concluir,true);
});
test('dashboard reads the account report for a valid period only',async t=>{
 const f=await fixture(t);
 assert.equal((await f.get('')).status,200);
 const base=(await f.get('')).url.replace(/\/api\/account\/motor.*/,'');
 const get=q=>fetch(base+'/api/account/relatorio?organization='+org+q,{headers:{Cookie:'__Host-lv_session=x'}});
 assert.equal((await get('&ini=2026-10-01')).status,400);
 assert.equal((await get('&ini=2026-10-01&fim=2026-10-26')).status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_motor_relatorio').body,{org,ini:'2026-10-01',fim:'2026-10-26'});
});
