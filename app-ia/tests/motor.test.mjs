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
test('agent department and entry point are validated and sent to the motor',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post({acao:'lugar',agente:'loja-teste-ab12-x',departamento:'abc',entrada:true})).status,400);
 assert.equal((await f.post({acao:'lugar',agente:'loja-teste-ab12-x',departamento:66,entrada:true})).status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_motor_lugar').body,{org,agente:'loja-teste-ab12-x',departamento:66,entrada:true});
});
test('group test message goes to the group id with @g.us and explains a wrong group',async t=>{
 const tok=jwt({tenantId:17,sessionId:64});const envios=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_chat_secret'))return ok([{api_root:'https://chat2api.leadvox.com.br/v1',api_id:'5ac8-e8dc',token:tok}]);
  if(u.startsWith('https://chat2api.leadvox.com.br/')){const b=JSON.parse(init.body);envios.push(b);return ok({},b.number.startsWith('999')?404:200);}
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const post=b=>fetch(base+'/api/account/grupo-teste',{method:'POST',headers:h,body:JSON.stringify({organization:org,ia:'Lilian',...b})});
 assert.equal((await post({grupo:'123'})).status,400);
 const r=await post({grupo:'120363000000000001@g.us'});assert.equal(r.status,200);
 assert.equal(envios[0].number,'120363000000000001@g.us');assert.match(envios[0].body,/Lilian/);
 assert.equal((await post({grupo:'120363000000000001'})).status,429);
});
test('events webhook address is built from the account token, or asks n8n to create it',async t=>{
 const chamadas=[];let token='0123456789abcdef01234567';
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_motor_eventos'))return ok({vinculado:true,conta:'loja-teste-ab12',token,ultimoEvento:null,
   ultimoEnvio:{ok:false,ts:1793142318345,status:404,erro:'{"error":"ERR_SESSION_NOT_FOUND"}',extra:'nao-vai'}});
  chamadas.push(u);return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,get=()=>fetch(base+'/api/account/eventos?organization='+org,{headers:{Cookie:'__Host-lv_session=x'}}).then(r=>r.json());
 const r0=await get();
 assert.equal(r0.url,'https://webhook.lv-mktdeconversa.com/webhook/iag-sentinela-v3?k=loja-teste-ab12&t=0123456789abcdef01234567');
 // último envio recusado pela LeadVox chega ao painel só com os campos do aviso
 assert.deepEqual(r0.ultimoEnvio,{ok:false,ts:1793142318345,status:404,erro:'{"error":"ERR_SESSION_NOT_FOUND"}'});
 token=null;const r=await get();assert.equal(r.pendente,true);assert.equal(r.url,undefined);
 assert.ok(chamadas.some(u=>u.endsWith('/webhook/iag-painel-endereco')));
});
test('test chat sends the message to the simulator with a fake phone and the agent department',async t=>{
 const envios=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_motor_eventos'))return ok({vinculado:true,conta:'loja-teste-ab12',token:'0123456789abcdef01234567'});
  if(u.includes('/rpc/lv_motor_status'))return ok({vinculado:true,agentes:[{chave:'loja-teste-ab12-x',departamentoId:66}]});
  if(u.includes('/webhook/iag-simulador')){envios.push({u,b:JSON.parse(init.body)});return ok({ok:true,agente:'Lilian',envios:[{texto:'Oi!',midia:'javascript:alert(1)'}],etiquetas:['Quente']});}
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const post=b=>fetch(base+'/api/account/simular',{method:'POST',headers:h,body:JSON.stringify({organization:org,agente:'loja-teste-ab12-x',sessao:'abc12345',...b})});
 assert.equal((await post({mensagem:''})).status,400);
 const r=await post({mensagem:'Tem Corolla?'});assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.envios[0].texto,'Oi!');assert.equal(d.envios[0].midia,'');assert.deepEqual(d.etiquetas,['Quente']);
 assert.match(envios[0].u,/iag-simulador\?k=loja-teste-ab12&t=0123456789abcdef01234567$/);
 assert.equal(envios[0].b.Departamento,66);assert.equal(envios[0].b.simulacao,true);assert.match(envios[0].b.sessionId,/^55000\d{8}$/);
});
const opp=(id,status,etapa=53)=>({id,name:'Opp '+id,status,value:'1500.00',pipelineStepId:etapa,expectedCloseDate:'2026-11-02',updatedAt:'2026-10-26T02:38:55.625Z',
 contact:{id:9,name:'Leonardo',number:'5521988943529',email:'x@y.com',profilePicUrl:'javascript:alert(1)'},responsible:{name:'Leonardo',email:'admin@x.com'}});
