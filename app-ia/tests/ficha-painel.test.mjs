import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createApp } from '../server.mjs';
import { extrair, arquivo } from '../ficha-campos.mjs';
import { FICHA_ETAPAS } from '../public/ficha-campos.js';

const ok = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
const org = '22222222-2222-4222-8222-222222222222';
const lista = [{ id: 'loja-teste', nome: 'Loja Teste', contato: '21999990000', status: 'pronta', organization: null, empresa: null, atualizadoEm: 1 }];

async function fixture(t, { admin = true, ficha = { id: 'loja-teste', nome: 'Loja Teste', dados: { empresa: { nome: 'Loja Teste' } } }, vincular = { ok: true }, semSql = false } = {}) {
  const calls = [];
  const s = createApp({ allowLocal: true, fetchImpl: async (u, init) => {
    if (u.endsWith('/auth/v1/user')) return ok({ id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: '2026-01-01' });
    const fn = (u.match(/rpc\/([a-z_]+)/) || [])[1], body = init?.body ? JSON.parse(init.body) : null; calls.push({ fn, body });
    if (fn === 'lv_is_platform_admin') return ok(admin);
    if (fn === 'lv_admin_fichas') return semSql ? ok({ message: 'function not found' }, 404) : ok(lista);
    if (fn === 'lv_admin_ficha') return ok(ficha);
    if (fn === 'lv_admin_ficha_vincular') return ok(vincular);
    return ok({ ok: true });
  } });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => s.close(r)));
  const base = 'http://127.0.0.1:' + s.address().port, h = { Origin: base, Cookie: '__Host-lv_session=x' };
  return { calls, get: c => fetch(base + '/api/account/' + c, { headers: h }), post: (c, b) => fetch(base + '/api/account/' + c, { method: 'POST', headers: h, body: JSON.stringify(b) }) };
}

test('Painel LeadVox lista as fichas e abre uma com as respostas', async t => {
  const f = await fixture(t);
  const l = await f.get('admin-fichas'); assert.equal(l.status, 200); assert.deepEqual(await l.json(), { fichas: lista });
  const a = await f.get('admin-ficha?id=loja-teste'); assert.equal(a.status, 200); assert.equal((await a.json()).ficha.dados.empresa.nome, 'Loja Teste');
  assert.deepEqual(f.calls.find(c => c.fn === 'lv_admin_ficha').body, { p_id: 'loja-teste' });
  assert.equal((await f.get('admin-ficha?id=X;drop')).status, 400);
  const g = await fixture(t, { ficha: null }); assert.equal((await g.get('admin-ficha?id=nao-existe')).status, 404);
});
test('só o dono da plataforma vê as fichas', async t => {
  const f = await fixture(t, { admin: false });
  assert.equal((await f.get('admin-fichas')).status, 403);
  assert.equal((await f.get('admin-ficha?id=loja-teste')).status, 403);
  assert.equal((await f.post('admin-ficha-vincular', { id: 'loja-teste', organization: org })).status, 403);
  assert.ok(!f.calls.some(c => /^lv_admin_ficha/.test(c.fn)));
});
test('ligar a ficha a um cliente, desligar e recusar o que não existe', async t => {
  const f = await fixture(t);
  const r = await f.post('admin-ficha-vincular', { id: 'loja-teste', organization: org }); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { fichas: lista });
  assert.deepEqual(f.calls.find(c => c.fn === 'lv_admin_ficha_vincular').body, { p_id: 'loja-teste', org });
  await f.post('admin-ficha-vincular', { id: 'loja-teste', organization: '' });
  assert.deepEqual(f.calls.filter(c => c.fn === 'lv_admin_ficha_vincular')[1].body, { p_id: 'loja-teste', org: null });
  assert.equal((await f.post('admin-ficha-vincular', { id: 'loja-teste', organization: 'nao-e-uuid' })).status, 400);
  const g = await fixture(t, { vincular: { ok: false, erro: 'empresa' } });
  const e = await g.post('admin-ficha-vincular', { id: 'loja-teste', organization: org }); assert.equal(e.status, 400); assert.match((await e.json()).error, /Empresa não encontrada/);
});
test('sem o SQL no banco, a lista avisa qual arquivo rodar', async t => {
  const f = await fixture(t, { semSql: true });
  const r = await f.get('admin-fichas'); assert.equal(r.status, 409); assert.match((await r.json()).error, /fichas_painel\.sql/);
});
test('o SQL confere o dono da plataforma, não muda o plugin e fica fora do acesso anônimo', () => {
  const sql = readFileSync(new URL('../database/fichas_painel.sql', import.meta.url), 'utf8');
  for (const fn of ['lv_admin_fichas', 'lv_admin_ficha', 'lv_admin_ficha_vincular'])
    assert.match(sql, new RegExp('function public\\.' + fn + '\\([^)]*\\)[^$]*\\$\\$\\s*begin\\s*if not public\\.lv_is_platform_admin\\(\\) then raise exception'));
  assert.match(sql, /add column if not exists organization_id uuid references public\.lv_organizations\(id\) on delete set null/);
  assert.match(sql, /revoke all on function public\.lv_admin_fichas\(\),public\.lv_admin_ficha\(text\),public\.lv_admin_ficha_vincular\(text,uuid\) from public,anon/);
  assert.doesNotMatch(sql, /lv_ficha_salvar|lv_fichas_listar|service_role/);
  assert.match(sql, /values\('fichas_painel\.sql'\)/);
});
test('o mapa de campos do painel acompanha a página da ficha', { skip: !existsSync(new URL('../../ficha/index.html', import.meta.url)) && 'a página da ficha não está nesta montagem' }, () => {
  const html = readFileSync(new URL('../../ficha/index.html', import.meta.url), 'utf8');
  assert.deepEqual(FICHA_ETAPAS, extrair(html), 'A ficha mudou: rode "node ficha-campos.mjs" na pasta app-ia.');
  assert.equal(readFileSync(new URL('../public/ficha-campos.js', import.meta.url), 'utf8'), arquivo(extrair(html)));
});
test('tela: a aba Fichas lista, mostra as respostas e liga ao cliente', () => {
  const js = readFileSync(new URL('../public/painel.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(js, /from '\/ficha-campos\.js'/); assert.match(js, /api\('admin-fichas'\)/); assert.match(js, /api\('admin-ficha-vincular'/);
  for (const id of ['lvFichasLista', 'lvFichasBusca', 'dlgFicha', 'fiRespostas', 'fiCliente']) assert.match(html, new RegExp('id="' + id + '"'));
});
