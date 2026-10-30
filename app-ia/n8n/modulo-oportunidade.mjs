// Gera app-ia/n8n/modulo-oportunidade.json (node modulo-oportunidade.mjs modulo-oportunidade.json). Gera o fluxo "MÓDULO · Oportunidade da proposta (plugin)" para o n8n novo e exporta os códigos para teste.
import { writeFileSync } from 'node:fs';

const SUPA = 'https://dcucemuewipfnneqpgxk.supabase.co';
const CRED_SUPA = { supabaseApi: { id: 'kSv5bMKquqHLDxI9', name: 'Supabase Agentes LeadVox' } };

export const entradaCode = `// Confere o pedido do plugin (n8n antigo hoje, n8n novo depois da migração) antes de tocar no funil.
const b = ($input.first().json || {}).body || {};
const t = (x, m) => String(x == null ? '' : x).replace(/[\\r\\n]+/g, ' ').trim().slice(0, m);
const erro = (status, msg) => [{ json: { ok: false, status, resposta: { ok: false, erro: msg } } }];
const conta = t(b.k, 40), token = t(b.t, 30), contactId = t(b.contactId, 12).replace(/\\D/g, '');
if (!/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(conta) || !/^[0-9a-f]{24}$/.test(token)) return erro(401, 'Chave do plugin inválida.');
if (!contactId) return erro(400, 'Sem o contato do atendimento.');
const tipo = ['proposta', 'orcamento', 'convite'].includes(b.tipo) ? b.tipo : '';
if (!tipo) return erro(400, 'Tipo de proposta inválido.');
const numero = t(b.numero, 20).replace(/[^0-9A-Za-z-]/g, '');
const pdfUrl = t(b.pdfUrl, 300);
if (!numero || !pdfUrl.startsWith('${SUPA}/storage/v1/object/public/lv-propostas/' + '')) return erro(400, 'Proposta sem número ou PDF.');
const total = Math.max(0, Math.min(Number(b.total) || 0, 1e9));
const dias = [3, 7, 15, 30].includes(Number(b.validadeDias)) ? Number(b.validadeDias) : 7;
return [{ json: { ok: true, conta, token, contactId, tipo, numero, pdfUrl, total: Math.round(total * 100) / 100, validadeDias: dias,
  cliente: t(b.cliente, 80) || 'Cliente', vendedor: t(b.vendedor, 60), resumo: String(b.resumo == null ? '' : b.resumo).slice(0, 1500), titulo: t(b.titulo, 120) } }];`;

export const prepararCode = `// Chave conferida no banco + endereço da LeadVox da conta (a API de funil usa o mesmo token do envio).
const e = $('Entrada').first().json;
const conf = $('Confere a chave').first().json;
const ok = conf === true || conf.data === true || conf[''] === true || Object.values(conf || {}).includes(true);
if (!ok) return [{ json: { ok: false, status: 401, resposta: { ok: false, erro: 'Chave do plugin não confere.' } } }];
const url = String(((($('Rota da conta').first().json || {}).conexao) || {}).urlEnvio || '');
const m = url.match(/^(https:\\/\\/[^?#]+)\\/api\\/external\\/([^/?#]+)\\/?\\?(?:.*&)?token=([^&#]+)/);
if (!m) return [{ json: { ok: false, status: 409, resposta: { ok: false, erro: 'A conta não tem a LeadVox conectada.' } } }];
return [{ json: { ok: true, base: m[1] + '/api/external/' + m[2], urlUsuarios: m[1] + '/api/external/users/' + m[2], token: decodeURIComponent(m[3]) } }];`;

