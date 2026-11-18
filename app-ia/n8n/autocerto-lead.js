// LeadVox IA — lead no AutoCerto pelo Motor IA (17/11/2026), igual ao que o Motor SDR já faz.
// Painel: Comportamento → Avisos → "Enviar o lead para o AutoCerto" → config.avisos.autocerto {ativo, setor, codigoMidia, interesse}.
// Na passagem para a equipe (o setor escolhido, ou qualquer setor da equipe se ficar em branco):
//  • a IA grava o lead no AutoCerto (OAuth grant_type=password + POST /api/Lead/SalvarLead) com nome, telefone,
//    veículo de interesse (código do AutoCerto quando o veículo veio do estoque dele), CPF, resumo e a unidade da loja;
//  • o AutoCerto distribui para o vendedor; o ticket fica com a IA (não muda de fila nem de dono, sem rodízio);
//  • a IA continua no número da loja só para acompanhar: pergunta como foi o atendimento, faz os follow-ups
//    (18 h e 4 dias), repassa recados e alerta o gerente (mesmo modo "IA continua" do vendedor no WhatsApp);
//  • o mesmo cliente não é gravado de novo em 7 dias; deu certo ou falhou, fica uma nota interna no atendimento;
//    se falhar, o gerente (Avisos → gerente) recebe o alerta para cadastrar à mão.
// Usuário, senha e unidade são os do estoque (Credenciais de API → Estoque = AutoCerto), lidos por
// lv_motor_autocerto (database/autocerto_lead.sql, só service_role).
// Atendimento (dkipBj6hAhdu7OSp): trocas + nós "AC *". Simulador (oj3sPq5XcM22cgTt): só as trocas (não grava nada).
// Uso no console do n8n: aplicarAutocertoLead(fluxo, { simulador }) → cópia trocada (falha se o fluxo mudou ou já foi aplicado).

const MARCA = 'LeadVox IA — lead no AutoCerto';

