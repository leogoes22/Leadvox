// Modelo Claro = site original da Glycerio Veículos (repositório leogoes22/glycerio): fundo claro, vermelho e grafite.
// O que era da Glycerio (nome, Agostinho Porto, telefone, endereço, mapa, Instagram, estoque) vira campo do painel.
export default {
 paginas:{'index.html':'index.html','estoque.html':'estoque.html','financiamento.html':'financiamento.html','consignacao.html':'consignacao.html'},
 proibido:[/[Gg]lycerio/,/GLYCERIO/,/Meriti/,/Agostinho/,/25510/,/99088|990885517/,/BQ9dN/,/lv-mktdeconversa/,/8h às 19h/],
 passos(h,pagina,{trocar,talvez,porContexto,corVariavel}){
  // configuração da loja (o próprio site lê daqui WhatsApp, Instagram e mapa)
  h=trocar(h,"api: 'https://webhook.lv-mktdeconversa.com/webhook/sdr-estoque-api?k=glycerioveiculos-c96793bae788350e',","api: '/api/site/estoque?loja={{u:conta}}&modelo=claro',",1,'endereço do estoque');
  h=trocar(h,"instagram: 'https://www.instagram.com/glycerioveiculos/',","instagram: '{{j:instaUrl}}',",1,'Instagram');
  h=trocar(h,"var cacheKey = 'glycerio_estoque_v1';","var cacheKey = 'lv_estoque_{{u:conta}}';",1,'memória do estoque');
  // dados da loja para o Google: montados no servidor
  h=trocar(h,/<script type="application\/ld\+json">[\s\S]*?<\/script>/,'{{bloco:ld}}',0,'dados para o Google');
  // cor da marca escrita com transparência
  h=corVariavel(h,[200,19,30],'red');
  // horário: a lista destaca o dia de hoje (data-dias), montada a partir do horário do painel
  h=talvez(h,/<li data-dias="1,2,3,4,5"><span>Segunda a sexta<\/span><span>8h às 19h<\/span><\/li>\s*<li data-dias="6"><span>Sábado<\/span><span>8h às 17h<\/span><\/li>\s*<li data-dias="0"><span>Domingo<\/span><span>Fechado<\/span><\/li>/,'{{bloco:horarioDias}}','horário (dias)');
  h=talvez(h,'De segunda a sexta, das 8h às 19h, e sábado, das 8h às 17h.','{{h:horario}}.','horário (loja)');
  h=talvez(h,'Segunda a sexta, das 8h às 19h, e sábado, das 8h às 17h. Domingo a loja fica fechada, mas você pode deixar sua mensagem no WhatsApp.','{{h:horario}}. Fora do horário, deixe sua mensagem no WhatsApp.','horário (pergunta)');
  h=trocar(h,/<li>Seg a sex, 8h às 19h<\/li>\s*<li>Sábado, 8h às 17h<\/li>/,'{{bloco:horarioLi}}',1,'horário (rodapé)');
  // endereço (do mais longo para o mais curto)
  h=talvez(h,'Dr. Agostinho Porto, 151, loja A<br>Agostinho Porto, São João de Meriti, RJ<br>CEP 25510-101','{{h:endereco}}<br>{{h:cidade}}','endereço (mapa)');
  h=trocar(h,/<li>Dr\. Agostinho Porto, 151, loja A<\/li>\s*<li>Agostinho Porto, São João de Meriti, RJ<\/li>/,'<li>{{h:endereco}}</li>\n          <li>{{h:cidade}}</li>',1,'endereço (rodapé)');
  h=talvez(h,'Dr. Agostinho Porto, 151, loja A, em São João de Meriti.','{{h:endereco}}, em {{h:cidade}}.','endereço (loja)');
  h=talvez(h,'<p>Dr. Agostinho Porto, 151, São João de Meriti</p>','<p>{{h:enderecoCidade}}</p>','endereço (capa)');
  h=talvez(h,'No bairro Agostinho Porto, em São João de Meriti.','Em {{h:cidade}}.','bairro');
  h=talvez(h,'feitas na loja, no Agostinho Porto.','feitas na loja.','bairro (entrega)');
  h=talvez(h,'https://www.google.com/maps?q=Dr.%20Agostinho%20Porto%2C%20151%20-%20Agostinho%20Porto%2C%20S%C3%A3o%20Jo%C3%A3o%20de%20Meriti%20-%20RJ%2C%2025510-101&output=embed',
   'https://www.google.com/maps?q={{u:enderecoCidade}}&output=embed','mapa');
  // capa: frase e subtítulo do painel
  if(pagina==='index.html'){
   h=trocar(h,'<h1>Seu próximo carro está no pátio da Glycerio</h1>','<h1>{{bloco:fraseClaro}}</h1>',1,'frase da capa');
   h=trocar(h,/(<p class="lead">)Seminovos com fotos e ficha completa no site[^<]*<\/p>/,'$1{{h:sub}}</p>',1,'subtítulo');
  }
  // telefones: o tel: usa o fixo (ou o WhatsApp); o resto é o WhatsApp
  h=trocar(h,'tel:+5521990885517','tel:+{{n:fone}}',1,'telefone');
  h=trocar(h,'5521990885517','{{n:zap}}',1,'WhatsApp');
  h=porContexto(h,[['https://maps.app.goo.gl/BQ9dN2abrDtJaRc59','mapa'],['(21) 99088-5517','tel'],
   ['Agostinho Porto, São João de Meriti','cidade'],['São João de Meriti, RJ','cidade'],['São João de Meriti','cidade'],
   ['Glycerio Veículos','nome'],['Glycerio','nome']]);
  return h;
 }
};
