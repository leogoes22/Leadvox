// Cobrança da assinatura LeadVox pelo Asaas. Única peça que lê a chave do Asaas da LeadVox (Vault, via service_role).
// POST /cobranca/assinar  → o painel (com o login do cliente) abre ou troca a assinatura e recebe o link de pagamento.
// POST /cobranca/asaas    → retorno do Asaas (pagamento criado, confirmado, vencido, estornado), conferido pelo token.
const ASAAS = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' };
export const FORMAS = { CREDIT_CARD: 'Cartão de crédito (cobrança automática)', PIX: 'Pix', BOLETO: 'Boleto' };

const digitos = (v) => String(v ?? '').replace(/\D/g, '');
export function documentoValido(v) {
  const d = digitos(v);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const dv = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = p.reduce((a, w, i) => a + Number(d[i]) * w, 0) % 11; return s < 2 ? 0 : 11 - s; };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}
// O que o cliente manda para assinar; erros em português, prontos para a tela.
export function pedidoAssinatura(b) {
  const org = String(b?.organization ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(org)) throw new Error('Empresa inválida.');
  const plano = String(b?.plano ?? ''); if (!/^[a-z0-9-]{2,30}$/.test(plano)) throw new Error('Escolha um plano.');
  const forma = String(b?.forma ?? ''); if (!FORMAS[forma]) throw new Error('Escolha como quer pagar.');
  const documento = digitos(b?.documento); if (!documentoValido(documento)) throw new Error('Confira o CPF ou CNPJ.');
  const email = String(b?.email ?? '').trim().slice(0, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Confira o e-mail para a cobrança.');
  let telefone = digitos(b?.telefone); if (telefone.length === 10 || telefone.length === 11) telefone = '55' + telefone;
  if (telefone && !/^55\d{10,11}$/.test(telefone)) throw new Error('Confira o WhatsApp com DDD.');
  return { org, plano, forma, documento, email, telefone };
}
// Vencimento da 1ª fatura: no fim do teste (quem assina antes não paga em dobro) ou hoje, se o teste já acabou.
export function primeiroVencimento(testeAte, agora = new Date()) {
  const br = (d) => new Date(new Date(d).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const hoje = br(agora), fim = testeAte ? br(testeAte) : hoje;
  return fim > hoje ? fim : hoje;
}
const iguais = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function createCobranca({ rpc, getUser, fetchImpl = fetch, agora = () => new Date() }) {
  let cache = null, cacheEm = 0;
  const segredos = async () => { if (!cache || Date.now() - cacheEm > 60000) { cache = await rpc('iag_saas_segredos', {}); cacheEm = Date.now(); } return cache || {}; };
  async function asaas(s, metodo, caminho, corpo) {
    const base = ASAAS[s.ambiente]; if (!base || !s.chave) throw Object.assign(new Error('A cobrança da LeadVox ainda não está ligada. Fale com o suporte.'), { status: 503 });
    let r; try { r = await fetchImpl(base + caminho, { method: metodo, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { access_token: s.chave, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'LeadVoxIA/1.0' }, body: corpo ? JSON.stringify(corpo) : undefined }); }
    catch { throw Object.assign(new Error('O Asaas não respondeu. Tente de novo em instantes.'), { status: 502 }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.errors && j.errors[0] && j.errors[0].description) || 'O Asaas recusou o pedido.'; throw Object.assign(new Error(String(m).slice(0, 200)), { status: r.status === 401 ? 503 : 400 }); }
    return j;
  }
  async function assinar(req) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    const user = jwt ? await getUser(jwt).catch(() => null) : null;
    if (!user?.id) return resposta(401, { ok: false, erro: 'Entre na sua conta de novo.' });
    let p; try { p = pedidoAssinatura(await req.json()); } catch (e) { return resposta(400, { ok: false, erro: e.message }); }
    const d = await rpc('iag_saas_checkout_dados', { p_org: p.org, p_user: user.id });
    if (!d?.ok) return resposta(403, { ok: false, erro: 'Só o dono ou um admin da empresa pode assinar.' });
    const plano = d.planos?.[p.plano]; if (!plano) return resposta(400, { ok: false, erro: 'Esse plano não está disponível.' });
    try {
      const s = await segredos();
      const dadosCliente = { name: String(d.nome || 'Cliente LeadVox').slice(0, 100), cpfCnpj: p.documento, email: p.email, mobilePhone: p.telefone ? p.telefone.slice(2) : undefined, externalReference: p.org, notificationDisabled: false };
      const cliente = d.cliente ? (await asaas(s, 'POST', '/customers/' + encodeURIComponent(d.cliente), dadosCliente)).id || d.cliente : (await asaas(s, 'POST', '/customers', dadosCliente)).id;
      const valor = plano.valorCents / 100, descricao = plano.nome + ' · LeadVox';
      const vencimento = primeiroVencimento(d.testeAte, agora());
      let assinatura = d.assinatura;
      if (assinatura && d.status !== 'cancelada') await asaas(s, 'POST', '/subscriptions/' + encodeURIComponent(assinatura), { billingType: p.forma, value: valor, description: descricao, updatePendingPayments: true });
      else assinatura = (await asaas(s, 'POST', '/subscriptions', { customer: cliente, billingType: p.forma, value: valor, nextDueDate: vencimento, cycle: 'MONTHLY', description: descricao, externalReference: p.org })).id;
      const pg = await asaas(s, 'GET', '/subscriptions/' + encodeURIComponent(assinatura) + '/payments?limit=20');
      const aberta = (pg.data || []).filter(x => ['PENDING', 'OVERDUE'].includes(x.status)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
      const link = aberta?.invoiceUrl || d.link || '';
      await rpc('iag_saas_checkout_gravar', { p_org: p.org, p: { plano: p.plano, forma: p.forma, documento: p.documento, email: p.email, telefone: p.telefone,
        cliente, assinatura, link, vencimento: aberta?.dueDate || vencimento } });
      return resposta(200, { ok: true, link, vencimento: aberta?.dueDate || vencimento, ativa: ['ativa', 'cortesia'].includes(d.status) });
    } catch (e) { return resposta(e.status || 500, { ok: false, erro: e.status ? e.message : 'Não deu para abrir a assinatura agora.' }); }
  }
  async function retorno(req) {
    const s = await segredos().catch(() => ({}));
    if (!s.retorno || !iguais(req.headers.get('asaas-access-token') || '', s.retorno)) return resposta(401, { ok: false });
    let corpo; try { corpo = await req.json(); } catch { return resposta(400, { ok: false }); }
    try { await rpc('iag_saas_evento', { p: corpo }); } catch { return resposta(500, { ok: false }); } // 500: o Asaas tenta de novo
    return resposta(200, { ok: true });
  }
  return async (req) => {
    if (req.method !== 'POST') return resposta(405, { ok: false });
    const rota = new URL(req.url).pathname.split('/cobranca/')[1];
    if (rota === 'assinar') { if (req.headers.has('origin')) return resposta(403, { ok: false }); return assinar(req); }
    if (rota === 'asaas') return retorno(req);
    return resposta(404, { ok: false });
  };
}
