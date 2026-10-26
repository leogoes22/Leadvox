// Server-only adapter. Never import from public/ or expose credentials to the browser.
const HOST='https://chatapi.leadvox.com.br';
const ROOT=/^https:\/\/chat[0-9]{0,2}api\.leadvox\.com\.br\/v\d{1,2}$/;
const id = value => {const s=String(value??'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(s))throw new Error('Identificador inválido');return s;};
export class ChatApiError extends Error {
 constructor(code,status=502,http=null){super(code);this.code=code;this.status=status;this.http=http;}
}
// The LeadVox "external API" URL carries the account id and the token:
// https://chatapi.leadvox.com.br/v1/api/external/<apiId>/?token=<token> (each server has its own host: chatapi, chat2api…)
// Some LeadVox screens show the URL and the token apart: a separate token is accepted too.
export function chatUrlProblem(value,separateToken=''){
 const s=String(value??'').trim();
 if(!/^https:\/\/chat[0-9]{0,2}api\.leadvox\.com\.br\//.test(s))return 'host';
 if(!/\/api\/external\/[A-Za-z0-9_-]{1,100}/.test(s))return 'path';
 if(!/[?&]token=[^&#\s]{10,}/.test(s)&&String(separateToken).trim().length<10)return 'token';
 return null;
}
export function parseChatUrl(value,separateToken=''){
 let s=String(value??'').trim();const t=String(separateToken??'').trim().replace(/^Bearer\s+/i,'');
 if(t&&!/[?&]token=/.test(s))s=s.replace(/[?#].*$/,'').replace(/\/?$/,'/')+'?token='+encodeURIComponent(t);
 const m=s.match(/^(https:\/\/chat[0-9]{0,2}api\.leadvox\.com\.br\/v\d{1,2})\/api\/external\/([A-Za-z0-9_-]{1,100})(?:\/[^?#]*)?\?(?:[^#]*&)?token=([^&#\s]+)/);
 if(!m)throw new Error('URL inválida');
 let token=m[3];try{token=decodeURIComponent(token);}catch{}
 if(token.length<10||token.length>4000||/[\r\n]/.test(token))throw new Error('URL inválida');
 return {root:m[1],apiId:m[2],token};
}
export function createChatClient({root=HOST+'/v1',apiId,token,fetchImpl=fetch}) {
 if(!ROOT.test(root))throw new Error('Endereço inválido');
 const api=id(apiId);
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw new Error('Credencial inválida');
 // Same call shape as the SDR Motor in n8n: token in the query string and as Bearer.
 // raiz=true: rotas que a tela da LeadVox usa, fora do /v1 (ex.: /lead-origin/).
 async function get(path,raiz=false) {
  let response;
  try{response=await fetchImpl((raiz?root.replace(/\/v\d{1,2}$/,''):root)+path+(path.includes('?')?'&':'?')+'token='+encodeURIComponent(token),{
   method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(10000)});
  }catch{throw new ChatApiError('CHAT_UNAVAILABLE');}
  if(!response.ok)throw new ChatApiError(response.status===401||response.status===403?'CHAT_UNAUTHORIZED':'CHAT_REQUEST_FAILED',response.status===401||response.status===403?401:502,response.status);
  let body;try{body=await response.json();}catch{throw new ChatApiError('CHAT_INVALID_RESPONSE');}
  if(body?.success===false||body?.error)throw new ChatApiError('CHAT_REQUEST_FAILED');
  return body;
 }
 const ext=p=>'/api/external/'+p;
 // Rotas não documentadas: fica com a primeira lista que vier. Token recusado na API externa é erro de credencial.
 async function firstList(paths,code){
  for(const p of paths){const [path,raiz]=Array.isArray(p)?p:[p,false];
   try{const list=pickList(await get(path,raiz));if(list)return list;}catch(e){if(e.code==='CHAT_UNAUTHORIZED'&&path.startsWith('/api'))throw e;}
  }
  throw new ChatApiError(code);
 }
 return Object.freeze({
  users:()=>get(ext('users/'+api)),
  tags:()=>get(ext(api+'/tags')),
  pipelineSteps:()=>get(ext(api+'/pipeline-steps')),
  // The departments (queues) route is not documented; like the SDR Motor, try the known candidates and keep the first list.
  departments:()=>firstList([ext(api+'/queues'),ext(api+'/queue'),ext('queue/'+api),ext('departments/'+api),ext(api+'/departments'),ext('whatsapp-queues/'+api),'/queue','/queues',['/queue/',true],['/queues/',true]],'CHAT_DEPARTMENTS_UNAVAILABLE'),
  // Origem do lead: também sem rota documentada; tenta as candidatas da API externa e as da tela.
  leadOrigins:()=>firstList([ext(api+'/lead-origins'),ext(api+'/lead-origin'),ext(api+'/origins'),ext('lead-origins/'+api),ext('lead-origin/'+api),'/lead-origin','/lead-origins',['/lead-origin/',true],['/lead-origins/',true]],'CHAT_ORIGINS_UNAVAILABLE'),
  // Funis, como a tela Pipeline do chat (rotas fora do /v1): os funis com as etapas de cada um,
  // a abertura do funil {columns:{[etapa]:{opportunities,hasMore,count}},totals:{[etapa]:{count,totalValue}}}
  // e as páginas seguintes de uma etapa {opportunities,hasMore,count}.
  pipelines:()=>get('/pipelines',true),
  pipelineStartup:(pipelineId,stepIds,status)=>get('/opportunity/pipeline-startup?pipelineId='+id(pipelineId)
   +stepIds.map(s=>'&pipelineStepIds%5B%5D='+id(s)).join('')+status.map(s=>'&status%5B%5D='+id(s)).join(''),true),
  stepOpportunities:(pipelineId,stepId,status,page)=>get('/opportunity?pipelineId='+id(pipelineId)+'&pipelineStepId='+id(stepId)
   +'&pageNumber='+Number(page)+status.map(s=>'&status%5B%5D='+id(s)).join(''),true),
  // API externa: lista paginada {data,count,hasMore}, sem funil. Lê até 10 páginas e para se a página vier repetida (rota que ignora a paginação).
  opportunities:async()=>{
   const todas=[],vistos=new Set();let total=0,mais=false;
   for(let p=1;p<=10;p++){
    const b=await get(ext(api+'/opportunities')+(p>1?'?pageNumber='+p:''));
    const novas=(pickList(b)||[]).filter(o=>o&&!vistos.has(String(o.id)));novas.forEach(o=>vistos.add(String(o.id)));todas.push(...novas);
    total=Number(b?.count)||total;mais=b?.hasMore===true;
    if(!mais||!novas.length)break;
   }
   return {list:todas,count:Math.max(total,todas.length),hasMore:mais};
  },
  // No mutation or messaging method is enabled until account-scoped auth and live validation.
 });
}
export function pickList(body){
 if(Array.isArray(body))return body;
 if(!body||typeof body!=='object')return null;
 for(const k of ['data','tags','users','queues','queue','steps','pipelineSteps','pipeline_steps','departments','leadOrigins','origins','result','results','items']){
  if(Array.isArray(body[k]))return body[k];
  if(body[k]&&typeof body[k]==='object'){const inner=pickList(body[k]);if(inner)return inner;}
 }
 return Object.values(body).find(Array.isArray)||null;
}
// Last resort for unknown shapes: the first short text field that is not an id, color, date or token.
const firstText=x=>Object.entries(x&&typeof x==='object'?x:{}).find(([k,v])=>typeof v==='string'&&v.trim()&&v.length<=120&&!/id$|color|cor$|token|key|secret|url|date|_at$|At$|status|type|email|phone|number/i.test(k))?.[1]??'';
// Only id, name and color reach the browser.
export function normalizeItems(list){
 return (list||[]).slice(0,500).map(x=>({
  id:String(x?.id??x?.value??x?.queueId??''),
  name:String(x?.name??x?.nome??x?.tag??x?.origin??x?.tagName??x?.title??x?.label??x?.queue??x?.text??x?.description??firstText(x)).slice(0,120),
  color:/^#[0-9a-f]{3,8}$/i.test(x?.color??x?.cor??'')?(x.color??x.cor):null
 })).filter(x=>x.id||x.name);
}
// Monta a tela do funil como a tela Pipeline do chat (vários funis, etapas na ordem, totais da LeadVox).
// Se a LeadVox recusar essas rotas, usa a API externa: um funil só, com as etapas da conta.
export async function lerFunil(c,{funil='',status='open'}={}){
 const st=status==='all'?['open','won','lost']:[status];
 try{
  const funis=(pickList(await c.pipelines())||[]).filter(f=>f&&f.id!=null&&Array.isArray(f.steps));
  if(!funis.length)throw new ChatApiError('CHAT_NO_PIPELINES');
  const f=funis.find(x=>String(x.id)===String(funil))||funis.find(x=>x.isDefault)||funis[0];
  const etapas=[...f.steps].sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  const todas=new Map(),totais={};let incompleto=false;
  const junta=l=>(Array.isArray(l)?l:[]).forEach(o=>{if(o&&o.id!=null&&!todas.has(String(o.id)))todas.set(String(o.id),o);});
  // em aberto: a abertura traz a primeira página de cada etapa e os totais; ganhas/perdidas vêm etapa por etapa
  const abertura=status==='open'?await c.pipelineStartup(f.id,etapas.map(e=>e.id),st):null;
  await Promise.all(etapas.map(async e=>{
   const k=String(e.id),col=abertura?.columns?.[k],tot=abertura?.totals?.[k];
   if(tot)totais[k]={count:Number(tot.count)||0,valor:Number(tot.totalValue)||0};
   let mais=true,pag=1;
   if(col){junta(col.opportunities);mais=col.hasMore===true;pag=2;}
   for(;mais&&pag<=5;pag++){const b=await c.stepOpportunities(f.id,k,st,pag),antes=todas.size;junta(b?.opportunities??pickList(b));mais=b?.hasMore===true&&todas.size>antes;}
   if(mais)incompleto=true;
  }));
  return {funis:funis.map(x=>({id:x.id,name:x.name,color:x.color})),funil:String(f.id),etapas,lista:[...todas.values()],totais,incompleto};
 }catch{
  const [etapas,opp]=await Promise.all([c.pipelineSteps().then(pickList),c.opportunities()]);
  return {funis:[],funil:'',etapas,lista:opp.list,totais:{},incompleto:opp.hasMore};
 }
}
// Oportunidade para a tela do funil: só o que o cartão mostra (sem e-mail, endereço nem dados internos do contato).
export function normalizeOpportunities(list){
 const txt=(v,n)=>String(v??'').slice(0,n),data=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'')?String(v):'';
 return (list||[]).slice(0,1000).map(o=>({
  id:txt(o?.id,40),nome:txt(o?.name,120),contato:txt(o?.contact?.name,80),numero:txt(o?.contact?.number,20).replace(/\D/g,''),
  foto:/^https:\/\/[^\s"'<>]+$/.test(o?.contact?.profilePicUrl||'')?txt(o.contact.profilePicUrl,1000):'',
  etapaId:txt(o?.pipelineStepId,40),valor:Number(o?.value)||0,status:['open','won','lost'].includes(o?.status)?o.status:'open',
  responsavel:txt(o?.responsible?.name,80),previsao:data(o?.expectedCloseDate).slice(0,10),atualizado:data(o?.updatedAt).slice(0,19)
 })).filter(o=>o.id);
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
