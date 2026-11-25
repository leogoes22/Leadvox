// Fluxo n8n "PONTE nova LeadVox" — monta o JSON que é importado no n8n (25/11/2026).
// Três portas, todas no n8n, sem mexer no Motor:
//   /nl-entrada?k=<conta>&t=<token>        ← URL do N8N do canal na nova LeadVox: traduz o aviso e chama o Motor
//   /<id>/nl-midia/<id>.<ext>              ← serve o áudio/foto que veio no aviso (o Motor baixa por link)
//   /<id>/nl-saida/v1/api/external/<apiId>/?token=<token>   ← o Motor "envia ao CRM antigo" aqui; a ponte chama a nova API
// O código das traduções é o de ponte-novaleadvox.js (testado em tests/ponte-novaleadvox.test.mjs), copiado para dentro dos nós.
import {readFileSync} from 'node:fs';

const FONTE = readFileSync(new URL('./ponte-novaleadvox.js', import.meta.url), 'utf8');
// a cópia que vai dentro dos nós não leva os comentários de linha inteira (o código é o mesmo)
const FONTE_ENXUTA = FONTE.split('\n').filter(l => l.trim() && !/^\s*\/\//.test(l)).join('\n');
const MODULO = `const P = (() => { const module = { exports: {} };\n${FONTE_ENXUTA}\nreturn module.exports; })();`;
const REDIS = { redis: { id: 'U4DKWxV6p86WQJEq', name: 'Redis LeadVox (VPS)' } };
const WEBHOOKS = 'https://n8n.leadvox.com.br/webhook/';
// no n8n, webhook com parâmetro no caminho (:arquivo, :apiId) só existe sob o id do webhook: /webhook/<id>/<caminho>
const ID_MIDIA = 'a6f0c0de-0b1e-4d6b-9a55-5d1d0e0a0002', ID_SAIDA = 'a6f0c0de-0b1e-4d6b-9a55-5d1d0e0a0003';
const API = 'https://apicrm.leadvox.com.br/v2/api/external/';

let seq = 0;
const no = (name, type, typeVersion, parameters, extra = {}) => ({ id: 'ponte-' + (++seq), name, type, typeVersion, position: [0, 0], parameters, ...extra });

const CODIGO_ENTRADA = `${MODULO}
const w = $input.first().json;
const q = w.query || {};
let b = w.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
if (Array.isArray(b)) b = b[0] || {};
const r = P.entrada(b, { mediaBase: '${WEBHOOKS}${ID_MIDIA}/nl-midia/', novoId: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) });
if (r.ignorar) return [];
const k = String(q.k || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
const t = String(q.t || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
if (!k || !t) return [];
const motor = ['hml-iag-motor-v9', 'iag-motor-v9'].includes(String(q.m || '')) ? String(q.m) : 'hml-iag-motor-v9';
return [{ json: {
  motorUrl: '${WEBHOOKS}' + motor + '?k=' + k + '&t=' + t,
  motorJson: JSON.stringify({ ...r.motor, k, t }),
  ticketChave: 'nl_ticket_' + r.ticket.tel, ticketId: r.ticket.id,
  temMidia: !!r.midia, midiaChave: r.midia ? 'nl_midia_' + r.midia.id : '', midiaB64: r.midia ? r.midia.base64 : ''
} }];`;

const CODIGO_PREPARAR_MIDIA = `const a = String(($input.first().json.params || {}).arquivo || '');
const m = a.match(/^([A-Za-z0-9]{4,24})\\.([a-z0-9]{2,4})$/);
if (!m) return [{ json: { chave: '', ext: '', mime: 'application/octet-stream', nome: 'arquivo' } }];
const MIME = { ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', zip: 'application/zip' };
return [{ json: { chave: 'nl_midia_' + m[1], ext: m[2], mime: MIME[m[2]] || 'application/octet-stream', nome: a } }];`;

const CODIGO_SAIDA = `${MODULO}
const w = $('Saída · Nova LeadVox').first().json;
const q = w.query || {}, p = w.params || {};
let b = w.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const token = String(q.token || '').replace(/^Bearer\\s+/i, '').trim();
const apiId = String(p.apiId || '').replace(/[^A-Za-z0-9_-]/g, '');
const ticketId = $input.first().json.ticketId;
const r = P.saida(b, { ticketId });
if (!apiId || token.length < 10) return [{ json: { semChamada: true, status: 401, resposta: { success: false, error: 'credencial' } } }];
if (!r.chamadas.length) return [{ json: { semChamada: true, status: r.erro === 'sem_ticket' ? 409 : 400, resposta: { success: false, error: r.erro || 'vazio' } } }];
return r.chamadas.map(c => ({ json: { url: '${API}' + apiId + (c.rota === '/' ? '' : c.rota), token, corpoJson: JSON.stringify(c.corpo), transfere: !!c.transfere, erroFinal: r.erro || '' } }));`;

const CODIGO_RESUMO = `const itens = $input.all().map(i => i.json);
const falhou = itens.find(r => !(Number(r.statusCode) >= 200 && Number(r.statusCode) < 300));
const erroFinal = String(($('Traduzir Saída').first().json || {}).erroFinal || '');
const status = falhou ? (Number(falhou.statusCode) >= 400 ? Number(falhou.statusCode) : 502) : (erroFinal ? 409 : 200);
const resposta = status === 200 ? { success: true, enviados: itens.length } : { success: false, error: falhou ? String((falhou.body && (falhou.body.error || falhou.body.message)) || falhou.statusMessage || 'falha').slice(0, 160) : erroFinal };
return [{ json: { status, resposta } }];`;

export function montarFluxoPonte() {
  seq = 0;
  const nos = [
    no('Entrada · Nova LeadVox', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'nl-entrada', options: {} }, { webhookId: 'a6f0c0de-0b1e-4d6b-9a55-5d1d0e0a0001' }),
    no('Traduzir Entrada', 'n8n-nodes-base.code', 2, { jsCode: CODIGO_ENTRADA }),
    no('Guardar Ticket', 'n8n-nodes-base.redis', 1, { operation: 'set', key: '={{ $json.ticketChave }}', value: '={{ $json.ticketId }}', expire: true, ttl: 604800 }, { credentials: REDIS, onError: 'continueRegularOutput' }),
    no('Tem mídia?', 'n8n-nodes-base.if', 2, { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: "={{ $('Traduzir Entrada').first().json.temMidia }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } }),
    no('Guardar Mídia', 'n8n-nodes-base.redis', 1, { operation: 'set', key: "={{ $('Traduzir Entrada').first().json.midiaChave }}", value: "={{ $('Traduzir Entrada').first().json.midiaB64 }}", expire: true, ttl: 900 }, { credentials: REDIS, onError: 'continueRegularOutput' }),
    no('Chamar Motor', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: "={{ $('Traduzir Entrada').first().json.motorUrl }}", sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Traduzir Entrada').first().json.motorJson }}", options: { timeout: 20000 } }, { onError: 'continueRegularOutput', retryOnFail: true }),

    no('Mídia · Servir', 'n8n-nodes-base.webhook', 2, { httpMethod: 'GET', path: 'nl-midia/:arquivo', responseMode: 'responseNode', options: {} }, { webhookId: ID_MIDIA }),
    no('Preparar Mídia', 'n8n-nodes-base.code', 2, { jsCode: CODIGO_PREPARAR_MIDIA }),
    no('Ler Mídia', 'n8n-nodes-base.redis', 1, { operation: 'get', propertyName: 'base64', key: '={{ $json.chave }}', options: {} }, { credentials: REDIS, onError: 'continueRegularOutput' }),
    no('Achou a mídia?', 'n8n-nodes-base.if', 2, { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c2', leftValue: '={{ $json.base64 }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }] } }),
    no('Montar Arquivo', 'n8n-nodes-base.convertToFile', 1.1, { operation: 'toBinary', sourceProperty: 'base64', options: { fileName: "={{ $('Preparar Mídia').first().json.nome }}", mimeType: "={{ $('Preparar Mídia').first().json.mime }}" } }),
    no('Responder Arquivo', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'binary', options: {} }),
    no('Mídia não achada', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, erro: "midia_expirada" }) }}', options: { responseCode: 404 } }),

    no('Saída · Nova LeadVox', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'nl-saida/v1/api/external/:apiId', responseMode: 'responseNode', options: {} }, { webhookId: ID_SAIDA }),
    no('Ler Ticket', 'n8n-nodes-base.redis', 1, { operation: 'get', propertyName: 'ticketId', key: "={{ 'nl_ticket_' + String(($json.body || {}).number || '').replace(/\\D/g, '') }}", options: {} }, { credentials: REDIS, onError: 'continueRegularOutput' }),
    no('Traduzir Saída', 'n8n-nodes-base.code', 2, { jsCode: CODIGO_SAIDA }),
    no('Tem chamada?', 'n8n-nodes-base.if', 2, { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c3', leftValue: '={{ $json.url }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }] } }),
    no('Chamar nova LeadVox', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: '={{ $json.url }}', sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '={{ "Bearer " + $json.token }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpoJson }}', options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000, batching: { batch: { batchSize: 1, batchInterval: 600 } } } }, { onError: 'continueRegularOutput' }),
    no('Resumo da Saída', 'n8n-nodes-base.code', 2, { jsCode: CODIGO_RESUMO }),
    no('Responder Saída', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: { responseCode: '={{ $json.status }}' } }),
  ];
  const lig = (de, para, saida = 0) => [de, para, saida];
  const L = [
    lig('Entrada · Nova LeadVox', 'Traduzir Entrada'), lig('Traduzir Entrada', 'Guardar Ticket'), lig('Guardar Ticket', 'Tem mídia?'),
    lig('Tem mídia?', 'Guardar Mídia', 0), lig('Tem mídia?', 'Chamar Motor', 1), lig('Guardar Mídia', 'Chamar Motor'),
    lig('Mídia · Servir', 'Preparar Mídia'), lig('Preparar Mídia', 'Ler Mídia'), lig('Ler Mídia', 'Achou a mídia?'),
    lig('Achou a mídia?', 'Montar Arquivo', 0), lig('Achou a mídia?', 'Mídia não achada', 1), lig('Montar Arquivo', 'Responder Arquivo'),
    lig('Saída · Nova LeadVox', 'Ler Ticket'), lig('Ler Ticket', 'Traduzir Saída'), lig('Traduzir Saída', 'Tem chamada?'),
    lig('Tem chamada?', 'Chamar nova LeadVox', 0), lig('Tem chamada?', 'Responder Saída', 1), lig('Chamar nova LeadVox', 'Resumo da Saída'), lig('Resumo da Saída', 'Responder Saída'),
  ];
  const connections = {};
  for (const [de, para, saida] of L) {
    connections[de] = connections[de] || { main: [] };
    while (connections[de].main.length <= saida) connections[de].main.push([]);
    connections[de].main[saida].push({ node: para, type: 'main', index: 0 });
  }
  // posições em colunas: três faixas (entrada, mídia, saída)
  const faixa = { 'Entrada · Nova LeadVox': [0, 0], 'Mídia · Servir': [0, 400], 'Saída · Nova LeadVox': [0, 800] };
  let faixaAtual = 0, col = 0;
  nos.forEach(n => { if (faixa[n.name]) { faixaAtual = faixa[n.name][1]; col = 0; } n.position = [260 * col++, faixaAtual]; });
  return { name: 'PONTE nova LeadVox · Motor IA (HML)', nodes: nos, connections, settings: { executionOrder: 'v1' }, active: false };
}