const TROCAS_AC = {
 'Agente': [
  // padrão do painel (a mesclagem já deixa passar avisos.autocerto; fica aqui para ficar claro o que existe)
  ["vendedor: { ativo: false, iaContinua: false }, grupo:", "vendedor: { ativo: false, iaContinua: false }, autocerto: { ativo: false, setor: '', codigoMidia: 12, interesse: 2 }, grupo:"]
 ],
 'Ler Resposta': [
  // o código do veículo no catálogo (ac:123 quando veio do AutoCerto) acompanha o item e o interesse
  ["unidade: i.unidade || 'un', fotos:", "unidade: i.unidade || 'un', codigo: s(i.codigo), fotos:"],
  // o simulador não guarda o interesse (só o Atendimento grava a oportunidade)
  ["estado.interesse = { id: __it.id, nome: __it.nome,", "estado.interesse = { id: __it.id, nome: __it.nome, codigo: __it.codigo || '',", 'soAtendimento']
 ],
 'Montar Prompt': [
  ["if (est.vendedor && est.vendedor.nome && ((c.avisos || {}).vendedor || {}).iaContinua) {",
   "// " + MARCA + ": cliente passado pelo AutoCerto também fica neste modo (a IA só acompanha)\n" +
   "if (est.vendedor && est.vendedor.nome && (((c.avisos || {}).vendedor || {}).iaContinua || (est.vendedor.autocerto && ((c.avisos || {}).autocerto || {}).ativo))) {"],
  ["'- Este cliente já foi passado para o vendedor ' + __vn + (__vd ? ' em ' + __vd : '') + '. O vendedor fala com ele pelo WhatsApp dele; você continua aqui, no número da loja.',",
   "(est.vendedor.autocerto ? '- Este cliente já foi passado para a equipe de vendas' + (__vd ? ' em ' + __vd : '') + '. Um vendedor da loja fala com ele pelo WhatsApp; você continua aqui, no número da loja, só para acompanhar.'\n" +
   "      : '- Este cliente já foi passado para o vendedor ' + __vn + (__vd ? ' em ' + __vd : '') + '. O vendedor fala com ele pelo WhatsApp dele; você continua aqui, no número da loja.'),"]
 ],
 'Fila de Envio': [
  ["  const __iaCont = humano && !!",
   "  const __iaContV = humano && !!"],
  ["  let msg = '';\n",
   "  // " + MARCA + ": o AutoCerto distribui, então não tem rodízio nem troca de fila; a IA continua só acompanhando\n" +
   "  const __acCfg = (c.avisos || {}).autocerto || {};\n" +
   "  const __ac = !!(humano && __acCfg.ativo === true && !(r.transf.pessoa && r.transf.pessoa.id) && (!s(__acCfg.setor) || norm(__acCfg.setor) === norm(nomeSetor)));\n" +
   "  const __iaCont = __iaContV || __ac;\n" +
   "  let msg = '';\n"],
  ["let vendedorRod = null;\nif (humano && !(r.transf.pessoa && r.transf.pessoa.id) && setor && setor.distribuicao === 'rodizio'",
   "let vendedorRod = null;\nif (!__ac && humano && !(r.transf.pessoa && r.transf.pessoa.id) && setor && setor.distribuicao === 'rodizio'"],
  ["    humano && __iaCont ? '_A IA continua atendendo",
   "    humano && __ac ? '_O lead vai para o AutoCerto, que distribui para a equipe. A IA continua neste número só para acompanhar o cliente. Para pausar a IA, use o botão do plugin._' : humano && __iaCont ? '_A IA continua atendendo"],
  ["  if (__iaCont && vendedorRod) estado.vendedor = {",
   "  if (__ac) estado.vendedor = { id: 0, nome: 'a nossa equipe', setor: nomeSetor, desde: new Date().toISOString(), autocerto: true };\n" +
   "  if (__iaCont && vendedorRod) estado.vendedor = {"],
  ["iaContinua: __iaCont, vendedor: vendedorRod ?",
   "iaContinua: __iaCont, autocerto: __ac, vendedor: __ac ? { id: 0, nome: 'a nossa equipe', whatsapp: '' } : vendedorRod ?"]
 ],
 'Avisos Preparar': [
  // recado do cliente: no AutoCerto não tem WhatsApp de vendedor, então o recado vai para o gerente
  ["  if (__lr.recadoVendedor && zv) out.push(",
   "  if (__lr.recadoVendedor && !zv && est.vendedor.autocerto && telOk((av.gerente || {}).whatsapp)) out.push({ json: { tipo: 'envio', url: A.urlEnvio, corpo: JSON.stringify({ number: av.gerente.whatsapp, body: ('📩 *Recado do cliente (lead do AutoCerto)*\\n' + cab + '\\n' + __lr.recadoVendedor + '\\n_Repasse ao vendedor que pegou o lead._').slice(0, 3500), externalKey: 'iag-gerente' }) } });\n" +
   "  if (__lr.recadoVendedor && zv) out.push("],
  ["// ── 2b. aviso no GRUPO",
   "// ── 2c. " + MARCA + " (Avisos → Enviar o lead para o AutoCerto): os nós \"AC *\" gravam; o AutoCerto distribui ──\n" +
   "const __acA = av.autocerto || {};\n" +
   "if (transferiu && humano && f.transf && f.transf.autocerto && __acA.ativo === true) {\n" +
   "  const __t = (v) => String(v ?? '').trim();\n" +
   "  const __vz = (v) => !__t(v) || /^(n\\/?i|n[aã]o informado|ver hist[oó]rico|n[aã]o possui|nenhum|null|-)$/i.test(__t(v));\n" +
   "  const __dd = ((__lr.transf || {}).dados) || {};\n" +
   "  const __campo = (re) => { for (const [k, v] of Object.entries(__dd)) if (re.test(k) && !__vz(v)) return __t(v); return ''; };\n" +
   "  const __int = est.interesse || {};\n" +
   "  const __cod = /^ac:/i.test(__t(__int.codigo)) ? __t(__int.codigo).slice(3).replace(/\\D/g, '') : '';\n" +
   "  const __cpf = __campo(/cpf/i).replace(/\\D/g, '');\n" +
   "  const __msg = String(f.nota || '').split('\\n').filter(l => l.trim() && !/^_|^⚙️/.test(l.trim())).join('\\n').replace(/[*_]/g, '').slice(0, 1800);\n" +
   "  out.push({ json: { tipo: 'autocerto', conta: f.conta, tel: __zapCli, flag: 'iag_ac_' + f.chaveMem, urlEnvio: A.urlEnvio, gerente: telOk((av.gerente || {}).whatsapp) ? av.gerente.whatsapp : '',\n" +
   "    nome: est.nome || __campo(/^nome/i) || '', lead: {\n" +
   "    CodigoMidia: Number(__acA.codigoMidia) || 12, Interesse: Number(__acA.interesse) || 2, CodigoVeiculo: Number(__cod) || 0,\n" +
   "    Nome: (est.nome || __campo(/^nome/i) || 'Cliente WhatsApp').slice(0, 120), Email: __campo(/e-?mail/i).slice(0, 120), Telefone: __zapCli, Telefone2: '',\n" +
   "    Mensagem: __msg, DescricaoVeiculo: (__t(__int.nome) || __campo(/ve[ií]culo|carro|moto|modelo|interesse/i)).slice(0, 200), Placa: '',\n" +
   "    Cpf: __cpf.length === 11 ? __cpf : '', Cep: '' } } });\n" +
   "}\n" +
   "// ── 2b. aviso no GRUPO"]
 ]
};

