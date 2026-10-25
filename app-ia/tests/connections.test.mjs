import test from 'node:test';
import assert from 'node:assert/strict';
import {testAutoCerto,testRevendaMais,testAsaas,safeFeedUrl} from '../integrations/connections.mjs';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,headers:{get:()=>null},json:async()=>d});

test('AutoCerto login uses the OAuth password grant on the AutoCerto host only',async()=>{
 let call;await testAutoCerto({usuario:'loja@x.com',senha:'s3nha',fetchImpl:async(u,i)=>{call={u,i};return ok({access_token:'t'});}});
 assert.equal(call.u,'https://integracao.autocerto.com/oauth/token');assert.equal(call.i.redirect,'error');
 assert.deepEqual(Object.fromEntries(new URLSearchParams(call.i.body)),{grant_type:'password',username:'loja@x.com',password:'s3nha'});
 await assert.rejects(testAutoCerto({usuario:'a',senha:'b',fetchImpl:async()=>ok({error:'invalid_grant'},400)}),/não aceitou/);
});
test('Revenda Mais feed must be a public https URL and return a vehicle list',async()=>{
 for(const bad of ['http://feed.com/a.json','https://127.0.0.1/a.json','https://localhost/a.json','https://x.sslip.io/a','https://[::1]/a','https://user:pw@feed.com/a','nada'])assert.throws(()=>safeFeedUrl(bad),bad);
 assert.deepEqual(await testRevendaMais({feedUrl:'https://app.revendamais.com.br/loja.json',fetchImpl:async()=>ok({veiculos:[{},{},{}]})}),{ok:true,count:3});
 await assert.rejects(testRevendaMais({feedUrl:'https://app.revendamais.com.br/loja.json',fetchImpl:async()=>ok({erro:'x'})}),/lista/);
});
test('Asaas key is checked in the chosen environment',async()=>{
 const urls=[];const f=async u=>{urls.push(u);return ok({data:[]});};
 await testAsaas({environment:'sandbox',apiKey:'$aact_YTU5YTE0M2M2N2I4MTliNzk0',fetchImpl:f});
 await testAsaas({environment:'production',apiKey:'$aact_YTU5YTE0M2M2N2I4MTliNzk0',fetchImpl:f});
 assert.deepEqual(urls,['https://api-sandbox.asaas.com/v3/customers?limit=1','https://api.asaas.com/v3/customers?limit=1']);
 await assert.rejects(testAsaas({environment:'sandbox',apiKey:'abc',fetchImpl:f}),/aact_/);
 await assert.rejects(testAsaas({environment:'outro',apiKey:'$aact_YTU5YTE0M2M2N2I4MTliNzk0',fetchImpl:f}),/ambiente/);
});
test('connections endpoint tests before saving and never returns the secret',async t=>{
 const org='22222222-2222-4222-8222-222222222222';let saved=null,acOk=false;
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('autocerto.com/oauth/token'))return acOk?ok({access_token:'x'}):ok({},400);
  if(u.includes('lv_set_integration')){saved=JSON.parse(init.body);return ok(null,204);}
  if(u.includes('lv_integration_secret'))return ok([]);
  if(u.includes('lv_integrations'))return ok(saved?[{provider:saved.prov,settings:saved.conf,has_secret:true,updated_at:'2026-10-25'}]:[]);
  return ok([]);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const post=b=>fetch(base+'/api/account/integrations',{method:'POST',headers:h,body:JSON.stringify({organization:org,...b})});
 assert.equal((await post({provider:'estoque',source:'autocerto',unidade:'4425',usuario:'loja@x.com',senha:'errada'})).status,400);assert.equal(saved,null);
 assert.equal((await post({provider:'estoque',source:'autocerto',unidade:'abc',usuario:'loja@x.com',senha:'x'})).status,400);
 acOk=true;const r=await post({provider:'estoque',source:'autocerto',unidade:'4425',usuario:'loja@x.com',senha:'certa-123'});
 assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/certa-123/);
 assert.equal(saved.sec,'certa-123');assert.deepEqual({...saved.conf,testedAt:0},{source:'autocerto',unidade:'4425',usuario:'loja@x.com',testedAt:0});
 const g=await fetch(base+'/api/account/integrations?organization='+org,{headers:h});const txt=await g.text();
 assert.doesNotMatch(txt,/certa-123/);assert.equal(JSON.parse(txt).estoque.unidade,'4425');
});
