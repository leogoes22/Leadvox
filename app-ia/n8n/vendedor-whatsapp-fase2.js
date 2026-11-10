// Motor IA (Atendimento V0.9) — fase 2 do vendedor no WhatsApp (10/11/2026), aplicada depois de vendedor-whatsapp.js.
// • Cliente já com o vendedor (modo "IA continua") diz claramente que comprou ou desistiu: [GANHO: …] / [PERDIDO: …]
//   → o card aberto vai para Ganho/Perdido (PUT {raiz}/opportunity/{id}/status) e o vendedor recebe o aviso.
// • Follow-up depois da passagem: retorno do cliente em 18 h (cabe na janela de 24 h do WhatsApp oficial) e,
//   se ele não respondeu, "conseguiu fechar?" em 4 dias. A resposta volta para a IA (repassa, alerta ou fecha o card).
// Cada "de" tem de existir uma única vez; se o fluxo mudar, nada é salvo.
const TROCAS2 = {
 'Montar Prompt': [
  ["    '- Use [TRANSFERIR] de novo só se o cliente pedir um assunto de outro setor.', '');",
   "    '- Cliente dizendo com todas as letras que JÁ COMPROU com a loja (fechou, assinou, pegou o veículo): parabenize e escreva no fim [GANHO: o que ele disse, em poucas palavras].',\n" +
   "    '- Cliente dizendo com todas as letras que comprou em outro lugar ou desistiu de vez: agradeça, deixe a porta aberta e escreva no fim [PERDIDO: o motivo, em poucas palavras].',\n" +
   "    '- Na dúvida (\"vou pensar\", \"ainda estou vendo\"), não use [GANHO] nem [PERDIDO].',\n" +
   "    '- Use [TRANSFERIR] de novo só se o cliente pedir um assunto de outro setor.', '');"]
 ],
 'Ler Resposta': [
  ["avisos: __acRg.some(a => a.cod === 'AVISAR') && s((c.regras || {}).grupo) ? tAvisar.map(s).filter(Boolean).slice(0, 2) : []\n};",
   "avisos: __acRg.some(a => a.cod === 'AVISAR') && s((c.regras || {}).grupo) ? tAvisar.map(s).filter(Boolean).slice(0, 2) : []\n};\n" +
   "// LeadVox IA — cliente já com o vendedor disse que comprou ou desistiu: fecha o card (Ganho/Perdido) e avisa o vendedor\n" +
   "{ const tG = tags('GANHO'), tP = tags('PERDIDO'); if ((estado || {}).vendedor && (tG.length || tP.length)) acoesIA.fechar = tG.length ? { status: 'won', motivo: s(tG[0]).slice(0, 200) } : { status: 'lost', motivo: s(tP[0]).slice(0, 200) }; }"]
 ],
 'AÇÕES Preparar': [
  ["const origem = a.origem && Number(a.origem.id) ? a.origem : null;",
   "const origem = a.origem && Number(a.origem.id) ? a.origem : null;\nconst fechar = a.fechar && /^(won|lost)$/.test(a.fechar.status) ? a.fechar : null;"],
  ["if (!etapa && !avisos.length && !origem) return [];", "if (!etapa && !avisos.length && !origem && !fechar) return [];"],
  ["etapa, temEtapa: !!(etapa && contactId), contactId, avisos,", "etapa, fechar, temEtapa: !!((etapa || fechar) && contactId), contactId, avisos,"]
 ],
 'AÇÕES Montar': [
  ["const etapaId = Number(p.etapa.id);", "const etapaId = p.etapa ? Number(p.etapa.id) : 0;"],
  ["if (aberta && Number(aberta.pipelineStepId) !== etapaId) {", "if (etapaId && aberta && Number(aberta.pipelineStepId) !== etapaId) {"],
  ["} else if (!aberta && resp) {", "} else if (etapaId && !aberta && resp) {"],
  ["pipelineStepId: etapaId, userId: String(resp) } });\n}\n}\n// origem do lead",
   "pipelineStepId: etapaId, userId: String(resp) } });\n}\n" +
   "// LeadVox IA — cliente disse que comprou ou desistiu: o card aberto vai para Ganho ou Perdido (rota da tela, aceita o token da conexão)\n" +
   "if (p.fechar && aberta) reqs.push({ method: 'PUT', url: p.raiz + '/opportunity/' + aberta.id + '/status', body: { id: aberta.id, pipelineStepId: etapaId || Number(aberta.pipelineStepId), status: p.fechar.status } });\n" +
   "}\n// origem do lead"]
 ],
 'Avisos Preparar': [
  ["const fuOn = fu.ativo === true && toques.length > 0 && !transferiu && !guardiao && Number(f.totalEnvios) > 0;",
   "const fuOn = fu.ativo === true && toques.length > 0 && !transferiu && !guardiao && Number(f.totalEnvios) > 0;\n" +
   "// LeadVox IA — passou para o vendedor com a IA continuando: retorno do cliente em 18 h e, sem resposta, \"conseguiu fechar?\" em 4 dias\n" +
   "// (18 h para caber na janela de 24 h do WhatsApp oficial; a resposta do cliente volta para a IA, que repassa, alerta ou fecha o card)\n" +
   "const __vdC = !!(transferiu && humano && f.transf && f.transf.iaContinua && f.transf.vendedor && f.transf.vendedor.nome && !guardiao && Number(f.totalEnvios) > 0);\n" +
   "const __pn = String(est.nome || '').trim().split(/\\s+/)[0] || '';\n" +
   "const posToques = __vdC ? [\n" +
   "  { min: 1080, texto: ('Oi' + (__pn ? ', ' + __pn : '') + '! Passando para saber como está o seu atendimento com ' + f.transf.vendedor.nome + '. Deu tudo certo até aqui?').slice(0, 400) },\n" +
   "  { min: 5760, texto: ('Oi' + (__pn ? ', ' + __pn : '') + ', tudo bem? Conseguiu fechar com ' + f.transf.vendedor.nome + ' ou ainda está avaliando? Se precisar de algo, estou por aqui 😉').slice(0, 400) }] : [];"],
  ["if (fuOn || retOn || slaOn) {", "if (fuOn || retOn || slaOn || __vdC) {"],
  ["teste: !!T.teste, transferido: transferiu,", "teste: !!T.teste, transferido: transferiu && !__vdC,"],
  ["toques: fuOn ? toques : [],", "toques: fuOn ? toques : (__vdC ? posToques : []),"],
  ["const maxMin = Math.max(fuOn ? toques[toques.length - 1].min : 0,", "const maxMin = Math.max(fuOn ? toques[toques.length - 1].min : 0, __vdC ? 5760 : 0,"],
  ["// ── 2b. aviso no GRUPO",
   "// cliente com o vendedor comprou ou desistiu: o vendedor fica sabendo (o card vai para Ganho ou Perdido)\n" +
   "const __fch = (__lr.acoesIA || {}).fechar;\n" +
   "if (__urlOk && est.vendedor && __fch) {\n" +
   "  const zv = __zapVend(est.vendedor.id);\n" +
   "  if (zv) out.push({ json: { tipo: 'envio', url: A.urlEnvio, corpo: JSON.stringify({ number: zv, body: [(__fch.status === 'won' ? '✅ *Cliente disse que comprou*' : '❌ *Cliente desistiu*'), 'Cliente: ' + (est.nome || 'sem nome') + ' · ' + fmtTel(f.tel), __fch.motivo ? '“' + __fch.motivo + '”' : '', '_O card foi para ' + (__fch.status === 'won' ? 'Ganho' : 'Perdido') + '. Se não for isso, ajuste na LeadVox._'].filter(Boolean).join('\\n').slice(0, 3500), externalKey: 'iag-vendedor' }) } });\n" +
   "}\n\n" +
   "// ── 2b. aviso no GRUPO"]
 ]
};
