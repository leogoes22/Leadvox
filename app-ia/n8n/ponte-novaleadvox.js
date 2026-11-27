// Ponte nova LeadVox (Z-PRO) ↔ Motor IA — 25/11/2026.
// O Motor foi feito para o CRM antigo (ChatFlow que chama o webhook e API de envio que também muda fila e vendedor).
// A nova LeadVox manda outro aviso e tem outras chamadas. Esta ponte fica no meio e traduz, sem mexer no Motor:
//   ENTRADA  nova LeadVox (canal → "URL do N8N", aviso `message_n8n`)  →  formato ChatFlow que o Motor já lê
//   SAÍDA    corpo de envio do Motor (number/body/mediaUrl/queueId/userId/onlyNote)  →  chamadas da API externa v2
// Tudo aqui são funções puras: o fluxo do n8n só junta os pedaços (Code → HTTP) e os testes rodam sem rede.
// Formatos conferidos com avisos reais da Loja Teste em 25/11/2026 (ver memória nova-leadvox-api-motor).

const s = (v) => String(v ?? '').trim();
const digitos = (v) => s(v).replace(/\D/g, '');
const inteiro = (v) => { const n = parseInt(digitos(v), 10); return Number.isFinite(n) && n > 0 ? n : null; };

// tipo do arquivo pelo começo do base64 (o aviso não traz o mime): vale para áudio de voz, foto e PDF do WhatsApp
function extensaoPorConteudo(base64, tipo) {
  const b = s(base64).slice(0, 12);
  if (b.startsWith('T2dnU')) return 'ogg';            // "OggS": nota de voz (opus)
  if (b.startsWith('/9j/')) return 'jpg';
  if (b.startsWith('iVBOR')) return 'png';
  if (b.startsWith('JVBER')) return 'pdf';
  if (b.startsWith('UklGR')) return tipo === 'imageMessage' ? 'webp' : 'wav';
  if (b.startsWith('SUQz') || b.startsWith('//uQ') || b.startsWith('//sw') || b.startsWith('//tA')) return 'mp3';
  if (b.startsWith('UEsDB')) return 'zip';
  if (/^[A-Za-z0-9+/]{4}ZnR5c/.test(b) || b.slice(4, 9) === 'ZnR5c') return tipo === 'audioMessage' ? 'm4a' : 'mp4';
  return { audioMessage: 'ogg', imageMessage: 'jpg', videoMessage: 'mp4', documentMessage: 'pdf' }[tipo] || 'bin';
}

const TIPOS_TEXTO = ['conversation', 'extendedTextMessage'];
const TIPOS_MIDIA = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage'];

// ENTRADA — body: o que a nova LeadVox manda para a "URL do N8N" do canal.
// opcoes.mediaBase: endereço público onde a ponte serve o arquivo (…/webhook/nl-midia/); opcoes.novoId: id curto da mídia.
// Devolve { ignorar: motivo } ou { motor, midia, ticket }.
function entrada(body, opcoes = {}) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.type !== 'message_n8n') return { ignorar: b.method === 'message' ? 'duplicado' : 'outro_evento' };
  const c = b.content || {}, t = b.ticket || {}, ct = b.contact || {};
  if (t.fromMe === true || t.fromMe === 'true') return { ignorar: 'mensagem_da_equipe' };
  if (t.isGroup === true || t.isGroup === 'true') return { ignorar: 'grupo' };
  const tel = digitos(ct.number);
  if (tel.length < 10) return { ignorar: 'sem_telefone' };
  const tipo = s(c.type);
  let chatInput = '', midia = null;
  if (TIPOS_MIDIA.includes(tipo)) {
    const base64 = s(c.media);
    if (!base64 || base64 === 'false') return { ignorar: 'midia_sem_arquivo' };
    const ext = extensaoPorConteudo(base64, tipo);
    const id = s(opcoes.novoId) || Math.random().toString(36).slice(2, 12);
    midia = { id, ext, tipo, base64 };
    chatInput = s(opcoes.mediaBase) + id + '.' + ext;
  } else if (TIPOS_TEXTO.includes(tipo) || !tipo) {
    chatInput = s(c.text).slice(0, 4000);
  } else {
    return { ignorar: 'tipo_nao_tratado' };
  }
  if (!chatInput) return { ignorar: 'vazio' };
  const motor = {
    chatInput, sessionId: tel,
    Departamento: inteiro(t.queueId) || '',
    ticketId: s(t.id), nomeContato: s(ct.name).slice(0, 40),
    Id_usuario: s(t.userId),
    contactId: inteiro(ct.id) || '',                   // o Motor só mexe no funil (oportunidade/etapa) sabendo o contato
  };
  return { motor, midia, ticket: { id: s(t.id), queueId: inteiro(t.queueId), userId: inteiro(t.userId), contactId: inteiro(ct.id), tel } };
}

