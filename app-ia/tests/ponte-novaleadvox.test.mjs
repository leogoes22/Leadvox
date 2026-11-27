import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// código da ponte (app-ia/n8n/ponte-novaleadvox.js), rodado aqui sem rede
const src=readFileSync(new URL('../n8n/ponte-novaleadvox.js',import.meta.url),'utf8');
const mod={exports:{}};new Function('module',src)(mod);
const P=mod.exports;

// aviso real da nova LeadVox (canal → URL do N8N), reduzido ao que importa
const aviso=(content,ticket={},contact={})=>({type:'message_n8n',tenantId:2,
 content:{media:false,messageId:'AC95',text:'Oi',type:'conversation',...content},
 ticket:{fromMe:false,id:613,isGroup:false,queueId:'',status:'pending',userId:'',...ticket},
 channel:{id:5,name:'WhatsApp Loja Teste',type:'baileys'},
 contact:{id:1808,name:'Leonardo Vasconcellos',number:'5521988943529',tags:'',...contact},user:{id:'',name:''}});
const OGG='T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAA';
const JPG='/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB';

test('entrada: texto do cliente vira o ChatFlow que o Motor já lê', () => {
 const r=P.entrada(aviso({text:'Oi, quero um SUV'},{queueId:13,userId:''}));
 assert.deepEqual(r.motor,{chatInput:'Oi, quero um SUV',sessionId:'5521988943529',Departamento:13,ticketId:'613',nomeContato:'Leonardo Vasconcellos',Id_usuario:'',contactId:1808});
 assert.equal(r.midia,null);
 assert.equal(r.ticket.id,'613');
});

test('entrada: ticket com vendedor leva o Id_usuario (o Motor usa para ficar em silêncio)', () => {
 const r=P.entrada(aviso({},{userId:4,queueId:13}));
 assert.equal(r.motor.Id_usuario,'4');assert.equal(r.ticket.userId,4);
});

test('entrada: áudio e foto viram um link com a extensão certa e o arquivo vai junto para a ponte guardar', () => {
 const base='https://n8n.leadvox.com.br/webhook/nl-midia/';
 const e1=P.entrada(aviso({type:'audioMessage',text:'Áudio',media:OGG}),{mediaBase:base,novoId:'abc123'});
 assert.equal(e1.motor.chatInput,base+'abc123.ogg');assert.equal(e1.midia.ext,'ogg');assert.equal(e1.midia.base64,OGG);
 const e2=P.entrada(aviso({type:'imageMessage',text:'Imagem',media:JPG}),{mediaBase:base,novoId:'img9'});
 assert.equal(e2.motor.chatInput,base+'img9.jpg');
});

test('entrada: ignora duplicado, mensagem da equipe, grupo, número curto, mídia sem arquivo e tipo estranho', () => {
 assert.equal(P.entrada({method:'message',msg:{},ticket:{}}).ignorar,'duplicado');
 assert.equal(P.entrada({method:'message_notes'}).ignorar,'outro_evento');
 assert.equal(P.entrada(aviso({}, {fromMe:true})).ignorar,'mensagem_da_equipe');
 assert.equal(P.entrada(aviso({}, {isGroup:true})).ignorar,'grupo');
 assert.equal(P.entrada(aviso({}, {}, {number:'123'})).ignorar,'sem_telefone');
 assert.equal(P.entrada(aviso({type:'audioMessage',media:false})).ignorar,'midia_sem_arquivo');
 assert.equal(P.entrada(aviso({type:'stickerMessage'})).ignorar,'tipo_nao_tratado');
 assert.equal(P.entrada(aviso({text:'   '})).ignorar,'vazio');
});

test('extensão pelo conteúdo: voz, foto, PDF, e cai no padrão do tipo quando não reconhece', () => {
 assert.equal(P.extensaoPorConteudo(OGG,'audioMessage'),'ogg');
 assert.equal(P.extensaoPorConteudo(JPG,'imageMessage'),'jpg');
 assert.equal(P.extensaoPorConteudo('JVBERi0xLjQK','documentMessage'),'pdf');
 assert.equal(P.extensaoPorConteudo('xxxx','audioMessage'),'ogg');
 assert.equal(P.extensaoPorConteudo('xxxx','imageMessage'),'jpg');
});

