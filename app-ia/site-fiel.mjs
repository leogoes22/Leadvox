// Modelos fiéis: o HTML original de cada site (convertido em sites/<modelo>/) preenchido com os dados da loja.
// Tudo que vem do painel entra escapado para o lugar onde cai (HTML, atributo, string de JavaScript ou JSON).
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PASTA=path.join(path.dirname(fileURLToPath(import.meta.url)),'sites');
export const MODELOS_FIEIS={
 garagem:{paginas:['index.html','estoque.html','financiamento.html','venda-sua-moto.html'],segmento:'motos',
  // tons do site original da MG calculados a partir das 2 cores do painel
  cores:(c1,c2)=>({ambar:c1,luz:misturar(c1,'#ffffff',.42),ripado:c2,carvao:misturar(c2,'#ffffff',.05),grafite:misturar(c2,'#ffffff',.1)}),
  frase:'Sua próxima moto está aqui.',sub:'Motos 0 km e seminovas, com financiamento e troca. Escolha pelo site e venha buscar.',
  sobre:'Passe aqui para ver as motos e conversar com a equipe.'}
};
const cache=new Map();
function modelo(nome,pagina){
 const k=nome+'/'+pagina;
 if(!cache.has(k))cache.set(k,readFileSync(path.join(PASTA,nome,pagina),'utf8'));
 return cache.get(k);
}
export function misturar(a,b,p){
 const c=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));
 const [r1,g1,b1]=c(a),[r2,g2,b2]=c(b);
 return '#'+[r1+(r2-r1)*p,g1+(g2-g1)*p,b1+(b2-b1)*p].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const js=s=>JSON.stringify(String(s??'')).slice(1,-1).replace(/'/g,"\\'").replace(/</g,'\\u003c');
const titulo=s=>String(s||'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
const hexOk=v=>/^#[0-9a-f]{6}$/i.test(v||'');

// logo de texto quando a loja ainda não subiu a dela
function logoTexto(nome,cor){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90"><text x="160" y="58" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="34" fill="'+cor+'">'+esc(nome).slice(0,40)+'</text></svg>';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function horarios(txt){
 const l=String(txt||'').split(/\s*(?:·|;|\n|\|)\s*/).map(s=>s.trim()).filter(Boolean).slice(0,4);
 return l.length?l:['Consulte o horário pelo WhatsApp'];
}
function avaliacoes(id){
 return (Array.isArray(id.avaliacoes)?id.avaliacoes:[]).filter(a=>a&&a.nome&&a.texto).slice(0,3);
}
function iniciais(n){return String(n).trim().split(/\s+/).map(p=>p[0]).filter(Boolean).slice(0,2).join('').toUpperCase();}
function cardAvaliacao(a,i){
 return '<article class="av" data-rv="dir" style="--d:'+(i*120)+'"> <blockquote>'+esc(a.texto)+'</blockquote> <div class="autor"><span class="ava">'+esc(iniciais(a.nome))+'</span><div><b>'+esc(a.nome)+'</b><small>Avaliação no Google</small></div><span class="estrelas" aria-label="5 estrelas">★★★★★</span></div> </article>';
}
function prova(av){
 if(!av.length)return '';
 const a=av[0],trecho=(String(a.texto).match(/^[^.!?]{8,110}[.!?]/)||[String(a.texto).slice(0,100)])[0].trim();
 return '<div class="hero-prova"><span class="g" aria-hidden="true"><svg><use href="#i-google"/></svg></span><p><span class="estrelas" aria-label="5 estrelas">★★★★★</span><br>“'+esc(trecho)+'” <b>'+esc(a.nome)+'</b></p></div>';
}
function fraseAnimada(frase){
 let i=0,linhas=String(frase).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3);
 // como no original: duas linhas, a segunda na cor de destaque. Uma frase só é dividida ao meio.
 if(linhas.length===1){const p=linhas[0].split(/\s+/);if(p.length>=3){const meio=Math.ceil(p.length/2);linhas=[p.slice(0,meio).join(' '),p.slice(meio).join(' ')];}}
 return linhas.map(l=>'<span class="l">'+l.split(/\s+/).map(w=>'<span class="w" style="--i:'+(i++)+'">'+esc(w)+'</span>').join(' ')+'</span>').join('');
}
function fotosDoEstoque(itens){
 const f=[];for(const it of itens||[]){const u=(it.fotos||[]).find(x=>/^https:\/\//.test(x));if(u)f.push(u);if(f.length>=6)break;}
 return f;
}

// Loja de exemplo da prévia (/s/demo/?modelo=garagem): motos desenhadas no lugar das fotos, para não usar foto de cliente.
export function lojaDemoFiel(){
 const desenho=(cor,k)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><radialGradient id="g" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#2a2622"/><stop offset="1" stop-color="#121110"/></radialGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect y="440" width="800" height="160" fill="#0d0c0b"/><g fill="none" stroke="#e8e2d6" stroke-width="16"><circle cx="250" cy="420" r="80"/><circle cx="560" cy="420" r="80"/></g><path d="M250 420 L330 300 L470 300 L560 420 M330 300 L360 250 M470 300 L500 230 L560 225" stroke="'+cor+'" stroke-width="26" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M340 300 C350 '+(250-k*4)+' 420 245 480 262 L470 300 Z" fill="'+cor+'"/></svg>');
 const v=[['HONDA','CG 160','FAN','2024/2024',17990],['YAMAHA','FAZER 250','ABS','2023/2023',21990],['HONDA','XRE 300','SAHARA','2024/2025',31990],['BMW','G 310 GS','','2022/2022',33900],
  ['HONDA','PCX 160','DLX','2024/2024',19490],['YAMAHA','NMAX 160','ABS','2023/2024',18990],['SUZUKI','V-STROM 650','XT','2021/2021',49900],['TRIUMPH','TIGER 900','GT PRO','2022/2022',72900]];
 return {ativo:true,modelo:'garagem',publicado:false,
  identidade:{nome:'Loja Demo Motos',cidade:'sua cidade',cor1:'#d6921e',cor2:'#121110',frase:'Sua próxima moto está aqui.',
   subtitulo:'Motos 0 km e seminovas, da scooter do dia a dia à big trail da viagem. Sua moto entra na troca e o financiamento sai em até 60x.',
   whatsapp:'21999999999',endereco:'Av. Exemplo, 100 · Centro',horario:'Seg. a sex. 9h às 18h · Sáb. 9h às 14h',instagram:'leadvox.com.br',
   avaliacoes:[{nome:'Cliente Exemplo',texto:'Atendimento excelente do começo ao fim. Saí de moto nova e com a parcela que cabia no bolso.'},
    {nome:'Outra Cliente',texto:'Equipe atenciosa, documentação resolvida pela loja e entrega no mesmo dia.'}]},
  itens:v.map((x,k)=>({id:900+k,nome:x[0]+' '+x[1],preco:x[4],atributos:{marca:x[0],modelo:x[1],versao:x[2],ano:x[3],cambio:/PCX|NMAX/.test(x[1])?'Automático':'Manual',combustivel:'Flex'},
   fotos:[desenho(['#d6921e','#c8131e','#1f6feb','#2fa36b'][k%4],k),desenho('#8a8378',k)]}))};
}

// O que o lojista escolheu mostrar no site (painel → Site da loja → Estoque). Sem escolha, mostra tudo.
export function mostrarDo(id){
 const m=(id&&typeof id.mostrar==='object'&&id.mostrar)||{};
 return {km:m.km!==false,preco:m.preco!==false,opcionais:m.opcionais!==false,descricao:m.descricao!==false};
}
// Estoque no formato que os sites originais leem (campos tolerantes do deApi da MG). O que o lojista escondeu vai vazio
// (o site mostra "Consulte"); km 0 é veículo 0 km.
export function estoqueParaSite(itens,mostrar=mostrarDo()){
 return (itens||[]).map(it=>{
  const a=it.atributos||{},anos=String(a.ano||'').match(/(\d{4})\D*(\d{4})?/)||[];
  const km=a.km===0||a.km==='0'?0:Number(String(a.km??'').replace(/\D/g,''))||null;
  return {id:String(it.id),marca:titulo(a.marca||''),modelo:a.modelo||it.nome,versao:a.versao||'',anoFabricacao:anos[1]?Number(anos[1]):null,
   anoModelo:anos[2]?Number(anos[2]):(anos[1]?Number(anos[1]):null),km:mostrar.km?km:null,preco:mostrar.preco?(it.preco??null):null,
   fotos:(it.fotos||[]).filter(x=>typeof x==='string'),cambio:a.cambio||'',combustivel:a.combustivel||'',cor:a.cor||'',
   opcionais:mostrar.opcionais&&Array.isArray(a.opcionais)?a.opcionais.filter(x=>typeof x==='string').slice(0,40):[],
   descricao:mostrar.descricao?String(a.obs||'').slice(0,1500):'',categoria:it.categoria||'',tipo:a.tipo||''};
 });
}

export function renderFiel({nomeModelo,pagina,dados,conta}){
 const m=MODELOS_FIEIS[nomeModelo];if(!m||!m.paginas.includes(pagina))return null;
 const id=dados.identidade||{},itens=Array.isArray(dados.itens)?dados.itens:[];
 const nome=id.nome||'Loja',cidade=id.cidade||'sua região';
 const c1=hexOk(id.cor1)?id.cor1:'#d6921e',c2=hexOk(id.cor2)?id.cor2:'#121110';
 const av=avaliacoes(id),fotos=fotosDoEstoque(itens);
 const zap=String(id.whatsapp||'').replace(/\D/g,''),zap55=zap&&zap.length<=11?'55'+zap:zap;
 const tel=id.telefone||(zap.length>=10?'('+zap.slice(-11,-9)+') '+zap.slice(-9,-4)+'-'+zap.slice(-4):'');
 const google='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(nome+' '+cidade);
 const cfg={whatsapp:zap55,telefone:tel,endereco:id.endereco||'',mapsBusca:[nome,id.endereco||cidade].filter(Boolean).join(', '),instagram:id.instagram||'',
  instaPosts:'',instaSeguidores:'',googleAvaliacoes:google,googleAvaliar:google,politicaPrivacidade:'#',siteBase:'',
  estoqueApi:'/api/site/estoque?loja='+conta,autocertoUnidade:0,leadWebhook:'',webchatToken:'',
  webchatBase:'https://chatapi.leadvox.com.br',webchatSdk:'https://chat.leadvox.com.br/webchat/sdk.js',semKm:!mostrarDo(id).km};
 const logo=/^https:\/\//.test(id.logo||'')?id.logo:logoTexto(nome,c1);
 const marcas=[...new Set(itens.map(it=>titulo((it.atributos||{}).marca)).filter(Boolean))].slice(0,12);
 const marcasHtml=marcas.length?[...marcas,...marcas].map(x=>'<span>'+esc(x)+'</span>').join(''):'';
 const h=horarios(id.horario);
 const valores={
  'h:nome':esc(nome),'h:cidade':esc(cidade),'h:frase':esc(id.frase||m.frase),'h:sub':esc(id.subtitulo||m.sub),'h:sobre':esc(id.sobre||m.sobre),
  'j:nome':js(nome),'j:cidade':js(cidade),'j:conta':js(conta),
  'a:logo':esc(logo),'a:ogimg':esc(fotos[0]||''),'a:foto1':esc(fotos[0]||''),'a:foto2':esc(fotos[1]||fotos[0]||''),'a:foto3':esc(fotos[2]||fotos[0]||''),
  'json:cfg':JSON.stringify(cfg).replace(/</g,'\\u003c'),
  'bloco:frase':fraseAnimada(id.frase||m.frase),'bloco:prova':prova(av),'bloco:marcas':marcasHtml,
  'bloco:avaliacoes':av.map(cardAvaliacao).join(''),'bloco:avaliacoesFaixa':av.map(cardAvaliacao).join(''),
  'bloco:horarioP':h.map(x=>'<p>'+esc(x)+'</p>').join(''),'bloco:horarioLi':h.map(x=>'<li>'+esc(x)+'</li>').join('')
 };
 let html=modelo(nomeModelo,pagina);
 // seções que dependem de dados: sem avaliações ou sem Instagram, a seção some
 if(!av.length)html=html.replace(/<!--lv:se:avaliacoes-->[\s\S]*?<!--lv:fim:avaliacoes-->/g,'');
 if(!id.instagram)html=html.replace(/<!--lv:se:instagram-->[\s\S]*?<!--lv:fim:instagram-->/g,'');
 html=html.replace(/\{\{([a-z]+:[A-Za-z0-9]+)\}\}/g,(t,k)=>k in valores?valores[k]:'');
 const tons=m.cores(c1,c2);
 const estilo='<style id="lv-cores">:root{'+Object.entries(tons).map(([k,v])=>'--'+k+':'+v).join(';')+'}</style>';
 const robots=dados.publicado?'':'<meta name="robots" content="noindex">';
 html=html.replace('</head>',robots+estilo+'</head>');
 if(conta!=='demo')html=html.replace('</body>','<script src="/site/tema.js" data-loja="'+esc(conta)+'" defer></script></body>');
 return html;
}
