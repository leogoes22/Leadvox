// Plugin do Usuário (12/11/2026) — botão "Transferir", oportunidade, origem do lead e o que a IA coletou.
// Aplica nos dois fluxos do n8n novo: Atendimento V0.9 (dkipBj6hAhdu7OSp) e Plugin do vendedor (X8U6n3HOekYzVd6X).
// • Atendimento: ganha o caminho "Rodízio · Plugin" (webhook iag-rodizio-plugin). A vez do rodízio e a carteira
//   ficam guardadas NESTE fluxo ($getWorkflowStaticData), então o botão do plugin usa a mesma fila da IA.
//   Ler Resposta passa a guardar no estado o que a IA coletou ([TRANSFERIR]), o resumo e a origem marcada pela regra.
// • Plugin: ações "fila" (quem é o próximo), "transferir" (ticket + oportunidade + nota + aviso) e "fechar" (Ganho/Perdido);
//   o contexto devolve departamentos, oportunidade aberta, origem do lead, coleta e veículo de interesse.
// Só recebe quem está marcado no painel naquele departamento. Cada "de" tem de existir uma única vez; se mudar, nada é salvo.
// Uso no console do n8n: const r = aplicarPluginTransferir(atend, plugin) → { atend, plugin } trocados (cópias).

const RODIZIO_PLUGIN = `// LeadVox IA — rodízio pedido pelo plugin do usuário (botão Transferir). Usa a MESMA vez e a MESMA carteira
// do rodízio da IA (Fila de Envio), guardadas neste fluxo. ver=true só mostra quem é o próximo, sem gastar a vez.
const b = ($('Rodízio · Plugin').first().json || {}).body || {};
let ok = false; try { const j = $('Rodízio · Confere').first().json; ok = j === true || (!!j && typeof j === 'object' && (j.data === true || Object.values(j).includes(true))); } catch (e) {}
const sai = (status, resposta) => [{ json: { status, resposta } }];
const conta = String(b.k || '');
if (!ok || !/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(conta)) return sai(401, { ok: false, erro: 'Chave do plugin inválida.' });
const s = (v) => String(v ?? '').trim();
const tel = s(b.tel).replace(/\\D/g, '').slice(0, 20);
const filaId = Number(b.filaId) || 0;
const lista = (Array.isArray(b.vendedores) ? b.vendedores : []).map(v => ({ id: Number(v && v.id) || 0, nome: s(v && v.nome).slice(0, 60) })).filter(v => v.id).slice(0, 50);
if (!filaId || !lista.length) return sai(400, { ok: false, erro: 'Este departamento não tem usuários marcados no rodízio.' });
const sd = $getWorkflowStaticData('global'); sd.rodizioIag = sd.rodizioIag || {}; sd.carteiraIag = sd.carteiraIag || {};
const ch = conta + ':' + filaId, ck = conta + ':' + tel + ':' + filaId;
const naLista = (id) => lista.find(v => v.id === Number(id)) || null;
const atual = Number(b.usuarioTicket) || 0;
let pos = (Number(sd.rodizioIag[ch]) || 0) % lista.length;
// quem já está com o cliente não recebe de novo: vai para o seguinte da ordem
if (lista.length > 1 && lista[pos].id === atual) pos = (pos + 1) % lista.length;
const cart = tel && sd.carteiraIag[ck] ? naLista(sd.carteiraIag[ck].id) : null;
const escolhido = Number(b.pessoaId) ? naLista(b.pessoaId) : null;
if (Number(b.pessoaId) && !escolhido) return sai(400, { ok: false, erro: 'Essa pessoa não está marcada neste departamento.' });
let quem = null, como = 'vez';
if (escolhido) { quem = escolhido; como = 'escolha'; }
else if (cart && cart.id !== atual) { quem = cart; como = 'carteira'; }
else quem = lista[pos];
const ordem = lista.map((_, i) => lista[(pos + i) % lista.length].nome);
if (b.ver === true) return sai(200, { ok: true, proximo: quem, como, ordem });
if (como === 'vez') sd.rodizioIag[ch] = pos + 1;
if (tel) sd.carteiraIag[ck] = { id: quem.id, ts: Date.now() };
return sai(200, { ok: true, pessoa: quem, como });`;

