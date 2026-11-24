// Motor IA — passar para a equipe no fim do follow-up inicial (24/11/2026).
// Painel → Comportamento → Follow-up → "Passar para a equipe se o cliente não responder" (desligado por padrão).
// Vale SÓ para os toques do follow-up inicial (até 3, ex.: 1 h / 4 h / 24 h). O follow-up do fechamento (5/7/15/30 dias) não muda.
// Como funciona:
//  1. Atendimento · Fila de Envio: depois de cada resposta da IA (sem transferência), deixa pronto um pedido de "fim do follow-up"
//     assinado com o segredo da conta (o mesmo da passagem entre agentes) — o fluxo de Follow-up não precisa saber o segredo.
//  2. Atendimento · Avisos Preparar: guarda esse pedido na ficha do follow-up (iag_fu_*), com a espera escolhida no painel.
//  3. Follow-up · Planejar: o último toque saiu, passou a espera, o cliente não respondeu, a equipe não assumiu, ticket aberto e
//     dentro da janela → chama o motor com o pedido (uma vez só).
//  4. Atendimento · Entrada aceita o pedido como uma passagem interna (assinatura conferida); o Guardião manda encerrar com o motivo
//     "cliente não respondeu ao follow-up"; o Encerrar manda a mensagem de passagem e transfere para o departamento padrão
//     (ou para o grupo de lojas) com o rodízio, a carteira, a nota interna e os avisos de sempre. A etiqueta escolhida no painel vai junto.
//  5. Etiquetas · ETQ Calcular: aceita a etiqueta que veio do Guardião (o caminho do encerramento não passa pelo Ler Resposta).
// Cada "de" tem de existir uma única vez; se o fluxo mudar, nada é salvo.
// Uso no console do n8n: const r = aplicarFollowupTransferir({ atend, fu, etq }) → { atend, fu, etq } trocados (cópias).