async function funilApp(t,rotas){
 const tok=jwt({tenantId:17,sessionId:64});
 const s=createApp({allowLocal:true,fetchImpl:async(u)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_chat_secret'))return ok([{api_root:'https://chat2api.leadvox.com.br/v1',api_id:'5ac8-e8dc',token:tok}]);
  return rotas(new URL(u));
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 return q=>fetch(base+'/api/account/oportunidades?organization='+org+q,{headers:{Cookie:'__Host-lv_session=x'}});
}
test('pipeline page follows the LeadVox pipeline screen: picks the funnel, keeps step order and loads more pages per step',async t=>{
 const pedidos=[];
 const get=await funilApp(t,u=>{pedidos.push(u.pathname+u.search.replace(/token=[^&]+/,''));
  if(u.pathname==='/pipelines')return ok([{id:33,name:'Comercial',isDefault:true,steps:[{id:144,name:'Negociando',order:2},{id:143,name:'Novo Lead',color:'#6deef7',order:1}]},
   {id:40,name:'Pós-venda',steps:[{id:150,name:'Entregue',order:1}]}]);
  if(u.pathname==='/opportunity/pipeline-startup')return ok({columns:{143:{opportunities:[opp(1,'open',143)],hasMore:false,count:1},144:{opportunities:[opp(2,'open',144)],hasMore:true,count:2}},
   totals:{143:{count:1,totalValue:1500},144:{count:2,totalValue:3000}}});
  if(u.pathname==='/opportunity')return ok(u.searchParams.get('pipelineId')==='40'?{opportunities:[opp(9,'open',150)],hasMore:false}:{opportunities:[opp(3,'open',144)],hasMore:false,count:2});
  return ok({},404);
 });
 const d=await (await get('')).json();
 assert.equal(d.funil,'33');assert.deepEqual(d.funis.map(f=>f.name),['Comercial','Pós-venda']);
 assert.deepEqual(d.etapas.map(e=>e.name),['Novo Lead','Negociando']);assert.deepEqual(d.totais['144'],{count:2,valor:3000});
 assert.deepEqual(d.oportunidades.map(o=>o.id).sort(),['1','2','3']);
 assert.ok(pedidos.some(p=>p.startsWith('/opportunity/pipeline-startup?pipelineId=33&pipelineStepIds%5B%5D=143&pipelineStepIds%5B%5D=144&status%5B%5D=open')));
 assert.ok(pedidos.some(p=>p.startsWith('/opportunity?pipelineId=33&pipelineStepId=144&pageNumber=2')));
 const g=await (await get('&funil=40&status=all')).json();
 assert.equal(g.funil,'40');assert.deepEqual(g.oportunidades.map(o=>o.id),['9']);
 assert.equal((await get('&funil=abc')).status,400);
 assert.ok(pedidos.some(p=>p.startsWith('/pipelines?includeSteps=true')));
});
test('pipeline page fetches the steps apart when the funnels come without them, and the error tells what each route answered',async t=>{
 const get=await funilApp(t,u=>{
  if(u.pathname==='/pipelines')return ok([{id:33,name:'Comercial',isDefault:true}]);
  if(u.pathname==='/pipeline-step/')return ok([{id:143,name:'Novo Lead',order:1,pipelineId:33},{id:150,name:'Outro funil',order:1,pipelineId:40}]);
  if(u.pathname==='/opportunity/pipeline-startup')return ok({columns:{143:{opportunities:[opp(1,'open',143)],hasMore:false}},totals:{}});
  return ok({},404);
 });
 const d=await (await get('')).json();
 assert.deepEqual(d.etapas.map(e=>e.name),['Novo Lead']);assert.deepEqual(d.oportunidades.map(o=>o.id),['1']);
});
test('when both the pipeline screen and the external list fail, the message says what each answered',async t=>{
 const get=await funilApp(t,u=>u.pathname.endsWith('/pipeline-steps')?ok({data:[]}):ok({},404));
 const r=await get('');assert.equal(r.status,502);assert.match((await r.json()).error,/funis 404, lista 404/);
});
test('pipeline page falls back to the external API, page by page, showing only what the card needs',async t=>{
 const pedidos=[];
 const get=await funilApp(t,u=>{
  if(u.pathname.endsWith('/pipeline-steps'))return ok({data:[{id:53,name:'Negociando',color:'#2196F3'}]});
  if(u.pathname.endsWith('/opportunities')){pedidos.push(u.search);const p=Number(u.searchParams.get('pageNumber'))||1;
   return ok(p===1?{data:[opp(1,'open'),opp(2,'won')],count:3,hasMore:true}:{data:[opp(3,'open')],count:3,hasMore:false});}
  return ok({},404);
 });
 assert.equal((await get('&status=xx')).status,400);
 const d=await (await get('')).json();
 assert.equal(pedidos.length,2);assert.match(pedidos[0],/^\?status=open&token=/);assert.match(pedidos[1],/^\?status=open&pageNumber=2&token=/);
 assert.deepEqual(d.funis,[]);assert.deepEqual(d.etapas,[{id:'53',name:'Negociando',color:'#2196F3'}]);
 assert.deepEqual(d.oportunidades.map(o=>o.id),['1','3']);
 const o=d.oportunidades[0];assert.equal(o.valor,1500);assert.equal(o.foto,'');assert.equal(o.etapaId,'53');assert.equal(o.previsao,'2026-11-02');
 assert.doesNotMatch(JSON.stringify(d),/x@y\.com|admin@x\.com/);
 assert.deepEqual((await (await get('&status=all')).json()).oportunidades.map(o=>o.id),['1','2','3']);
});
test('moving a card sends the new step and status to the LeadVox pipeline route and shows its refusal',async t=>{
 const tok=jwt({tenantId:17,sessionId:64});const envios=[];let recusa=false;
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_chat_secret'))return ok([{api_root:'https://chat2api.leadvox.com.br/v1',api_id:'5ac8-e8dc',token:tok}]);
  if(u.startsWith('https://chat2api.leadvox.com.br/opportunity/')){envios.push({u:u.replace(/token=.*/,''),m:init.method,b:JSON.parse(init.body)});
   return recusa?ok({message:'Há 1 task(s) obrigatória(s) pendente(s).'},400):ok({id:893});}
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const post=b=>fetch(base+'/api/account/oportunidade-mover',{method:'POST',headers:h,body:JSON.stringify({organization:org,...b})});
 assert.equal((await post({id:'893',etapa:'x'})).status,400);
 assert.equal((await post({id:'893',etapa:'54',status:'apagar'})).status,400);
 assert.equal((await post({id:'893',etapa:'54'})).status,200);
 assert.deepEqual(envios[0],{u:'https://chat2api.leadvox.com.br/opportunity/893/status?',m:'PUT',b:{id:893,pipelineStepId:54,status:'open'}});
 await post({id:'893',etapa:'54',status:'won'});assert.equal(envios[1].b.status,'won');
 recusa=true;const r=await post({id:'893',etapa:'55'});assert.equal(r.status,502);assert.match((await r.json()).error,/task\(s\) obrigatória/);
});
test('the @ menu lists the steps of every funnel, with the funnel name when there is more than one',async t=>{
 const get=await funilApp(t,u=>u.pathname==='/pipelines'?ok([{id:33,name:'Comercial',steps:[{id:144,name:'Negociando',order:2},{id:143,name:'Novo Lead',order:1}]},{id:40,name:'Pós-venda',steps:[{id:150,name:'Entregue',order:1}]}]):ok({},404));
 const base=(await get('')).url.replace(/\/api\/account\/.*/,'');
 const r=await fetch(base+'/api/account/chat?organization='+org+'&kind=status',{headers:{Cookie:'__Host-lv_session=x'}});
 assert.deepEqual((await r.json()).items.map(i=>i.id+' '+i.name+' (funil '+i.funil+')'),['143 Comercial › Novo Lead (funil 33)','144 Comercial › Negociando (funil 33)','150 Pós-venda › Entregue (funil 40)']);
});
test('ElevenLabs key is tested by listing voices, saved to the vault and never sent back; voices come without the key',async t=>{
 const chamadas=[];let chaveCerta='sk_abcdefghijklmnopqrstuvwxyz123456';
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_set_integration')){chamadas.push(JSON.parse(init.body));return ok(null,204);}
  if(u.includes('/rpc/lv_integration_secret'))return ok([{settings:{vozes:2},secret:chaveCerta}]);
  if(u==='https://api.elevenlabs.io/v1/voices')return init.headers['xi-api-key']===chaveCerta
   ?ok({voices:[{voice_id:'21m00Tcm4TlvDq8ikWAM',name:'Rachel',labels:{gender:'female',accent:'american'}},{voice_id:'x',name:'inválida'}]}):ok({},401);
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const salvar=k=>fetch(base+'/api/account/integrations',{method:'POST',headers:h,body:JSON.stringify({organization:org,provider:'elevenlabs',apiKey:k})});
 const errada=await salvar('sk_chaveerradaerradaerradaerrada');assert.equal(errada.status,400);assert.match((await errada.json()).error,/Text to Speech/);
 const r=await salvar(chaveCerta);assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.vozes,1);assert.doesNotMatch(JSON.stringify(d),/sk_/);
 assert.equal(chamadas[0].prov,'elevenlabs');assert.equal(chamadas[0].sec,chaveCerta);
 const v=await (await fetch(base+'/api/account/elevenlabs-vozes?organization='+org,{headers:{Cookie:'__Host-lv_session=x'}})).json();
 assert.deepEqual(v.vozes,[{id:'21m00Tcm4TlvDq8ikWAM',nome:'Rachel',detalhe:'female · american'}]);assert.doesNotMatch(JSON.stringify(v),/sk_/);
});
test('seller plugin opens only inside LeadVox and its API forwards only known fields to the motor',async t=>{
 const envios=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/webhook/iag-plugin-vendedor')){envios.push(JSON.parse(init.body));return ok({ok:true,ia:{estado:'atendendo'}});}
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 const pag=await fetch(base+'/vendedor');assert.equal(pag.status,200);assert.match(pag.headers.get('content-security-policy'),/frame-ancestors https:\/\/\*\.leadvox\.com\.br/);
 const painel=await fetch(base+'/');assert.match(painel.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const post=b=>fetch(base+'/api/plugin',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(b)});
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'x',acao:'contexto'})).status,400);
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'apagar'})).status,400);
 const r=await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'contexto',tel:'5521988943529',ticketId:'108600',vendedor:'Leonardo',senha:'nao-vai'});
 assert.equal(r.status,200);assert.equal((await r.json()).ia.estado,'atendendo');
 assert.deepEqual(Object.keys(envios[0]).sort(),['acao','cliente','contactId','k','t','tel','ticketId','vendedor']);
 // a orientação saiu do plugin (vai virar extra pago): o servidor nem repassa mais
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'orientar'})).status,400);
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'agendar',quando:'amanhã'})).status,400);
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'agendar',quando:'2026-11-03T10:30',assunto:'Retomar o financiamento',tel:'5521988943529'})).status,200);
 assert.deepEqual({q:envios[1].quando,a:envios[1].assunto},{q:'2026-11-03T10:30',a:'Retomar o financiamento'});
 assert.equal(envios.length,2);
 // estoque: a busca vai cortada; enviar_carro só com veículo da lista e no máximo 10 fotos
 await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'estoque',busca:'corolla'.repeat(20)});
 assert.equal(envios[2].busca.length,60);
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'enviar_carro',itemId:'x'})).status,400);
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'enviar_carro',itemId:'38',itens:[{body:'  '}]})).status,400);
 // só texto e mídia https, no máximo 11 mensagens; o resto do pedido não passa
 const fotos=Array.from({length:15},(_,i)=>({body:i?'':'🚗 *Corolla*',mediaUrl:'https://autocerto.com/fotos/'+i+'.jpg',extra:'x'}));
 await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'enviar_carro',itemId:'38',modo:'fotos',itens:[{body:'oi',mediaUrl:'javascript:alert(1)'},...fotos]});
 assert.equal(envios[3].modo,'fotos');assert.equal(envios[3].itens.length,11);
 // convite para test drive: números em formato brasileiro, listas e textos cortados, nada além do formulário
 assert.equal((await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'proposta'})).status,400);
 await post({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',acao:'proposta',itemId:'38',forma:'financiado',entrada:'30.000,00',parcelas:'48',valorParcela:'1.890,50',
  troca:{modelo:'Onix',ano:'2019',km:'60.000',valor:'45000',x:1},extras:['Tanque cheio','',...Array(20).fill('Brinde')],validadeDias:99,obs:'x'.repeat(900),pdfUrl:'https://outro.site/x.pdf'});
 const pr=envios[4];
 assert.deepEqual({e:pr.entrada,p:pr.parcelas,v:pr.valorParcela,t:pr.troca,x:pr.extras.length,d:pr.validadeDias,o:pr.obs.length,u:pr.pdfUrl,m:pr.modo},
  {e:30000,p:48,v:1890.5,t:{modelo:'Onix',ano:'2019',km:60000,valor:45000},x:11,d:7,o:500,u:undefined,m:'enviar'});
 assert.deepEqual(envios[3].itens[0],{body:'oi',mediaUrl:''});assert.deepEqual(Object.keys(envios[3].itens[1]).sort(),['body','mediaUrl']);
 assert.equal((await fetch(base+'/api/plugin',{method:'POST',headers:{Origin:'https://outro.site','Content-Type':'application/json'},body:'{}'})).status,403);
});