const TROCAS_ATEND = {
 'Ler Resposta': [
  ["  else if (estado.interesse) estado.interesse.turno = false; }",
   "  else if (estado.interesse) estado.interesse.turno = false; }\n" +
   "// LeadVox IA — plugin do usuário: o que a IA coletou ([TRANSFERIR]), o resumo da passagem e a origem marcada pela regra\n" +
   "if (dadosT && typeof dadosT === 'object') { const __c = estado.coleta && typeof estado.coleta === 'object' ? estado.coleta : {};\n" +
   "  Object.entries(dadosT).forEach(([k, v]) => { const kk = String(k).trim().slice(0, 40), vv = String(v ?? '').trim().slice(0, 200); if (kk && vv && !/^n[aã]o informad[oa]$/i.test(vv)) __c[kk] = vv; });\n" +
   "  if (Object.keys(__c).length) estado.coleta = Object.fromEntries(Object.entries(__c).slice(-12)); }\n" +
   "if (transf && transf.resumo) estado.resumoIA = String(transf.resumo).slice(0, 1200);\n" +
   "if (acoesIA && acoesIA.origem && acoesIA.origem.nome) estado.origem = String(acoesIA.origem.nome).slice(0, 60);"]
 ]
};

const TROCAS_PLUGIN = {
 'Validar': [
  ["const acao = ['contexto', 'pausar', 'devolver', 'agendar', 'cancelar', 'estoque', 'enviar_carro', 'proposta', 'orcamento'].includes(b.acao) ? b.acao : '';",
   "const acao = ['contexto', 'pausar', 'devolver', 'agendar', 'cancelar', 'estoque', 'enviar_carro', 'proposta', 'orcamento', 'fila', 'transferir', 'fechar'].includes(b.acao) ? b.acao : '';"],
  ["  contactId: String(b.contactId || '').replace(/\\D/g, '').slice(0, 12),\n  busca:",
   "  contactId: String(b.contactId || '').replace(/\\D/g, '').slice(0, 12),\n" +
   "  filaId: String(b.filaId || '').replace(/\\D/g, '').slice(0, 9), pessoaId: String(b.pessoaId || '').replace(/\\D/g, '').slice(0, 9),\n" +
   "  usuarioId: String(b.usuarioId || '').replace(/\\D/g, '').slice(0, 9), status: ['won', 'lost'].includes(b.status) ? b.status : '',\n  busca:"]
 ],
 'Contexto': [
  ["return [{ json: { ...v, url, ia, resumo, hist, painel, agendaAtual, agenteAtende, agenteEstoque,",
   "// LeadVox IA — plugin do usuário: departamentos para transferir, oportunidade aberta, origem do lead e o que a IA coletou\n" +
   "const __x = (() => {\n" +
   "  const L = (x) => Array.isArray(x) ? x : (x && (x.data || x.opportunities || x.items || x.result)) || [];\n" +
   "  let rows = []; try { rows = $('Agentes da Conta').all().map(i => i.json).flatMap(j => Array.isArray(j) ? j : [j]); } catch (e) {}\n" +
   "  const chaveAg = (agenteAtende && agenteAtende.chave) || agenteEstoque || '';\n" +
   "  const ag = rows.find(a => a && a.chave === chaveAg) || rows.find(a => a && a.ativo) || rows[0] || {};\n" +
   "  const setores = (Array.isArray(ag.setores) ? ag.setores : []).filter(x => x && String(x.nome || '').trim() && Number(x.filaId)).map(x => {\n" +
   "    const pessoas = x.distribuicao === 'rodizio' && Array.isArray(x.vendedores) ? x.vendedores.map(p => ({ id: Number(p && p.id) || 0, nome: String((p && p.nome) || '').slice(0, 60) })).filter(p => p.id) : [];\n" +
   "    const escolher = pessoas.length > 0 && x.pluginEscolha === 'escolher';\n" +
   "    return { nome: String(x.nome).slice(0, 60), filaId: Number(x.filaId), rodizio: pessoas.length > 0, escolher, pessoas: escolher ? pessoas : [] };\n" +
   "  }).slice(0, 12);\n" +
   "  let op = null;\n" +
   "  try {\n" +
   "    const cid = String(v.contactId || '');\n" +
   "    const opps = cid ? L($('Oportunidade').first().json).filter(o => o && String(o.contactId) === cid && (!o.status || o.status === 'open')) : [];\n" +
   "    opps.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));\n" +
   "    const o = opps[0];\n" +
   "    if (o) op = { id: Number(o.id), etapa: etapa || '', valor: Number(o.value) || 0, responsavel: String((o.responsible && o.responsible.name) || (o.user && o.user.name) || '').slice(0, 60),\n" +
   "      responsavelId: Number(o.responsibleId) || null, pipelineStepId: Number(o.pipelineStepId) || null };\n" +
   "  } catch (e) {}\n" +
   "  let origem = null;\n" +
   "  try { const j = $('Origem do Lead').first().json; const d = j && (j.titulo ? j : (Array.isArray(j) ? j[0] : null)); if (d && d.titulo) origem = { tipo: 'anuncio', texto: String(d.titulo).slice(0, 120), midia: String(d.midia || '').slice(0, 20) }; } catch (e) {}\n" +
   "  if (!origem && estado.origem) origem = { tipo: 'regra', texto: String(estado.origem).slice(0, 60) };\n" +
   "  const coleta = estado.coleta && typeof estado.coleta === 'object' ? Object.entries(estado.coleta).slice(0, 12).map(([k, val]) => ({ k: String(k).slice(0, 40), v: String(val).slice(0, 200) })) : [];\n" +
   "  const interesse = estado.interesse && estado.interesse.nome ? { nome: String(estado.interesse.nome).slice(0, 90), preco: Number(estado.interesse.preco) || null } : null;\n" +
   "  const va = ag.vendAviso && typeof ag.vendAviso === 'object' ? ag.vendAviso : {};\n" +
   "  return { transferir: { setores }, oportunidade: op, origem, coleta, interesse, resumoIA: String(estado.resumoIA || '').slice(0, 1200),\n" +
   "    _ag: { chave: ag.chave || '', avisoVendedor: !!va.ativo, iaContinua: !!va.iaContinua } };\n" +
   "})();\n" +
   "return [{ json: { ...v, __x, url, ia, resumo, hist, painel, agendaAtual, agenteAtende, agenteEstoque,"],
  ["resposta: { ok: true, ia, resumo, painel } } }];",
   "resposta: { ok: true, ia, resumo, painel, transferir: __x.transferir, oportunidade: __x.oportunidade, origem: __x.origem, coleta: __x.coleta, interesse: __x.interesse, resumoIA: __x.resumoIA } } }];"]
 ]
};