const TROCAS_ATEND = {
 'Entrada': [
  ["} else if (b.message || b.msg || (b.data && b.data.message)) {",
   "} else if (b.fimFollowup && typeof b.fimFollowup === 'object') {\n" +
   "  // ── 4. fim do follow-up inicial (fluxo Follow-up): pedido assinado pela própria Fila de Envio desta conta ──\n" +
   "  origem = 'passagem';\n" +
   "  tel = txt(b.sessionId, 30).replace(/\\D/g, '');\n" +
   "  ticketId = txt(b.ticketId, 30);\n" +
   "  departamento = inteiro(b.Departamento);\n" +
   "  nomeContato = limpo(b.nomeContato, 40);\n" +
   "  const n = Number(b.fimFollowup.n) || 0;\n" +
   "  if (!n || n > Date.now() + 60000 || Date.now() - n > 10 * 864e5) return [];   // pedido velho demais: ignora\n" +
   "  if (b.assinatura !== hmac(SEGREDO, ['fimfu', conta, tel, ticketId, departamento, n].join('|'))) return [];\n" +
   "  passagem = { de: 'follow-up', deTipo: 'followup_fim', setor: '', resumo: '', dados: {}, assinatura: String(b.assinatura) };\n" +
   "} else if (b.message || b.msg || (b.data && b.data.message)) {"]
 ],
 'Guardião': [
  ["if (t.origem === 'passagem') {\n  if (estado.chamadas >= 60)",
   "// LeadVox IA — fim do follow-up inicial: o cliente não respondeu aos toques → passa para a equipe (painel → Follow-up)\n" +
   "let __pgFim = null; try { __pgFim = $('Entrada').first().json.passagem; } catch (e) {}\n" +
   "if (t.origem === 'passagem' && __pgFim && __pgFim.deTipo === 'followup_fim') {\n" +
   "  const __fuF = (A.cfg || {}).followup || {};\n" +
   "  if (__fuF.transferirNoFim !== true) return sai('silencio', { motivo: 'passagem no fim do follow-up desligada no painel' });\n" +
   "  const __etqF = String(__fuF.etiquetaFim || '').trim().slice(0, 60);\n" +
   "  return sai('encerrar', { motivo: 'cliente não respondeu ao follow-up', fimFollowup: true, etiquetasIA: __etqF ? [__etqF] : [] });\n" +
   "}\n" +
   "if (t.origem === 'passagem') {\n  if (estado.chamadas >= 60)"]
 ],
 'Encerrar': [
  ["const padrao = (g.A.cfg.setores || []).find(s => s && s.padrao) || (g.A.cfg.setores || [])[0] || null;\n",
   "const padrao = (g.A.cfg.setores || []).find(s => s && s.padrao) || (g.A.cfg.setores || [])[0] || null;\n" +
   "// LeadVox IA — fim do follow-up inicial: uma mensagem curta de passagem e o cliente vai para a equipe (rodízio de sempre)\n" +
   "if (g.fimFollowup) {\n" +
   "  const fu = (g.A.cfg || {}).followup || {}, est = g.estado || {};\n" +
   "  const pn = String(est.nome || '').trim().split(/\\s+/)[0] || '';\n" +
   "  let txt = String(fu.mensagemFim || '').trim();\n" +
   "  txt = txt ? txt.replace(/,?\\s*\\{nome\\}/gi, m => (pn ? (m.startsWith(',') ? ', ' : ' ') + pn : '')).trim()\n" +
   "    : 'Oi' + (pn ? ', ' + pn : '') + '! Vou deixar o seu atendimento com a nossa equipe de vendas: um consultor vai te chamar por aqui 😉';\n" +
   "  return [{ json: { ...g, origemAcao: 'followup_fim', textos: [txt.slice(0, 600)], fotos: [], materiais: [], pedido: null, fecharPedido: false, nome: '',\n" +
   "    transf: { setor: padrao ? padrao.nome : 'Equipe', forcarHumano: true, motivo: 'cliente não respondeu ao follow-up',\n" +
   "      resumo: 'O cliente parou de responder e não voltou depois dos follow-ups da IA.' + (est.resumoIA ? ' ' + String(est.resumoIA).slice(0, 600) : ''), dados: {} } } }];\n" +
   "}\n"]
 ],
 'Fila de Envio': [
  ["let passagemJson = '';",
   "// LeadVox IA — fim do follow-up inicial: pedido assinado para o fluxo de Follow-up chamar o motor se o cliente sumir\n" +
   "let __fimFu = null;\n" +
   "if (!r.transf && r.origemAcao === 'ia' && (c.followup || {}).transferirNoFim === true) {\n" +
   "  let __dep = null; try { __dep = $('Entrada').first().json.departamento; } catch (e) {}\n" +
   "  const __n = Date.now();\n" +
   "  __fimFu = { k: r.conta, sessionId: r.tel, chatInput: '', Departamento: __dep ?? null, ticketId: s(r.ticketId), nomeContato: r.nomeContato || '', fimFollowup: { n: __n } };\n" +
   "  __fimFu.assinatura = hmac(r.SEGREDO, ['fimfu', r.conta, r.tel, s(r.ticketId), __dep ?? null, __n].join('|'));\n" +
   "}\n" +
   "let passagemJson = '';"],
  ["  estadoJson: JSON.stringify(estado)\n} }];",
   "  fimFu: __fimFu,\n  estadoJson: JSON.stringify(estado)\n} }];"]
 ],
 'Avisos Preparar': [
  ["  if (slaOn) ficha.vendedorSla = { ...__tv, desde: Date.now(), horario: cfg.horario || null, feita: false };",
   "  if (slaOn) ficha.vendedorSla = { ...__tv, desde: Date.now(), horario: cfg.horario || null, feita: false };\n" +
   "  // LeadVox IA — fim do follow-up inicial: o pedido assinado pela Fila de Envio fica na ficha (o Follow-up só repassa)\n" +
   "  let __fe = {}; try { __fe = $('Fila de Envio').first().json || {}; } catch (e) {}\n" +
   "  if (fuOn && fu.transferirNoFim === true && __fe.fimFu && __fe.urlMotor)\n" +
   "    ficha.fim = { espera: Math.min(1440, Math.max(15, Number(fu.esperaFimMin) || 120)), url: __fe.urlMotor, corpo: __fe.fimFu, ultimoToque: 0, feito: '' };"],
  ["  const maxMin = Math.max(fuOn ? toques[toques.length - 1].min : 0,",
   "  const maxMin = Math.max(fuOn ? toques[toques.length - 1].min + (ficha.fim ? ficha.fim.espera : 0) : 0,"]
 ]
};

// bloco novo do Planejar (testado sozinho em tests/followup-transferir.test.mjs)
const PLANEJAR_FIM = `  // ── A2) fim do follow-up inicial: passa para a equipe (painel → Follow-up → "Passar para a equipe") ──
  if (f.fim && !f.fim.feito && f.toques.length && f.toques.every((_, i) => feitos.has(i))) {
    const ultT = Number(f.fim.ultimoToque) || 0;
    const encF = travado ? 'entregue à equipe' : f.transferido ? 'transferido' : Number(cli.ts) > f.base + 5000 ? 'cliente respondeu' : tk === 'closed' ? 'ticket finalizado' : !ultT ? 'o último toque não saiu' : '';
    if (encF) { f.fim.feito = encF; mudou = true; log('passagem do fim: ' + encF); }
    else if (agora - ultT >= (Number(f.fim.espera) || 120) * 60e3) {
      if (falando) log('passagem do fim: equipe falando, espera');
      else if (!naJanela) log('passagem do fim: fora da janela, espera');
      else if (waba && agora - ultCli > 23.5 * 3600e3) { f.fim.feito = 'oficial passou de 24 h'; mudou = true; log('passagem do fim: WhatsApp oficial passou de 24 h'); }
      else if (!/^https:\\/\\/\\S+/.test(String(f.fim.url || '')) || !f.fim.corpo) { f.fim.feito = 'sem endereço do motor'; mudou = true; log('passagem do fim: sem endereço do motor'); }
      else { f.fim.feito = String(agora); mudou = true; fins.push({ url: f.fim.url, corpoJson: JSON.stringify(f.fim.corpo) }); log('passou para a equipe: não respondeu ao follow-up'); }
    }
  }

`;

