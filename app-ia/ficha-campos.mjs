// As etapas e os campos da Ficha de Implantação (../ficha/index.html), em formato enxuto, para o Painel LeadVox mostrar as respostas.
// A página da ficha é a fonte: quando ela mudar, rode `node ficha-campos.mjs` nesta pasta para refazer public/ficha-campos.js
// (o teste ficha-painel avisa se ficar diferente).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Lê a lista ETAPAS do HTML da ficha e devolve só o que o painel usa: títulos, chave, rótulo, tipo e colunas.
export function extrair(html) {
  const ini = html.indexOf('const ETAPAS = ['), fim = html.indexOf('\n];', ini);
  if (ini < 0 || fim < 0) throw Error('Não achei a lista ETAPAS na página da ficha.');
  const tipos = /const TIPOS_CAMPO = (\[[^\]]*\]);/.exec(html), dias = /const DIAS = (\[.*\]);/.exec(html);
  if (!tipos || !dias) throw Error('Não achei TIPOS_CAMPO ou DIAS na página da ficha.');
  const etapas = new Function(`const CRM = 'crm', IA = 'ia', TIPOS_CAMPO = ${tipos[1]}, DIAS = ${dias[1]}; ${html.slice(ini, fim + 3)} return ETAPAS;`)();
  const campo = c => ({ k: c.k, l: c.l, t: c.t, ...(c.cols ? { cols: c.cols.map(campo) } : {}) });
  return etapas.map(e => ({ id: e.id, titulo: e.titulo, blocos: e.blocos.map(b => ({ titulo: b.titulo, campos: b.campos.map(campo) })) }));
}
export const arquivo = etapas => '// Gerado por ficha-campos.mjs a partir de ../ficha/index.html. Não edite à mão.\nexport const FICHA_ETAPAS = ' + JSON.stringify(etapas) + ';\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const etapas = extrair(readFileSync(new URL('../ficha/index.html', import.meta.url), 'utf8'));
  writeFileSync(new URL('./public/ficha-campos.js', import.meta.url), arquivo(etapas));
  console.log('public/ficha-campos.js refeito: ' + etapas.length + ' etapas, ' + etapas.reduce((t, e) => t + e.blocos.reduce((s, b) => s + b.campos.length, 0), 0) + ' campos.');
}
