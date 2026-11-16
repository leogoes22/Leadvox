import test from 'node:test';
import assert from 'node:assert/strict';
import {DIAS,decidir,montarEnvio,prepararAcoes,montarAcoes,LER_FECHAMENTO,MONTAR_FICHA,SEPARAR_FICHAS,DECIDIR_ENVIO,MONTAR_ENVIO,DEPOIS_ENVIO,PEDIR_IA,PREPARAR_ACOES,MONTAR_ACOES,SEPARAR_ACOES,SENTINELA_TROCA,fluxoFollowupFechamento} from '../n8n/followup-fechamento.mjs';
import {normalizeTemplates} from '../integrations/chat-leadvox.mjs';

const DIA = 86400000;
// segunda-feira, 16/11/2026, 12:00 em São Paulo (15:00 UTC)
const meioDia = Date.UTC(2026, 10, 16, 15, 0);
const URL_ENVIO = 'https://chatapi.leadvox.com.br/v1/api/external/abc-123/?token=tok%2Bx';
const ficha = (extra = {}) => ({ conta: 'loja-ab12cd34', tel: '552181081044', nome: 'Leo', fechadoEm: meioDia - 10 * DIA, enviados: 0, oficial: false,
  contactId: '17256', vendedorId: '7', queueId: '2', ticketId: '9902',
  motivoId: '533', motivoNome: 'Orçamento Enviado', objetivo: 'perguntar se ficou dúvida', dias: DIAS, templates: [], janelaIni: '09:00', janelaFim: '20:00',
  funil: { fechar: null, tentativas: [null, null, null, null], respondeu: null, fim: null }, avisos: {}, volta: 'ia', etiqueta: '', diasUteis: false, resumo: '',
  urlEnvio: URL_ENVIO, ...extra });

// roda o Code do n8n com um $ falso
const rodar = (codigo, nos, $json) => new Function('$', '$input', '$json', codigo)(nome => ({ first: () => ({ json: nos[nome] }), item: { json: nos[nome] }, all: () => [{ json: nos[nome] }] }),
  { first: () => ({ json: nos.$input }), all: () => [].concat(nos.$input).map(json => ({ json })) }, $json);

test('dias contam a partir do fechamento: 5, 7, 15 e 30', () => {
  assert.deepEqual(DIAS, [5, 7, 15, 30]);
  assert.equal(decidir(ficha({ fechadoEm: meioDia - 4 * DIA }), [], meioDia).acao, 'esperar');
  const d = decidir(ficha({ fechadoEm: meioDia - 5 * DIA }), [], meioDia);
  assert.equal(d.acao, 'enviar'); assert.equal(d.tentativa, 0); assert.equal(d.tipo, 'ia');
  assert.equal(decidir(ficha({ enviados: 1, fechadoEm: meioDia - 6 * DIA }), [], meioDia).acao, 'esperar');
  assert.equal(decidir(ficha({ enviados: 1, fechadoEm: meioDia - 7 * DIA }), [], meioDia).tentativa, 1);
  assert.equal(decidir(ficha({ enviados: 3, fechadoEm: meioDia - 30 * DIA }), [], meioDia).tentativa, 3);
});

test('fim sem resposta: 3 dias depois da última tentativa', () => {
  assert.equal(decidir(ficha({ enviados: 4, fechadoEm: meioDia - 32 * DIA }), [], meioDia).acao, 'esperar');
  assert.equal(decidir(ficha({ enviados: 4, fechadoEm: meioDia - 33 * DIA }), [], meioDia).acao, 'fim');
});

test('sem rajada: atrasado manda só a tentativa mais recente', () => {
  assert.equal(decidir(ficha({ fechadoEm: meioDia - 16 * DIA }), [], meioDia).tentativa, 2);
});

test('cliente respondeu ou equipe reabriu depois do fechamento', () => {
  const f = ficha();
  const r = decidir(f, [{ p: 'cliente', t: 'ainda tenho interesse', ts: f.fechadoEm + 2 * DIA }], meioDia);
  assert.equal(r.acao, 'respondeu'); assert.equal(r.clienteDisse, 'ainda tenho interesse');
  assert.equal(decidir(f, [{ p: 'equipe', ts: f.fechadoEm + DIA }], meioDia).acao, 'reaberta');
  // mensagem da IA, do sistema ou de antes do fechamento não conta
  assert.equal(decidir(f, [{ p: 'ia', ts: f.fechadoEm + DIA }, { p: 'sistema', ts: f.fechadoEm + 1000 }, { p: 'cliente', ts: f.fechadoEm - DIA }], meioDia).acao, 'enviar');
});

