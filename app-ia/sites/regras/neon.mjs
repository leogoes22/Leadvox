// Modelo Neon = site original da Machado Veículos (repositório leogoes22/machadoveiculos): vidro, neon e brilho que segue o mouse.
// O que era da Machado (nome, Vilar dos Teles, telefones, endereço, mapa, Instagram, estoque e fotos) vira campo do painel.
export default {
 paginas:{'index.html':'index.html','estoque.html':'estoque.html','financiamento.html':'financiamento.html','consignacao.html':'consignacao.html'},
 proibido:[/[Mm]achado/,/MACHADO/,/Meriti/,/Vilar/,/Salvador, 497/,/98115|981150993|96463|964637409/,/autocerto\.com\/fotos\/1171/,/lv-mktdeconversa/,/\{b:"/,/-22\.789|43\.363/,/maps\.app\.goo\.gl\/4hM/,/[Mm]ais de 35/],
 passos(h,pagina,{trocar,talvez,porContexto,corVariavel}){
  // estoque: o da Machado sai e o endereço passa a ser o do painel (formato que o site lê)
  h=talvez(h,'var endpoint = "https://webhook.lv-mktdeconversa.com/webhook/estoque-machado"','var endpoint = "/api/site/estoque?loja={{u:conta}}&modelo=neon"','endereço do estoque (busca antecipada)');
  h=talvez(h,'var ESTOQUE_API = "https://webhook.lv-mktdeconversa.com/webhook/estoque-machado";','var ESTOQUE_API = "/api/site/estoque?loja={{u:conta}}&modelo=neon";','endereço do estoque');
  h=talvez(h,/var CARS = \[[\s\S]*?\n\];/,'var CARS = [];','estoque embutido');
  h=talvez(h,'var FOTO_BASE = "https://www.autocerto.com/fotos/1171/";','var FOTO_BASE = "";','base das fotos');
  h=talvez(h,'Extraído do site oficial (machadosveiculos.com.br).','Vem do estoque do painel.','comentário');
  // fotos do painel já vêm com o endereço completo
  h=talvez(h,'return nome ? (FOTO_BASE + carro.id + "/" + nome + ".jpg") : "";','return nome ? (/^(https?:|data:)/.test(nome) ? nome : FOTO_BASE + carro.id + "/" + nome + ".jpg") : "";','fotos com endereço completo');
  // km: vazio fica vazio; escondido pelo lojista aparece como "Km: consulte"
  h=trocar(h,'window.kmFmt = function(n){ return n ? (n.toLocaleString("pt-BR") + " km") : "0 km"; };',
   'var SEM_KM = {{n:semKm}} === 1;\nwindow.kmFmt = function(n){ return n == null || n === "" ? (SEM_KM ? "Km: consulte" : "Km não informado") : (n ? (n.toLocaleString("pt-BR") + " km") : "0 km"); };',1,'km');
  // descrição do cadastro na ficha do veículo
  h=talvez(h,`    '<p class="vinfo-nota">Informações fornecidas pela loja`,`    (c.desc ? '<div class="vficha"><h3>Descrição</h3><p class="vinfo-desc">' + esc(c.desc) + '</p></div>' : '') +\n\n    '<p class="vinfo-nota">Informações fornecidas pela loja`,'descrição na ficha');
  h=trocar(h,'</head>','<style>.vinfo-desc{color:var(--dim);line-height:1.65;white-space:pre-line;font-size:.95rem}</style>\n</head>',1,'estilo da descrição');
  // cores da Machado escritas com transparência seguem as do painel
  h=corVariavel(h,[216,76,201],'brand-hi');h=corVariavel(h,[166,22,155],'brand');h=corVariavel(h,[123,47,247],'violet');
  h=corVariavel(h,[7,4,9],'bg');h=corVariavel(h,[10,6,16],'bg-2');
  h=h.replace(/MACHADO VEÍCULOS — /g,'MODELO NEON — ');

  // afirmações da Machado que dependem do estoque dela
  h=talvez(h,'O estoque completo tem mais de 35 opções, entre hatches, sedãs, SUVs e motos.','O estoque completo tem mais opções, entre hatches, sedãs, SUVs e motos.','quantidade de carros');
  h=talvez(h,'Mais de 35 seminovos revisados,','Seminovos revisados,','quantidade de carros (loja)');
  if(pagina==='index.html'){
   h=trocar(h,/<h1>\s*<span class="line-mask"><span>Seu próximo carro<\/span><\/span>\s*<span class="line-mask"><span><em>já está no pátio\.<\/em><\/span><\/span>\s*<\/h1>/,'<h1>{{bloco:fraseLinhas}}</h1>',1,'frase da capa');
   h=trocar(h,/(<p class="lede reveal" data-hero>)Estoque real e atualizado de seminovos[^<]*<\/p>/,'$1{{h:sub}}</p>',1,'subtítulo');
   h=trocar(h,/<img src="https:\/\/www\.autocerto\.com\/fotos\/1171\/\d+\/[\d_]+\.jpg" alt="Kia Sportage[^"]*"/,'<img src="{{a:foto1}}" alt="Veículo em estoque na Machado Veículos"',1,'foto da capa');
   h=trocar(h,/<img src="https:\/\/www\.autocerto\.com\/fotos\/1171\/\d+\/[\d_]+\.jpg" alt="Chevrolet Onix 2025[^"]*"/,'<img src="{{a:foto2}}" alt="{{h:destaque2}} no estoque da Machado Veículos"',1,'foto do destaque');
   h=trocar(h,'<div class="cap"><b>Chevrolet Onix 2025</b>','<div class="cap"><b>{{h:destaque2}}</b>',1,'nome do destaque');
   h=trocar(h,'<h3>Machado <em>Veículos</em></h3>','<h3>{{h:nome}}</h3>',1,'nome no cartão do mapa');
   h=trocar(h,'Seg. a sex. das 9h às 18h e sáb. das 9h às 16h.','{{h:horario}}.',1,'horário (loja)');
   h=trocar(h,'<p>Segunda a sexta: 9h às 18h<br>Sábado: 9h às 16h</p>','<p>{{bloco:horarioBr}}</p>',1,'horário (mapa)');
   h=trocar(h,'Estamos na R. Salvador, 497 — Vilar dos Teles, São João de Meriti/RJ, de segunda a sexta das 9h às 18h e sábado das 9h às 16h.',
    'Estamos na {{j:endereco}}, em {{j:cidade}}. Horário: {{j:horario}}.',1,'pergunta sobre visita');
   // mapa: endereço da loja no lugar das coordenadas da Machado
   h=trocar(h,'https://www.google.com/maps/dir/?api=1&destination=-22.7893328,-43.3637443&destination_place_id=Machado+Ve%C3%ADculos','https://www.google.com/maps/dir/?api=1&destination={{u:enderecoCidade}}',1,'rota');
   h=trocar(h,'https://www.google.com/maps?q=-22.7893328,-43.3637443&hl=pt-BR&z=17&output=embed','https://www.google.com/maps?q={{u:enderecoCidade}}&hl=pt-BR&z=16&output=embed',1,'mapa');
   h=trocar(h,'title="Mapa da Machado Veículos — R. Salvador, 497, Vilar dos Teles, São João de Meriti/RJ"','title="Mapa da {{a:nome}} — {{a:enderecoCidade}}"',1,'título do mapa');
   h=trocar(h,'<b>R. Salvador, 497 — Vilar dos Teles</b>','<b>{{h:endereco}}</b>',1,'endereço (mapa)');
   h=trocar(h,'<span>São João de Meriti — RJ</span>','<span>{{h:cidade}}</span>',1,'cidade (mapa)');
   h=trocar(h,'<a href="https://api.whatsapp.com/send?phone=5521964637409&text=Ol%C3%A1!%20Vim%20pelo%20site." target="_blank" rel="noopener">WhatsApp (21) 96463-7409</a>',
    '<a href="https://api.whatsapp.com/send?phone={{n:zap}}&text=Ol%C3%A1!%20Vim%20pelo%20site." target="_blank" rel="noopener">WhatsApp {{h:telZap}}</a>',1,'WhatsApp (mapa)');
  }else{
   h=trocar(h,/<div class="page-hero-bg"><img src="https:\/\/www\.autocerto\.com\/fotos\/1171\/\d+\/[\d_]+\.jpg"/,'<div class="page-hero-bg"><img src="{{a:foto'+({'estoque.html':2,'financiamento.html':3,'consignacao.html':4})[pagina]+'}}"',1,'foto do topo');
  }
  h=talvez(h,'https://maps.app.goo.gl/4hMFvvYcbDoSA4A5A','{{a:mapa}}','link do Google Maps');
  // endereço e cidade (do mais longo para o mais curto)
  h=trocar(h,'R. Salvador, 497 — Vilar dos Teles<br>São João de Meriti — RJ','{{h:endereco}}<br>{{h:cidade}}',1,'endereço (rodapé)');
  h=trocar(h,'<li>Seg a Sex: 9h às 18h<br>Sáb: 9h às 16h</li>','<li>{{bloco:horarioBr}}</li>',1,'horário (rodapé)');
  h=trocar(h,'https://www.instagram.com/machado__veiculos/','{{a:insta}}',2,'Instagram');
  h=trocar(h,'5521964637409','{{n:zap}}',2,'WhatsApp');
  h=trocar(h,'5521981150993','{{n:fone}}',1,'telefone');
  h=talvez(h,'Machado%20Ve%C3%ADculos','{{u:nome}}','nome nos links');
  h=porContexto(h,[
   ['R. Salvador, 497 — Vilar dos Teles, São João de Meriti/RJ','enderecoCidade'],['(21) 98115-0993','tel'],['(21) 96463-7409','telZap'],
   ['Machado Veículos — Vilar dos Teles, São João de Meriti/RJ','nome'],['Vilar dos Teles &middot; São João de Meriti, RJ','cidade'],['Vilar dos Teles · São João de Meriti','cidade'],
   ['Vilar dos Teles, São João de Meriti - RJ','cidade'],['Vilar dos Teles, São João de Meriti','cidade'],['São João de Meriti, RJ','cidade'],['São João de Meriti/RJ','cidade'],['São João de Meriti','cidade'],['Vilar dos Teles','cidade'],
   ['Machado Veículos','nome'],['Machado','nome']]);
  // no título da aba o site tira " — <nome>" com uma expressão: o nome entra escapado para expressão também
  h=trocar(h,'document.title.replace(/^.*— {{j:nome}}$/, "{{j:nome}}")','(/ — {{j:nome}}$/.test(document.title) ? "{{j:nome}}" : document.title)',0,'título da aba');
  h=h.split('/ — {{j:nome}}$/.test(document.title)').join('document.title.slice(-" — {{j:nome}}".length) === " — {{j:nome}}"');
  return h;
 }
};
