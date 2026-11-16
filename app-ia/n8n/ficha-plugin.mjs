// Fluxo "V01 LeadVox · Ficha de implantação (plugin)" do n8n NOVO (n8n.leadvox.com.br), webhook POST ficha-implantacao.
// A página leadvox.com.br/ficha (plugin da LeadVox) manda {k, acao, id?, ficha?}; o fluxo confere a chave do plugin,
// chama a função do banco (fichas.sql) com o service_role e devolve o resultado. Não guarda execução (as fichas têm dados de clientes).
// Uso: fluxoFicha({supabase:{id,name}, supabaseUrl, chave}) → JSON para criar no n8n novo.

export const ORIGENS = 'https://leadvox.com.br,https://www.leadvox.com.br,https://leogoes22.github.io';

export function pedidoCode(chave) {
  return `// Confere a chave do plugin e monta a chamada da função do banco.
const CHAVE = ${JSON.stringify(chave)};
let b = $json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const erro = e => [{ json: { ok: false, resposta: { ok: false, erro: e } } }];
if (typeof b.k !== 'string' || b.k.length !== CHAVE.length || b.k !== CHAVE) return erro('chave');
const id = String(b.id || ''), okId = /^[a-z0-9-]{3,60}$/.test(id);
let fn = '', corpo = {};
if (b.acao === 'listar') fn = 'lv_fichas_listar';
else if (b.acao === 'abrir' && okId) { fn = 'lv_ficha_abrir'; corpo = { p_id: id }; }
else if (b.acao === 'excluir' && okId) { fn = 'lv_ficha_excluir'; corpo = { p_id: id }; }
else if (b.acao === 'salvar' && okId && b.ficha && typeof b.ficha === 'object' && !Array.isArray(b.ficha)) {
  const f = b.ficha;
  corpo = { p_id: id, p_ficha: { nome: String(f.nome || '').slice(0, 120), contato: String(f.contato || '').replace(/\\D/g, '').slice(0, 20),
    status: f.status === 'pronta' ? 'pronta' : 'rascunho', dados: f.dados && typeof f.dados === 'object' && !Array.isArray(f.dados) ? f.dados : {} } };
  if (JSON.stringify(corpo).length > 200000) return erro('grande');
  fn = 'lv_ficha_salvar';
} else return erro('pedido');
return [{ json: { ok: true, acao: b.acao, fn, corpoJson: JSON.stringify(corpo) } }];`;
}

export const RESPOSTA = `// Devolve à página só o que ela precisa.
const r = $json || {}, p = $('Pedido').first().json;
if (r.statusCode !== 200) return [{ json: { resposta: { ok: false, erro: 'banco', status: r.statusCode || 0 } } }];
const body = r.body === '' || r.body === undefined ? null : r.body;
if (p.acao === 'listar') return [{ json: { resposta: { ok: true, fichas: Array.isArray(body) ? body : [] } } }];
if (p.acao === 'abrir') return [{ json: { resposta: { ok: true, ficha: body && typeof body === 'object' ? body : null } } }];
return [{ json: { resposta: body && typeof body === 'object' ? body : { ok: true } } }];`;

export function fluxoFicha({ supabase, supabaseUrl, chave } = {}) {
  if (!supabase?.id || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl || '') || !/^lvficha-[0-9a-f]{32}$/.test(chave || ''))
    throw Error('Informe a credencial do Supabase do n8n novo, o endereço do Supabase e a chave do plugin (lvficha-...).');
  const no = (id, name, type, typeVersion, position, parameters, extra = {}) => ({ id, name, type, typeVersion, position, parameters, ...extra });
  const nodes = [
    no('fp1', 'Webhook', 'n8n-nodes-base.webhook', 2, [0, 0], { httpMethod: 'POST', path: 'ficha-implantacao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } }, { webhookId: '0b9f4c62-3e1a-4d8e-a7c5-3f1c0a0f1c01' }),
    no('fp2', 'Pedido', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: pedidoCode(chave) }),
    no('fp3', 'Válido?', 'n8n-nodes-base.if', 2.2, [440, 0], { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: 'ok', leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }),
    no('fp4', 'Banco', 'n8n-nodes-base.httpRequest', 4.2, [660, -80], { method: 'POST', url: '=' + supabaseUrl + '/rest/v1/rpc/{{ $json.fn }}',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpoJson }}',
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } }, { credentials: { supabaseApi: supabase } }),
    no('fp5', 'Resposta', 'n8n-nodes-base.code', 2, [880, -80], { jsCode: RESPOSTA }),
    no('fp6', 'Responder', 'n8n-nodes-base.respondToWebhook', 1.1, [1100, 0], { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} })
  ];
  const liga = (de, ...saidas) => [de, { main: saidas.map(s => (Array.isArray(s) ? s : [s]).map(node => ({ node, type: 'main', index: 0 }))) }];
  const connections = Object.fromEntries([liga('Webhook', 'Pedido'), liga('Pedido', 'Válido?'), liga('Válido?', 'Banco', 'Responder'), liga('Banco', 'Resposta'), liga('Resposta', 'Responder')]);
  return { name: 'V01 LeadVox · Ficha de implantação (plugin)', nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', callerPolicy: 'workflowsFromSameOwner' } };
}