// ── nós novos do plugin ──────────────────────────────────────────────────────────────────────────────────────
const PREPARAR_TRANSF = `// LeadVox IA — botão do plugin: departamento escolhido → rodízio (mesma vez da IA) ou fila do departamento.
// Só recebe quem está marcado no painel naquele departamento. "fila" só mostra quem é o próximo.
const c = $('Contexto').first().json;
const x = c.__x || {};
let t = ''; try { t = String((($('Plugin').first().json || {}).body || {}).t || ''); } catch (e) {}
const setor = ((x.transferir || {}).setores || []).find(s => Number(s.filaId) === Number(c.filaId)) || null;
const erro = (status, msg) => [{ json: { ...c, pular: true, status, resposta: { ok: false, erro: msg } } }];
if (!setor) return erro(400, 'Escolha um departamento da lista.');
let rows = []; try { rows = $('Agentes da Conta').all().map(i => i.json).flatMap(j => Array.isArray(j) ? j : [j]); } catch (e) {}
const ag = rows.find(a => a && a.chave === (x._ag || {}).chave) || {};
const cfg = (Array.isArray(ag.setores) ? ag.setores : []).find(s => s && Number(s.filaId) === Number(setor.filaId)) || {};
const vendedores = setor.rodizio ? (Array.isArray(cfg.vendedores) ? cfg.vendedores : []).map(p => ({ id: Number(p && p.id) || 0, nome: String((p && p.nome) || '').slice(0, 60),
  whatsapp: String((p && p.whatsapp) || '').replace(/\\D/g, '').slice(0, 15) })).filter(p => p.id) : [];
const pessoaId = setor.escolher && Number(c.pessoaId) ? Number(c.pessoaId) : 0;
const ver = c.acao === 'fila';
const corpo = { k: c.conta, t, tel: c.tel, filaId: setor.filaId, vendedores: vendedores.map(p => ({ id: p.id, nome: p.nome })), usuarioTicket: Number(c.usuarioId) || 0, pessoaId, ver };
if (ver && !vendedores.length) return [{ json: { ...c, pular: true, status: 200, resposta: { ok: true, setor: setor.nome, proximo: null, ordem: [], fila: true } } }];
return [{ json: { ...c, pular: false, ver, setor, vendedores, rodizioJson: JSON.stringify(corpo), chamaRodizio: vendedores.length > 0 } }];`;

