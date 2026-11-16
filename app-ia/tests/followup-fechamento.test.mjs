import test from 'node:test';
import assert from 'node:assert/strict';
import {DIAS,decidir,montarEnvio,LER_FECHAMENTO,MONTAR_FICHA,SEPARAR_FICHAS,DECIDIR_ENVIO,MONTAR_IA,MONTAR_OFICIAL,DEPOIS_ENVIO,PEDIR_IA,SENTINELA_TROCA,fluxoFollowupFechamento} from '../n8n/followup-fechamento.mjs';
import {normalizeTemplates} from '../integrations/chat-leadvox.mjs';

const DIA = 86400000;
// 12:00 em São Paulo (15:00 UTC) de um dia qualquer
const meioDia = Date.UTC(2026, 10, 16, 15, 0);
const ficha = (extra = {}) => ({ conta: 'loja-ab12cd34', tel: '552181081044', nome: 'Leo', fechadoEm: meioDia - 10 * DIA, enviados: 0, oficial: false,
  motivoId: '533', motivoNome: 'Orçamento Enviado', objetivo: 'perguntar se ficou dúvida', dias: DIAS, templates: [], janelaIni: '09:00', janelaFim: '20:00',
  urlEnvio: 'https://chatapi.leadvox.com.br/v1/api/external/abc/?token=x', ...extra });

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
  const ult = decidir(ficha({ enviados: 3, fechadoEm: meioDia - 30 * DIA }), [], meioDia);
  assert.equal(ult.tentativa, 3); assert.equal(ult.ultima, true);
  assert.equal(decidir(ficha({ enviados: 4 }), [], meioDia).acao, 'apagar');
});

test('sem rajada: atrasado manda só a tentativa mais recente', () => {
  const d = decidir(ficha({ fechadoEm: meioDia - 16 * DIA }), [], meioDia);
  assert.equal(d.tentativa, 2);
});

test('para quando o cliente ou a equipe falou depois do fechamento', () => {
  const f = ficha();
  assert.equal(decidir(f, [{ p: 'cliente', ts: f.fechadoEm + 2 * DIA }], meioDia).acao, 'apagar');
  assert.equal(decidir(f, [{ p: 'equipe', ts: f.fechadoEm + DIA }], meioDia).acao, 'apagar');
  // mensagem da IA, do sistema ou de antes do fechamento não para
  assert.equal(decidir(f, [{ p: 'ia', ts: f.fechadoEm + DIA }, { p: 'sistema', ts: f.fechadoEm + 1000 }, { p: 'cliente', ts: f.fechadoEm - DIA }], meioDia).acao, 'enviar');
});

test('só no horário do follow-up (São Paulo)', () => {
  const f = ficha();
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 11, 0)).motivo, 'fora do horário'); // 08:00
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 23, 30)).motivo, 'fora do horário'); // 20:30
  assert.equal(decidir(f, [], Date.UTC(2026, 10, 16, 12, 5)).acao, 'enviar'); // 09:05
});

test('WhatsApp oficial: template da tentativa ou só nota', () => {
  const tpl = { id: '77', nome: 'retomada_1', vars: 1 };
  const d = decidir(ficha({ oficial: true, templates: [tpl], fechadoEm: meioDia - 5 * DIA }), [], meioDia);
  assert.equal(d.tipo, 'template'); assert.deepEqual(d.template, tpl);
  assert.equal(decidir(ficha({ oficial: true, templates: [tpl] }), [], meioDia).tipo, 'nota'); // 2ª tentativa sem template
  assert.equal(decidir(ficha({ oficial: true, templates: [] }), [], meioDia).tipo, 'nota');
  const e = montarEnvio({ ...d, chave: 'iag_ff_x', ficha: ficha({ oficial: true }) }, '', 1);
  assert.deepEqual(JSON.parse(e.corpoJson), { number: '552181081044', externalKey: 'iag-ff-1-1', templateId: '77', params: ['{{contato.nome}}'] });
  assert.match(e.nota, /template "retomada_1"/);
  const n = montarEnvio({ acao: 'enviar', tentativa: 0, tipo: 'nota', chave: 'iag_ff_x', ficha: ficha({ oficial: true }) }, '', 1);
  assert.equal(n.corpoJson, ''); assert.match(n.nota, /sem template/);
});

test('QR code: a IA escreve; sem texto vira só nota; a ficha avança', () => {
  const j = { acao: 'enviar', tentativa: 1, tipo: 'ia', chave: 'iag_ff_x', ficha: ficha({ enviados: 1 }) };
  const e = montarEnvio(j, '"Oi, Leo! Ficou alguma dúvida do orçamento?"', 36);
  const c = JSON.parse(e.corpoJson);
  assert.equal(c.body, 'Oi, Leo! Ficou alguma dúvida do orçamento?'); assert.match(c.externalKey, /^iag-ff-2-/);
  assert.equal(JSON.parse(e.valor).enviados, 2); assert.match(e.nota, /2\/4 \(7 dias\)/);
  assert.equal(montarEnvio(j, '   ', 1).tipo, 'nota');
});

