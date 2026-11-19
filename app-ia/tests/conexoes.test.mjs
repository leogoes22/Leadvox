import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222',CX='33333333-3333-4333-8333-333333333333';
const jwt=p=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.assinatura';
const J=x=>JSON.parse(JSON.stringify(x));

// ── banco ──
test('banco: rota com o número, porta de entrada por número e compatível com quem tem um número só', () => {
 const sql=ler('../database/conexoes.sql');
 assert.match(sql,/^begin;/m);assert.match(sql,/^commit;/m);assert.match(sql,/notify pgrst,'reload schema';/);
 assert.match(sql,/drop function if exists public\.iag_motor_rota\(text,integer\);/);
 assert.match(sql,/function public\.iag_motor_rota\(p_conta text,p_departamento integer default null,p_sessao integer default null\)/);
 assert.match(sql,/or \(x\.agente is null and \(p_sessao is null or c\.session_id is null or c\.session_id=p_sessao\)\)/,'sem número extra: a entrada da conta, como antes');
 assert.match(sql,/return public\.iag__com_conexao_agente\(v_ag,public\.iag_config_motor\(v_ag\)\)/,'a IA responde pelo número dela');
 assert.match(sql,/'tenantId',x\.tenant_id,'sessionId',x\.session_id,'urlEnvio',x\.leadvox_url_envio/);
 assert.match(sql,/coalesce\(\(select x\.session_id from public\.iag_agente_conexao x where x\.agente=o\.chave\),-1\)=coalesce\(v_sessao,-1\)/,'entrada: uma por número');
 assert.match(sql,/n\+1>leadvox_private\.limite_ias\(org\)/,'número extra só até as IAs liberadas');
 assert.match(sql,/if not public\.lv_is_platform_admin\(\) then raise exception 'forbidden'; end if;\n if limite is null or limite<1 or limite>20/);
 assert.match(sql,/revoke all on public\.iag_agente_conexao from public,anon,authenticated;/);
 assert.match(sql,/revoke all on leadvox_private\.chat_conexoes from public,anon,authenticated;/);
 assert.match(sql,/sql_aplicado\(arquivo\) values\('conexoes\.sql'\)/);
});

// ── motor (n8n) ──
const mod={exports:{}};vm.runInNewContext(ler('../n8n/conexoes-motor.js'),{module:mod});
const {aplicarConexoesMotor,TROCAS_CONEXOES}=mod.exports;
const fluxo=sim=>({nodes:[
 {name:'Departamento',parameters:{jsCode:"const e = $('Entrada').first().json;\nreturn [{ json: { ...e, departamento, fonteDepartamento: fonte, rotaKey: 'iag_rota_' + e.conta + '_' + (departamento || 0) } }];"}},
 {name:'Supabase Rota',parameters:{jsonBody:"={{ JSON.stringify({ p_conta: $('Departamento').first().json.conta, p_departamento: $('Departamento').first().json.departamento || null }) }}"}}]});
test('motor: a rota leva o número e o cache separa por número; simulador usa o sessaoIA do painel', () => {
 let w=J(aplicarConexoesMotor(fluxo()));
 assert.match(w.nodes[1].parameters.jsonBody,/p_sessao: \$\('Departamento'\)\.first\(\)\.json\.sessao \|\| null/);
 assert.match(w.nodes[0].parameters.jsCode,/\(e\.sessao \? '_s' \+ e\.sessao : ''\)/);
 assert.throws(()=>aplicarConexoesMotor(w),/já aplicado/);
 w=J(aplicarConexoesMotor(fluxo(),{simulador:true}));
 assert.match(w.nodes[1].parameters.jsonBody,/body \|\| \{\}\)\.sessaoIA\)/);
 // a chave do cache roda e muda com o número
 const rodar=(code,ent,corpo)=>vm.runInNewContext('(()=>{'+code+'\n})()',{$:n=>({first:()=>({json:n==='Entrada'?ent:{body:corpo}})}),departamento:5,fonte:'aviso'})[0].json.rotaKey;
 const at=J(aplicarConexoesMotor(fluxo())).nodes[0].parameters.jsCode;
 assert.equal(rodar(at,{conta:'c1',sessao:310}),'iag_rota_c1_5_s310');assert.equal(rodar(at,{conta:'c1'}),'iag_rota_c1_5','sem número: a mesma chave de antes');
 const si=w.nodes[0].parameters.jsCode;
 assert.equal(rodar(si,{conta:'c1'},{sessaoIA:77}),'iag_rota_c1_5_s77');assert.equal(rodar(si,{conta:'c1'},{}),'iag_rota_c1_5');
 const mudou=fluxo();mudou.nodes[0].parameters.jsCode='x';assert.throws(()=>aplicarConexoesMotor(mudou),/trecho mudou/);
 assert.ok(TROCAS_CONEXOES.atendimento&&TROCAS_CONEXOES.simulador);
});

// ── servidor do painel ──
async function painel(t,{rpcs={},admin=true,chat=ok({users:[]})}={}){
 const chamadas=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];
  if(fn){const body=init?.body?JSON.parse(init.body):null;chamadas.push({fn,body});if(fn==='lv_is_platform_admin')return ok(admin);const r=rpcs[fn];return typeof r==='function'?r(body):ok(r??{ok:true});}
  if(u.includes('leadvox.com.br'))return chat;
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {chamadas,get:q=>fetch(base+'/api/account/'+q,{headers:h}),post:(a,b)=>fetch(base+'/api/account/'+a,{method:'POST',headers:h,body:JSON.stringify(b)})};
}
const URL_API='https://chatapi.leadvox.com.br/v1/api/external/5ac8-e8dc/?token='+jwt({tenantId:11,sessionId:310});
const lista={limite:2,principal:true,conexoes:[{id:CX,nome:'Investidor',apiId:'5ac8-e8dc',sessao:310,agentes:[]}],agentes:[]};