// nós novos (só no Atendimento): Tipo de Aviso ganha a saída "autocerto" → AC Já Enviado → AC Credenciais → AC Preparar
// → AC Pode Enviar? → AC Login → AC Salvar Lead → AC Registrar → volta ao Tipo de Aviso (nota interna, trava de 7 dias, alerta).
const AC_PREPARAR = `// ${MARCA}: o item "autocerto" do Avisos Preparar + usuário, senha e unidade do estoque (AutoCerto)
const it = $('Avisos Preparar').all().map(i => i.json).find(j => j && j.tipo === 'autocerto');
if (!it) return [];
let ja = ''; try { ja = String($('AC Já Enviado').first().json.jaEnviado || ''); } catch (e) {}
if (ja) return []; // mesmo cliente gravado nos últimos 7 dias
const r = $input.first().json || {};
const cr = Array.isArray(r.body) ? (r.body[0] || {}) : {};
const unidade = String(cr.unidade || '').replace(/\\D/g, '');
const ok = r.statusCode >= 200 && r.statusCode < 300 && !!cr.usuario && !!cr.secret && !!unidade;
const erro = ok ? '' : (r.statusCode >= 200 && r.statusCode < 300 ? 'a loja não tem o AutoCerto em Credenciais de API → Estoque (usuário, senha e unidade)' : 'não consegui ler as credenciais (HTTP ' + (r.statusCode || '?') + ')');
return [{ json: { ok, erro, usuario: ok ? cr.usuario : '', senha: ok ? cr.secret : '', corpo: JSON.stringify({ ...it.lead, CodigoUnidade: Number(unidade) || 0 }), it } }];`;

