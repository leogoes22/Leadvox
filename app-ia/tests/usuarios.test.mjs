import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {createUsuarios} from '../supabase/functions/usuarios/usuarios.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222',alvo='33333333-3333-4333-8333-333333333333';
const JWT='aaa.bbb.ccc';

// ── função "usuarios" (a única com a chave de serviço) ──
function funcao({respostas={},admin={}}={}){
 const rpcs=[],admins=[],recuperados=[];
 const h=createUsuarios({
  rpcComo:async(jwt,fn,args)=>{rpcs.push({jwt,fn,args});const r=respostas[fn];const v=Array.isArray(r)?r.shift():r;if(v instanceof Error)throw v;return v;},
  admin:async(metodo,caminho,corpo)=>{admins.push({metodo,caminho,corpo});return admin[metodo]||{status:200,dados:{}};},
  recuperar:async email=>{recuperados.push(email);}});
 const pedir=(acao,b,headers={})=>h(new Request('https://x.supabase.co/functions/v1/usuarios/'+acao,{method:'POST',headers:{Authorization:'Bearer '+JWT,'Content-Type':'application/json',...headers},body:JSON.stringify(b)}));
 return {rpcs,admins,recuperados,pedir};
}
test('convidar: quem já tem login entra direto, sem criar login nem mandar e-mail', async () => {
 const f=funcao({respostas:{lv_usuarios_adicionar:{ok:true,id:alvo}}});
 const r=await f.pedir('convidar',{organization:org,email:' Vendedor@Loja.com.br ',papel:'member'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,novo:false,email:'vendedor@loja.com.br'});
 assert.deepEqual(f.rpcs,[{jwt:JWT,fn:'lv_usuarios_adicionar',args:{org,p_email:'vendedor@loja.com.br',papel:'member'}}]);
 assert.equal(f.admins.length,0);assert.equal(f.recuperados.length,0);
});
test('convidar: sem login, cria o login confirmado e sem senha, chama o banco de novo e manda o código', async () => {
 const f=funcao({respostas:{lv_usuarios_adicionar:[{ok:false,erro:'sem_login'},{ok:true,id:alvo}]}});
 const r=await f.pedir('convidar',{organization:org,email:'nova@loja.com.br',papel:'admin'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,novo:true,email:'nova@loja.com.br',emailEnviado:true});
 assert.deepEqual(f.admins,[{metodo:'POST',caminho:'/admin/users',corpo:{email:'nova@loja.com.br',email_confirm:true}}]);
 assert.ok(!('password' in f.admins[0].corpo),'senha nenhuma é criada por aqui');
 assert.equal(f.rpcs.length,2);assert.ok(f.rpcs.every(c=>c.jwt===JWT),'o banco sempre confere com o login de quem pede');
 assert.deepEqual(f.recuperados,['nova@loja.com.br']);
});
test('convidar: recusa ou falta de permissão no banco não cria login', async () => {
 let f=funcao({respostas:{lv_usuarios_adicionar:{ok:false,erro:'so_dono'}}});
 let r=await f.pedir('convidar',{organization:org,email:'a@b.com',papel:'owner'});
 assert.equal(r.status,400);assert.equal((await r.json()).erro,'so_dono');assert.equal(f.admins.length,0);
 f=funcao({respostas:{lv_usuarios_adicionar:Object.assign(Error('rpc'),{status:400,proibido:true})}});
 r=await f.pedir('convidar',{organization:org,email:'a@b.com',papel:'member'});
 assert.equal(r.status,403);assert.equal(f.admins.length,0);
 f=funcao();
 for(const b of [{organization:'x',email:'a@b.com',papel:'member'},{organization:org,email:'sem-arroba',papel:'member'},{organization:org,email:'a@b.com',papel:'chefe'}])
  assert.equal((await f.pedir('convidar',b)).status,400);
 assert.equal(f.rpcs.length,0);
});
test('a função só atende o servidor do painel, com login, nas duas ações', async () => {
 const f=funcao({respostas:{lv_usuarios_adicionar:{ok:true}}});
 assert.equal((await f.pedir('convidar',{organization:org,email:'a@b.com',papel:'member'},{Origin:'https://site.com'})).status,403);
 assert.equal((await f.pedir('convidar',{organization:org,email:'a@b.com',papel:'member'},{Authorization:'Bearer x'})).status,401);
 assert.equal((await f.pedir('apagar',{organization:org})).status,404);
 assert.equal(f.rpcs.length,0);
});
test('trocar e-mail: o banco confere antes, a troca vai para o login e fica registrada', async () => {
 const f=funcao({respostas:{lv_usuarios_email_conferir:{ok:true,de:'antigo@loja.com',para:'novo@loja.com'},lv_usuarios_email_registrar:{ok:true}}});
 const r=await f.pedir('email',{organization:org,alvo,email:'Novo@Loja.com',avisar:true});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,email:'novo@loja.com',emailEnviado:true});
 assert.deepEqual(f.rpcs.map(c=>c.fn),['lv_usuarios_email_conferir','lv_usuarios_email_registrar']);
 assert.deepEqual(f.rpcs[1].args,{org,alvo,de:'antigo@loja.com'});
 assert.deepEqual(f.admins,[{metodo:'PUT',caminho:'/admin/users/'+alvo,corpo:{email:'novo@loja.com',email_confirm:true}}]);
 assert.deepEqual(f.recuperados,['novo@loja.com']);
});
test('trocar e-mail: recusa do banco não toca no login; e-mail já usado vira mensagem', async () => {
 let f=funcao({respostas:{lv_usuarios_email_conferir:{ok:false,erro:'plataforma'}}});
 let r=await f.pedir('email',{organization:org,alvo,email:'novo@loja.com'});
 assert.equal(r.status,400);assert.equal((await r.json()).erro,'plataforma');assert.equal(f.admins.length,0);
 f=funcao({respostas:{lv_usuarios_email_conferir:{ok:true,de:'a@a.com'}},admin:{PUT:{status:422,dados:{}}}});
 r=await f.pedir('email',{organization:org,alvo,email:'novo@loja.com'});
 assert.equal((await r.json()).erro,'email_em_uso');assert.ok(!f.rpcs.some(c=>c.fn==='lv_usuarios_email_registrar'));
 f=funcao({respostas:{lv_usuarios_email_conferir:{ok:true,de:'a@a.com'},lv_usuarios_email_registrar:{ok:true}}});
 r=await f.pedir('email',{organization:org,alvo,email:'novo@loja.com'});
 assert.equal((await r.json()).emailEnviado,false);assert.equal(f.recuperados.length,0,'sem "avisar", nenhum e-mail sai');
});

