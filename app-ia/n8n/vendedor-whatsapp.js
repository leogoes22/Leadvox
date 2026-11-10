// Motor IA (Atendimento V0.9) — aviso ao VENDEDOR no WhatsApp e "IA continua depois da passagem" (10/11/2026).
// Trocas aplicadas nos nós Code do fluxo do n8n novo (dkipBj6hAhdu7OSp). Cada "de" tem de existir uma única vez:
// se o fluxo mudar, nada é salvo. Rodar no console do n8n logado: aplicarVendedorWhatsapp(wf) devolve o fluxo trocado.
// Painel: avisos.vendedor {ativo, iaContinua}; setores[i].vendedores[k].whatsapp (55 + DDD + número).
const TROCAS = {
 'Agente': [
  // padrão do painel
  ["resumo: { ativo: false, whatsapp: '', hora: 19 }, grupo:", "resumo: { ativo: false, whatsapp: '', hora: 19 }, vendedor: { ativo: false, iaContinua: false }, grupo:"],
  // número de vendedor do rodízio nunca vira atendimento (o "bom dia" diário que abre a janela do WhatsApp)
  ["const equipe = (Array.isArray(rota.equipe)",
   "// LeadVox IA — números dos vendedores do rodízio: mensagem deles nunca vira atendimento.\n" +
   "// Eles mandam \"bom dia\" ao número da IA todo dia para o aviso de cliente novo chegar sem modelo pago.\n" +
   "if (d.origem !== 'passagem') {\n" +
   "  const __u8 = (v) => String(v || '').replace(/\\D/g, '').slice(-8);\n" +
   "  const __vds = (Array.isArray(cfg.setores) ? cfg.setores : []).flatMap(x => x && Array.isArray(x.vendedores) ? x.vendedores.map(v => v && v.whatsapp) : []).map(__u8).filter(x => x.length === 8);\n" +
   // cfg.modoTeste direto: o simulador não tem a variável __mt do fluxo de produção (quebrou o "Testar a IA" em 10/11)
   "  const __mtq = cfg.modoTeste || {}; const __teste = Array.isArray(__mtq.numeros) && __mtq.numeros.map(__u8).includes(__u8(d.tel));\n" +
   "  if (__vds.includes(__u8(d.tel)) && !__teste) return [];\n" +
   "}\n" +
   "const equipe = (Array.isArray(rota.equipe)"]
 ],
 'Montar Prompt': [
  ["'Resumo: o que o cliente quer, em 1 ou 2 frases', '[/TRANSFERIR]',",
   "'Resumo: o que o cliente quer, em 1 ou 2 frases', 'Orientação: o próximo passo para o vendedor, em 1 frase (ex.: ligar hoje e mandar a simulação com entrada de 10 mil)', '[/TRANSFERIR]',"],
  ["L.push('# ESTE ATENDIMENTO',",
   "L.push('# ESTE ATENDIMENTO', '- O telefone do cliente o sistema já tem (é o número deste WhatsApp): NUNCA pergunte o telefone. Se um dado obrigatório for telefone ou celular, considere já coletado.',"],
  ["const primeira = !(lista(est.hist).length);",
   "const primeira = !(lista(est.hist).length);\n" +
   "// LeadVox IA — cliente já passado para o vendedor, com a IA continuando (Avisos → vendedor no WhatsApp)\n" +
   "if (est.vendedor && est.vendedor.nome && ((c.avisos || {}).vendedor || {}).iaContinua) {\n" +
   "  const __vn = s(est.vendedor.nome), __vd = s(est.vendedor.desde).slice(0, 10).split('-').reverse().join('/');\n" +
   "  L.push('# CLIENTE JÁ ESTÁ COM O VENDEDOR',\n" +
   "    '- Este cliente já foi passado para o vendedor ' + __vn + (__vd ? ' em ' + __vd : '') + '. O vendedor fala com ele pelo WhatsApp dele; você continua aqui, no número da loja.',\n" +
   "    '- Não refaça a qualificação nem peça os dados de novo. Não fale de preço, condição, desconto, avaliação nem prazo: isso é com o vendedor.',\n" +
   "    '- Na sua primeira resposta depois da passagem, pergunte com naturalidade como está sendo o atendimento com ' + __vn + '.',\n" +
   "    '- Cliente satisfeito: agradeça, diga que ' + __vn + ' cuida de tudo e que você segue à disposição por aqui.',\n" +
   "    '- Cliente reclamando, sem resposta ou dizendo que ninguém falou com ele: acolha, peça desculpas, diga que vai avisar a gerência agora e escreva no fim [ALERTA_GERENTE: o que aconteceu, em 1 frase].',\n" +
   "    '- Cliente mandou algo para o vendedor (documento, pedido de reserva, dúvida da negociação, horário de visita): diga que vai repassar e escreva no fim [RECADO_VENDEDOR: o recado, em 1 frase].',\n" +
   "    '- Use [TRANSFERIR] de novo só se o cliente pedir um assunto de outro setor.', '');\n" +
   "}"]
 ],
 'Ler Resposta': [
  ["const tEtq = tags('ETIQUETA');",
   "const tEtq = tags('ETIQUETA');\n" +
   "// LeadVox IA — cliente já com o vendedor: recado para ele e alerta para o gerente (o Avisos Preparar manda no WhatsApp)\n" +
   "const tRecado = tags('RECADO_VENDEDOR').map(v => String(v || '').trim()).filter(Boolean), tAlerta = tags('ALERTA_GERENTE').map(v => String(v || '').trim()).filter(Boolean);"],
  ["transf, estado, etiquetasIA:", "transf, estado, recadoVendedor: tRecado.join(' · ').slice(0, 500), alertaGerente: tAlerta.join(' · ').slice(0, 500), etiquetasIA:"]
 ],
 'Fila de Envio': [
  ["  const nomeSetor = setor ? s(setor.nome) : 'Equipe';",
   "  const nomeSetor = setor ? s(setor.nome) : 'Equipe';\n" +
   "  // LeadVox IA — vendedor avisado no WhatsApp com a IA continuando: o ticket fica com a IA (não muda de fila nem de dono)\n" +
   "  const __iaCont = humano && !!((c.avisos || {}).vendedor || {}).iaContinua && !!(setor && setor.distribuicao === 'rodizio' && Array.isArray(setor.vendedores) && setor.vendedores.length) && !(r.transf.pessoa && r.transf.pessoa.id);"],
  ["    msg = destAgente && !humano ? ", "    msg = __iaCont ? 'Vou pedir para um dos nossos consultores te chamar no WhatsApp. E eu sigo por aqui se precisar 😉' : destAgente && !humano ? "],
  ["  if (filaId && !mesmoDepto) {\n    let ult = null;", "  if (filaId && !mesmoDepto && !__iaCont) {\n    let ult = null;"],
  ["if (vendedorRod.id) {\nlet ultR", "if (vendedorRod.id && __iaCont) { /* IA continua: o ticket fica com a IA */ } else if (vendedorRod.id) {\nlet ultR"],
  ["__troca = vendedorRod && setor ? {", "__troca = vendedorRod && setor && !__iaCont ? {"],
  ["  if (humano) humanoLock = s(r.ticketId) || '1';", "  if (humano && !__iaCont) humanoLock = s(r.ticketId) || '1';"],
  ["  if (filaId) lugar = {", "  if (filaId && !__iaCont) lugar = {"],
  ["    humano ? (filaId && !mesmoDepto", "    humano && __iaCont ? '_A IA continua atendendo neste número e o vendedor foi avisado no WhatsApp dele. Para pausar a IA, use o botão do plugin._' : humano ? (filaId && !mesmoDepto"],
  ["  transf = { setor: nomeSetor, filaId, mesmoDepto, vendedor: vendedorRod,",
   "  const __vz = vendedorRod ? s((((setor && setor.vendedores) || []).find(v => Number(v.id) === Number(vendedorRod.id)) || {}).whatsapp) : '';\n" +
   "  if (__iaCont && vendedorRod) estado.vendedor = { id: vendedorRod.id, nome: vendedorRod.nome, setor: nomeSetor, desde: new Date().toISOString() };\n" +
   "  transf = { setor: nomeSetor, filaId, mesmoDepto, iaContinua: __iaCont, vendedor: vendedorRod ? { ...vendedorRod, whatsapp: __vz } : vendedorRod,"]
 ],
 'Avisos Preparar': [
  ["// ── 2b. aviso no GRUPO",
   "// ── 2a. aviso ao VENDEDOR no WhatsApp dele (rodízio): cliente, resumo e orientação ──\n" +
   "const vd = av.vendedor || {};\n" +
   "const __urlOk = /^https:\\/\\/\\S+[?&]token=/.test(A.urlEnvio || '');\n" +
   "const __zapVend = (id) => { for (const st of (Array.isArray(cfg.setores) ? cfg.setores : [])) for (const v of ((st && st.vendedores) || [])) if (Number(v.id) === Number(id) && telOk(v.whatsapp)) return v.whatsapp; return ''; };\n" +
   "const __zapCli = String(f.tel || '').replace(/\\D/g, '');\n" +
   "if (humano && vd.ativo && __urlOk && f.transf && f.transf.vendedor) {\n" +
   "  const zv = telOk(f.transf.vendedor.whatsapp) ? f.transf.vendedor.whatsapp : __zapVend(f.transf.vendedor.id);\n" +
   "  if (zv) {\n" +
   "    const linhasV = String(f.nota || '').split('\\n').slice(1).filter(l => l.trim() && !/^_|^⚙️|^Telefone:|^👤 Para:/.test(l.trim())).slice(0, 14);\n" +
   "    const corpoV = [\n" +
   "      '🔔 *' + (f.transf.vendedor.carteira ? 'Cliente da sua carteira voltou' : 'Cliente novo para você') + '* · ' + (f.transf.setor || 'Equipe'),\n" +
   "      'Cliente: ' + (est.nome || 'sem nome') + ' · ' + fmtTel(f.tel),\n" +
   "      'Chamar no WhatsApp: https://wa.me/' + __zapCli,\n" +
   "      ...linhasV,\n" +
   "      f.transf.iaContinua ? '_A IA continua no WhatsApp da loja e te avisa se o cliente mandar algo por lá._' : '_O atendimento está com você na LeadVox._'\n" +
   "    ].join('\\n').slice(0, 3500);\n" +
   "    out.push({ json: { tipo: 'envio', url: A.urlEnvio, corpo: JSON.stringify({ number: zv, body: corpoV, externalKey: 'iag-vendedor' }) } });\n" +
   "    out.push({ json: { tipo: 'set', key: 'iag_humano_' + f.conta + ':' + norm(zv), valor: 'aviso', ttl: 30 * 86400 } });\n" +
   "  }\n" +
   "}\n" +
   "// cliente já com o vendedor: recado para ele e alerta para o gerente\n" +
   "let __lr = {}; try { __lr = $('Ler Resposta').first().json || {}; } catch (e) {}\n" +
   "if (__urlOk && est.vendedor && (__lr.recadoVendedor || __lr.alertaGerente)) {\n" +
   "  const cab = 'Cliente: ' + (est.nome || 'sem nome') + ' · ' + fmtTel(f.tel) + '\\nChamar no WhatsApp: https://wa.me/' + __zapCli;\n" +
   "  const zv = __zapVend(est.vendedor.id);\n" +
   "  if (__lr.recadoVendedor && zv) out.push({ json: { tipo: 'envio', url: A.urlEnvio, corpo: JSON.stringify({ number: zv, body: ('📩 *Recado do cliente*\\n' + cab + '\\n' + __lr.recadoVendedor).slice(0, 3500), externalKey: 'iag-vendedor' }) } });\n" +
   "  const zg = (av.gerente || {}).whatsapp;\n" +
   "  if (__lr.alertaGerente && telOk(zg)) out.push({ json: { tipo: 'envio', url: A.urlEnvio, corpo: JSON.stringify({ number: zg, body: ('⚠️ *Atenção no atendimento* · vendedor ' + (est.vendedor.nome || '') + '\\n' + cab + '\\n' + __lr.alertaGerente).slice(0, 3500), externalKey: 'iag-gerente' }) } });\n" +
   "}\n\n" +
   "// ── 2b. aviso no GRUPO"]
 ]
};
function aplicarVendedorWhatsapp(wf) {
 const erros = [];
 const nodes = wf.nodes.map(n => {
  const t = TROCAS[n.name]; if (!t) return n;
  let c = n.parameters.jsCode;
  for (const [de, para] of t) { const k = c.split(de).length - 1; if (k !== 1) erros.push(n.name + ': achei ' + k + 'x ' + de.slice(0, 50)); else c = c.replace(de, () => para); }
  return { ...n, parameters: { ...n.parameters, jsCode: c } };
 });
 if (erros.length) throw new Error(erros.join(' | '));
 return { ...wf, nodes };
}
if (typeof module !== 'undefined') module.exports = { TROCAS, aplicarVendedorWhatsapp };