test('saída: texto simples é um envio só', () => {
 const r=P.saida({number:'5521988943529',body:'Oi!',externalKey:'iag-sdr-0'},{ticketId:613});
 assert.deepEqual(r.chamadas,[{metodo:'POST',rota:'/',corpo:{number:'5521988943529',body:'Oi!',validateNumber:false}}]);
});

test('saída: mensagem que leva a fila e o vendedor vira envio + mudança do ticket (e desliga o N8N dele)', () => {
 const r=P.saida({number:'5521988943529',body:'Vou te passar',externalKey:'iag-sdr-1',queueId:'13',forceTicketToDepartment:true,userId:5,forceTicketToUser:true},{ticketId:'613'});
 assert.equal(r.chamadas.length,2);
 assert.equal(r.chamadas[0].rota,'/');
 assert.deepEqual(r.chamadas[1],{metodo:'POST',rota:'/updateticketinfo',transfere:true,corpo:{ticketId:613,queueId:13,userId:5,n8nStatus:'disabled'}});
});

test('saída: só a fila, sem vendedor; e sem ticket conhecido a transferência é recusada (o Motor avisa a equipe)', () => {
 const r=P.saida({number:'5521988943529',body:'x',queueId:'12',forceTicketToDepartment:true},{ticketId:613});
 assert.deepEqual(r.chamadas[1].corpo,{ticketId:613,queueId:12,n8nStatus:'disabled'});
 const sem=P.saida({number:'5521988943529',body:'x',queueId:'12',forceTicketToDepartment:true},{});
 assert.equal(sem.erro,'sem_ticket');assert.equal(sem.chamadas.length,1);
});

test('saída: nota interna, grupo e mídia', () => {
 assert.deepEqual(P.saida({number:'55219',onlyNote:true,externalKey:'iag-nota',note:{body:'🤖 resumo'}},{ticketId:613}).chamadas,
  [{metodo:'POST',rota:'/createNotes',corpo:{notes:'🤖 resumo',ticketId:613}}]);
 assert.equal(P.saida({number:'5521988943529',onlyNote:true,note:{body:'x'}},{}).erro,'sem_ticket');
 assert.equal(P.saida({number:'5521988943529',onlyNote:true,note:{body:' '}},{ticketId:1}).erro,'nota_vazia');
 const g=P.saida({number:'120363@g.us',externalKey:'iag-aviso-0',body:'🔔 aviso'}).chamadas[0];
 assert.equal(g.rota,'/group');assert.equal(g.corpo.number,'120363@g.us');
 const m=P.saida({number:'5521988943529',body:'foto',mediaUrl:'https://x/y.jpg'},{ticketId:1}).chamadas[0];
 assert.equal(m.rota,'/url');assert.equal(m.corpo.mediaUrl,'https://x/y.jpg');
 assert.equal(P.saida({body:'x'}).erro,'sem_numero');
});

// ── o fluxo do n8n montado a partir do mesmo código ─────────────────────────────────────────────
import {montarFluxoPonte} from '../n8n/ponte-novaleadvox.mjs';
const AF=Object.getPrototypeOf(async function(){}).constructor;
const rodar=(fluxo,nome,{input,nos={},mem={},helpers={}})=>{
 const n=fluxo.nodes.find(x=>x.name===nome);
 const wrap=(j)=>({isExecuted:j!==undefined,first:()=>({json:j}),all:()=>[].concat(j).map(x=>({json:x}))});
 return new AF('$input','$','$getWorkflowStaticData',n.parameters.jsCode).call({helpers},wrap(input),(nm)=>wrap(nos[nm]),()=>mem);
};

