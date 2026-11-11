// Domínio próprio do site da loja: registros DNS a criar, verificação real (controle, DNS, HTTPS e se a página é da loja certa)
// e consulta de disponibilidade para pedidos de registro. Tudo com DNS e fetch injetáveis (os testes não saem para a internet).
import {createHmac} from 'node:crypto';
import {Resolver} from 'node:dns/promises';

// Hospedagem do painel (VPS do Coolify): o domínio da loja aponta para cá
export const DESTINO={ip:process.env.SITE_DESTINO_IP||'179.236.235.206',host:process.env.SITE_DESTINO_HOST||'ia.leadvox.com.br'};
export const GITHUB_IPS=['185.199.108.153','185.199.109.153','185.199.110.153','185.199.111.153'];
const PROIBIDOS=/(^|\.)(leadvox\.com\.br|lv-mktdeconversa\.com|sslip\.io|github\.io)$/;

// "https://www.SuaLoja.com.br/estoque" → "www.sualoja.com.br"; inválido → ''
export function normalizarDominio(v){
 let d=String(v||'').trim().toLowerCase().replace(/^[a-z]+:\/\//,'').split(/[/?#]/)[0].replace(/:\d+$/,'').replace(/\.$/,'');
 if(d.length<4||d.length>253||!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d)||PROIBIDOS.test(d))return '';
 return d;
}
// endereços que o cadastro ocupa: principal = raiz e www; subdomínio = só ele
export function hostsDe({dominio,tipo}){
 const d=String(dominio||'');
 return tipo==='principal'?[d.replace(/^www\./,''),'www.'+d.replace(/^www\./,'')]:[d];
}
// endereço que abre o site (o outro redireciona para ele)
export function principalDe({dominio,tipo,preferido}){
 const [raiz,www]=hostsDe({dominio,tipo});
 return tipo==='principal'?(preferido==='raiz'?raiz:www):raiz;
}
const donoGithub=repo=>String(repo||'').split('/')[0].toLowerCase();

// Registros que o lojista cria no DNS. "nome" é relativo ao domínio cadastrado no provedor (a zona);
// "completo" é o endereço inteiro, para quem usa outro provedor.
export function registrosDns({dominio,tipo,token,hospedagem={},destino=DESTINO}){
 const gh=hospedagem.tipo==='github'&&hospedagem.repo,alvoCname=gh?donoGithub(hospedagem.repo)+'.github.io':destino.host;
 const partes=String(dominio).split('.'),rotulo=tipo==='principal'?'@':partes[0],zona=tipo==='principal'?dominio:partes.slice(1).join('.');
 const nome=n=>n==='@'?'@':n,completo=n=>n==='@'?zona:n+'.'+zona;
 const regs=[];
 regs.push({tipo:'TXT',nome:tipo==='principal'?'_leadvox':'_leadvox.'+rotulo,completo:'_leadvox.'+dominio,valor:'leadvox='+token,para:'Prova que a loja controla o domínio'});
 if(tipo==='principal'){
  if(gh)GITHUB_IPS.forEach(ip=>regs.push({tipo:'A',nome:'@',completo:zona,valor:ip,para:'Site no endereço sem www'}));
  else regs.push({tipo:'A',nome:'@',completo:zona,valor:destino.ip,para:'Site no endereço sem www'});
  regs.push({tipo:'CNAME',nome:'www',completo:'www.'+zona,valor:alvoCname,para:'Site no endereço com www'});
 }else regs.push({tipo:'CNAME',nome:nome(rotulo),completo:completo(rotulo),valor:alvoCname,para:'Site neste subdomínio'});
 return regs;
}

function resolvedorPadrao(){
 const r=new Resolver({timeout:4000,tries:2});r.setServers(['1.1.1.1','8.8.8.8']);
 return {resolveTxt:h=>r.resolveTxt(h),resolve4:h=>r.resolve4(h),resolveCname:h=>r.resolveCname(h)};
}
const tenta=async(p)=>{try{return await p;}catch{return [];}};
const semPonto=s=>String(s||'').toLowerCase().replace(/\.$/,'');

