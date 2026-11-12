// Plugin do Usuário (12/11/2026, Brants · Adelmo): duas correções no fluxo do plugin (X8U6n3HOekYzVd6X).
// 1) Busca da oportunidade: o endereço do nó "Oportunidade" juntava "token || '' + '&status=open&contactId=…'" e,
//    pela ordem das operações, o filtro nunca entrava: vinha só a 1ª página de TODAS as oportunidades da loja.
// 2) Carro enviado pela aba Estoque do plugin: a oportunidade aberta passa a ter o valor dele e "Interesse: <carro>"
//    na descrição (antes só o carro mostrado pela IA com foto mexia no valor). O plugin mostra o interesse da descrição
//    quando a IA ainda não registrou um.
// Uso no console do n8n: aplicarOportunidadeFix(plugin) → cópia trocada (falha se o fluxo mudou).

const URL_OPORTUNIDADE = "={{ String((($('URL de Envio').first().json.conexao || {}).urlEnvio) || 'http://invalido').split('?')[0].replace(/\\/$/, '') + '/opportunities?' + (String((($('URL de Envio').first().json.conexao || {}).urlEnvio) || '').split('?')[1] || '') + '&status=open&contactId=' + ($('Validar').first().json.contactId || '0') }}";

const OPORTUNIDADE_DO_CARRO = `// LeadVox IA — carro enviado pelo plugin: a oportunidade aberta passa a ter o valor dele e o interesse na descrição.
// Sem oportunidade aberta, sem preço (sob consulta) ou se nada mudou, não chama a LeadVox.
const c = $('Contexto').first().json;
const s = (v) => String(v ?? '').trim();
let it = null; try { it = $('Buscar Carro').all().map(i => i.json).find(x => x && x.id) || null; } catch (e) {}
let enviou = false; try { enviou = $('Montar Carro').all().some(i => i.json && i.json.pular === false); } catch (e) {}
const op = (c.__x || {}).oportunidade;
const preco = it && it.preco_tipo !== 'consulta' ? Number(it.preco) || 0 : 0;
if (!enviou || !it || !op || !op.id || !preco) return [];
let o = null; try { const L = (y) => Array.isArray(y) ? y : (y && (y.data || y.opportunities || y.items || y.result)) || []; o = L($('Oportunidade').first().json).find(z => z && Number(z.id) === Number(op.id)) || null; } catch (e) {}
if (!o) return [];
const m = s(c.url).match(/^(https:\\/\\/[^?#]+)\\/api\\/external\\/([^/?#]+)\\/?\\?(?:.*&)?token=([^&#]+)/);
if (!m) return [];
const linha = 'Interesse: ' + s(it.nome).slice(0, 120);
const desc0 = s(o.description);
const desc = desc0.includes(linha) ? desc0 : (desc0 + (desc0 ? '\\n' : '') + linha + ' (enviado pelo plugin por ' + (s(c.vendedor) || 'um usuário') + ')').slice(0, 6000);
if (Number(o.value) === preco && desc === desc0) return [];
return [{ json: { method: 'PUT', url: m[1] + '/api/external/' + m[2] + '/opportunities/' + o.id, token: decodeURIComponent(m[3]), body: {
  name: o.name, description: desc, value: preco, expectedCloseDate: s(o.expectedCloseDate).slice(0, 10) || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  contactId: Number(c.contactId) || o.contactId, responsibleId: Number(o.responsibleId), pipelineStepId: Number(o.pipelineStepId), userId: String(o.userId || o.responsibleId) } } }];`;

const TROCA_INTERESSE = [
  "  const interesse = estado.interesse && estado.interesse.nome ? { nome: String(estado.interesse.nome).slice(0, 90), preco: Number(estado.interesse.preco) || null } : null;",
  "  let interesse = estado.interesse && estado.interesse.nome ? { nome: String(estado.interesse.nome).slice(0, 90), preco: Number(estado.interesse.preco) || null } : null;\n" +
  "  // carro enviado pelo plugin: o interesse fica na descrição da oportunidade (\"Interesse: …\")\n" +
  "  if (!interesse && op) { try { const L2 = (y) => Array.isArray(y) ? y : (y && (y.data || y.opportunities || y.items || y.result)) || []; const oo = L2($('Oportunidade').first().json).find(z => z && Number(z.id) === op.id);\n" +
  "    const mm = String((oo && oo.description) || '').match(/Interesse: ([^\\n(]{2,120})/g); if (mm) interesse = { nome: mm[mm.length - 1].replace(/^Interesse: /, '').trim().slice(0, 90), preco: op.valor || null }; } catch (e) {} }"
];

function aplicarOportunidadeFix(pluginOrig) {
  const plugin = JSON.parse(JSON.stringify(pluginOrig));
  const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  const pega = (n) => { const x = plugin.nodes.find(y => y.name === n); if (!x) throw new Error('sem o nó ' + n); return x; };
  // 1) endereço da busca
  const op = pega('Oportunidade');
  if (!String(op.parameters.url).includes("|| '' + '&status=open&contactId='")) throw new Error('Oportunidade: endereço mudou');
  op.parameters.url = URL_OPORTUNIDADE;
  // interesse vindo da descrição da oportunidade
  const ctx = pega('Contexto'); const [de, para] = TROCA_INTERESSE;
  if (ctx.parameters.jsCode.split(de).length !== 2) throw new Error('Contexto: trecho do interesse mudou');
  ctx.parameters.jsCode = ctx.parameters.jsCode.replace(de, () => para);
  // 2) carro enviado → valor da oportunidade (em paralelo à resposta: não atrasa o plugin)
  if (plugin.nodes.some(n => n.name === 'Oportunidade do Carro')) throw new Error('já aplicado');
  const nota = pega('Enviar Nota Carro'), ch = pega('Chamar LeadVox (Transferência)');
  plugin.nodes.push({ id: uuid(), name: 'Oportunidade do Carro', type: 'n8n-nodes-base.code', typeVersion: 2, position: [nota.position[0] + 220, nota.position[1] + 180], parameters: { jsCode: OPORTUNIDADE_DO_CARRO } });
  plugin.nodes.push({ id: uuid(), name: 'Chamar LeadVox (Carro)', type: ch.type, typeVersion: ch.typeVersion, position: [nota.position[0] + 440, nota.position[1] + 180],
    alwaysOutputData: false, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(ch.parameters)) });
  const sai = plugin.connections['Enviar Nota Carro'].main[0];
  if (!sai.some(x => x.node === 'Resposta do Carro')) throw new Error('Enviar Nota Carro não liga na Resposta do Carro');
  sai.push({ node: 'Oportunidade do Carro', type: 'main', index: 0 });
  plugin.connections['Oportunidade do Carro'] = { main: [[{ node: 'Chamar LeadVox (Carro)', type: 'main', index: 0 }]] };
  return plugin;
}
if (typeof module !== 'undefined') module.exports = { aplicarOportunidadeFix, URL_OPORTUNIDADE, OPORTUNIDADE_DO_CARRO, TROCA_INTERESSE };