test('Ler Fechamento: lê o FinishedTicket repassado pelo Sentinela', () => {
  const body = { event: 'FinishedTicket', ticket: { id: 9902, closingReasonId: 533, closedAt: '2026-11-16T15:00:00.000Z', channel: 'waba', contact: { name: 'Leo', number: '5521981081044' } } };
  const [r] = rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34', t: 'x' }, body }, 'Confere Endereço': { body: true, iag_eventos_confere: true } });
  assert.equal(r.json.ok, true); assert.equal(r.json.tel, '552181081044'); assert.equal(r.json.motivoId, '533');
  assert.equal(r.json.chave, 'iag_ff_loja-ab12cd34:552181081044'); assert.equal(r.json.fechadoEm, Date.UTC(2026, 10, 16, 15)); assert.equal(r.json.canal, 'waba');
  const [x] = rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34' }, body }, 'Confere Endereço': { body: false } });
  assert.equal(x.json.ok, false);
  const [y] = rodar(LER_FECHAMENTO, { Webhook: { query: { k: 'loja-ab12cd34' }, body: { ...body, event: 'NewMessage' } }, 'Confere Endereço': { x: true } });
  assert.equal(y.json.motivo, 'não é atendimento finalizado');
});

test('Montar Ficha: só motivo marcado, agente ligado e modo de teste respeitado', () => {
  const f = { conta: 'loja-ab12cd34', tel: '552181081044', chave: 'iag_ff_loja-ab12cd34:552181081044', motivoId: '533', fechadoEm: 1, canal: 'waba', nome: 'Leo', ticketId: '1' };
  const rota = (cfg, extra = {}) => ({ statusCode: 200, body: { ok: true, responde: true, agente: { nome: 'Lilian' }, conta: { nome: 'LeadVox' },
    conexao: { urlEnvio: 'https://chatapi.leadvox.com.br/v1/api/external/abc/?token=x' }, config: cfg, ...extra } });
  const cfg = { fechamento: { ativo: true, motivos: [{ id: '533', nome: 'Orçamento', objetivo: 'tirar dúvida' }], templates: [{ id: '9', nome: 't', vars: 1 }] }, followup: { janelaIni: '08:00' } };
  const [g] = rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota(cfg) });
  assert.equal(g.json.acao, 'gravar');
  const v = JSON.parse(g.json.valor);
  assert.equal(v.oficial, true); assert.equal(v.agente, 'Lilian'); assert.equal(v.janelaIni, '08:00'); assert.equal(v.enviados, 0); assert.deepEqual(v.dias, DIAS);
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': { ...f, motivoId: '999' }, $input: rota(cfg) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, fechamento: { ...cfg.fechamento, ativo: false } }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota(cfg, { responde: false }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, modoTeste: { ativo: true, numeros: ['21988943529'] } }) })[0].json.acao, 'apagar');
  assert.equal(rodar(MONTAR_FICHA, { 'Ler Fechamento': f, $input: rota({ ...cfg, modoTeste: { ativo: true, numeros: ['21981081044'] } }) })[0].json.acao, 'gravar');
});

test('os Codes do envio rodam como no n8n', () => {
  const sep = rodar(SEPARAR_FICHAS, { $input: { 'iag_ff_a:1': JSON.stringify(ficha()), outra: 'x' } });
  assert.equal(sep.length, 1); assert.equal(sep[0].json.chaveHist, 'iag_hist_loja-ab12cd34:552181081044');
  const dec = rodar(DECIDIR_ENVIO, {}, { chave: 'iag_ff_a:1', ficha: ficha({ fechadoEm: Date.now() - 5 * DIA - 60000, janelaIni: '00:00', janelaFim: '23:59' }), histRaw: JSON.stringify([{ p: 'cliente', t: 'quero ver o orçamento', ts: 1 }]) });
  assert.equal(dec.json.acao, 'enviar'); assert.match(dec.json.ultimas, /Cliente: quero ver/);
  const ped = rodar(PEDIR_IA, {}, dec.json);
  assert.match(ped.json.corpoIA.messages[0].content, /perguntar se ficou dúvida/);
  const ia = rodar(MONTAR_IA, { 'Pedir à IA': ped.json }, { statusCode: 200, body: { choices: [{ message: { content: 'Oi, Leo!' } }] } });
  assert.equal(JSON.parse(ia.json.corpoJson).body, 'Oi, Leo!');
  const of = rodar(MONTAR_OFICIAL, {}, { ...dec.json, tipo: 'nota' });
  assert.equal(of.json.corpoJson, '');
  const dep = rodar(DEPOIS_ENVIO, { 'Tem mensagem?': ia.json }, { statusCode: 400, body: { error: 'x' } });
  assert.match(JSON.parse(dep.json.notaJson).note.body, /recusou o envio \(HTTP 400\)/);
  assert.equal(JSON.parse(dep.json.notaJson).externalKey, 'iag-nota-ff');
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
