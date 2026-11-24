// Motor IA (Atendimento V0.9) — rodízio entre lojas (24/11/2026).
// Empresa com mais de uma loja: cada loja é um departamento da LeadVox e, no painel (Ações e regras → Departamentos),
// as lojas recebem o mesmo "grupo" (ex.: "Lojas"). O lead novo gira entre as lojas do grupo e, dentro da loja da vez,
// segue o rodízio de vendedores que já existe (mesma vez, mesma carteira, mesma troca por tempo):
//   lead 1 → Loja 1 / vendedor 1, lead 2 → Loja 2 / vendedor 1, lead 3 → Loja 3 / vendedor 1, lead 4 → Loja 1 / vendedor 2…
// • Entra no rodízio de lojas: regra [DEPARTAMENTO:<grupo>], a IA passando para o grupo, ou a passagem que cai no
//   departamento padrão quando ele é de um grupo (inclusive o encerramento do Guardião e o fim do follow-up).
// • Regra ou cliente que pede uma loja pelo nome vai direto para ela.
// • Cliente que já foi de uma loja do grupo volta para a MESMA loja (carteira da loja), sem gastar a vez de ninguém.
// A vez e a carteira das lojas ficam em $getWorkflowStaticData('global') (rodizioLojaIag / carteiraLojaIag), como as dos vendedores.
// Cada "de" tem de existir uma única vez; se o fluxo mudar, nada é salvo.
// Uso no console do n8n: const novo = aplicarRodizioLojas(atend) → cópia trocada.

// escolha da loja (bloco que entra na Fila de Envio, testado sozinho em tests/rodizio-lojas.test.mjs)
const ESCOLHER_LOJA = `  // LeadVox IA — rodízio entre lojas: departamentos com o mesmo "grupo" giram entre si; dentro da loja da vez segue o rodízio de vendedores.
  const __gNome = (x) => norm(x && x.grupo);
  let __grupo = alvo && !setores.some(x => norm(x.nome) === alvo) && setores.some(x => __gNome(x) === alvo) ? alvo : '';
  let setor = __grupo ? null : (setores.find(x => norm(x.nome) === alvo) || (alvo && setores.find(x => norm(x.nome).includes(alvo) || alvo.includes(norm(x.nome)))) || null);
  const caiuNoPadrao = !setor && !__grupo;
  if (!setor && !__grupo) setor = setores.find(x => x.padrao) || setores[0] || null;
  if (!__grupo && setor && __gNome(setor) && (caiuNoPadrao || r.origemAcao === 'guardiao' || r.origemAcao === 'followup_fim') && !(r.transf.pessoa && r.transf.pessoa.id)) __grupo = __gNome(setor);
  let __lojaRod = null;
  if (__grupo) {
    const __lojas = setores.filter(x => __gNome(x) === __grupo && Number(x.filaId));
    if (__lojas.length) {
      const __sdL = $getWorkflowStaticData('global'); __sdL.rodizioLojaIag = __sdL.rodizioLojaIag || {}; __sdL.carteiraLojaIag = __sdL.carteiraLojaIag || {};
      const __chL = r.conta + ':' + __grupo, __ckL = r.conta + ':' + r.tel + ':' + __grupo;
      const __antes = __sdL.carteiraLojaIag[__ckL] ? __lojas.find(x => Number(x.filaId) === Number(__sdL.carteiraLojaIag[__ckL].filaId)) || null : null;
      if (__antes) { setor = __antes; __lojaRod = { nome: s(__antes.nome), carteira: true }; }
      else { const __p = (Number(__sdL.rodizioLojaIag[__chL]) || 0) % __lojas.length; __sdL.rodizioLojaIag[__chL] = __p + 1; setor = __lojas[__p]; __lojaRod = { nome: s(setor.nome), carteira: false }; }
      __sdL.carteiraLojaIag[__ckL] = { filaId: Number(setor.filaId), ts: Date.now() };
      const __ksL = Object.keys(__sdL.carteiraLojaIag); if (__ksL.length > 3000) { const __limL = Date.now() - 90 * 864e5; __ksL.forEach(k => { if ((__sdL.carteiraLojaIag[k].ts || 0) < __limL) delete __sdL.carteiraLojaIag[k]; }); }
    } else if (!setor) setor = setores.find(x => x.padrao) || setores[0] || null;
  }
`;

const TROCAS_LOJAS = {
 'Fila de Envio': [
  ["  let setor = setores.find(x => norm(x.nome) === alvo) || (alvo && setores.find(x => norm(x.nome).includes(alvo) || alvo.includes(norm(x.nome)))) || null;\n  const caiuNoPadrao = !setor;\n  if (!setor) setor = setores.find(x => x.padrao) || setores[0] || null;\n",
   ESCOLHER_LOJA],
  ["vendedorRod ? '👤 Para: *' + vendedorRod.nome + '* (rodízio do setor)' : '',",
   "vendedorRod ? '👤 Para: *' + vendedorRod.nome + '* (rodízio do setor)' : '',\n__lojaRod ? '🏬 Loja: *' + __lojaRod.nome + '* (' + (__lojaRod.carteira ? 'cliente já era desta loja' : 'rodízio entre lojas') + ')' : '',"]
 ],
 'Montar Prompt': [
  ["  const pad = setores.find(x => x.padrao) || setores[0];\n  L.push('Setor padrão (dúvida, ou cliente pedindo para falar com uma pessoa): *' + s(pad.nome) + '*.');",
   "  // LeadVox IA — rodízio entre lojas: o grupo aparece como um setor; a loja só pelo nome quando o cliente escolhe\n" +
   "  const __grupos = {}; setores.forEach(x => { const g = s(x.grupo); if (g && Number(x.filaId)) (__grupos[g.toLowerCase()] = __grupos[g.toLowerCase()] || { nome: g, lojas: [] }).lojas.push(s(x.nome)); });\n" +
   "  Object.values(__grupos).filter(g => g.lojas.length).forEach(g => L.push('- *' + g.nome + '* — rodízio entre as lojas (' + g.lojas.join(', ') + '): use este quando o cliente não escolheu loja; se ele pedir uma loja específica, use o nome dela.'));\n" +
   "  const pad = setores.find(x => x.padrao) || setores[0];\n  L.push('Setor padrão (dúvida, ou cliente pedindo para falar com uma pessoa): *' + (s(pad.grupo) && Number(pad.filaId) ? s(pad.grupo) : s(pad.nome)) + '*.');"]
 ]
};

function aplicarRodizioLojas(atendOrig) {
  const atend = JSON.parse(JSON.stringify(atendOrig));
  for (const [nome, lista] of Object.entries(TROCAS_LOJAS)) {
    const n = atend.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome);
    let c = n.parameters.jsCode;
    for (const [de, para] of lista) { const k = c.split(de).length - 1; if (k !== 1) throw new Error(nome + ': trecho achado ' + k + 'x: ' + de.slice(0, 60)); c = c.replace(de, () => para); }
    n.parameters.jsCode = c;
  }
  return atend;
}
if (typeof module !== 'undefined') module.exports = { aplicarRodizioLojas, ESCOLHER_LOJA, TROCAS_LOJAS };
