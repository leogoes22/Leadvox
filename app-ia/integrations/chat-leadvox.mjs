// Server-only adapter. Never import from public/ or expose credentials to the browser.
const ORIGIN='https://chatapi.leadvox.com.br';
const id = value => {const s=String(value??'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(s))throw new Error('Identificador inválido');return s;};
export class ChatApiError extends Error {
 constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
export function createChatClient({apiId,token,fetchImpl=fetch}) {
 const api=id(apiId);
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw new Error('Credencial inválida');
 async function get(route) {
  let response;
  try{response=await fetchImpl(ORIGIN+'/v1/api/external/'+route,{
   method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(10000)});
  }catch{throw new ChatApiError('CHAT_UNAVAILABLE');}
  if(!response.ok)throw new ChatApiError(response.status===401||response.status===403?'CHAT_UNAUTHORIZED':'CHAT_REQUEST_FAILED',response.status===401||response.status===403?401:502);
  let body;try{body=await response.json();}catch{throw new ChatApiError('CHAT_INVALID_RESPONSE');}
  if(body.success===false||body.error)throw new ChatApiError('CHAT_REQUEST_FAILED');
  return body;
 }
 return Object.freeze({
  users:()=>get('users/'+api),
  tags:()=>get(api+'/tags'),
  pipelineSteps:()=>get(api+'/pipeline-steps'),
  // No mutation or messaging method is enabled until account-scoped auth and live validation.
 });
}
export const capabilities=Object.freeze({
 users:'documented',tags:'documented',pipelineSteps:'documented',
 departments:'unverified',transfer:'unverified',applyContactTag:'unverified',
 opportunityUpdate:'documented-not-enabled',opportunityStatus:'documented-not-enabled'
});
export function validateRule(rule,catalog) {
 const events=['visit_scheduled','lead_qualified','inactivity'];
 if(!events.includes(rule.event))throw new Error('Evento inválido');
 const step=catalog.pipelineSteps.find(s=>String(s.id)===String(rule.pipelineStepId));
 if(!step)throw new Error('Selecione uma etapa da conta conectada');
 if(rule.responsibleId&&!catalog.users.some(u=>String(u.id)===String(rule.responsibleId)))throw new Error('Responsável não pertence à conta conectada');
 if(rule.tagIds?.length&&!rule.tagIds.every(tag=>catalog.tags.some(t=>String(t.id)===String(tag))))throw new Error('Etiqueta não pertence à conta conectada');
 if(rule.queueId)throw new Error('Transferência por departamento ainda não validada');
 if(rule.tagIds?.length)throw new Error('Aplicação de etiquetas ainda não validada');
 return {event:rule.event,pipelineStepId:String(step.id),responsibleId:rule.responsibleId?String(rule.responsibleId):null,pauseAI:rule.pauseAI===true,enabled:false};
}
