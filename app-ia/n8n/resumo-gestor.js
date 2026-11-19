// Motor IA (Atendimento V0.9) — resumo de verdade na nota interna e resumo gerencial para o dono (19/11/2026).
// Problema: a regra da loja pede [NOTA: resumo do atendimento ... e o próximo passo], mas quando a IA não escrevia o
// [RESUMO:n|...], o motor colocava na nota a ÚLTIMA mensagem do cliente ("Cliente disse: ..."). E o aviso ao dono
// (Avisos → Avisar o gerente) repetia as linhas da nota, sem dizer com quem está o atendimento.
// Agora:
//  1. Montar Prompt: o [RESUMO:n|...] é obrigatório junto do [REGRA:n], cobre a conversa toda e termina com "Próximo passo:".
//     No [TRANSFERIR] o "Resumo" cobre o atendimento todo e entra a linha "Gestor" (visão para o dono, em 1 frase).
//  2. Ler Resposta: sem [RESUMO], a nota é montada com o que a IA já coletou (resumo/orientação do [TRANSFERIR],
//     veículo de interesse e dados da conversa). Nunca mais a última mensagem do cliente.
//  3. Avisos Preparar: o aviso ao dono vira um resumo gerencial: com quem está, interesse, pagamento, visita,
//     leitura do lead e próximo passo.
// Cada "de" tem de existir uma única vez: se o fluxo mudar, nada é salvo.
// Uso no console do n8n: aplicarResumoGestor(wf) devolve o fluxo trocado.
const MARCA = 'LeadVox IA — resumo gerencial';

