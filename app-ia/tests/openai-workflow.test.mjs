import test from 'node:test';
import assert from 'node:assert/strict';
import {comOpenAIPropria,PROXY} from '../n8n/openai-por-empresa.mjs';
test('workflow copy uses tenant grant for every OpenAI node, saves no secrets and preserves old source',()=>{
 const source={id:'old',name:'Atendimento',active:true,pinData:{secret:'not-kept'},nodes:[
  {name:'Agente',position:[0,0],type:'n8n-nodes-base.code'},
  {name:'Supabase Rota',credentials:{supabaseApi:{id:'supa'}}},
  {name:'Webhook Motor',type:'n8n-nodes-base.webhook',parameters:{path:'iag-motor-v9'}},
  {name:'Modelo OpenAI',type:'@n8n/n8n-nodes-langchain.lmChatOpenAi',credentials:{openAiApi:{id:'global'}},parameters:{options:{maxTokens:900}}},
  {name:'Voz OpenAI',type:'n8n-nodes-base.httpRequest',credentials:{openAiApi:{id:'global'}},parameters:{url:'https://api.openai.com/v1/audio/speech'}},
  {name:'Enviar LeadVox',type:'n8n-nodes-base.httpRequest',parameters:{url:'https://chatapi.leadvox.com.br'}}
 ],connections:{Agente:{main:[[{node:'Classificar Mídia',type:'main',index:0}]]}},settings:{saveDataSuccessExecution:'all'}};
 source.settings.errorWorkflow='alerts';
 for(const name of ['Enviar Resposta Fixa','ETQ Criar Origem','ETQ PUT Status','ETQ PUT Origem','ETQ Limpar Contato','ETQ Gravar no Contato'])source.nodes.push({name,type:'n8n-nodes-base.httpRequest',parameters:{method:'POST'}});
 const w=comOpenAIPropria(source,{credentialId:'tenant'});
 assert.equal(w.settings.errorWorkflow,undefined);
 for(const n of w.nodes.filter(n=>n.name.startsWith('ETQ ')||n.name==='Enviar Resposta Fixa'))assert.equal(n.type,'n8n-nodes-base.code');
 assert.equal(source.active,true);assert.equal(source.nodes[3].credentials.openAiApi.id,'global');
 assert.equal(w.active,false);assert.equal(w.pinData,undefined);assert.equal(w.id,undefined);
 assert.equal(w.settings.saveDataErrorExecution,'none');assert.equal(w.settings.saveManualExecutions,false);
 assert.equal(w.nodes[2].parameters.path,'iag-motor-v9-openai-hml');
 assert.equal(w.nodes[3].parameters.options.baseURL,PROXY);assert.equal(w.nodes[4].parameters.url,PROXY+'/audio/speech');
 assert.equal(w.nodes[5].type,'n8n-nodes-base.code');assert.deepEqual(w.connections['Continuar com OpenAI'],source.connections.Agente);
 assert.equal(w.connections.Agente.main[0][0].node,'OpenAI da Empresa');
 assert.throws(()=>comOpenAIPropria(w,{credentialId:'tenant'}),/convertido/);
 assert.throws(()=>comOpenAIPropria(source),/credencial/);
});