test('horário do follow-up e só dias úteis', () => {
  const f = ficha();
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 11, 0)).motivo, 'fora do horário'); // 08:00
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 23, 30)).motivo, 'fora do horário'); // 20:30
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 12, 5)).acao, 'enviar'); // 09:05
  const sabado = Date.UTC(2026, 10, 21, 15, 0);
  assert.equal(decidir(ficha({ fechadoEm: sabado - 10 * DIA }), [], sabado).acao, 'enviar');
  assert.equal(decidir(ficha({ fechadoEm: sabado - 10 * DIA, diasUteis: true }), [], sabado).motivo, 'fim de semana');
});

test('WhatsApp oficial: template da tentativa ou só nota; o resumo fica na ficha', () => {
  const tpl = { id: '77', nome: 'retomada_1', vars: 1 };
  const d = decidir(ficha({ oficial: true, templates: [tpl], fechadoEm: meioDia - 5 * DIA }), [], meioDia);
  assert.equal(d.tipo, 'template'); assert.deepEqual(d.template, tpl);
  assert.equal(decidir(ficha({ oficial: true, templates: [tpl] }), [], meioDia).tipo, 'nota'); // 2ª tentativa sem template
  const e = montarEnvio({ ...d, chave: 'iag_ff_x', ficha: ficha({ oficial: true }) }, '', 'Queria um Corolla e parou no preço.', 1);
  assert.deepEqual(JSON.parse(e.corpoJson), { number: '552181081044', externalKey: 'iag-ff-1-1', templateId: '77', params: ['{{contato.nome}}'] });
  assert.equal(e.enviado, 'template "retomada_1"'); assert.equal(e.ficha.resumo, 'Queria um Corolla e parou no preço.'); assert.equal(e.ficha.enviados, 1);
  const n = montarEnvio({ acao: 'enviar', tentativa: 0, tipo: 'nota', chave: 'iag_ff_x', ficha: ficha({ oficial: true }) }, '', '', 1);
  assert.equal(n.corpoJson, ''); assert.match(n.nota, /sem template/);
});

test('QR code: a IA escreve; sem texto vira só nota; o resumo já gravado não muda', () => {
  const j = { acao: 'enviar', tentativa: 1, tipo: 'ia', chave: 'iag_ff_x', ficha: ficha({ enviados: 1, resumo: 'antigo' }) };
  const e = montarEnvio(j, '"Oi, Leo! Ficou alguma dúvida do orçamento?"', 'novo', 36);
  assert.equal(JSON.parse(e.corpoJson).body, 'Oi, Leo! Ficou alguma dúvida do orçamento?');
  assert.equal(e.ficha.enviados, 2); assert.equal(e.ficha.resumo, 'antigo'); assert.match(e.nota, /2\/4 \(7 dias\)/);
  assert.equal(montarEnvio(j, '   ', '', 1).tipo, 'nota');
});

test('ações: lê o endereço de envio sem expor nada e decide o que ler', () => {
  const p = prepararAcoes({ momento: 'tentativa', tentativa: 1, ficha: ficha({ funil: { tentativas: [null, { id: '145', nome: 'Follow 7 dias' }] }, etiqueta: 'Follow-up' }) });
  assert.equal(p.ok, true); assert.equal(p.token, 'tok+x'); assert.equal(p.raiz, 'https://chatapi.leadvox.com.br');
  assert.equal(p.base, 'https://chatapi.leadvox.com.br/v1/api/external/abc-123'); assert.equal(p.lerOpp, true); assert.equal(p.lerContato, false);
  assert.match(p.urlOpp, /contactId=17256&status=open$/);
  const sem = prepararAcoes({ momento: 'tentativa', tentativa: 0, ficha: ficha() });
  assert.equal(sem.lerOpp, false); assert.match(sem.urlOpp, /contactId=0/);
  assert.equal(prepararAcoes({ momento: 'fechar', ficha: ficha({ urlEnvio: 'https://x.com' }) }).ok, false);
});

