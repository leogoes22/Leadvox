// Usuários das empresas: a única peça que cria login e troca e-mail de login (precisa da chave de serviço, que só existe aqui dentro).
// POST /usuarios/convidar → { organization, email, papel }: quem já tem login entra direto; quem não tem ganha o login e o código de criar senha.
// POST /usuarios/email    → { organization, alvo, email, avisar }: só o Super Admin troca o e-mail de login de alguém da empresa.
// Quem pode é decidido pelo banco, sempre com o login de quem pede (rpcComo): esta função não decide nada sozinha.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const PAPEIS = ['owner', 'admin', 'member'];
export const emailOk = (v) => { const e = String(v ?? '').trim().toLowerCase(); return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ''; };
const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// rpcComo(jwt, fn, args): função do banco com o login de quem pede (auth.uid() = essa pessoa)
// admin(metodo, caminho, corpo): API de administração do login (chave de serviço); devolve { status, dados }
// recuperar(email): manda o código de "Esqueci minha senha" (o mesmo da tela de entrar)
export function createUsuarios({ rpcComo, admin, recuperar }) {
  const pedir = async (jwt, fn, args) => {
    try { return await rpcComo(jwt, fn, args); }
    catch (e) { throw Object.assign(new Error(e?.status === 401 ? 'login' : 'banco'), { status: e?.status === 401 ? 401 : e?.status === 403 || e?.proibido ? 403 : 503 }); }
  };
  const avisar = async (email) => { try { await recuperar(email); return true; } catch { return false; } };

  async function convidar(jwt, b) {
    const org = String(b?.organization ?? ''), email = emailOk(b?.email), papel = String(b?.papel ?? '');
    if (!UUID.test(org)) return resposta(400, { ok: false, erro: 'empresa' });
    if (!email) return resposta(400, { ok: false, erro: 'email' });
    if (!PAPEIS.includes(papel)) return resposta(400, { ok: false, erro: 'papel' });
    const args = { org, p_email: email, papel };
    let r = await pedir(jwt, 'lv_usuarios_adicionar', args);
    if (r?.ok) return resposta(200, { ok: true, novo: false, email });
    if (r?.erro !== 'sem_login') return resposta(400, { ok: false, erro: r?.erro || 'falhou' });
    // ainda não tem login: cria já confirmado e sem senha (a pessoa cria a senha pelo código que chega no e-mail)
    const c = await admin('POST', '/admin/users', { email, email_confirm: true });
    if (c.status >= 400 && c.status !== 422) return resposta(502, { ok: false, erro: 'login' });
    r = await pedir(jwt, 'lv_usuarios_adicionar', args);
    if (!r?.ok) return resposta(400, { ok: false, erro: r?.erro || 'falhou' });
    return resposta(200, { ok: true, novo: true, email, emailEnviado: await avisar(email) });
  }

  async function trocarEmail(jwt, b) {
    const org = String(b?.organization ?? ''), alvo = String(b?.alvo ?? ''), email = emailOk(b?.email);
    if (!UUID.test(org) || !UUID.test(alvo)) return resposta(400, { ok: false, erro: 'nao_encontrado' });
    if (!email) return resposta(400, { ok: false, erro: 'email' });
    const c = await pedir(jwt, 'lv_usuarios_email_conferir', { org, alvo, novo: email });
    if (!c?.ok) return resposta(400, { ok: false, erro: c?.erro || 'falhou' });
    const t = await admin('PUT', '/admin/users/' + alvo, { email, email_confirm: true });
    if (t.status === 422) return resposta(400, { ok: false, erro: 'email_em_uso' });
    if (t.status >= 400) return resposta(502, { ok: false, erro: 'login' });
    await pedir(jwt, 'lv_usuarios_email_registrar', { org, alvo, de: c.de });
    return resposta(200, { ok: true, email, emailEnviado: b?.avisar === true ? await avisar(email) : false });
  }

  return async (req) => {
    if (req.method !== 'POST') return resposta(405, { ok: false, erro: 'metodo' });
    if (req.headers.has('origin')) return resposta(403, { ok: false, erro: 'origem' }); // só o servidor do painel chama
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!JWT.test(jwt)) return resposta(401, { ok: false, erro: 'login' });
    const acao = new URL(req.url).pathname.split('/usuarios/')[1];
    if (!['convidar', 'email'].includes(acao)) return resposta(404, { ok: false, erro: 'acao' });
    let b; try { b = await req.json(); } catch { return resposta(400, { ok: false, erro: 'dados' }); }
    try { return acao === 'convidar' ? await convidar(jwt, b) : await trocarEmail(jwt, b); }
    catch (e) { return resposta(e.status || 503, { ok: false, erro: e.status === 401 ? 'login' : e.status === 403 ? 'proibido' : 'banco' }); }
  };
}