const AC_REGISTRAR = `// ${MARCA}: resultado → nota interna no atendimento, trava de 7 dias e, se falhou, alerta ao gerente
const p = $('AC Preparar').first().json || {}, it = p.it || {};
let login = null, salvo = null;
try { login = $('AC Login').first().json; } catch (e) {}
try { salvo = $('AC Salvar Lead').first().json; } catch (e) {}
const okLogin = !!(login && login.statusCode >= 200 && login.statusCode < 300 && (login.body || {}).access_token);
const ok = !!(p.ok && okLogin && salvo && salvo.statusCode >= 200 && salvo.statusCode < 300);
const corpo = JSON.parse(p.corpo || '{}');
const motivo = !p.ok ? p.erro : !okLogin ? 'o AutoCerto não aceitou o usuário e a senha da API (HTTP ' + ((login || {}).statusCode || '?') + ')'
  : 'o AutoCerto recusou o lead (HTTP ' + ((salvo || {}).statusCode || '?') + (salvo && salvo.body ? ': ' + JSON.stringify(salvo.body).slice(0, 160) : '') + ')';
const veic = corpo.DescricaoVeiculo ? corpo.DescricaoVeiculo + (corpo.CodigoVeiculo ? ' (cód. ' + corpo.CodigoVeiculo + ')' : '') : 'não identificado';
const out = [];
const nota = ok ? '🧾 *Lead gravado no AutoCerto* (unidade ' + corpo.CodigoUnidade + '). Veículo: ' + veic + '. A distribuição para o vendedor é feita pelo AutoCerto.'
  : '⚠️ *Não consegui gravar o lead no AutoCerto*: ' + motivo + '. Cadastre o cliente à mão no AutoCerto.';
if (it.urlEnvio) out.push({ json: { tipo: 'envio', url: it.urlEnvio, corpo: JSON.stringify({ number: it.tel, onlyNote: true, externalKey: 'iag-nota-ac', note: { body: nota } }) } });
if (ok) out.push({ json: { tipo: 'set', key: it.flag, valor: '1', ttl: 7 * 86400 } });
else if (it.urlEnvio && it.gerente) out.push({ json: { tipo: 'envio', url: it.urlEnvio, corpo: JSON.stringify({ number: it.gerente, externalKey: 'iag-gerente',
  body: ['⚠️ *Lead não entrou no AutoCerto*', 'Cliente: ' + (it.nome || 'sem nome') + ' · ' + it.tel, 'Veículo: ' + veic, 'Motivo: ' + motivo, '_Cadastre à mão no AutoCerto para ele ser distribuído._'].join('\\n').slice(0, 3500) }) } });
return out;`;

const http = (name, pos, parameters, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
 parameters: { ...parameters, options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } }, onError: 'continueRegularOutput', alwaysOutputData: false, ...extra });

function nosAutocerto(ref, cred) {
 const [x, y] = ref; const pos = (i, dy = 0) => [x + 256 * i, y + 448 + dy];
 return [
  { name: 'AC Já Enviado', type: 'n8n-nodes-base.redis', typeVersion: 1, position: pos(1), credentials: cred.redis, onError: 'continueRegularOutput', alwaysOutputData: true,
   parameters: { operation: 'get', propertyName: 'jaEnviado', key: '={{ $json.flag }}', options: {} } },
  http('AC Credenciais', pos(2), { method: 'POST', url: "={{ $('Entrada').first().json.SUPA_URL }}/rest/v1/rpc/lv_motor_autocerto", authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
   sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ p_conta: ($('Avisos Preparar').all().map(i => i.json).find(j => j && j.tipo === 'autocerto') || {}).conta || '' }) }}" }, { credentials: cred.supabase }),
  { name: 'AC Preparar', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3), onError: 'continueRegularOutput', parameters: { jsCode: AC_PREPARAR } },
  { name: 'AC Pode Enviar?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos(4), parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
   conditions: [{ id: 'acok', leftValue: '={{ $json.ok === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, looseTypeValidation: true, options: {} } },
  http('AC Login', pos(5, -96), { method: 'POST', url: 'https://integracao.autocerto.com/oauth/token', sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/json' }] },
   sendBody: true, contentType: 'form-urlencoded', bodyParameters: { parameters: [{ name: 'grant_type', value: 'password' }, { name: 'username', value: '={{ $json.usuario }}' }, { name: 'password', value: '={{ $json.senha }}' }] } }),
  http('AC Salvar Lead', pos(6, -96), { method: 'POST', url: 'https://integracao.autocerto.com/api/Lead/SalvarLead', sendHeaders: true,
   headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ ($json.body || {}).access_token || \'\' }}' }] },
   sendBody: true, specifyBody: 'json', jsonBody: "={{ $('AC Preparar').first().json.corpo }}" }),
  { name: 'AC Registrar', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(7), onError: 'continueRegularOutput', parameters: { jsCode: AC_REGISTRAR } },
  { name: 'Etiqueta AutoCerto', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x + 200, y + 300],
   parameters: { content: '## 🧾 Lead no AutoCerto (17/11/2026)\nAvisos → **Enviar o lead para o AutoCerto**. Na passagem para a equipe, grava o lead (OAuth + SalvarLead) com o usuário do estoque (`lv_motor_autocerto`). O AutoCerto distribui; a IA só acompanha. Não repete o cliente em 7 dias (`iag_ac_*`). Nota interna sempre; falhou → alerta ao gerente.', height: 280, width: 1900, color: 4 } }
 ];
}