export const decidirCode = `// Cria ou atualiza a oportunidade do contato. Cliente com oportunidade aberta não ganha outra (funil sem duplicado).
// Etapa: a chamada "Proposta"/"Orçamento" do funil, se existir; oportunidade que já passou dela não volta.
const e = $('Entrada').first().json;
const lista = (r) => { const x = r && (r.body !== undefined ? r.body : r); return Array.isArray(x) ? x : (x && (Array.isArray(x.data) ? x.data : Array.isArray(x.users) ? x.users : Array.isArray(x.opportunities) ? x.opportunities : [])) || []; };
const resp = (n) => { try { return $(n).first().json || {}; } catch (er) { return {}; } };
const etapas = lista(resp('Etapas do funil'));
const users = lista(resp('Usuários'));
const abertas = lista(resp('Oportunidades abertas')).filter(o => String(o.contactId) === e.contactId && (!o.status || o.status === 'open'));
if (!etapas.length) return [{ json: { acao: 'pular', motivo: 'o funil da conta não tem etapas (ou a LeadVox recusou)' } }];
const ordem = (s) => Number(s.order != null ? s.order : s.position) || 999;
const norm = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
const existente = abertas.sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
const atual = existente ? etapas.find(s => Number(s.id) === Number(existente.pipelineStepId)) : null;
const funil = atual ? atual.pipelineId : (etapas.slice().sort((a, b) => ordem(a) - ordem(b))[0] || {}).pipelineId;
const doFunil = etapas.filter(s => funil == null || s.pipelineId == null || String(s.pipelineId) === String(funil)).sort((a, b) => ordem(a) - ordem(b));
const etapaProposta = doFunil.find(s => /propost|orcament|convite/.test(norm(s.name)));
let etapa = atual || doFunil[0];
if (etapaProposta && (!atual || ordem(etapaProposta) > ordem(atual))) etapa = etapaProposta;
const admin = users.find(u => /admin/i.test(String(u.profile || ''))) || users[0];
if (!admin) return [{ json: { acao: 'pular', motivo: 'nenhum usuário na conta' } }];
const v = norm(e.vendedor);
const vend = v ? (users.find(u => norm(u.name) === v) || users.find(u => norm(u.name).startsWith(v) || v.startsWith(norm(u.name)))) : null;
const responsavel = (vend && vend.id) || (existente && existente.responsibleId) || admin.id;
const hoje = new Date(), fim = new Date(hoje.getTime() + e.validadeDias * 864e5);
const dd = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const brl = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nomeTipo = { proposta: 'Proposta comercial', orcamento: 'Proposta de orçamento', convite: 'Convite' }[e.tipo];
const bloco = '📄 ' + nomeTipo + ' nº ' + e.numero + ' enviada pelo plugin em ' + dd(hoje) + (e.vendedor ? ' por ' + e.vendedor : '') +
  (e.titulo ? '\\n' + e.titulo : '') + (e.total ? '\\nTotal: ' + brl(e.total) : '') + '\\nVálida até ' + dd(fim) + '\\nPDF: ' + e.pdfUrl + (e.resumo ? '\\n' + e.resumo : '');
const descricao = existente && existente.description ? String(existente.description).slice(0, 4000) + '\\n\\n' + bloco : bloco;
const corpo = {
  name: (existente && existente.name) || ((e.tipo === 'convite' ? 'Convite ' : 'Proposta ') + e.numero + ' — ' + e.cliente).slice(0, 120),
  description: descricao.slice(0, 6000),
  value: e.total || (existente && Number(existente.value)) || 0,
  expectedCloseDate: fim.toISOString().slice(0, 10),
  pipelineStepId: Number(etapa.id),
  contactId: Number(e.contactId),
  userId: String(admin.id)
};
// a API aceita responsibleId como texto ao criar, mas só número ao atualizar (testado no SDR Motor, out/2026);
// ao atualizar ela também exige o contactId (sem ele: ERR_OPPORTUNITY_INVALID_CONTACT, testado em 28/10/2026)
corpo.responsibleId = existente ? Number(responsavel) : String(responsavel);
return [{ json: { acao: existente ? 'atualizar' : 'criar', id: existente ? existente.id : null, etapa: etapa.name, corpo } }];`;

export const resultadoCode = `// Resposta para o plugin: a frase que o vendedor vê depois de enviar.
const d = $('Decidir').first().json;
if (d.acao === 'pular') return [{ json: { status: 200, resposta: { ok: false, funil: 'Não lancei no funil: ' + d.motivo + '.' } } }];
const r = $input.first().json || {}, s = Number(r.statusCode) || 0, b = r.body || {};
const id = (b.data && b.data.id) || b.id || d.id;
if (s < 200 || s >= 300) return [{ json: { status: 502, resposta: { ok: false, funil: 'Não consegui lançar no funil (LeadVox ' + s + ').', detalhe: JSON.stringify(b).slice(0, 300) } } }];
return [{ json: { status: 200, resposta: { ok: true, id, acao: d.acao, etapa: d.etapa,
  funil: (d.acao === 'criar' ? 'Oportunidade criada no funil' : 'Oportunidade do cliente atualizada no funil') + (d.etapa ? ' (etapa ' + d.etapa + ')' : '') + '.' } } }];`;

