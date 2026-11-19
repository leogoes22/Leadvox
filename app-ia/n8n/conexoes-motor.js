// LeadVox IA — uma IA por número da LeadVox (18/11/2026).
// O motor passa a perguntar ao banco qual IA atende considerando o NÚMERO por onde a mensagem chegou
// (iag_motor_rota com p_sessao, database/conexoes.sql) e guarda a rota em cache por número.
// A IA responde pelo número dela porque o banco já devolve a conexão do agente (urlEnvio/sessionId do número).
//  • Atendimento: o número vem do evento da LeadVox (Entrada.sessao; só existe no formato evento).
//  • Simulador do painel: o painel manda sessaoIA (o número extra da IA testada) no corpo.
// Sem conexões extras, o banco responde igual a antes: o motor não muda para quem tem um número só.
// Uso no console do n8n: aplicarConexoesMotor(fluxo, { simulador }) → cópia trocada (falha se o fluxo mudou ou já foi aplicado).

const MARCA = 'LeadVox IA — uma IA por número';
const SESSAO_SIMULADOR = "(() => { try { return Number((($('Webhook Motor').first().json || {}).body || {}).sessaoIA) || 0; } catch (x) { return 0; } })()";

const TROCAS_CONEXOES = {
 atendimento: {
  'Departamento': [
   ["rotaKey: 'iag_rota_' + e.conta + '_' + (departamento || 0) } }];",
    "rotaKey: 'iag_rota_' + e.conta + '_' + (departamento || 0) + (e.sessao ? '_s' + e.sessao : '') } }]; // " + MARCA]
  ],
  'Supabase Rota': [
   ["p_departamento: $('Departamento').first().json.departamento || null })",
    "p_departamento: $('Departamento').first().json.departamento || null, p_sessao: $('Departamento').first().json.sessao || null })"]
  ]
 },
 simulador: {
  'Departamento': [
   ["rotaKey: 'iag_rota_' + e.conta + '_' + (departamento || 0) } }];",
    "rotaKey: 'iag_rota_' + e.conta + '_' + (departamento || 0) + (" + SESSAO_SIMULADOR + " ? '_s' + " + SESSAO_SIMULADOR + " : '') } }]; // " + MARCA]
  ],
  'Supabase Rota': [
   ["p_departamento: $('Departamento').first().json.departamento || null })",
    "p_departamento: $('Departamento').first().json.departamento || null, p_sessao: " + SESSAO_SIMULADOR + " || null })"]
  ]
 }
};

function aplicarConexoesMotor(fluxoOrig, { simulador = false } = {}) {
 const fluxo = JSON.parse(JSON.stringify(fluxoOrig));
 const trocas = TROCAS_CONEXOES[simulador ? 'simulador' : 'atendimento'];
 const erros = [];
 for (const [nome, lista] of Object.entries(trocas)) {
  const n = fluxo.nodes.find(x => x.name === nome);
  if (!n) { erros.push('falta o nó ' + nome); continue; }
  const campo = n.parameters.jsCode !== undefined ? 'jsCode' : 'jsonBody';
  let c = String(n.parameters[campo] || '');
  if (c.includes(MARCA) || c.includes('p_sessao')) throw new Error('já aplicado em ' + nome);
  for (const [de, para] of lista) { const k = c.split(de).length - 1; if (k !== 1) erros.push(nome + ': trecho mudou (achei ' + k + 'x)'); else c = c.replace(de, () => para); }
  n.parameters[campo] = c;
 }
 if (erros.length) throw new Error(erros.join(' | '));
 return fluxo;
}

if (typeof module !== 'undefined') module.exports = { aplicarConexoesMotor, TROCAS_CONEXOES, MARCA };
