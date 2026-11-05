import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {separarExcluidosCode} from '../n8n/limpeza-arquivos.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
async function fixture(t,{admin=true,res={ok:true,nome:'Loja Teste',conta:'loja-teste-ab12'}}={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(admin);
  if(fn==='lv_admin_excluir_empresa')return ok(res);
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,post:b=>fetch(base+'/api/account/admin-excluir',{method:'POST',headers:h,body:JSON.stringify(b)})};
}
test('only the platform admin deletes a company',async t=>{
 const f=await fixture(t,{admin:false});
 assert.equal((await f.post({organization:org,confirma:'Loja Teste'})).status,403);
 assert.ok(!f.calls.some(c=>c.fn==='lv_admin_excluir_empresa'));
});
test('deleting needs a valid company and the typed name',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post({organization:'nao-e-uuid',confirma:'Loja Teste'})).status,400);
 assert.equal((await f.post({organization:org,confirma:'  '})).status,400);
 assert.ok(!f.calls.some(c=>c.fn==='lv_admin_excluir_empresa'));
 const r=await f.post({organization:org,confirma:'Loja Teste'});
 assert.equal(r.status,200);assert.equal((await r.json()).nome,'Loja Teste');
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_admin_excluir_empresa').body,{org,confirma:'Loja Teste'});
});
test('refusals from the database become clear messages',async t=>{
 for(const [erro,re] of [['confirmacao',/não confere/],['propria_conta',/própria empresa/],['assinatura_ativa',/assinatura no Asaas/]]){
  const f=await fixture(t,{res:{ok:false,erro}});
  const r=await f.post({organization:org,confirma:'Loja Teste'});
  assert.equal(r.status,400);assert.match((await r.json()).error,re);
 }
});
test('the database rechecks admin, name, own company and subscription, and clears the vault',()=>{
 const sql=readFileSync(new URL('../database/excluir_empresa.sql',import.meta.url),'utf8');
 for(const re of [/if not public\.lv_is_platform_admin\(\) then raise exception 'forbidden'/,/'confirmacao'/,/settings->>'displayName'/,/'propria_conta'/,/'assinatura_ativa'/,/delete from vault\.secrets where id=any\(cofre\)/,/delete from public\.iag_conta where chave=v_conta/,/saas_admin_log/])assert.match(sql,re);
 assert.match(sql,/revoke all on function public\.iag_arquivos_excluidos\(int\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.iag_arquivos_excluidos\(int\) to service_role/);
});
test('the night cleanup only deletes files inside a folder, in known buckets',()=>{
 const roda=(itens)=>new Function('$input',separarExcluidosCode)({all:()=>itens.map(json=>({json}))});
 assert.deepEqual(roda([{bucket:'lv-estoque',caminho:'conta/a.jpg'},{bucket:'iag-arquivos',caminho:'conta/v.mp4'},{bucket:'lv-estoque',caminho:'conta/b.jpg'}]),
  [{json:{bucket:'lv-estoque',prefixes:['conta/a.jpg','conta/b.jpg']}},{json:{bucket:'iag-arquivos',prefixes:['conta/v.mp4']}}]);
 assert.deepEqual(roda([{bucket:'sdr-estoque',caminho:'conta/x.jpg'},{bucket:'lv-estoque',caminho:'solta.jpg'}]),[]);
});
