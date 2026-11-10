import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {renderFiel,estoqueParaSite,estoqueDoModelo,lojaDemoFiel,MODELOS_FIEIS,mostrarDo} from '../site-fiel.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const pasta=new URL('../sites/garagem/',import.meta.url);

test('modelo fiel da MG: nada da MG sobra (clientes, endereço, telefone, estoque, fotos) e as 4 páginas existem', () => {
 assert.deepEqual(readdirSync(pasta).sort(),[...MODELOS_FIEIS.garagem.paginas].sort());
 for(const p of MODELOS_FIEIS.garagem.paginas){
  const h=readFileSync(new URL(p,pasta),'utf8');
  for(const re of [/MG Motos/,/Nova Igua[çc]u/,/Rafaela|Marcos Conde|Lorraine|Rafael Veloso/,/Carlos Marques|Jardim Imp[ée]rio|26225/,/998333939|99833-3939/,/mgmotos/,/autocerto\.com\/fotos\/4425/,/data:image\/(png|jpeg|webp);base64/,/M12 2l8\.66 15H3\.34z/,/ — RJ/])
   assert.doesNotMatch(h,re,p+' ainda tem '+re);
  assert.match(h,/var MG = \{\{json:cfg\}\};/,p);assert.match(h,/var ESTOQUE_ATUAL = \[\];/,p);assert.match(h,/var GALERIAS = \{\};/,p);
  assert.doesNotMatch(h,/rgba\(214,\s*146,\s*30/,p+': a cor da MG ficou escrita direto');
 }
});

const base={ativo:true,modelo:'garagem',publicado:true,identidade:{nome:'Loja <b>"Teste"</b>',cidade:"Duque d'Caxias",cor1:'#1f6feb',cor2:'#101010',frase:'Motos boas. Preço justo.',
 whatsapp:'21988887777',endereco:'Rua A, 1',horario:'Seg a sex 9h às 18h · Sáb 9h às 13h',instagram:'loja.teste'},itens:[{id:1,nome:'HONDA CG',preco:15000,atributos:{marca:'HONDA',modelo:'CG 160',ano:'2023/2024'},fotos:['https://ex.com/a.jpg']}]};

test('preenchimento: tudo que vem do painel entra escapado, no HTML e na programação, e nenhum campo fica sem trocar', () => {
 for(const p of MODELOS_FIEIS.garagem.paginas){
  const h=renderFiel({nomeModelo:'garagem',pagina:p,dados:base,conta:'loja-teste-ab12cd34'});
  assert.doesNotMatch(h,/\{\{[a-z]+:[A-Za-z0-9]+\}\}/,p+': ficou campo sem trocar');
  assert.doesNotMatch(h,/<b>"Teste"<\/b>/,p+': nome entrou como HTML');
  assert.match(h,/Loja &lt;b&gt;&quot;Teste&quot;&lt;\/b&gt;/,p);
  const cfg=JSON.parse(h.match(/var MG = (\{.*?\});/)[1]);
  assert.equal(cfg.whatsapp,'5521988887777');assert.equal(cfg.estoqueApi,'/api/site/estoque?loja=loja-teste-ab12cd34');assert.equal(cfg.instaPosts,'');
  assert.match(h,/--ambar:#1f6feb/);assert.match(h,/<script src="\/site\/tema\.js" data-loja="loja-teste-ab12cd34" defer><\/script><\/body>/);
  assert.doesNotMatch(h,/name="robots" content="noindex"/,'publicado: entra no Google');
 }
 const i=renderFiel({nomeModelo:'garagem',pagina:'index.html',dados:base,conta:'loja-teste-ab12cd34'});
 assert.match(i,/<span class="l"><span class="w" style="--i:0">Motos<\/span> <span class="w" style="--i:1">boas\.<\/span><\/span><span class="l">/,'título animado em duas linhas');
 assert.match(i,/Duque d&#39;Caxias/);assert.match(i,/<span>Honda<\/span>/,'faixa de marcas do estoque');
 assert.equal(renderFiel({nomeModelo:'garagem',pagina:'acao-comercial.html',dados:base,conta:'x-loja'}),null);
});

test('seções sem dados somem: sem avaliações e sem Instagram; com avaliações, aparecem com as iniciais', () => {
 let h=renderFiel({nomeModelo:'garagem',pagina:'index.html',dados:{...base,identidade:{...base.identidade,instagram:''}},conta:'x-loja'});
 assert.doesNotMatch(h,/id="avaliacoes"/);assert.doesNotMatch(h,/id="instagram"/);assert.doesNotMatch(h,/<div class="hero-prova">/);
 h=renderFiel({nomeModelo:'garagem',pagina:'index.html',dados:{...base,identidade:{...base.identidade,avaliacoes:[{nome:'Ana Lima',texto:'Ótimo atendimento. Recomendo.'}]}},conta:'x-loja'});
 assert.match(h,/id="avaliacoes"/);assert.match(h,/<span class="ava">AL<\/span>/);assert.match(h,/“Ótimo atendimento\.” <b>Ana Lima<\/b>/);
 const nao=renderFiel({nomeModelo:'garagem',pagina:'index.html',dados:{...base,publicado:false},conta:'x-loja'});
 assert.match(nao,/name="robots" content="noindex"/);
});

test('estoque no formato do site original: anos separados, km, opcionais e descrição; o que o lojista escondeu vai vazio', () => {
 assert.deepEqual(estoqueParaSite(base.itens)[0],{id:'1',marca:'Honda',modelo:'CG 160',versao:'',anoFabricacao:2023,anoModelo:2024,km:null,preco:15000,fotos:['https://ex.com/a.jpg'],cambio:'',combustivel:'',cor:'',
  opcionais:[],descricao:'',categoria:'',tipo:''});
 const it=[{id:2,nome:'X',preco:50000,atributos:{marca:'FIAT',modelo:'Argo',ano:'2022',km:31000,obs:'Único dono.',opcionais:['Ar','ABS']}}];
 let v=estoqueParaSite(it)[0];assert.equal(v.km,31000);assert.deepEqual(v.opcionais,['Ar','ABS']);assert.equal(v.descricao,'Único dono.');assert.equal(v.preco,50000);
 v=estoqueParaSite(it,mostrarDo({mostrar:{km:false,preco:false,opcionais:false,descricao:false}}))[0];
 assert.equal(v.km,null);assert.equal(v.preco,null);assert.deepEqual(v.opcionais,[]);assert.equal(v.descricao,'');
 assert.equal(estoqueParaSite([{id:3,atributos:{km:0}}])[0].km,0,'0 km continua 0 km');
 assert.equal(JSON.parse(renderFiel({nomeModelo:'garagem',pagina:'index.html',dados:{...base,identidade:{...base.identidade,mostrar:{km:false}}},conta:'x-loja'}).match(/var MG = (\{.*?\});/)[1]).semKm,true);
 assert.ok(lojaDemoFiel().itens.length>=8);
});

test('rota: o site fiel abre em /s/<conta>/ e nas páginas; só ali a programação da página é liberada', async t => {
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];calls.push(fn);if(fn==='lv_site_dados')return ok(base);return ok(null);}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const b='http://127.0.0.1:'+s.address().port;
 let r=await fetch(b+'/s/loja-teste-ab12cd34/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/script-src 'self' 'unsafe-inline'/);
 assert.match(await r.text(),/Loja &lt;b&gt;/);
 r=await fetch(b+'/s/loja-teste-ab12cd34/estoque.html');assert.equal(r.status,200);
 r=await fetch(b+'/s/loja-teste-ab12cd34/nao-existe.html');assert.equal(r.status,404);
 r=await fetch(b+'/s/demo/?modelo=garagem');assert.equal(r.status,200);assert.match(await r.text(),/Loja Demo Motos/);
 r=await fetch(b+'/api/site/estoque?loja=loja-teste-ab12cd34');assert.equal((await r.json())[0].anoModelo,2024);
 r=await fetch(b+'/');assert.doesNotMatch(r.headers.get('content-security-policy')||'',/unsafe-inline'[^;]*;?\s*style/,'o painel continua sem programação solta');
 assert.doesNotMatch((await fetch(b+'/')).headers.get('content-security-policy'),/script-src[^;]*unsafe-inline/);
});

test('estoque do painel: opcionais (lista ou texto) e descrição ficam no veículo; a IA também lê os opcionais', async () => {
 const {itemManual,deAutoCerto,opcionaisDe}=await import('../integrations/estoque.mjs');
 assert.deepEqual(opcionaisDe('Ar-condicionado, ABS; ABS | Direção elétrica'),['Ar-condicionado','ABS','Direção elétrica']);
 assert.deepEqual(opcionaisDe([{Descricao:'Teto solar'},'Couro']),['Teto solar','Couro']);
 const m=itemManual({marca:'Fiat',modelo:'Argo',ano:'2022',km:'31.000',obs:'Único dono',opcionais:'Ar, ABS'});
 assert.deepEqual(m.atributos.opcionais,['Ar','ABS']);assert.equal(m.atributos.obs,'Único dono');assert.equal(m.atributos.km,31000);assert.match(m.descricao,/Opcionais: Ar, ABS/);
 assert.equal(itemManual({modelo:'Argo'}).atributos.opcionais,undefined);
 assert.deepEqual(deAutoCerto({Codigo:1,Marca:'FIAT',Modelo:'ARGO',Opcionais:[{Descricao:'Airbag'}]}).atributos.opcionais,['Airbag']);
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
 assert.match(js,/data-mostrar="\$\{k\}"/);assert.match(js,/opcionais: \$\('esOpc'\)\.value/);
 assert.match(readFileSync(new URL('../database/site_modelos_fieis.sql',import.meta.url),'utf8'),/'mostrar',jsonb_build_object\('km'/);
});

// os 6 sites originais (MG, Elite, Machado, Glycerio, Ervatti e Ultra) viram modelos fiéis
const LOJAS_ORIGINAIS={premium:[/Elite/,/Mesquita/,/97006/],neon:[/[Mm]achado/,/Meriti/,/98115|96463/],claro:[/[Gg]lycerio/,/Agostinho/,/99088/],
 editorial:[/[Ee]rvatti/,/Fontenelle/,/99142/,/área kids/i],vitrine:[/Ultra/,/Dutra/,/99787/,/[Ll]uxcar/]};
test('os 6 modelos fiéis: páginas sem sobra da loja original, campos todos trocados, programação válida e texto da loja escapado', () => {
 assert.deepEqual(Object.keys(MODELOS_FIEIS).sort(),['claro','editorial','garagem','neon','premium','vitrine']);
 for(const [nome,proib] of Object.entries(LOJAS_ORIGINAIS)){
  const dados=lojaDemoFiel(nome);dados.identidade={...dados.identidade,nome:'Loja <b>"X"</b> `${1}`',endereco:'</script><b>'};
  dados.itens[0].atributos.obs='</script><script>alert(1)</script>';
  for(const p of MODELOS_FIEIS[nome].paginas){
   const modelo=readFileSync(new URL('../sites/'+nome+'/'+p,import.meta.url),'utf8');
   for(const re of proib)assert.doesNotMatch(modelo,re,nome+'/'+p+' ainda tem '+re);
   const h=renderFiel({nomeModelo:nome,pagina:p,dados,conta:'loja-teste-ab12cd34'});
   assert.doesNotMatch(h,/\{\{[a-z]+:[A-Za-z0-9]+\}\}/,nome+'/'+p+': ficou campo sem trocar');
   assert.doesNotMatch(h,/<b>"X"<\/b>|<\/script><b>|<\/script><script>alert/,nome+'/'+p+': texto da loja entrou como HTML');
   for(const [,s] of h.matchAll(/<script(?![^>]*src)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(s),nome+'/'+p+': programação quebrada');
   assert.match(h,/<script src="\/site\/tema\.js" data-loja="loja-teste-ab12cd34" defer>/);
  }
 }
});

test('estoque de cada modelo no formato que o site original lê (km, opcionais e descrição chegam)', () => {
 const l=estoqueParaSite(lojaDemoFiel('premium').itens);
 const p=estoqueDoModelo('premium',l).veiculos[0];assert.equal(p.km,28500);assert.ok(p.op.length);assert.match(p.desc,/descrição/);assert.equal(p.t,'SUV');
 const n=estoqueDoModelo('neon',l);assert.equal(n.total,n.veiculos.length);
 const c=estoqueDoModelo('claro',l).veiculos[0];assert.equal(c.ano_modelo,2024);assert.ok(c.opcionais.length);assert.ok(c.descricao);
 const v=estoqueDoModelo('vitrine',l);assert.equal(v.total,v.carros.length);assert.ok(Array.isArray(v.carros[0].g));
 assert.deepEqual(estoqueDoModelo('garagem',l),l);
 const e=renderFiel({nomeModelo:'editorial',pagina:'index.html',dados:lojaDemoFiel('editorial'),conta:'x-loja'});
 assert.equal(JSON.parse(e.match(/var CARROS = (\[.*?\]);/s)[1]).length,8,'Editorial: estoque escrito na página');
});

test('prévia: /s/demo-<modelo>/ abre o modelo nas páginas internas, sem a camada de temas', async t => {
 const s=createApp({allowLocal:true,fetchImpl:async()=>ok(null)});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const b='http://127.0.0.1:'+s.address().port;
 for(const m of ['premium','neon','claro','editorial','vitrine']){
  const r=await fetch(b+'/s/demo-'+m+'/estoque.html');assert.equal(r.status,200,m);const h=await r.text();
  assert.match(h,/Loja Demo Veículos/);assert.doesNotMatch(h,/site\/tema\.js/);
 }
 const est=await (await fetch(b+'/api/site/estoque?loja=demo-vitrine&modelo=vitrine')).json();assert.equal(est.carros.length,8);
});
