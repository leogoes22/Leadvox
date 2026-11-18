import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {createUsuarios} from '../supabase/functions/usuarios/usuarios.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const JWT='aaa.bbb.ccc',ID='44444444-4444-4444-8444-444444444444';

// ── função "usuarios", ação cliente ──
function funcao({respostas={},admin={}}={}){
 const rpcs=[],admins=[],recuperados=[];
 const h=createUsuarios({
  rpcComo:async(jwt,fn,args)=>{rpcs.push({jwt,fn,args});const r=respostas[fn];const v=Array.isArray(r)?r.shift():r;if(v instanceof Error)throw v;return v;},
  admin:async(metodo,caminho,corpo)=>{admins.push({metodo,caminho,corpo});return admin[metodo]||{status:200,dados:{}};},
  recuperar:async email=>{recuperados.push(email);}});
 const pedir=b=>h(new Request('https://x.supabase.co/functions/v1/usuarios/cliente',{method:'POST',headers:{Authorization:'Bearer '+JWT,'Content-Type':'application/json'},body:JSON.stringify(b)}));
 return {rpcs,admins,recuperados,pedir};
}
test('cliente: sem login, cria o login confirmado e sem senha, cria a empresa e manda o código', async () => {
 const f=funcao({respostas:{lv_admin_cliente_criar:[{ok:false,erro:'sem_login'},{ok:true,id:ID,nome:'Kidas Car'}]}});
 const r=await f.pedir({nome:' Kidas Car ',email:' Dono@Kidas.com.br ',dias:14});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,id:ID,nome:'Kidas Car',email:'dono@kidas.com.br',novo:true,emailEnviado:true});
 assert.deepEqual(f.admins,[{metodo:'POST',caminho:'/admin/users',corpo:{email:'dono@kidas.com.br',email_confirm:true}}]);
 assert.deepEqual(f.rpcs.map(c=>c.args),[{nome:'Kidas Car',p_email:'dono@kidas.com.br',dias:14},{nome:'Kidas Car',p_email:'dono@kidas.com.br',dias:14}]);
 assert.ok(f.rpcs.every(c=>c.jwt===JWT),'o banco confere com o login de quem pede');
 assert.deepEqual(f.recuperados,['dono@kidas.com.br']);
});
test('cliente: quem já tem login vira dono direto, sem criar login nem mandar e-mail', async () => {
 const f=funcao({respostas:{lv_admin_cliente_criar:{ok:true,id:ID,nome:'Start Car'}}});
 const r=await f.pedir({nome:'Start Car',email:'dono@start.com.br'});
 assert.deepEqual(await r.json(),{ok:true,id:ID,nome:'Start Car',email:'dono@start.com.br',novo:false,emailEnviado:false});
 assert.equal(f.admins.length,0);assert.equal(f.recuperados.length,0);assert.equal(f.rpcs[0].args.dias,7,'padrão 7 dias');
});
test('cliente: dados ruins nem chegam ao banco; recusa do banco não cria login', async () => {
 let f=funcao();
 for(const [b,erro] of [[{nome:'K',email:'a@b.com'},'nome'],[{nome:'Kidas',email:'sem-arroba'},'email'],[{nome:'Kidas',email:'a@b.com',dias:91},'dias'],[{nome:'Kidas',email:'a@b.com',dias:2.5},'dias']]){
  const r=await f.pedir(b);assert.equal(r.status,400);assert.equal((await r.json()).erro,erro);
 }
 assert.equal(f.rpcs.length,0);
 f=funcao({respostas:{lv_admin_cliente_criar:{ok:false,erro:'ja_tem_empresa',empresa:'Kidas Car'}}});
 let r=await f.pedir({nome:'Outra',email:'dono@kidas.com.br'});
 assert.equal(r.status,400);assert.deepEqual(await r.json(),{ok:false,erro:'ja_tem_empresa',empresa:'Kidas Car'});assert.equal(f.admins.length,0);
 f=funcao({respostas:{lv_admin_cliente_criar:Object.assign(Error('rpc'),{status:400,proibido:true})}});
 r=await f.pedir({nome:'Kidas',email:'a@b.com'});assert.equal(r.status,403);assert.equal(f.admins.length,0,'quem não é Super Admin não cria login');
 f=funcao({respostas:{lv_admin_cliente_criar:{ok:false,erro:'sem_login'}},admin:{POST:{status:500,dados:{}}}});
 r=await f.pedir({nome:'Kidas',email:'a@b.com'});assert.equal(r.status,502);assert.equal((await r.json()).erro,'login');assert.equal(f.rpcs.length,1);
});