const MONTAR_TRANSF = `// Monta a transferência: nota interna com o resumo + ticket para o departamento (e a pessoa), oportunidade para quem recebeu,
// aviso no WhatsApp do usuário (se a loja usa) e a IA em silêncio (salvo "IA continua depois da passagem").
const p = $('Preparar Transferência').first().json;
if (p.pular) return [{ json: { pular: true, status: p.status, resposta: p.resposta } }];
let r = {}; if (p.chamaRodizio) { try { r = $('Rodízio da Fila').first().json || {}; } catch (e) {} }
if (p.ver) {
  if (!r.ok) return [{ json: { pular: true, status: 200, resposta: { ok: false, erro: r.erro || 'Não deu para ver a fila agora.' } } }];
  return [{ json: { pular: true, status: 200, resposta: { ok: true, setor: p.setor.nome, proximo: r.proximo ? r.proximo.nome : null, como: r.como || 'vez', ordem: r.ordem || [] } } }];
}
let pessoa = null;
if (p.chamaRodizio) {
  if (!r.ok || !r.pessoa) return [{ json: { pular: true, status: 502, resposta: { ok: false, erro: r.erro || 'Não deu para escolher a pessoa do rodízio agora. Tente de novo.' } } }];
  pessoa = p.vendedores.find(v => v.id === Number(r.pessoa.id)) || null;
  if (!pessoa) return [{ json: { pular: true, status: 502, resposta: { ok: false, erro: 'A pessoa do rodízio não está mais marcada no painel.' } } }];
}
const x = p.__x || {}, ag = x._ag || {};
const s = (v) => String(v ?? '').trim();
const m = s(p.url).match(/^(https:\\/\\/[^?#]+)\\/api\\/external\\/([^/?#]+)\\/?\\?(?:.*&)?token=([^&#]+)/);
if (!m) return [{ json: { pular: true, status: 502, resposta: { ok: false, erro: 'A conexão da loja com a LeadVox não está completa.' } } }];
const base = m[1] + '/api/external/' + m[2], raiz = m[1].replace(/\\/v\\d+$/, ''), token = decodeURIComponent(m[3]);
const quem = s(p.vendedor) || 'um usuário';
const comoTxt = r.como === 'carteira' ? ' (já atendia este cliente)' : r.como === 'escolha' ? ' (escolhido no plugin)' : ' (rodízio do departamento)';
const col = (x.coleta || []).map(i => i.k + ': ' + i.v);
const nota = [
  '➡️ *Transferido pelo plugin* por ' + quem + ' para *' + p.setor.nome + '*',
  pessoa ? '👤 Para: *' + pessoa.nome + '*' + comoTxt : '👥 Para a fila do departamento (quem aceitar primeiro)',
  x.interesse ? '🚗 Interesse: ' + x.interesse.nome + (x.interesse.preco ? ' · R$ ' + Number(x.interesse.preco).toLocaleString('pt-BR') : '') : '',
  x.origem ? '📣 Origem: ' + x.origem.texto : '',
  col.length ? '📋 ' + col.join(' · ') : '',
  x.resumoIA ? '📝 ' + x.resumoIA : ''
].filter(Boolean).join('\\n').slice(0, 3500);
const reqs = [];
// 1) nota interna, já pedindo a troca de departamento e de pessoa
const notaCorpo = { number: p.telFull, onlyNote: true, externalKey: 'iag-transf-plugin', note: { body: nota }, queueId: String(p.setor.filaId), forceTicketToDepartment: true };
if (pessoa) { notaCorpo.userId = pessoa.id; notaCorpo.forceTicketToUser = true; }
reqs.push({ tipo: 'nota', method: 'POST', url: s(p.url), body: notaCorpo });
// 2) o ticket na tela da LeadVox (mesma rota da tela, aceita o token da conexão)
if (p.ticketId) reqs.push({ tipo: 'ticket', method: 'PUT', url: raiz + '/tickets/' + p.ticketId, body: Object.assign({ queueId: Number(p.setor.filaId), status: 'open' }, pessoa ? { userId: pessoa.id } : {}) });
// 3) a oportunidade aberta passa para quem recebeu o cliente
const op = x.oportunidade;
if (pessoa && op && op.id && Number(op.responsavelId) !== pessoa.id) {
  let o = null; try { const L = (y) => Array.isArray(y) ? y : (y && (y.data || y.opportunities || y.items || y.result)) || []; o = L($('Oportunidade').first().json).find(z => z && Number(z.id) === op.id) || null; } catch (e) {}
  if (o) reqs.push({ tipo: 'oportunidade', method: 'PUT', url: base + '/opportunities/' + o.id, body: {
    name: o.name, description: (s(o.description) + '\\n\\nTransferido pelo plugin (' + new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ') por ' + quem + ' para ' + pessoa.nome + '.').slice(0, 6000),
    value: Number(o.value) || 0, expectedCloseDate: s(o.expectedCloseDate).slice(0, 10) || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    contactId: Number(p.contactId) || o.contactId, responsibleId: pessoa.id, pipelineStepId: Number(o.pipelineStepId), userId: String(pessoa.id) } });
}
// 4) aviso no WhatsApp de quem recebeu (só se a loja liga o aviso e cadastrou o número)
if (pessoa && ag.avisoVendedor && pessoa.whatsapp.length >= 12) {
  const cli = s(p.cliente) || s((p.resumo || {}).nome) || 'Cliente';
  reqs.push({ tipo: 'aviso', method: 'POST', url: s(p.url), body: { number: pessoa.whatsapp, externalKey: 'iag-vendedor-plugin',
    body: ('🔔 *Cliente novo para você* (' + p.setor.nome + ', transferido por ' + quem + ')\\n👤 ' + cli + ' · ' + p.telFull + '\\n' +
      (x.interesse ? '🚗 ' + x.interesse.nome + '\\n' : '') + (col.length ? col.join(' · ') + '\\n' : '') + 'https://wa.me/' + p.telFull).slice(0, 1500) } });
}
const travar = !ag.iaContinua;
const ia = travar ? { estado: 'equipe', texto: 'Atendimento com ' + (pessoa ? pessoa.nome : 'a equipe do ' + p.setor.nome) + '. A IA fica em silêncio.' } : (p.ia || {});
return [{ json: { pular: false, reqs, travar, chaveHumano: 'iag_humano_' + p.cm, valorTrava: p.ticketId || '1', token, pessoa, setor: p.setor, como: r.como || '', ia } }];`;