// ── rotas do painel ──
async function painel(t,{admin=false,rpc={},funcaoResp={ok:true,novo:true,email:'nova@loja.com.br',emailEnviado:true},funcaoStatus=200}={}){
 const calls=[],funcoes=[],recover=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.endsWith('/auth/v1/recover')){recover.push(JSON.parse(init.body));return ok({});}
  if(u.includes('/functions/v1/usuarios/')){funcoes.push({u,auth:init.headers.Authorization,body:JSON.parse(init.body)});return ok(funcaoResp,funcaoStatus);}
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(admin);
  if(fn in rpc)return typeof rpc[fn]==='number'?ok({message:'forbidden'},rpc[fn]):ok(rpc[fn]);
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=sessao-x'};
 return {calls,funcoes,recover,
  get:p=>fetch(base+'/api/account/'+p,{headers:h}),
  post:b=>fetch(base+'/api/account/usuarios-painel',{method:'POST',headers:h,body:JSON.stringify(b)})};
}
test('lista: o banco devolve a lista; quem não pode recebe recusa clara', async t => {
 let f=await painel(t,{rpc:{lv_usuarios:{gestor:'owner',eu:'1',usuarios:[{id:alvo,email:'dono@loja.com',papel:'owner',principal:true}]}}});
 let r=await f.get('usuarios-painel?organization='+org);
 assert.equal(r.status,200);assert.equal((await r.json()).usuarios[0].email,'dono@loja.com');
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_usuarios').body,{org});
 f=await painel(t,{rpc:{lv_usuarios:400}});
 r=await f.get('usuarios-painel?organization='+org);
 assert.equal(r.status,403);assert.match((await r.json()).error,/dono ou um admin/);
 assert.equal((await f.get('usuarios-painel?organization=x')).status,400);
});
test('convidar: vai para a função "usuarios" com o login de quem pede; função errada nem sai daqui', async t => {
 const f=await painel(t);
 let r=await f.post({organization:org,acao:'convidar',email:'Nova@Loja.com.br',papel:'admin'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,novo:true,email:'nova@loja.com.br',emailEnviado:true});
 assert.equal(f.funcoes.length,1);assert.match(f.funcoes[0].u,/\/functions\/v1\/usuarios\/convidar$/);
 assert.equal(f.funcoes[0].auth,'Bearer sessao-x');
 assert.deepEqual(f.funcoes[0].body,{organization:org,email:'nova@loja.com.br',papel:'admin'});
 r=await f.post({organization:org,acao:'convidar',email:'a@b.com',papel:'superusuario'});
 assert.equal(r.status,400);assert.equal(f.funcoes.length,1);
});
test('convidar: recusa da função vira mensagem do painel', async t => {
 const f=await painel(t,{funcaoResp:{ok:false,erro:'limite'},funcaoStatus:400});
 const r=await f.post({organization:org,acao:'convidar',email:'a@b.com',papel:'member'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/30 pessoas novas/);
});
test('trocar e-mail de login: só o Super Admin', async t => {
 let f=await painel(t,{admin:false});
 let r=await f.post({organization:org,acao:'email',alvo,email:'novo@loja.com'});
 assert.equal(r.status,403);assert.equal(f.funcoes.length,0);
 f=await painel(t,{admin:true,funcaoResp:{ok:true,email:'novo@loja.com',emailEnviado:true}});
 r=await f.post({organization:org,acao:'email',alvo,email:'novo@loja.com',avisar:true});
 assert.equal(r.status,200);assert.match(f.funcoes[0].u,/usuarios\/email$/);
 assert.deepEqual(f.funcoes[0].body,{organization:org,alvo,email:'novo@loja.com',avisar:true});
});
test('redefinir senha: o banco confere e devolve o e-mail; o código sai pelo "Esqueci minha senha"', async t => {
 const f=await painel(t,{rpc:{lv_usuarios_senha:{ok:true,email:'vendedor@loja.com'}}});
 const r=await f.post({organization:org,acao:'senha',alvo});
 assert.equal(r.status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_usuarios_senha').body,{org,alvo});
 assert.deepEqual(f.recover,[{email:'vendedor@loja.com'}]);
});
test('trocar função e remover: as recusas do banco viram mensagens claras', async t => {
 for(const [rpc,acao,erro,re] of [['lv_usuarios_papel','papel','principal',/dono principal/],['lv_usuarios_remover','remover','proprio',/próprio acesso/],['lv_usuarios_papel','papel','so_dono',/Só o dono/]]){
  const f=await painel(t,{rpc:{[rpc]:{ok:false,erro}}});
  const r=await f.post({organization:org,acao,alvo,papel:'member'});
  assert.equal(r.status,400);assert.match((await r.json()).error,re);
 }
 const f=await painel(t,{rpc:{lv_usuarios_papel:{ok:true,papel:'admin'}}});
 assert.equal((await f.post({organization:org,acao:'papel',alvo,papel:'admin'})).status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_usuarios_papel').body,{org,alvo,papel:'admin'});
 assert.equal((await f.post({organization:org,acao:'papel',alvo:'x',papel:'admin'})).status,400);
});

// ── banco ──
const sql=readFileSync(new URL('../database/usuarios.sql',import.meta.url),'utf8');
test('SQL: toda função com security definer e search_path vazio, sem \\d, em partes que o editor aguenta', () => {
 const funcoes=[...sql.matchAll(/create or replace function ([a-z_.]+)\([^)]*\)[^$]*\$\$/g)];
 assert.ok(funcoes.length>=10);
 for(const [cab,nome] of funcoes){assert.match(cab,/set search_path=''/,nome);if(!nome.endsWith('usuarios_email'))assert.match(cab,/security definer/,nome);}
 assert.ok(!sql.includes('\\d'),'use [0-9] no lugar de \\d');
 const partes=sql.split(/-- ═══ PARTE [0-9]/).slice(1);
 assert.equal(partes.length,4);
 for(const p of partes)assert.ok(Buffer.byteLength(p)<=5600,'parte com '+Buffer.byteLength(p)+' bytes');
 assert.match(sql,/insert into leadvox_private\.sql_aplicado\(arquivo\) values\('usuarios\.sql'\)/);
 assert.match(readFileSync(new URL('../database/controle.sql',import.meta.url),'utf8'),/'usuarios\.sql'/);
});
test('SQL: permissões fechadas e as regras do dono, do próprio acesso e do histórico', () => {
 assert.match(sql,/revoke all on leadvox_private\.usuarios_log from public,anon,authenticated/);
 assert.match(sql,/revoke all on function leadvox_private\.usuarios_gestor\(uuid\),leadvox_private\.usuarios_registrar\(uuid,text,text,uuid,jsonb\),leadvox_private\.usuarios_email\(text\) from public,anon,authenticated/);
 for(const f of ['lv_usuarios(uuid)','lv_usuarios_adicionar(uuid,text,text)','lv_usuarios_papel(uuid,uuid,text)','lv_usuarios_remover(uuid,uuid)','lv_usuarios_senha(uuid,uuid)','lv_usuarios_email_conferir(uuid,uuid,text)','lv_usuarios_email_registrar(uuid,uuid,text)']){
  const re=f.replace(/[()]/g,m=>'\\'+m);
  assert.match(sql,new RegExp('revoke all on function [^;]*public\\.'+re+'[^;]*from public,anon;'),f);
  assert.match(sql,new RegExp('grant execute on function [^;]*public\\.'+re+'[^;]*to authenticated;'),f);
 }
 // o dono principal não sai nem muda; ninguém mexe no próprio acesso; admin não mexe em dono
 for(const fn of ['lv_usuarios_papel','lv_usuarios_remover']){
  const corpo=sql.split('function public.'+fn+'(')[1].split('end;$$')[0];
  assert.match(corpo,/if alvo=dono then return [^;]*'principal'/,fn);
  assert.match(corpo,/if alvo=auth\.uid\(\) and g<>'plataforma' then return [^;]*'proprio'/,fn);
  assert.match(corpo,/g='admin' and[^;]*'so_dono'/,fn);
 }
 assert.match(sql,/if papel='owner' and g='admin' then return [^;]*'so_dono'/);
 // trocar e-mail: só o Super Admin, nunca de alguém da equipe LeadVox, nunca para um e-mail que já é login
 const conferir=sql.split('function public.lv_usuarios_email_conferir(')[1].split('end;$$')[0];
 assert.match(conferir,/if not public\.lv_is_platform_admin\(\) then raise exception 'forbidden'/);
 assert.match(conferir,/platform_admins[^;]*'plataforma'/);assert.match(conferir,/'email_em_uso'/);
 assert.match(sql,/insert into leadvox_private\.saas_admin_log\(organization_id,admin_id,acao,dados\)/);
 assert.match(sql,/l\.criado_em>now\(\)-interval '1 day'\)>=30/);
});
test('tela: a lista está no Gerenciar do Super Admin e na Minha conta; o código pode ser usado direto no entrar', () => {
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
 const dlg=html.split('id="dlgEmpresa"')[1].split('</dialog>')[0];
 assert.match(dlg,/id="emUsuariosLista"/);
 assert.match(html.split('id="vConta"')[1].split('</section>')[0],/id="usuConta"/);
 assert.match(html,/id="btJaTenhoCodigo"/);
 assert.match(js,/carregarUsuarios\(\$\('emUsuariosLista'\), e\.id, true\)/);
 assert.match(js,/if \(pg === 'conta'\) carregarUsuariosConta\(\)/);
 const tela=js.split('/* ═══════════ USUÁRIOS DO PAINEL')[1].split('/* ═══════════ SUPER ADMIN')[0];
 assert.doesNotMatch(tela,/password|senha:/i,'a tela de usuários nunca manda senha');
});
