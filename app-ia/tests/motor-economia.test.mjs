import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

// o conversor roda colado na aba do n8n; aqui ele é carregado do mesmo jeito, como script
const codigo=readFileSync(new URL('../n8n/motor-economia.js',import.meta.url),'utf8');
const mod={exports:{}};new Function('module','require',codigo)(mod,createRequire(import.meta.url));
const {copiaFiel,economizar,QUEBRAR_BALOES}=mod.exports;
const CRED={id:'cred-teste',name:'OpenAI TESTE ECONOMIA'};

const PROMPT=['=## 👤 QUEM VOCÊ É\nVocê é {{ $(\'Config Loja\').first().json.L.nomeIA }}.\nCada mensagem sua tem que empurrar o atendimento pra frente.\n',
 'Toda mensagem calorosa termina empurrando o atendimento pra frente. Se você\nescreveu duas mensagens seguidas sem nenhuma pergunta ou avanço, você perdeu\no fio — retome a etapa em que estava.\n\n---\n\n',
 '## 🧾 FICHA DO ATENDIMENTO\n\n{{ $json.fichaAtendimento }}\n\n## 🕘 O QUE JÁ FOI CONVERSADO\n\n{{ $json.historicoRecente || \'Nenhuma\' }}\n\n',
 '*REGRAS DE CONTINUIDADE*\n- Continue de onde parou no histórico acima.\n- Nunca repita o que está no histórico acima.\nTudo que aparece na ficha acima já foi respondido.\n',
 'x'.repeat(4000),
 '\n"{{ $json.periodoDia }}! Tudo bem?"\n"{{ $json.periodoDia }}! Vi o anúncio"\nPassa aqui {{ $json.opcoesVisita }}? Ou {{ $json.opcoesVisita }}?\n## 🚧 LIMITES\nfim'].join('');
// recortes fiéis dos nós de código do motor V1.4.4 (só o que o conversor troca, rodável aqui)
const PREP=`let hist = est.hist.slice(-12); if(!hist.length) hist = comAb.hist.slice(-12);
const coletados = [], falta = []; const temVeiculo = !!est.veiculo;
if (est.visita) coletados.push('Visita: ' + est.visita);
else if (temVeiculo) falta.push('Convite pra visita na loja');
const fichaAtendimento = [
  falta.length ? falta.join('|') : '  (nada — va pra visita e transfira)',
  'Atendimento ja iniciado: ' + (jaAtendido ? 'SIM' : 'NAO'),
].join('\\n');
return { coletados, falta, fichaAtendimento };`;
const ESTADO=`const msgCliente = $msg.cliente, msgBot = $msg.bot;
const hist = (prev.hist || []).slice();
const estado = {
  sessionId: 'x',
  hist: hist.slice(-16)
};
return estado;`;
const TRAVA=`let messages = ($msgs || []).slice();
const __tem = (...v) => v.some(x => String(x ?? '').trim() !== '');
const __sabe = {
  entrada: __tem(__da.entradaDetectada, __est.entrada),
  visita: __tem(__da.visitaDetectada, __est.visita),
};
const __sa = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const __INTENCAO = {
  entrada: [/\\bentrada\\b/], cpf: [/\\bcpf\\b/],
  visita: [/(que dia|qual dia|quando) (voce |vc )?(pode|consegue|prefere|quer|gostaria de) (vir|passar|dar um pulo|visitar)/, /(agendar|marcar) (a |uma |sua )?visita/]
};
const __nomeIA = String(__L.nomeIA || '');
const __repetida = (q) => false;
const __cortes = [];
const __limpar = (m) => String(m).split(/(?<=[?!.])\\s+/).filter(p => {
  if (!/\\?/.test(p)) return true;
  const s = __sa(p);
  for (const [campo, res] of Object.entries(__INTENCAO)) {
    if (__sabe[campo] && res.some(re => re.test(s))) { __cortes.push(campo + ': ' + p.slice(0, 80)); return false; }
  }
  return true;
}).join(' ').trim();
const __lote = (m) => String(m).split(/(?<=[?!.])\\s+/).filter(p => {
    if (!/\\?/.test(p)) return true;
    return false;
  }).join(' ');
    const __prox = !__sabe.veiculo ? 'Qual?'
      : !__sabe.visita ? 'Fica melhor pra você vir conhecer pessoalmente ' + (__opc || 'essa semana') + '?'
      : '';
    if (__prox) messages.push(__prox);
return { __sabe, __INTENCAO, __limpar, __lote, messages, __cortes };`;
const DETECTAR=`const tag = (nome) => {
  const m = output.match(new RegExp('\\\\[' + nome + ':\\\\s*([^\\\\]]+)\\\\]', 'i'));
  return m ? m[1].trim() : '';
};

const nomeDetectado = tag('NOME') || null;
return { entrada: tag('ENTRADA'), nasc: tag('NASC'), nome: nomeDetectado };`;
const ligar=(de,para,tipo='main',saida=0)=>({[de]:{[tipo]:Object.assign([],{[saida]:[{node:para,type:tipo,index:0}]})}});
const MOTOR={id:'xQ7',name:'V1.4.4 SDR Motor',active:true,versionId:'v1',settings:{executionOrder:'v1'},
 nodes:[
  {name:'Webhook',type:'n8n-nodes-base.webhook',parameters:{path:'sdr-motor'},webhookId:'antigo'},
  {name:'Prep Context',type:'n8n-nodes-base.code',parameters:{jsCode:PREP}},
  {name:'Montar Estado',type:'n8n-nodes-base.code',parameters:{jsCode:ESTADO}},
  {name:'AI Agent',type:'@n8n/n8n-nodes-langchain.agent',parameters:{options:{systemMessage:PROMPT}}},
  {name:'OpenAI Model',type:'@n8n/n8n-nodes-langchain.lmChatOpenAi',parameters:{},credentials:{openAiApi:{id:'prod',name:'Elluxcar API'}}},
  {name:'Memory',type:'@n8n/n8n-nodes-langchain.memoryBufferWindow',parameters:{}},
  {name:'Router Depto',type:'n8n-nodes-base.switch',parameters:{}},
  {name:'Parser Chain',type:'@n8n/n8n-nodes-langchain.chainLlm',position:[10,20],parameters:{}},
  {name:'OpenAI Parser',type:'@n8n/n8n-nodes-langchain.lmChatOpenAi',parameters:{},credentials:{openAiApi:{id:'prod',name:'Elluxcar API'}}},
  {name:'Output Parser',type:'@n8n/n8n-nodes-langchain.outputParserStructured',parameters:{}},
  {name:'Code JS',type:'n8n-nodes-base.code',parameters:{jsCode:TRAVA}},
  {name:'Detectar Acao',type:'n8n-nodes-base.code',parameters:{jsCode:DETECTAR}}],
 connections:{...ligar('OpenAI Model','AI Agent','ai_languageModel'),...ligar('Memory','AI Agent','ai_memory'),
  ...ligar('Router Depto','Parser Chain','main',3),...ligar('OpenAI Parser','Parser Chain','ai_languageModel'),
  ...ligar('Output Parser','Parser Chain','ai_outputParser'),...ligar('Parser Chain','Code JS')}};