// Verificação real. status: pendente (sem prova de controle) · verificado (controle provado) · ativo (tudo certo).
export async function verificarDominio({dominio,tipo,preferido,token,conta,hospedagem={},destino=DESTINO},{dns=resolvedorPadrao(),fetchImpl=fetch}={}){
 const hosts=hostsDe({dominio,tipo}),principal=principalDe({dominio,tipo,preferido}),gh=hospedagem.tipo==='github'&&hospedagem.repo;
 const pend=[],r={hosts,principal,propriedade:false,dns:[],https:[],identidade:false,redirecionamento:tipo==='principal'?false:null};
 // 1. controle do domínio (TXT)
 const txt=(await tenta(dns.resolveTxt('_leadvox.'+dominio))).map(x=>Array.isArray(x)?x.join(''):String(x));
 r.propriedade=txt.includes('leadvox='+token);
 if(!r.propriedade)pend.push({quem:'loja',texto:'Crie o registro TXT "_leadvox" com o valor leadvox='+token+' no DNS do domínio.'});
 // 2. DNS de cada endereço
 for(const h of hosts){
  const a=await tenta(dns.resolve4(h)),c=(await tenta(dns.resolveCname(h))).map(semPonto);
  let ok;
  if(gh)ok=h===hosts[0]&&tipo==='principal'?a.some(ip=>GITHUB_IPS.includes(ip)):(c.includes(donoGithub(hospedagem.repo)+'.github.io')||a.some(ip=>GITHUB_IPS.includes(ip)));
  else ok=a.includes(destino.ip)||c.includes(semPonto(destino.host));
  r.dns.push({host:h,ok,a,cname:c});
  if(!ok)pend.push({quem:'loja',texto:'O endereço '+h+' ainda não aponta para '+(gh?'o GitHub Pages':'a LeadVox')+'. Crie o registro indicado na tabela (a mudança pode levar algumas horas para valer).'});
 }
 // 3. HTTPS e identidade (várias lojas usam o mesmo IP: a página precisa ser desta loja)
 for(const h of hosts){
  const d=r.dns.find(x=>x.host===h);
  if(!d.ok){r.https.push({host:h,ok:false,erro:'dns'});continue;}
  let resp;try{resp=await fetchImpl('https://'+h+'/',{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'LeadVox-Dominio/1.0'}});}
  catch{r.https.push({host:h,ok:false,erro:'https'});
   pend.push({quem:'leadvox',texto:gh?'O HTTPS de '+h+' ainda não está valendo: no repositório '+hospedagem.repo+', em Settings → Pages, coloque o domínio '+principal+' e marque Enforce HTTPS.'
    :'O HTTPS de '+h+' ainda não está valendo: a equipe LeadVox precisa liberar este endereço na hospedagem (certificado).'});continue;}
  const loc=resp.headers.get('location')||'';
  if(h===principal){
   const html=resp.status===200?await resp.text().catch(()=>''):'';
   const ehDaLoja=html.includes('data-loja="'+conta+'"');
   r.https.push({host:h,ok:true,status:resp.status});
   r.identidade=ehDaLoja;
   if(!ehDaLoja)pend.push({quem:'leadvox',texto:resp.status===200?'O endereço '+h+' abre, mas não é o site desta loja.'+(gh?' Confira se o repositório '+hospedagem.repo+' tem o site da loja com o tema da LeadVox.':' A equipe LeadVox precisa ligar o endereço a esta loja na hospedagem.')
    :'O endereço '+h+' respondeu '+resp.status+' em vez do site.'});
  }else{
   const vai=/^30[1278]$/.test(String(resp.status))&&loc.replace(/\/$/,'').startsWith('https://'+principal);
   r.https.push({host:h,ok:true,status:resp.status});
   r.redirecionamento=vai;
   if(!vai)pend.push({quem:'leadvox',texto:'O endereço '+h+' precisa redirecionar para https://'+principal+'.'});
  }
 }
 const tudo=r.propriedade&&r.dns.every(x=>x.ok)&&r.https.every(x=>x.ok)&&r.identidade&&(r.redirecionamento!==false);
 r.status=!r.propriedade?'pendente':tudo?'ativo':'verificado';
 r.pendencias=pend;r.proximo=pend[0]?pend[0].texto:'Domínio ativo: o site da loja abre em https://'+principal+'.';
 r.em=new Date().toISOString();
 return r;
}

// assinatura que o banco confere (lv_site_dominio_resultado): HMAC-SHA256 de "org|dominio|status|ts"
export function assinarResultado(segredo,org,dominio,status,ts){
 return createHmac('sha256',segredo).update(org+'|'+dominio+'|'+status+'|'+ts).digest('hex');
}

// Disponibilidade pelo RDAP (Registro.br para .br; rdap.org para os outros): 404 = livre, 200 = registrado
export async function consultarDisponibilidade(nome,{fetchImpl=fetch}={}){
 const d=normalizarDominio(nome);if(!d)return {ok:false,erro:'Endereço inválido.'};
 const url=/\.br$/.test(d)?'https://rdap.registro.br/domain/'+d:'https://rdap.org/domain/'+d;
 let r;try{r=await fetchImpl(url,{headers:{Accept:'application/rdap+json'},signal:AbortSignal.timeout(10000),redirect:'follow'});}
 catch{return {ok:false,erro:'O serviço de consulta não respondeu. Tente de novo.',fonte:url};}
 if(r.status===404)return {ok:true,dominio:d,disponivel:true,fonte:url};
 if(r.status===200)return {ok:true,dominio:d,disponivel:false,fonte:url};
 return {ok:false,erro:'A consulta respondeu '+r.status+'. Confira no site do Registro.br.',fonte:url};
}
