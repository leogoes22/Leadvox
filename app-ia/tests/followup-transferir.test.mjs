import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// trechos do n8n (app-ia/n8n/followup-transferir.js), rodados aqui com o mínimo do Planejar em volta
const src=readFileSync(new URL('../n8n/followup-transferir.js',import.meta.url),'utf8');
const mod={exports:{}};new Function('module',src)(mod);
const N=mod.exports;

// o bloco novo do Planejar com as variáveis que o Planejar já tem naquele ponto
const planejar=new Function('f','ctx',`
const { agora, cli = {}, tk = '', travado = false, falando = false, naJanela = true, waba = false, ultCli = 0 } = ctx;
const feitos = new Set(f.feitos || []), fins = [], logs = []; let mudou = false;
const log = (m) => logs.push(m);
${N.PLANEJAR_FIM}
return { fins, logs, mudou, fim: f.fim };`);

const H=3600e3,base=Date.parse('2026-11-24T12:00:00Z');
const ficha=(extra={})=>({base,toques:[{min:60},{min:240},{min:1440}],feitos:[0,1,2],transferido:false,
 fim:{espera:120,url:'https://n8n.leadvox.com.br/webhook/iag-motor-v9?k=unity-car-e869ffce&t=x',corpo:{k:'unity-car-e869ffce',fimFollowup:{n:1}},ultimoToque:base+24*H,feito:''},...extra});

test('passa para a equipe depois da espera do último toque, uma vez só', () => {
 const f=ficha();
 assert.equal(planejar(f,{agora:base+25*H}).fins.length,0,'1 h depois do último toque: ainda espera (pediu 2 h)');
 const r=planejar(f,{agora:base+26*H+1});
 assert.equal(r.fins.length,1);assert.equal(JSON.parse(r.fins[0].corpoJson).fimFollowup.n,1);assert.equal(r.mudou,true);
 assert.ok(r.fim.feito);
 assert.equal(planejar(f,{agora:base+30*H}).fins.length,0,'não repete');
});

test('não passa: respondeu, equipe assumiu, transferido, ticket fechado, toque não saiu, toques pendentes', () => {
 const sem=(f,ctx,motivo)=>{const r=planejar(f,{agora:base+30*H,...ctx});assert.equal(r.fins.length,0,motivo);return r;};
 assert.equal(sem(ficha(),{cli:{ts:base+20*H}},'respondeu').fim.feito,'cliente respondeu');
 assert.equal(sem(ficha(),{travado:true},'equipe').fim.feito,'entregue à equipe');
 assert.equal(sem(ficha({transferido:true}),{},'transferido').fim.feito,'transferido');
 assert.equal(sem(ficha(),{tk:'closed'},'fechado').fim.feito,'ticket finalizado');
 const f=ficha();f.fim.ultimoToque=0;assert.equal(sem(f,{},'o último toque não saiu (ex.: encerrado antes)').fim.feito,'o último toque não saiu');
 assert.equal(sem(ficha({feitos:[0,1]}),{},'ainda tem toque').mudou,false);
 assert.equal(sem(ficha({fim:undefined}),{},'desligado no painel').mudou,false);
});

test('espera a janela e a equipe; oficial passado de 24 h desiste', () => {
 assert.equal(planejar(ficha(),{agora:base+30*H,naJanela:false}).fins.length,0);
 assert.equal(planejar(ficha(),{agora:base+30*H,naJanela:false}).fim.feito,'','fora da janela: tenta de novo depois');
 assert.equal(planejar(ficha(),{agora:base+30*H,falando:true}).fim.feito,'');
 assert.equal(planejar(ficha(),{agora:base+30*H,waba:true,ultCli:base}).fim.feito,'oficial passou de 24 h');
});

test('a troca só é feita com o trecho exato e liga o caminho novo no Follow-up', () => {
 const wf=(trocas)=>({nodes:Object.entries(trocas).map(([name,l])=>({name,position:[0,0],parameters:{jsCode:l.map(([de])=>de).join('\nX\n')}})),connections:{}});
 const atend=wf(N.TROCAS_ATEND),etq=wf(N.TROCAS_ETQ),fu=wf(N.TROCAS_FU);
 fu.nodes.push({name:'Separar Envios',type:'n8n-nodes-base.splitOut',typeVersion:1,position:[0,0],parameters:{}},{name:'Enviar LeadVox',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[0,0],parameters:{}});
 fu.connections.Planejar={main:[[{node:'Separar Envios',type:'main',index:0}]]};
 const r=N.aplicarFollowupTransferir({atend,fu,etq});
 assert.deepEqual(r.fu.connections.Planejar.main[0].map(x=>x.node),['Separar Envios','Separar Fins']);
 assert.deepEqual(r.fu.connections['Separar Fins'].main[0].map(x=>x.node),['Chamar Motor (Fim)']);
 assert.match(r.atend.nodes.find(n=>n.name==='Guardião').parameters.jsCode,/followup_fim/);
 assert.equal(fu.connections.Planejar.main[0].length,1,'original intacto');
 assert.throws(()=>N.aplicarFollowupTransferir(r),/trecho achado 0x/);
});
