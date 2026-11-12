// Motor IA (Atendimento V0.9) — oportunidade na passagem (12/11/2026).
// 1) Responsável: a regra cria a oportunidade na 1ª mensagem, quando ninguém atende ainda → fica com quem o lojista
//    escolheu (ex.: a pré-venda). No modo "passa para o vendedor", toda passagem para um vendedor (rodízio ou [PESSOA:x])
//    troca o responsável da oportunidade aberta para ele, mesmo sem mudar a etapa. No modo "fixo" nada muda.
// 2) Valor: o veículo/item de interesse é o último que a IA mostrou com foto ([FOTO:id]); fica em estado.interesse.
//    A oportunidade nasce com o preço dele e o valor acompanha quando o cliente troca de veículo (só o funil vê:
//    vale mesmo com "não fala preço"). Sem preço (sob consulta) ou sem veículo mostrado → fica como está.
// 3) Resumo: na passagem para uma pessoa, o resumo da passagem entra na descrição da oportunidade aberta.
// Cada "de" tem de existir uma única vez; se o fluxo mudar, nada é salvo.
const TROCAS_RESP = {
 'Ler Resposta': [
  ["estado.vistos = vistos;",
   "estado.vistos = vistos;\n" +
   "// LeadVox IA — veículo/item de interesse: o que a IA mostrou com foto neste turno (vários de uma vez: fica o anterior se ele estiver entre eles)\n" +
   "{ const __ids = [...new Set(fotos.map(x => String(x.id)))]; const __ant = estado.interesse ? String(estado.interesse.id) : '';\n" +
   "  const __id = __ids.length === 1 ? __ids[0] : (__ids.includes(__ant) ? __ant : (__ids[0] || ''));\n" +
   "  const __it = __id ? conhecidos[__id] : null;\n" +
   "  if (__it) estado.interesse = { id: __it.id, nome: __it.nome, preco: __it.precoTipo === 'consulta' ? null : (Number(__it.preco) || null), turno: true };\n" +
   "  else if (estado.interesse) estado.interesse.turno = false; }"]
 ],
 'AÇÕES Preparar': [
  ["const origem = a.origem && Number(a.origem.id) ? a.origem : null;",
   "const origem = a.origem && Number(a.origem.id) ? a.origem : null;\n" +
   "// passagem para um vendedor (rodízio ou pessoa) no modo \"passa para o vendedor\": a oportunidade aberta passa a ser dele\n" +
   "let __feT = {}; try { __feT = $('Fila de Envio').first().json.transf || {}; } catch (e) {}\n" +
   "const trocaResp = rg.responsavel !== 'fixo' && __feT.humano ? ((r.transf && r.transf.pessoa && Number(r.transf.pessoa.id)) || (__feT.vendedor && Number(__feT.vendedor.id)) || null) : null;\n" +
   "// valor da oportunidade: preço do veículo/item de interesse; resumo da passagem para a descrição\n" +
   "const __int = (r.estado || {}).interesse || null;\n" +
   "const valor = __int && Number(__int.preco) > 0 ? Number(__int.preco) : 0;\n" +
   "const valorNovo = !!(valor && __int.turno);\n" +
   "const resumoPassagem = __feT.humano && r.transf && r.transf.resumo ? String(r.transf.resumo).slice(0, 3000) : '';"],
  ["if (!etapa && !avisos.length && !origem && !fechar) return [];",
   "if (!etapa && !avisos.length && !origem && !fechar && !trocaResp && !valorNovo && !resumoPassagem) return [];"],
  ["etapa, fechar, temEtapa: !!((etapa || fechar) && contactId), contactId, avisos,",
   "etapa, fechar, trocaResp, valor, veiculo: __int ? String(__int.nome || '') : '', resumoPassagem, temEtapa: !!((etapa || fechar || trocaResp || valorNovo || resumoPassagem) && contactId), contactId, avisos,"]
 ],
 'AÇÕES Montar': [
  // oportunidade nova: já nasce com o valor e o veículo de interesse
  ["description: ('Criada pela IA ' + p.agente + '.' + (p.resumo ? '\\n' + p.resumo : '')).slice(0, 6000),\nvalue: 0,",
   "description: ('Criada pela IA ' + p.agente + '.' + (p.veiculo ? '\\nInteresse: ' + p.veiculo : '') + (p.resumo ? '\\n' + p.resumo : '')).slice(0, 6000),\nvalue: Number(p.valor) || 0,"],
  ["// LeadVox IA — cliente disse que comprou ou desistiu: o card aberto vai para Ganho ou Perdido",
   "// LeadVox IA — oportunidade aberta: responsável na passagem, valor do veículo de interesse e resumo da passagem\n" +
   "if (aberta) {\n" +
   "const novoResp = p.trocaResp && Number(aberta.responsibleId) !== Number(p.trocaResp) ? Number(p.trocaResp) : null;\n" +
   "const novoValor = Number(p.valor) > 0 && Number(aberta.value) !== Number(p.valor) ? Number(p.valor) : null;\n" +
   "const desc0 = String(aberta.description || '');\n" +
   "const novaDesc = p.resumoPassagem && !desc0.includes(p.resumoPassagem.slice(0, 80))\n" +
   "  ? (desc0 + (desc0 ? '\\n\\n' : '') + 'Passagem (' + new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + (p.veiculo ? ' · interesse: ' + p.veiculo : '') + '):\\n' + p.resumoPassagem).slice(0, 6000) : null;\n" +
   "const put = reqs.find(x => x.method === 'PUT' && x.url === p.base + '/opportunities/' + aberta.id);\n" +
   "if (put) {\n" +
   "  if (novoResp) { put.body.responsibleId = novoResp; put.body.userId = String(novoResp); }\n" +
   "  if (novoValor) put.body.value = novoValor;\n" +
   "  if (novaDesc) put.body.description = novaDesc;\n" +
   "} else if (novoResp || novoValor || novaDesc) {\n" +
   "  reqs.push({ method: 'PUT', url: p.base + '/opportunities/' + aberta.id, body: {\n" +
   "  name: aberta.name, description: novaDesc || desc0, value: novoValor || Number(aberta.value) || 0,\n" +
   "  expectedCloseDate: String(aberta.expectedCloseDate || '').slice(0, 10) || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),\n" +
   "  contactId: p.contactId, responsibleId: novoResp || Number(aberta.responsibleId), pipelineStepId: Number(aberta.pipelineStepId),\n" +
   "  userId: String(novoResp || aberta.userId || aberta.responsibleId) } });\n" +
   "}\n" +
   "}\n" +
   "// LeadVox IA — cliente disse que comprou ou desistiu: o card aberto vai para Ganho ou Perdido"]
 ]
};
if (typeof module !== 'undefined') module.exports = { TROCAS_RESP };