test('Outros números: testa o token, tira número e sessão do token e salva; recusas viram mensagens claras', async t => {
 let p=await painel(t,{rpcs:{lv_chat_conexoes:lista}});
 let r=await p.post('chat-conexoes',{organization:org,acao:'salvar',nome:'Investidor',url:URL_API});
 assert.equal(r.status,200);assert.deepEqual((await r.json()).conexoes.map(c=>c.nome),['Investidor']);
 const s=p.chamadas.find(c=>c.fn==='lv_chat_conexao_salvar').body;
 assert.deepEqual({...s,tok:undefined},{org,p_nome:'Investidor',root:'https://chatapi.leadvox.com.br/v1',api:'5ac8-e8dc',tok:undefined,tenant:11,sessao:310});
 assert.ok(s.tok.length>20,'o token vai só para o banco (Vault)');
 for(const [erro,re] of [['limite',/até 2 número/],['repetida',/já está cadastrado/],['principal',/número principal/],['em_uso',/outra empresa/]]){
  p=await painel(t,{rpcs:{lv_chat_conexao_salvar:{ok:false,erro,limite:2}}});
  r=await p.post('chat-conexoes',{organization:org,acao:'salvar',nome:'Investidor',url:URL_API});
  assert.equal(r.status,400);assert.match((await r.json()).error,re);
 }
 p=await painel(t,{chat:ok({error:'Invalid token.'},401)});
 r=await p.post('chat-conexoes',{organization:org,acao:'salvar',nome:'Investidor',url:URL_API});
 assert.match((await r.json()).error,/não aceitou esse token/);assert.equal(p.chamadas.some(c=>c.fn==='lv_chat_conexao_salvar'),false);
 p=await painel(t);
 r=await p.post('chat-conexoes',{organization:org,acao:'salvar',nome:'I',url:URL_API});assert.match((await r.json()).error,/Dê um nome/);
 r=await p.post('chat-conexoes',{organization:org,acao:'salvar',nome:'Investidor',url:'https://chatapi.leadvox.com.br/v1/api/external/5ac8/?token=semjwt1234567'});
 assert.match((await r.json()).error,/não diz de qual número/);
});

test('Outros números: tirar e escolher o número do agente', async t => {
 const p=await painel(t,{rpcs:{lv_chat_conexoes:lista}});
 let r=await p.post('chat-conexoes',{organization:org,acao:'excluir',id:CX});assert.equal(r.status,200);
 assert.deepEqual(p.chamadas.find(c=>c.fn==='lv_chat_conexao_excluir').body,{org,p_id:CX});
 r=await p.post('chat-conexoes',{organization:org,acao:'agente',agente:'grupo-lt-1-abc',conexao:CX});assert.equal(r.status,200);
 assert.deepEqual(p.chamadas.find(c=>c.fn==='lv_motor_agente_numero').body,{org,agente:'grupo-lt-1-abc',p_conexao:CX});
 r=await p.post('chat-conexoes',{organization:org,acao:'agente',agente:'grupo-lt-1-abc',conexao:null});assert.equal(r.status,200);
 assert.equal(p.chamadas.filter(c=>c.fn==='lv_motor_agente_numero').pop().body.p_conexao,null,'volta para o número principal');
 assert.equal((await p.post('chat-conexoes',{organization:org,acao:'agente',agente:'X Y',conexao:CX})).status,400);
});

test('Super Admin: IAs liberadas só por ele, de 1 a 20, sem baixar abaixo do que o cliente já usa', async t => {
 let p=await painel(t,{admin:false});
 assert.equal((await p.post('admin-limite-ias',{organization:org,limite:2})).status,403);
 p=await painel(t,{rpcs:{lv_admin_limite_ias:{ok:true,limite:2}}});
 let r=await p.post('admin-limite-ias',{organization:org,limite:2});assert.equal(r.status,200);assert.equal((await r.json()).limite,2);
 assert.deepEqual(p.chamadas.find(c=>c.fn==='lv_admin_limite_ias').body,{org,limite:2});
 for(const l of [0,21,1.5])assert.equal((await p.post('admin-limite-ias',{organization:org,limite:l})).status,400);
 p=await painel(t,{rpcs:{lv_admin_limite_ias:{ok:false,erro:'abaixo_do_uso',agentes:3}}});
 r=await p.post('admin-limite-ias',{organization:org,limite:2});assert.match((await r.json()).error,/já tem 3 IA/);
 p=await painel(t,{rpcs:{lv_admin_robos:{vinculado:true,robos:[]},lv_chat_conexoes:lista}});
 r=await p.get('admin-robos?organization='+org);assert.equal((await r.json()).limite,2,'Gerenciar mostra as IAs liberadas');
});

test('painel: Outros números em Credenciais, "Atende pelo número" no agente e IAs liberadas no Gerenciar', () => {
 const html=ler('../public/index.html'),js=ler('../public/painel.js');
 for(const id of ['cxStatus','cxForm','cxNome','cxUrl','cxToken','idNumeroBox','idNumero'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/acao: 'agente', agente: agSel, conexao: numero \|\| null/);
 assert.match(js,/acao: 'salvar', nome: \$\('cxNome'\)\.value/);
 assert.match(js,/api\('admin-limite-ias', \{ organization: e\.id, limite: Number\(\$\('emLimiteIas'\)\.value\) \}\)/);
 assert.match(ler('../account-api.mjs'),/\.\.\.\(sessaoIA\?\{sessaoIA\}:\{\}\)/,'Testar a IA de outro número escolhe a entrada daquele número');
});