const TROCAS = {
 'Montar Prompt': [
  ["'Se a regra tiver \"RESUMO pedido\", escreva junto, também no fim da resposta, [RESUMO:número|texto]: um resumo para a equipe, em uma linha, com esses itens preenchidos com o que o cliente disse nesta conversa. Escreva os fatos, nunca o texto da regra nem o que foi pedido. O que o cliente não disse, escreva \"não informado\". O cliente não vê o resumo.',",
   "'Se a regra tiver \"RESUMO pedido\", é OBRIGATÓRIO escrever junto, na mesma resposta e também no fim, [RESUMO:número|texto]: um resumo do ATENDIMENTO INTEIRO para a equipe, em uma linha, com esses itens preenchidos com o que o cliente disse em toda a conversa (não só na última mensagem). Escreva os fatos, nunca o texto da regra nem o que foi pedido, e nunca copie a mensagem do cliente. O que o cliente não disse, escreva \"não informado\". Termine com \"Próximo passo:\" e a orientação para o vendedor em 1 frase. O cliente não vê o resumo.', // " + MARCA],
  ["'Resumo: o que o cliente quer, em 1 ou 2 frases', 'Orientação: o próximo passo para o vendedor, em 1 frase (ex.: ligar hoje e mandar a simulação com entrada de 10 mil)', '[/TRANSFERIR]',",
   "'Resumo: o atendimento inteiro em 1 ou 2 frases: o que o cliente quer e o que já ficou combinado (nunca copie a última mensagem dele)', 'Orientação: o próximo passo para o vendedor, em 1 frase (ex.: ligar hoje e mandar a simulação com entrada de 10 mil)', 'Gestor: para o dono da loja, em 1 frase: se o cliente está quente, morno ou frio e o ponto de atenção', '[/TRANSFERIR]',"]
 ],
 'Ler Resposta': [
  ["else if (cod === 'NOTA' || cod === 'AVISAR') (cod === 'NOTA' ? tNotaRg : tAvisar).push(__resumos[num] || ('Cliente disse: \"' + __ultimaMsg + '\"'));",
   "else if (cod === 'NOTA' || cod === 'AVISAR') (cod === 'NOTA' ? tNotaRg : tAvisar).push(__resumos[num] || __resumoSemIA());"],
  ["const __ultimaMsg = s(g.mensagem).slice(0, 200);",
   "const __ultimaMsg = s(g.mensagem).slice(0, 200);\n" +
   "// " + MARCA + ": a IA não escreveu o [RESUMO]: monta com o que ela já coletou. Nunca a última mensagem do cliente.\n" +
   "const __resumoSemIA = () => {\n" +
   "  const vazio = (v) => !s(v) || /^n[aã]o informad[oa]$/i.test(s(v));\n" +
   "  const dT = bTransf !== null ? linhas(bTransf) : {}, pT = (re) => { for (const k of Object.keys(dT)) if (re.test(k)) return s(dT[k]); return ''; };\n" +
   "  const col = { ...((estado.coleta && typeof estado.coleta === 'object') ? estado.coleta : {}), ...dT };\n" +
   "  const fatos = Object.entries(col).filter(([k, v]) => !/^(setor|departamento|resumo|motivo|orienta[cç][aã]o|gestor|nome)$/i.test(s(k)) && !vazio(v)).map(([k, v]) => s(k) + ': ' + s(v));\n" +
   "  const it = estado.interesse && estado.interesse.nome ? 'Interesse: ' + s(estado.interesse.nome) : '';\n" +
   "  const partes = [pT(/^resumo$/i), it && !fatos.some(f => /^(ve[ií]culo|carro|modelo|interesse)/i.test(f)) ? it : '', ...fatos].filter(Boolean);\n" +
   "  const prox = pT(/^orienta[cç][aã]o$/i);\n" +
   "  if (!partes.length) return 'Resumo: a IA ainda não tem dados do cliente nesta conversa. Próximo passo: ler a conversa e dar sequência ao atendimento.';\n" +
   "  return (partes.join(' · ') + (prox ? ' · Próximo passo: ' + prox : '')).slice(0, 600);\n" +
   "};"],
  ["Object.entries(dadosT).forEach(([k, v]) => { if (!['setor', 'resumo', 'motivo'].includes(k.toLowerCase())) dados[k] = v; });\n  transf = { setor: pegaT('setor', 'departamento'), resumo: pegaT('resumo'), motivo: pegaT('motivo'), dados, forcarHumano: false };",
   "Object.entries(dadosT).forEach(([k, v]) => { if (!['setor', 'resumo', 'motivo', 'gestor'].includes(k.toLowerCase())) dados[k] = v; });\n  transf = { setor: pegaT('setor', 'departamento'), resumo: pegaT('resumo'), motivo: pegaT('motivo'), gestor: pegaT('gestor'), dados, forcarHumano: false }; // " + MARCA],
  // a leitura para o dono não aparece para o vendedor (plugin)
  ["if (kk && vv && !/^n[aã]o informad[oa]$/i.test(vv)) __c[kk] = vv;",
   "if (kk && vv && !/^gestor$/i.test(kk) && !/^n[aã]o informad[oa]$/i.test(vv)) __c[kk] = vv;"]
 ],
 'Avisos Preparar': [
  ["  const linhas = String(f.nota || '').split('\\n').slice(1)\n    .filter(l => l.trim() && !/^_|^⚙️|^Telefone:/.test(l.trim())).slice(0, 14);\n  const corpo = [\n    '🔔 *' + (humano ? 'Cliente passado para a equipe' : 'Cliente passado para outro agente') + '* · ' + ((f.transf && f.transf.setor) || 'Equipe'),\n    'Agente: ' + (A.nome || 'IA') + (A.contaNome ? ' · ' + A.contaNome : ''),\n    'Cliente: ' + (est.nome || 'sem nome') + ' · ' + fmtTel(f.tel),\n    ...linhas\n  ].join('\\n').slice(0, 3500);",
   "  // " + MARCA + ": visão do dono — com quem está, o que o cliente quer, leitura do lead e próximo passo\n" +
   "  let __lrG = {}; try { __lrG = $('Ler Resposta').first().json || {}; } catch (e) {}\n" +
   "  const __tG = __lrG.transf || {}, __dG = __tG.dados || {}, __tr = f.transf || {};\n" +
   "  const __ok = (v) => String(v ?? '').trim() && !/^(n[aã]o informad[oa]|-)$/i.test(String(v).trim());\n" +
   "  const __pg = (re) => { for (const [k, v] of Object.entries(__dG)) if (re.test(k) && __ok(v)) return String(v).trim(); for (const [k, v] of Object.entries(est.coleta || {})) if (re.test(k) && __ok(v)) return String(v).trim(); return ''; };\n" +
   "  const __nl = String(f.nota || '').split('\\n').map(l => l.trim());\n" +
   "  const __pessoa = ((__nl.find(l => /^👤 Para:/.test(l)) || '').replace(/^👤 Para:\\s*/, '').replace(/\\*/g, '').replace(/\\s*\\(rodízio do setor\\)$/, ''));\n" +
   "  const __setor = __tr.setor || 'Equipe';\n" +
   "  const __com = __tr.autocerto ? 'AutoCerto (distribui para a equipe)' : __pessoa ? __pessoa + ' · ' + __setor : !humano && __tr.destAgente ? 'IA ' + __tr.destAgente + ' · ' + __setor : __setor + ' · ainda sem vendedor definido';\n" +
   "  const __int = (est.interesse && est.interesse.nome) || __pg(/ve[ií]culo|carro|modelo|interesse/i);\n" +
   "  const __ent = __pg(/entrada/i), __tro = __pg(/troca/i), __par = __pg(/parcela/i);\n" +
   "  const __pag = [__pg(/pagamento/i), __ent ? 'entrada ' + __ent : '', __par ? 'parcela ' + __par : '', __tro ? 'troca: ' + __tro : ''].filter(Boolean).join(' · ');\n" +
   "  const __vis = __pg(/visita|agend/i);\n" +
   "  const __ler = __ok(__tG.gestor) ? String(__tG.gestor).trim() : __ok(__tG.resumo) ? String(__tG.resumo).trim() : ((__nl.find(l => /^Resumo:/.test(l)) || '').replace(/^Resumo:\\s*/, '') || (__nl.find(l => /^📝/.test(l)) || '').replace(/^📝\\s*/, ''));\n" +
   "  const __prox = __pg(/orienta/i);\n" +
   "  const corpo = [\n" +
   "    '📊 *Resumo para o gestor* · ' + (humano ? 'cliente passado para a equipe' : 'cliente passado para outro agente') + (A.contaNome ? ' · ' + A.contaNome : ''),\n" +
   "    '👤 ' + (est.nome || 'Cliente sem nome') + ' · ' + fmtTel(f.tel),\n" +
   "    '📍 Com quem está: ' + __com + (__tr.iaContinua ? ' (a IA segue acompanhando)' : ''),\n" +
   "    __int ? '🚗 Interesse: ' + __int : '',\n" +
   "    __pag ? '💳 ' + __pag : '',\n" +
   "    __vis ? '📅 Visita: ' + __vis : '',\n" +
   "    __ler ? '🌡️ ' + __ler.slice(0, 400) : '',\n" +
   "    __prox ? '➡️ Próximo passo: ' + __prox.slice(0, 300) : '',\n" +
   "    ...__nl.filter(l => /^🌙|^⚠️/.test(l)),\n" +
   "    '_Atendido pela IA ' + (A.nome || '') + '_'\n" +
   "  ].filter(Boolean).join('\\n').slice(0, 3500);"]
 ]
};

function aplicarResumoGestor(wf) {
 const erros = [];
 if (wf.nodes.some(n => String((n.parameters || {}).jsCode || '').includes(MARCA))) throw new Error('já aplicado');
 const nodes = wf.nodes.map(n => {
  const t = TROCAS[n.name]; if (!t) return n;
  let c = n.parameters.jsCode;
  for (const [de, para] of t) { const k = c.split(de).length - 1; if (k !== 1) erros.push(n.name + ': achei ' + k + 'x ' + de.slice(0, 50)); else c = c.replace(de, () => para); }
  return { ...n, parameters: { ...n.parameters, jsCode: c } };
 });
 const faltam = Object.keys(TROCAS).filter(k => !wf.nodes.some(n => n.name === k));
 if (faltam.length) erros.push('sem o nó ' + faltam.join(', '));
 if (erros.length) throw new Error(erros.join(' | '));
 return { ...wf, nodes };
}
if (typeof module !== 'undefined') module.exports = { TROCAS, MARCA, aplicarResumoGestor };
