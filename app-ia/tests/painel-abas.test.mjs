import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('menu: um item Painel com as abas Visão geral, Oportunidades e Anúncios; os endereços antigos continuam', () => {
 const menu=js.slice(js.indexOf('const MENU = ['),js.indexOf('];',js.indexOf('const MENU = [')));
 assert.match(menu,/\['painel', 'Painel'/);
 for(const pg of ['dashboard','oportunidades','rastreio'])assert.doesNotMatch(menu,new RegExp("\\['"+pg+"'"),pg+' saiu do menu');
 assert.match(js,/\['dashboard', 'Visão geral'[\s\S]*\['oportunidades', 'Oportunidades'[\s\S]*\['rastreio', 'Anúncios'/);
 for(const pg of ['dashboard','oportunidades','rastreio'])assert.match(html,new RegExp('id="painelAbas"[\\s\\S]*data-ir="'+pg+'"'),pg);
 assert.match(js,/if \(pg === 'painel'\) pg = painelAba;/);
 assert.match(js,/SECAO = \{[^}]*painel: 'vDashboard'[^}]*dashboard: 'vDashboard'[^}]*oportunidades: 'vOportunidades'[^}]*rastreio: 'vRastreio'/);
});

test('rastreamento: três passos com status; o que falta vem aberto e cada bloco tem o seu Salvar', () => {
 assert.match(js,/passo\(1, 'Eventos da LeadVox'/);assert.match(js,/passo\(2, 'Pixel da Meta'/);assert.match(js,/passo\(3, 'Quando avisar a Meta'/);
 assert.match(js,/rsAbertos = new Set\(\[1, 2, 3\]\.filter\(k => !ps\[k\]\[2\]\)\)/);
 assert.match(js,/'Falta configurar'/);
 assert.match(js,/\$\('rsMeta'\)\.onsubmit = ev => \{ ev\.preventDefault\(\); salvarRastreio\(undefined, 2\); \}/);
 assert.match(js,/\$\('rsQuando'\)\.onsubmit = ev => \{ ev\.preventDefault\(\); salvarRastreio\(undefined, 3\); \}/);
 assert.doesNotMatch(js,/clique em Salvar no passo 2/);
});
