import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxy,usageFor} from '../supabase/functions/openai-proxy/proxy.mjs';
import {testOpenAI} from '../integrations/connections.mjs';
import {createApp} from '../server.mjs';
const token='lvai_'+'a'.repeat(64),key='sk-proj-'+'x'.repeat(30);
const req=(body,op='chat/completions',auth=token)=>new Request('https://example.com/functions/v1/openai-proxy/v1/'+op,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
const completion={model:'gpt-4.1-mini',messages:[{role:'user',content:'teste'}]};
test('key validation only reads OpenAI models and never relays provider errors',async()=>{
 let call;await testOpenAI({apiKey:key,fetchImpl:async(u,i)=>{call={u,i};return new Response('{}');}});
 assert.equal(call.u,'https://api.openai.com/v1/models');assert.equal(call.i.redirect,'error');
 await assert.rejects(testOpenAI({apiKey:key,fetchImpl:async()=>new Response(key,{status:401})}),e=>!e.message.includes(key));
});
test('pricing separates cached input, unknown speech cost and absent usage',()=>{
 const u=usageFor('gpt-4.1-mini',{usage:{prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:600}}},200);
 assert.equal(u.usd,0.00038);assert.equal(u.cached,600);
 assert.equal(usageFor('gpt-4o-mini-tts',null,200,100).usd,null);
 assert.equal(usageFor('gpt-4.1',{},200).input,null);
 assert.equal(usageFor('whisper-1',{duration:60},200).usd,0.006);
});
test('proxy fails closed without tenant grant, rejects foreign paths and browser origins',async()=>{
 let calls=0;const p=createProxy({rpc:async()=>null,fetchImpl:async()=>{calls++;throw Error('must not call');}});
 assert.equal((await p(req(completion))).status,401);
 assert.equal((await p(req(completion,'chat/completions','sk-global'))).status,401);
 assert.equal((await p(req(completion,'models'))).status,404);
 const r=req(completion);r.headers.set('Origin','https://attacker.com');assert.equal((await p(r)).status,403);
 assert.equal(calls,0);
});
test('every request uses reserved company key, captures usage and has no fallback',async()=>{
 const finishes=[];let sent;
 const p=createProxy({rpc:async(name,b)=>name.endsWith('reserve')?{id:'id',key}:(finishes.push(b),null),fetchImpl:async(u,i)=>{
  sent={u,i};return Response.json({choices:[{message:{content:'Olá'}}],usage:{prompt_tokens:10,completion_tokens:5}});
 }});
 const r=await p(req({...completion,max_tokens:10000}));assert.equal(r.status,200);assert.equal(sent.i.headers.Authorization,'Bearer '+key);
 assert.equal(JSON.parse(sent.i.body).max_tokens,2000);assert.equal(finishes.length,1);assert.equal(finishes[0].p_data.input,10);
 assert.ok(!JSON.stringify(finishes).includes(key));
 const fail=createProxy({rpc:async(name)=>name.endsWith('reserve')?{id:'id',key}:null,fetchImpl:async()=>new Response(key,{status:401})});
 const f=await fail(req(completion));assert.equal(f.status,401);assert.ok(!(await f.text()).includes(key));
});
test('stream passes chunks/tool calls unchanged and accounts usage from final chunk',async()=>{
 let finish,task;
 const s='data: '+JSON.stringify({choices:[{delta:{tool_calls:[{id:'tool1'}]}}]})+'\n\ndata: '+JSON.stringify({usage:{prompt_tokens:30,completion_tokens:10}})+'\n\ndata: [DONE]\n\n';
 const p=createProxy({rpc:async(name,b)=>name.endsWith('reserve')?{id:'id',key}:(finish=b,null),fetchImpl:async()=>new Response(s,{headers:{'Content-Type':'text/event-stream'}}),waitUntil:p=>{task=p;}});
 const r=await p(req({...completion,stream:true}));assert.equal(await r.text(),s);await task;assert.equal(finish.p_data.input,30);
});
test('transcription keeps text and measures seconds; speech never invents tokens',async()=>{
 const ends=[];const rpc=async(name,b)=>name.endsWith('reserve')?{id:'id',key}:(ends.push(b.p_data),null);
 const f=new FormData();f.set('model','whisper-1');f.set('file',new Blob(['audio']),'audio.ogg');
 const p=createProxy({rpc,fetchImpl:async(u,i)=>{assert.equal(i.body.get('response_format'),'verbose_json');return Response.json({text:'teste',duration:8});}});
 const r=await p(new Request('https://x/functions/v1/openai-proxy/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+token},body:f}));
 assert.equal((await r.json()).text,'teste');assert.equal(ends[0].seconds,8);
 const speech=createProxy({rpc,fetchImpl:async()=>new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/ogg'}})});
 assert.equal((await speech(req({model:'gpt-4o-mini-tts',input:'abc'},'audio/speech'))).status,200);
 assert.equal(ends[1].characters,3);assert.equal(ends[1].input,null);
});
test('account OpenAI routes require session, save only validated key and never return it',async t=>{
 const org='22222222-2222-4222-8222-222222222222';let saved=null,valid=false;
 const server=createApp({allowLocal:true,fetchImpl:async(u,i)=>{
  if(u.endsWith('/auth/v1/user'))return Response.json({id:'u',email_confirmed_at:'2026-01-01'});
  if(u==='https://api.openai.com/v1/models')return Response.json({}, {status:valid?200:401});
  if(u.endsWith('/lv_set_openai')){saved=JSON.parse(i.body);return Response.json(null);}
  if(u.endsWith('/lv_openai_status'))return Response.json({connected:!!saved,suffix:'xxxx'});
  if(u.endsWith('/lv_openai_usage'))return Response.json({rows:[]});
  throw Error('Unexpected request');
 }});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,Cookie:'__Host-lv_session=test'};
 assert.equal((await fetch(base+'/api/account/openai?organization='+org)).status,401);
 const post=()=>fetch(base+'/api/account/openai',{method:'POST',headers,body:JSON.stringify({organization:org,apiKey:key})});
 assert.equal((await post()).status,400);assert.equal(saved,null);valid=true;
 const r=await post();assert.equal(r.status,200);assert.ok(!(await r.text()).includes(key));assert.equal(saved.sec,key);
 assert.equal((await fetch(base+'/api/account/openai-usage?organization='+org+'&ini=2026-01-01&fim=2027-02-01',{headers})).status,400);
});
