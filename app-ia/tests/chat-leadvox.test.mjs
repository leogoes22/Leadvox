import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatClient,validateRule} from '../integrations/chat-leadvox.mjs';
test('read-only client pins host, routes, auth and rejects redirects',async()=>{
 const calls=[];const c=createChatClient({apiId:'test-account',token:'test-secret',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({success:true,data:[]})};}});
 await c.users();await c.tags();await c.pipelineSteps();
 assert.deepEqual(calls.map(c=>c.url),['https://chatapi.leadvox.com.br/v1/api/external/users/test-account','https://chatapi.leadvox.com.br/v1/api/external/test-account/tags','https://chatapi.leadvox.com.br/v1/api/external/test-account/pipeline-steps']);
 for(const {options} of calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-secret');}
 assert.equal(c.sendMessage,undefined);assert.equal(c.updateOpportunity,undefined);
});
test('upstream failures never reflect credentials or raw response',async()=>{
 for(const failure of ['network','unauthorized','body']){
 const c=createChatClient({apiId:'account',token:'test-secret',fetchImpl:async()=>{if(failure==='network')throw Error('test-secret');if(failure==='unauthorized')return {ok:false,status:403};return {ok:true,json:async()=>({success:false,error:'test-secret'})};}});
 await assert.rejects(c.tags(),e=>!e.message.includes('test-secret'));
 }
 assert.throws(()=>createChatClient({apiId:'../other',token:'secret'}));
});
test('rules reject foreign ids and unverified operations and remain disabled',()=>{
 const catalog={pipelineSteps:[{id:3}],users:[{id:7}],tags:[{id:9}]};
 const rule={event:'visit_scheduled',pipelineStepId:3,responsibleId:7,pauseAI:true};
 assert.equal(validateRule(rule,catalog).enabled,false);
 for(const patch of [{pipelineStepId:4},{responsibleId:8},{tagIds:[10]},{queueId:50},{tagIds:[9]},{event:'arbitrary'}])assert.throws(()=>validateRule({...rule,...patch},catalog));
});
