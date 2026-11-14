// LeadVox IA — origem do lead automática para quem chega por anúncio (13/11/2026).
// O Sentinela repassa a mensagem inteira da LeadVox ao Atendimento (dkipBj6hAhdu7OSp); quando o cliente clicou num
// anúncio de clique para WhatsApp, a mensagem traz o "referral" (ou o externalAdReply). A Entrada passa a ler isso e o
// Ler Resposta marca a origem escolhida no painel (Ações e regras → "Origem de quem chega por anúncio", config.crm.origemAnuncio)
// uma vez por contato. O AÇÕES Montar já grava a origem no campo de origem do CRM (PUT {raiz}/contact-lead-origin/{contato}).
// Regra de origem do próprio cliente vale mais. Uma origem só para todo anúncio (Instagram e Facebook vêm da Meta).
// Uso no console do n8n: aplicarOrigemAnuncio(atendimento) → cópia trocada (falha se o fluxo mudou ou já foi aplicado).

const LER_ANUNCIO = `// LeadVox IA — anúncio de clique para WhatsApp (mesma leitura do rastreamento): referral ou externalAdReply
const __procurarAd = (o, chave, n) => { if (!o || typeof o !== 'object' || n < 0) return null; if (o[chave] && typeof o[chave] === 'object') return o[chave];
  for (const v of Object.values(o)) { const r = __procurarAd(v, chave, n - 1); if (r) return r; } return null; };
const __lerAnuncio = (m) => { if (!m || typeof m !== 'object') return null;
  const r = (m.raw && m.raw.referral) || m.referral;
  if (r && typeof r === 'object' && (r.source_id || r.ctwa_clid)) return { id: String(r.source_id || '').replace(/\\D/g, '').slice(0, 30), titulo: String(r.headline || '').slice(0, 120) };
  const e = __procurarAd(m.raw, 'externalAdReply', 7);
  if (e && (e.sourceId || e.ctwaClid)) return { id: String(e.sourceId || '').replace(/\\D/g, '').slice(0, 30), titulo: String(e.title || '').slice(0, 120) };
  return null; };
`;

const MARCAR_ORIGEM = `// LeadVox IA — veio de anúncio: marca a origem escolhida no painel (uma vez por contato; regra de origem vale mais)
let __origemAnuncioAgora = false;
try {
  const __ad = $('Entrada').first().json.anuncio, __oa = (c.crm || {}).origemAnuncio || {};
  if (!acoesIA.origem && __ad && Number(__oa.id) > 0 && !estado.origemAnuncio) { acoesIA.origem = { id: Number(__oa.id), nome: String(__oa.nome || 'Anúncio').slice(0, 60) }; __origemAnuncioAgora = true; }
} catch (e) {}
`;

const TROCAS = {
  Entrada: [
    ["let sessao = null; let contactId = null;", "let anuncio = null; let sessao = null; let contactId = null;"],
    ["if (b.passagem && typeof b.passagem === 'object') {", LER_ANUNCIO + "if (b.passagem && typeof b.passagem === 'object') {"],
    ["  const contato = msg.contact || ticket.contact || b.contact || {};", "  const contato = msg.contact || ticket.contact || b.contact || {};\n  anuncio = __lerAnuncio(msg);"],
    ["  conta, origem, tel, telNorm, chaveMem, chaveDup, contactId,", "  conta, origem, tel, telNorm, chaveMem, chaveDup, contactId, anuncio,"]
  ],
  'Ler Resposta': [
    ["acoesIA.notas = __acRg.some(a => a.cod === 'NOTA') ? tNotaRg.map(s).filter(Boolean).slice(0, 3) : [];", MARCAR_ORIGEM + "acoesIA.notas = __acRg.some(a => a.cod === 'NOTA') ? tNotaRg.map(s).filter(Boolean).slice(0, 3) : [];"],
    ["if (acoesIA && acoesIA.origem && acoesIA.origem.nome) estado.origem = String(acoesIA.origem.nome).slice(0, 60);",
     "if (acoesIA && acoesIA.origem && acoesIA.origem.nome) estado.origem = String(acoesIA.origem.nome).slice(0, 60);\nif (__origemAnuncioAgora) estado.origemAnuncio = true;"]
  ]
};

function aplicarOrigemAnuncio(atendimentoOrig) {
  const w = JSON.parse(JSON.stringify(atendimentoOrig));
  for (const [nome, trocas] of Object.entries(TROCAS)) {
    const n = w.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome);
    let code = n.parameters.jsCode;
    if (code.includes('__lerAnuncio') || code.includes('__origemAnuncioAgora')) throw new Error('já aplicado em ' + nome);
    for (const [de, para] of trocas) {
      if (code.split(de).length !== 2) throw new Error(nome + ': trecho mudou → ' + de.slice(0, 60));
      code = code.replace(de, () => para);
    }
    n.parameters.jsCode = code;
  }
  return w;
}
if (typeof module !== 'undefined') module.exports = { aplicarOrigemAnuncio, LER_ANUNCIO, MARCAR_ORIGEM, TROCAS };
