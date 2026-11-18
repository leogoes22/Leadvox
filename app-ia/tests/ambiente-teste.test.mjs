import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const ler=p=>readFileSync(new URL(p,import.meta.url),'utf8');
// carrega o account-api num processo novo, com as variáveis do ambiente pedidas
const carregar=env=>{
 const r=spawnSync(process.execPath,['--input-type=module','-e',"const m=await import('./account-api.mjs');console.log(JSON.stringify({base:m.n8nDaConta('x'),ambiente:m.AMBIENTE}))"],
  {cwd:new URL('..',import.meta.url),env:{...process.env,LV_N8N_PREFIXO:'',LV_AMBIENTE:'',...env},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());
};

test('produção: sem variáveis, o painel fala com os fluxos dos clientes', () => {
 assert.deepEqual(carregar({}),{base:'https://n8n.leadvox.com.br/webhook/',ambiente:'producao'});
});
test('teste: LV_N8N_PREFIXO leva às cópias de homologação e LV_AMBIENTE liga a faixa', () => {
 assert.deepEqual(carregar({LV_N8N_PREFIXO:'hml-',LV_AMBIENTE:'teste'}),{base:'https://n8n.leadvox.com.br/webhook/hml-',ambiente:'teste'});
});
test('prefixo inválido é ignorado (nunca vira outro endereço)', () => {
 for(const p of ['../x','HML-','a b','x/y','https://outro.com/'])assert.equal(carregar({LV_N8N_PREFIXO:p}).base,'https://n8n.leadvox.com.br/webhook/');
 assert.equal(carregar({LV_AMBIENTE:'qualquer'}).ambiente,'producao');
});
test('painel: /api/health diz o ambiente e o painel mostra a faixa de teste', () => {
 assert.match(ler('../server.mjs'),/mode:'producao',ambiente:AMBIENTE/);
 const js=ler('../public/painel.js');
 assert.match(js,/fetch\('\/api\/health'\)/);assert.match(js,/h\.ambiente !== 'teste'/);assert.match(js,/AMBIENTE DE TESTE/);
});
