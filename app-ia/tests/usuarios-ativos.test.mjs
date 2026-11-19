import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const J=x=>JSON.parse(JSON.stringify(x));
const mod={exports:{}};vm.runInNewContext(ler('../n8n/usuarios-ativos.js'),{module:mod});
const {fluxoUsuariosAtivos,aplicarMensagemPlugin,TROCA_PLUGIN,LOJAS,PAGINAS,JUNTAR}=mod.exports;
// roda um nó Code do n8n com $() e $input de mentira
const rodar=(code,nos,input)=>J(vm.runInNewContext('(()=>{'+code+'\n})()',{
 $:n=>({all:()=>(nos[n]||[]).map(json=>({json})),first:()=>({json:(nos[n]||[])[0]})}),$input:{first:()=>({json:input[0]}),all:()=>input.map(json=>({json}))}}));

test('banco: a rota entrega a distribuição só com ativos; lista velha ou vazia nunca esvazia o rodízio', () => {
 const sql=ler('../database/usuarios_ativos.sql').replace(/\r/g,'');
 assert.match(sql,/return public\.iag__so_ativos\(p_conta,public\.iag__com_conexao_agente\(v_ag,public\.iag_config_motor\(v_ag\)\)\)/);
 assert.match(sql,/u\.atualizado_em>now\(\)-interval '10 minutes'/);
 assert.match(sql,/where \(v->>'id'\)=any\(u\.ids\)/);
 assert.match(sql,/if p_ids is null or cardinality\(p_ids\)=0/,'lista vazia (login falhou) não grava');
 assert.match(sql,/grant execute on function public\.iag_leadvox_usuarios_todos\(\) to service_role;/);
 assert.match(sql,/revoke all on function public\.iag_leadvox_usuarios_todos\(\) from public,anon,authenticated;/);
 assert.match(sql,/^begin;/m);assert.match(sql,/^commit;/m);
});

test('n8n: o fluxo lê as lojas, entra, lê as páginas e grava só quem está ativo; não salva execução', () => {
 const w=J(fluxoUsuariosAtivos({id:'s1',name:'Supabase'}));
 assert.deepEqual(w.settings,{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,saveExecutionProgress:false});
 assert.equal(w.nodes.find(n=>n.name==='A cada minuto').parameters.rule.interval[0].minutesInterval,1);
 const lojas=rodar(LOJAS,{},[{body:[{conta:'kidas-car-4babc06c',api_root:'https://chat2api.leadvox.com.br/v1',email:'ia@k.com',senha:'x'},{conta:'z',api_root:'https://evil.com/v1',email:'a',senha:'b'},{conta:'sem'}]}]);
 assert.deepEqual(lojas.map(i=>i.json.host),['https://chat2api.leadvox.com.br'],'só host da LeadVox');
 const lojasJ=lojas.map(i=>i.json);
 const pags=rodar(PAGINAS,{Lojas:lojasJ},[{statusCode:200,body:{token:'jwt1'}}]);
 assert.equal(pags.length,3);assert.equal(pags[0].json.url,'https://chat2api.leadvox.com.br/users/?pageNumber=1');assert.equal(pags[0].json.jwt,'jwt1');
 assert.equal(rodar(PAGINAS,{Lojas:lojasJ},[{statusCode:401,body:{error:'x'}}]).length,0,'login recusado não segue');
 const ped=pags.map(i=>i.json);
 let g=rodar(JUNTAR,{'Páginas':ped},[{statusCode:200,body:{users:[{id:1,isActive:true},{id:2,isActive:false},{id:3}],hasMore:true}},{statusCode:200,body:{users:[{id:4,isActive:true}]}},{statusCode:200,body:{users:[]}}]);
 assert.deepEqual(JSON.parse(g[0].json.corpo),{p_conta:'kidas-car-4babc06c',p_ids:['1','3','4']});
 g=rodar(JUNTAR,{'Páginas':ped},[{statusCode:200,body:{users:[{id:1}]}},{statusCode:500,body:{}},{statusCode:200,body:{users:[]}}]);
 assert.equal(g.length,0,'uma página falhou: não grava lista pela metade');
});

test('plugin: transferir para quem saiu é recusado com mensagem clara', () => {
 const f={nodes:[{name:'Rodízio · Plugin',parameters:{}},{name:'Rodízio · Escolher',parameters:{jsCode:"if (x) return sai(400, { ok: false, erro: 'Essa pessoa não está marcada neste departamento.' });"}}]};
 const w=J(aplicarMensagemPlugin(f));
 assert.match(w.nodes[1].parameters.jsCode,/Essa pessoa não está mais disponível\. Atualize a lista\./);
 assert.throws(()=>aplicarMensagemPlugin(w),/já aplicado/);
 assert.equal(TROCA_PLUGIN.length,2);
});

test('plugin (front): trocar de atendimento zera o "Próximo da fila"', () => {
 const js=ler('../public/vendedor.js');
 assert.match(js,/ticket = t; trProx = \{\};/);
});

test('painel: quem está inativo na LeadVox sai do rodízio ao abrir os departamentos (só com a lista da tela)', async t => {
 const js=ler('../public/painel.js');
 assert.match(js,/function tirarInativosDoRodizio\(\)/);assert.match(js,/if \(!listas\.usuariosSoAtivos \|\| !Array\.isArray\(listas\.usuarios\)\) return \[\];/);
 assert.match(js,/const tirados = tirarInativosDoRodizio\(\);/);
 // o servidor diz se a lista de usuários é a dos ativos (veio da tela da LeadVox)
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_chat_secret'))return ok([{api_root:'https://chat2api.leadvox.com.br/v1',api_id:'5ac8',token:'eyJ.x.y-token-api'}]);
  if(u.includes('/rpc/lv_integration_secret'))return ok([]);
  if(u.includes('/api/external/users/'))return ok({users:[{id:1,name:'Ana'}],count:1});
  return ok({},404);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/account/chat?organization=22222222-2222-4222-8222-222222222222&kind=usuarios',{headers:{Cookie:'__Host-lv_session=x'}});
 const d=await r.json();assert.equal(d.soAtivos,false,'sem usuário da LeadVox: a lista não diz quem está ativo, o painel não tira ninguém');assert.equal(d.items.length,1);
});