test('fluxo da ponte: nomes únicos, ligações para nós que existem, três portas e código que compila', () => {
 const f=montarFluxoPonte();const nomes=f.nodes.map(n=>n.name);
 assert.equal(new Set(nomes).size,nomes.length);
 for(const [de,v] of Object.entries(f.connections)){assert.ok(nomes.includes(de),'origem '+de);for(const saida of v.main)for(const l of saida)assert.ok(nomes.includes(l.node),'destino '+l.node);}
 const ganchos=f.nodes.filter(n=>n.type.endsWith('.webhook'));
 assert.deepEqual(ganchos.slice(0,3).map(n=>n.parameters.path),['nl-entrada','nl-midia/:arquivo','nl-saida/v1/api/external/:apiId']);
 // rotas do CRM: todas sob o id da saída, respondendo pelo nó de resposta e sem repetir método+caminho
 const crm=ganchos.slice(3);assert.equal(crm.length,11);
 assert.ok(crm.every(n=>n.webhookId==='a6f0c0de-0b1e-4d6b-9a55-5d1d0e0a0003'&&n.parameters.responseMode==='responseNode'));
 assert.equal(new Set(ganchos.map(n=>n.parameters.httpMethod+' '+n.parameters.path)).size,ganchos.length);
 for(const n of f.nodes.filter(x=>x.type.endsWith('.code')))assert.doesNotThrow(()=>new AF('$input','$','$getWorkflowStaticData',n.parameters.jsCode),n.name);
 assert.equal(f.active,false);
});

test('fluxo: a entrada monta a chamada ao Motor com a conta e o token do endereço, e guarda o ticket', async () => {
 const f=montarFluxoPonte();
 const w={query:{k:'loja-teste-1a2b3c4d',t:'tok123'},body:aviso({text:'Quero um SUV'},{queueId:13,id:613})};
 const [r]=await rodar(f,'Traduzir Entrada',{input:w});
 assert.equal(r.json.motorUrl,'https://n8n.leadvox.com.br/webhook/hml-iag-motor-v9?k=loja-teste-1a2b3c4d&t=tok123');
 const corpo=JSON.parse(r.json.motorJson);
 assert.equal(corpo.chatInput,'Quero um SUV');assert.equal(corpo.sessionId,'5521988943529');assert.equal(corpo.Departamento,13);assert.equal(corpo.k,'loja-teste-1a2b3c4d');
 assert.equal(r.json.ticketChave,'nl_ticket_5521988943529');assert.equal(r.json.temMidia,false);
 // sem conta/token no endereço, ou aviso duplicado: nada acontece
 assert.deepEqual(await rodar(f,'Traduzir Entrada',{input:{query:{},body:aviso({})}}),[]);
 assert.deepEqual(await rodar(f,'Traduzir Entrada',{input:{query:w.query,body:{method:'message',msg:{},ticket:{}}}}),[]);
 // só aceita os dois endereços do Motor
 const [p]=await rodar(f,'Traduzir Entrada',{input:{...w,query:{...w.query,m:'iag-motor-v9'}}});
 assert.match(p.json.motorUrl,/webhook\/iag-motor-v9\?/);
 const [x]=await rodar(f,'Traduzir Entrada',{input:{...w,query:{...w.query,m:'../outro'}}});
 assert.match(x.json.motorUrl,/hml-iag-motor-v9\?/);
});

test('fluxo: áudio guarda o arquivo no Redis e entrega ao Motor o link com a extensão', async () => {
 const f=montarFluxoPonte();
 const [r]=await rodar(f,'Traduzir Entrada',{input:{query:{k:'loja-teste-1a2b3c4d',t:'tok123'},body:aviso({type:'audioMessage',text:'Áudio',media:OGG})}});
 assert.equal(r.json.temMidia,true);assert.match(r.json.midiaChave,/^nl_midia_[a-z0-9]{8,}$/);assert.equal(r.json.midiaB64,OGG);
 assert.match(JSON.parse(r.json.motorJson).chatInput,/^https:\/\/n8n\.leadvox\.com\.br\/webhook\/a6f0c0de-0b1e-4d6b-9a55-5d1d0e0a0002\/nl-midia\/[a-z0-9]+\.ogg$/);
 const id=r.json.midiaChave.replace('nl_midia_','');
 const [m]=await rodar(f,'Preparar Mídia',{input:{params:{arquivo:id+'.ogg'}}});
 assert.deepEqual([m.json.chave,m.json.mime],[r.json.midiaChave,'audio/ogg']);
 assert.equal((await rodar(f,'Preparar Mídia',{input:{params:{arquivo:'../../etc'}}}))[0].json.chave,'');
});

