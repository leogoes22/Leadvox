import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {cleanSettings} from '../account-api.mjs';
async function fixture(t,fetchImpl){const s=createApp({allowLocal:true,fetchImpl});await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
test('anonymous access, CSRF and invalid input cannot access tenant records',async t=>{
 let count=0;const base=await fixture(t,async()=>{count++;return response({});});
 assert.equal((await fetch(base+'/api/account/me')).status,401);
 assert.equal((await fetch(base+'/api/account/login',{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/account/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({email:'wrong',password:'secret'})})).status,400);
 assert.equal(count,0);
});
test('session is httpOnly secure and tokens never enter response body',async t=>{
 const base=await fixture(t,async()=>response({access_token:'private-session-token',expires_in:3600}));
 const r=await fetch(base+'/api/account/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({email:'user@example.invalid',password:'long-password'})});
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.doesNotMatch(await r.text(),/private-session-token/);
});
test('forged/expired sessions and cross-company reads are denied before data fetch',async t=>{
 let workspaceReads=0;const base=await fixture(t,async url=>{
 if(url.endsWith('/auth/v1/user'))return response({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
 if(url.includes('lv_memberships'))return response([]);
 workspaceReads++;return response([]);
 });
 const r=await fetch(base+'/api/account/workspace?organization=22222222-2222-4222-8222-222222222222',{headers:{Cookie:'__Host-lv_session=test'}});
 assert.equal(r.status,403);assert.equal(workspaceReads,0);
 const invalid=await fixture(t,async()=>response({},401));assert.equal((await fetch(invalid+'/api/account/me',{headers:{Cookie:'__Host-lv_session=forged'}})).status,401);
});
test('company creation does not ask for the inserted row before the owner membership exists',async t=>{
 const calls=[];const base=await fixture(t,async(url,init)=>{
 if(url.endsWith('/auth/v1/user'))return response({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
 calls.push({url,method:init.method,prefer:init.headers.Prefer});
 return init.method==='POST'?response(null,201):response([{id:'22222222-2222-4222-8222-222222222222',name:'LeadVox'}]);
 });
 const r=await fetch(base+'/api/account/organization',{method:'POST',headers:{Origin:base,Cookie:'__Host-lv_session=test'},body:JSON.stringify({name:'LeadVox'})});
 assert.equal(r.status,201);assert.equal((await r.json()).organizations[0].name,'LeadVox');
 assert.equal(calls[0].method,'POST');assert.equal(calls[0].prefer,'return=minimal');
 assert.equal(calls[1].method,'GET');assert.match(calls[1].url,/owner_id=eq\.11111111-1111-4111-8111-111111111111/);
});
test('workspace settings accept only known onboarding fields',()=>{
 assert.deepEqual(cleanSettings({niche:'automotivo',aiName:' Carol ',whatsapp:'(21) 99999-0000',billingEnabled:true,onboarded:true}),{niche:'automotivo',aiName:'Carol',whatsapp:'21999990000',billingEnabled:true,onboarded:true});
 assert.deepEqual(cleanSettings({aiRole:'SDR',aiDescription:' Atendo leads ',aiActive:false,capAudioIn:true}),{aiRole:'SDR',aiDescription:'Atendo leads',aiActive:false,capAudioIn:true});
 for(const bad of [{aiRole:'Hacker'},{capAudioIn:'sim'},{niche:'cassino'},{token:'x'},{whatsapp:'123'},{billingEnabled:'sim'},[],null])assert.throws(()=>cleanSettings(bad));
});
test('"me" lists only own memberships and the owner area is closed to everyone else',async t=>{
 const base=await fixture(t,async url=>{
 if(url.endsWith('/auth/v1/user'))return response({id:'11111111-1111-4111-8111-111111111111',email:'loja@example.invalid',email_confirmed_at:'2026-01-01'});
 if(url.includes('/rpc/lv_is_platform_admin'))return response(false);
 if(url.includes('lv_memberships'))return response([{role:'owner',lv_organizations:{id:'22222222-2222-4222-8222-222222222222',name:'Loja'}}]);
 return response([{id:'other'}]);
 });
 const me=await (await fetch(base+'/api/account/me',{headers:{Cookie:'__Host-lv_session=test'}})).json();
 assert.deepEqual(me.organizations.map(o=>o.name),['Loja']);assert.equal(me.platformAdmin,false);
 assert.equal((await fetch(base+'/api/account/admin',{headers:{Cookie:'__Host-lv_session=test'}})).status,403);
});
test('LeadVox connection is tested before saving and the token never returns to the browser',async t=>{
 const org='22222222-2222-4222-8222-222222222222',url='https://chatapi.leadvox.com.br/v1/api/external/acc-1/?token=secret-token-123';
 let saved=null,lvStatus=401;const base=await fixture(t,async(u,init)=>{
 if(u.endsWith('/auth/v1/user'))return response({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
 if(u.startsWith('https://chatapi.leadvox.com.br/'))return lvStatus===200?response({data:[{id:3,name:'Quente',color:'#ff0000',extra:'x'}]}):{ok:false,status:lvStatus,json:async()=>({})};
 if(u.includes('lv_set_chat_credentials')){saved=JSON.parse(init.body);return response(null,204);}
 if(u.includes('lv_chat_secret'))return response(saved?[{api_root:saved.root,api_id:saved.api,token:saved.tok}]:[]);
 return response([]);
 });
 const post=b=>fetch(base+'/api/account/chat-credentials',{method:'POST',headers:{Origin:base,Cookie:'__Host-lv_session=test'},body:JSON.stringify(b)});
 assert.equal((await post({organization:org,url:'https://evil.example/v1/api/external/a/?token=1234567890'})).status,400);
 assert.equal((await post({organization:org,url})).status,400);assert.equal(saved,null);
 const get=()=>fetch(base+'/api/account/chat?organization='+org+'&kind=etiquetas',{headers:{Cookie:'__Host-lv_session=test'}});
 assert.equal((await get()).status,409);
 lvStatus=200;const ok=await post({organization:org,url});assert.equal(ok.status,200);assert.doesNotMatch(await ok.text(),/secret-token/);
 assert.deepEqual(saved,{org,root:'https://chatapi.leadvox.com.br/v1',api:'acc-1',tok:'secret-token-123'});
 const r=await get();const txt=await r.text();assert.equal(r.status,200);assert.doesNotMatch(txt,/secret-token/);
 assert.deepEqual(JSON.parse(txt).items,[{id:'3',name:'Quente',color:'#ff0000'}]);
});
test('HTTP requests fail closed in production',async t=>{
 const s=createApp();await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 assert.equal((await fetch('http://127.0.0.1:'+s.address().port+'/api/account/me')).status,426);
});