// SAÍDA — corpo: o que o Motor mandaria para o CRM antigo. ctx: { ticketId } (a ponte guarda o ticket do cliente na entrada).
// Devolve a lista de chamadas à API externa v2 ({metodo, rota, corpo}); rota é relativa a /v2/api/external/{apiId}.
function saida(corpo, ctx = {}) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const numero = s(c.number);
  if (!numero) return { erro: 'sem_numero', chamadas: [] };
  const ticketId = inteiro(ctx.ticketId);
  const chamadas = [];
  // nota interna do Motor ({onlyNote:true, note:{body}}) → nota de verdade no ticket
  if (c.onlyNote) {
    const texto = s(c.note && c.note.body);
    if (!texto) return { erro: 'nota_vazia', chamadas: [] };
    if (!ticketId) return { erro: 'sem_ticket', chamadas: [] };
    return { chamadas: [{ metodo: 'POST', rota: '/createNotes', corpo: { notes: texto, ticketId } }] };
  }
  // externalKey do Motor NÃO vai para a nova LeadVox: ela usa a chave para descartar repetidas ("idempotent, skipped")
  // e o Motor manda a mesma chave (ex.: iag-sdr-0) em toda resposta, então só a primeira saía (26/11/2026).
  const chave = '';
  if (/@g\.us$/i.test(numero)) {                       // aviso no grupo do WhatsApp
    chamadas.push({ metodo: 'POST', rota: c.mediaUrl ? '/groupMediaUrl' : '/group',
      corpo: { number: numero, body: s(c.body) || (c.mediaUrl ? String.fromCharCode(8203) : ''), ...(c.mediaUrl ? { mediaUrl: s(c.mediaUrl) } : {}), ...(chave ? { externalKey: chave } : {}) } });
    return { chamadas };
  }
  // foto sem legenda (2ª foto em diante do Motor): a nova LeadVox recusa body vazio ("body is a required field").
  // Vai um espaço invisível (zero-width) para a foto sair sem texto (26/11/2026).
  const legenda = s(c.body) || (c.mediaUrl ? String.fromCharCode(8203) : '');
  const base = { number: numero, body: legenda, ...(chave ? { externalKey: chave } : {}), validateNumber: false };
  chamadas.push(c.mediaUrl
    ? { metodo: 'POST', rota: '/url', corpo: { ...base, mediaUrl: s(c.mediaUrl) } }
    : { metodo: 'POST', rota: '/', corpo: base });
  // a transferência: no CRM antigo ia junto da mensagem; aqui é uma chamada à parte, depois do envio
  const filaId = inteiro(c.queueId), userId = inteiro(c.userId);
  if ((filaId && c.forceTicketToDepartment) || (userId && c.forceTicketToUser)) {
    if (!ticketId) return { erro: 'sem_ticket', chamadas };
    chamadas.push({ metodo: 'POST', rota: '/updateticketinfo', transfere: true,
      corpo: { ticketId, ...(filaId && c.forceTicketToDepartment ? { queueId: filaId } : {}), ...(userId && c.forceTicketToUser ? { userId } : {}), n8nStatus: 'disabled' } });
  }
  return { chamadas };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM — funil e etiquetas (26/11/2026). O Motor mexe no card e nas etiquetas pelas rotas do CRM antigo, montadas a partir
// do mesmo endereço de envio (…/nl-saida/v1/api/external/<apiId>/?token=…). A ponte recebe essas rotas e responde no
// formato antigo, chamando a API v2 da nova LeadVox:
//   GET   /v1/api/external/:apiId/opportunities?contactId&status   → listOpportunities (filtra o contato aqui)
//   POST  /v1/api/external/:apiId/opportunities                    → createOpportunity (pelo número do contato)
//   PUT   /v1/api/external/:apiId/opportunities/:id                → updateOpportunity (etapa, responsável, valor, descrição)
//   PUT   /opportunity/:id/status                                  → updateOpportunity status win/lose
//   GET   /v1/contacts/number/:numero                              → showcontact (com as etiquetas)
//   GET   /v1/api/external/:apiId/tags · POST (criar)              → listTags · createTag
//   GET   /v1/api/external/users/:apiId                            → listUsers
//   PATCH /v1/contacts/:id {tags:[nomes]}                          → addTagContact / removeTagContact (só a diferença)
// Etapa = stageId da nova LeadVox (o painel já lista as etapas com esses ids); o funil (pipelineId) vem da lista de etapas.
// chamar(metodo, rota, corpo, apiId) → Promise<{status, body}>; mem guarda número do contato e o apiId de cada token.

