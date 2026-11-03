import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modeloRegras,sugerirItem,montarRegra,juntarRegras} from '../public/modelos-regras.js';
const RE_ACAO=/\[(ETIQUETA|TIRAR_ETIQUETA|ETAPA|ORIGEM|DEPARTAMENTO|PESSOA|NOTA|AVISAR)\s*:\s*([^\]\n]*)\]/g;

test('every agent type and niche gets rules, written for that niche',()=>{
 for(const tipo of ['sdr','recepcao','suporte','catalogo','agendamento','agenda','tipo-novo'])for(const nicho of ['automotivo','imoveis','saude','advocacia','educacao','varejo','viagens','outro','nao-existe']){
  const l=modeloRegras(tipo,nicho);assert.ok(l.length>=4,tipo+' '+nicho);
  for(const r of l){assert.match(r.quando,/^Quando /);assert.ok(r.acoes.length>0);for(const a of r.acoes)assert.ok(a.texto||a.sugere?.length,tipo);}
 }
 assert.ok(modeloRegras('sdr','automotivo').some(l=>/test drive/.test(l.quando)));
 assert.ok(modeloRegras('sdr','educacao').some(l=>/matrícula/.test(l.quando)));
});
test('origin rows come only from the LeadVox list of the client, at most twelve, already chosen',()=>{
 const base=modeloRegras('sdr','outro').length;
 assert.equal(modeloRegras('sdr','outro',[]).length,base);
 const l=modeloRegras('sdr','outro',['Instagram','  ','Site',...'abcdefghijklmn']);
 const origens=l.filter(x=>x.acoes[0].cod==='ORIGEM');
 assert.equal(origens.length,12);assert.match(origens[0].quando,/veio de Instagram$/);assert.equal(origens[0].acoes[0].valor,'Instagram');
});
test('each call returns a fresh copy, so one screen cannot change the next',()=>{
 const a=modeloRegras('sdr','outro');a[0].acoes[0].valor='x';a[0].quando='y';
 const b=modeloRegras('sdr','outro');assert.equal(b[0].acoes[0].valor,undefined);assert.notEqual(b[0].quando,'y');
});
test('suggestion ignores accents and case, follows priority and never invents an item',()=>{
 const nomes=['Cliente novo','QUENTE','Negociação','Sem interesse'];
 assert.equal(sugerirItem(nomes,['negociacao']),'Negociação');
 assert.equal(sugerirItem(nomes,['interessado','quente']),'QUENTE');
 assert.equal(sugerirItem(nomes,['agendad']),'');
 assert.equal(sugerirItem([],['quente']),'');assert.equal(sugerirItem(null,null),'');
});
test('a funnel name does not count as a match for its steps',()=>{
 assert.equal(sugerirItem(['Agendamento › Novo','Vendas › Agendado'],['agendad']),'Vendas › Agendado');
 assert.equal(sugerirItem(['Negociação › Novo'],['negociacao']),'');
});
test('vague words do not mark the wrong tag of a real LeadVox list',()=>{
 const reais=['• 🚗 Interesse Hatch','• ✅ Cliente Compareceu na Visita','📅 Visita agendada','💵 À vista'];
 const m=modeloRegras('recepcao','automotivo'),et=i=>sugerirItem(reais,m[i].acoes.find(a=>a.cod==='ETIQUETA').sugere);
 assert.equal(et(0),'');assert.equal(et(1),'📅 Visita agendada');assert.equal(et(2),'');
});
test('a built rule is the format the motor and the panel read, and unused actions stay out',()=>{
 const r=montarRegra('Quando o cliente pedir preço:  ',[{cod:'ETIQUETA',valor:'Quente'},{cod:'ETAPA',valor:''},{cod:'NOTA',valor:'resumo [do] caso'}]);
 assert.equal(r,'Quando o cliente pedir preço: [ETIQUETA:Quente] [NOTA:resumo do caso]');
 assert.deepEqual([...r.matchAll(RE_ACAO)].map(m=>m[1]),['ETIQUETA','NOTA']);
 assert.equal(montarRegra('Quando x',[{cod:'ETIQUETA',valor:''}]),'');
 assert.equal(montarRegra('',[{cod:'ETIQUETA',valor:'a'}]),'');
 assert.equal(montarRegra('Quando x',[{cod:'ETIQUETA',valor:''},{cod:'NOTA',valor:'resumo'}]),'');
});
test('joining keeps what was written and does not repeat a line',()=>{
 assert.equal(juntarRegras('',['a: [NOTA:x]']),'a: [NOTA:x]');
 assert.equal(juntarRegras('Minha regra',['a: [NOTA:x]','','a: [NOTA:x]']),'Minha regra\na: [NOTA:x]');
 assert.equal(juntarRegras('A: [NOTA:X]\nb',['a: [nota:x]']),'A: [NOTA:X]\nb');
});
test('the panel imports the models, has the button and the new list page',()=>{
 const p=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8'),h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(p,/from '\/modelos-regras\.js'/);
 for(const id of ['rgModelo','dlgModelo','mdCorpo','mdUsar','mdAtualizar','mdResumo','mdTitulo'])assert.match(h,new RegExp('id="'+id+'"'),id);
 assert.match(p,/\['origens', 'Origens do lead'/);assert.match(p,/\['status', 'Etapas do funil'/);assert.doesNotMatch(p,/Status do lead/);
});
