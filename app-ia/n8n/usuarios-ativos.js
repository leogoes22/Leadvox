// LeadVox IA — só recebe cliente quem está ATIVO na LeadVox (19/11/2026).
// 1) fluxoUsuariosAtivos(): o fluxo "Usuários ativos da LeadVox (a cada 1 min)". Para cada loja com o usuário da LeadVox
//    conectado (Credenciais de API), entra na LeadVox, lê /users/ (campo isActive) e grava os ids ativos no banco
//    (iag_usuarios_ativos_gravar). O iag_motor_rota usa essa lista para tirar os inativos da distribuição da IA e do plugin.
//    Não salva execução (o login passa pela execução).
// 2) TROCA_PLUGIN: no Atendimento, "Rodízio · Plugin" recusa a transferência para quem saiu com a mensagem combinada.
// Uso no console do n8n: criar com fluxoUsuariosAtivos(credSupabase) e aplicar aplicarMensagemPlugin(atendimento).

const MARCA = 'LeadVox IA — só ativos';
const SUPA = 'https://dcucemuewipfnneqpgxk.supabase.co';

const LOJAS = `// ${MARCA}: uma linha por loja e página da lista de usuários (até 3 páginas)
const out = [];
for (const r of ($input.first().json.body || [])) {
  if (!r || !r.conta || !r.api_root || !r.email || !r.senha) continue;
  const host = String(r.api_root).replace(/\\/v\\d{1,2}$/, '');
  if (!/^https:\\/\\/chat[0-9]{0,2}api\\.leadvox\\.com\\.br$/.test(host)) continue;
  out.push({ json: { conta: r.conta, host, email: r.email, senha: r.senha } });
}
return out;`;

const PAGINAS = `// ${MARCA}: com o login de cada loja, as páginas da lista de usuários
const lojas = $('Lojas').all().map(i => i.json), logins = $input.all().map(i => i.json);
const out = [];
lojas.forEach((l, n) => {
  const jwt = ((logins[n] || {}).body || {}).token || '';
  if (!jwt) return; // login recusado: essa loja fica sem atualizar (o banco ignora lista velha depois de 10 min)
  for (let p = 1; p <= 3; p++) out.push({ json: { conta: l.conta, url: l.host + '/users/?pageNumber=' + p, jwt } });
});
return out;`;

const JUNTAR = `// ${MARCA}: junta os ativos de cada loja (isActive !== false) e prepara a gravação
const pedidos = $('Páginas').all().map(i => i.json), resp = $input.all().map(i => i.json);
const porConta = {}, falhou = {};
pedidos.forEach((p, n) => {
  const r = resp[n] || {};
  if (!(r.statusCode >= 200 && r.statusCode < 300)) { falhou[p.conta] = true; return; }
  const b = r.body || {}, lista = Array.isArray(b) ? b : Array.isArray(b.users) ? b.users : [];
  porConta[p.conta] = porConta[p.conta] || new Set();
  lista.filter(u => u && u.id != null && u.isActive !== false).forEach(u => porConta[p.conta].add(String(u.id)));
});
return Object.entries(porConta).filter(([c, s]) => !falhou[c] && s.size).map(([conta, s]) => ({ json: { corpo: JSON.stringify({ p_conta: conta, p_ids: [...s] }) } }));`;

function fluxoUsuariosAtivos(credSupabase) {
 const http = (name, pos, p, cred) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, ...(cred ? { credentials: cred } : {}),
  parameters: { ...p, options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, onError: 'continueRegularOutput', alwaysOutputData: false });
 const L = n => ({ node: n, type: 'main', index: 0 });
 return {
  name: 'V01 Motor IA · Usuários ativos da LeadVox (a cada 1 min)',
  nodes: [
   { name: 'A cada minuto', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } },
   http('Lojas com usuário', [220, 0], { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_leadvox_usuarios_todos', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: '{}' }, { supabaseApi: credSupabase }),
   { name: 'Lojas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0], parameters: { jsCode: LOJAS } },
   http('Entrar', [660, 0], { method: 'POST', url: '={{ $json.host }}/auth/login', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ email: $json.email, password: $json.senha }) }}' }),
   { name: 'Páginas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0], parameters: { jsCode: PAGINAS } },
   http('Usuários', [1100, 0], { method: 'GET', url: '={{ $json.url }}', sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.jwt }}' }] } }),
   { name: 'Juntar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, 0], parameters: { jsCode: JUNTAR } },
   http('Gravar', [1540, 0], { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_usuarios_ativos_gravar', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}' }, { supabaseApi: credSupabase }),
   { name: 'Nota', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [200, -260], parameters: { width: 1500, height: 220, color: 4,
    content: '## Usuários ativos da LeadVox (19/11/2026)\nA cada 1 min, para cada loja com **Usuário da LeadVox** em Credenciais de API: entra, lê /users/ (isActive) e grava os ids ativos (`iag_usuarios_ativos_gravar`). O `iag_motor_rota` tira da distribuição da IA e do plugin quem não está ativo. Lista com mais de 10 min é ignorada (nunca esvazia o rodízio). **Não salva execuções**: o login passa por aqui.' } }
  ],
  connections: { 'A cada minuto': { main: [[L('Lojas com usuário')]] }, 'Lojas com usuário': { main: [[L('Lojas')]] }, Lojas: { main: [[L('Entrar')]] }, Entrar: { main: [[L('Páginas')]] },
   'Páginas': { main: [[L('Usuários')]] }, 'Usuários': { main: [[L('Juntar')]] }, Juntar: { main: [[L('Gravar')]] } },
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false, saveExecutionProgress: false }
 };
}

// "Rodízio · Plugin" (Atendimento): pessoa que saiu da lista (inativa ou tirada da distribuição) → recusa clara, sem transferir
const TROCA_PLUGIN = ["return sai(400, { ok: false, erro: 'Essa pessoa não está marcada neste departamento.' });",
 "return sai(400, { ok: false, erro: 'Essa pessoa não está mais disponível. Atualize a lista.' }); // " + MARCA];
function aplicarMensagemPlugin(fluxoOrig) {
 const fluxo = JSON.parse(JSON.stringify(fluxoOrig));
 const no = fluxo.nodes.find(x => x.parameters && typeof x.parameters.jsCode === 'string' && x.parameters.jsCode.includes(TROCA_PLUGIN[0]));
 if (!no) { if (fluxo.nodes.some(x => x.parameters && String(x.parameters.jsCode || '').includes(MARCA))) throw new Error('já aplicado'); throw new Error('trecho mudou'); }
 no.parameters.jsCode = no.parameters.jsCode.replace(TROCA_PLUGIN[0], () => TROCA_PLUGIN[1]);
 return fluxo;
}

if (typeof module !== 'undefined') module.exports = { fluxoUsuariosAtivos, aplicarMensagemPlugin, TROCA_PLUGIN, LOJAS, PAGINAS, JUNTAR, MARCA };