const STATUS_NOVO = { won: 'win', lost: 'lose', open: 'open', win: 'win', lose: 'lose' };
const STATUS_VELHO = { win: 'won', lose: 'lost', won: 'won', lost: 'lost', open: 'open' };

// primeira lista dentro da resposta (a v2 embrulha em data / opportunities / tags / users …)
function lista(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const k of ['data', 'opportunities', 'tags', 'users', 'rows', 'records', 'items', 'stages', 'contacts']) {
    if (Array.isArray(body[k])) return body[k];
    if (body[k] && typeof body[k] === 'object') { const l = lista(body[k]); if (l.length) return l; }
  }
  for (const v of Object.values(body)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  return [];
}
const objeto = (body, ...ks) => { if (!body || typeof body !== 'object') return null; for (const k of ks) if (body[k] && typeof body[k] === 'object' && !Array.isArray(body[k])) return body[k]; return body; };
const nomeTag = (t) => typeof t === 'string' ? t : (t && typeof t.tag === 'object' && t.tag ? (t.tag.tag || t.tag.name) : (t && (t.tag || t.name))) || '';
const idTag = (t) => inteiro(t && typeof t.tag === 'object' && t.tag ? t.tag.id : (t && (t.tagId ?? t.id)));
const normaliza = (t) => s(t).normalize('NFC').toLowerCase();
function hashToken(token) { let h = 5381; for (const ch of s(token)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return 't' + h.toString(36); }

// oportunidade da v2 → formato do CRM antigo que o Motor lê
function oportunidadeVelha(o) {
  const stage = inteiro(o.stageId ?? (o.stage && o.stage.id) ?? o.pipelineStepId);
  const resp = inteiro(o.responsibleId ?? (o.responsible && o.responsible.id) ?? o.userId);
  return { id: inteiro(o.id), name: s(o.name), description: s(o.description), value: Number(o.value) || 0,
    expectedCloseDate: s(o.closingForecast || o.expectedCloseDate).slice(0, 10), contactId: inteiro(o.contactId ?? (o.contact && o.contact.id)),
    pipelineStepId: stage, pipelineId: inteiro(o.pipelineId ?? (o.stage && o.stage.pipelineId)), responsibleId: resp, userId: resp,
    status: STATUS_VELHO[s(o.status).toLowerCase()] || 'open' };
}

// qual rota do CRM antigo é (caminho = o que vem depois de /nl-saida)
function rotaCrm(metodo, caminho) {
  const p = s(caminho).replace(/[?#].*$/, '').replace(/\/+$/, '');
  const M = s(metodo).toUpperCase();
  let m;
  if ((m = p.match(/^\/v\d+\/api\/external\/([A-Za-z0-9_-]+)\/opportunities$/)) && (M === 'GET' || M === 'POST')) return { r: M === 'GET' ? 'opps' : 'oppCriar', apiId: m[1] };
  if ((m = p.match(/^\/v\d+\/api\/external\/([A-Za-z0-9_-]+)\/opportunities\/(\d+)$/)) && M === 'PUT') return { r: 'oppMudar', apiId: m[1], id: +m[2] };
  if ((m = p.match(/^\/opportunity\/(\d+)\/status$/)) && M === 'PUT') return { r: 'oppStatus', id: +m[1] };
  if ((m = p.match(/^\/v\d+\/contacts\/number\/(\d{8,20})$/)) && M === 'GET') return { r: 'contato', numero: m[1] };
  if ((m = p.match(/^\/v\d+\/api\/external\/([A-Za-z0-9_-]+)\/tags$/)) && (M === 'GET' || M === 'POST')) return { r: M === 'GET' ? 'tags' : 'tagsCriar', apiId: m[1] };
  if ((m = p.match(/^\/v\d+\/api\/external\/users\/([A-Za-z0-9_-]+)$/)) && M === 'GET') return { r: 'usuarios', apiId: m[1] };
  if ((m = p.match(/^\/v\d+\/contacts\/(\d+)$/)) && (M === 'PATCH' || M === 'PUT')) return { r: 'contatoTags', id: +m[1] };
  if ((m = p.match(/^\/contact-lead-(origin|status)\/(\d+)$/)) && M === 'PUT') return { r: 'ignorar' };
  if (/^\/lead-(origin|status)$/.test(p) && M === 'GET') return { r: 'listaVazia' };
  return { r: '' };
}

async function crm(req, chamar, mem = {}) {
  const rota = rotaCrm(req.metodo, req.caminho);
  const q = req.query || {}, b = req.corpo && typeof req.corpo === 'object' ? req.corpo : {};
  mem.contatos = mem.contatos || {}; mem.apis = mem.apis || {};
  const token = s(req.token).replace(/^Bearer\s+/i, '');
  if (token.length < 10) return { status: 401, body: { error: 'token' } };
  const hk = hashToken(token);
  if (rota.apiId) mem.apis[hk] = rota.apiId;
  const apiId = rota.apiId || mem.apis[hk];
  if (!rota.r) return { status: 404, body: { error: 'rota_nao_traduzida' } };
  if (rota.r === 'ignorar') return { status: 200, body: { ok: true, ignorado: true } };
  if (rota.r === 'listaVazia') return { status: 200, body: [] };
  if (!apiId) return { status: 409, body: { error: 'api_desconhecida' } };
  const api = (metodo, r, corpo) => chamar(metodo, r, corpo, apiId);
  const ok = (r) => r && r.status >= 200 && r.status < 300;
  const falha = (r, o) => ({ status: r && r.status >= 400 ? r.status : 502, body: { error: o, detalhe: r && r.body } });

  // funil da etapa (a v2 pede pipelineId junto com stageId)
  const funilDaEtapa = async (stageId) => {
    const r = await api('GET', '/stage/list');
    const e = lista(r && r.body).find(x => inteiro(x.id) === inteiro(stageId));
    return e ? inteiro(e.pipelineId ?? (e.pipeline && e.pipeline.id)) : null;
  };
  // todas as oportunidades (a v2 não filtra por contato): até 10 páginas de 100
  const todas = async () => {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const r = await api('GET', '/listOpportunities?page=' + page + '&limit=100');
      if (!ok(r)) return page === 1 ? null : out;
      const l = lista(r.body); out.push(...l);
      if (l.length < 100) break;
    }
    return out;
  };
  const contatoPorNumero = async (numero) => {
    const r = await api('POST', '/showcontact', { number: numero, validateNumber: false });
    if (!ok(r)) return { r };
    const c = objeto(r.body, 'contact', 'data');
    if (!c || !inteiro(c.id)) return { r };
    mem.contatos[inteiro(c.id)] = { tel: digitos(c.number || numero), nome: s(c.name).slice(0, 60) };
    return { c };
  };

  if (rota.r === 'opps') {
    const l = await todas();
    if (l === null) return { status: 502, body: { error: 'lista_oportunidades' } };
    const cid = inteiro(q.contactId), st = s(q.status).toLowerCase();
    const data = l.map(oportunidadeVelha).filter(o => (!cid || o.contactId === cid) && (!st || o.status === st));
    return { status: 200, body: { data } };
  }
  if (rota.r === 'oppCriar') {
    const cid = inteiro(b.contactId), stageId = inteiro(b.pipelineStepId);
    const ct = mem.contatos[cid];
    if (!ct || !ct.tel) return { status: 409, body: { error: 'contato_desconhecido' } };
    if (!stageId) return { status: 400, body: { error: 'sem_etapa' } };
    const pipelineId = await funilDaEtapa(stageId);
    if (!pipelineId) return { status: 400, body: { error: 'etapa_desconhecida' } };
    const r = await api('POST', '/createOpportunity', { number: ct.tel, contactName: ct.nome || s(b.name).split(' — ')[0],
      name: s(b.name).slice(0, 120) || 'WhatsApp', value: Number(b.value) || 0, status: 'open', pipelineId, stageId,
      responsibleId: inteiro(b.responsibleId) || undefined, closingForecast: s(b.expectedCloseDate).slice(0, 10) || undefined,
      description: s(b.description).slice(0, 6000), validateNumber: false });
    return ok(r) ? { status: 200, body: r.body } : falha(r, 'criar_oportunidade');
  }
  if (rota.r === 'oppMudar' || rota.r === 'oppStatus') {
    const corpo = { opportunityId: rota.id };
    const stageId = inteiro(b.pipelineStepId);
    if (stageId) { const pipelineId = await funilDaEtapa(stageId); if (pipelineId) { corpo.stageId = stageId; corpo.pipelineId = pipelineId; } }
    if (rota.r === 'oppStatus') {
      const st = STATUS_NOVO[s(b.status).toLowerCase()];
      if (!st) return { status: 400, body: { error: 'status' } };
      corpo.status = st;
    } else {
      if (b.name !== undefined) corpo.name = s(b.name).slice(0, 120);
      if (b.value !== undefined) corpo.value = Number(b.value) || 0;
      if (inteiro(b.responsibleId)) corpo.responsibleId = inteiro(b.responsibleId);
      if (b.expectedCloseDate) corpo.closingForecast = s(b.expectedCloseDate).slice(0, 10);
      if (b.description !== undefined) corpo.description = s(b.description).slice(0, 6000);
    }
    const r = await api('POST', '/updateOpportunity', corpo);
    return ok(r) ? { status: 200, body: r.body } : falha(r, 'mudar_oportunidade');
  }
  if (rota.r === 'contato') {
    const { c, r } = await contatoPorNumero(rota.numero);
    if (!c) return falha(r && r.status ? r : { status: 404 }, 'contato_nao_achado');
    const tags = (Array.isArray(c.tags) ? c.tags : []).map(t => ({ id: idTag(t), tag: nomeTag(t) })).filter(t => t.tag);
    return { status: 200, body: { id: inteiro(c.id), name: s(c.name), number: digitos(c.number || rota.numero), tags, customFields: {} } };
  }
  if (rota.r === 'tags') {
    const r = await api('GET', '/listTags');
    if (!ok(r)) return falha(r, 'lista_etiquetas');
    return { status: 200, body: lista(r.body).map(t => ({ id: idTag(t), tag: nomeTag(t), color: s(t.color) })) };
  }
  if (rota.r === 'tagsCriar') {
    const novas = (Array.isArray(req.corpo) ? req.corpo : [b]).filter(t => t && nomeTag(t));
    const criadas = [];
    for (const t of novas) { const r = await api('POST', '/createTag', { tag: nomeTag(t), color: s(t.color) || '#64748B', isActive: true }); if (ok(r)) criadas.push(nomeTag(t)); }
    return { status: 200, body: { criadas } };
  }
  if (rota.r === 'usuarios') {
    const r = await api('GET', '/listUsers');
    if (!ok(r)) return falha(r, 'lista_usuarios');
    return { status: 200, body: { users: lista(r.body).map(u => ({ id: inteiro(u.id), name: s(u.name), profile: s(u.profile) })) } };
  }
  if (rota.r === 'contatoTags') {
    const ct = mem.contatos[rota.id];
    if (!ct || !ct.tel) return { status: 409, body: { error: 'contato_desconhecido' } };
    const desejadas = (Array.isArray(b.tags) ? b.tags : []).map(nomeTag).filter(Boolean);
    const { c, r } = await contatoPorNumero(ct.tel);
    if (!c) return falha(r && r.status ? r : { status: 404 }, 'contato_nao_achado');
    const atuais = (Array.isArray(c.tags) ? c.tags : []).map(t => ({ id: idTag(t), tag: nomeTag(t) })).filter(t => t.tag);
    const rl = await api('GET', '/listTags');
    const daConta = ok(rl) ? lista(rl.body).map(t => ({ id: idTag(t), tag: nomeTag(t) })) : [];
    const idPorNome = (n) => (daConta.find(t => normaliza(t.tag) === normaliza(n)) || {}).id || null;
    const por = atuais.map(t => normaliza(t.tag)), quer = desejadas.map(normaliza);
    const colocar = desejadas.filter(n => !por.includes(normaliza(n))).map(idPorNome).filter(Boolean);
    const tirar = atuais.filter(t => !quer.includes(normaliza(t.tag))).map(t => idPorNome(t.tag) || t.id).filter(Boolean);
    const erros = [];
    for (const tagId of colocar) { const x = await api('POST', '/addTagContact', { contactId: rota.id, tagId, validateNumber: false }); if (!ok(x)) erros.push('add:' + tagId); }
    if (tirar.length) { const x = await api('POST', '/removeTagContact', { number: ct.tel, tagIds: tirar, validateNumber: false }); if (!ok(x)) erros.push('rem'); }
    return { status: erros.length ? 502 : 200, body: { id: rota.id, colocadas: colocar.length, tiradas: tirar.length, erros } };
  }
  return { status: 404, body: { error: 'rota_nao_traduzida' } };
}

module.exports = { entrada, saida, extensaoPorConteudo, crm, rotaCrm, oportunidadeVelha, hashToken, lista };
