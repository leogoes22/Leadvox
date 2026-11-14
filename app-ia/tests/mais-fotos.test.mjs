import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const mod={exports:{}};vm.runInNewContext(readFileSync(new URL('../n8n/mais-fotos.js',import.meta.url),'utf8'),{module:mod});
const J=x=>x==null?x:JSON.parse(JSON.stringify(x));
const {aplicarMaisFotos,MAIS_FOTOS,VISTOS_LEVES,REGRA_PROMPT,TROCAS_FOTOS,LOTE_FOTOS,MAX_FOTOS}=mod.exports;

const fluxo=()=>({nodes:[
 {name:'Ler Resposta',parameters:{jsCode:"const guardar = (i) => { conhecidos[String(i.id)] = { fotos: Array.isArray(i.fotos) ? i.fotos.filter(u => /^https?:\\/\\//.test(String(u))).slice(0, 3) : [] }; };\nconst tNome = tags('NOME'), tFoto = tags('FOTOS?'), tMat = tags('MATERIAL');\nconst fotos = [];\nconst enviados = (Array.isArray(estado.materiaisEnviados) ? estado.materiaisEnviados : []).map(String);\nestado.vistos = vistos;\nreturn [];"}},
 {name:'Montar Prompt',parameters:{jsCode:"L.push('- [id ' + i.id + ']' + (lista(i.fotos).length ? '' : ' — sem foto'));\nL.push('- Para mandar a foto: aponte para baixo, nunca para cima.',\n'fim');\nL.push('marcações: [NOME:...]' + (A.usaCatalogo ? ' [FOTO:id]' : ''));"}},
 {name:'Outro',parameters:{jsCode:'x'}}]});

test('n8n: a troca encaixa uma vez em Ler Resposta e Montar Prompt, não mexe no resto e não aplica duas vezes', () => {
 const orig=fluxo(),w=aplicarMaisFotos(orig);
 const lr=w.nodes[0].parameters.jsCode,mp=w.nodes[1].parameters.jsCode;
 assert.match(lr,/\.slice\(0, 10\) : \[\] \}; \};/);assert.ok(lr.indexOf("tags('MAIS_FOTOS')")<lr.indexOf("tags('FOTOS?')"));
 assert.ok(lr.indexOf('const fotos = [];')<lr.indexOf('estado.fotosEnviadas = __fe;'));assert.ok(lr.indexOf('estado.fotosEnviadas = __fe;')<lr.indexOf('const enviados ='));
 assert.ok(lr.indexOf('__kv.slice')<lr.indexOf('estado.vistos = vistos;'));
 assert.match(mp,/\[FOTO:id\] \[MAIS_FOTOS:id\]/);assert.match(mp,/' fotos' : lista\(i\.fotos\)\.length \? '' : ' — sem foto'/);assert.match(mp,/Fotos que este cliente já recebeu/);
 new vm.Script('(async()=>{'+lr+'})');new vm.Script('(async()=>{'+mp+'})'); // continua sendo código válido
 assert.equal(w.nodes[2].parameters.jsCode,'x');assert.equal(orig.nodes[0].parameters.jsCode.includes('MAIS_FOTOS'),false,'não muda o original');
 assert.throws(()=>aplicarMaisFotos(w),/já aplicado/);
 const mudou=fluxo();mudou.nodes[1].parameters.jsCode='outra coisa';assert.throws(()=>aplicarMaisFotos(mudou),/trecho mudou/);
 for(const n of ['Ler Resposta','Montar Prompt'])for(const [de] of TROCAS_FOTOS[n])assert.equal(typeof de,'string');
 assert.equal(LOTE_FOTOS,5);assert.equal(MAX_FOTOS,10);
});

const urls=n=>Array.from({length:n},(_,i)=>'https://fotos.exemplo/'+(i+1)+'.jpg');
// roda o trecho como o Ler Resposta: `fotos` já tem as capas pedidas com [FOTO:id]; tMais são os [MAIS_FOTOS:id] da resposta
const rodar=({tMais=[],capas=[],estado={},itens={7:{id:7,nome:'Honda Civic 2020',fotos:urls(8)}},usaCatalogo=true})=>{
 const ctx={A:{usaCatalogo},tMais,estado:J(estado),conhecidos:J(itens),novosVistos:[],fotos:capas.map(id=>({id,url:itens[id].fotos[0],legenda:'*'+itens[id].nome+'*\nR$ 1,00'}))};
 vm.runInNewContext(MAIS_FOTOS,ctx);return J({fotos:ctx.fotos,fe:ctx.estado.fotosEnviadas,vistos:ctx.novosVistos});};