test('a cópia fiel fica desligada, com endereço próprio e a chave de teste, sem tocar no original', () => {
 const w=copiaFiel(MOTOR,{nome:'TESTE A',path:'sdr-motor-teste-a',credencial:CRED});
 assert.equal(w.active,false); assert.equal(w.id,undefined); assert.equal(w.name,'TESTE A');
 const wh=w.nodes.find(n=>n.name==='Webhook'); assert.equal(wh.parameters.path,'sdr-motor-teste-a'); assert.notEqual(wh.webhookId,'antigo');
 assert.ok(w.nodes.filter(n=>n.credentials?.openAiApi).every(n=>n.credentials.openAiApi.id==='cred-teste'));
 assert.equal(MOTOR.nodes[0].parameters.path,'sdr-motor'); assert.equal(MOTOR.active,true);
 assert.throws(()=>copiaFiel(MOTOR,{nome:'x',path:'y'}),/credencial/);
});

test('a versão econômica põe tudo que muda no fim do prompt e não perde nenhum dado', () => {
 const w=economizar(MOTOR,{nome:'TESTE B',path:'sdr-motor-teste-b',credencial:CRED});
 const p=w.nodes.find(n=>n.name==='AI Agent').parameters.options.systemMessage;
 for(const d of ['$json.fichaAtendimento','$json.historicoRecente','$json.periodoDia','$json.opcoesVisita'])
  assert.ok(p.indexOf(d)>p.indexOf('## 🚧 LIMITES'),d+' tem que vir depois das regras');
 assert.ok(p.startsWith('=## 👤 QUEM VOCÊ É'));
 // 2 no texto + 2 na legenda do fim
 assert.equal((p.match(/\{periodo\}/g)||[]).length,4); assert.equal((p.match(/\{dias_visita\}/g)||[]).length,4);
 assert.doesNotMatch(p,/histórico acima|ficha acima/);
 assert.match(p,/REGRAS DE CONTINUIDADE/);
});