test('fluxo: a saída vira chamadas com o token do endereço; sem credencial ou sem ticket devolve o erro certo', async () => {
 const f=montarFluxoPonte();
 const web={query:{token:'Bearer abcdefghijkl'},params:{apiId:'23'},body:{number:'5521988943529',body:'Passando para o vendedor',externalKey:'iag-sdr-0',queueId:'13',forceTicketToDepartment:true,userId:5,forceTicketToUser:true}};
 const it=await rodar(f,'Traduzir Saída',{input:{ticketId:'613'},nos:{'Saída · Nova LeadVox':web}});
 assert.equal(it.length,2);
 assert.equal(it[0].json.url,'https://apicrm.leadvox.com.br/v2/api/external/23');
 assert.equal(it[1].json.url,'https://apicrm.leadvox.com.br/v2/api/external/23/updateticketinfo');
 assert.equal(it[0].json.token,'abcdefghijkl');assert.equal(it[1].json.transfere,true);
 const semTk=await rodar(f,'Traduzir Saída',{input:{ticketId:null},nos:{'Saída · Nova LeadVox':web}});
 assert.equal(semTk.length,1);assert.equal(semTk[0].json.erroFinal,'sem_ticket');
 const semCred=await rodar(f,'Traduzir Saída',{input:{ticketId:'613'},nos:{'Saída · Nova LeadVox':{...web,query:{}}}});
 assert.deepEqual([semCred[0].json.semChamada,semCred[0].json.status],[true,401]);
 const nota=await rodar(f,'Traduzir Saída',{input:{ticketId:'613'},nos:{'Saída · Nova LeadVox':{...web,body:{number:'5521988943529',onlyNote:true,note:{body:'resumo'}}}}});
 assert.equal(nota[0].json.url,'https://apicrm.leadvox.com.br/v2/api/external/23/createNotes');
});

test('fluxo: o resumo responde 200 só se todas as chamadas deram certo; senão devolve o status da que falhou', async () => {
 const f=montarFluxoPonte();const nos={'Traduzir Saída':{erroFinal:''}};
 const ok=await rodar(f,'Resumo da Saída',{input:[{statusCode:200},{statusCode:201}],nos});
 assert.deepEqual([ok[0].json.status,ok[0].json.resposta.success],[200,true]);
 const mal=await rodar(f,'Resumo da Saída',{input:[{statusCode:200},{statusCode:404,body:{error:'ERR_TICKET'}}],nos});
 assert.equal(mal[0].json.status,404);assert.equal(mal[0].json.resposta.success,false);
 const erroNet=await rodar(f,'Resumo da Saída',{input:[{error:'timeout'}],nos});
 assert.equal(erroNet[0].json.status,502);
 const sem=await rodar(f,'Resumo da Saída',{input:[{statusCode:200}],nos:{'Traduzir Saída':{erroFinal:'sem_ticket'}}});
 assert.equal(sem[0].json.status,409);
});

test('saída: foto sem legenda vai com espaço invisível (a nova LeadVox recusa body vazio)', () => {
 const m=P.saida({number:'5521988943529',body:'',mediaUrl:'https://x/2.jpg'},{ticketId:1}).chamadas[0];
 assert.equal(m.rota,'/url');assert.equal(m.corpo.body,'\u200b');assert.equal(m.corpo.mediaUrl,'https://x/2.jpg');
 assert.equal(m.corpo.externalKey,undefined);
 const t=P.saida({number:'5521988943529',body:'Oi',externalKey:'iag-sdr-0'},{ticketId:1}).chamadas[0];
 assert.equal(t.corpo.body,'Oi');assert.equal(t.corpo.externalKey,undefined);
});

