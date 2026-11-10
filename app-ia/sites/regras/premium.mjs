// Modelo Premium = site original da Elite Auto Broker (repositório leogoes22/eliteautobroker).
// O que era da Elite (nome, Mesquita, telefone, endereço, blindagem como especialidade, estoque e fotos) vira campo do painel.
export default {
 paginas:{'index.html':'index.html','estoque.html':'estoque.html','financiamento.html':'financiamento.html','consignacao.html':'consignacao.html'},
 proibido:[/Elite/,/Mesquita/,/Ambr[óo]sio/,/Vila Emil/,/97006/,/970061441/,/autocerto\.com\/fotos\/5380/,/apin8n|lv-mktdeconversa/,/[Bb]roker/,/\{b:"/,/instagram\.com\/"/,/Premium e [Bb]lindados/,/Blindagem</],
 passos(h,pagina,{trocar,talvez,porContexto,corVariavel}){
  // estoque embutido da Elite sai; o estoque vem do painel, no formato que o site lê
  h=trocar(h,/var CARS = \[[\s\S]*?\n\];/,'var CARS = [];',1,'estoque embutido');
  h=trocar(h,'var ESTOQUE_API = "https://apin8n.lv-mktdeconversa.com/webhook/estoque-elite";','var ESTOQUE_API = "/api/site/estoque?loja={{u:conta}}&modelo=premium";',1,'endereço do estoque');
  h=trocar(h,/Ex\.: "https:\/\/apin8n[^"]*"/,'Ex.: "/api/site/estoque?loja=conta&modelo=premium"',1,'comentário do estoque');
  h=trocar(h,'var FOTO_BASE = "https://www.autocerto.com/fotos/5380/";','var FOTO_BASE = "";',1,'base das fotos');
  // memória do navegador separada por loja (todas as lojas abrem no mesmo endereço)
  h=trocar(h,'"elite-estoque-confirmado-v1"','"lv-estoque-{{u:conta}}-v1"',1,'memória do estoque');
  h=talvez(h,/'elite-hero-last'/g,"'lv-capa-{{u:conta}}'",'memória da capa');
  // km: vazio fica vazio (antes virava 0 km); escondido pelo lojista aparece como "Consulte"
  h=trocar(h,'o.km = Number(o.km) || 0;','o.km = o.km == null || o.km === "" ? null : (Number(o.km) || 0);',1,'km vazio');
  h=trocar(h,'var kmFmt = function(n){ return Number(n || 0).toLocaleString("pt-BR") + " km"; };',
   'var SEM_KM = {{n:semKm}} === 1;\nvar kmFmt = function(n){ return n == null ? (SEM_KM ? "Km: consulte" : "Km não informado") : Number(n || 0).toLocaleString("pt-BR") + " km"; };',1,'km escondido');
  // descrição do cadastro na ficha do veículo (o original só tinha ficha técnica e opcionais)
  h=trocar(h,`'<p class="vinfo-nota">`,`(c.desc ? '<div class="vficha"><h3>Descrição</h3><p class="vinfo-desc">' + esc(c.desc) + '</p></div>' : '') +\n    '<p class="vinfo-nota">`,1,'descrição na ficha');
  h=trocar(h,'</head>','<style>.vinfo-desc{color:var(--dim);line-height:1.65;white-space:pre-line;font-size:.95rem}</style>\n</head>',1,'estilo da descrição');
  // cor da marca (amarelo da Elite) e fundos escritos com transparência seguem o painel
  h=corVariavel(h,[219,195,0],'brand');h=corVariavel(h,[5,5,6],'black');h=corVariavel(h,[10,10,12],'bg');

  // textos que eram afirmações da Elite (blindagem, broker, 18 marcas): ficam gerais
  h=trocar(h,'Premium e Blindados em Mesquita, RJ','Premium e Seminovos em Mesquita',0,'título');
  h=talvez(h,'Concessionária de veículos premium e blindados em Mesquita, RJ.','Veículos premium e seminovos em Mesquita.','descrição (Google)');
  h=talvez(h,'SUVs, sedãs, hatches, blindados e premium','SUVs, sedãs, hatches e premium','descrição do estoque (Google)');
  h=trocar(h,'Elite Auto Broker, Premium e Blindados','Elite Auto Broker',1,'nome com slogan');
  h=trocar(h,'Veículos premium, blindados e seminovos selecionados','Veículos premium e seminovos selecionados',1,'rodapé');
  h=trocar(h,'Site demonstrativo com estoque real do pátio','Estoque atualizado do pátio',1,'rodapé (linha final)');
  h=trocar(h,/\s*<li><a href="https:\/\/wa\.me\/5521970061441\?text=Tenho%20interesse%20em%20blindagem\."[^\n]*<\/li>/,'',1,'link de blindagem');
  h=trocar(h,'"Premium e blindados","Financiamento','"Premium e seminovos","Financiamento',1,'faixa corrida');
  h=talvez(h,'como broker, a Elite busca o carro que você quer no mercado.','a gente procura o carro que você quer.','sem resultado no filtro');
  if(pagina==='index.html'){
   h=trocar(h,/<h1>Seu próximo carro<em>já está no pátio\.<\/em><\/h1>/,'<h1>{{bloco:fraseEm}}</h1>',1,'frase da capa');
   h=trocar(h,/<p class="lede">Premium, blindados e seminovos selecionados[^<]*<\/p>/,'<p class="lede">{{h:sub}}</p>',1,'subtítulo');
   h=trocar(h,'<h3>Blindados sob consulta</h3>\n        <p>Especialistas em blindagem homologada — do nível de proteção à documentação.</p>',
    '<h3>Atendimento consultivo</h3>\n        <p>Um consultor acompanha você do primeiro contato à entrega das chaves.</p>',1,'pilar de blindagem');
   h=trocar(h,'<h2>Premium e blindados<br>é o nosso terreno</h2>','<h2>Premium e seminovos<br>é o nosso terreno</h2>',1,'título da loja');
   h=trocar(h,'Trabalhamos com 18 marcas — de hatches a SUVs de luxo —','Trabalhamos com várias marcas — de hatches a SUVs de luxo —',1,'curadoria');
   h=trocar(h,'Seg. a sex. das 9h às 18h e sáb. das 9h às 16h.','{{h:horario}}.',1,'horário (loja)');
   h=trocar(h,/\s*\["Vocês trabalham com veículos blindados\?","[^"]*"\],/,'',1,'pergunta sobre blindados');
   h=trocar(h,'Estamos na R. Ambrósio, 158, Vila Emil, Mesquita/RJ, de segunda a sexta das 9h às 18h e sábado das 9h às 16h.',
    'Estamos na {{j:endereco}}, em {{j:cidade}}. Horário: {{j:horario}}.',1,'pergunta sobre visita');
   // fotos: capa e destaque saem do estoque da loja (a capa ainda troca sozinha entre os carros, como no original)
   h=trocar(h,/<img src="https:\/\/www\.autocerto\.com\/fotos\/5380\/\d+\/[\d_]+\.jpg" alt="[^"]*" class="hero-current"/,'<img src="{{a:foto1}}" alt="Veículo em estoque na Elite Auto Broker" class="hero-current"',1,'foto da capa');
   h=trocar(h,/<img src="https:\/\/www\.autocerto\.com\/fotos\/5380\/\d+\/[\d_]+\.jpg" alt="BMW X4[^"]*"/,'<img src="{{a:foto2}}" alt="{{h:destaque2}} no estoque da Elite Auto Broker"',1,'foto do destaque');
   h=trocar(h,'<div class="cap"><b>BMW X4 M Sport 35i</b>','<div class="cap"><b>{{h:destaque2}}</b>',1,'nome do destaque');
  }else{
   h=trocar(h,/<div class="page-hero-bg"><img src="https:\/\/www\.autocerto\.com\/fotos\/5380\/\d+\/[\d_]+\.jpg"/,'<div class="page-hero-bg"><img src="{{a:foto'+({'estoque.html':2,'financiamento.html':3,'consignacao.html':4})[pagina]+'}}"',1,'foto do topo');
  }
  if(pagina==='estoque.html'){
   h=trocar(h,'Como broker, a Elite busca o carro certo no mercado para você. Diga modelo, ano e faixa de preço que o consultor retorna com opções.',
    'Diga modelo, ano e faixa de preço que o consultor da Elite procura e retorna com opções.',1,'pedido de modelo');
   h=trocar(h,'<b id="kpiMin">R$ 18 mil</b>','<b id="kpiMin">—</b>',1,'preço inicial');h=trocar(h,'<b id="kpiNovo">2026</b>','<b id="kpiNovo">—</b>',1,'ano mais novo');
  }
  if(pagina==='consignacao.html'){
   h=trocar(h,'["Vocês compram carro blindado?","Sim, blindados são especialidade da casa.','["Vocês compram carro blindado?","Sim.',1,'blindado (venda)');
   h=trocar(h,'na loja, na R. Ambrósio, 158, Vila Emil, Mesquita/RJ."]','na loja, na {{j:endereco}}, em {{j:cidade}}."]',1,'endereço (venda)');
  }
  h=talvez(h,'<b id="kpiBrands">18</b>','<b id="kpiBrands">—</b>','marcas (contagem)');
  // contato
  h=trocar(h,'R. Ambrósio, 158, Vila Emil<br>Mesquita, RJ','{{h:endereco}}<br>{{h:cidade}}',1,'endereço (rodapé)');
  h=talvez(h,'R. Ambrósio, 158 — Vila Emil, Mesquita/RJ.','{{h:endereco}}, {{h:cidade}}.','endereço (loja)');
  h=trocar(h,'<li>Seg a sex: 9h às 18h<br>Sáb: 9h às 16h</li>','<li>{{bloco:horarioBr}}</li>',1,'horário (rodapé)');
  h=trocar(h,'https://www.instagram.com/"','{{a:insta}}"',2,'Instagram');
  h=trocar(h,'5521970061441','{{n:zap}}',2,'WhatsApp');
  h=trocar(h,'Elite%20Auto%20Broker','{{u:nome}}',0,'nome nos links');
  // nome e cidade no que sobrou, cada um com o seu escape
  h=porContexto(h,[['(21) 97006-1441','tel'],['Elite Auto Broker','nome'],['Mesquita, Rio de Janeiro','cidade'],['Mesquita/RJ','cidade'],['Mesquita, RJ','cidade'],['Mesquita RJ','cidade'],['Mesquita','cidade']]);
  h=h.replace(/>A Elite<\/a>/g,'>A loja</a>');
  h=porContexto(h,[['Elite','nome']]);
  return h;
 }
};
