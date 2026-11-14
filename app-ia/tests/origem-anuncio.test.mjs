import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const mod={exports:{}};vm.runInNewContext(readFileSync(new URL('../n8n/origem-anuncio.js',import.meta.url),'utf8'),{module:mod});
const J=x=>x==null?x:JSON.parse(JSON.stringify(x));
const {aplicarOrigemAnuncio,LER_ANUNCIO,MARCAR_ORIGEM,TROCAS}=mod.exports;

const fluxo=()=>({nodes:[
 {name:'Entrada',parameters:{jsCode:"const b = $json.body;\nlet sessao = null; let contactId = null;\nif (b.passagem && typeof b.passagem === 'object') {\n} else if (b.message) {\n  const msg = b.message;\n  const ticket = msg.ticket || {};\n  const contato = msg.contact || ticket.contact || b.contact || {};\n}\nreturn [{ json: {\n  conta, origem, tel, telNorm, chaveMem, chaveDup, contactId,\n  chatInput } }];"}},
 {name:'Ler Resposta',parameters:{jsCode:"if (!acoesIA.origem) {}\nacoesIA.notas = __acRg.some(a => a.cod === 'NOTA') ? tNotaRg.map(s).filter(Boolean).slice(0, 3) : [];\nif (acoesIA && acoesIA.origem && acoesIA.origem.nome) estado.origem = String(acoesIA.origem.nome).slice(0, 60);\nreturn [];"}},
 {name:'Outro',parameters:{jsCode:'x'}}]});

test('n8n: a troca encaixa uma vez em Entrada e Ler Resposta, não mexe no resto e não aplica duas vezes', () => {
 const orig=fluxo(),w=aplicarOrigemAnuncio(orig);
 const ent=w.nodes[0].parameters.jsCode,lr=w.nodes[1].parameters.jsCode;
 assert.match(ent,/let anuncio = null; let sessao/);assert.match(ent,/anuncio = __lerAnuncio\(msg\);/);assert.match(ent,/contactId, anuncio,/);
 assert.ok(lr.indexOf('__origemAnuncioAgora = true')<lr.indexOf('acoesIA.notas ='));assert.match(lr,/if \(__origemAnuncioAgora\) estado\.origemAnuncio = true;/);
 assert.equal(w.nodes[2].parameters.jsCode,'x');assert.equal(orig.nodes[0].parameters.jsCode.includes('__lerAnuncio'),false,'não muda o original');
 assert.throws(()=>aplicarOrigemAnuncio(w),/já aplicado/);
 const mudou=fluxo();mudou.nodes[1].parameters.jsCode='outra coisa';assert.throws(()=>aplicarOrigemAnuncio(mudou),/trecho mudou/);
 for(const n of ['Entrada','Ler Resposta'])for(const [de] of TROCAS[n])assert.equal(typeof de,'string');
});

test('n8n: lê o anúncio do referral e do externalAdReply; mensagem comum não é anúncio', () => {
 const ctx={};vm.runInNewContext(LER_ANUNCIO+';globalThis.ler=__lerAnuncio;',ctx);
 assert.deepEqual(J(ctx.ler({raw:{referral:{source_id:'1202-33',headline:'Corolla Novembro',ctwa_clid:'ARA'}}})),{id:'120233',titulo:'Corolla Novembro'});
 assert.deepEqual(J(ctx.ler({raw:{message:{extendedTextMessage:{contextInfo:{externalAdReply:{sourceId:'987',title:'SUV'}}}}}})),{id:'987',titulo:'SUV'});
 assert.equal(ctx.ler({raw:{conversation:'oi'}}),null);assert.equal(ctx.ler(null),null);
});

test('n8n: marca a origem do painel só para lead de anúncio, uma vez, e respeita a regra de origem', () => {
 const rodar=({ad,oa,origem=null,estado={}})=>{const ctx={$:()=>({first:()=>({json:{anuncio:ad}})}),c:{crm:{origemAnuncio:oa}},acoesIA:{origem},estado};
  vm.runInNewContext(MARCAR_ORIGEM+';globalThis.agora=__origemAnuncioAgora;',ctx);return ctx;};
 const ad={id:'1',titulo:'x'},oa={id:7,nome:'Anúncio Meta'};
 let r=rodar({ad,oa});assert.deepEqual(J(r.acoesIA.origem),{id:7,nome:'Anúncio Meta'});assert.equal(r.agora,true);
 assert.equal(rodar({ad:null,oa}).acoesIA.origem,null,'sem anúncio');
 assert.equal(rodar({ad,oa:null}).acoesIA.origem,null,'loja não escolheu origem');
 assert.equal(rodar({ad,oa,estado:{origemAnuncio:true}}).acoesIA.origem,null,'já marcou antes');
 assert.deepEqual(J(rodar({ad,oa,origem:{id:3,nome:'Indicação'}}).acoesIA.origem),{id:3,nome:'Indicação'},'regra vale mais');
});

test('painel: quadro "Origem de quem chega por anúncio" em Ações e regras e salvo em crm.origemAnuncio', () => {
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<select id="rgOrigemAd"/);assert.match(html,/Origem de quem chega por anúncio/);
 assert.ok(js.includes('crm: { ...crm, listaEtiquetas: lista, origemAnuncio }'));assert.ok(js.includes('function desenharOrigemAd()'));
});
