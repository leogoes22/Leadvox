import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const mod={exports:{}};vm.runInNewContext(ler('../n8n/autocerto-lead.js'),{module:mod});
const {aplicarAutocertoLead,TROCAS_AC,AC_PREPARAR,AC_REGISTRAR,MARCA}=mod.exports;
const J=x=>JSON.parse(JSON.stringify(x));

// fluxo mínimo: cada nó tem os trechos que a troca procura (cópia do que está no ar em 17/11/2026)
const regra=k=>({conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'av'+k,leftValue:'={{ $json.tipo }}',rightValue:k,operator:{type:'string',operation:'equals'}}],combinator:'and'},renameOutput:true,outputKey:k});
const fluxo=()=>({nodes:[
 ...Object.entries(TROCAS_AC).map(([name,t])=>({name,type:'n8n-nodes-base.code',parameters:{jsCode:'// início\n'+t.map(([de])=>de).join('\n// meio\n')+'\n// fim'}})),
 {name:'Tipo de Aviso',type:'n8n-nodes-base.switch',position:[100,200],parameters:{rules:{values:[regra('set'),regra('del'),regra('envio')]},options:{}}},
 {name:'Redis Get Rota',credentials:{redis:{id:'r1',name:'Redis'}},parameters:{}},
 {name:'Supabase Rota',credentials:{supabaseApi:{id:'s1',name:'Supabase'}},parameters:{}},
 {name:'Outro',parameters:{jsCode:'x'}}],
 connections:{'Tipo de Aviso':{main:[[{node:'Redis Gravar Aviso',type:'main',index:0}],[{node:'Redis Apagar Aviso',type:'main',index:0}],[{node:'Enviar Aviso Gerente',type:'main',index:0}]]}}});

test('n8n: aplica uma vez, liga os nós AC ao Tipo de Aviso e não aplica duas vezes', () => {
 const orig=fluxo(),w=J(aplicarAutocertoLead(orig));
 assert.equal(JSON.stringify(orig).includes(MARCA),false,'não muda o original');
 const tipo=w.nodes.find(n=>n.name==='Tipo de Aviso');
 assert.deepEqual(tipo.parameters.rules.values.map(v=>v.outputKey),['set','del','envio','autocerto']);
 assert.equal(tipo.parameters.rules.values[3].conditions.conditions[0].rightValue,'autocerto');
 assert.equal(w.connections['Tipo de Aviso'].main[3][0].node,'AC Já Enviado');
 assert.deepEqual(w.connections['AC Pode Enviar?'].main.map(s=>s[0].node),['AC Login','AC Registrar']);
 assert.equal(w.connections['AC Registrar'].main[0][0].node,'Tipo de Aviso','o resultado volta para nota, trava e alerta');
 const no=n=>w.nodes.find(x=>x.name===n);
 assert.deepEqual(no('AC Já Enviado').credentials,{redis:{id:'r1',name:'Redis'}});assert.deepEqual(no('AC Credenciais').credentials,{supabaseApi:{id:'s1',name:'Supabase'}});
 assert.match(no('AC Credenciais').parameters.url,/rpc\/lv_motor_autocerto$/);
 assert.equal(no('AC Login').parameters.url,'https://integracao.autocerto.com/oauth/token');assert.equal(no('AC Login').parameters.contentType,'form-urlencoded');
 assert.equal(no('AC Salvar Lead').parameters.url,'https://integracao.autocerto.com/api/Lead/SalvarLead');
 for(const n of w.nodes.filter(n=>/^AC /.test(n.name)&&n.type.endsWith('httpRequest')))assert.equal(n.parameters.options.response.response.neverError,true,n.name+' nunca derruba o fluxo');
 for(const n of [AC_PREPARAR,AC_REGISTRAR])new vm.Script('(async()=>{'+n+'\n})'); // os nós novos são código válido (as trocas são conferidas no fluxo real antes de publicar)
 assert.equal(no('Outro').parameters.jsCode,'x');
 assert.throws(()=>aplicarAutocertoLead(w),/já aplicado/);
 const mudou=fluxo();mudou.nodes.find(n=>n.name==='Fila de Envio').parameters.jsCode='outra coisa';assert.throws(()=>aplicarAutocertoLead(mudou),/trecho mudou/);
});

test('n8n: no simulador só entram as trocas de conversa (sem nós AC e sem Avisos)', () => {
 const f=fluxo();f.nodes=f.nodes.filter(n=>n.name!=='Avisos Preparar');
 const lr=f.nodes.find(n=>n.name==='Ler Resposta');lr.parameters.jsCode=lr.parameters.jsCode.replace('estado.interesse = { id: __it.id, nome: __it.nome,','');
 const w=J(aplicarAutocertoLead(f,{simulador:true}));
 assert.equal(w.nodes.some(n=>/^AC /.test(n.name)),false);assert.equal(w.nodes.find(n=>n.name==='Tipo de Aviso').parameters.rules.values.length,3);
 assert.match(w.nodes.find(n=>n.name==='Fila de Envio').parameters.jsCode,/const __iaCont = __iaContV \|\| __ac;/);
});

