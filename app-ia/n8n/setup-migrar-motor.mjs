// Gera app-ia/n8n/setup-migrar-motor.json: o fluxo "SETUP · Migrar motor do painel" do n8n novo.
// Lê os 9 fluxos do motor no n8n antigo (chave só de leitura), converte com migrar-motor.js e cria no novo, desligados.
import { readFileSync, writeFileSync } from 'node:fs';
const conv = readFileSync(new URL('./migrar-motor.js', import.meta.url), 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
const FLUXOS = ['I7bT8hPrqjfwBlYO', 'PPo7tBUmQxFmusfv', 'GszJgfDP7mbCAcC1', 'DfvuQD9s0ZqPX0t5', 'KgBkOWFYaZlhMkcz', 'LEwOEZhEu2MQiXJy', 'CzhEDTILkZWEsJxg', '7E2XVUEF9znokQOU', 'kkz1l8kKdtb3q1vR'];
const http = (name, pos, p, cred) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, credentials: cred,
  parameters: { ...p, options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } } }, onError: 'continueRegularOutput', alwaysOutputData: true });
const nodes = [
  { name: 'Rodar', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
  { name: 'Fluxos do motor', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: '// os 9 fluxos do motor do painel no n8n antigo\nreturn ' + JSON.stringify(FLUXOS) + '.map(id => ({ json: { id } }));' } },
  http('Ler do antigo', [440, 0], { method: 'GET', url: '=https://apin8n.lv-mktdeconversa.com/api/v1/workflows/{{ $json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' },
    { httpHeaderAuth: { id: 'vyE7WVaEIkwwwMeN', name: 'n8n API (antigo - só leitura)' } }),
  { name: 'Converter', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { jsCode: conv +
    '\n// cada fluxo lido do antigo vira o corpo para criar no novo\nreturn $input.all().map((i, n) => { const r = i.json || {}, a = r.body || {}; if (r.statusCode !== 200 || !a.nodes) return { json: { ok: false, id: $(\'Fluxos do motor\').all()[n].json.id, erro: \'não li do antigo: HTTP \' + r.statusCode } };\n  try { return { json: { ok: true, id: a.id, nome: a.name, fluxo: converter(a) } }; } catch (e) { return { json: { ok: false, id: a.id, nome: a.name, erro: e.message } }; } });' } },
  { name: 'Convertido?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [880, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: 'ok', leftValue: '={{ $json.ok === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, looseTypeValidation: true, options: {} } },
  http('Criar no novo', [1100, -100], { method: 'POST', url: 'https://n8n.leadvox.com.br/api/v1/workflows', authentication: 'predefinedCredentialType', nodeCredentialType: 'n8nApi',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fluxo) }}' }, { n8nApi: { id: 'MPWVb5hCkMz0JZS7', name: 'n8n API (VPS)' } }),
  { name: 'Resumo', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, 0], parameters: { jsCode:
    "// o que foi criado (id novo) e o que falhou\nconst conv = $('Converter').all().map(i => i.json);\nconst criados = (() => { try { return $('Criar no novo').all().map(i => i.json); } catch (e) { return []; } })();\nlet k = 0;\nreturn conv.map(c => { if (!c.ok) return { json: { antigo: c.id, nome: c.nome, ok: false, erro: c.erro } };\n  const r = criados[k++] || {}; const b = r.body || {};\n  return { json: { antigo: c.id, nome: c.nome, ok: r.statusCode === 200, novo: b.id || null, erro: r.statusCode === 200 ? '' : 'HTTP ' + r.statusCode + ' ' + JSON.stringify(b).slice(0, 300) } }; });" } }
];
const L = (n) => ({ node: n, type: 'main', index: 0 });
const connections = { Rodar: { main: [[L('Fluxos do motor')]] }, 'Fluxos do motor': { main: [[L('Ler do antigo')]] }, 'Ler do antigo': { main: [[L('Converter')]] },
  Converter: { main: [[L('Convertido?')]] }, 'Convertido?': { main: [[L('Criar no novo')], [L('Resumo')]] }, 'Criar no novo': { main: [[L('Resumo')]] } };
writeFileSync(new URL('./setup-migrar-motor.json', import.meta.url), JSON.stringify({ name: 'SETUP · Migrar motor do painel (rodar 1 vez)', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'none' } }, null, 1) + '\n');
console.log('ok', nodes.length, 'nós');