const TROCAS_FU = {
 'Planejar': [
  ["const envios = [], gravar = [], resumo = [];", "const envios = [], gravar = [], resumo = [], fins = [];"],
  ["          vencidos.forEach(v => feitos.add(v.i)); mudou = true; mandou = true;",
   "          vencidos.forEach(v => feitos.add(v.i)); mudou = true; mandou = true;\n          if (f.fim && t.i === f.toques.length - 1) f.fim.ultimoToque = agora;"],
  ["  // Regra global: a IA nunca troca um humano por outro", PLANEJAR_FIM + "  // Regra global: a IA nunca troca um humano por outro"],
  ["    const restaRet = f.retomada && !f.retFeito;",
   "    const restaRet = f.retomada && !f.retFeito;\n    const restaFim = !!(f.fim && !f.fim.feito);"],
  ["    const fimMs = Math.max(",
   "    const fimMs = Math.max(restaFim ? (Number(f.fim.ultimoToque) || f.base + f.toques[f.toques.length - 1].min * 60e3) + (Number(f.fim.espera) || 120) * 60e3 : 0, "],
  ["ttl: (restaToque || restaRet) ?", "ttl: (restaToque || restaRet || restaFim) ?"],
  ["return [{ json: { envios, gravar, notas, resumo, total: envios.length } }];",
   "return [{ json: { envios, gravar, notas, resumo, fins, total: envios.length } }];"]
 ]
};

const TROCAS_ETQ = {
 'ETQ Calcular': [
  ["try { pedidas = $('Ler Resposta').first().json.etiquetasIA || []; } catch (e) {}",
   "try { pedidas = $('Ler Resposta').first().json.etiquetasIA || []; } catch (e) {}\n" +
   "// LeadVox IA — encerramento pelo Guardião (ex.: fim do follow-up): a etiqueta vem dele\n" +
   "if (!pedidas.length && Array.isArray(g.etiquetasIA)) pedidas = g.etiquetasIA.map(x => String(x || '').trim()).filter(Boolean).slice(0, 3);"]
 ]
};

function aplicarFollowupTransferir({ atend: a0, fu: f0, etq: e0 }) {
  const atend = JSON.parse(JSON.stringify(a0)), fu = JSON.parse(JSON.stringify(f0)), etq = JSON.parse(JSON.stringify(e0));
  const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  const pega = (wf, nome) => { const n = wf.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome); return n; };
  const trocar = (wf, trocas) => { for (const [nome, lista] of Object.entries(trocas)) { const n = pega(wf, nome);
    let c = n.parameters.jsCode; for (const [de, para] of lista) { const k = c.split(de).length - 1; if (k !== 1) throw new Error(nome + ': trecho achado ' + k + 'x: ' + de.slice(0, 60)); c = c.replace(de, () => para); } n.parameters.jsCode = c; } };
  trocar(atend, TROCAS_ATEND); trocar(fu, TROCAS_FU); trocar(etq, TROCAS_ETQ);
  // Follow-up: Planejar → Separar Fins → Chamar Motor (Fim)
  if (fu.nodes.some(x => x.name === 'Separar Fins')) throw new Error('já existe o nó Separar Fins');
  const sep = pega(fu, 'Separar Envios'), env = pega(fu, 'Enviar LeadVox'), [px, py] = pega(fu, 'Planejar').position;
  fu.nodes.push({ id: uuid(), name: 'Separar Fins', type: sep.type, typeVersion: sep.typeVersion, position: [px + 240, py + 520], parameters: { fieldToSplitOut: 'fins', options: {} } });
  fu.nodes.push({ id: uuid(), name: 'Chamar Motor (Fim)', type: env.type, typeVersion: env.typeVersion, position: [px + 480, py + 520], alwaysOutputData: false, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: '={{ $json.url }}', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpoJson }}',
      options: { batching: { batch: { batchSize: 1, batchInterval: 1500 } }, response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } } });
  const sai = fu.connections['Planejar'].main[0]; sai.push({ node: 'Separar Fins', type: 'main', index: 0 });
  fu.connections['Separar Fins'] = { main: [[{ node: 'Chamar Motor (Fim)', type: 'main', index: 0 }]] };
  return { atend, fu, etq };
}
if (typeof module !== 'undefined') module.exports = { aplicarFollowupTransferir, TROCAS_ATEND, TROCAS_FU, TROCAS_ETQ, PLANEJAR_FIM };
