import {createAccountApi,N8N_WEBHOOK} from './account-api.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
// Plugin do Vendedor: abre dentro da LeadVox (iframe ao lado do atendimento); o resto do painel não abre em iframe nenhum.
const PLUGIN_PAGINAS=new Set(['/vendedor','/vendedor.html','/vendedor.js']);
const PLUGIN_ACOES=new Set(['contexto','pausar','devolver','agendar','cancelar','estoque','enviar_carro','proposta','orcamento']);
// proposta comercial / orçamento de serviços (segmentos que não são de veículos): itens com quantidade e preço, e as condições
function camposOrcamento(b,txt){
 const n=(x,max)=>{const s=String(x??'').trim(),v=Number(/,/.test(s)?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(v)&&v>0?Math.min(Math.round(v*1000)/1000,max):0;};
 const itens=(Array.isArray(b.itens)?b.itens:[]).slice(0,100).map(i=>({id:txt(i?.id,12).replace(/\D/g,''),nome:txt(i?.nome,160).trim(),qtd:n(i?.qtd,1000000),preco:Math.round(n(i?.preco,10000000)*100)/100,unidade:txt(i?.unidade,12)}))
  .filter(i=>(i.id||i.nome)&&i.qtd>0);
 const d=b.desconto&&typeof b.desconto==='object'?b.desconto:{},f=b.frete&&typeof b.frete==='object'?b.frete:{};
 return {modo:b.modo==='previa'?'previa':'enviar',itens,documento:txt(b.documento,20),
  desconto:{tipo:d.tipo==='pct'?'pct':'rs',valor:Math.min(n(d.valor,10000000),d.tipo==='pct'?100:10000000)},
  frete:{tipo:['cif','retirada','cobrado','combinar'].includes(f.tipo)?f.tipo:'combinar',valor:n(f.valor,1000000)},
  pagamento:txt(b.pagamento,200),entrega:txt(b.entrega,120),validadeDias:[3,7,15,30].includes(Number(b.validadeDias))?Number(b.validadeDias):7,
  obs:txt(b.obs,800),mensagem:txt(b.mensagem,1000)};
}
// capa do veículo no AutoCerto, para o convite em PDF; qualquer outro endereço ou arquivo é ignorado
async function fotoAutoCerto(url,fetchImpl){
 let u;try{u=new URL(url);}catch{return '';}
 if(u.protocol!=='https:'||!['autocerto.com','www.autocerto.com'].includes(u.hostname)||!u.pathname.startsWith('/fotos/')||u.port)return '';
 try{
  const r=await fetchImpl(u.href,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'image/jpeg'}});
  if(!r.ok||Number(r.headers.get('content-length')||0)>3e6)return '';
  const b=Buffer.from(await r.arrayBuffer());
  return b.length>100&&b.length<=3e6&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?b.toString('base64'):'';
 }catch{return '';}
}
// convite para test drive: só os campos do formulário, com tamanho e números conferidos
function camposProposta(b,txt){
 const n=(x,max)=>{const v=Number(String(x??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(v)&&v>0?Math.min(Math.round(v*100)/100,max):0;};
 const t=b.troca&&typeof b.troca==='object'?b.troca:{};
 return {itemId:txt(b.itemId,12).replace(/\D/g,''),modo:b.modo==='previa'?'previa':'enviar',
  forma:['avista','financiado','consorcio','cartao'].includes(b.forma)?b.forma:'',banco:txt(b.banco,60),
  entrada:n(b.entrada,10000000),parcelas:Math.floor(n(b.parcelas,120)),valorParcela:n(b.valorParcela,1000000),
  troca:{modelo:txt(t.modelo,80),ano:txt(t.ano,12),km:Math.floor(n(t.km,2000000)),valor:n(t.valor,10000000)},
  extras:(Array.isArray(b.extras)?b.extras:[]).slice(0,12).map(x=>txt(x,80).trim()).filter(Boolean),
  validadeDias:[3,7,15,30].includes(Number(b.validadeDias))?Number(b.validadeDias):7,
  sugestao:txt(b.sugestao,80),obs:txt(b.obs,500),mensagem:txt(b.mensagem,1000)};
}
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
  if(b.acao==='proposta'){
   const p=camposProposta(b,txt);
   if(!p.itemId)return responder(400,{ok:false,erro:'Escolha o veículo do convite.'});
   Object.assign(corpo,p);
   // foto de capa do AutoCerto: o AutoCerto recusa o download vindo do servidor do n8n, então este servidor baixa
   // (só de autocerto.com, até 3 MB, só JPEG) e manda junto; o n8n só usa se a foto for mesmo deste veículo no estoque
   const foto=await fotoAutoCerto(txt(b.fotoUrl,500),fetchImpl);
   if(foto){corpo.fotoUrl=b.fotoUrl;corpo.fotoBase64=foto;}
  }
  if(b.acao==='orcamento'){
   const o=camposOrcamento(b,txt);
   if(!o.itens.length)return responder(400,{ok:false,erro:'Adicione pelo menos um item com quantidade.'});
   Object.assign(corpo,o);
  }
  // enviar_carro: as mensagens que o vendedor aprovou (texto editado + foto/vídeo); o n8n confere que a mídia é do próprio veículo
  if(b.acao==='enviar_carro'){
   if(!/^\d{1,12}$/.test(txt(b.itemId,12)))return responder(400,{ok:false,erro:'Escolha um veículo da lista.'});
   const itens=(Array.isArray(b.itens)?b.itens:[]).slice(0,11).map(x=>({body:txt(x?.body,3000),mediaUrl:/^https:\/\/\S{1,490}$/.test(txt(x?.mediaUrl,500))?String(x.mediaUrl):''})).filter(x=>x.body.trim()||x.mediaUrl);
   if(!itens.length)return responder(400,{ok:false,erro:'Escreva o texto da mensagem.'});
   corpo.itemId=String(b.itemId);corpo.modo=['ficha','completa','fotos','video'].includes(b.modo)?b.modo:'ficha';corpo.itens=itens;
  }
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