const ITENS_TRANSF = `const m = $('Montar Transferência').first().json;
return (m.reqs || []).map(r => ({ json: { ...r, token: m.token } }));`;

const RESPOSTA_TRANSF = `// Confere o que a LeadVox aceitou. A troca vale se a nota (com a troca) ou o ticket foi aceito.
const m = $('Montar Transferência').first().json;
const feitos = $('Itens da Transferência').all().map(i => i.json);
const res = $input.all().map(i => i.json || {});
const ok = (i) => { const st = Number(res[i] && (res[i].statusCode || res[i].status)) || 0; return st >= 200 && st < 300; };
const de = (tipo) => feitos.findIndex(f => f.tipo === tipo);
const iN = de('nota'), iT = de('ticket'), iO = de('oportunidade');
const moveu = (iT >= 0 && ok(iT)) || (iN >= 0 && ok(iN));
if (!moveu) return [{ json: { status: 502, resposta: { ok: false, erro: 'A LeadVox não aceitou a transferência agora. Tente de novo em instantes.' } } }];
return [{ json: { status: 200, resposta: { ok: true, ia: m.ia,
  transferido: { setor: m.setor.nome, pessoa: m.pessoa ? m.pessoa.nome : '', como: m.como, oportunidade: iO >= 0 ? ok(iO) : null } } } }];`;

