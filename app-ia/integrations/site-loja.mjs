// "Puxar do site": lê a página da loja e sugere a identidade para o convite em PDF (nome, logo, CNPJ, contatos, cor).
// O dono confere e salva no painel; nada é gravado daqui.
// Proteção: só http/https na porta padrão, nunca endereço interno (o nome é resolvido e cada IP conferido, a cada redirecionamento),
// até 3 redirecionamentos, 8 s e 1,5 MB.
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const MAX_PAGINA=1_500_000,MAX_IMAGEM=1_500_000;

// IPv4/IPv6 que não são da internet pública (rede local, loopback, link-local, CGNAT, multicast, reservados)
export function ipInterno(ip){
 if(isIP(ip)===4){
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19));
 }
 const v=ip.toLowerCase();
 if(v.startsWith('::ffff:'))return ipInterno(v.slice(7));
 return v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('fe8')||v.startsWith('fe9')||v.startsWith('fea')||v.startsWith('feb')||v.startsWith('ff');
}

async function conferirEndereco(url,lookup){
 let u;try{u=new URL(url);}catch{throw {status:400,message:'Endereço do site inválido.'};}
 if(!['http:','https:'].includes(u.protocol)||u.port&&!['80','443'].includes(u.port)||u.username||u.password)throw {status:400,message:'Use o endereço do site (http ou https).'};
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(isIP(host)||!/\./.test(host)||/\.(local|internal|localhost)$/i.test(host))throw {status:400,message:'Use o endereço público do site da loja.'};
 let ips;try{ips=await lookup(host,{all:true});}catch{throw {status:400,message:'Não achei esse site. Confira o endereço.'};}
 if(!ips.length||ips.some(x=>ipInterno(x.address)))throw {status:400,message:'Use o endereço público do site da loja.'};
 return u;
}

async function buscar(url,{fetchImpl=fetch,lookup=dnsLookup,max,aceita}){
 let atual=url;
 for(let i=0;i<4;i++){
  const u=await conferirEndereco(atual,lookup);
  let r;try{r=await fetchImpl(u.href,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Mozilla/5.0 (LeadVox IA; leitura do site da loja)',Accept:aceita}});}
  catch{throw {status:502,message:'O site não respondeu. Tente de novo ou preencha à mão.'};}
  if(r.status>=300&&r.status<400&&r.headers.get('location')){atual=new URL(r.headers.get('location'),u).href;continue;}
  if(!r.ok)throw {status:502,message:'O site respondeu com erro ('+r.status+'). Preencha à mão.'};
  const tam=Number(r.headers.get('content-length')||0);if(tam>max)throw {status:413,message:'Arquivo grande demais.'};
  const buf=Buffer.from(await r.arrayBuffer());if(buf.length>max)throw {status:413,message:'Arquivo grande demais.'};
  return {buf,tipo:String(r.headers.get('content-type')||''),url:u.href};
 }
 throw {status:502,message:'O site redireciona demais. Preencha à mão.'};
}

const limpo=(t,n)=>String(t||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const meta=(html,nome)=>{const re=new RegExp('<meta[^>]+(?:property|name)=["\']'+nome+'["\'][^>]*>','i'),m=re.exec(html);const c=m&&/content=["']([^"']*)["']/i.exec(m[0]);return c?c[1]:'';};
const fone=d=>{d=String(d||'').replace(/\D/g,'');if(d.startsWith('55')&&d.length>=12)d=d.slice(2);return d.length===10?'('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6):d.length===11?'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7):'';};

// Tira da página o que der para sugerir; o que não achar fica vazio
export function extrairIdentidade(html,base){
 const abs=u=>{try{const x=new URL(limpo(u,500),base);return /^https?:$/.test(x.protocol)?x.href:'';}catch{return '';}};
 const ld=[];for(const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){try{const j=JSON.parse(m[1]);ld.push(...[].concat(j,j['@graph']||[]));}catch{}}
 const org=ld.find(x=>x&&typeof x==='object'&&(x.address||x.logo||x.telephone))||{};
 const ad=typeof org.address==='object'&&org.address?org.address:{};
 const titulo=limpo((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1],120).split(/\s[|–—-]\s/)[0];
 const imgLogo=(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/i.exec(html)||[])[0]||'';
 const srcLogo=(/\ssrc=["']([^"']+)["']/i.exec(imgLogo)||[])[1];
 const logoLd=typeof org.logo==='string'?org.logo:org.logo&&org.logo.url;
 const icone=(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html)||[])[1];
 const texto=limpo(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' '),200000);
 const tel=(/href=["']tel:([^"']+)["']/i.exec(html)||[])[1]||org.telephone||(/\(?\b\d{2}\)?\s?\d{4,5}-\d{4}\b/.exec(texto)||[])[0];
 const zap=(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)(\d{10,13})/i.exec(html)||[])[1];
 const cnpj=(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.exec(texto)||[])[0]||'';
 const insta=(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i.exec(html)||[])[1];
 const endLd=[ad.streetAddress,ad.addressLocality,ad.addressRegion].filter(Boolean).join(', ');
 const endTxt=(/\b(?:Rua|R\.|Av\.|Avenida|Estrada|Estr\.|Rodovia|Rod\.|Alameda|Travessa|Praça)\s[^|•\n]{5,110}?(?:\d{5}-?\d{3}|[A-Z]{2}\b)/.exec(texto)||[])[0];
 const cor=meta(html,'theme-color');
 return {
  nome:limpo(meta(html,'og:site_name')||org.name||titulo,80),
  logo:abs(logoLd||srcLogo||meta(html,'og:image')||icone||''),
  cnpj,telefone:fone(tel),whatsapp:fone(zap),
  email:limpo((/mailto:([^"'?]+)/i.exec(html)||[])[1]||org.email,120),
  endereco:limpo(endLd||endTxt,160),
  instagram:insta&&!/^(p|reel|explore|accounts)$/i.test(insta)?'@'+insta:'',
  site:new URL(base).hostname.replace(/^www\./,''),
  cor:/^#[0-9a-f]{6}$/i.test(cor)?cor.toLowerCase():''
 };
}

export async function lerSiteLoja(endereco,opcoes={}){
 const url=/^https?:\/\//i.test(endereco)?endereco:'https://'+String(endereco||'').trim();
 const {buf,url:final}=await buscar(url,{...opcoes,max:MAX_PAGINA,aceita:'text/html'});
 return extrairIdentidade(buf.toString('utf8'),final);
}

// A logo achada no site vem para o painel como data URL (o navegador converte para JPEG antes de guardar)
export async function baixarLogoSite(url,opcoes={}){
 const {buf,tipo}=await buscar(url,{...opcoes,max:MAX_IMAGEM,aceita:'image/*'});
 const t=/image\/(png|jpe?g|webp|gif|svg\+xml)/i.exec(tipo);
 if(!t)throw {status:400,message:'Não achei uma imagem de logo nesse endereço.'};
 return 'data:image/'+t[1].toLowerCase().replace('jpg','jpeg')+';base64,'+buf.toString('base64');
}
