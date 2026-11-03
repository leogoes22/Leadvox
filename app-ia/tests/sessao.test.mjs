import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const usuario={id:'11111111-1111-4111-8111-111111111111',email:'a@b.invalid',email_confirmed_at:'2026-01-01'};

async function fixture(t,{renova=()=>ok({access_token:'novo-acesso',refresh_token:'nova-renovacao',expires_in:3600}),validos=['novo-acesso'],fora=false}={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  const auth=(init?.headers?.Authorization||'').replace('Bearer ','');
  if(u.includes('grant_type=refresh_token')){calls.push({renova:JSON.parse(init.body).refresh_token});await new Promise(r=>setTimeout(r,20));return renova();}
  if(u.includes('grant_type=password'))return ok({access_token:'acesso',refresh_token:'renovacao',expires_in:3600});
  if(u.endsWith('/auth/v1/logout')){calls.push({logout:auth});return fora?Promise.reject(new Error('fora')):ok({});}
  if(u.endsWith('/auth/v1/user')){calls.push({user:auth});if(fora)throw new Error('fora');return validos.includes(auth)?ok(usuario):ok({},401);}
  return ok([]);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 return {calls,base,me:c=>fetch(base+'/api/account/me',{headers:c?{Cookie:c}:{}})};
}
const cookies=r=>r.headers.getSetCookie();

test('login stores the renewal only in an httpOnly cookie that lasts 30 days',async t=>{
 const f=await fixture(t);
 const r=await fetch(f.base+'/api/account/login',{method:'POST',headers:{Origin:f.base},body:JSON.stringify({email:'a@b.invalid',password:'senha-bem-longa'})});
 assert.equal(r.status,200);const c=cookies(r);assert.equal(c.length,2);
 assert.match(c[0],/^__Host-lv_session=acesso; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600$/);
 assert.match(c[1],/^__Host-lv_renova=renovacao; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
 assert.doesNotMatch(await r.text(),/renovacao|acesso/);
});
test('after the hour the session renews by itself and the request still works',async t=>{
 const f=await fixture(t);
 const r=await f.me('__Host-lv_renova=renovacao');
 assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/novo-acesso|nova-renovacao/);
 const c=cookies(r);assert.match(c[0],/__Host-lv_session=novo-acesso/);assert.match(c[1],/__Host-lv_renova=nova-renovacao/);
 assert.ok(f.calls.some(x=>x.user==='novo-acesso'));
});
test('an expired access token with a live renewal also renews',async t=>{
 const f=await fixture(t);
 assert.equal((await f.me('__Host-lv_session=vencido; __Host-lv_renova=renovacao')).status,200);
 assert.deepEqual(f.calls.filter(x=>x.renova),[{renova:'renovacao'}]);
});
test('a valid session does not spend the renewal',async t=>{
 const f=await fixture(t,{validos:['acesso']});
 const r=await f.me('__Host-lv_session=acesso; __Host-lv_renova=renovacao');
 assert.equal(r.status,200);assert.equal(cookies(r).length,0);assert.ok(!f.calls.some(x=>x.renova));
});
test('parallel requests share one renewal, because the token works only once',async t=>{
 const f=await fixture(t);
 const rs=await Promise.all([1,2,3,4,5].map(()=>f.me('__Host-lv_renova=renovacao')));
 assert.deepEqual(rs.map(r=>r.status),[200,200,200,200,200]);
 assert.equal(f.calls.filter(x=>x.renova).length,1);
 for(const r of rs)assert.match(cookies(r)[1],/nova-renovacao/);
});
test('a dead renewal asks for login and clears both cookies',async t=>{
 const f=await fixture(t,{renova:()=>ok({},400)});
 const r=await f.me('__Host-lv_renova=morta');
 assert.equal(r.status,401);const c=cookies(r);
 assert.match(c[0],/^__Host-lv_session=;.*Max-Age=0$/);assert.match(c[1],/^__Host-lv_renova=;.*Max-Age=0$/);
});
test('a failed renewal can be tried again, it is not remembered',async t=>{
 let n=0;const f=await fixture(t,{renova:()=>++n===1?ok({},500):ok({access_token:'novo-acesso',refresh_token:'nova-renovacao',expires_in:3600})});
 assert.equal((await f.me('__Host-lv_renova=renovacao')).status,401);
 assert.equal((await f.me('__Host-lv_renova=renovacao')).status,200);
});
test('login service down is not an expired session: nobody is logged out',async t=>{
 const f=await fixture(t,{fora:true});
 const r=await f.me('__Host-lv_session=acesso; __Host-lv_renova=renovacao');
 assert.equal(r.status,503);assert.equal(cookies(r).length,0);assert.ok(!f.calls.some(x=>x.renova));
});
test('no cookies still asks for login without calling the login service',async t=>{
 const f=await fixture(t);
 assert.equal((await f.me('')).status,401);assert.equal(f.calls.length,0);
 assert.equal((await f.me('__Host-lv_session=%E0%A4%A')).status,401);
});
test('leaving clears this device even if the login service does not answer',async t=>{
 const f=await fixture(t,{validos:['acesso']});
 const h={Origin:f.base,Cookie:'__Host-lv_session=acesso; __Host-lv_renova=renovacao'};
 const r=await fetch(f.base+'/api/account/logout',{method:'POST',headers:h,body:'{}'});
 assert.equal(r.status,200);assert.ok(f.calls.some(x=>x.logout==='acesso'));
 const c=cookies(r);assert.match(c[0],/Max-Age=0$/);assert.match(c[1],/Max-Age=0$/);
});
test('the login limit counts each customer, not everyone behind the proxy together',async t=>{
 const f=await fixture(t);
 const entrar=ip=>fetch(f.base+'/api/account/login',{method:'POST',headers:{Origin:f.base,'X-Forwarded-For':ip},body:JSON.stringify({email:'a@b.invalid',password:'senha-bem-longa'})}).then(r=>r.status);
 for(let i=0;i<25;i++)assert.equal(await entrar('10.0.0.'+i),200);
 for(let i=0;i<20;i++)assert.equal(await entrar('9.9.9.9'),200);
 assert.equal(await entrar('9.9.9.9'),429);
 assert.equal(await entrar('1.1.1.1, 9.9.9.9'),429,'um endereço falso na frente não escapa do limite');
 assert.equal(await entrar('8.8.8.8'),200);
});