function aplicarAutocertoLead(fluxoOrig, { simulador = false } = {}) {
 const fluxo = JSON.parse(JSON.stringify(fluxoOrig));
 const erros = [];
 for (const n of fluxo.nodes) {
  const t = TROCAS_AC[n.name]; if (!t) continue;
  if (simulador && n.name === 'Avisos Preparar') continue;
  let c = n.parameters.jsCode;
  if (c.includes(MARCA)) throw new Error('já aplicado em ' + n.name);
  for (const [de, para, so] of t) { if (simulador && so === 'soAtendimento') continue; const k = c.split(de).length - 1; if (k !== 1) erros.push(n.name + ': trecho mudou (achei ' + k + 'x "' + de.slice(0, 50) + '")'); else c = c.replace(de, () => para); }
  n.parameters.jsCode = c;
 }
 const precisa = simulador ? ['Agente', 'Ler Resposta', 'Montar Prompt', 'Fila de Envio'] : Object.keys(TROCAS_AC);
 for (const nome of precisa) if (!fluxo.nodes.some(n => n.name === nome)) erros.push('falta o nó ' + nome);
 if (erros.length) throw new Error(erros.join(' | '));
 if (simulador) return fluxo;

 const tipo = fluxo.nodes.find(n => n.name === 'Tipo de Aviso');
 const regras = tipo.parameters.rules.values;
 if (regras.length !== 3 || regras.some(v => v.outputKey === 'autocerto')) throw new Error('Tipo de Aviso mudou');
 regras.push({ ...JSON.parse(JSON.stringify(regras[2])), outputKey: 'autocerto' });
 regras[3].conditions.conditions[0] = { ...regras[3].conditions.conditions[0], id: 'av3', rightValue: 'autocerto' };
 const cred = { redis: (fluxo.nodes.find(n => n.name === 'Redis Get Rota') || {}).credentials, supabase: (fluxo.nodes.find(n => n.name === 'Supabase Rota') || {}).credentials };
 if (!cred.redis || !cred.supabase) throw new Error('não achei as credenciais do Redis e do Supabase');
 fluxo.nodes.push(...nosAutocerto(tipo.position, cred));
 const L = (node) => ({ node, type: 'main', index: 0 });
 const cx = fluxo.connections;
 cx['Tipo de Aviso'].main[3] = [L('AC Já Enviado')];
 cx['AC Já Enviado'] = { main: [[L('AC Credenciais')]] };
 cx['AC Credenciais'] = { main: [[L('AC Preparar')]] };
 cx['AC Preparar'] = { main: [[L('AC Pode Enviar?')]] };
 cx['AC Pode Enviar?'] = { main: [[L('AC Login')], [L('AC Registrar')]] };
 cx['AC Login'] = { main: [[L('AC Salvar Lead')]] };
 cx['AC Salvar Lead'] = { main: [[L('AC Registrar')]] };
 cx['AC Registrar'] = { main: [[L('Tipo de Aviso')]] };
 return fluxo;
}

if (typeof module !== 'undefined') module.exports = { aplicarAutocertoLead, TROCAS_AC, AC_PREPARAR, AC_REGISTRAR, MARCA };