test('a versão econômica tira a memória e a IA dos balões, e liga a quebra por código no mesmo lugar', () => {
 const w=economizar(MOTOR,{nome:'TESTE B',path:'sdr-motor-teste-b',credencial:CRED});
 const nomes=w.nodes.map(n=>n.name);
 for(const n of ['Memory','Parser Chain','OpenAI Parser','Output Parser']) assert.ok(!nomes.includes(n),n);
 const q=w.nodes.find(n=>n.name==='Quebrar Balões'); assert.equal(q.type,'n8n-nodes-base.code'); assert.deepEqual(q.position,[10,20]);
 assert.equal(w.connections['Router Depto'].main[3][0].node,'Quebrar Balões');
 assert.equal(w.connections['Quebrar Balões'].main[0][0].node,'Code JS');
 assert.equal(w.connections.Memory,undefined);
 assert.match(w.nodes.find(n=>n.name==='Prep Context').parameters.jsCode,/slice\(-16\).*slice\(-16\)/);
});

test('o conversor para se o motor tiver mudado', () => {
 const outro=JSON.parse(JSON.stringify(MOTOR)); outro.nodes.find(n=>n.name==='AI Agent').parameters.options.systemMessage='=sem ficha';
 assert.throws(()=>economizar(outro,{nome:'B',path:'b',credencial:CRED}),/prompt/);
});

const B=()=>economizar(MOTOR,{nome:'TESTE B',path:'sdr-motor-teste-b',credencial:CRED});
// roda o nó "Code JS" como no n8n: $('Formatar Estoque') traz a mensagem do cliente
const trava=(codigo,est,cliente='',msgs=[])=>new Function('__da','__est','__L','__opc','$msgs','$',codigo)
 ({},est,{nomeIA:'Lu'},'',msgs,()=>({first:()=>({json:{mensagemConsolidada:cliente}})}));
const codigoDe=(w,n)=>w.nodes.find(x=>x.name===n).parameters.jsCode;

test('o estado conta os convites, percebe a recusa e guarda as perguntas que a IA já fez', () => {
 const rodar=(prev,cliente,bot)=>new Function('prev','$msg','__L',codigoDe(B(),'Montar Estado'))(prev,{cliente,bot},{nomeIA:'Lu'});
 const prev={hist:['Cliente: quero a bros','Lu: Ótima escolha! Consegue passar aqui *amanhã* pra ver ela de perto?'],convitesVisita:1,perguntas:['Vai financiar?']};
 let e=rodar(prev,'moro longe, depois eu vejo','Tranquilo! Quer que eu te mande mais fotos dela?');
 assert.equal(e.visitaRecusada,true); assert.equal(e.convitesVisita,1);
 assert.deepEqual(e.perguntas,['Vai financiar?','Quer que eu te mande mais fotos dela?']);
 e=rodar({hist:['Lu: Qual moto você procura?']},'a bros 160','Boa! Fica melhor pra você vir conhecer pessoalmente hoje ou amanhã?');
 assert.equal(e.convitesVisita,1); assert.equal(e.visitaRecusada,false);
 e=rodar(prev,'pode ser amanhã sim','Combinado!');
 assert.equal(e.visitaRecusada,false,'aceitar não é recusar');
});

test('a ficha mostra a situação do convite e as perguntas que não podem voltar', () => {
 const rodar=est=>new Function('est','comAb','jaAtendido',codigoDe(B(),'Prep Context'))(est,{hist:[]},true);
 let r=rodar({hist:[],veiculo:'Bros',visitaRecusada:true,perguntas:['Vai financiar?']});
 assert.match(r.coletados.join(),/NAO convide de novo/); assert.equal(r.falta.length,0);
 assert.match(r.fichaAtendimento,/PERGUNTAS QUE VOCE JA FEZ[\s\S]*Vai financiar\?/);
 assert.doesNotMatch(r.fichaAtendimento,/va pra visita/);
 r=rodar({hist:[],veiculo:'Bros',convitesVisita:2}); assert.match(r.coletados.join(),/NAO convide mais/);
 r=rodar({hist:[],veiculo:'Bros',convitesVisita:1}); assert.match(r.falta.join(),/1 de 2/);
});