test('ações: move a oportunidade aberta do contato, ou marca perdida', () => {
  const opps = { data: [{ id: 1, contactId: 17256, status: 'won', pipelineStepId: 10 }, { id: 2, contactId: 17256, status: 'open', pipelineStepId: 143, updatedAt: '2026-11-10' }, { id: 3, contactId: 999, status: 'open' }] };
  const f = ficha({ funil: { tentativas: [{ id: '145', nome: 'Follow 5 dias' }], fim: { perdida: true, nome: 'Perdida' } } });
  const j = { momento: 'tentativa', tentativa: 0, enviado: 'Oi', ficha: f };
  const a = montarAcoes(j, prepararAcoes(j), opps, null, meioDia);
  const mv = a.reqs.find(r => r.tipo === 'funil');
  assert.equal(mv.url, 'https://chatapi.leadvox.com.br/opportunity/2/status?token=tok%2Bx');
  assert.deepEqual(mv.body, { id: 2, pipelineStepId: 145, status: 'open' }); assert.equal(mv.headers.Authorization, 'Bearer tok+x');
  const jf = { momento: 'fim', ficha: f };
  assert.deepEqual(montarAcoes(jf, prepararAcoes(jf), opps, null, meioDia).reqs.find(r => r.tipo === 'funil').body, { id: 2, pipelineStepId: 143, status: 'lost' });
  const vazio = montarAcoes(j, prepararAcoes(j), { data: [] }, null, meioDia);
  assert.equal(vazio.reqs.some(r => r.tipo === 'funil'), false);
});

test('ações: etiqueta entra ao fechar e sai no fim, sem perder as outras nem os campos', () => {
  const contato = { id: 55, tags: [{ tag: { tag: 'Quente' } }, 'Follow-up'], customFields: { cpf: '1' } };
  const jf = { momento: 'fechar', ficha: ficha({ etiqueta: 'Follow-up' }) };
  assert.equal(montarAcoes(jf, prepararAcoes(jf), null, contato, meioDia).reqs.length, 0); // já tinha
  const jn = { momento: 'fechar', ficha: ficha({ etiqueta: 'Recuperar' }) };
  const pn = montarAcoes(jn, prepararAcoes(jn), null, contato, meioDia).reqs[0];
  assert.equal(pn.method, 'PATCH'); assert.equal(pn.url, 'https://chatapi.leadvox.com.br/v1/contacts/55');
  assert.deepEqual(pn.body, { tags: ['Quente', 'Follow-up', 'Recuperar'], customFields: { cpf: '1' } });
  const jt = { momento: 'fim', ficha: ficha({ etiqueta: 'follow-up' }) };
  assert.deepEqual(montarAcoes(jt, prepararAcoes(jt), null, contato, meioDia).reqs.find(r => r.tipo === 'etiqueta').body.tags, ['Quente']);
});

test('ações: cliente voltou → nota, aviso ao gerente e ao grupo, conversa com o vendedor e contador', () => {
  const f = ficha({ volta: 'vendedor', resumo: 'Queria um Corolla.', avisos: { gerente: '5521999990000', grupo: '120363000000000000', respondeu: true },
    funil: { respondeu: { id: '144', nome: 'Em negociação' } } });
  const j = { momento: 'respondeu', clienteDisse: 'Ainda tenho interesse', ficha: f };
  const a = montarAcoes(j, prepararAcoes(j), { data: [{ id: 2, contactId: 17256, status: 'open', pipelineStepId: 143 }] }, null, meioDia);
  const nota = a.reqs.find(r => r.tipo === 'nota').body;
  assert.equal(nota.forceTicketToUser, true); assert.equal(nota.userId, 7); assert.equal(nota.queueId, '2'); assert.match(nota.note.body, /Ainda tenho interesse/);
  const avisos = a.reqs.filter(r => r.tipo === 'aviso').map(r => r.body);
  assert.deepEqual(avisos.map(x => x.number), ['5521999990000', '120363000000000000@g.us']);
  assert.match(avisos[0].body, /Cliente voltou/); assert.match(avisos[0].body, /Resumo: Queria um Corolla/); assert.match(avisos[0].body, /movida para Em negociação/);
  assert.equal(a.relChave, 'rel_iag_loja-ab12cd34_2026-11-16_fechamentoVoltaram');
  assert.equal(a.trava, '');
  // silêncio da IA: liga ao fechar e solta no fim
  assert.equal(montarAcoes({ momento: 'fechar', ficha: f }, prepararAcoes({ momento: 'fechar', ficha: f }), null, null, meioDia).trava, 'ligar');
  assert.equal(montarAcoes({ momento: 'fim', ficha: f }, prepararAcoes({ momento: 'fim', ficha: f }), null, null, meioDia).trava, 'desligar');
  // sem aviso marcado para a tentativa: só o contador
  const t = { momento: 'tentativa', tentativa: 0, enviado: 'Oi', ficha: f };
  const at = montarAcoes(t, prepararAcoes(t), null, null, meioDia);
  assert.equal(at.reqs.length, 0); assert.match(at.relChave, /_fechamentoEnviados$/);
});

