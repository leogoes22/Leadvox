// Rastreamento de anúncios (módulo extra): liga o lead do anúncio de clique para WhatsApp à venda, e avisa a Meta.
// POST /rastreio?t=<token da empresa> → webhook de uma API própria da LeadVox, só para o rastreamento (não toca na IA).
//  · mensagem do cliente vinda de anúncio (referral) → grava a origem do lead (primeiro anúncio vale);
//  · oportunidade que entra na etapa "qualificado" ou fica ganha → um envio por card e por tipo, com o valor no Ganho.
// O token da Meta fica no Vault e só sai do banco para esta função (service_role). Este arquivo não usa nada do Deno:
// os testes rodam no Node e o servidor do painel reusa as peças (configRastreio, montarEvento, enviarMeta, conferirMeta).
export const GRAPH = 'https://graph.facebook.com/v24.0';
export const EVENTOS_QUALIFICADO = ['QualifiedLead', 'Lead', 'LeadSubmitted', 'Contact', 'Schedule', 'SubmitApplication', 'CompleteRegistration'];

const texto = (v, n) => (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
const digitos = (v, n) => { const s = texto(v, 40).replace(/\D/g, ''); return s && s.length <= n ? s : ''; };
const inteiro = v => { const s = texto(v, 20); return /^[0-9]{1,15}$/.test(s) ? Number(s) : null; };
const linkSeguro = v => { const s = texto(v, 300); return /^https:\/\/\S+$/.test(s) ? s : ''; };

// Telefone no formato da Meta: só dígitos, com o 55 do Brasil quando vier sem DDI.
export function telefone(v) {
  const d = texto(v, 40).replace(/@.*$/, '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d.length >= 12 && d.length <= 15 ? d : '';
}
export async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// "1.234,56", "1234.56", 1234.56 → 1234.56; o que não for valor de venda vira null.
export function valor(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v * 100) / 100 : null;
  let s = texto(v, 30).replace(/[^\d.,]/g, '');
  if (!s) return null;
  s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}

// Procura um objeto com a chave pedida até uma profundidade pequena (o formato do WhatsApp por QR Code varia).
function procurar(o, chave, prof) {
  if (!o || typeof o !== 'object' || prof < 0) return null;
  if (o[chave] && typeof o[chave] === 'object') return o[chave];
  for (const v of Object.values(o)) { const r = procurar(v, chave, prof - 1); if (r) return r; }
  return null;
}
// Anúncio da primeira mensagem: API oficial (message.raw.referral) ou, por QR Code, contextInfo.externalAdReply.
export function lerAnuncio(b) {
  const m = b?.message && typeof b.message === 'object' ? b.message : null;
  if (!m) return null;
  const r = m.raw?.referral || m.referral;
  if (r && typeof r === 'object' && (r.source_id || r.ctwa_clid)) {
    const a = { anuncio: digitos(r.source_id, 30), titulo: texto(r.headline, 120), link: linkSeguro(r.source_url), clid: texto(r.ctwa_clid, 500), midia: texto(r.media_type, 20) };
    return a.anuncio || a.clid ? a : null;
  }
  const e = procurar(m.raw, 'externalAdReply', 7);
  if (e && (e.sourceId || e.ctwaClid)) {
    const a = { anuncio: digitos(e.sourceId, 30), titulo: texto(e.title, 120), link: linkSeguro(e.sourceUrl), clid: texto(e.ctwaClid, 500), midia: texto(e.mediaType, 20) };
    return a.anuncio || a.clid ? a : null;
  }
  return null;
}
export function lerMensagem(b) {
  const m = b?.message && typeof b.message === 'object' ? b.message : null;
  if (!m) return null;
  const c = m.ticket?.contact || {};
  return { contato: inteiro(m.contactId ?? m.ticket?.contactId ?? c.id), telefone: telefone(c.number || m.raw?.from), nome: texto(c.name, 80),
    deMim: m.fromMe === true, grupo: c.isGroup === true };
}
// Evento de oportunidade da LeadVox ("Opportunity"): etapa nova, status open/won/lost e o valor do card.
export function lerOportunidade(b) {
  if (!b || typeof b !== 'object' || b.message) return null;
  if (b.event !== 'Opportunity' && !('pipelineStepId' in b && b.contact)) return null;
  const id = inteiro(b.id);
  if (!id) return null;
  return { id, contato: inteiro(b.contactId ?? b.contact?.id), telefone: telefone(b.contact?.number), status: texto(b.status, 20).toLowerCase(),
    etapaId: inteiro(b.pipelineStepId), etapa: texto(b.pipelineStep?.name, 80), valor: valor(b.value) };
}

// Configuração que o dono salva no painel, conferida aqui e de novo no banco.
export function configRastreio(b) {
  const id = (v, nome) => { const s = texto(v, 40).replace(/\D/g, ''); if (s && !/^[0-9]{6,20}$/.test(s)) throw Error('Confira o ID ' + nome + ': só números.'); return s || null; };
  const teste = texto(b?.testeCodigo, 60);
  if (teste && !/^[A-Za-z0-9]{3,40}$/.test(teste)) throw Error('O código de teste tem só letras e números, como TEST12345.');
  const etapas = [...new Set((Array.isArray(b?.etapasQualificado) ? b.etapasQualificado : []).map(inteiro).filter(n => n && n > 0))].slice(0, 20);
  return { ativo: b?.ativo === true, modo: b?.modo === 'whatsapp' ? 'whatsapp' : 'pixel', pixelId: id(b?.pixelId, 'do pixel'), wabaId: id(b?.wabaId, 'da conta do WhatsApp Business'),
    pageId: id(b?.pageId, 'da página'), etapasQualificado: etapas, eventoQualificado: EVENTOS_QUALIFICADO.includes(b?.eventoQualificado) ? b.eventoQualificado : 'QualifiedLead',
    enviarCompra: b?.enviarCompra !== false, testeCodigo: teste || null };
}

// Monta o envio para a API de Conversões.
//  pixel    → /{pixel}/events, action_source "chat" e o telefone em SHA-256 (funciona com o token do Gerenciador de Eventos);
//  whatsapp → mesmo endereço, action_source "business_messaging" com o código do clique (pede app com whatsapp_business_manage_events).
export async function montarEvento(meta, e, agora = new Date()) {
  const quando = Math.floor(agora.getTime() / 1000);
  const custom = e.tipo === 'compra' && Number.isFinite(e.valor) ? { currency: 'BRL', value: e.valor } : undefined;
  const ev = { event_name: e.evento, event_time: quando, event_id: 'lvx-' + e.id };
  // Nos dois modos o destino é o conjunto de dados (pixel); no modo whatsapp ele precisa estar ligado à conta do WhatsApp Business.
  const alvo = meta.pixel;
  if (meta.modo === 'whatsapp') {
    ev.action_source = 'business_messaging';
    ev.messaging_channel = 'whatsapp';
    ev.user_data = e.clid ? { whatsapp_business_account_id: meta.waba, ctwa_clid: e.clid }
      : { whatsapp_business_account_id: meta.waba, page_id: meta.page, ...(e.hash ? { ph: [e.hash] } : {}) };
  } else {
    ev.action_source = 'chat';
    ev.user_data = { ...(e.hash ? { ph: [e.hash] } : {}), country: [await sha256('br')], ...(e.contato ? { external_id: [await sha256('lvx-' + e.contato)] } : {}) };
  }
  if (custom) ev.custom_data = custom;
  const corpo = { data: [ev] };
  if (meta.teste) corpo.test_event_code = meta.teste;
  return { url: GRAPH + '/' + encodeURIComponent(String(alvo || '')) + '/events', corpo };
}
export async function enviarMeta({ url, corpo, token, fetchImpl = fetch }) {
  let r;
  try {
    r = await fetchImpl(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch { return { ok: false, detalhe: 'A Meta não respondeu.' }; }
  const j = await r.json().catch(() => ({}));
  if (r.ok && Number(j.events_received) > 0) return { ok: true, detalhe: 'A Meta recebeu' + (corpo.test_event_code ? ' (evento de teste)' : '') + '.' };
  return { ok: false, detalhe: texto(j.error?.error_user_msg || j.error?.message || ('Status ' + r.status), 250) };
}
// Antes de salvar o token: a Meta precisa aceitar o token para ler o pixel (ou a conta do WhatsApp).
export async function conferirMeta({ id, token, fetchImpl = fetch }) {
  let r;
  try { r = await fetchImpl(GRAPH + '/' + encodeURIComponent(id) + '?fields=id,name', { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw Error('Não deu para falar com a Meta agora. Tente de novo em instantes.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || String(j.id) !== String(id)) {
    // codigo 190 = token inválido ou vencido; outros (permissão para ler o pixel) não impedem o envio de eventos.
    const e = Error('A Meta não aceitou esse token para o ID ' + id + ': ' + texto(j.error?.message || 'acesso negado', 160));
    e.codigo = Number(j.error?.code) || r.status; throw e;
  }
  return { id: String(j.id), nome: texto(j.name, 120) };
}

// Token de leitura de anúncios: a Meta precisa aceitar o token (GET /me). Código 190 = token inválido ou vencido.
export async function conferirLeitura({ token, fetchImpl = fetch }) {
  let r;
  try { r = await fetchImpl(GRAPH + '/me?fields=id,name', { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw Error('Não deu para falar com a Meta agora. Tente de novo em instantes.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) { const e = Error('A Meta não aceitou esse token de leitura de anúncios: ' + texto(j.error?.message || 'acesso negado', 160)); e.codigo = Number(j.error?.code) || r.status; throw e; }
  return { id: String(j.id), nome: texto(j.name, 120) };
}
// Conta de anúncio, campanha e conjunto de cada anúncio (o WhatsApp só traz o id e o título do anúncio).
// Pede um token com leitura de anúncios (ads_read) das contas. Um anúncio por chamada, 5 de cada vez; depois o nome das contas.
export async function buscarAnuncios({ ids, token, fetchImpl = fetch, concorrencia = 5 }) {
  const ler = async caminho => {
    let r;
    try { r = await fetchImpl(GRAPH + '/' + caminho, { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
    catch { return { erro: 'A Meta não respondeu.', codigo: 0 }; }
    const j = await r.json().catch(() => ({}));
    return r.ok && !j.error ? j : { erro: texto(j.error?.message || ('Status ' + r.status), 250), codigo: Number(j.error?.code) || r.status };
  };
  const lista = [...new Set((ids || []).map(x => digitos(x, 30)).filter(Boolean))].slice(0, 50), saida = [], fila = [...lista];
  let tokenRuim = '';
  async function trabalhador() {
    while (fila.length && !tokenRuim) {
      const id = fila.shift();
      const j = await ler(encodeURIComponent(id) + '?fields=' + encodeURIComponent('name,account_id,campaign{id,name},adset{name}'));
      if (j.codigo === 190) { tokenRuim = j.erro; break; }
      saida.push(j.erro ? { anuncio: id, status: 'erro', detalhe: j.erro }
        : { anuncio: id, status: 'ok', nome: texto(j.name, 200), contaId: digitos(j.account_id, 30), campanhaId: digitos(j.campaign?.id, 30), campanha: texto(j.campaign?.name, 200), conjunto: texto(j.adset?.name, 200) });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concorrencia, lista.length)) }, trabalhador));
  if (tokenRuim) { const e = Error('A Meta não aceitou o token de leitura de anúncios: ' + tokenRuim); e.codigo = 190; throw e; }
  const contas = [...new Set(saida.map(x => x.contaId).filter(Boolean))], nomes = {};
  for (const c of contas) { const j = await ler('act_' + c + '?fields=name'); if (!j.erro) nomes[c] = texto(j.name, 200); }
  return saida.map(x => x.contaId ? { ...x, contaNome: nomes[x.contaId] || '' } : x);
}

const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });

// rpc(nome, args) chama as funções iag_rastreio_* do banco com a chave de serviço; depois(p) deixa o envio à Meta
// terminar depois da resposta (EdgeRuntime.waitUntil), para a LeadVox não esperar.
export function createRastreio({ rpc, fetchImpl = fetch, agora = () => new Date(), depois = p => p }) {
  async function enviarTodos(token, r) {
    for (const e of r.enviar || []) {
      let res;
      if (!r.meta?.token) res = { ok: false, detalhe: 'Conecte o pixel e o token da Meta no painel.' };
      else {
        const ev = await montarEvento(r.meta, { ...e, hash: r.lead?.hash, clid: r.lead?.clid, contato: r.lead?.contato }, agora());
        res = await enviarMeta({ ...ev, token: r.meta.token, fetchImpl });
      }
      await rpc('iag_rastreio_resultado', { p_token: token, p_id: e.id, p_status: res.ok ? 'enviado' : 'erro', p_detalhe: res.detalhe }).catch(() => null);
    }
  }
  return async req => {
    const u = new URL(req.url);
    if (req.method === 'GET') return resposta(200, { ok: true, servico: 'rastreio' });
    if (req.method !== 'POST') return resposta(405, { ok: false });
    const token = u.searchParams.get('t') || '';
    if (!/^[0-9a-f]{32}$/.test(token)) return resposta(404, { ok: false });
    const bruto = await req.text();
    if (bruto.length > 400000) return resposta(413, { ok: false });
    let b; try { b = JSON.parse(bruto || '{}'); } catch { return resposta(400, { ok: false }); }
    try {
      const op = lerOportunidade(b);
      if (op) {
        const r = await rpc('iag_rastreio_oportunidade', { p_token: token, p: { oportunidade: op.id, contato: op.contato, hash: op.telefone ? await sha256(op.telefone) : null,
          status: op.status, etapaId: op.etapaId, etapa: op.etapa, valor: op.valor } });
        if (!r?.ok) return resposta(404, { ok: false });
        if (r.enviar?.length) await depois(enviarTodos(token, r));
        return resposta(200, { ok: true, envios: r.enviar?.length || 0 });
      }
      const m = lerMensagem(b);
      if (!m || m.deMim || m.grupo) return resposta(200, { ok: true, ignorado: true });
      const a = lerAnuncio(b);
      if (!a || !m.contato) {
        const r = await rpc('iag_rastreio_visto', { p_token: token });
        return resposta(r?.ok ? 200 : 404, { ok: !!r?.ok });
      }
      const r = await rpc('iag_rastreio_lead', { p_token: token, p: { contato: m.contato, hash: m.telefone ? await sha256(m.telefone) : null, final: m.telefone.slice(-4), telefone: m.telefone || null,
        nome: m.nome, ...a } });
      return resposta(r?.ok ? 200 : 404, { ok: !!r?.ok, novo: !!r?.novo });
    } catch {
      // O banco não respondeu: 503 para a LeadVox tentar de novo.
      return resposta(503, { ok: false });
    }
  };
}
