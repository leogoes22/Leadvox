import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// trechos do n8n (app-ia/n8n/rodizio-lojas.js), rodados aqui com o mínimo da Fila de Envio em volta
const src=readFileSync(new URL('../n8n/rodizio-lojas.js',import.meta.url),'utf8');
const mod={exports:{}};new Function('module',src)(mod);
const N=mod.exports;

// a escolha da loja + o rodízio de vendedores como está na Fila de Envio (vez por conta:fila, carteira por conta:tel:fila)
const escolher=new Function('r','c','$getWorkflowStaticData',`
const s = (v) => String(v ?? '').trim();
const norm = (t) => s(t).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
const setores = (c.setores || []).filter(x => x && s(x.nome));
const alvo = norm(r.transf.setor);
${N.ESCOLHER_LOJA}
const filaId = setor && Number(setor.filaId) ? Number(setor.filaId) : null;
let vendedorRod = null;
if (setor && setor.distribuicao === 'rodizio' && setor.vendedores.length) {
  const sd = $getWorkflowStaticData('global'); sd.rodizioIag = sd.rodizioIag || {}; sd.carteiraIag = sd.carteiraIag || {};
  const ch = r.conta + ':' + filaId, ck = r.conta + ':' + r.tel + ':' + filaId;
  const dono = sd.carteiraIag[ck] ? setor.vendedores.find(v => v.id === sd.carteiraIag[ck].id) : null;
  if (dono) vendedorRod = dono;
  else { const pos = (Number(sd.rodizioIag[ch]) || 0) % setor.vendedores.length; sd.rodizioIag[ch] = pos + 1; vendedorRod = setor.vendedores[pos]; }
  sd.carteiraIag[ck] = { id: vendedorRod.id, ts: Date.now() };
}
return { loja: setor && setor.nome, vendedor: vendedorRod && vendedorRod.nome, caiuNoPadrao, lojaRod: __lojaRod };`);

const vend=(p,n)=>Array.from({length:n},(_,i)=>({id:p.charCodeAt(0)*100+i+1,nome:p+'-v'+(i+1)}));
const cfg={setores:[
 {nome:'Loja Centro',filaId:1,grupo:'Lojas',padrao:true,distribuicao:'rodizio',vendedores:vend('C',3)},
 {nome:'Loja Norte',filaId:2,grupo:'Lojas',distribuicao:'rodizio',vendedores:vend('N',2)},
 {nome:'Loja Sul',filaId:3,grupo:' lojas ',distribuicao:'rodizio',vendedores:vend('S',10)},
 {nome:'Financeiro',filaId:9,distribuicao:'fila',vendedores:[]}
]};

test('rodízio entre lojas: gira as lojas e, dentro de cada uma, os vendedores (fila justa)', () => {
 const sd={};const passa=(tel,setor='Lojas',extra={})=>escolher({conta:'unity-car-e869ffce',tel,transf:{setor},...extra},cfg,()=>sd);
 const seq=[1,2,3,4,5,6,7].map(i=>{const x=passa(String(i));return x.loja+'/'+x.vendedor;});
 assert.deepEqual(seq,['Loja Centro/C-v1','Loja Norte/N-v1','Loja Sul/S-v1','Loja Centro/C-v2','Loja Norte/N-v2','Loja Sul/S-v2','Loja Centro/C-v3']);
 const volta=passa('2');
 assert.equal(volta.loja+'/'+volta.vendedor,'Loja Norte/N-v1','cliente que volta fica na mesma loja e com o mesmo vendedor');
 assert.equal(volta.lojaRod.carteira,true);
 const prox=passa('8');assert.equal(prox.loja+'/'+prox.vendedor,'Loja Norte/N-v1','quem voltou não gastou a vez: a próxima loja é a Norte, que já deu a volta nos 2');
});

test('loja pedida pelo nome vai direto; setor de fora do grupo não mexe na vez das lojas', () => {
 const sd={};const passa=(tel,setor,extra={})=>escolher({conta:'k-12345678',tel,transf:{setor},...extra},cfg,()=>sd);
 assert.equal(passa('1','Loja Sul').loja,'Loja Sul');
 assert.equal(passa('1','Loja Sul').lojaRod,null);
 assert.equal(passa('2','Financeiro').loja,'Financeiro');
 assert.equal(sd.rodizioLojaIag,undefined,'ninguém gastou a vez das lojas');
 assert.equal(passa('3','Lojas').loja,'Loja Centro');
});

test('padrão do grupo: setor que não existe, encerramento do Guardião e pessoa específica', () => {
 const sd={};const passa=(tel,setor,extra={})=>escolher({conta:'k-12345678',tel,transf:{setor},...extra},cfg,()=>sd);
 const x=passa('1','Setor que não existe');assert.equal(x.loja,'Loja Centro');assert.equal(x.caiuNoPadrao,true);
 assert.equal(passa('2','Loja Centro',{origemAcao:'guardiao'}).loja,'Loja Norte','o encerramento usa o nome do padrão, mas entra no rodízio');
 assert.equal(passa('3','Loja Centro').loja,'Loja Centro','pedido normal pela loja padrão vai para ela');
 assert.equal(passa('4','Qualquer',{transf:{setor:'Qualquer',pessoa:{id:5}}}).loja,'Loja Centro');
});

test('sem grupo nada muda', () => {
 const sd={};const sem={setores:[{nome:'Comercial',filaId:5,padrao:true,distribuicao:'rodizio',vendedores:vend('X',2)}]};
 const passa=(tel,setor)=>escolher({conta:'k-12345678',tel,transf:{setor}},sem,()=>sd);
 assert.deepEqual([passa('1','Comercial').vendedor,passa('2','Comercial').vendedor,passa('3','x').vendedor],['X-v1','X-v2','X-v1']);
 assert.equal(sd.rodizioLojaIag,undefined);
});

test('a troca só é feita com o trecho exato (fluxo mudou → nada é salvo)', () => {
 const fila=N.TROCAS_LOJAS['Fila de Envio'].map(([de])=>de).join('\nX\n'),prompt=N.TROCAS_LOJAS['Montar Prompt'][0][0];
 const wf={nodes:[{name:'Fila de Envio',parameters:{jsCode:fila}},{name:'Montar Prompt',parameters:{jsCode:prompt}}]};
 const novo=N.aplicarRodizioLojas(wf);
 assert.match(novo.nodes[0].parameters.jsCode,/rodizioLojaIag/);
 assert.match(novo.nodes[1].parameters.jsCode,/rodízio entre as lojas/);
 assert.equal(wf.nodes[0].parameters.jsCode,fila,'original intacto');
 assert.throws(()=>N.aplicarRodizioLojas(novo),/trecho achado 0x/);
});