test('a trava não deixa o convite voltar e o código não acrescenta convite sozinho', () => {
 const w=B(); const t=codigoDe(w,'Code JS');
 assert.doesNotMatch(t,/Fica melhor pra você vir conhecer/); assert.match(t,/__prox && !__repetida\(__prox\)/);
 const rodar=est=>trava(t,est);
 assert.equal(rodar({hist:['Lu: Consegue passar aqui amanhã pra ver ela de perto?']}).__sabe.visita,true,'convite na mensagem anterior');
 assert.equal(rodar({hist:['Lu: Qual moto?'],visitaRecusada:true}).__sabe.visita,true);
 assert.equal(rodar({hist:['Lu: Qual moto?']}).__sabe.visita,false);
 const {__INTENCAO}=rodar({hist:[]});
 assert.ok(__INTENCAO.visita.some(re=>re.test('fica melhor pra voce vir conhecer pessoalmente hoje ou amanha?')));
 const p=w.nodes.find(n=>n.name==='AI Agent').parameters.options.systemMessage;
 assert.match(p,/NATURALIDADE/);
 for(const r of ['Pergunta pendente vem antes de tudo','Resposta curta se lê pelo contexto','Interesse não é agendamento']) assert.ok(p.includes(r),r); assert.ok(p.indexOf('NATURALIDADE')<p.indexOf('📌 DADOS DESTE ATENDIMENTO'),'regra fica na parte fixa');
 assert.doesNotMatch(p,/tem que empurrar o atendimento|perdeu\no fio/);
});

test('marcação "não informado" não vira dado e "viu?" no fim não apaga a resposta', () => {
 const w=B();
 const det=output=>new Function('output',codigoDe(w,'Detectar Acao'))(output);
 assert.deepEqual(det('Ok! [ENTRADA:Não informado] [NASC: não informado] [NOME:Leonardo]'),{entrada:'',nasc:'',nome:'Leonardo'});
 assert.equal(det('[ENTRADA:5000]').entrada,'5000'); assert.equal(det('[ENTRADA:nao]').entrada,'nao');
 const {__limpar,__lote}=trava(codigoDe(w,'Code JS'),{hist:[],entrada:'5000'});
 // com a entrada já sabida, a pergunta da entrada sai; a afirmação com "viu?" fica
 assert.equal(__limpar('Na entrada aceitamos cartão, dá pra parcelar, viu? Qual o valor da entrada?'),'Na entrada aceitamos cartão, dá pra parcelar, viu?');
 assert.equal(__lote('Combinado, tá? Pode ser amanhã?'),'Combinado, tá?');
});

test('não pede o mesmo dado de novo quando o cliente desconversou, e não cumprimenta no meio da conversa', () => {
 const t=codigoDe(B(),'Code JS'), hist=['Cliente: tenho um gol','Lu: Show! Me passa seu CPF e sua data de nascimento?'];
 let r=trava(t,{hist},'Moro longe, depois eu vejo',['Boa noite, Leonardo. Entendo! Mesmo assim, qual é o seu CPF?']);
 assert.equal(r.__limpar('Entendo! Mesmo assim, qual é o seu CPF?'),'Entendo!');
 assert.match(r.messages[0],/^Entendo!/,'tirou o "Boa noite, Leonardo."');
 r=trava(t,{hist},'sim',['Perfeito!']);
 assert.equal(r.__limpar('Perfeito! Me passa seu CPF?'),'Perfeito! Me passa seu CPF?','topou: pode pedir');
 r=trava(t,{hist:[]},'Oi',['Boa noite! Tudo bem?']);
 assert.equal(r.messages[0],'Boa noite! Tudo bem?','primeira mensagem mantém o cumprimento');
});

const balao=texto=>new Function('$',QUEBRAR_BALOES)(()=>({first:()=>({json:{output:texto}})}))[0].json.output.messages;
test('a quebra de balões segue as regras da Parser Chain', () => {
 assert.deepEqual(balao('Oi, *Carlos*! Tudo bem?'),['Oi, *Carlos*! Tudo bem?']);
 assert.deepEqual(balao(''),[]);
 const longo='A *Bros 160* 2024 está impecável, revisada e com o manual. '.repeat(3)+'\n\n'+
  'Ela sai por R$ 18.900 à vista, ou dá para financiar com entrada. '.repeat(2)+'\n\n## Visita\nConsegue passar aqui *amanhã* pra ver ela de perto?';
 const m=balao(longo);
 assert.ok(m.length>=2&&m.length<=3,JSON.stringify(m));
 assert.ok(m.every(x=>x.length>=15)); assert.ok(m.every(x=>!/##/.test(x)));
 assert.ok(m.join(' ').includes('*Bros 160*'));
 assert.match(m[m.length-1],/Visita|perto\?/); assert.ok(!m.some(x=>/^Consegue passar aqui \*amanhã\* pra ver ela de perto\?$/.test(x)),'pergunta não pode ficar sozinha');
});
