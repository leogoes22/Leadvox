import {createAccountApi,N8N_WEBHOOK} from './account-api.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
// Plugin do Vendedor: abre dentro da LeadVox (iframe ao lado do atendimento); o resto do painel não abre em iframe nenhum.
const PLUGIN_PAGINAS=new Set(['/vendedor','/vendedor.html','/vendedor.js']);
const PLUGIN_ACOES=new Set(['contexto','pausar','devolver','agendar','cancelar','estoque','enviar_carro']);
export function createApp(options={}) {
 const accountApi=createAccountApi(options),fetchImpl=options.fetchImpl||fetch;
 const pedidosPlugin=new Map(); // limite por IP: 30 pedidos por minuto
 return http.createServer(async(req,res)=>{
  const caminho=new URL(req.url,'http://localhost').pathname;
  const quadro=PLUGIN_PAGINAS.has(caminho)?'https://*.leadvox.com.br https://leadvox.com.br':"'none'";
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src https://leadvox.com.br; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors "+quadro,'Cache-Control':'no-store'};
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if(caminho==='/api/plugin')return plugin(req,res);
  if(await accountApi(req,res,caminho))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end('Método não permitido');}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Endereço inválido');}
  if(pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',application:'leadvox-ia',mode:'homologacao',version:'0.2.0'}));}
  if(pathname.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Integração real ainda não habilitada'}));}
  if(pathname.split('/').some(p=>p.startsWith('.'))||pathname.includes('\\')||pathname.includes('\0')){res.writeHead(404);return res.end('Não encontrado');}
  if(pathname==='/vendedor')pathname='/vendedor.html';
  let file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(404);return res.end('Não encontrado');}
  try{if(pathname.endsWith('/'))file=path.join(file,'index.html');await stat(file);
   const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Não encontrado');}
 });
 // /api/plugin: repassa ao fluxo do plugin no n8n só os campos conhecidos; quem confere a chave da loja (k, t) é o n8n.
 async function plugin(req,res){
  const responder=(status,dados)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(dados));};
  if(req.method!=='POST')return responder(405,{ok:false,erro:'Método não permitido.'});
  const origem=req.headers.origin,host=req.headers.host;
  if(origem&&host&&origem!=='https://'+host&&!(options.allowLocal&&origem==='http://'+host))return responder(403,{ok:false,erro:'Origem não permitida.'});
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),agora=Date.now();
  const lista=(pedidosPlugin.get(ip)||[]).filter(t=>agora-t<60000);if(lista.length>=30)return responder(429,{ok:false,erro:'Muitos pedidos. Espere um minuto.'});
  lista.push(agora);pedidosPlugin.set(ip,lista);if(pedidosPlugin.size>5000)pedidosPlugin.clear();
  let raw='';for await(const parte of req){raw+=parte;if(raw.length>20000)return responder(413,{ok:false,erro:'Pedido grande demais.'});}
  let b;try{b=JSON.parse(raw||'{}');}catch{return responder(400,{ok:false,erro:'Pedido inválido.'});}
  const txt=(v,n)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
  if(!/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(txt(b.k,40))||!/^[0-9a-f]{24}$/.test(txt(b.t,30))||!PLUGIN_ACOES.has(b.acao))return responder(400,{ok:false,erro:'Link do plugin incompleto. Peça o link ao gestor.'});
  const corpo={k:b.k,t:b.t,acao:b.acao,tel:txt(b.tel,20),ticketId:txt(b.ticketId,12),vendedor:txt(b.vendedor,60),cliente:txt(b.cliente,80),contactId:txt(b.contactId,12)};
  // agendar: data e hora locais do vendedor (AAAA-MM-DDTHH:MM) e o assunto que a IA deve retomar
  if(b.acao==='agendar'){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(txt(b.quando,20)))return responder(400,{ok:false,erro:'Escolha a data e a hora do follow-up.'});corpo.quando=b.quando;corpo.assunto=txt(b.assunto,300);}
  // estoque: busca no catálogo da loja; enviar_carro: ficha + até 10 fotos para o cliente do atendimento
  if(b.acao==='estoque')corpo.busca=txt(b.busca,60);
  if(b.acao==='enviar_carro'){if(!/^\d{1,12}$/.test(txt(b.itemId,12)))return responder(400,{ok:false,erro:'Escolha um veículo da lista.'});corpo.itemId=String(b.itemId);corpo.fotos=Math.max(0,Math.min(10,Number(b.fotos)||0));}
  let r;try{r=await fetchImpl(N8N_WEBHOOK+'iag-plugin-vendedor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo),signal:AbortSignal.timeout(70000),redirect:'error'});}
  catch{return responder(502,{ok:false,erro:'O motor da IA não respondeu. Tente de novo em instantes.'});}
  const dados=await r.json().catch(()=>null);
  if(!dados||typeof dados!=='object')return responder(502,{ok:false,erro:'O motor da IA não respondeu. Tente de novo em instantes.'});
  responder(r.status===401||r.status===400?r.status:(r.ok?200:502),dados);
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
 const server=createApp();server.listen(port,host,()=>console.log('LeadVox IA: http://'+host+':'+port));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