// ── servidor do painel: /api/account/admin-cliente-novo ──
async function painel(t,{admin=true,funcao={ok:true,id:ID,nome:'Kidas Car',email:'dono@kidas.com.br',novo:true,emailEnviado:true},status=200}={}){
 const chamadas=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('rpc/lv_is_platform_admin'))return ok(admin);
  if(u.includes('/functions/v1/usuarios/')){chamadas.push({u,init,body:JSON.parse(init.body)});return ok(funcao,status);}
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 return {chamadas,post:b=>fetch(base+'/api/account/admin-cliente-novo',{method:'POST',headers:{Origin:base,Cookie:'__Host-lv_session=x'},body:JSON.stringify(b)})};
}
test('painel: só o Super Admin cria cliente, e repassa à função com o login de quem pede', async t => {
 let f=await painel(t,{admin:false});
 assert.equal((await f.post({nome:'Kidas Car',email:'dono@kidas.com.br'})).status,403);assert.equal(f.chamadas.length,0);
 f=await painel(t);
 const r=await f.post({nome:' Kidas Car ',email:'Dono@Kidas.com.br',dias:30});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,id:ID,nome:'Kidas Car',email:'dono@kidas.com.br',novo:true,emailEnviado:true});
 assert.match(f.chamadas[0].u,/\/functions\/v1\/usuarios\/cliente$/);assert.deepEqual(f.chamadas[0].body,{nome:'Kidas Car',email:'dono@kidas.com.br',dias:30});
 assert.equal(f.chamadas[0].init.headers.Authorization,'Bearer x');
});
test('painel: confere os campos antes e traduz as recusas', async t => {
 let f=await painel(t);
 for(const b of [{nome:'K',email:'a@b.com'},{nome:'Kidas',email:'x'},{nome:'Kidas',email:'a@b.com',dias:0},{nome:'Kidas',email:'a@b.com',dias:120}])assert.equal((await f.post(b)).status,400);
 assert.equal(f.chamadas.length,0);
 f=await painel(t,{funcao:{ok:false,erro:'ja_tem_empresa',empresa:'Kidas Car'},status:400});
 let r=await f.post({nome:'Outra',email:'dono@kidas.com.br'});assert.equal(r.status,400);assert.match((await r.json()).error,/já é dono da empresa "Kidas Car"/);
 f=await painel(t,{funcao:{ok:false,erro:'plataforma'},status:400});
 r=await f.post({nome:'Outra',email:'contato@leadvox.com.br'});assert.match((await r.json()).error,/equipe LeadVox/);
 f=await painel(t,{funcao:'não publicada',status:404});
 r=await f.post({nome:'Kidas',email:'a@b.com'});assert.equal(r.status,502);assert.match((await r.json()).error,/ainda não está ligado/);
});

test('banco: só o Super Admin cria; o cliente vira o dono principal; registrado no histórico', () => {
 const sql=ler('../database/cliente_novo.sql');
 assert.match(sql,/new\.owner_id<>auth\.uid\(\) and not public\.lv_is_platform_admin\(\)/,'cadastro normal continua só para si mesmo');
 assert.match(sql,/if not public\.lv_is_platform_admin\(\) then raise exception 'forbidden'/);
 assert.match(sql,/insert into public\.lv_organizations\(owner_id,name,trial_ends_at\) values\(u\.id,n,now\(\)\+make_interval\(days=>dias\)\)/);
 assert.match(sql,/'ja_tem_empresa'/);assert.match(sql,/platform_admins p where p\.user_id=u\.id/);
 assert.match(sql,/usuarios_registrar\(org,'plataforma','criar-cliente'/);
 assert.match(sql,/revoke all on function public\.lv_admin_cliente_criar\(text,text,int\) from public,anon;/);
 assert.match(sql,/sql_aplicado\(arquivo\) values\('cliente_novo\.sql'\)/);
});
test('Painel LeadVox: botão + Novo cliente e a janela com nome, e-mail e dias de teste', () => {
 const html=ler('../public/index.html'),js=ler('../public/painel.js');
 assert.match(html,/id="lvNovoCliente"/);assert.match(html,/<dialog id="dlgCliente"/);
 for(const id of ['ncNome','ncEmail','ncDias','ncErro','ncOk'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/api\('admin-cliente-novo', \{ nome: \$\('ncNome'\)\.value\.trim\(\), email: \$\('ncEmail'\)\.value\.trim\(\), dias: Number\(\$\('ncDias'\)\.value\) \}\)/);
 assert.match(js,/await carregarLv\(\); if \(r\.id\) abrirEmpresa\(r\.id\);/);
});