// ── funil e etiquetas: rotas do CRM antigo respondidas com a API v2 (26/11/2026) ─────────────────
const TOK='tok-loja-teste-123456';
const falsaApi=(estado)=>{const log=[];const chamar=async(metodo,rota,corpo,apiId)=>{log.push([metodo,rota,corpo,apiId]);
 if(rota==='/stage/list')return{status:200,body:{stages:[{id:19,name:'Qualificando pela IA',pipelineId:4},{id:20,name:'24hrs',pipelineId:4}]}};
 if(rota.startsWith('/listOpportunities'))return{status:200,body:{opportunities:estado.opps}};
 if(rota==='/createOpportunity'){estado.opps.push({id:99,contactId:1808,stageId:corpo.stageId,status:'open'});return{status:200,body:{id:99}};}
 if(rota==='/updateOpportunity')return{status:200,body:{ok:true}};
 if(rota==='/showcontact')return{status:200,body:{contact:{id:1808,name:'Leonardo',number:'5521988943529',tags:estado.tagsContato}}};
 if(rota==='/listTags')return{status:200,body:{tags:estado.tags}};
 if(rota==='/listUsers')return{status:200,body:{users:[{id:5,name:'Amanda',profile:'user'},{id:4,name:'Gerente',profile:'admin'}]}};
 return{status:200,body:{}};};return{chamar,log};};
const base='/v1/api/external/03db0c27';

test('crm: rotas do CRM antigo que o Motor chama viram rotas conhecidas (e o resto não)', () => {
 assert.deepEqual(P.rotaCrm('GET',base+'/opportunities'),{r:'opps',apiId:'03db0c27'});
 assert.deepEqual(P.rotaCrm('PUT',base+'/opportunities/12'),{r:'oppMudar',apiId:'03db0c27',id:12});
 assert.deepEqual(P.rotaCrm('PUT','/opportunity/12/status'),{r:'oppStatus',id:12});
 assert.deepEqual(P.rotaCrm('GET','/v1/contacts/number/5521988943529'),{r:'contato',numero:'5521988943529'});
 assert.deepEqual(P.rotaCrm('PATCH','/v1/contacts/1808'),{r:'contatoTags',id:1808});
 assert.deepEqual(P.rotaCrm('GET','/v1/api/external/users/03db0c27'),{r:'usuarios',apiId:'03db0c27'});
 assert.equal(P.rotaCrm('DELETE',base+'/opportunities/1').r,'');
});

test('crm: lista só a oportunidade aberta do contato, no formato antigo (etapa = stageId)', async () => {
 const {chamar}=falsaApi({opps:[{id:7,contactId:1808,stageId:19,pipelineId:4,responsibleId:5,status:'open',name:'Leo'},{id:8,contactId:1808,stageId:20,status:'win'},{id:9,contactId:77,stageId:19,status:'open'}]});
 const r=await P.crm({metodo:'GET',caminho:base+'/opportunities',query:{contactId:'1808',status:'open'},token:'Bearer '+TOK},chamar,{});
 assert.equal(r.status,200);assert.deepEqual(r.body.data.map(o=>[o.id,o.pipelineStepId,o.responsibleId,o.status]),[[7,19,5,'open']]);
});

test('crm: cria a oportunidade pelo número guardado na entrada, com o funil da etapa', async () => {
 const est={opps:[]};const {chamar,log}=falsaApi(est);const mem={contatos:{1808:{tel:'5521988943529',nome:'Leonardo'}}};
 const r=await P.crm({metodo:'POST',caminho:base+'/opportunities',corpo:{name:'Leonardo — WhatsApp',contactId:1808,pipelineStepId:19,responsibleId:'5',value:0,expectedCloseDate:'2026-12-03'},token:TOK},chamar,mem);
 assert.equal(r.status,200);
 const c=log.find(x=>x[1]==='/createOpportunity');
 assert.deepEqual([c[2].number,c[2].stageId,c[2].pipelineId,c[2].responsibleId,c[2].status,c[3]],['5521988943529',19,4,5,'open','03db0c27']);
 // contato que a ponte não viu: recusa em vez de criar card errado
 assert.equal((await P.crm({metodo:'POST',caminho:base+'/opportunities',corpo:{contactId:55,pipelineStepId:19},token:TOK},chamar,{})).status,409);
});