const PREPARAR_FECHAR = `// Botões Vendido / Perdido: a oportunidade aberta vai para Ganho ou Perdido (rota da tela) + nota interna.
const c = $('Contexto').first().json;
const x = c.__x || {}, op = x.oportunidade;
const s = (v) => String(v ?? '').trim();
if (!op || !op.id) return [{ json: { pular: true, status: 400, resposta: { ok: false, erro: 'Este cliente não tem oportunidade aberta no funil.' } } }];
if (!['won', 'lost'].includes(c.status)) return [{ json: { pular: true, status: 400, resposta: { ok: false, erro: 'Escolha Vendido ou Perdido.' } } }];
const m = s(c.url).match(/^(https:\\/\\/[^?#]+)\\/api\\/external\\/([^/?#]+)\\/?\\?(?:.*&)?token=([^&#]+)/);
if (!m) return [{ json: { pular: true, status: 502, resposta: { ok: false, erro: 'A conexão da loja com a LeadVox não está completa.' } } }];
const raiz = m[1].replace(/\\/v\\d+$/, ''), token = decodeURIComponent(m[3]);
const quem = s(c.vendedor) || 'um usuário';
const nota = (c.status === 'won' ? '✅ *Venda marcada* por ' : '❌ *Marcado como perdido* por ') + quem + ' (plugin). Oportunidade movida para ' + (c.status === 'won' ? 'Ganho.' : 'Perdido.');
const reqs = [
  { tipo: 'status', method: 'PUT', url: raiz + '/opportunity/' + op.id + '/status', body: { id: op.id, pipelineStepId: op.pipelineStepId, status: c.status } },
  { tipo: 'nota', method: 'POST', url: s(c.url), body: { number: c.telFull, onlyNote: true, externalKey: 'iag-fechar-plugin', note: { body: nota } } }
];
return reqs.map(r => ({ json: { ...r, token, pular: false, statusPedido: c.status } }));`;

const RESPOSTA_FECHAR = `const feitos = $('Preparar Fechamento').all().map(i => i.json);
if (feitos[0] && feitos[0].pular) return [{ json: { status: feitos[0].status, resposta: feitos[0].resposta } }];
const res = $input.all().map(i => i.json || {});
const st = Number(res[0] && (res[0].statusCode || res[0].status)) || 0;
if (!(st >= 200 && st < 300)) return [{ json: { status: 502, resposta: { ok: false, erro: 'A LeadVox não aceitou mudar a oportunidade. Se for "Perdido", ela pode pedir o motivo: mude pelo funil.' } } }];
return [{ json: { status: 200, resposta: { ok: true, fechado: feitos[0].statusPedido } } }];`;

