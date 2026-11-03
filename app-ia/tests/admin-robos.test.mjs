import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const robos={vinculado:true,conta:'loja-teste-ab12',whatsapp:true,sessao:284,robos:[{chave:'loja-teste-ab12-a',nome:'Carolina',tipo:'sdr',ativo:false}]};

async function fixture(t,{admin=true,ativo={ok:true}}={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(admin);
  if(fn==='lv_admin_robos')return ok(robos);
  if(fn==='lv_admin_robo_ativo')return ok(ativo);
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,
  get:o=>fetch(base+'/api/account/admin-robos?organization='+o,{headers:h}),
  post:b=>fetch(base+'/api/account/admin-robo-ativo',{method:'POST',headers:h,body:JSON.stringify(b)})};
}

test('Super Admin lists the robots of a company without a key',async t=>{
 const f=await fixture(t);const r=await f.get(org);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),robos);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_admin_robos').body,{org});
 assert.equal((await f.get('nao-e-uuid')).status,400);
});
test('only the platform admin sees or switches robots',async t=>{
 const f=await fixture(t,{admin:false});
 assert.equal((await f.get(org)).status,403);
 assert.equal((await f.post({organization:org,agente:'loja-teste-ab12-a',ativo:true})).status,403);
 assert.ok(!f.calls.some(c=>c.fn==='lv_admin_robos'||c.fn==='lv_admin_robo_ativo'));
});
test('switching a robot returns the fresh list and explains why it cannot turn on',async t=>{
 const f=await fixture(t);
 const r=await f.post({organization:org,agente:'loja-teste-ab12-a',ativo:true});
 assert.equal(r.status,200);assert.equal((await r.json()).sessao,284);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_admin_robo_ativo').body,{org,agente:'loja-teste-ab12-a',ativo:true});
 const g=await fixture(t,{ativo:{ok:false,erro:'pendencias',pendencias:['sem_departamento']}});
 const e=await g.post({organization:org,agente:'loja-teste-ab12-a',ativo:true});
 assert.equal(e.status,400);assert.match((await e.json()).error,/escolha o departamento/);
 assert.equal((await g.post({organization:org,agente:'X; drop',ativo:true})).status,400);
});
test('the SQL checks the platform admin and never returns connection secrets',()=>{
 const sql=readFileSync(new URL('../database/admin_robos.sql',import.meta.url),'utf8');
 for(const fn of ['lv_admin_robos','lv_admin_robo_ativo'])assert.match(sql,new RegExp('function public\\.'+fn+'\\([^)]*\\)[^$]*\\$\\$\\s*declare[^;]*;[^]*?begin\\s*if not public\\.lv_is_platform_admin\\(\\) then raise exception'));
 assert.doesNotMatch(sql,/urlEnvio|token|leadvoxUrlEnvio/i);
 assert.match(sql,/revoke all on function public\.lv_admin_robos\(uuid\) from public,anon/);
});
