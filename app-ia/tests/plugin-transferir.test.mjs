import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';

// código dos nós novos do n8n (app-ia/n8n/plugin-transferir.js), rodado aqui com nós de mentira
const src=readFileSync(new URL('../n8n/plugin-transferir.js',import.meta.url),'utf8');
const mod={exports:{}};new Function('module',src)(mod);
const N=mod.exports;
const AF=Object.getPrototypeOf(async function(){}).constructor;
const no=(map)=>(n)=>({first:()=>({json:map[n]}),all:()=>[].concat(map[n]??[]).map(j=>({json:j}))});

test('rodízio do botão: só os marcados, alterna, cliente antigo volta para quem atendia, ninguém recebe o que já tem', async () => {
 const sd={};
 const rodar=async(body,confere=true)=>(await new AF('$','$input','$getWorkflowStaticData',N.RODIZIO_PLUGIN)(no({'Rodízio · Plugin':{body},'Rodízio · Confere':confere}),{},()=>sd))[0].json;
 const base={k:'brants-car-1f42143d',t:'x',filaId:70,vendedores:[{id:11,nome:'Marcelo'},{id:12,nome:'Victoria'}]};
 assert.deepEqual((await rodar({...base,tel:'1',ver:true})).resposta,{ok:true,proximo:{id:11,nome:'Marcelo'},como:'vez',ordem:['Marcelo','Victoria']});
 assert.equal(sd.rodizioIag['brants-car-1f42143d:70'],undefined,'só ver não gasta a vez');
 const quem=async(tel,extra={})=>(await rodar({...base,tel,...extra})).resposta;
 assert.equal((await quem('1')).pessoa.nome,'Marcelo');
 assert.equal((await quem('2')).pessoa.nome,'Victoria');
 assert.equal((await quem('3')).pessoa.nome,'Marcelo');
 assert.deepEqual(await quem('1'),{ok:true,pessoa:{id:11,nome:'Marcelo'},como:'carteira'});
 assert.equal((await quem('4',{usuarioTicket:12})).pessoa.nome,'Marcelo','a Victoria já está com o ticket: vai para o seguinte');
 assert.equal((await quem('5',{pessoaId:12})).como,'escolha');
 assert.equal((await rodar({...base,tel:'6',pessoaId:99})).status,400,'quem não está marcado nunca recebe');
 assert.equal((await rodar({...base,tel:'7',vendedores:[]})).status,400);
 assert.equal((await rodar({...base,tel:'8'},false)).status,401,'chave do plugin conferida no banco');
});

function contexto(extra={}){
 return {acao:'transferir',conta:'brants-car-1f42143d',tel:'21987654321',telFull:'5521987654321',cm:'brants-car-1f42143d:21987654321',ticketId:'555',vendedor:'Thales',cliente:'João',contactId:'99',
  filaId:'70',pessoaId:'',usuarioId:'5',url:'https://chat2api.leadvox.com.br/v1/api/external/abc/?token=TOK',ia:{estado:'atendendo'},resumo:{nome:'João'},
  __x:{transferir:{setores:[{nome:'Comercial',filaId:70,rodizio:true,escolher:false,pessoas:[]},{nome:'Administrativo',filaId:69,rodizio:false,escolher:false,pessoas:[]}]},
   oportunidade:{id:300,etapa:'Qualificado',valor:90900,responsavel:'Thales',responsavelId:5,pipelineStepId:11},origem:{tipo:'anuncio',texto:'Corolla Novembro'},
   coleta:[{k:'Pagamento',v:'Financiamento'}],interesse:{nome:'COROLLA 2019',preco:90900},resumoIA:'Quer o Corolla.',_ag:{chave:'ag1',avisoVendedor:true,iaContinua:false}},...extra};
}
const agente={chave:'ag1',setores:[{nome:'Comercial',filaId:70,distribuicao:'rodizio',vendedores:[{id:11,nome:'Marcelo',whatsapp:'5521911112222'},{id:12,nome:'Victoria'}]},{nome:'Administrativo',filaId:69,distribuicao:'fila'}]};
const opp={id:300,name:'João — WhatsApp',description:'Criada pela IA Bruna.',value:90900,expectedCloseDate:'2026-11-19',contactId:99,responsibleId:5,pipelineStepId:11};
async function transferir(c,rodizio){
 const map={'Contexto':c,'Plugin':{body:{t:'TKN'}},'Agentes da Conta':agente,'Oportunidade':{data:[opp]},'Rodízio da Fila':rodizio};
 map['Preparar Transferência']=(await new AF('$','$input',N.PREPARAR_TRANSF)(no(map),{}))[0].json;
 return (await new AF('$','$input',N.MONTAR_TRANSF)(no(map),{}))[0].json;
}