const http = (name, pos, p, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: { ...p, options: { timeout: 15000, response: { response: { fullResponse: !!extra.full, neverError: true } } } },
  onError: 'continueRegularOutput', alwaysOutputData: true, ...(extra.cred ? { credentials: extra.cred } : {}) });
const lv = (name, pos, url, method = 'GET', body) => http(name, pos, { method, url,
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: "=Bearer {{ $('Preparar').first().json.token }}" }] },
  ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}) }, { full: true });
const code = (name, pos, jsCode) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode } });
const se = (name, pos, expr) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos, parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: name, leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' },
  looseTypeValidation: true, options: {} } });

const nodes = [
  { name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300], webhookId: 'iag-oportunidade',
    parameters: { httpMethod: 'POST', path: 'iag-oportunidade', responseMode: 'responseNode', options: {} } },
  code('Entrada', [200, 300], entradaCode),
  se('Entrada OK?', [400, 300], '={{ $json.ok === true }}'),
  http('Confere a chave', [600, 200], { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_plugin_confere', authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_conta: $('Entrada').first().json.conta, p_token: $('Entrada').first().json.token }) }}" }, { cred: CRED_SUPA }),
  http('Rota da conta', [800, 200], { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_motor_rota', authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_conta: $('Entrada').first().json.conta, p_departamento: null }) }}" }, { cred: CRED_SUPA }),
  code('Preparar', [1000, 200], prepararCode),
  se('Conta OK?', [1200, 200], '={{ $json.ok === true }}'),
  lv('Oportunidades abertas', [1400, 100], "={{ $('Preparar').first().json.base }}/opportunities?status=open&contactId={{ $('Entrada').first().json.contactId }}"),
  lv('Etapas do funil', [1600, 100], "={{ $('Preparar').first().json.base }}/pipeline-steps"),
  lv('Usuários', [1800, 100], "={{ $('Preparar').first().json.urlUsuarios }}"),
  code('Decidir', [2000, 100], decidirCode),
  { name: 'Criar ou atualizar?', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [2200, 100], parameters: {
    rules: { values: ['criar', 'atualizar'].map(a => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: a, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' },
      renameOutput: true, outputKey: a })) }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'pular' } } },
  lv('Criar oportunidade', [2400, 0], "={{ $('Preparar').first().json.base }}/opportunities", 'POST', "={{ JSON.stringify($json.corpo) }}"),
  lv('Atualizar oportunidade', [2400, 150], "={{ $('Preparar').first().json.base }}/opportunities/{{ $json.id }}", 'PUT', "={{ JSON.stringify($json.corpo) }}"),
  code('Resultado', [2600, 100], resultadoCode),
  { name: 'Responder', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [2800, 300], parameters: {
    respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: { responseCode: '={{ $json.status || 200 }}' } } }
];
const L = (a, b, i = 0) => ({ node: b, type: 'main', index: i });
const connections = {
  Webhook: { main: [[L(0, 'Entrada')]] },
  Entrada: { main: [[L(0, 'Entrada OK?')]] },
  'Entrada OK?': { main: [[L(0, 'Confere a chave')], [L(0, 'Responder')]] },
  'Confere a chave': { main: [[L(0, 'Rota da conta')]] },
  'Rota da conta': { main: [[L(0, 'Preparar')]] },
  Preparar: { main: [[L(0, 'Conta OK?')]] },
  'Conta OK?': { main: [[L(0, 'Oportunidades abertas')], [L(0, 'Responder')]] },
  'Oportunidades abertas': { main: [[L(0, 'Etapas do funil')]] },
  'Etapas do funil': { main: [[L(0, 'Usuários')]] },
  'Usuários': { main: [[L(0, 'Decidir')]] },
  Decidir: { main: [[L(0, 'Criar ou atualizar?')]] },
  'Criar ou atualizar?': { main: [[L(0, 'Criar oportunidade')], [L(0, 'Atualizar oportunidade')], [L(0, 'Resultado')]] },
  'Criar oportunidade': { main: [[L(0, 'Resultado')]] },
  'Atualizar oportunidade': { main: [[L(0, 'Resultado')]] },
  Resultado: { main: [[L(0, 'Responder')]] }
};
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify({ name: 'MÓDULO · Oportunidade da proposta (plugin)', nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveDataSuccessExecution: 'all' } }));
  console.log('ok', nodes.length, 'nós');
}
