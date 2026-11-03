import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const pasta = new URL('../database/', import.meta.url);
const controle = readFileSync(new URL('controle.sql', pasta), 'utf8');
test('todo arquivo SQL da pasta database aparece no registro de quais já rodaram', () => {
 const arquivos = readdirSync(pasta).filter(f => f.endsWith('.sql') && f !== 'controle.sql');
 assert.ok(arquivos.length >= 21);
 for (const f of arquivos) assert.match(f, /^[a-z0-9_]+\.sql$/, f);
 const faltam = arquivos.filter(f => !controle.includes("'" + f + "'"));
 assert.deepEqual(faltam, [], 'coloque no controle.sql: ' + faltam.join(', '));
});
test('o registro não dá acesso à tabela fora do banco e pode rodar de novo', () => {
 assert.match(controle, /create table if not exists leadvox_private\.sql_aplicado/);
 assert.match(controle, /revoke all on leadvox_private\.sql_aplicado from public,anon,authenticated/);
 assert.doesNotMatch(controle, /\b(drop|delete|truncate|update)\b/i);
});
