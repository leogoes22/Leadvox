// Modelo Editorial = site original da Ervatti Veículos (repositório leogoes22/ervattiveiculos): serifada Bodoni, tricolor e capa com foto.
// O que era da Ervatti (duas lojas, área kids, telefones, e-mail, Facebook, fotos da fachada, estoque embutido) sai ou vira campo do painel.
export default {
 paginas:{'index.html':'index.html','estoque.html':'estoque.html','financiamento.html':'financiamento.html','consignacao.html':'consignacao.html'},
 proibido:[/[Ee]rvatti/,/ERVATTI/,/Magalh/,/Fontenelle/,/99142|991425886|3435|2422-0557|552124220557|552134356647/,/outlook/,/newervatti/,/autocerto\.com\/fotos\/1101/,/s7LgyNjs/,/-22\.879|43\.415/,
  /área kids|Área Kids|area kids/,/duas lojas|Duas lojas|duas unidades|nas duas/,/28 mil/,/desde 2019|sete anos/,/index-B-foto/,/data:image\/jpeg/],
 // antes da troca das logos: as fotos da fachada e da loja (JPEG embutido) viram fotos do estoque
 antes(h,pagina,{trocar}){
  let k=0;
  return trocar(h,/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g,()=>'{{a:foto'+(++k)+'}}',1,'fotos da loja');
 },
 passos(h,pagina,{trocar,talvez,porContexto,corVariavel}){
  // estoque embutido: o servidor escreve o da loja no mesmo formato (as fotos já vêm com o endereço completo)
  h=trocar(h,/var CARROS = \[[\s\S]*?\n\];/,'var CARROS = {{json:carros}};',1,'estoque embutido');
  h=trocar(h,'var FOTO_BASE = "https://www.autocerto.com/fotos/1101/";','var FOTO_BASE = "";',1,'base das fotos');
  h=trocar(h,'return nome ? (FOTO_BASE + v.id + "/" + nome + ".jpg") : "";','return nome ? (/^(https?:|data:)/.test(nome) ? nome : FOTO_BASE + v.id + "/" + nome + ".jpg") : "";',1,'fotos com endereço completo');
  h=talvez(h,/Extraído do site oficial \(ervattiseminovos\.com\.br\),\s*plataforma AutoCerto — código da loja 1101\./,'Vem do estoque do painel.','comentário');
  h=h.replace(/ERVATTI VEÍCULOS — /g,'MODELO EDITORIAL — ').split('Área Kids (papel)').join('Seção em papel').split('ÁREA KIDS — a página de papel').join('SEÇÃO EM PAPEL');
  // km e descrição
  h=trocar(h,'window.kmFmt = function(n){ return n ? (n.toLocaleString("pt-BR") + " km") : "0 km"; };',
   'var SEM_KM = {{n:semKm}} === 1;\nwindow.kmFmt = function(n){ return n == null || n === "" ? (SEM_KM ? "Consulte" : "Não informado") : (n ? (n.toLocaleString("pt-BR") + " km") : "0 km"); };',1,'km');
  h=trocar(h,/(  var se = \(v\.se && v\.se\.length\) \?[\s\S]*?'<\/ul><\/div>' : "";)/,
   `$1\n  se += v.desc ? '<div class="vi-sec"><h3><span class="tri"><i></i><i></i><i></i></span>Descrição</h3><p class="vi-desc">' + esc(v.desc) + '</p></div>' : "";`,1,'descrição na ficha');
  h=trocar(h,'</head>','<style>.vi-desc{color:var(--dim);line-height:1.65;white-space:pre-line;font-size:.95rem;margin-top:12px}</style>\n</head>',1,'estilo da descrição');
  // telefones e e-mail: o site usa estas variáveis nos botões
  h=trocar(h,'window.TEL_FIXO_1 = "+552134356647";','window.TEL_FIXO_1 = "+{{n:fone}}";',1,'telefone 1');
  h=trocar(h,'window.TEL_FIXO_2 = "+552124220557";','window.TEL_FIXO_2 = "";',1,'telefone 2');
  h=trocar(h,'window.EMAIL = "ervatti.veiculos@outlook.com";','window.EMAIL = "";',1,'e-mail');
  // cores escritas com transparência
  h=corVariavel(h,[0,148,77],'verde');h=corVariavel(h,[10,10,12],'ink');
  h=h.split('index-B-foto-de-fundo.html').join('index.html');

  // rodapé e contato: uma loja, os telefones e o Instagram do painel
  h=trocar(h,'Compra, venda, troca e financiamento de seminovos em Magalhães Bastos, Rio de Janeiro. Duas lojas na Av. Marechal Fontenelle desde 2019.',
   'Compra, venda, troca e financiamento de seminovos em {{h:cidade}}.',1,'rodapé (texto)');
  h=trocar(h,/\s*<a href="https:\/\/www\.facebook\.com\/newervatti"[^\n]*<\/a>/,'',1,'Facebook');
  h=trocar(h,/<li>Av\. Marechal Fontenelle, 4805 — loja A<\/li>\s*<li>Av\. Marechal Fontenelle, 4159<\/li>\s*<li>Magalhães Bastos · Rio de Janeiro\/RJ<\/li>\s*<li><a href="tel:\+552134356647">\(21\) 3435-6647<\/a><\/li>\s*<li><a href="tel:\+552124220557">\(21\) 2422-0557<\/a><\/li>\s*(<li><a href="https:\/\/api\.whatsapp\.com\/send\?phone=5521991425886&text=Ol%C3%A1!" target="_blank" rel="noopener">)\(21\) 99142-5886 — WhatsApp<\/a><\/li>\s*<li><a href="mailto:ervatti\.veiculos@outlook\.com">ervatti\.veiculos@outlook\.com<\/a><\/li>/,
   '<li>{{h:endereco}}</li>\n          <li>{{h:cidade}}</li>\n          <li><a href="tel:+{{n:fone}}">{{h:tel}}</a></li>\n          $1{{h:telZap}} — WhatsApp</a></li>',1,'rodapé (contato)');
  h=trocar(h,'https://www.instagram.com/ervatti.veiculos/','{{a:insta}}',2,'Instagram');
  h=trocar(h,'https://maps.app.goo.gl/s7LgyNjsRYWJgS3C8','{{a:mapa}}',1,'link do mapa');

  if(pagina==='index.html'){
   h=trocar(h,/<title>[^<]*<\/title>/,'<title>{{h:nome}} — Seminovos de procedência em {{h:cidade}}</title>',1,'título');
   h=trocar(h,/(<meta (?:name="description"|property="og:description") content=")[^"]*"/g,'$1Seminovos revisados em {{a:cidade}}: estoque com fotos, financiamento e avaliação do seu usado na troca."',1,'descrição (Google)');
   h=talvez(h,/(<meta property="og:title" content=")[^"]*"/,'$1{{a:nome}} — Seminovos de procedência em {{a:cidade}}"','título (compartilhar)');
   h=trocar(h,'alt="Fachada da Ervatti Veículos na Av. Marechal Fontenelle"','alt="Veículo em estoque na Ervatti Veículos"',1,'foto da capa (texto)');
   h=trocar(h,'<span class="lbl">Magalhães Bastos · Rio de Janeiro · desde 2019</span>','<span class="lbl">{{h:cidade}}</span>',1,'local da capa');
   h=trocar(h,/<h1>\s*<span class="mask"><span>Seminovos<\/span><\/span>\s*<span class="mask"><span>de <span class="it">procedência<\/span><\/span><\/span>\s*<span class="mask"><span>para a família toda\.<\/span><\/span>\s*<\/h1>/,'<h1>{{bloco:fraseMask}}</h1>',1,'frase da capa');
   h=trocar(h,/<p class="lede" data-in>Duas lojas na Av\. Marechal Fontenelle, 53 veículos revisados[^<]*<\/p>/,'<p class="lede" data-in>{{h:sub}}</p>',1,'subtítulo');
   h=trocar(h,/<div class="heroB-kpis" data-in>[\s\S]*?<\/div>\n  <\/div>\n<\/section>/,'<div class="heroB-kpis" data-in>{{bloco:kpisNum}}</div>\n  </div>\n</section>',1,'números da capa');
   h=trocar(h,'Ver todos os 53 veículos','Ver todos os veículos',1,'link do estoque');
   // a seção da área kids era só da Ervatti: sai
   h=trocar(h,/<section class="sec paper kids">[\s\S]*?<\/section>\n/,'',1,'área kids');
   // "A loja": as fotos da fachada viram veículos do estoque
   h=trocar(h,'<p class="lede rv">Salão climatizado, mesas individuais para cada negociação e um pátio coberto com os carros à mostra — na esquina da Marechal Fontenelle há sete anos.</p>','<p class="lede rv">{{h:sobre}}</p>',1,'texto da loja');
   h=trocar(h,/<figure class="sh rv-up"><img src="\{\{a:foto(\d)\}\}" alt="[^"]*" loading="lazy">\s*<figcaption><b>[^<]*<\/b><span>[^<]*<\/span><\/figcaption><\/figure>/g,
    (m,n)=>'<figure class="sh rv-up"><img src="{{a:foto'+n+'}}" alt="{{a:destaque'+n+'}}" loading="lazy">\n        <figcaption><b>{{h:destaque'+n+'}}</b><span>No pátio agora</span></figcaption></figure>',3,'fotos da loja (legendas)');
   h=trocar(h,'Simulação em até 72x, entrada facilitada, entrada no cartão e FGTS aceito como entrada.','Simulação com as principais financeiras e entrada facilitada.',1,'pilar do crédito');
   h=trocar(h,'Test drive sem compromisso nas duas unidades. Traga a família — a área kids está aberta.','Test drive sem compromisso na loja. Traga a família.',1,'visita');
   // onde estamos: uma loja só, com o endereço, o horário e os telefones do painel
   h=trocar(h,'<h2 class="rv">Duas lojas na <span class="it">Marechal Fontenelle</span></h2>','<h2 class="rv">Venha <span class="it">conhecer</span> a loja</h2>',1,'título do mapa');
   h=trocar(h,'Uma avenida, dois endereços, o mesmo time. Chegue sem hora marcada — tem café, sala de espera e a área kids funcionando o dia inteiro.','Chegue sem hora marcada — o carro que você viu no site está aqui no pátio.',1,'texto do mapa');
   h=trocar(h,/<div class="units">[\s\S]*?<\/div>\n        <\/div>\n/,'<div class="units">\n          <div class="unit">\n            <span class="tri"><i></i><i></i><i></i></span>\n            <b>Endereço</b>\n            <p>{{h:endereco}}<br>{{h:cidade}}</p>\n          </div>\n        </div>\n',1,'unidades');
   h=trocar(h,'<p>Segunda a sexta, 9h às 18h<br>Sábado, 9h às 16h · Domingo, 9h às 14h</p>','<p>{{bloco:horarioBr}}</p>',1,'horário');
   h=trocar(h,/<div class="lrow"><i>Telefones<\/i><p>[\s\S]*?<\/p><\/div>\s*<div class="lrow"><i>E-mail<\/i><p>[\s\S]*?<\/p><\/div>/,
    '<div class="lrow"><i>Telefones</i><p><a href="tel:+{{n:fone}}">{{h:tel}}</a><br><a href="https://api.whatsapp.com/send?phone={{n:zap}}&text=Ol%C3%A1!" target="_blank" rel="noopener">{{h:telZap}} — WhatsApp</a></p></div>',1,'telefones');
   h=trocar(h,'<b>Av. Marechal Fontenelle, 4805</b>\n          <span>Magalhães Bastos · Rio de Janeiro/RJ</span>','<b>{{h:endereco}}</b>\n          <span>{{h:cidade}}</span>',1,'endereço (mapa)');
   h=trocar(h,'https://www.google.com/maps?q=-22.8793599,-43.4150424&hl=pt-BR&z=17&output=embed','https://www.google.com/maps?q={{u:enderecoCidade}}&hl=pt-BR&z=16&output=embed',1,'mapa');
   // faixa de marcas e perguntas
   h=trocar(h,/window\.montarFaixa\("railT", \[[^\]]*\]\);/,'window.montarFaixa("railT", {{json:marcas}});',1,'faixa de marcas');
   h=trocar(h,/\s*\["Vocês têm área kids mesmo\?", "[^"]*"\],/,'',1,'pergunta da área kids');
   h=trocar(h,/\["Onde ficam as lojas\?", "[^"]*"\]/,'["Onde fica a loja?", "Na {{j:enderecoCidade}}. Horário: {{j:horario}}."]',1,'pergunta do endereço');
   h=trocar(h,'"Sim. Trabalhamos com FGTS como entrada, entrada parcelada e entrada no cartão. Fale com um consultor para montar a melhor combinação para o seu caso."','"Fale com um consultor: ele mostra as formas de entrada que a loja aceita e monta a melhor combinação para o seu caso."',1,'pergunta do FGTS');
   h=trocar(h,'"Trabalhamos com prazos de 6 a 72 meses. O prazo e a taxa dependem','"O prazo e a taxa dependem',1,'pergunta do prazo');
   h=trocar(h,/,\s*\["Vocês vendem carro com GNV\?", "[^"]*"\]/,'',1,'pergunta do GNV');
  }
  if(pagina==='estoque.html')h=trocar(h,'Todos os veículos disponíveis agora nas duas lojas.','Todos os veículos disponíveis agora na loja.',1,'texto do estoque');
  if(pagina==='financiamento.html'){
   h=trocar(h,/Trabalhamos com <b>FGTS como entrada<\/b>, <b>entrada parcelada<\/b>, <b>entrada no cartão<\/b> e prazos de <b>6 a 72 meses<\/b>\. /,'Trabalhamos com as principais financeiras e <b>entrada facilitada</b>. ',1,'condições');
   h=trocar(h,'<h3>Até 72 meses</h3><p>Prazos de 6 a 72 meses para caber na parcela que você consegue pagar.</p>','<h3>Prazo que cabe</h3><p>Prazos para caber na parcela que você consegue pagar.</p>',1,'pilar do prazo');
   h=trocar(h,'<h3>FGTS na entrada</h3><p>Use o saldo do seu FGTS como entrada e reduza a parcela mensal.</p>','<h3>Entrada facilitada</h3><p>Combine entrada e prazo para reduzir a parcela mensal.</p>',1,'pilar da entrada');
   h=trocar(h,'<h3>Entrada no cartão</h3><p>Dá para parcelar a entrada ou passar no cartão de crédito.</p>','<h3>Seu usado na troca</h3><p>O valor do seu carro entra como parte do pagamento.</p>',1,'pilar do cartão');
   h=talvez(h,'até 72x, FGTS como entrada, entrada no cartão e aprovação para autônomos.','ficha online e resposta rápida.','descrição (Google)');
  }
  if(pagina==='consignacao.html'){
   h=trocar(h,'apareça nas duas lojas e no nosso Instagram de 28 mil seguidores','apareça na loja e no nosso Instagram',1,'vitrine');
   h=trocar(h,'Ele fica em pátio coberto, nas nossas unidades da Marechal Fontenelle.','Ele fica no nosso pátio, na {{j:enderecoCidade}}.',1,'pátio');
   h=talvez(h,'vitrine nas duas lojas','vitrine na loja','descrição (Google)');
  }
  // nome e cidade no que sobrou
  h=talvez(h,'Ervatti%20e%20','{{u:nome}}%20e%20','nome nos links');h=talvez(h,'da%20Ervatti.','da%20{{u:nome}}.','nome nos links (fim)');
  h=trocar(h,'5521991425886','{{n:zap}}',2,'WhatsApp');
  h=porContexto(h,[['Ervatti Veículos','nome'],['Magalhães Bastos · Rio de Janeiro/RJ','cidade'],['Magalhães Bastos · Rio de Janeiro','cidade'],['Magalhães Bastos (RJ)','cidade'],['Magalhães Bastos','cidade'],['Magalhães Bastos, RJ','cidade'],['Rio de Janeiro','cidade'],['Ervatti','nome']]);
  return h;
 }
};
