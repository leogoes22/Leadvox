import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatClient,validateRule,parseChatUrl,chatUrlProblem,pickList,normalizeItems} from '../integrations/chat-leadvox.mjs';
test('read-only client pins host, routes, auth and rejects redirects',async()=>{
 const calls=[];const c=createChatClient({apiId:'test-account',token:'test-secret',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({success:true,data:[]})};}});
 await c.users();await c.tags();await c.pipelineSteps();
 const q='?token=test-secret';
 assert.deepEqual(calls.map(c=>c.url),['https://chatapi.leadvox.com.br/v1/api/external/users/test-account'+q,'https://chatapi.leadvox.com.br/v1/api/external/test-account/tags'+q,'https://chatapi.leadvox.com.br/v1/api/external/test-account/pipeline-steps'+q]);
 for(const {options} of calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-secret');}
 assert.equal(c.sendMessage,undefined);assert.equal(c.updateOpportunity,undefined);
});
test('upstream failures never reflect credentials or raw response',async()=>{
 for(const failure of ['network','unauthorized','body']){
 const c=createChatClient({apiId:'account',token:'test-secret',fetchImpl:async()=>{if(failure==='network')throw Error('test-secret');if(failure==='unauthorized')return {ok:false,status:403};return {ok:true,json:async()=>({success:false,error:'test-secret'})};}});
 await assert.rejects(c.tags(),e=>!e.message.includes('test-secret'));
 }
 assert.throws(()=>createChatClient({apiId:'../other',token:'secret'}));
 assert.throws(()=>createChatClient({root:'https://evil.example/v1',apiId:'a',token:'secret'}));
});
test('LeadVox API URL is parsed only for the LeadVox host',()=>{
 assert.deepEqual(parseChatUrl(' https://chatapi.leadvox.com.br/v1/api/external/abc-123/?token=eyJhbGciOi.x.y '),{root:'https://chatapi.leadvox.com.br/v1',apiId:'abc-123',token:'eyJhbGciOi.x.y'});
 assert.deepEqual(parseChatUrl('https://chatapi.leadvox.com.br/v1/api/external/abc-123','Bearer eyJ0b2tlbi1zZXBhcmFkbw'),{root:'https://chatapi.leadvox.com.br/v1',apiId:'abc-123',token:'eyJ0b2tlbi1zZXBhcmFkbw'});
 assert.equal(parseChatUrl('https://chatapi.leadvox.com.br/v1/api/external/abc-123?token=1234567890abc').apiId,'abc-123');
 assert.deepEqual(parseChatUrl('https://chat2api.leadvox.com.br/v1/api/external/5ac8e8dc-40d6/?token=abcdefghij123'),{root:'https://chat2api.leadvox.com.br/v1',apiId:'5ac8e8dc-40d6',token:'abcdefghij123'});
 assert.ok(createChatClient({root:'https://chat2api.leadvox.com.br/v1',apiId:'a',token:'secret-token'}));
 assert.equal(chatUrlProblem('https://chatXapi.leadvox.com.br.evil.com/v1/api/external/abc/?token=1234567890'),'host');
 assert.equal(chatUrlProblem('https://chatapi.leadvox.com.br/v1/api/external/abc'),'token');
 assert.equal(chatUrlProblem('https://chatapi.leadvox.com.br/v1/'),'path');
 assert.equal(chatUrlProblem('https://outro.com/v1/api/external/abc/?token=1234567890'),'host');
 assert.equal(chatUrlProblem('https://chatapi.leadvox.com.br/v1/api/external/abc','1234567890abc'),null);
 for(const bad of ['https://evil.example/v1/api/external/abc/?token=1234567890','https://chatapi.leadvox.com.br/v1/api/external/../x/?token=1234567890','https://chatapi.leadvox.com.br/v1/api/external/abc/?token=curto',''])assert.throws(()=>parseChatUrl(bad));
});
test('departments try the candidate routes and lists are reduced to id, name and color',async()=>{
 const tried=[];const c=createChatClient({apiId:'acc',token:'test-secret',fetchImpl:async url=>{tried.push(url.split('?')[0]);return url.includes('/queue/acc')?{ok:true,json:async()=>({queues:[{id:5,queue:'Comercial',color:'#2be87b',token:'x'}]})}:{ok:false,status:404};}});
 assert.deepEqual(normalizeItems(await c.departments()),[{id:'5',name:'Comercial',color:'#2be87b'}]);
 assert.equal(tried.at(-1),'https://chatapi.leadvox.com.br/v1/api/external/queue/acc');
 assert.deepEqual(pickList({data:{tags:[{id:1}]}}),[{id:1}]);
 assert.deepEqual(normalizeItems([{id:2,nome:'Quente',cor:'javascript:1'}]),[{id:'2',name:'Quente',color:null}]);
 assert.deepEqual(normalizeItems([{id:4,tag:'Financiamento',color:'#ffc861',tenantId:17}]),[{id:'4',name:'Financiamento',color:'#ffc861'}]);
 assert.deepEqual(normalizeItems([{id:5,token:'segredo',createdAt:'2026-01-01',etiqueta:'Troca'}]),[{id:'5',name:'Troca',color:null}]);
});
test('rules reject foreign ids and unverified operations and remain disabled',()=>{
 const catalog={pipelineSteps:[{id:3}],users:[{id:7}],tags:[{id:9}]};
 const rule={event:'visit_scheduled',pipelineStepId:3,responsibleId:7,pauseAI:true};
 assert.equal(validateRule(rule,catalog).enabled,false);
 for(const patch of [{pipelineStepId:4},{responsibleId:8},{tagIds:[10]},{queueId:50},{tagIds:[9]},{event:'arbitrary'}])assert.throws(()=>validateRule({...rule,...patch},catalog));
});