// trecho 2c do Avisos Preparar rodando sozinho, com o que existe em volta dele no nó
const trecho2c=()=>{const para=TROCAS_AC['Avisos Preparar'][1][1];return para.slice(0,para.lastIndexOf('// ── 2b.'));};
const rodarAvisos=({transf={autocerto:true,setor:'Comercial'},cfgAc={ativo:true,codigoMidia:12,interesse:2},est={},dados={},nota='',gerente='5521999990000'}={})=>{
 const ctx={out:[],transferiu:true,humano:true,f:{conta:'loja-1',chaveMem:'loja-1:5521988887777',nota,transf},A:{urlEnvio:'https://api.exemplo/send?token=x'},
  av:{autocerto:cfgAc,gerente:{whatsapp:gerente}},est,__lr:{transf:{dados}},__zapCli:'5521988887777',telOk:v=>/^55\d{10,11}$/.test(String(v||''))};
 vm.runInNewContext(trecho2c(),ctx);return J(ctx.out).map(i=>i.json);};

test('motor: na passagem com AutoCerto ligado, monta o lead com veículo do estoque, CPF e resumo', () => {
 const [it]=rodarAvisos({est:{nome:'Ana Souza',interesse:{id:9,nome:'Honda Civic 2020',codigo:'ac:123456',preco:99000}},dados:{Nome:'Ana',CPF:'123.456.789-09','Forma de pagamento':'financiamento'},
  nota:'🤖 *Carol* passou o atendimento para *Comercial*\nMotivo: quer financiar\nResumo: quer o _Civic_\n_A IA continua..._\n⚙️ interno'});
 assert.equal(it.tipo,'autocerto');assert.equal(it.flag,'iag_ac_loja-1:5521988887777');assert.equal(it.gerente,'5521999990000');
 assert.deepEqual(it.lead,{CodigoMidia:12,Interesse:2,CodigoVeiculo:123456,Nome:'Ana Souza',Email:'',Telefone:'5521988887777',Telefone2:'',
  Mensagem:'🤖 Carol passou o atendimento para Comercial\nMotivo: quer financiar\nResumo: quer o Civic',DescricaoVeiculo:'Honda Civic 2020',Placa:'',Cpf:'12345678909',Cep:''});
});

test('motor: veículo que não é do AutoCerto vai só pela descrição; sem nome usa o coletado; sem passagem AutoCerto não faz nada', () => {
 let [it]=rodarAvisos({est:{interesse:{nome:'Moto cadastrada',codigo:''}},dados:{'Nome completo':'Bruno',CPF:'123'}});
 assert.equal(it.lead.CodigoVeiculo,0);assert.equal(it.lead.DescricaoVeiculo,'Moto cadastrada');assert.equal(it.lead.Nome,'Bruno');assert.equal(it.lead.Cpf,'','CPF incompleto não vai');
 [it]=rodarAvisos({dados:{'Veículo de interesse':'Corolla 2022',Nome:'não informado'}});assert.equal(it.lead.DescricaoVeiculo,'Corolla 2022');assert.equal(it.lead.Nome,'Cliente WhatsApp');
 assert.equal(rodarAvisos({transf:{autocerto:false}}).length,0,'passagem que não é do AutoCerto');
 assert.equal(rodarAvisos({cfgAc:{ativo:false}}).length,0,'desligado no painel');
 assert.equal(rodarAvisos({gerente:'123'})[0].gerente,'');
});

// AC Preparar e AC Registrar com $() e $input de mentira
const rodarCodigo=(codigo,nos,input)=>{const $=n=>{if(!(n in nos))throw new Error('nó não executado: '+n);const v=nos[n];return {first:()=>({json:Array.isArray(v)?v[0]:v}),all:()=>(Array.isArray(v)?v:[v]).map(json=>({json}))};};
 return J(vm.runInNewContext('(()=>{'+codigo+'\n})()',{$,$input:{first:()=>({json:input})}}));};
const itemAc={tipo:'autocerto',conta:'loja-1',tel:'5521988887777',flag:'iag_ac_x',urlEnvio:'https://api.exemplo/send?token=x',gerente:'5521999990000',nome:'Ana',lead:{Nome:'Ana',CodigoVeiculo:123,DescricaoVeiculo:'Civic'}};