test('motor: [MAIS_FOTOS:id] manda as próximas fotos sem repetir; pedir de novo traz o lote seguinte', () => {
 let r=rodar({capas:[7]});assert.equal(r.fotos.length,1);assert.deepEqual(r.fe,{7:1},'a capa conta como enviada');
 r=rodar({tMais:['7'],estado:{fotosEnviadas:r.fe}});
 assert.deepEqual(r.fotos.map(f=>f.url),urls(8).slice(1,6),'fotos 2 a 6, sem a capa');assert.equal(r.fotos[0].legenda,'*Honda Civic 2020*');assert.equal(r.fotos[1].legenda,'');
 assert.deepEqual(r.fe,{7:6});assert.deepEqual(r.vistos,['7']);
 r=rodar({tMais:['7'],estado:{fotosEnviadas:r.fe}});assert.deepEqual(r.fotos.map(f=>f.url),urls(8).slice(6,8),'o resto');assert.deepEqual(r.fe,{7:8});
 r=rodar({tMais:['7'],estado:{fotosEnviadas:r.fe}});assert.deepEqual(r.fotos.map(f=>f.url),urls(8).slice(0,5),'já recebeu todas: recomeça');
});

test('motor: capa e mais fotos na mesma resposta não repetem a capa; sem capa antes, começa pela primeira', () => {
 let r=rodar({capas:[7],tMais:['7']});assert.deepEqual(r.fotos.map(f=>f.url),urls(8).slice(0,6));assert.deepEqual(r.fe,{7:6});
 r=rodar({tMais:[' id 7 ']});assert.deepEqual(r.fotos.map(f=>f.url),urls(8).slice(0,5));
});

test('motor: só item conhecido e com foto; um item por resposta; sem catálogo não manda nada', () => {
 assert.equal(rodar({tMais:['99']}).fotos.length,0,'id que não existe');
 assert.equal(rodar({tMais:['7'],itens:{7:{id:7,nome:'x',fotos:[]}}}).fotos.length,0,'sem foto');
 assert.equal(rodar({tMais:['7'],usaCatalogo:false}).fotos.length,0);
 const itens={7:{id:7,nome:'A',fotos:urls(3)},8:{id:8,nome:'B',fotos:urls(4)}};
 const r=rodar({tMais:['99, 8','7'],itens});assert.ok(r.fotos.every(f=>f.id===8));assert.equal(r.fotos.length,4);
 assert.deepEqual(rodar({estado:{fotosEnviadas:['lixo']}}).fe,{},'estado estranho não quebra');
});

test('motor: itens vistos há mais tempo ficam com 3 fotos; os 12 últimos guardam todas', () => {
 const vistos={};for(let i=1;i<=15;i++)vistos['k'+i]={id:i,nome:'n',fotos:urls(10)};
 const ctx={vistos};vm.runInNewContext(VISTOS_LEVES,ctx);
 assert.equal(ctx.vistos.k1.fotos.length,3);assert.equal(ctx.vistos.k3.fotos.length,3);assert.equal(ctx.vistos.k4.fotos.length,10);assert.equal(ctx.vistos.k15.fotos.length,10);
});

test('prompt: explica [MAIS_FOTOS:id] e mostra quantas fotos o cliente já recebeu de cada item', () => {
 const linhas=(g,itensCat)=>vm.runInNewContext('['+REGRA_PROMPT+']',{g,itensCat});
 let l=linhas({estado:{}},[]);assert.match(l[0],/\[MAIS_FOTOS:id\]/);assert.match(l[0],/até 5 por vez/);assert.equal(l[1],'');
 l=linhas({estado:{fotosEnviadas:{7:6,9:2,5:1},vistos:{9:{fotos:urls(2)}}}},[{id:7,fotos:urls(14)}]);
 assert.match(l[1],/\[id 7\] 6 de 10; \[id 9\] 2 de 2\./,'no máximo 10; item fora da lista sai dos vistos; item desconhecido não aparece');
 assert.equal(vm.runInNewContext('['+REGRA_PROMPT+']',{itensCat:[]})[1],'','sem o Guardião à mão não quebra o prompt');
});
