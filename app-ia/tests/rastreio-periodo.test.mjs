import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
const ctx={};vm.runInNewContext(js.slice(js.indexOf('const RS_PERIODOS'),js.indexOf('// FIM periodoRastreio'))+';globalThis.p=periodoRastreio;',ctx);
const p=(per,hoje='2026-11-12')=>{const r=ctx.p(per,hoje);return [r.ini,r.fim,r.rotulo];};

test('Resultados: atalhos de período em datas de São Paulo', () => {
 assert.deepEqual(p({tipo:'hoje'}),['2026-11-12','2026-11-12','Hoje, 12/11']);
 assert.deepEqual(p({tipo:'ontem'}),['2026-11-11','2026-11-11','Ontem, 11/11']);
 assert.deepEqual(p({tipo:'ontem'},'2026-03-01'),['2026-02-28','2026-02-28','Ontem, 28/02']);
 assert.deepEqual(p({tipo:'7'}),['2026-11-06','2026-11-12','Últimos 7 dias (06/11 a 12/11)']);
 assert.deepEqual(p({tipo:'30'}),['2026-10-14','2026-11-12','Últimos 30 dias (14/10 a 12/11)']);
 assert.deepEqual(p({tipo:'mes'}),['2026-11-01','2026-11-12','Este mês (01/11 a 12/11)']);
 assert.deepEqual(p({tipo:'mespassado'}),['2026-10-01','2026-10-31','Mês passado (01/10 a 31/10)']);
 assert.deepEqual(p({tipo:'mespassado'},'2026-01-15'),['2025-12-01','2025-12-31','Mês passado (01/12 a 31/12)']);
 assert.deepEqual(p({tipo:'mespassado'},'2028-03-05').slice(0,2),['2028-02-01','2028-02-29']);
});

test('Resultados: personalizado troca a ordem, não passa de hoje nem de 366 dias; sem escolha cai em 7 dias', () => {
 assert.deepEqual(p({tipo:'pers',de:'2026-11-01',ate:'2026-11-05'}),['2026-11-01','2026-11-05','01/11 a 05/11']);
 assert.deepEqual(p({tipo:'pers',de:'2026-11-05',ate:'2026-11-01'}).slice(0,2),['2026-11-01','2026-11-05']);
 assert.deepEqual(p({tipo:'pers',de:'2026-11-10',ate:'2026-12-20'}).slice(0,2),['2026-11-10','2026-11-12']);
 assert.deepEqual(p({tipo:'pers',de:'2026-11-03',ate:'2026-11-03'}),['2026-11-03','2026-11-03','Dia 03/11/2026']);
 assert.deepEqual(p({tipo:'pers',de:'2025-12-20',ate:'2026-01-10'}),['2025-12-20','2026-01-10','20/12 a 10/01 (2025–2026)']);
 const longo=p({tipo:'pers',de:'2024-01-01',ate:'2026-11-12'});assert.deepEqual(longo.slice(0,2),['2025-11-12','2026-11-12']);
 assert.ok((Date.parse(longo[1])-Date.parse(longo[0]))/864e5<=366);
 assert.equal(ctx.p({tipo:'pers',de:'lixo',ate:''},'2026-11-12').tipo,'7');
 assert.equal(ctx.p(null,'2026-11-12').ini,'2026-11-06');
 assert.equal(ctx.p({tipo:'90'},'2026-11-12').tipo,'7','o antigo 90 dias vira 7 dias');
});

test('Resultados: a tela tem os atalhos novos, o Personalizado e lembra a escolha', () => {
 assert.doesNotMatch(js,/\[7, 30, 90\]\.map\(n => `<button type="button" class="sm\$\{n === rastPeriodo/);
 for(const s of ["['hoje', 'Hoje']","['ontem', 'Ontem']","['mes', 'Este mês']","['mespassado', 'Mês passado']","['pers', 'Personalizado']",'id="rsDe"','id="rsAte"','id="rsAplicar"',"'lv_rs_periodo'"])assert.ok(js.includes(s),s);
});
