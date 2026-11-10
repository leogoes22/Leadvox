// Modelo Vitrine = site original da Ultra Motors, ex-El Luxcar (repositório leogoes22/elluxcar): lista com prévia flutuante, degradê e ficha da loja.
// O que era da Ultra (nome, Dutra, Rancho Novo, telefone, Instagram, mapa, logo e capa) vira campo do painel.
export default {
 paginas:{'index.html':'index.html','estoque.html':'estoque.html','financiamento.html':'financiamento.html','consignacao.html':'consignacao.html'},
 proibido:[/Ultra/,/ULTRA/,/ultra/,/[Ll]uxcar|LUXCAR/,/Dutra/,/Rancho/,/Igua[çc]u|IGUAÇU/,/99787|997874535/,/26015/,/6Rc9x/,/autocerto\.com\/fotos\/7798/,/lv-mktdeconversa/,/-22\.748|43\.441/,/6 a 72 meses|até 72x|"72" data-suf/,/Range Rover Evoque HSE/],
 passos(h,pagina,{trocar,talvez,porContexto,corVariavel}){
  // estoque: busca antecipada no painel (mesmo formato que o site lia), memória separada por loja
  h=trocar(h,'var FOTO_BASE = "https://www.autocerto.com/fotos/7798/";','var FOTO_BASE = "";',1,'base das fotos');
  h=trocar(h,'return nome ? (FOTO_BASE + v.id + "/" + nome + ".jpg") : "";','return nome ? (/^(https?:|data:)/.test(nome) ? nome : FOTO_BASE + v.id + "/" + nome + ".jpg") : "";',1,'fotos com endereço completo');
  h=trocar(h,'var key = "elluxcar:estoque:v2"','var key = "lv:estoque:{{u:conta}}:v2"',1,'memória do estoque');
  h=trocar(h,'fetch("https://webhook.lv-mktdeconversa.com/webhook/elluxcar-estoque-site"','fetch("/api/site/estoque?loja={{u:conta}}&modelo=vitrine"',1,'endereço do estoque');
  // km e descrição
  h=trocar(h,'window.kmFmt = function(n){ return n ? (n.toLocaleString("pt-BR") + " km") : "0 km"; };',
   'var SEM_KM = {{n:semKm}} === 1;\nwindow.kmFmt = function(n){ return n == null || n === "" ? (SEM_KM ? "Consulte" : "Não informado") : (n ? (n.toLocaleString("pt-BR") + " km") : "0 km"); };',1,'km');
  h=trocar(h,/(  var se = \(v\.se && v\.se\.length\) \?[\s\S]*?'<\/ul><\/div>' : "";)/,
   `$1\n  se += v.desc ? '<div class="vi-sec"><h3>Descrição</h3><p class="vi-desc">' + esc(v.desc) + '</p></div>' : "";`,1,'descrição na ficha');
  h=trocar(h,'</head>','<style>.vi-desc{color:var(--dim);line-height:1.65;white-space:pre-line;font-size:.95rem;margin-top:12px}</style>\n</head>',1,'estilo da descrição');
  // logo, ícone e capa (arquivos da Ultra no repositório)
  h=trocar(h,'src="ultra-motors-deitada.png"','src="{{a:logo}}"',3,'logo');
  h=trocar(h,/<link rel="icon" href="data:image\/svg\+xml[^"]*">/,'<link rel="icon" href="{{a:logo}}">',1,'ícone');
  h=talvez(h,'/* Ultra Motors: logo deitada no topo e no rodapé */','/* logo deitada no topo e no rodapé */','comentário da logo');
  h=h.replace(/ULTRA MOTORS NOVA IGUAÇU — /g,'MODELO VITRINE — ').replace(/ULTRA MOTORS — /g,'MODELO VITRINE — ').replace(/^\s*ULTRA MOTORS NOVA IGUAÇU\s*$/m,'   MODELO VITRINE');
  h=talvez(h,'"ULTRA MOTORS NOVA IGUAÇU",','"{{j:nome}}",','nome no compartilhar');
  // cores do degradê escritas com transparência
  h=corVariavel(h,[47,196,178],'ember-2');h=corVariavel(h,[47,125,246],'ember-3');
  // textos para o Google e afirmações da Ultra
  h=talvez(h,'Carros nacionais e importados na Dutra','Carros nacionais e importados em {{h:cidade}}','título');
  h=talvez(h,'na Rod. Presidente Dutra, Nova Iguaçu.','em {{h:cidade}}.','descrição (Google)');
  h=talvez(h,'Financiamento em até 72x, avaliação','Financiamento facilitado, avaliação','descrição (crédito)');
  h=talvez(h,'de 6 a 72 meses, entrada facilitada','prazos longos, entrada facilitada','descrição (financiamento)');
  h=talvez(h,'na Ultra Motors, na Rod. Presidente Dutra, Nova Iguaçu.','na Ultra Motors, em {{h:cidade}}.','descrição (estoque)');
  // contato no menu lateral e no rodapé
  h=trocar(h,'<p class="end"><b>Rod. Pres. Dutra, 14.986</b>Rancho Novo · Nova Iguaçu/RJ<br>Seg a sex 9h–18h · Sáb 9h–16h</p>','<p class="end"><b>{{h:endereco}}</b>{{h:cidade}}<br>{{h:horario}}</p>',1,'contato (menu)');
  h=trocar(h,'na Rod. Presidente Dutra, em Nova Iguaçu.','em {{h:cidade}}.',1,'rodapé (texto)');
  h=trocar(h,'<li>Rod. Presidente Dutra, 14.986 — Q7 L17</li>','<li>{{h:endereco}}</li>',1,'endereço (rodapé)');
  h=trocar(h,'<li>Rancho Novo · Nova Iguaçu / RJ</li>','<li>{{h:cidade}}</li>',1,'cidade (rodapé)');
  h=trocar(h,'<li>Seg a sex 9h–18h · Sáb 9h–16h</li>','{{bloco:horarioLi}}',1,'horário (rodapé)');
  h=trocar(h,'>@ultraeletricosoficial<','>@{{h:instaUser}}<',1,'Instagram (nome)');
  h=trocar(h,'https://www.instagram.com/ultraeletricosoficial/','{{a:insta}}',2,'Instagram');
  h=trocar(h,'https://maps.app.goo.gl/6Rc9xZM4tuLWUdHJ7','{{a:mapa}}',1,'link do mapa');
  if(pagina==='index.html'){
   h=trocar(h,'<span class="lbl">Rod. Presidente Dutra · Nova Iguaçu</span>','<span class="lbl">{{h:cidade}}</span>',1,'local da capa');
   h=trocar(h,/<h1>\s*<span class="mask"><span>Do popular<\/span><\/span>\s*<span class="mask"><span>ao <span class="fire">importado<\/span>\.<\/span><\/span>\s*<\/h1>/,'<h1>{{bloco:fraseFire}}</h1>',1,'frase da capa');
   h=trocar(h,'veículos no pátio, de um Onix Turbo a um Range Rover Evoque — passando por picape 4x4, clássico dos anos 90 e moto zero. Se não estiver aqui, a gente busca.','veículos no pátio. {{h:sub}}',1,'subtítulo');
   h=trocar(h,'<b data-num="9">0</b><span>Marcas diferentes</span>','<b data-num="{{n:marcas}}">0</b><span>Marcas diferentes</span>',1,'marcas (número)');
   h=trocar(h,'<b data-num="72" data-suf="x">0</b><span>Parcelas</span>','<b data-num="{{n:anoNovo}}">0</b><span>Ano mais novo</span>',1,'parcelas');
   h=trocar(h,'<img src="ultra-capa.jpg" alt="Ultra Motors em Nova Iguaçu"','<img src="{{a:foto1}}" alt="Veículo em estoque na Ultra Motors"',1,'capa');
   h=trocar(h,'<div class="capa-tag"><em></em>Pátio na margem da Dutra · Rancho Novo</div>','<div class="capa-tag"><em></em>{{h:destaque1}}</div>',1,'legenda da capa');
   h=trocar(h,'Test drive sem compromisso na loja da Dutra,','Test drive sem compromisso na loja,',1,'visita');
   h=trocar(h,'<b>Rod. Presidente Dutra, 14.986</b>\n    <span>Rancho Novo · Nova Iguaçu / RJ</span>','<b>{{h:endereco}}</b>\n    <span>{{h:cidade}}</span>',1,'endereço (mapa)');
   h=trocar(h,'https://www.google.com/maps?q=-22.7489169,-43.4417805&hl=pt-BR&z=17&output=embed','https://www.google.com/maps?q={{u:enderecoCidade}}&hl=pt-BR&z=16&output=embed',1,'mapa');
   h=trocar(h,'Na margem da <span class="fire">Dutra</span>','Venha <span class="fire">conhecer</span>',1,'título do mapa');
   h=trocar(h,'<p class="end">Rod. Presidente Dutra, 14.986<br>Quadra 07 · Lote 17 — Rancho Novo<br>Nova Iguaçu / RJ · 26015-385</p>','<p class="end">{{h:endereco}}<br>{{h:cidade}}</p>',1,'endereço (loja)');
   h=trocar(h,'<p class="hor">Segunda a sexta, 9h às 18h<br>Sábado, 9h às 16h</p>','<p class="hor">{{bloco:horarioBr}}</p>',1,'horário (loja)');
   // ficha da loja e perguntas
   h=trocar(h,'["Endereço", "Rod. Pres. Dutra, 14.986 — Rancho Novo, Nova Iguaçu/RJ"]','["Endereço", "{{j:enderecoCidade}}"]',1,'ficha: endereço');
   h=trocar(h,'["Horário", "Seg a sex, 9h às 18h · Sáb, 9h às 16h"]','["Horário", "{{j:horario}}"]',1,'ficha: horário');
   h=trocar(h,'["Contato", "(21) 99787-4535 — telefone e WhatsApp"]','["Contato", "{{j:telZap}} — WhatsApp"]',1,'ficha: contato');
   h=trocar(h,'["Financiamento", "<b>6 a 72 meses</b> · CLT, autônomo, MEI e aposentado"]','["Financiamento", "<b>Principais financeiras</b> · CLT, autônomo, MEI e aposentado"]',1,'ficha: financiamento');
   h=trocar(h,/\["Onde fica a loja\?", "[^"]*"\]/,'["Onde fica a loja?", "Na {{j:enderecoCidade}}."]',1,'pergunta: endereço');
   h=trocar(h,'["Qual o horário de atendimento?", "De segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 16h."]','["Qual o horário de atendimento?", "{{j:horario}}."]',1,'pergunta: horário');
   h=trocar(h,'"Trabalhamos com prazos de 6 a 72 meses. A taxa e o prazo final dependem','"A taxa e o prazo final dependem',1,'pergunta: prazo');
   h=trocar(h,' — no momento há, por exemplo, um Range Rover Evoque HSE Dynamic."',' — veja na lista completa."',1,'pergunta: importados');
  }
  if(pagina==='financiamento.html')h=trocar(h,'Prazos de <b>6 a 72 meses</b>, entrada facilitada','Prazos que cabem no bolso, entrada facilitada',1,'condições');
  // telefones: TEL e tel: usam o fixo (ou o WhatsApp); o resto é o WhatsApp
  h=trocar(h,'window.TEL = "+5521997874535";','window.TEL = "+{{n:fone}}";',1,'telefone (programação)');
  h=talvez(h,'tel:+5521997874535','tel:+{{n:fone}}','telefone');
  h=trocar(h,'5521997874535','{{n:zap}}',2,'WhatsApp');
  h=talvez(h,'El%20Luxcar','{{u:nome}}','nome nos links');
  h=porContexto(h,[['(21) 99787-4535','telZap'],['Ultra Motors Nova Iguaçu','nome'],['Ultra Motors','nome'],['Nova Iguaçu','cidade']]);
  return h;
 }
};
