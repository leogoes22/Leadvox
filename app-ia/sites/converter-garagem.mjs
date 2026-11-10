// Converte o site original da MG Motos (repositório leogoes22/mgmotos) no modelo fiel "garagem".
// Mantém estrutura, efeitos e programação; troca só o que é da MG por campos que o painel preenche.
// Uso: node sites/converter-garagem.mjs <pasta do repositório mgmotos>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const origem=process.argv[2];
if(!origem)throw Error('Informe a pasta do repositório mgmotos.');
const destino=path.join(path.dirname(fileURLToPath(import.meta.url)),'garagem');
mkdirSync(destino,{recursive:true});
const PAGINAS=['index.html','estoque.html','financiamento.html','venda-sua-moto.html'];
const relatorio=[];

function trocar(h,de,para,minimo,nome){
 const n=typeof de==='string'?h.split(de).length-1:(h.match(new RegExp(de.source,de.flags.includes('g')?de.flags:de.flags+'g'))||[]).length;
 if(n<(minimo??1))throw Error(nome+': esperava achar '+(minimo??1)+', achei '+n);
 relatorio.push(nome+': '+n);
 return typeof de==='string'?h.split(de).join(para):h.replace(de,para);
}
// troca dentro e fora dos <script> com marcas diferentes (HTML escapa diferente de string JavaScript)
function porContexto(h,fn){
 return h.split(/(<script\b[\s\S]*?<\/script>)/).map((parte,i)=>fn(parte,i%2===1)).join('');
}
function bloco(h,inicio,fim,para,nome){
 const a=h.indexOf(inicio);if(a<0)throw Error(nome+': início não achado');
 const b=h.indexOf(fim,a+inicio.length);if(b<0)throw Error(nome+': fim não achado');
 relatorio.push(nome+': ok');
 return h.slice(0,a)+para+h.slice(b+fim.length);
}

