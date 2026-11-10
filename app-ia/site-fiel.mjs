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
  sobre:'Passe aqui para ver as motos e conversar com a equipe.',demo:['#d6921e','#121110']},
 // site original da Elite Auto Broker: fundo escuro, amarelo de destaque; o fundo do painel só entra se for escuro (os textos são claros)
 premium:{paginas:['index.html','estoque.html','financiamento.html','consignacao.html'],segmento:'carros',demo:['#dbc300','#0a0a0c'],
  cores:(c1,c2)=>({brand:c1,'brand-hi':misturar(c1,'#ffffff',.18),...(escura(c2)?{black:misturar(c2,'#000000',.5),bg:c2,'bg-2':misturar(c2,'#ffffff',.02),
   panel:misturar(c2,'#ffffff',.06),'panel-2':misturar(c2,'#ffffff',.09)}:{})}),
  fraseHtml:()=>'Seu próximo carro<em>já está no pátio.</em>',
  frase:'Seu próximo carro já está no pátio.',sub:'Premium e seminovos selecionados — com procedência conferida, financiamento aprovado em 24h e negociação direta com quem decide.',
  sobre:'',
  estoque:l=>({ok:true,veiculos:formatoCarros(l).map(v=>({...v,g:v.g.filter(u=>/^https:\/\//.test(u))}))})},
 // site original da Machado Veículos: vidro e neon; a cor principal vira o brilho e o degradê
 neon:{paginas:['index.html','estoque.html','financiamento.html','consignacao.html'],segmento:'carros',demo:['#d84cc9','#070409'],
  cores:(c1,c2)=>({'brand-hi':c1,brand:misturar(c1,'#000000',.25),'brand-lt':misturar(c1,'#ffffff',.3),'brand-deep':misturar(c1,'#000000',.68),violet:misturar(c1,'#000000',.4),
   ...(escura(c2)?{bg:c2,'bg-2':misturar(c2,'#ffffff',.02),'bg-3':misturar(c2,'#ffffff',.04)}:{})}),
  fraseHtml:()=>'<span class="line-mask"><span>Seu próximo carro</span></span> <span class="line-mask"><span><em>já está no pátio.</em></span></span>',
  frase:'Seu próximo carro já está no pátio.',sub:'Estoque real e atualizado de seminovos, com financiamento aprovado rápido, avaliação do seu usado na hora e atendimento direto — sem enrolação.',
  sobre:'',
  estoque:l=>{const v=formatoCarros(l);return {ok:true,total:v.length,veiculos:v};}},
 // site original da Glycerio Veículos: fundo claro; a cor principal é o vermelho e a segunda cor o grafite do topo e das faixas
 claro:{paginas:['index.html','estoque.html','financiamento.html','consignacao.html'],segmento:'carros',demo:['#c8131e','#1a1b1f'],
  cores:(c1,c2)=>({red:c1,'red-d':misturar(c1,'#000000',.2),'red-l':misturar(c1,'#ffffff',.9),...(escura(c2)?{grafite:c2,preto:misturar(c2,'#000000',.6)}:{})}),
  fraseHtml:nome=>'Seu próximo carro está no pátio da '+nome,
  frase:'Seu próximo carro está no pátio.',sub:'Seminovos com fotos e ficha completa no site, financiamento com resposta no mesmo dia, seu usado na troca e atendimento direto pelo WhatsApp.',
  sobre:'',
  // formato do Integrador de Estoque LeadVox, que o site original já lia
  estoque:l=>({ok:true,veiculos:l.map((v,k)=>({id:v.id,tipo:v.tipo==='moto'?'moto':'carro',marca:v.marca,modelo:v.modelo,versao:v.versao,
   ano_fabricacao:v.anoFabricacao,ano_modelo:v.anoModelo,km:v.km,cor:v.cor,cambio:v.cambio,combustivel:v.combustivel,categoria:v.categoria,
   preco:v.preco,descricao:v.descricao,opcionais:v.opcionais,destaque:k<4,fotos:v.fotos}))})},
 // site original da Ervatti Veículos: Bodoni, tricolor (verde, branco e vermelho) e capa com foto; a cor principal é o verde
 editorial:{paginas:['index.html','estoque.html','financiamento.html','consignacao.html'],segmento:'carros',demo:['#00944d','#0a0a0c'],
  cores:(c1,c2)=>({verde:c1,'verde-lt':misturar(c1,'#ffffff',.2),...(escura(c2)?{ink:c2}:{})}),
  fraseHtml:()=>'<span class="mask"><span>Seminovos</span></span> <span class="mask"><span>de <span class="it">procedência</span></span></span> <span class="mask"><span>para a família toda.</span></span>',
  frase:'Seminovos de procedência para a família toda.',sub:'Veículos revisados, financiamento facilitado e atendimento sem pressa. Aqui você escolhe com calma — e ninguém fica esperando no corredor.',
  sobre:'Seminovos revisados, atendimento sem pressa e toda a documentação resolvida pela nossa equipe.',
  // o site da Ervatti não buscava o estoque: ele vem escrito na página (mesmos campos do da Machado, com portas e itens de série vazios)
  embutido:l=>formatoCarros(l)},
 // site original da Ultra Motors (ex-El Luxcar): fundo azul-noite e degradê (verde-limão, verde-água e azul); a cor principal é o meio do degradê
 vitrine:{paginas:['index.html','estoque.html','financiamento.html','consignacao.html'],segmento:'carros',demo:['#2fc4b2','#070d1f'],
  cores:(c1,c2)=>({'ember-2':c1,'ember-1':misturar(c1,'#d4ff3a',.45),'ember-3':misturar(c1,'#2f5bf6',.55),
   ...(escura(c2)?{void:c2,carbon:misturar(c2,'#ffffff',.03),slate:misturar(c2,'#ffffff',.07),'slate-2':misturar(c2,'#ffffff',.12)}:{})}),
  fraseHtml:()=>'<span class="mask"><span>Do popular</span></span> <span class="mask"><span>ao <span class="fire">importado</span>.</span></span>',
  frase:'Do popular ao importado.',sub:'Carros nacionais e importados, picapes, SUVs e motos. Se não estiver aqui, a gente busca.',
  sobre:'',
  estoque:l=>{const c=formatoCarros(l).map(v=>({...v,se:[]}));return {ok:true,total:c.length,carros:c};}}
};
// formato dos sites de carro (Elite e Machado): b marca, m modelo, v versão, y ano, km, cam câmbio, comb combustível, p preço (0 = consulte),
// t categoria, f destaque, i capa, g fotos, op opcionais, desc descrição
function formatoCarros(l){
 return l.map((v,k)=>({id:v.id,b:v.marca,m:v.modelo,v:v.versao,y:anoTxt(v),ys:v.anoModelo||0,km:v.km,cam:v.cambio,comb:v.combustivel,cor:v.cor,
  p:v.preco||0,t:categoriaCarro(v),f:k<4?1:0,i:v.fotos[0]||'',g:v.fotos,op:v.opcionais,desc:v.descricao}));
}
// cor escura o bastante para texto claro por cima
function escura(hex){
 if(!hexOk(hex))return false;
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 return .2126*r+.7152*g+.0722*b<.3;
}
const anoTxt=v=>v.anoFabricacao&&v.anoModelo&&v.anoFabricacao!==v.anoModelo?v.anoFabricacao+'/'+v.anoModelo:String(v.anoModelo||v.anoFabricacao||'');
const semAcento=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// categoria do painel nas abas dos sites de carro (SUV, Sedã, Hatch, Picape, Moto)
function categoriaCarro(v){
 const c=semAcento(v.categoria);
 if(v.tipo==='moto'||/moto/.test(c))return 'Moto';if(/suv|crossover/.test(c))return 'SUV';if(/seda/.test(c))return 'Sedã';
 if(/hatch/.test(c))return 'Hatch';if(/picape|pick|caminhonete/.test(c))return 'Picape';
 return v.categoria?titulo(v.categoria):'Carro';
}
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
const js=s=>JSON.stringify(String(s??'')).slice(1,-1).replace(/'/g,"\\'").replace(/</g,'\\u003c').replace(/`/g,'\\u0060').replace(/\$/g,'\\u0024');
const titulo=s=>String(s||'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
const hexOk=v=>/^#[0-9a-f]{6}$/i.test(v||'');

// logo de texto quando a loja ainda não subiu a dela
function logoTexto(nome,cor){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90"><text x="160" y="58" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="'+Math.min(34,Math.floor(470/Math.max(String(nome).length,1)))+'" fill="'+cor+'">'+esc(String(nome).slice(0,40))+'</text></svg>';
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

// Loja de exemplo da prévia (/s/demo/?modelo=…): veículos desenhados no lugar das fotos, para não usar foto de cliente.
export function lojaDemoFiel(nomeModelo){
 const m=MODELOS_FIEIS[nomeModelo];
 if(m&&m.segmento==='carros')return lojaDemoCarros(nomeModelo,m);
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

function lojaDemoCarros(nomeModelo,m){
 const desenho=(cor,k)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><radialGradient id="g" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#2b2b30"/><stop offset="1" stop-color="#0c0c0e"/></radialGradient><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+cor+'"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect y="430" width="800" height="170" fill="#09090b"/><ellipse cx="400" cy="440" rx="330" ry="26" fill="#000" opacity=".55"/><path d="M90 400 L110 330 Q130 300 175 292 L270 282 Q330 '+(214-k*3)+' 420 212 L520 214 Q575 222 625 282 L690 296 Q722 304 726 336 L730 400 Z" fill="url(#c)"/><path d="M290 282 Q340 232 418 230 L512 232 Q552 238 592 282 Z" fill="#0d1117" opacity=".85"/><g fill="#141416" stroke="#d9d9de" stroke-width="10"><circle cx="230" cy="400" r="58"/><circle cx="590" cy="400" r="58"/></g><rect x="672" y="318" width="40" height="12" rx="6" fill="#ffe9a8"/></svg>');
 const v=[['TOYOTA','COROLLA CROSS','XRE 2.0','2023/2024',152900,'SUV',28500],['VOLKSWAGEN','T-CROSS','HIGHLINE 250 TSI','2022/2023',129900,'SUV',41200],['HONDA','CIVIC','EXL 2.0','2021/2021',124900,'Sedã',52000],
  ['JEEP','COMPASS','LONGITUDE T270','2023/2023',139900,'SUV',33800],['FIAT','PULSE','IMPETUS 1.0 TURBO','2024/2024',109900,'SUV',12400],['CHEVROLET','ONIX','LTZ 1.0 TURBO','2022/2023',82900,'Hatch',38700],
  ['HYUNDAI','HB20','PLATINUM 1.0 TGDI','2023/2024',89900,'Hatch',22100],['TOYOTA','HILUX','SRX 2.8 4X4 DIESEL','2022/2022',259900,'Picape',61000]];
 const [c1,c2]=m.demo||['#d6921e','#121110'];
 return {ativo:true,modelo:nomeModelo,publicado:false,
  identidade:{nome:'Loja Demo Veículos',cidade:'sua cidade',cor1:c1,cor2:c2,frase:m.frase,subtitulo:m.sub,
   whatsapp:'21999999999',endereco:'Av. Exemplo, 100 · Centro',horario:'Seg. a sex. 9h às 18h · Sáb. 9h às 14h',instagram:'leadvox.com.br',
   avaliacoes:[{nome:'Cliente Exemplo',texto:'Atendimento excelente do começo ao fim. Saí de carro novo e com a parcela que cabia no bolso.'},
    {nome:'Outra Cliente',texto:'Equipe atenciosa, documentação resolvida pela loja e entrega no mesmo dia.'},
    {nome:'Mais Um Cliente',texto:'Carro revisado, exatamente como nas fotos. Recomendo a loja.'}]},
  itens:v.map((x,k)=>({id:800+k,nome:x[0]+' '+x[1],preco:x[4],categoria:x[5],atributos:{marca:x[0],modelo:x[1],versao:x[2],ano:x[3],km:x[6],
   cambio:'Automático',combustivel:/DIESEL/.test(x[2])?'Diesel':'Flex',cor:['Branco','Prata','Preto','Cinza'][k%4],tipo:'carro',
   opcionais:['Ar-condicionado','Direção elétrica','Central multimídia','Câmera de ré','Bancos em couro'].slice(0,3+k%3),
   obs:'Veículo de exemplo da prévia. Aqui aparece a descrição que a loja escreve no cadastro.'},
   fotos:[desenho(['#c9ccd2','#8a8f98','#1b1d22','#5a5f68'][k%4],k),desenho('#7d1f1f',k)]}))};
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

// "Seu próximo carro<em>já está no pátio.</em>": a segunda parte da frase em destaque
function fraseEm(frase){
 let p=String(frase).split(/(?<=[.!?])\s+/).filter(Boolean);
 if(p.length<2){const w=String(frase).split(/\s+/);const meio=Math.ceil(w.length/2);p=[w.slice(0,meio).join(' '),w.slice(meio).join(' ')];}
 return esc(p[0])+(p.slice(1).join(' ')?'<em>'+esc(p.slice(1).join(' '))+'</em>':'');
}
// frase em até 3 linhas que sobem (como na Ervatti); a última palavra da linha do meio em itálico
// linhas equilibradas pelo tamanho do texto (não pelo número de palavras)
function linhasDe(frase,n){
 const w=String(frase).split(/\s+/).filter(Boolean),alvo=String(frase).length/n,l=[[]];
 for(const p of w){const atual=l[l.length-1];if(atual.length&&atual.join(' ').length+p.length/2>alvo&&l.length<n)l.push([p]);else atual.push(p);}
 return l;
}
// "Seu próximo carro / já está no pátio." em duas linhas que sobem, a segunda em destaque (Machado)
function fraseLinhas(frase){
 const l=linhasDe(frase,2);
 return l.map((p,k)=>'<span class="line-mask"><span>'+(k===l.length-1&&l.length>1?'<em>'+esc(p.join(' '))+'</em>':esc(p.join(' ')))+'</span></span>').join('\n          ');
}
function fraseMask(frase,cls='it'){
 const w=String(frase).split(/\s+/).filter(Boolean),l=linhasDe(frase,w.length<=3?1:w.length<=6?2:3);
 return l.map((p,k)=>'<span class="mask"><span>'+(k===Math.min(1,l.length-1)&&p.length>1?esc(p.slice(0,-1).join(' '))+' <span class="'+cls+'">'+esc(p[p.length-1])+'</span>':esc(p.join(' ')))+'</span></span>').join('\n        ');
}
// horário em linhas "dia | horas", com os dias da semana de cada linha (o site destaca o dia de hoje)
function horarioDias(linhas){
 const D={dom:0,seg:1,ter:2,qua:3,qui:4,sex:5,sab:6};
 return linhas.map(l=>{
  const i=l.search(/\d/),dia=(i>0?l.slice(0,i):l).replace(/[,:\s]+$/,'').trim(),horas=i>0?l.slice(i).trim():'';
  const t=semAcento(dia).match(/dom|seg|ter|qua|qui|sex|sab/g)||[];
  let dias=t.map(x=>D[x]);
  if(t.length===2&&/\ba\b|-|até/.test(semAcento(dia))){dias=[];for(let d=D[t[0]];d!==D[t[1]];d=(d+1)%7)dias.push(d);dias.push(D[t[1]]);}
  return '<li data-dias="'+dias.join(',')+'"><span>'+esc(dia||l)+'</span><span>'+esc(horas)+'</span></li>';
 }).join('');
}
const url=s=>encodeURIComponent(String(s??'')).replace(/'/g,'%27');
const FOTO_VAZIA='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#151517"/></svg>');

export function renderFiel({nomeModelo,pagina,dados,conta}){
 const m=MODELOS_FIEIS[nomeModelo];if(!m||!m.paginas.includes(pagina))return null;
 const id=dados.identidade||{},itens=Array.isArray(dados.itens)?dados.itens:[];
 const nome=id.nome||'Loja',cidade=id.cidade||'sua região';
 const c1=hexOk(id.cor1)?id.cor1:m.demo[0],c2=hexOk(id.cor2)?id.cor2:m.demo[1];
 const av=avaliacoes(id),fotos=fotosDoEstoque(itens),mostrar=mostrarDo(id);
 const zap=String(id.whatsapp||'').replace(/\D/g,''),zap55=zap&&zap.length<=11?'55'+zap:zap;
 const tel=id.telefone||(zap.length>=10?'('+zap.slice(-11,-9)+') '+zap.slice(-9,-4)+'-'+zap.slice(-4):'');
 const google='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(nome+' '+cidade);
 const mapa=/^https:\/\//.test(id.mapa||'')?id.mapa:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([nome,id.endereco,cidade].filter(Boolean).join(', '));
 const cfg={whatsapp:zap55,telefone:tel,endereco:id.endereco||'',mapsBusca:[nome,id.endereco||cidade].filter(Boolean).join(', '),instagram:id.instagram||'',
  instaPosts:'',instaSeguidores:'',googleAvaliacoes:google,googleAvaliar:google,politicaPrivacidade:'#',siteBase:'',
  estoqueApi:'/api/site/estoque?loja='+conta,autocertoUnidade:0,leadWebhook:'',webchatToken:'',
  webchatBase:'https://chatapi.leadvox.com.br',webchatSdk:'https://chat.leadvox.com.br/webchat/sdk.js',semKm:!mostrar.km};
 const logo=/^https:\/\//.test(id.logo||'')?id.logo:logoTexto(nome,c1);
 const insta=id.instagram?'https://www.instagram.com/'+id.instagram+'/':'#lv-sem-insta';
 const marcas=[...new Set(itens.map(it=>titulo((it.atributos||{}).marca)).filter(Boolean))].slice(0,12);
 const marcasHtml=marcas.length?[...marcas,...marcas].map(x=>'<span>'+esc(x)+'</span>').join(''):'';
 const h=horarios(id.horario),horario=h.join(' · ');
 const frase=id.frase||m.frase,sub=id.subtitulo||m.sub,sobre=id.sobre||m.sobre;
 // textos: o mesmo campo em 4 escapes (HTML, string de programação, atributo e dentro de link)
 const telZap=zap.length>=10?'('+zap.slice(-11,-9)+') '+zap.slice(-9,-4)+'-'+zap.slice(-4):'';
 const textos={nome,cidade,endereco:id.endereco||cidade,enderecoCidade:[id.endereco,cidade].filter(Boolean).join(', '),tel:tel||'WhatsApp',telZap:telZap||tel,horario,frase,sub,sobre,
  mapa,instaUrl:id.instagram?insta:'',instaUser:id.instagram||''};
 const valores={'j:conta':js(conta),'u:conta':url(conta),'n:zap':zap55||'0','n:fone':(()=>{const f=String(id.telefone||'').replace(/D/g,'');return f.length>=10?(f.length<=11?'55'+f:f):(zap55||'0');})(),'n:semKm':mostrar.km?'0':'1',
  'a:logo':esc(logo),'a:insta':esc(insta),'a:mapa':esc(mapa),'a:ogimg':esc(fotos[0]||''),
  'json:cfg':JSON.stringify(cfg).replace(/</g,'\\u003c'),
  'bloco:frase':fraseAnimada(frase),'bloco:fraseEm':fraseEm(frase),'bloco:prova':prova(av),'bloco:marcas':marcasHtml,
  'bloco:avaliacoes':av.map(cardAvaliacao).join(''),'bloco:avaliacoesFaixa':av.map(cardAvaliacao).join(''),
  'bloco:horarioP':h.map(x=>'<p>'+esc(x)+'</p>').join(''),'bloco:horarioLi':h.map(x=>'<li>'+esc(x)+'</li>').join(''),'bloco:horarioBr':h.map(esc).join('<br>'),'bloco:horarioDias':horarioDias(h),
  'bloco:ld':'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'AutoDealer',name:nome,
   address:{'@type':'PostalAddress',streetAddress:id.endereco||'',addressLocality:cidade,addressCountry:'BR'},telephone:tel||undefined,
   url:undefined,openingHours:horario}).replace(/</g,'\\u003c')+'</script>'};
 for(const [k,v] of Object.entries(textos)){valores['h:'+k]=esc(v);valores['j:'+k]=js(v);valores['a:'+k]=esc(v);valores['u:'+k]=esc(url(v));}
 // fotos e nomes dos primeiros veículos do estoque (capas e destaques do site original)
 for(let k=1;k<=6;k++){
  valores['a:foto'+k]=esc(fotos[(k-1)%Math.max(fotos.length,1)]||FOTO_VAZIA);
  const it=itens.filter(x=>(x.fotos||[]).some(u=>/^https:\/\//.test(u)))[(k-1)%Math.max(fotos.length,1)]||itens[k-1]||{};
  const a=it.atributos||{};valores['h:destaque'+k]=esc([titulo(a.marca),a.modelo||it.nome,a.versao].filter(Boolean).join(' ')||nome);
 }
 // estoque escrito na própria página (sites que não buscavam o estoque, como o da Ervatti) e números da capa
 const lista=estoqueParaSite(itens,mostrar);
 if(m.embutido)valores['json:carros']=JSON.stringify(m.embutido(lista)).replace(/</g,'\\u003c');
 valores['json:marcas']=JSON.stringify(marcas).replace(/</g,'\\u003c');
 // sem frase própria, a capa fica com o texto original do site (mesma marcação)
 const original=!id.frase&&m.fraseHtml?m.fraseHtml(esc(nome)):null;
 valores['bloco:fraseMask']=original||fraseMask(frase);valores['bloco:fraseFire']=original||fraseMask(frase,'fire');
 valores['bloco:fraseEm']=original||fraseEm(frase);valores['bloco:fraseLinhas']=original||fraseLinhas(frase);valores['bloco:fraseClaro']=original||esc(frase);
 const anos=lista.map(v=>v.anoModelo).filter(Boolean),tipos=new Set(lista.map(v=>categoriaCarro(v)));
 valores['n:marcas']=String(marcas.length);valores['n:anoNovo']=String(anos.length?Math.max(...anos):0);
 valores['bloco:kpisNum']=[[lista.length,'Veículos no pátio'],[marcas.length,'Marcas no estoque'],[anos.length?Math.max(...anos):0,'Ano mais novo'],[tipos.size,'Tipos de carroceria']]
  .map(([n,t])=>'<div class="kpi"><b data-num="'+(Number(n)||0)+'">0</b><span>'+esc(t)+'</span></div>').join('');
 Object.assign(valores,m.valores?.({id,itens,av,nome,cidade,esc,js})||{});
 let html=modelo(nomeModelo,pagina);
 // seções que dependem de dados: sem avaliações ou sem Instagram, a seção some
 if(!av.length)html=html.replace(/<!--lv:se:avaliacoes-->[\s\S]*?<!--lv:fim:avaliacoes-->/g,'');
 if(!id.instagram)html=html.replace(/<!--lv:se:instagram-->[\s\S]*?<!--lv:fim:instagram-->/g,'');
 html=html.replace(/\{\{([a-z]+:[A-Za-z0-9]+)\}\}/g,(t,k)=>k in valores?valores[k]:'');
 const tons=m.cores(c1,c2);
 const estilo='<style id="lv-cores">:root{'+Object.entries(tons).map(([k,v])=>'--'+k+':'+v).join(';')+'}'+(id.instagram?'':'a[href="#lv-sem-insta"]{display:none!important}')+'</style>';
 const robots=dados.publicado?'':'<meta name="robots" content="noindex">';
 html=html.replace('</head>',robots+estilo+'</head>');
 if(!/^demo(-|$)/.test(conta))html=html.replace('</body>','<script src="/site/tema.js" data-loja="'+esc(conta)+'" defer></script></body>');
 return html;
}
// Estoque do site no formato que cada modelo lê (o da MG lê o formato comum)
export function estoqueDoModelo(nomeModelo,lista){
 const m=MODELOS_FIEIS[nomeModelo];
 return m&&m.estoque?m.estoque(lista):lista;
}
