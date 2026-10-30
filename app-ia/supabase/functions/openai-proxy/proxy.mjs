// No provider key or customer content is logged, returned by management routes, or stored in usage.
const PRICING='openai-standard-2026-10-30';
const RATES={'gpt-4.1-mini':[0.4,0.1,1.6],'gpt-4.1':[2,0.5,8],'gpt-4o-mini':[0.15,0.075,0.6]};
const n=x=>Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
export function usageFor(model,data,status,characters=null){
 const u=data?.usage, input=u?n(u.prompt_tokens):null, output=u?n(u.completion_tokens):null;
 const cached=input===null?null:Math.min(input,n(u.prompt_tokens_details?.cached_tokens)??0);
 const seconds=n(data?.duration),rate=RATES[model];
 let usd=null;
 if(status>=200&&status<300){
  if(rate&&input!==null&&output!==null)usd=((input-cached)*rate[0]+cached*rate[1]+output*rate[2])/1e6;
  else if(model==='whisper-1'&&seconds!==null)usd=seconds/60*0.006;
 }
 // Binary speech does not report token usage: show characters, leave its cost unknown.
 return {status,input,cached,output,seconds,characters,usd,pricing:usd===null?null:PRICING};
}
const error=(status,message,code='leadvox_openai')=>Response.json({error:{message,type:code,code}},{status,headers:{'Cache-Control':'no-store'}});
async function boundedBody(req,max){
 if(Number(req.headers.get('content-length'))>max)throw Error('large');
 const reader=req.body?.getReader(); if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('large');}chunks.push(value);}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
export function createProxy({rpc,fetchImpl=fetch,waitUntil=p=>p.catch(()=>{})}){
 return async req=>{
  if(req.method!=='POST')return error(405,'Método não permitido.');
  if(req.headers.has('origin'))return error(403,'Este endereço é exclusivo do motor.');
  const operation=new URL(req.url).pathname.split('/openai-proxy/v1/')[1];
  if(!['chat/completions','audio/transcriptions','audio/speech'].includes(operation))return error(404,'Operação não permitida.');
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^lvai_[0-9a-f]{64}$/.test(token))return error(401,'Autorização da empresa inválida.');
  let body,model,characters=null,streaming=false,contentType;
  try{
   const raw=await boundedBody(req,operation==='audio/transcriptions'?26e6:6e6);
   if(operation==='audio/transcriptions'){
    const f=await new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('content-type')||''},body:raw}).formData();
    model=String(f.get('model')||'');if(model!=='whisper-1'||!(f.get('file') instanceof Blob))return error(400,'Arquivo ou modelo de áudio inválido.');
    // The existing n8n transcription node consumes .text; verbose_json adds duration without changing it.
    f.set('response_format','verbose_json');body=f;
   }else{
    const b=JSON.parse(new TextDecoder().decode(raw)); model=b.model;
    if(operation==='chat/completions'){
     if(!Object.hasOwn(RATES,model)||!Array.isArray(b.messages))return error(400,'Modelo ou mensagens inválidos.');
     b.max_tokens=Math.min(Math.max(Number(b.max_tokens)||900,1),2000);
     delete b.max_completion_tokens;b.n=1;b.store=false;
     delete b.service_tier; // standard pricing only
     streaming=b.stream===true;if(streaming)b.stream_options={include_usage:true};
    }else{
     if(model!=='gpt-4o-mini-tts'||typeof b.input!=='string'||b.input.length>4096)return error(400,'Texto ou modelo de voz inválido.');
     characters=b.input.length;
    }
    body=JSON.stringify(b);contentType='application/json';
   }
  }catch{return error(400,'Pedido inválido ou grande demais.');}
  let grant;
  try{grant=await rpc('iag_openai_reserve',{p_token:token,p_operation:operation,p_model:model});}
  catch{return error(503,'Não foi possível autorizar o consumo agora.');}
  if(!grant?.key||!grant?.id)return error(401,'Chave não configurada, autorização expirada ou limite atingido. Não usamos chave de reserva.');
  const finish=async(data,status)=>{
   try{await rpc('iag_openai_finish',{p_id:grant.id,p_data:usageFor(model,data,status,characters)});}
   catch{console.error('openai_usage_pending');} // fixed message only; never exception/request payload
  };
  let response;
  try{response=await fetchImpl('https://api.openai.com/v1/'+operation,{method:'POST',
   headers:{Authorization:'Bearer '+grant.key,...(contentType?{'Content-Type':contentType}:{})},
   body,redirect:'error',signal:AbortSignal.timeout(90000)});}
  catch{await finish(null,502);return error(502,'A OpenAI não respondeu. Tente novamente.');}
  if(!response.ok){
   await response.body?.cancel();await finish(null,response.status);
   const msg=response.status===401?'A OpenAI recusou a chave da empresa. Atualize-a em Credenciais de API.':response.status===429?'A OpenAI informou limite ou saldo insuficiente na conta da empresa.':'A OpenAI recusou a solicitação. Confira a conta e o modelo.';
   // Provider error text can echo part of a key or customer content; never relay it.
   return error(response.status,msg);
  }
  const headers={'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store'};
  if(streaming&&headers['Content-Type'].includes('text/event-stream')){
   const {readable,writable}=new TransformStream();const writer=writable.getWriter();
   const task=(async()=>{
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',last=null;
    try{
     while(true){const {done,value}=await reader.read();if(done)break;
      pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop()||'';
      for(const line of lines)if(line.startsWith('data: ')){try{const d=JSON.parse(line.slice(6));if(d.usage)last=d;}catch{}}
      await writer.write(value);
     }
     await finish(last,response.status);await writer.close();
    }catch{await reader.cancel().catch(()=>{});await finish(last,502);await writer.abort().catch(()=>{});}
   })();waitUntil(task);return new Response(readable,{status:response.status,headers});
  }
  // Buffer before finalizing: a disconnected binary transfer isn't counted as fully measured.
  try{
   const bytes=await response.arrayBuffer();let data=null;
   if(headers['Content-Type'].includes('json'))try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{}
   await finish(data,response.status);return new Response(bytes,{status:response.status,headers});
  }catch{await finish(null,502);return error(502,'A resposta da OpenAI foi interrompida.');}
 };
}