test('transferir: nota com resumo, ticket para o departamento e a pessoa, oportunidade e aviso para quem recebeu, IA em silêncio', async () => {
 const m=await transferir(contexto(),{ok:true,pessoa:{id:11,nome:'Marcelo'},como:'vez'});
 assert.equal(m.pular,false);
 assert.deepEqual(m.reqs.map(r=>r.tipo),['nota','ticket','oportunidade','aviso']);
 const [nota,ticket,op,aviso]=m.reqs;
 assert.equal(nota.body.queueId,'70');assert.equal(nota.body.userId,11);assert.equal(nota.body.onlyNote,true);
 assert.match(nota.body.note.body,/Para: \*Marcelo\* \(rodízio do departamento\)/);assert.match(nota.body.note.body,/Corolla Novembro/);
 assert.deepEqual(ticket,{tipo:'ticket',method:'PUT',url:'https://chat2api.leadvox.com.br/tickets/555',body:{queueId:70,status:'open',userId:11}});
 assert.equal(op.url,'https://chat2api.leadvox.com.br/v1/api/external/abc/opportunities/300');assert.equal(op.body.responsibleId,11);assert.equal(op.body.pipelineStepId,11);
 assert.equal(aviso.body.number,'5521911112222');assert.match(aviso.body.body,/wa\.me\/5521987654321/);
 assert.equal(m.travar,true);assert.equal(m.chaveHumano,'iag_humano_brants-car-1f42143d:21987654321');assert.equal(m.token,'TOK');
});

test('transferir: fila do departamento sem pessoa, "IA continua" não silencia, erros claros', async () => {
 const c=contexto({filaId:'69'});c.__x._ag.iaContinua=true;
 const m=await transferir(c,{});
 assert.deepEqual(m.reqs.map(r=>r.tipo),['nota','ticket']);assert.equal(m.reqs[1].body.userId,undefined);assert.equal(m.travar,false);
 assert.deepEqual((await transferir(contexto({filaId:'1'}),{})).resposta,{ok:false,erro:'Escolha um departamento da lista.'});
 assert.equal((await transferir(contexto(),{ok:false,erro:'x'})).status,502);
 const fila=await transferir(contexto({acao:'fila'}),{ok:true,proximo:{id:12,nome:'Victoria'},como:'vez',ordem:['Victoria','Marcelo']});
 assert.deepEqual(fila.resposta,{ok:true,setor:'Comercial',proximo:'Victoria',como:'vez',ordem:['Victoria','Marcelo']});
});

test('n8n: as trocas entram nos dois fluxos (rodízio no Atendimento, ações no plugin) e o código novo compila', () => {
 for(const k of ['RODIZIO_PLUGIN','PREPARAR_TRANSF','MONTAR_TRANSF','RESPOSTA_TRANSF','PREPARAR_FECHAR','RESPOSTA_FECHAR','ITENS_TRANSF'])new AF('$','$input','$getWorkflowStaticData',N[k]);
 assert.match(N.RODIZIO_PLUGIN,/\$getWorkflowStaticData\('global'\)/);
 assert.match(N.RODIZIO_PLUGIN,/sd\.rodizioIag\[ch\] = pos \+ 1/,'mesma vez do rodízio da IA (Fila de Envio)');
 assert.ok(N.TROCAS_PLUGIN.Validar[0][1].includes("'fila', 'transferir', 'fechar'"));
 assert.doesNotMatch(N.TROCAS_PLUGIN.Contexto[0][1],/whatsapp/,'o contexto não manda o WhatsApp dos usuários para a tela');
});

test('servidor do plugin: repassa fila/transferir/fechar só com os campos conhecidos', async t => {
 const envios=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{envios.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true})};}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 const post=b=>fetch(base+'/api/plugin',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({k:'loja-teste-ab12cd34',t:'0123456789abcdef01234567',tel:'5521988943529',...b})});
 assert.equal((await post({acao:'transferir',filaId:'70',pessoaId:'12',usuarioId:'5',vendedores:[{id:1}]})).status,200);
 assert.deepEqual({f:envios[0].filaId,p:envios[0].pessoaId,u:envios[0].usuarioId,v:envios[0].vendedores},{f:'70',p:'12',u:'5',v:undefined});
 assert.equal((await post({acao:'transferir'})).status,400);
 assert.equal((await post({acao:'fila',filaId:'70'})).status,200);
 assert.equal((await post({acao:'fechar',status:'apagar'})).status,400);
 assert.equal((await post({acao:'fechar',status:'won'})).status,200);assert.equal(envios.at(-1).status,'won');
});

test('tela do plugin: "Plugin do Usuário", sem agendamento; transferir, oportunidade (Vendido/Perdido) e resumo com Copiar', () => {
 const js=readFileSync(new URL('../public/vendedor.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/vendedor.html',import.meta.url),'utf8');
 assert.match(html,/<title>LeadVox · Plugin do Usuário<\/title>/);
 assert.doesNotMatch(html,/pvAgendar/);assert.doesNotMatch(js,/chamar\('agendar'/);
 for(const a of ["chamar('transferir'","chamar('fila'","chamar('fechar'",'id="rsCopiar"'])assert.ok(js.includes(a),a);
 assert.match(js,/Desligar a IA neste atendimento/);
 const painel=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
 assert.match(painel,/data-c="pluginEscolha"/);assert.match(painel,/pluginEscolha: s\.distribuicao === 'rodizio' && s\.pluginEscolha === 'escolher'/);
 assert.match(painel,/Como o cliente chega aos usuários/);
});
