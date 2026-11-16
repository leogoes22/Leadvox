import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server.mjs';

const ok = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
const org = '22222222-2222-4222-8222-222222222222';
const completo = { dias: [{ org, dia: '2026-11-10', conversas: 5, novos: 3, transferidos: 1, followups: 2, respostas: 20, usd: 0.5 }], anuncios: [{ org, leads: 4, vendas: 1, valor: 50000 }] };
const basico = [{ org, dia: '2026-11-10', respostas: 20, conversas: 5, usd: 0.5 }];

async function fixture(t, { admin = true, semSql = false } = {}) {
  const calls = [];
  const s = createApp({ allowLocal: true, fetchImpl: async (u, init) => {
    if (u.endsWith('/auth/v1/user')) return ok({ id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: '2026-01-01' });
    const fn = (u.match(/rpc\/([a-z_]+)/) || [])[1], body = init?.body ? JSON.parse(init.body) : null; calls.push({ fn, body });
    if (fn === 'lv_is_platform_admin') return ok(admin);
    if (fn === 'lv_admin_relatorio') return semSql ? ok({ message: 'function not found' }, 404) : ok(completo);
    if (fn === 'lv_admin_consumo') return ok(basico);
    return ok({ ok: true });
  } });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => s.close(r)));
  const base = 'http://127.0.0.1:' + s.address().port, h = { Origin: base, Cookie: '__Host-lv_session=x' };
  return { calls, get: q => fetch(base + '/api/account/admin-relatorio' + q, { headers: h }) };
}

test('relatório do Painel LeadVox: os números de cada cliente no período', async t => {
  const f = await fixture(t), r = await f.get('?ini=2026-11-01&fim=2026-11-16');
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ...completo, completo: true });
  assert.deepEqual(f.calls.find(c => c.fn === 'lv_admin_relatorio').body, { ini: '2026-11-01', fim: '2026-11-16' });
  assert.ok(!f.calls.some(c => c.fn === 'lv_admin_consumo'));
});
test('sem o SQL novo no banco, o relatório cai no básico em vez de dar erro', async t => {
  const f = await fixture(t, { semSql: true }), r = await f.get('?ini=2026-11-01&fim=2026-11-16');
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { dias: basico, anuncios: [], completo: false });
});
test('só o dono da plataforma vê, e o período tem limite', async t => {
  const f = await fixture(t, { admin: false });
  assert.equal((await f.get('?ini=2026-11-01&fim=2026-11-16')).status, 403);
  assert.ok(!f.calls.some(c => c.fn === 'lv_admin_relatorio' || c.fn === 'lv_admin_consumo'));
  const g = await fixture(t);
  for (const q of ['', '?ini=2026-11-16&fim=2026-11-01', '?ini=2024-01-01&fim=2026-11-01', '?ini=x&fim=y']) assert.equal((await g.get(q)).status, 400);
});
test('o SQL confere o dono da plataforma e só devolve totais', () => {
  const sql = readFileSync(new URL('../database/relatorio_admin.sql', import.meta.url), 'utf8');
  assert.match(sql, /function public\.lv_admin_relatorio\(ini date,fim date\)[^$]*\$\$\s*declare[^$]*?begin\s*if not public\.lv_is_platform_admin\(\) then raise exception/);
  assert.match(sql, /revoke all on function public\.lv_admin_relatorio\(date,date\) from public,anon/);
  // nenhuma coluna que identifique o cliente final (os comentários do arquivo não contam)
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /telefone|nome|final|ctwa/);
  assert.match(sql, /values\('relatorio_admin\.sql'\)/);
});
test('tela: Relatórios tem os números, o cliente escolhido e a tabela por cliente', () => {
  const js = readFileSync(new URL('../public/painel.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(js, /api\('admin-relatorio\?ini='/);
  for (const id of ['lvRelNumeros', 'lvRelCliente', 'lvRelLista', 'lvRelAviso', 'lvConsumo', 'lvPeriodo']) assert.match(html, new RegExp('id="' + id + '"'));
});