test('Ler Fechamento: lê o FinishedTicket repassado pelo Sentinela', () => {
  const body = { event: 'FinishedTicket', ticket: { id: 9902, contactId: 17256, userId: 7, queueId: 2, closingReasonId: 533, closedAt: '2026-11-16T15:00:00.000Z', channel: 'waba', contact: { name: 'Leo', number: '5521981081044' } } };
  const [r] = rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34', t: 'x' }, body }, 'Confere Endereço': { body: true } });
  assert.equal(r.json.ok, true); assert.equal(r.json.tel, '552181081044'); assert.equal(r.json.motivoId, '533');
  assert.equal(r.json.contactId, '17256'); assert.equal(r.json.vendedorId, '7'); assert.equal(r.json.queueId, '2');
  assert.equal(r.json.chave, 'iag_ff_loja-ab12cd34:552181081044'); assert.equal(r.json.fechadoEm, Date.UTC(2026, 10, 16, 15)); assert.equal(r.json.canal, 'waba');
  assert.equal(rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34' }, body }, 'Confere Endereço': { body: false } })[0].json.ok, false);
  assert.equal(rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34' }, body: { ...body, event: 'NewMessage' } }, 'Confere Endereço': { x: true } })[0].json.motivo, 'não é atendimento finalizado');
});

test('Montar Ficha: só motivo marcado, agente ligado, modo de teste, e leva funil/avisos/volta/etiqueta', () => {
  const f = { conta: 'loja-ab12cd34', tel: '552181081044', chave: 'iag_ff_loja-ab12cd34:552181081044', motivoId: '533', fechadoEm: 1, canal: 'waba', nome: 'Leo', ticketId: '1', contactId: '5', vendedorId: '7', queueId: '2' };
  const rota = (cfg, extra = {}) => ({ statusCode: 200, body: { ok: true, responde: true, agente: { nome: 'Lilian' }, conta: { nome: 'LeadVox' },
    conexao: { urlEnvio: URL_ENVIO }, config: cfg, ...extra } });
  const cfg = { fechamento: { ativo: true, motivos: [{ id: '533', nome: 'Orçamento', objetivo: 'tirar dúvida' }], templates: [{ id: '9', nome: 't', vars: 1 }],
      funil: { fechar: { id: '150', nome: 'Follow' }, tentativas: [{ id: '151', nome: 'F5' }], fim: { perdida: true } },
      avisos: { gerente: true, grupo: true, respondeu: true }, volta: 'vendedor', etiqueta: { id: '3', nome: 'Follow-up' }, diasUteis: true },
    followup: { janelaIni: '08:00' }, avisos: { gerente: { whatsapp: '5521999990000' }, grupo: { id: '120363000000000000@g.us' } } };
  const [g] = rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota(cfg) });
  assert.equal(g.json.acao, 'gravar'); assert.equal(g.json.momento, 'fechar');
  const v = JSON.parse(g.json.valor);
  assert.equal(v.oficial, true); assert.equal(v.agente, 'Lilian'); assert.equal(v.janelaIni, '08:00'); assert.deepEqual(v.dias, DIAS);
  assert.deepEqual(v.funil.fechar, { id: '150', nome: 'Follow', perdida: false }); assert.equal(v.funil.tentativas[1], null); assert.equal(v.funil.fim.perdida, true);
  assert.equal(v.avisos.gerente, '5521999990000'); assert.equal(v.avisos.grupo, '120363000000000000'); assert.equal(v.volta, 'vendedor'); assert.equal(v.etiqueta, 'Follow-up'); assert.equal(v.diasUteis, true);
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': { ...f, motivoId: '999' }, $input: rota(cfg) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, fechamento: { ...cfg.fechamento, ativo: false } }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota(cfg, { responde: false }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, modoTeste: { ativo: true, numeros: ['21988943529'] } }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, modoTeste: { ativo: true, numeros: ['21981081044'] } }) })[0].json.acao, 'gravar');
  // gerente marcado mas sem WhatsApp cadastrado: sem aviso
  assert.equal(JSON.parse(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, avisos: {} }) })[0].json.valor).avisos.gerente, '');
});