function aplicarPluginTransferir(atendOrig, pluginOrig) {
  const atend = JSON.parse(JSON.stringify(atendOrig)), plugin = JSON.parse(JSON.stringify(pluginOrig));
  const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  const trocar = (wf, trocas) => { for (const [nome, lista] of Object.entries(trocas)) { const n = wf.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome);
    let c = n.parameters.jsCode; for (const [de, para] of lista) { const k = c.split(de).length - 1; if (k !== 1) throw new Error(nome + ': trecho achado ' + k + 'x: ' + de.slice(0, 60)); c = c.replace(de, () => para); } n.parameters.jsCode = c; } };
  const no = (wf, n) => { if (wf.nodes.some(x => x.name === n.name)) throw new Error('já existe o nó ' + n.name); wf.nodes.push({ id: uuid(), ...n }); };
  const liga = (wf, de, para, saida = 0) => { wf.connections[de] = wf.connections[de] || { main: [] }; const mm = wf.connections[de].main; while (mm.length <= saida) mm.push([]); mm[saida].push({ node: para, type: 'main', index: 0 }); };
  const pega = (wf, nome) => { const n = wf.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome); return n; };

  // ── Atendimento ──
  trocar(atend, TROCAS_ATEND);
  const conf = pega(plugin, 'Confere Plugin'), resp = pega(plugin, 'Responder');
  const ax = Math.max(...atend.nodes.map(n => n.position[0])), ay = Math.max(...atend.nodes.map(n => n.position[1])) + 400;
  no(atend, { name: 'Rodízio · Plugin', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, ay], webhookId: uuid(),
    parameters: { httpMethod: 'POST', path: 'iag-rodizio-plugin', responseMode: 'responseNode', options: {} } });
  no(atend, { name: 'Rodízio · Confere', type: conf.type, typeVersion: conf.typeVersion, position: [220, ay], credentials: conf.credentials,
    alwaysOutputData: true, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(conf.parameters)) });
  no(atend, { name: 'Rodízio · Escolher', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, ay], parameters: { jsCode: RODIZIO_PLUGIN } });
  no(atend, { name: 'Rodízio · Responder', type: resp.type, typeVersion: resp.typeVersion, position: [660, ay], parameters: JSON.parse(JSON.stringify(resp.parameters)) });
  liga(atend, 'Rodízio · Plugin', 'Rodízio · Confere'); liga(atend, 'Rodízio · Confere', 'Rodízio · Escolher'); liga(atend, 'Rodízio · Escolher', 'Rodízio · Responder');

  // ── Plugin ──
  trocar(plugin, TROCAS_PLUGIN);
  // agentes: traz também os departamentos e o aviso do usuário (config do painel)
  const ags = pega(plugin, 'Agentes da Conta'); const sel = ags.parameters.queryParameters.parameters.find(q => q.name === 'select');
  if (!sel || sel.value !== 'chave,nome,ativo,modoTeste:config->modoTeste') throw new Error('Agentes da Conta: select mudou');
  sel.value = 'chave,nome,ativo,modoTeste:config->modoTeste,setores:config->setores,vendAviso:config->avisos->vendedor';
  // origem do lead (rastreamento de anúncios), entre Etapas do Funil e Contexto
  const et = pega(plugin, 'Etapas do Funil'), ctx = pega(plugin, 'Contexto');
  const ce = plugin.connections['Etapas do Funil'].main[0]; if (ce.length !== 1 || ce[0].node !== 'Contexto') throw new Error('Etapas do Funil não liga só no Contexto');
  no(plugin, { name: 'Origem do Lead', type: conf.type, typeVersion: conf.typeVersion, position: [et.position[0] + 170, et.position[1] - 140], credentials: conf.credentials,
    alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://dcucemuewipfnneqpgxk.supabase.co/rest/v1/rpc/iag_plugin_origem',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ p_conta: String($('Validar').first().json.conta || ''), p_token: String((($('Plugin').first().json || {}).body || {}).t || ''), p_contato: Number($('Validar').first().json.contactId) || 0 }) }}",
      options: { timeout: 8000, response: { response: { neverError: true } } } } });
  plugin.connections['Etapas do Funil'].main[0] = [{ node: 'Origem do Lead', type: 'main', index: 0 }];
  liga(plugin, 'Origem do Lead', 'Contexto');
  // switch: fila, transferir, fechar (antes da saída "contexto")
  const sw = pega(plugin, 'Ação'); const regras = sw.parameters.rules.values; if (regras.length !== 8) throw new Error('Ação: eram 8 regras');
  const nova = (valor) => { const r = JSON.parse(JSON.stringify(regras[0])); const cc = r.conditions.conditions[0]; cc.rightValue = valor; cc.id = uuid(); if (r.outputKey) r.outputKey = valor; return r; };
  regras.push(nova('fila'), nova('transferir'), nova('fechar'));
  const sm = plugin.connections['Ação'].main; if (sm.length !== 9) throw new Error('Ação: eram 9 saídas');
  const http = pega(plugin, 'Enviar Nota');
  const chamar = (nome, pos) => ({ name: nome, type: http.type, typeVersion: http.typeVersion, position: pos, alwaysOutputData: true, onError: 'continueRegularOutput',
    parameters: { method: '={{ $json.method }}', url: '={{ $json.url }}', sendQuery: true, queryParameters: { parameters: [{ name: 'token', value: '={{ $json.token }}' }] },
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.token }}' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } } });
  const [sx, sy] = sw.position;
  no(plugin, { name: 'Preparar Transferência', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 300, sy + 700], parameters: { jsCode: PREPARAR_TRANSF } });
  no(plugin, { name: 'Rodízio da Fila', type: http.type, typeVersion: http.typeVersion, position: [sx + 520, sy + 700], alwaysOutputData: true, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: '={{ $json.chamaRodizio ? "https://n8n.leadvox.com.br/webhook/iag-rodizio-plugin" : "https://n8n.leadvox.com.br/webhook/iag-rodizio-plugin-nada" }}',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.chamaRodizio ? $json.rodizioJson : "{}" }}', options: { timeout: 10000, response: { response: { neverError: true } } } } });
  no(plugin, { name: 'Montar Transferência', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 740, sy + 700], parameters: { jsCode: MONTAR_TRANSF } });
  no(plugin, { name: 'Transferir?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [sx + 960, sy + 700],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: uuid(), leftValue: '={{ $json.pular }}', rightValue: false, operator: { type: 'boolean', operation: 'false', singleValue: true } }] }, options: {} } });
  no(plugin, { name: 'Itens da Transferência', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 1180, sy + 640], parameters: { jsCode: ITENS_TRANSF } });
  no(plugin, chamar('Chamar LeadVox (Transferência)', [sx + 1400, sy + 640]));
  no(plugin, { name: 'Resposta da Transferência', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 1620, sy + 640], parameters: { jsCode: RESPOSTA_TRANSF } });
  no(plugin, { name: 'Silenciar IA?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [sx + 1180, sy + 820],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: uuid(), leftValue: '={{ $json.travar }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } });
  const rt = pega(plugin, 'Redis Travar');
  no(plugin, { name: 'Redis Travar (Transferência)', type: rt.type, typeVersion: rt.typeVersion, position: [sx + 1400, sy + 820], credentials: rt.credentials,
    parameters: JSON.parse(JSON.stringify(rt.parameters)) });
  no(plugin, { name: 'Preparar Fechamento', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 300, sy + 1000], parameters: { jsCode: PREPARAR_FECHAR } });
  no(plugin, { name: 'Fechar?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [sx + 520, sy + 1000],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: uuid(), leftValue: '={{ $json.pular }}', rightValue: false, operator: { type: 'boolean', operation: 'false', singleValue: true } }] }, options: {} } });
  no(plugin, chamar('Chamar LeadVox (Fechamento)', [sx + 740, sy + 960]));
  no(plugin, { name: 'Resposta do Fechamento', type: 'n8n-nodes-base.code', typeVersion: 2, position: [sx + 960, sy + 960], parameters: { jsCode: RESPOSTA_FECHAR } });
  // saídas do switch: 0–7 como estavam; 8 fila, 9 transferir, 10 fechar; 11 = "contexto" (a antiga 8)
  plugin.connections['Ação'].main = sm.slice(0, 8).concat([[{ node: 'Preparar Transferência', type: 'main', index: 0 }], [{ node: 'Preparar Transferência', type: 'main', index: 0 }],
    [{ node: 'Preparar Fechamento', type: 'main', index: 0 }], sm[8]]);
  liga(plugin, 'Preparar Transferência', 'Rodízio da Fila'); liga(plugin, 'Rodízio da Fila', 'Montar Transferência'); liga(plugin, 'Montar Transferência', 'Transferir?');
  liga(plugin, 'Transferir?', 'Itens da Transferência', 0); liga(plugin, 'Transferir?', 'Silenciar IA?', 0); liga(plugin, 'Transferir?', 'Responder', 1);
  liga(plugin, 'Itens da Transferência', 'Chamar LeadVox (Transferência)'); liga(plugin, 'Chamar LeadVox (Transferência)', 'Resposta da Transferência'); liga(plugin, 'Resposta da Transferência', 'Responder');
  liga(plugin, 'Silenciar IA?', 'Redis Travar (Transferência)', 0);
  liga(plugin, 'Preparar Fechamento', 'Fechar?'); liga(plugin, 'Fechar?', 'Chamar LeadVox (Fechamento)', 0); liga(plugin, 'Fechar?', 'Resposta do Fechamento', 1);
  liga(plugin, 'Chamar LeadVox (Fechamento)', 'Resposta do Fechamento'); liga(plugin, 'Resposta do Fechamento', 'Responder');
  return { atend, plugin };
}
if (typeof module !== 'undefined') module.exports = { aplicarPluginTransferir, RODIZIO_PLUGIN, PREPARAR_TRANSF, MONTAR_TRANSF, RESPOSTA_TRANSF, PREPARAR_FECHAR, RESPOSTA_FECHAR, ITENS_TRANSF, TROCAS_ATEND, TROCAS_PLUGIN };