for(const pagina of PAGINAS){
 let h=readFileSync(path.join(origem,pagina),'utf8');
 relatorio.push('### '+pagina);
 // camada de temas colada antes: o motor coloca de novo com a conta certa
 h=h.replace(/<!-- LeadVox: temas de datas e campanha, ligados pelo painel -->\s*<script src="https:\/\/ia\.leadvox\.com\.br\/site\/tema\.js"[^>]*><\/script>\s*/,'');
 // configuração da loja: o motor escreve a da loja (WhatsApp, endereço, Instagram, estoque do painel…)
 {const a=h.indexOf('var MG = {'),s=h.indexOf('webchatSdk:',a),b=h.indexOf('};',s);
  if(a<0||s<0||b<0)throw Error('configuração não achada');
  h=h.slice(0,a)+'var MG = {{json:cfg}};'+h.slice(b+2);relatorio.push('configuração: ok');}
 // estoque e galerias da MG embutidos: saem (o estoque vem do painel)
 h=trocar(h,/var ESTOQUE_ATUAL = \[[\s\S]*?\n\];/,'var ESTOQUE_ATUAL = [];',1,'estoque embutido');
 h=trocar(h,/var GALERIAS = \{[\s\S]*?\};/,'var GALERIAS = {};',1,'galerias embutidas');
 // cores da MG escritas com transparência (brilhos, sombras, bordas): passam a seguir as cores da loja
 const mistura=(v)=>(m,a)=>'color-mix(in srgb,var(--'+v+') '+Math.round(parseFloat(a)*100)+'%,transparent)';
 h=h.replace(/rgba\(\s*214\s*,\s*146\s*,\s*30\s*,\s*([\d.]+)\s*\)/g,mistura('ambar'))
  .replace(/rgba\(\s*242\s*,\s*196\s*,\s*107\s*,\s*([\d.]+)\s*\)/g,mistura('luz'))
  .replace(/rgba\(\s*18\s*,\s*17\s*,\s*16\s*,\s*([\d.]+)\s*\)/g,mistura('ripado'));
 // logo da MG (PNG embutido): logo da loja (PNG, JPG ou a logo de texto, por isso o ícone fica sem tipo fixo)
 h=h.replace('<link rel="icon" type="image/png" href=','<link rel="icon" href=');
 h=trocar(h,/data:image\/png;base64,[A-Za-z0-9+/=]+/g,'{{a:logo}}',1,'logo');
 // foto de compartilhamento: primeira foto do estoque da loja
 h=trocar(h,/(<meta property="og:image" content=")[^"]*/,'$1{{a:ogimg}}',1,'og:image');
 // estrela de Davi da fachada da MG (marca dela) vira um anel no palco
 if(h.includes('<path d="M300 34 L530 432 L70 432 Z"/>'))h=trocar(h,'<path d="M300 34 L530 432 L70 432 Z"/><path d="M300 566 L530 168 L70 168 Z"/>','<path d="M50 300 A250 250 0 1 1 550 300 A250 250 0 1 1 50 300 Z"/><path d="M110 300 A190 190 0 1 1 490 300 A190 190 0 1 1 110 300 Z"/>',1,'estrela do palco');
 if(pagina==='index.html'){
  // título animado da capa: cada palavra continua entrando separada
  h=trocar(h,/<h1><span class="l"><span class="w" style="--i:0">Não<\/span>[\s\S]*?<\/h1>/,'<h1>{{bloco:frase}}</h1>',1,'frase da capa');
  h=trocar(h,/<p class="hero-lead">[\s\S]*?<\/p>/,'<p class="hero-lead">{{h:sub}}</p>',1,'subtítulo');
  h=trocar(h,/<div class="hero-prova">[\s\S]*?<\/p><\/div>/,'{{bloco:prova}}',1,'avaliação na capa');
  h=trocar(h,/<div class="letreiro-trilho">[\s\S]*?<\/div>/,'<div class="letreiro-trilho">{{bloco:marcas}}</div>',1,'faixa de marcas');
  h=trocar(h,/<div class="av-grade">[\s\S]*?<\/article><\/div>/,'<div class="av-grade">{{bloco:avaliacoes}}</div>',1,'avaliações');
  h=trocar(h,'<section class="sec avaliacoes" id="avaliacoes">','<!--lv:se:avaliacoes--><section class="sec avaliacoes" id="avaliacoes">',1,'avaliações (início)');
  h=h.replace(/(<section class="sec avaliacoes" id="avaliacoes">[\s\S]*?<\/section>)/,'$1<!--lv:fim:avaliacoes-->');
  h=trocar(h,'<section class="sec" id="instagram">','<!--lv:se:instagram--><section class="sec" id="instagram">',1,'instagram (início)');
  h=h.replace(/(<section class="sec" id="instagram">[\s\S]*?<\/section>)/,'$1<!--lv:fim:instagram-->');
  h=trocar(h,/<div class="insta-nums">[\s\S]*?<\/div>/,'',1,'números do Instagram');
  h=trocar(h,/<p class="insta-bio">[\s\S]*?<\/p>/,'<p class="insta-bio">{{h:frase}}<br>Compra, venda e troca.</p>',1,'bio do Instagram');
  h=trocar(h,'A estrela acesa na parede é a nossa. Passe aqui para ver as motos e conversar com a equipe.','{{h:sobre}}',1,'texto da loja');
  h=trocar(h,'<p>Segunda a sexta, das 9h às 18h</p><p>Sábado, das 9h às 14h</p>','{{bloco:horarioP}}',1,'horário (loja)');
 }
 if(pagina==='index.html'){
  // as 3 portas ("Escolha a sua", "Financie", "Troque ou venda") mostravam motos do estoque da MG: agora, fotos do estoque da loja
  let k=0;h=trocar(h,/https:\/\/www\.autocerto\.com\/fotos\/4425\/\d+\/[\d_]+\.jpg/g,()=>'{{a:foto'+(++k)+'}}',3,'fotos das portas');
 }
 if(pagina==='estoque.html'){
  h=trocar(h,/<div class="av-faixa">[\s\S]*?<\/article><\/div>/,'<div class="av-faixa">{{bloco:avaliacoesFaixa}}</div>',1,'avaliações (faixa)');
  h=trocar(h,'<section class="sec avaliacoes" style="padding-top:40px">','<!--lv:se:avaliacoes--><section class="sec avaliacoes" style="padding-top:40px">',1,'avaliações (faixa, início)');
  h=h.replace(/(<section class="sec avaliacoes" style="padding-top:40px">[\s\S]*?<\/section>)/,'$1<!--lv:fim:avaliacoes-->');
 }
 if(pagina==='financiamento.html'||pagina==='venda-sua-moto.html')
  h=trocar(h,/<div class="hero-prova">[\s\S]*?<\/p><\/div>/,'{{bloco:prova}}',1,'avaliação na capa');
 if(pagina==='venda-sua-moto.html')h=trocar(h,'vende direto para a MG.','vende direto para a {{h:nome}}.',2,'venda para a loja');
 // origem dos formulários: a conta da loja
 h=trocar(h,"origem:'site-mgmotos'","origem:'site-{{j:conta}}'",1,'origem dos formulários');
 h=trocar(h,'<li>Seg. a sex. 9h às 18h</li><li>Sáb. 9h às 14h</li>','{{bloco:horarioLi}}',1,'horário (rodapé)');
 // estrela da MG usada como ícone (faixa de marcas e outros): vira um losango; na faixa, pinta com a cor da loja
 h=h.split('M12 2l8.66 15H3.34zM12 22L3.34 7h17.32z').join('M12 3l9 9-9 9-9-9z');
 h=h.replace(/(\.letreiro span::after\{[^}]*?)background:url\("(data:image\/svg\+xml,[^"]*?)stroke='%23D6921E'([^"]*)"\) center\/contain no-repeat\}/,
  (m,ini,a,b)=>ini+'background:var(--ambar);-webkit-mask:url("'+a+"stroke='black'"+b+'") center/contain no-repeat;mask:url("'+a+"stroke='black'"+b+'") center/contain no-repeat}');
 // ficha do veículo: descrição do cadastro (o original não tinha) e km escondido pelo lojista vira "Consulte"
 h=trocar(h,"comb: v.combustivel || v.Combustivel || ''","comb: v.combustivel || v.Combustivel || '', desc: v.descricao || ''",1,'descrição (leitura)');
 h=trocar(h,`'<div class="ficha-preco"><small>Valor à vista</small>`,`(m.desc ? '<p class="ficha-desc">' + esc(m.desc) + '</p>' : '') +\n    '<div class="ficha-preco"><small>Valor à vista</small>`,1,'descrição (ficha)');
 h=trocar(h,/(\.caracs svg\{[^}]*\})/,'$1\n.ficha-desc{margin:18px 0 0;color:#CFC8BC;font-size:.95rem;line-height:1.6;white-space:pre-line}',1,'descrição (estilo)');
 h=trocar(h,"v == null ? 'Km não informado'","v == null ? (MG.semKm ? 'Consulte' : 'Km não informado')",1,'km escondido');
 // estado fixo da MG no título: sai (a cidade do painel já diz onde fica)
 h=h.split('Nova Iguaçu — RJ').join('Nova Iguaçu');
 // nome e cidade: no HTML e nas strings de programação, cada um com o seu escape
 h=porContexto(h,(parte,ehScript)=>parte
  .split('MG Motos').join(ehScript?'{{j:nome}}':'{{h:nome}}')
  .split('Nova Iguaçu').join(ehScript?'{{j:cidade}}':'{{h:cidade}}'));
 writeFileSync(path.join(destino,pagina),h);
}
console.log(relatorio.join('\n'));