test('os Codes do n8n rodam como no fluxo', () => {
  const sep = rodar(SEPARAR_FICHAS, { $input: { 'iag_ff_a:1': JSON.stringify(ficha()), outra: 'x' } });
  assert.equal(sep.length, 1); assert.equal(sep[0].json.chaveHist, 'iag_hist_loja-ab12cd34:552181081044');
  const f = ficha({ fechadoEm: Date.now() - 5 * DIA - 60000, janelaIni: '00:00', janelaFim: '23:59' });
  // o Redis "get" do n8n devolve só o histórico: a ficha vem do "Separar Fichas"
  const dec = rodar(DECIDIR_ENVIO, { 'Separar Fichas': { chave: 'iag_ff_a:1', ficha: f } }, { histRaw: JSON.stringify([{ p: 'cliente', t: 'quero ver o orçamento', ts: f.fechadoEm - DIA }]) });
  assert.equal(dec.json.acao, 'enviar'); assert.equal(dec.json.momento, 'tentativa'); assert.match(dec.json.ultimas, /Cliente: quero ver/);
  const ped = rodar(PEDIR_IA, {}, dec.json);
  assert.match(ped.json.corpoIA.messages[0].content, /perguntar se ficou dúvida/); assert.equal(ped.json.corpoIA.response_format.type, 'json_object');
  const me = rodar(MONTAR_ENVIO, { 'Pedir à IA': ped.json }, { statusCode: 200, body: { choices: [{ message: { content: '{"mensagem":"Oi, Leo!","resumo":"Pediu orçamento."}' } }] } });
  assert.equal(JSON.parse(me.json.corpoJson).body, 'Oi, Leo!'); assert.equal(me.json.ficha.resumo, 'Pediu orçamento.');
  const dep = rodar(DEPOIS_ENVIO, { 'Tem mensagem?': me.json }, { statusCode: 400, body: { error: 'x' } });
  assert.match(JSON.parse(dep.json.notaJson).note.body, /recusou o envio \(HTTP 400\)/); assert.equal(dep.json.enviado, '');
  const pa = rodar(PREPARAR_ACOES, {}, { ...dep.json });
  assert.equal(pa.json.p.ok, true);
  const ma = rodar(MONTAR_ACOES, { 'Preparar Ações': pa.json, 'Ler Oportunidade': { statusCode: 200, body: [] }, 'Ler Contato': { statusCode: 404 } });
  assert.deepEqual(ma.json.reqs, []);
  const sa = rodar(SEPARAR_ACOES, { $input: [{ reqs: [{ tipo: 'aviso', method: 'POST', url: 'u', headers: { Authorization: 'Bearer t' }, body: { a: 1 } }] }] });
  assert.deepEqual(sa[0].json, { tipo: 'aviso', method: 'POST', url: 'u', auth: 'Bearer t', corpo: '{"a":1}' });
});

test('fluxo: liga só nós que existem e usa as credenciais informadas', () => {
  const w = fluxoFollowupFechamento({ supabase: { id: 's', name: 'S' }, redis: { id: 'r', name: 'R' }, openai: { id: 'o', name: 'O' }, supabaseUrl: 'https://abc.supabase.co' });
  const nomes = new Set(w.nodes.map(n => n.name));
  assert.equal(nomes.size, w.nodes.length);
  for (const [de, c] of Object.entries(w.connections)) { assert.ok(nomes.has(de), de); for (const s of c.main) for (const x of s) assert.ok(nomes.has(x.node), x.node); }
  assert.equal(w.nodes.find(n => n.name === 'Webhook').parameters.path, 'iag-fechamento');
  assert.ok(w.nodes.filter(n => n.type.endsWith('.redis')).every(n => n.credentials.redis.id === 'r'));
  assert.throws(() => fluxoFollowupFechamento({}), /credenciais/);
  assert.match(SENTINELA_TROCA[1], /FinishedTicket/);
});

test('templates da LeadVox: só o necessário chega ao navegador', () => {
  const l = normalizeTemplates([{ id: 7, hsmId: 'h', name: 'retomada', preview: 'Oi {{1}}!', status: 'approved', language: 'pt_BR', tenantId: 2, components: {} }, { id: 8, name: 'velho', deletedAt: '2026-01-01' }]);
  assert.deepEqual(l, [{ id: '7', name: 'retomada', preview: 'Oi {{1}}!', status: 'APPROVED', language: 'pt_BR' }]);
});
