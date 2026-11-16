import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pedidoCode, RESPOSTA, fluxoFicha, ORIGENS } from '../n8n/ficha-plugin.mjs';

const CHAVE = 'lvficha-' + '0123456789abcdef'.repeat(2);
const rodar = (codigo, nos, $json) => new Function('$', '$json', codigo)(nome => ({ first: () => ({ json: nos[nome] }) }), $json);
const pedido = body => rodar(pedidoCode(CHAVE), {}, { body })[0].json;

test('pedido: só com a chave certa', () => {
  assert.deepEqual(pedido({ acao: 'listar' }).resposta, { ok: false, erro: 'chave' });
  assert.equal(pedido({ k: CHAVE.slice(0, -1) + 'x', acao: 'listar' }).ok, false);
  const p = pedido({ k: CHAVE, acao: 'listar' });
  assert.equal(p.ok, true); assert.equal(p.fn, 'lv_fichas_listar');
});

test('pedido: abrir, excluir e salvar com id válido', () => {
  assert.equal(pedido({ k: CHAVE, acao: 'abrir', id: 'c-5521981081044' }).fn, 'lv_ficha_abrir');
  assert.equal(pedido({ k: CHAVE, acao: 'excluir', id: 'f-abc123' }).fn, 'lv_ficha_excluir');
  assert.equal(pedido({ k: CHAVE, acao: 'abrir', id: '../x' }).resposta.erro, 'pedido');
  const s = pedido({ k: CHAVE, acao: 'salvar', id: 'f-abc123', ficha: { nome: 'Loja', contato: '(21) 98108-1044', status: 'pronta', dados: { empresa: { nome: 'Loja' } } } });
  assert.equal(s.fn, 'lv_ficha_salvar');
  assert.deepEqual(JSON.parse(s.corpoJson), { p_id: 'f-abc123', p_ficha: { nome: 'Loja', contato: '21981081044', status: 'pronta', dados: { empresa: { nome: 'Loja' } } } });
  assert.equal(JSON.parse(pedido({ k: CHAVE, acao: 'salvar', id: 'f-1x2', ficha: { status: 'qualquer', dados: [] } }).corpoJson).p_ficha.status, 'rascunho');
  assert.equal(pedido({ k: CHAVE, acao: 'salvar', id: 'f-abc123', ficha: { dados: { x: 'a'.repeat(210000) } } }).resposta.erro, 'grande');
});

test('resposta: lista, ficha e erro do banco', () => {
  const r = (acao, json) => rodar(RESPOSTA, { Pedido: { acao } }, json)[0].json.resposta;
  assert.deepEqual(r('listar', { statusCode: 200, body: [{ id: 'f-1' }] }), { ok: true, fichas: [{ id: 'f-1' }] });
  assert.deepEqual(r('abrir', { statusCode: 200, body: '' }), { ok: true, ficha: null });
  assert.deepEqual(r('salvar', { statusCode: 200, body: { ok: true, atualizadoEm: 1 } }), { ok: true, atualizadoEm: 1 });
  assert.deepEqual(r('salvar', { statusCode: 401, body: {} }), { ok: false, erro: 'banco', status: 401 });
});

test('fluxo: webhook só aceita o site da LeadVox e não guarda execução', () => {
  const w = fluxoFicha({ supabase: { id: 's', name: 'S' }, supabaseUrl: 'https://abc.supabase.co', chave: CHAVE });
  const nomes = new Set(w.nodes.map(n => n.name));
  for (const [de, c] of Object.entries(w.connections)) { assert.ok(nomes.has(de)); for (const s of c.main) for (const x of s) assert.ok(nomes.has(x.node), x.node); }
  assert.equal(w.nodes.find(n => n.name === 'Webhook').parameters.options.allowedOrigins, ORIGENS);
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.throws(() => fluxoFicha({ supabase: { id: 's' }, supabaseUrl: 'https://abc.supabase.co', chave: 'fraca' }), /chave/);
});

test('SQL: tabela fora do REST e funções só para o n8n', () => {
  const sql = readFileSync(new URL('../database/fichas.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists leadvox_private\.fichas/);
  assert.match(sql, /revoke all on leadvox_private\.fichas from public,anon,authenticated/);
  for (const fn of ['lv_fichas_listar()', 'lv_ficha_abrir(text)', 'lv_ficha_salvar(text,jsonb)', 'lv_ficha_excluir(text)']) {
    assert.ok(sql.includes('revoke all on function public.' + fn + ' from public,anon,authenticated'), fn);
    assert.ok(sql.includes('grant execute on function public.' + fn + ' to service_role'), fn);
  }
});

// A página da ficha fica fora desta pasta (../ficha). Na montagem do Docker só esta pasta é copiada: lá estes dois testes são pulados
// (senão a montagem para e nenhuma versão nova entra no ar); no GitHub Actions e na máquina eles rodam.
const semPagina = !existsSync(new URL('../../ficha/index.html', import.meta.url)) && 'a página da ficha não está nesta montagem';
test('página da ficha: fala com o n8n, lê o ticket da LeadVox e não usa o banco do claude.ai', { skip: semPagina }, () => {
  const html = readFileSync(new URL('../../ficha/index.html', import.meta.url), 'utf8');
  assert.match(html, /n8n\.leadvox\.com\.br\/webhook\/ficha-implantacao/);
  assert.match(html, /DEFAULT_DATA/);
  assert.match(html, /https:\/\/chat\.leadvox\.com\.br/);
  assert.doesNotMatch(html, /claude\.use|\bdb\.doc\(/);
  assert.match(html, /leadvox-modelo-crm/);
});

test('página da ficha: abrir o plugin numa conversa não grava ficha, só o primeiro preenchimento', { skip: semPagina }, () => {
  const html = readFileSync(new URL('../../ficha/index.html', import.meta.url), 'utf8');
  const corpoNova = html.slice(html.indexOf('function nova('), html.indexOf('// ── eventos ──'));
  assert.ok(corpoNova.length > 0);
  assert.doesNotMatch(corpoNova, /dirty\s*=\s*true|salvar\(\);\s*}/);
  assert.match(html, /Ainda não gravada/);
});
