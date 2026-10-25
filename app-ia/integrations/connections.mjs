// Server-only checks for the client's own connections. Each test only reads; nothing is created on the provider.
export class ConnectionError extends Error {constructor(message){super(message);}}
const ASAAS={sandbox:'https://api-sandbox.asaas.com/v3',production:'https://api.asaas.com/v3'};
const timeout=()=>AbortSignal.timeout(12000);

// AutoCerto: same OAuth login the SDR Motor uses in n8n (grant_type=password with the store's API user).
export async function testAutoCerto({usuario,senha,fetchImpl=fetch}){
 let r;try{r=await fetchImpl('https://integracao.autocerto.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
  body:new URLSearchParams({grant_type:'password',username:usuario,password:senha}).toString(),redirect:'error',signal:timeout()});}
 catch{throw new ConnectionError('Não deu para falar com o AutoCerto agora. Tente de novo em instantes.');}
 const d=await r.json().catch(()=>null);
 if(!r.ok||!d?.access_token)throw new ConnectionError('O AutoCerto não aceitou esse usuário e senha da API.');
 return {ok:true};
}

// The Revenda Mais feed is a URL chosen by the client, so it is fetched defensively: https, public host, no redirect, size cap.
export function safeFeedUrl(value){
 let u;try{u=new URL(String(value??'').trim());}catch{throw new ConnectionError('Cole a URL completa do feed do Revenda Mais.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw new ConnectionError('A URL do feed precisa começar com https://.');
 const h=u.hostname.toLowerCase();
 if(!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h)||h.endsWith('.sslip.io')||h.endsWith('.nip.io'))throw new ConnectionError('Essa URL de feed não é aceita.');
 return u;
}
export async function testRevendaMais({feedUrl,fetchImpl=fetch}){
 const u=safeFeedUrl(feedUrl);
 let r;try{r=await fetchImpl(u.href,{headers:{Accept:'application/json'},redirect:'error',signal:timeout()});}
 catch{throw new ConnectionError('Não deu para abrir o feed do Revenda Mais. Confira a URL.');}
 if(!r.ok)throw new ConnectionError('O feed do Revenda Mais respondeu com erro. Confira a URL.');
 const len=Number(r.headers?.get?.('content-length')||0);if(len>15e6)throw new ConnectionError('O feed é grande demais.');
 const d=await r.json().catch(()=>null);
 const lista=Array.isArray(d)?d:d&&typeof d==='object'?Object.values(d).find(Array.isArray)||Object.values(d).flatMap(v=>v&&typeof v==='object'?Object.values(v).filter(Array.isArray):[])[0]:null;
 if(!Array.isArray(lista))throw new ConnectionError('Esse endereço não devolveu uma lista de veículos em JSON.');
 return {ok:true,count:lista.length};
}

// Asaas: reads one customer page to prove the key works in the chosen environment.
export async function testAsaas({environment,apiKey,fetchImpl=fetch}){
 const base=ASAAS[environment];if(!base)throw new ConnectionError('Escolha o ambiente do Asaas.');
 if(typeof apiKey!=='string'||!/^\$?aact_[A-Za-z0-9_:$.=-]{10,}$/.test(apiKey.trim()))throw new ConnectionError('A chave do Asaas começa com $aact_. Confira se copiou inteira.');
 let r;try{r=await fetchImpl(base+'/customers?limit=1',{headers:{access_token:apiKey.trim(),Accept:'application/json','User-Agent':'LeadVoxIA/0.2'},redirect:'error',signal:timeout()});}
 catch{throw new ConnectionError('Não deu para falar com o Asaas agora. Tente de novo em instantes.');}
 if(r.status===401||r.status===403)throw new ConnectionError('O Asaas não aceitou essa chave'+(environment==='sandbox'?' no ambiente de teste.':' em produção.'));
 if(!r.ok)throw new ConnectionError('O Asaas respondeu com erro. Tente de novo em instantes.');
 return {ok:true};
}
