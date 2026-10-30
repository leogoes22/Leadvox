// Migração do motor do painel: n8n antigo (apin8n.lv-mktdeconversa.com) → n8n novo (n8n.leadvox.com.br).
// Este arquivo é o código do nó "Converter" do fluxo "SETUP · Migrar motor do painel" no n8n novo, que lê os fluxos
// do antigo pela API (chave só de leitura) e cria os convertidos no novo, DESLIGADOS. O segredo nunca sai do n8n.
// O que muda em cada fluxo:
//  • credenciais do antigo → as do novo (Redis da VPS, Supabase do motor, OpenAI da LeadVox);
//  • chamadas entre fluxos → https://n8n.leadvox.com.br/webhook/;
//  • sem SEGREDO: o endereço (k, t) e a chave do plugin são conferidos no banco (iag_eventos_confere,
//    iag_plugin_confere), e conta nova ganha chaves aleatórias (lv_motor_tokens_novos, em motor_novo.sql).
const SUPA = 'https://dcucemuewipfnneqpgxk.supabase.co';
const BASE_ANTIGA = 'https://webhook.lv-mktdeconversa.com/webhook/', BASE_NOVA = 'https://n8n.leadvox.com.br/webhook/';
const CRED = {
  redis: { id: 'U4DKWxV6p86WQJEq', name: 'Redis LeadVox (VPS)' },
  supabaseApi: { id: 'kSv5bMKquqHLDxI9', name: 'Supabase Agentes LeadVox' },
  openAiApi: { id: 'rkzVVFfaDcuB2JsN', name: 'OpenAI LeadVox' }
};
const SUPA_CRED = { supabaseApi: CRED.supabaseApi };

