// Server-only adapter. Never import from public/ or expose credentials to the browser.
const HOST='https://chatapi.leadvox.com.br';
const id = value => {const s=String(value??'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(s))throw new Error('Identificador inválido');return s;};
export class ChatApiError extends Error {
 constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
// The LeadVox "external API" URL carries the account id and the token:
// https://chatapi.leadvox.com.br/v1/api/external/<apiId>/?token=<token>
export function parseChatUrl(value){
 const m=String(value??'').trim().match(/^(https:\/\/chatapi\.leadvox\.com\.br\/v\d{1,2})\/api\/external\/([A-Za-z0-9_-]{1,100})\/?\?(?:[^#]*&)?token=([^&#\s]+)/);
 if(!m)throw new Error('URL inválida');
 let token=m[3];try{token=decodeURIComponent(token);}catch{}
 if(token.length<10||token.length>4000||/[\r\n]/.test(token))throw new Error('URL inválida');
 return {root:m[1],apiId:m[2],token};
}
export function createChatClient({root=HOST+'/v1',apiId,token,fetchImpl=fetch}) {
 if(!/^https:\/\/chatapi\.leadvox\.com\.br\/v\d{1,2}$/.test(root))throw new Error('Endereço inválido');
 const api=id(apiId);
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw new Error('Credencial inválida');
 // Same call shape as the SDR Motor in n8n: token in the query string and as Bearer.
 async function get(path) {
  let response;
  try{response=await fetchImpl(root+path+'?token='+encodeURIComponent(token),{
   method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(10000)});
  }catch{throw new ChatApiError('CHAT_UNAVAILABLE');}
  if(!response.ok)throw new ChatApiError(response.status===401||response.status===403?'CHAT_UNAUTHORIZED':'CHAT_REQUEST_FAILED',response.status===401||response.status===403?401:502);
  let body;try{body=await response.json();}catch{throw new ChatApiError('CHAT_INVALID_RESPONSE');}
  if(body?.success===false||body?.error)throw new ChatApiError('CHAT_REQUEST_FAILED');
  return body;
 }
 const ext=p=>'/api/external/'+p;
 return Object.freeze({
  users:()=>get(ext('users/'+api)),
  tags:()=>get(ext(api+'/tags')),
  pipelineSteps:()=>get(ext(api+'/pipeline-steps')),
  // The departments (queues) route is not documented; like the SDR Motor, try the known candidates and keep the first list.
  async departments(){
   for(const path of [ext(api+'/queues'),ext(api+'/queue'),ext('queue/'+api),ext('departments/'+api),ext(api+'/departments'),ext('whatsapp-queues/'+api),'/queue','/queues']){
    try{const list=pickList(await get(path));if(list)return list;}catch(e){if(e.code==='CHAT_UNAUTHORIZED'&&path.startsWith('/api'))throw e;}
   }
   throw new ChatApiError('CHAT_DEPARTMENTS_UNAVAILABLE');
  },
  // No mutation or messaging method is enabled until account-scoped auth and live validation.
 });
}
export function pickList(body){
 if(Array.isArray(body))return body;
 if(!body||typeof body!=='object')return null;
 for(const k of ['data','tags','users','queues','queue','steps','pipelineSteps','pipeline_steps','departments','result','results','items']){
  if(Array.isArray(body[k]))return body[k];
  if(body[k]&&typeof body[k]==='object'){const inner=pickList(body[k]);if(inner)return inner;}
 }
 return Object.values(body).find(Array.isArray)||null;
}
// Only id, name and color reach the browser.
export function normalizeItems(list){
 return (list||[]).slice(0,500).map(x=>({
  id:String(x?.id??x?.value??x?.queueId??''),
  name:String(x?.name??x?.nome??x?.title??x?.label??x?.queue??x?.description??'').slice(0,120),
  color:/^#[0-9a-f]{3,8}$/i.test(x?.color??x?.cor??'')?(x.color??x.cor):null
 })).filter(x=>x.id||x.name);
}
export const capabilities=Object.freeze({
 users:'documented',tags:'documented',pipelineSteps:'documented',
 departments:'candidates',transfer:'unverified',applyContactTag:'unverified',
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