test('crm: move de etapa, troca o responsável e fecha como ganho', async () => {
 const {chamar,log}=falsaApi({opps:[]});
 await P.crm({metodo:'PUT',caminho:base+'/opportunities/7',corpo:{name:'Leo',pipelineStepId:20,responsibleId:6,value:0,description:'x'},token:TOK},chamar,{});
 const u=log.filter(x=>x[1]==='/updateOpportunity').pop()[2];
 assert.deepEqual([u.opportunityId,u.stageId,u.pipelineId,u.responsibleId],[7,20,4,6]);
 // rota sem apiId: acha a conta pelo token que já passou
 const mem={};await P.crm({metodo:'GET',caminho:base+'/tags',token:TOK},chamar,mem);
 const g=await P.crm({metodo:'PUT',caminho:'/opportunity/7/status',corpo:{id:7,status:'won',pipelineStepId:20},token:TOK},chamar,mem);
 assert.equal(g.status,200);assert.equal(log.filter(x=>x[1]==='/updateOpportunity').pop()[2].status,'win');
 assert.equal((await P.crm({metodo:'PUT',caminho:'/opportunity/7/status',corpo:{status:'won'},token:'outro-token-123456'},chamar,{})).status,409);
});

test('crm: contato com etiquetas e o PATCH só coloca e tira a diferença', async () => {
 const est={tags:[{id:93,tag:'📅 Visita agendada'},{id:74,tag:'💳 Financiamento'},{id:68,tag:'💵 À vista'}],tagsContato:[{id:74,tag:'💳 Financiamento'}]};
 const {chamar,log}=falsaApi(est);const mem={};
 const c=await P.crm({metodo:'GET',caminho:'/v1/contacts/number/5521988943529',token:TOK},chamar,mem);
 assert.equal(c.status,409);   // ainda sem conta conhecida para esse token
 await P.crm({metodo:'GET',caminho:base+'/tags',token:TOK},chamar,mem);
 const c2=await P.crm({metodo:'GET',caminho:'/v1/contacts/number/5521988943529',token:TOK},chamar,mem);
 assert.deepEqual([c2.body.id,c2.body.tags.map(t=>t.tag)],[1808,['💳 Financiamento']]);
 const r=await P.crm({metodo:'PATCH',caminho:'/v1/contacts/1808',corpo:{tags:['💵 À vista','📅 Visita agendada'],customFields:{}},token:TOK},chamar,mem);
 assert.equal(r.status,200);
 assert.deepEqual(log.filter(x=>x[1]==='/addTagContact').map(x=>x[2].tagId),[68,93]);
 assert.deepEqual(log.find(x=>x[1]==='/removeTagContact')[2],{number:'5521988943529',tagIds:[74],validateNumber:false});
 const u=await P.crm({metodo:'GET',caminho:'/v1/api/external/users/03db0c27',token:TOK},chamar,mem);
 assert.deepEqual(u.body.users.map(x=>x.id),[5,4]);
});

test('fluxo: o tradutor do CRM descobre a rota pelo nó que disparou e responde no formato antigo', async () => {
 const f=montarFluxoPonte();const {chamar}=falsaApi({opps:[{id:7,contactId:1808,stageId:19,status:'open'}]});
 const helpers={httpRequest:async(o)=>{const m=o.url.match(/external\/([^/]+)(\/.*)$/);const r=await chamar(o.method,m[2],o.body,m[1]);return{statusCode:r.status,body:r.body};}};
 const nos={'CRM · Oportunidades':{params:{apiId:'03db0c27'},query:{token:TOK,contactId:'1808',status:'open'},headers:{authorization:'Bearer '+TOK}}};
 const [r]=await rodar(f,'CRM · Traduzir',{input:{},nos,mem:{},helpers});
 assert.equal(r.json.status,200);assert.equal(r.json.body.data[0].pipelineStepId,19);
 // a entrada guarda o número do contato para o funil
 const mem={};await rodar(f,'Traduzir Entrada',{input:{query:{k:'loja-teste-1a2b3c4d',t:'tok123'},body:aviso({text:'Oi'})},mem});
 assert.deepEqual(mem.contatos['1808'],{tel:'5521988943529',nome:'Leonardo Vasconcellos'});
});
