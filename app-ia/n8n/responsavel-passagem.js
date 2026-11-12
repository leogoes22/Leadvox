// Motor IA (Atendimento V0.9) — responsável da oportunidade na passagem (12/11/2026).
// Problema (Brants car): a regra cria a oportunidade na 1ª mensagem, quando ninguém atende ainda → fica com a reserva (Thales).
// Na passagem para o vendedor (rodízio ou [PESSOA:x]) o motor só mexia na oportunidade se a etapa mudasse no mesmo turno.
// Agora, no modo "Quem está atendendo o cliente", toda passagem para um vendedor troca o responsável da oportunidade
// aberta para esse vendedor (mesmo sem mudar a etapa). No modo "responsável fixo" nada muda.
// Cada "de" tem de existir uma única vez; se o fluxo mudar, nada é salvo.
const TROCAS_RESP = {
 'AÇÕES Preparar': [
  ["const origem = a.origem && Number(a.origem.id) ? a.origem : null;",
   "const origem = a.origem && Number(a.origem.id) ? a.origem : null;\n" +
   "// passagem para um vendedor (rodízio ou pessoa) no modo \"quem está atendendo\": a oportunidade aberta passa a ser dele\n" +
   "let __feT = {}; try { __feT = $('Fila de Envio').first().json.transf || {}; } catch (e) {}\n" +
   "const trocaResp = rg.responsavel !== 'fixo' && __feT.humano ? ((r.transf && r.transf.pessoa && Number(r.transf.pessoa.id)) || (__feT.vendedor && Number(__feT.vendedor.id)) || null) : null;"],
  ["if (!etapa && !avisos.length && !origem && !fechar) return [];", "if (!etapa && !avisos.length && !origem && !fechar && !trocaResp) return [];"],
  ["etapa, fechar, temEtapa: !!((etapa || fechar) && contactId), contactId, avisos,", "etapa, fechar, trocaResp, temEtapa: !!((etapa || fechar || trocaResp) && contactId), contactId, avisos,"]
 ],
 'AÇÕES Montar': [
  ["// LeadVox IA — cliente disse que comprou ou desistiu: o card aberto vai para Ganho ou Perdido",
   "// LeadVox IA — passagem para um vendedor: a oportunidade aberta fica com ele (se a etapa não mudou neste turno, só troca o responsável)\n" +
   "if (p.trocaResp && aberta && Number(aberta.responsibleId) !== Number(p.trocaResp) && !reqs.some(x => x.method === 'PUT' && x.url === p.base + '/opportunities/' + aberta.id)) {\n" +
   "reqs.push({ method: 'PUT', url: p.base + '/opportunities/' + aberta.id, body: {\n" +
   "name: aberta.name, description: aberta.description || '', value: Number(aberta.value) || 0,\n" +
   "expectedCloseDate: String(aberta.expectedCloseDate || '').slice(0, 10) || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),\n" +
   "contactId: p.contactId, responsibleId: Number(p.trocaResp), pipelineStepId: Number(aberta.pipelineStepId),\n" +
   "userId: String(p.trocaResp) } });\n" +
   "}\n" +
   "// LeadVox IA — cliente disse que comprou ou desistiu: o card aberto vai para Ganho ou Perdido"]
 ]
};