test('AC Preparar: junta usuário, senha e unidade; pula cliente já enviado; avisa quando falta o AutoCerto', () => {
 const nos={'Avisos Preparar':[{tipo:'set'},itemAc],'AC Já Enviado':{}};
 let r=rodarCodigo(AC_PREPARAR,nos,{statusCode:200,body:[{unidade:'77',usuario:'loja@ac',secret:'s3nha'}]});
 assert.equal(r[0].json.ok,true);assert.equal(r[0].json.usuario,'loja@ac');assert.equal(r[0].json.senha,'s3nha');
 assert.deepEqual(JSON.parse(r[0].json.corpo),{...itemAc.lead,CodigoUnidade:77});
 r=rodarCodigo(AC_PREPARAR,nos,{statusCode:200,body:[]});assert.equal(r[0].json.ok,false);assert.match(r[0].json.erro,/Credenciais de API → Estoque/);assert.equal(r[0].json.senha,'');
 r=rodarCodigo(AC_PREPARAR,nos,{statusCode:500,body:{}});assert.match(r[0].json.erro,/HTTP 500/);
 assert.deepEqual(rodarCodigo(AC_PREPARAR,{...nos,'AC Já Enviado':{jaEnviado:'1'}},{statusCode:200,body:[{unidade:'77',usuario:'u',secret:'s'}]}),[],'gravado nos últimos 7 dias');
 assert.deepEqual(rodarCodigo(AC_PREPARAR,{...nos,'Avisos Preparar':[{tipo:'set'}]},{}),[]);
});

test('AC Registrar: deu certo → nota e trava de 7 dias; falhou → nota e alerta ao gerente, sem trava', () => {
 const prep={ok:true,erro:'',corpo:JSON.stringify({...itemAc.lead,CodigoUnidade:77}),it:itemAc};
 let r=rodarCodigo(AC_REGISTRAR,{'AC Preparar':prep,'AC Login':{statusCode:200,body:{access_token:'t'}},'AC Salvar Lead':{statusCode:200,body:{}}},{});
 assert.deepEqual(r.map(i=>i.json.tipo),['envio','set']);
 const nota=JSON.parse(r[0].json.corpo);assert.equal(nota.onlyNote,true);assert.equal(nota.number,'5521988887777');assert.match(nota.note.body,/Lead gravado no AutoCerto.*unidade 77.*Civic \(cód\. 123\)/);
 assert.deepEqual(r[1].json,{tipo:'set',key:'iag_ac_x',valor:'1',ttl:604800});
 r=rodarCodigo(AC_REGISTRAR,{'AC Preparar':prep,'AC Login':{statusCode:400,body:{error:'invalid_grant'}},'AC Salvar Lead':{statusCode:401,body:{}}},{});
 assert.deepEqual(r.map(i=>i.json.tipo),['envio','envio']);assert.match(JSON.parse(r[0].json.corpo).note.body,/não aceitou o usuário e a senha/);
 const al=JSON.parse(r[1].json.corpo);assert.equal(al.number,'5521999990000');assert.match(al.body,/Lead não entrou no AutoCerto/);
 r=rodarCodigo(AC_REGISTRAR,{'AC Preparar':{...prep,ok:false,erro:'a loja não tem o AutoCerto'}},{});
 assert.match(JSON.parse(r[0].json.corpo).note.body,/a loja não tem o AutoCerto/,'sem credencial: os nós de login nem rodaram');
 r=rodarCodigo(AC_REGISTRAR,{'AC Preparar':prep,'AC Login':{statusCode:200,body:{access_token:'t'}},'AC Salvar Lead':{statusCode:422,body:{Message:'Telefone inválido'}}},{});
 assert.match(JSON.parse(r[0].json.corpo).note.body,/recusou o lead \(HTTP 422: .*Telefone inválido/);
});

test('banco: lv_motor_autocerto só para o n8n (service_role) e anotado no controle', () => {
 const sql=ler('../database/autocerto_lead.sql');
 assert.match(sql,/function public\.lv_motor_autocerto\(p_conta text\)/);assert.match(sql,/settings->>'source'='autocerto'/);
 assert.match(sql,/revoke all on function public\.lv_motor_autocerto\(text\) from public,anon,authenticated;/);
 assert.match(sql,/grant execute on function public\.lv_motor_autocerto\(text\) to service_role;/);
 assert.match(sql,/sql_aplicado\(arquivo\) values\('autocerto_lead\.sql'\)/);
});

test('painel: chave "Enviar o lead para o AutoCerto" com o setor, salva em avisos.autocerto', () => {
 const html=ler('../public/index.html'),js=ler('../public/painel.js');
 assert.match(html,/id="cpAc"/);assert.match(html,/id="cpAcSetor"/);assert.match(html,/id="cpAcBox" hidden/);
 assert.match(js,/autocerto: \{ ativo: false, setor: '', codigoMidia: 12, interesse: 2 \}/);
 assert.match(js,/autocerto: \{ codigoMidia: 12, interesse: 2, \.\.\.\(\(c\.avisos \|\| \{\}\)\.autocerto \|\| \{\}\), ativo: ligado\('cpAc'\), setor: \$\('cpAcSetor'\)\.value \}/);
 assert.match(js,/conecte o AutoCerto em Credenciais de API → Estoque/);
 assert.match(js,/\$\('cpAcBox'\)\.hidden = !ligado\('cpAc'\)/);
});