function trocar(texto, de, para, onde) {
  if (!texto.includes(de)) throw new Error('não achei o trecho para trocar em ' + onde + ': ' + de.slice(0, 60));
  return texto.split(de).join(para);
}
function no(w, nome) {
  const n = w.nodes.find((x) => x.name === nome);
  if (!n) throw new Error('fluxo ' + w.name + ' sem o nó ' + nome);
  return n;
}
// tira a linha "const SEGREDO = '...'" (a que tem o valor) e põe outra no lugar
function semSegredo(codigo, novaLinha, onde) {
  const re = /^const SEGREDO\s*=\s*'[^'\n]*';[^\n]*$/m;
  if (!re.test(codigo)) throw new Error('não achei a linha do SEGREDO em ' + onde);
  return codigo.replace(re, novaLinha);
}
// nó HTTP que pergunta ao banco se a chave confere (devolve true/false)
function confere(nome, pos, funcao, contaExpr, tokenExpr) {
  return { id: 'cf-' + nome.toLowerCase().replace(/[^a-z]/g, ''), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    parameters: { method: 'POST', url: SUPA + '/rest/v1/rpc/' + funcao, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ p_conta: String(' + contaExpr + ' || \'\'), p_token: String(' + tokenExpr + ' || \'\') }) }}',
      options: { timeout: 10000, response: { response: { neverError: true } } } },
    credentials: SUPA_CRED, onError: 'continueRegularOutput', alwaysOutputData: true };
}
const LER_CONFERE = (nome) => `const _confere = (() => { try { const j = $('${nome}').first().json; return j === true || (!!j && typeof j === 'object' && (j.data === true || Object.values(j).includes(true))); } catch (e) { return false; } })();`;
// põe o nó novo entre "antes" e o que vinha depois dele
function inserirDepois(w, antes, novo) {
  const saida = (w.connections[antes] && w.connections[antes].main) || [[]];
  w.connections[novo.name] = { main: saida };
  w.connections[antes] = { main: [[{ node: novo.name, type: 'main', index: 0 }]] };
  w.nodes.push(novo);
}

const PATCH = {
  // Sentinela: a LeadVox chama ?k=conta&t=chave dos eventos
  I7bT8hPrqjfwBlYO(w) {
    const wh = no(w, 'Webhook Sentinela'), ler = no(w, 'Ler Evento');
    inserirDepois(w, 'Webhook Sentinela', confere('Confere Endereço', [wh.position[0] + 110, wh.position[1] + 160], 'iag_eventos_confere', '($json.query || {}).k', '($json.query || {}).t'));
    let c = ler.parameters.jsCode;
    c = semSegredo(c, '// n8n novo: sem segredo aqui; o endereço (k, t) é conferido no banco pelo nó "Confere Endereço".\n' + LER_CONFERE('Confere Endereço'), 'Ler Evento');
    c = trocar(c, 'const wh = $input.first().json;', "const wh = $('Webhook Sentinela').first().json;", 'Ler Evento');
    c = trocar(c, "String((wh.query || {}).t || '') === tokenConta(SEGREDO, conta)", '_confere', 'Ler Evento');
    c = trocar(c, "(tokenOk ? tokenConta(SEGREDO, conta) : '')", "(tokenOk ? encodeURIComponent(String((wh.query || {}).t || '')) : '')", 'Ler Evento');
    ler.parameters.jsCode = c;
  },
  // Atendimento: chamado pela Sentinela e pela passagem entre agentes, com ?k=&t=
  PPo7tBUmQxFmusfv(w) { entradaMotor(w); },
  KgBkOWFYaZlhMkcz(w) { entradaMotor(w); },
  // Plugin do Vendedor: a chave do plugin vem no corpo (k, t)
  GszJgfDP7mbCAcC1(w) {
    const pl = no(w, 'Plugin'), val = no(w, 'Validar');
    inserirDepois(w, 'Plugin', confere('Confere Plugin', [pl.position[0] + 110, pl.position[1] + 160], 'iag_plugin_confere', '($json.body || {}).k', '($json.body || {}).t'));
    let c = val.parameters.jsCode;
    c = semSegredo(c, '// n8n novo: sem segredo aqui; a chave do plugin é conferida no banco pelo nó "Confere Plugin".\n' + LER_CONFERE('Confere Plugin'), 'Validar');
    c = trocar(c, 'const b = ($input.first().json || {}).body || {};', "const b = ($('Plugin').first().json || {}).body || {};", 'Validar');
    c = trocar(c, "hmac(SEGREDO, 'plugin|' + conta).slice(0, 24) !== tok", '!_confere', 'Validar');
    val.parameters.jsCode = c;
  },
  // Endereço e eventos: as chaves das contas novas nascem no banco; aqui só a hora do último evento e do último envio
  DfvuQD9s0ZqPX0t5(w) {
    const rd = no(w, 'Redis Saúde Envios'), tk = no(w, 'Token e Último Evento');
    inserirDepois(w, 'Redis Saúde Envios', { id: 'cf-tokensnovos', name: 'Chaves das Contas Novas', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [rd.position[0] + 110, rd.position[1] + 160], parameters: { method: 'POST', url: SUPA + '/rest/v1/rpc/lv_motor_tokens_novos',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: '{}',
        options: { timeout: 15000, response: { response: { neverError: true } } } }, credentials: SUPA_CRED, onError: 'continueRegularOutput', alwaysOutputData: true });
    let c = tk.parameters.jsCode;
    c = semSegredo(c, '// n8n novo: sem segredo aqui; as chaves das contas novas são criadas no banco (nó "Chaves das Contas Novas").', 'Token e Último Evento');
    c = trocar(c, '  if (!c.tem_token) l.token = tokenConta(SEGREDO, c.conta);\n', '', 'Token e Último Evento');
    c = trocar(c, "  l.tokenPlugin = hmac(SEGREDO, 'plugin|' + c.conta).slice(0, 24);\n", '', 'Token e Último Evento');
    c = trocar(c, '.filter(l => l.token || l.ultimo || l.envio);', '.filter(l => l.ultimo || l.envio);', 'Token e Último Evento');
    tk.parameters.jsCode = c;
  }
};
function entradaMotor(w) {
  const rg = no(w, 'Redis Get Teste'), ent = no(w, 'Entrada');
  inserirDepois(w, 'Redis Get Teste', confere('Confere Endereço', [rg.position[0] + 110, rg.position[1] + 160], 'iag_eventos_confere',
    "($('Webhook Motor').first().json.query || {}).k || ((typeof $('Webhook Motor').first().json.body === 'object' && $('Webhook Motor').first().json.body) || {}).k",
    "($('Webhook Motor').first().json.query || {}).t || ((typeof $('Webhook Motor').first().json.body === 'object' && $('Webhook Motor').first().json.body) || {}).t"));
  let c = ent.parameters.jsCode;
  c = semSegredo(c, [
    '// n8n novo: sem segredo escrito aqui. O endereço (k, t) é conferido no banco pelo nó "Confere Endereço",',
    '// e o próprio t, já conferido, assina a passagem entre agentes (Fila de Envio usa o mesmo SEGREDO).',
    LER_CONFERE('Confere Endereço'),
    "const _tUrl = (() => { const w = $('Webhook Motor').first().json || {}; let bb = w.body || {}; if (typeof bb === 'string') { try { bb = JSON.parse(bb); } catch (e) { bb = {}; } } if (Array.isArray(bb)) bb = bb[0] || {}; return String((w.query || {}).t || bb.t || ''); })();",
    "const SEGREDO = 'url|' + _tUrl;"].join('\n'), 'Entrada');
  c = trocar(c, 'const wh = { ...$(\'Webhook Motor\').first().json, ...$input.first().json };', "const wh = { ...$('Webhook Motor').first().json, ...$('Redis Get Teste').first().json };", 'Entrada');
  c = trocar(c, 'const tokenUrl = tokenConta(SEGREDO, conta);', "const tokenUrl = _confere && _tUrl ? _tUrl : '#invalido';", 'Entrada');
  ent.parameters.jsCode = c;
}

function converter(antigo) {
  const w = JSON.parse(JSON.stringify({ name: antigo.name, nodes: antigo.nodes, connections: antigo.connections }));
  const faltando = [];
  for (const n of w.nodes) {
    for (const tipo of Object.keys(n.credentials || {})) {
      if (CRED[tipo]) n.credentials[tipo] = CRED[tipo]; else faltando.push(n.name + ' (' + tipo + ')');
    }
  }
  if (faltando.length) throw new Error(w.name + ': credencial sem par no n8n novo: ' + faltando.join(', '));
  if (PATCH[antigo.id]) PATCH[antigo.id](w);
  let s = JSON.stringify(w.nodes).split(BASE_ANTIGA).join(BASE_NOVA);
  w.nodes = JSON.parse(s);
  // nada do segredo pode sobrar
  for (const n of w.nodes) {
    const t = JSON.stringify(n.parameters || {});
    if (/const SEGREDO\s*=\s*'[^']{8,}'/.test(t)) throw new Error(w.name + ': o nó ' + n.name + ' ainda tem o SEGREDO');
    if (/hmac\(SEGREDO, *'plugin\|'|tokenConta\(SEGREDO, *(c\.)?conta\)/.test(t) && !/^Fila de Envio$/.test(n.name)) throw new Error(w.name + ': o nó ' + n.name + ' ainda calcula chave com o SEGREDO');
  }
  if (s.includes('lv-mktdeconversa.com')) throw new Error(w.name + ': ainda chama o n8n antigo');
  w.settings = { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', saveManualExecutions: true, timezone: 'America/Sao_Paulo' };
  return w;
}

if (typeof module !== 'undefined') module.exports = { converter };
