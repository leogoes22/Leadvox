// Apply to a fresh export from the NEW n8n only. No changes to old SDR workflows.
// Requires one OpenAI credential whose API Key is an expression (see OPENAI.md).
export const PROXY='https://dcucemuewipfnneqpgxk.supabase.co/functions/v1/openai-proxy/v1';
export function comOpenAIPropria(source,{credentialId,homologacao=true}={}){
 if(!credentialId)throw Error('Informe o id da credencial OpenAI por empresa.');
 const w=structuredClone(source);
 if(!w.nodes?.some(n=>n.name==='Agente')||!w.nodes.some(n=>n.credentials?.openAiApi))throw Error('Não é um fluxo de atendimento/simulador do Motor IA.');
 if(w.nodes.some(n=>n.name==='OpenAI da Empresa'))throw Error('Este fluxo já foi convertido.');
 const agente=w.nodes.find(n=>n.name==='Agente');
 const supa=w.nodes.find(n=>n.credentials?.supabaseApi)?.credentials.supabaseApi;
 if(!supa)throw Error('Sem credencial Supabase do motor.');
 const grant={id:'lv-openai-grant',name:'OpenAI da Empresa',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,
  position:[agente.position[0]+80,agente.position[1]-200],parameters:{
   method:'POST',url:'https://dcucemuewipfnneqpgxk.supabase.co/rest/v1/rpc/iag_openai_grant',authentication:'predefinedCredentialType',nodeCredentialType:'supabaseApi',
   sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({ p_conta: $json.conta, p_agente: $json.A.chave, p_teste: '+(homologacao?'true':'!!$json.teste')+' }) }}',options:{timeout:12000}},
  credentials:{supabaseApi:supa}};
 const next={id:'lv-openai-continue',name:'Continuar com OpenAI',type:'n8n-nodes-base.code',typeVersion:2,
  position:[agente.position[0]+220,agente.position[1]],parameters:{jsCode:
   "const d=$input.first().json;\nif(d.ok!==true||!/^lvai_[0-9a-f]{64}$/.test(String(d.token||'')))throw new Error('Conecte a chave OpenAI da empresa em Credenciais de API. Nenhuma chave de reserva foi usada.');\nreturn $('Agente').all();"}};
 w.connections[next.name]=w.connections.Agente;
 w.connections.Agente={main:[[{node:grant.name,type:'main',index:0}]]};
 w.connections[grant.name]={main:[[{node:next.name,type:'main',index:0}]]};
 w.nodes.push(grant,next);
 for(const n of w.nodes){
  if(n.credentials?.openAiApi){
   n.credentials.openAiApi={id:credentialId,name:'OpenAI por empresa (proxy)'};
   if(n.type==='n8n-nodes-base.httpRequest'){
    if(!n.parameters.url.startsWith('https://api.openai.com/v1/'))throw Error('Destino OpenAI inesperado: '+n.name);
    n.parameters.url=n.parameters.url.replace('https://api.openai.com/v1',PROXY);
   }
   if(n.type==='@n8n/n8n-nodes-langchain.lmChatOpenAi')n.parameters.options={...n.parameters.options,baseURL:PROXY};
  }
 }
 // Opaque grant is still a credential: don't persist executions or manual runs.
 w.settings={...w.settings,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,saveExecutionProgress:false};
 delete w.pinData;delete w.activeVersionId;delete w.versionId;delete w.id;delete w.createdAt;delete w.updatedAt;
 w.active=false;
 if(homologacao){
  w.name='HML · OpenAI por empresa · '+source.name;
  for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.webhook')){
   n.parameters.path+='-openai-hml';delete n.webhookId;
  }
  // A cópia do atendimento não pode disparar envios, nem transferências, por engano.
  delete w.settings.errorWorkflow;
  const sendNames=['Enviar LeadVox','Enviar Resposta Fixa','Enviar Nota Interna','Chamar Próximo Agente','Enviar Aviso Gerente','AÇÕES Enviar','ETQ Criar Tags','ETQ Criar Origem','ETQ PUT Status','ETQ PUT Origem','ETQ Limpar Contato','ETQ Gravar no Contato'];
  for(const n of w.nodes)if(sendNames.includes(n.name)){
   n.type='n8n-nodes-base.code';n.typeVersion=2;delete n.credentials;
   n.parameters={jsCode:"return $input.all().map(i=>({json:{...i.json,homologacao:true,envioBloqueado:true}}));"};
  }
 }
 return w;
}
