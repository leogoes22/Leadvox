import { schedule, cycles } from '/billing-schedule.js';

const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinheiro = x => (Number(x) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = d => String(d || '').split('-').reverse().join('/');

async function api(acao, corpo) {
  const r = await fetch('/api/account/' + acao, {
    method: corpo === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(d.error || 'Não deu certo. Tente de novo.'); e.status = r.status; throw e; }
  return d;
}

let toastT;
function toast(msg, erro) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (erro ? ' erro' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 3200);
}
const mostra = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };

/* ═══════════ ENTRADA ═══════════ */
let modo = 'login', tipoCodigo = 'signup';
const MODOS = {
  login: { t: 'Sua IA na LeadVox', s: 'Entre com o e-mail cadastrado na LeadVox.', b: 'Entrar', email: 1, senha: 1 },
  signup: { t: 'Criar conta', s: 'Use uma senha de pelo menos 12 caracteres. Depois confirme o código que chega no seu e-mail.', b: 'Criar conta', email: 1, senha: 1 },
  recover: { t: 'Esqueci minha senha', s: 'Vamos mandar um código para o seu e-mail.', b: 'Receber código', email: 1 },
  verify: { t: 'Confirmar código', s: 'Digite o código que chegou no seu e-mail. Para trocar a senha, use "Esqueci minha senha".', b: 'Confirmar', email: 1, codigo: 1 },
  password: { t: 'Crie sua nova senha', s: 'Use de 12 a 128 caracteres.', b: 'Salvar senha e entrar', senha: 1 }
};

function setModo(m) {
  modo = m; const c = MODOS[m];
  $('pTitulo').textContent = c.t; $('pSub').textContent = c.s; $('btPorta').textContent = c.b;
  $('campoEmail').hidden = !c.email; $('campoSenha').hidden = !c.senha; $('campoCodigo').hidden = !c.codigo;
  $('rotSenha').textContent = m === 'login' ? 'Senha' : 'Nova senha';
  $('pSenha').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('pSenha').value = ''; $('pCodigo').value = '';
  $('pLinks').hidden = m !== 'login'; $('btVoltarPorta').hidden = m === 'login' || m === 'password';
  mostra($('pErro')); mostra($('pOk'));
}

function porta(montar) {
  $('telaApp').hidden = true; $('telaPorta').hidden = false;
  $('cardLogin').hidden = !!montar; $('cardMontar').hidden = !montar;
}

document.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { tipoCodigo = 'signup'; setModo(b.dataset.modo); });
$('btVoltarPorta').onclick = () => setModo('login');

$('formPorta').onsubmit = async e => {
  e.preventDefault(); const bt = $('btPorta'); bt.disabled = true; mostra($('pErro')); mostra($('pOk'));
  try {
    const d = await api(modo, { email: $('pEmail').value, password: $('pSenha').value, code: $('pCodigo').value.trim(), type: tipoCodigo });
    $('pSenha').value = '';
    if (modo === 'recover') { tipoCodigo = 'recovery'; setModo('verify'); mostra($('pOk'), 'Se o e-mail tiver conta, o código chega em instantes. Olhe também o spam.'); }
    else if (modo === 'verify' && tipoCodigo === 'recovery') setModo('password');
    else if (d.confirmationRequired) { tipoCodigo = 'signup'; setModo('verify'); mostra($('pOk'), 'Conta criada. Mandamos um código para o seu e-mail. Olhe também o spam.'); }
    else { if (modo === 'password') toast('Senha trocada.'); await carregar(); }
  } catch (err) { mostra($('pErro'), err.message); }
  finally { bt.disabled = false; }
};

/* ═══════════ FORMULÁRIO INICIAL ═══════════ */
const NICHOS = {
  automotivo: { n: 'Automotivo', ic: '🚗', d: 'Loja de carros ou motos', ia: 'atende os leads da sua loja no WhatsApp, mostra o estoque e agenda visitas.' },
  imoveis: { n: 'Imóveis', ic: '🏠', d: 'Imobiliária ou corretor', ia: 'atende quem procura imóvel, tira dúvidas e agenda visitas.' },
  saude: { n: 'Saúde', ic: '🩺', d: 'Clínica, consultório ou estética', ia: 'atende pacientes, responde dúvidas e agenda consultas.' },
  advocacia: { n: 'Advocacia', ic: '⚖️', d: 'Escritório de advocacia', ia: 'faz a triagem dos casos e agenda o atendimento.' },
  educacao: { n: 'Educação', ic: '🎓', d: 'Escola ou curso', ia: 'apresenta os cursos, tira dúvidas e faz a matrícula andar.' },
  varejo: { n: 'Varejo', ic: '🛍️', d: 'Loja física ou on-line', ia: 'mostra seus produtos, responde dúvidas e fecha pedidos.' },
  viagens: { n: 'Viagens', ic: '✈️', d: 'Agência ou turismo', ia: 'apresenta os pacotes, tira dúvidas e passa o cliente para a equipe.' },
  outro: { n: 'Outro negócio', ic: '✨', d: 'Qualquer outro ramo', ia: 'atende seus clientes no WhatsApp com o seu catálogo e seus materiais.' }
};
const PASSOS = ['empresa', 'nicho', 'ia', 'cobranca'];
let passo = 0, escolhaNicho = '', escolhaCobr = null;

$('mNichos').innerHTML = Object.entries(NICHOS).map(([k, v]) =>
  `<button type="button" class="tipo-op" aria-pressed="false" data-nicho="${k}"><span class="ic">${v.ic}</span><span><b>${v.n}</b><small>${v.d}</small></span></button>`).join('');
document.querySelectorAll('[data-nicho]').forEach(b => b.onclick = () => {
  escolhaNicho = b.dataset.nicho;
  document.querySelectorAll('[data-nicho]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
});
document.querySelectorAll('[data-cobr]').forEach(b => b.onclick = () => {
  escolhaCobr = b.dataset.cobr === 'sim';
  document.querySelectorAll('[data-cobr]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
});
$('cfNicho').replaceChildren(...Object.entries(NICHOS).map(([k, v]) => new Option(v.n, k)));

function montar() {
  porta(true);
  if (new URLSearchParams(location.search).get('empresa') === 'LeadVox' && !$('mEmpresa').value) $('mEmpresa').value = 'LeadVox';
  escolhaNicho = cfg.niche || escolhaNicho;
  document.querySelectorAll('[data-nicho]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.nicho === escolhaNicho)));
  if (cfg.aiName) $('mIa').value = cfg.aiName;
  if (cfg.whatsapp) $('mZap').value = cfg.whatsapp;
  mostraPasso(empresa ? Math.max(passo, 1) : 0);
}
function mostraPasso(i) {
  passo = i; mostra($('mErro'));
  document.querySelectorAll('[data-m]').forEach(s => s.hidden = s.dataset.m !== PASSOS[i]);
  $('mRot').textContent = 'Passo ' + (i + 1) + ' de ' + PASSOS.length;
  [...$('mProg').children].forEach((s, k) => s.classList.toggle('feito', k <= i));
  $('mVoltar').hidden = i === 0 || (i === 1 && !!empresa);
  $('mProximo').textContent = i === PASSOS.length - 1 ? 'Montar meu painel' : 'Próximo';
}
$('mVoltar').onclick = () => mostraPasso(Math.max(0, passo - 1));
$('mProximo').onclick = async () => {
  const bt = $('mProximo'); bt.disabled = true; mostra($('mErro'));
  try {
    const p = PASSOS[passo];
    if (p === 'empresa') {
      const nome = $('mEmpresa').value.trim();
      if (nome.length < 2) throw Error('Digite o nome da empresa.');
      const d = await api('organization', { name: nome });
      empresa = d.organizations?.[0];
      if (!empresa) throw Error('Não deu para criar a empresa. Tente de novo.');
    } else if (p === 'nicho') {
      if (!escolhaNicho) throw Error('Escolha o seu negócio.');
      await salvarCfg({ niche: escolhaNicho });
    } else if (p === 'ia') {
      const zap = $('mZap').value.replace(/\D/g, '');
      if (zap && (zap.length < 10 || zap.length > 13)) throw Error('Confira o WhatsApp: DDD e número.');
      await salvarCfg({ aiName: $('mIa').value.trim(), whatsapp: zap });
    } else {
      if (escolhaCobr === null) throw Error('Escolha uma das opções.');
      await salvarCfg({ billingEnabled: escolhaCobr, onboarded: true });
      return abrirApp('agentes');
    }
    mostraPasso(passo + 1);
  } catch (err) { mostra($('mErro'), err.message); }
  finally { bt.disabled = false; }
};

document.querySelectorAll('[data-sair]').forEach(b => b.onclick = async () => {
  try { await api('logout', {}); } catch {}
  conta = null; setModo('login'); porta(false);
});


/* ═══════════ APP ═══════════ */
let conta = null, empresa = null, cfg = {};

async function salvarCfg(mudancas) {
  await api('workspace', { organization: empresa.id, settings: mudancas });
  cfg = { ...cfg, ...mudancas };
}

async function carregar() {
  conta = await api('me');
  empresa = (conta.organizations || [])[0] || null;
  cfg = {};
  if (empresa) {
    try { const w = await api('workspace?organization=' + encodeURIComponent(empresa.id)); cfg = w.workspace?.[0]?.settings || {}; } catch {}
  }
  if (!empresa || !cfg.onboarded) return montar();
  abrirApp(location.hash.slice(1) || 'agentes');
}

const IC = {
  robo: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  grafico: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
  livro: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19V5"/>',
  carro: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM5 11h14"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><path d="M7.5 7.5h.01"/>',
  funil: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  kanban: '<rect x="3" y="4" width="5" height="14" rx="1"/><rect x="10" y="4" width="5" height="9" rx="1"/><rect x="17" y="4" width="4" height="11" rx="1"/>',
  pessoas: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  predio: '<path d="M4 21V5l8-2v18M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01M3 21h18"/>',
  bandeira: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  arquivo: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  zap: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5z"/><path d="M9.5 9.5c.5 2 2 3.5 4 4l1-1 2 1-.5 1.5c-3 0-6.5-3.5-6.5-6.5L11 8l1 2z"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>',
  cartao: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const MENU = [
  ['agentes', 'Agentes LeadVox IA', 'robo', 'Sua IA: identidade, o que ela entende e como age.'],
  ['dashboard', 'Dashboard', 'grafico', 'O que a IA fez no período.'],
  ['oportunidades', 'Oportunidades', 'funil', 'O funil da sua LeadVox: cada cliente na etapa em que está.'],
  ['conhecimento', 'Base de conhecimento', 'livro', 'O que a IA sabe e responde.'],
  ['estoque', 'Estoque', 'carro', 'Os veículos que a IA oferece, com foto e preço.'],
  ['etiquetas', 'Etiquetas', 'tag', 'As etiquetas da sua LeadVox.'],
  ['status', 'Status do lead', 'kanban', 'As etapas do funil da sua LeadVox.'],
  ['usuarios', 'Usuários LeadVox', 'pessoas', 'Quem atende na sua LeadVox.'],
  ['departamentos', 'Departamentos', 'predio', 'Para onde a IA passa o cliente.'],
  ['motivos', 'Motivos de fechamento', 'bandeira', 'Por que um atendimento termina.'],
  ['arquivos', 'Arquivos da IA', 'arquivo', 'Materiais que a IA pode mandar.'],
  ['canais', 'Canais WhatsApp', 'zap', 'Os números onde a IA atende.'],
  ['credenciais', 'Credenciais de API', 'chave', 'LeadVox, estoque e cobranças.'],
  '-',
  ['cobrancas', 'Cobranças', 'cartao', 'Clientes, planos e mensalidades.'],
  ['conta', 'Minha conta', 'engrenagem', 'Empresa, negócio e senha.'],
  ['leadvox', 'Painel LeadVox', 'escudo', 'Todos os clientes da plataforma. Só você vê.']
];
const SECAO = { agentes: 'vAgentes', dashboard: 'vDashboard', oportunidades: 'vOportunidades',conhecimento: 'vConhecimento', estoque: 'vEstoque', etiquetas: 'vLista', status: 'vLista', usuarios: 'vLista',
  departamentos: 'vLista', motivos: 'vLista', arquivos: 'vLista', canais: 'vCanais', credenciais: 'vCredenciais', cobrancas: 'vCobrancas', conta: 'vConta', leadvox: 'vLeadvox' };
const LISTA = {
  etiquetas: ['Suas etiquetas aparecem aqui', 'Puxadas da sua LeadVox quando a conexão estiver ligada. A IA usa as etiquetas para marcar os leads.'],
  status: ['Seus status do lead aparecem aqui', 'As etapas do funil da sua LeadVox. A IA move o lead de etapa conforme a conversa.'],
  usuarios: ['Seus usuários aparecem aqui', 'Quem atende na sua LeadVox. A IA passa o cliente para a pessoa certa.'],
  departamentos: ['Seus departamentos aparecem aqui', 'Comercial, financeiro, pós-venda… A IA transfere para o departamento certo.'],
  motivos: ['Motivos de fechamento', 'Ex.: comprou, sem interesse, sem resposta. A IA marca o motivo quando o atendimento termina.'],
  arquivos: ['Arquivos da IA chegam na próxima etapa', 'Catálogo, fotos, PDFs e materiais que a IA pode mandar no WhatsApp. Enquanto isso, preencha a base de conhecimento.']
};
const visivel = pg => pg === 'cobrancas' ? !!cfg.billingEnabled : pg === 'leadvox' ? !!conta.platformAdmin : !!SECAO[pg];
const zapFmt = z => z ? z.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : 'Não informado';

function desenharMenu() {
  $('menu').innerHTML = MENU.map(m => m === '-' ? '<div class="menu-sep"></div>' : visivel(m[0])
    ? `<button type="button" class="menu-it" data-pg="${m[0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${IC[m[2]]}</svg>${m[1]}</button>` : '').join('');
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => abrir(b.dataset.pg));
}

function abrirApp(pg) {
  $('telaPorta').hidden = true; $('telaApp').hidden = false;
  const nicho = NICHOS[cfg.niche] || NICHOS.outro, nome = cfg.displayName || empresa.name;
  const fim = empresa.trial_ends_at ? new Date(empresa.trial_ends_at) : null;
  $('rodape').innerHTML = `<b style="color:var(--texto)">${esc(nome)}</b><br>${esc(nicho.n)}${fim ? '<br>Teste até ' + fim.toLocaleDateString('pt-BR') : ''}`;
  $('cfNome').value = cfg.displayName || ''; $('cfNome').placeholder = empresa.name;
  $('cfNicho').value = cfg.niche || 'outro'; $('cfIa').value = cfg.aiName || ''; $('cfZap').value = cfg.whatsapp || '';
  $('cfCobr').checked = !!cfg.billingEnabled;
  $('emEmail').textContent = 'Você entrou como ' + conta.user.email + '.';
  const linhas = `<div><span>WhatsApp</span>${esc(zapFmt(cfg.whatsapp))}</div><div><span>Empresa</span>${esc(nome)}</div>`;
  $('canaisZap').innerHTML = linhas; $('canaisDados').innerHTML = linhas;
  motor = null; agSel = null; agDados = null; desenharMenu();
  carregarMotor().then(() => { if (abaAtual === 'agentes') desenharMotor(); if (abaAtual === 'conhecimento') abrirConhecimento(); })
    .catch(() => { motor = { setupPending: true }; if (abaAtual === 'agentes') desenharMotor(); if (abaAtual === 'conhecimento') abrirConhecimento(); });
  fin = null; chat = null; listas = {}; conexoes = null; estoque = null; eventos = null; prontoAberto = null;
  carregarEventos().then(() => { if (abaAtual === 'agentes') desenharPronto(); if (abaAtual === 'canais') desenharEventos(); });
  carregarConexoes().then(() => { if (abaAtual === 'credenciais') desenharConexoes(); }).catch(() => {});
  carregarChat().then(() => { if (LISTA[abaAtual]) desenharLista(abaAtual); if (abaAtual === 'credenciais') desenharCred(); if (abaAtual === 'agentes') desenharPronto(); }).catch(() => {});
  abrir(pg);
}

let abaAtual = 'agentes';
function abrir(pg) {
  if (!visivel(pg)) pg = 'agentes';
  abaAtual = pg;
  const item = MENU.find(m => m[0] === pg);
  for (const id of new Set(Object.values(SECAO))) $(id).hidden = id !== SECAO[pg];
  document.querySelectorAll('[data-pg]').forEach(b => b.dataset.pg === pg ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('cabTitulo').textContent = item[1]; $('cabSub').textContent = item[3];
  if (LISTA[pg]) desenharLista(pg);
  if (pg === 'credenciais') { desenharCred(); desenharConexoes(); }
  if (pg === 'agentes') desenharMotor();
  if (pg === 'conhecimento') abrirConhecimento();
  if (pg === 'estoque') abrirEstoque();
  if (pg === 'dashboard') carregarDashboard();
  if (pg === 'oportunidades') carregarOportunidades();
  if (pg === 'canais') { desenharEventos(); carregarEventos().then(desenharEventos); }
  if (pg === 'cobrancas') carregarFin().catch(err => toast(err.message, true));
  if (pg === 'leadvox') carregarLv().catch(err => toast(err.message, true));
  $('lateral').classList.remove('aberta');
  if (location.hash.slice(1) !== pg) history.replaceState(null, '', '#' + pg);
  scrollTo(0, 0);
}
const ligarIr = raiz => raiz.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => abrir(b.dataset.ir));
ligarIr(document);
$('btMenu').onclick = () => $('lateral').classList.toggle('aberta');
addEventListener('hashchange', () => { if (conta && empresa && cfg.onboarded) abrir(location.hash.slice(1)); });

/* agente: lê e grava a configuração do Motor IA (tabelas iag_* pelo servidor) */
let motor = null, agSel = null, agDados = null;
const CAMPOS_PADRAO = {
  sdr: [['Nome', true], ['Cidade ou bairro', false], ['O que procura', true], ['Para quando precisa', false], ['Forma de pagamento', false]],
  recepcao: [['Nome', true], ['Assunto', true]],
  suporte: [['Nome', true], ['Descrição do problema', true], ['Nº do pedido ou contrato', false]],
  catalogo: [['Nome', true], ['Nome da empresa ou CNPJ', false], ['Cidade', true], ['Itens de interesse', true]],
  agendamento: [['Nome', true], ['Serviço desejado', true], ['Dia e turno de preferência', true]]
};
// Mesma configuração-padrão do painel de agentes atual (agente-ia.html): campo que faltar não quebra o motor.
function configPadrao(tipo, nome) {
  const dia = { abre: '08:00', fecha: '18:00' };
  return {
    identidade: { nome: nome || '', apresentacao: '', tom: 'amigavel', emojis: 'pouco', tratamento: 'voce' },
    empresa: { nome: cfg.displayName || empresa.name, segmento: '', descricao: '', publico: '', diferenciais: '', site: '', instagram: '', linkCatalogo: '', unidades: [] },
    horario: { dias: { seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: { abre: '08:00', fecha: '12:00' }, dom: null }, foraDoHorario: 'responde_avisa' },
    conhecimento: { faq: [], oficiais: [], proibido: [], extra: '' },
    precos: { politica: tipo === 'suporte' ? 'nao_fala' : 'a_partir', lista: [] },
    catalogo: { usar: tipo === 'catalogo', modo: tipo === 'catalogo' ? 'pedido' : 'vitrine', fotosPorVez: 1, pagamento: '', entrega: '', regras: '', pdfOrcamento: true },
    materiais: [],
    coleta: { campos: (CAMPOS_PADRAO[tipo] || []).map(([n, o]) => ({ nome: n, obrigatorio: o })), teto: tipo === 'recepcao' ? 3 : 5 },
    setores: [], transferencia: { mensagem: '' },
    followup: { ativo: false, toques: [{ minutos: 60, texto: '' }, { minutos: 1440, texto: '' }], janelaIni: '09:00', janelaFim: '20:00' },
    crm: { oportunidade: tipo !== 'suporte', etapaId: null, etiquetas: true },
    avisos: { retomada: { ativo: false, texto: '' }, gerente: { ativo: false, whatsapp: '', quando: 'equipe' }, resumo: { ativo: false, whatsapp: '', hora: 19 } }
  };
}
function mesclar(pad, c) {
  const out = JSON.parse(JSON.stringify(pad));
  for (const k of Object.keys(c || {})) {
    if (c[k] && typeof c[k] === 'object' && !Array.isArray(c[k]) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...c[k] };
    else if (c[k] !== undefined) out[k] = c[k];
  }
  return out;
}
const nomeTipo = t => (motor?.tipos || []).find(x => x.codigo === t)?.nome || t;

async function carregarMotor() { motor = await api('motor?organization=' + encodeURIComponent(empresa.id)); }
async function acaoMotor(dados, ok) {
  try { const r = await api('motor', { organization: empresa.id, ...dados }); if (r && r.vinculado !== undefined) motor = r; if (ok) toast(ok); return r; }
  catch (err) { toast(err.message, true); throw err; }
}

function desenharMotor() {
  desenharPronto();
  const box = $('motorBox');
  if (!motor) { box.innerHTML = '<p class="muted">Carregando sua IA…</p>'; $('agDetalhe').hidden = true; return; }
  if (motor.setupPending) { box.innerHTML = '<h3>Falta liberar no banco</h3><p class="alerta">A ligação com o motor de IA precisa do SQL do motor antes de funcionar.</p>'; $('agDetalhe').hidden = true; return; }
  if (!motor.vinculado) {
    box.innerHTML = `<h3>Sua IA ainda não está ligada ao motor da LeadVox</h3>
      <p class="muted" style="margin-top:6px">Ao ligar, criamos a sua conta no motor que atende o WhatsApp. Se a sua LeadVox já estiver conectada em Credenciais, o número já fica ligado.</p>
      <button class="principal" type="button" id="mVincular" style="margin-top:12px">Ligar minha IA</button>`;
    $('mVincular').onclick = async () => { $('mVincular').disabled = true; try { await acaoMotor({ acao: 'vincular' }, 'IA ligada ao motor.'); desenharMotor(); } catch { $('mVincular').disabled = false; } };
    $('agDetalhe').hidden = true; return;
  }
  const cx = motor.conexao || {};
  const linhaCx = cx.conectado
    ? `<span class="st on">WhatsApp ligado</span> <small class="muted">LeadVox tenant ${esc(cx.tenantId)} · sessão ${esc(cx.sessionId)}</small>`
    : `<span class="st rascunho">Sem WhatsApp</span> <button type="button" class="sm" id="mConectar">Ligar à minha LeadVox</button>`;
  const ags = motor.agentes || [];
  box.innerHTML = `<div class="lista-topo"><div><h3>Seus agentes de IA</h3><p class="muted" style="margin-top:4px">${linhaCx}</p></div>
      <div class="form-bts" style="margin:0"><select id="mTipo" style="width:auto">${(motor.tipos || []).map(t => `<option value="${esc(t.codigo)}">${esc(t.nome)}</option>`).join('')}</select>
      <button type="button" class="principal sm" id="mCriar" ${ags.length >= motor.limite ? 'disabled title="Limite de agentes"' : ''}>+ Novo agente</button></div></div>
    <div style="margin-top:8px">${ags.map(a => `<div class="item"><div><b>${esc(a.nome || 'Agente sem nome')}${a.entrada ? ' <span class="st">porta de entrada</span>' : ''}</b>
        <small>${esc(nomeTipo(a.tipo))} · versão ${esc(a.versao)}${a.configurado ? '' : ' · <span style="color:var(--amarelo)">configuração pendente</span>'}</small></div>
        <div class="bts"><span class="liga"><button type="button" class="switch" role="switch" aria-checked="${!!a.ativo}" data-ligar-ag="${esc(a.chave)}" aria-label="IA ${esc(a.nome || '')} ligada"><span></span></button><b class="${a.ativo ? 'on' : ''}">${a.ativo ? 'Ligada' : 'Desligada'}</b></span><button type="button" class="sm" data-abrir-ag="${esc(a.chave)}" ${a.chave === agSel ? 'aria-pressed="true"' : ''}>Abrir</button></div></div>`).join('')
      || '<p class="muted" style="padding:12px 0">Nenhum agente ainda. Escolha o tipo e clique em Novo agente.</p>'}</div>`;
  $('mConectar') && ($('mConectar').onclick = async () => { try { await acaoMotor({ acao: 'conectar' }, 'WhatsApp ligado ao motor.'); desenharMotor(); } catch {} });
  $('mCriar').onclick = async () => { $('mCriar').disabled = true; try { await acaoMotor({ acao: 'criar', tipo: $('mTipo').value }, 'Agente criado.'); const novo = (motor.agentes || []).at(-1); desenharMotor(); if (novo) abrirAgenteMotor(novo.chave); } catch { $('mCriar').disabled = false; } };
  document.querySelectorAll('[data-abrir-ag]').forEach(b => b.onclick = () => abrirAgenteMotor(b.dataset.abrirAg));
  document.querySelectorAll('[data-ligar-ag]').forEach(b => b.onclick = () => ligarAgente(b.dataset.ligarAg, b));
  if (!agSel && ags.length) abrirAgenteMotor((ags.find(a => a.entrada) || ags[0]).chave);
  if (!ags.length) $('agDetalhe').hidden = true;
}

// Liga/desliga a IA na hora (sem precisar de Salvar). Se faltar algo para ligar, o servidor explica o quê.
async function ligarAgente(chave, bt) {
  const a = (motor?.agentes || []).find(x => x.chave === chave); if (!a) return;
  const ligar = !a.ativo, nome = a.nome || 'A IA';
  if (!ligar && !confirm(`Desligar ${nome}? Ela para de responder os clientes no WhatsApp até você ligar de novo.`)) return;
  bt.disabled = true;
  try {
    await acaoMotor({ acao: 'ativo', agente: chave, ativo: ligar }, ligar ? `${nome} ligada. Já está respondendo os clientes.` : `${nome} desligada. Parou de responder.`);
    if (agDados && agSel === chave) agDados.ativo = ligar;
  } catch {}
  desenharMotor(); desenharAgente();
}

async function abrirAgenteMotor(chave) {
  try {
    const a = await api('motor?organization=' + encodeURIComponent(empresa.id) + '&agente=' + encodeURIComponent(chave));
    agSel = chave; agDados = { ...a, config: mesclar(configPadrao(a.tipo, a.nome), a.config || {}) };
    desenharAgente(); $('agDetalhe').hidden = false;
    document.querySelectorAll('[data-abrir-ag]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.abrirAg === chave)));
  } catch (err) { toast(err.message, true); }
}

function desenharAgente() {
  if (!agDados) return;
  const c = agDados.config, id = c.identidade, nome = id.nome || agDados.nome || 'Agente sem nome';
  $('agFoto').textContent = nome.trim().charAt(0).toUpperCase() || 'IA';
  $('agNome').textContent = nome; $('agFuncao').textContent = nomeTipo(agDados.tipo);
  $('agLiga').setAttribute('aria-checked', String(!!agDados.ativo)); $('agLiga').disabled = false;
  $('agSt').textContent = agDados.ativo ? 'IA ligada' : 'IA desligada'; $('agSt').className = agDados.ativo ? 'on' : '';
  $('agStDica').textContent = agDados.ativo ? 'Respondendo os clientes no WhatsApp.' : 'Não responde ninguém. Toque para ligar.';
  $('agDados').innerHTML = `<div><span>Tipo</span>${esc(nomeTipo(agDados.tipo))}</div><div><span>Porta de entrada</span>${agDados.entrada ? 'Sim' : 'Não'}</div>`
    + `<div><span>Versão salva</span>${esc(agDados.versao)}</div><div><span>Configuração</span>${agDados.configurado ? 'Concluída' : 'Pendente'}</div>`;
  const caps = [['Entende áudio', true], ['Entende imagem', true], ['Responde com áudio', false], ['Entende PDF e documentos', false], ['Entende planilhas', false]];
  const capsHtml = caps.map(([n, on]) => `<div>${n}<i class="${on ? 'on' : ''}">${on ? '✓ sim' : 'em breve'}</i></div>`).join('');
  $('agCaps').innerHTML = capsHtml; $('mmLista').innerHTML = capsHtml;
  $('idNome').value = id.nome || ''; $('idDesc').value = id.apresentacao || '';
  $('idTom').value = id.tom || 'amigavel'; $('idEmoji').value = id.emojis || 'pouco'; $('idTrat').value = id.tratamento || 'voce';
  desenharLugar();
  desenharAcoes(); desenharComportamento(); desenharPronto();
}
// onde o agente atende: departamento da LeadVox (o motor só responde em ticket do departamento dele) e porta de entrada
const lugarAtual = () => (motor?.agentes || []).find(a => a.chave === agSel) || {};
function desenharLugar() {
  const l = lugarAtual(), deps = listas.departamentos || [], atual = l.departamentoId ? String(l.departamentoId) : '';
  const opcoes = deps.map(d => [String(d.id), d.name]);
  if (atual && !opcoes.some(([id]) => id === atual)) opcoes.unshift([atual, 'Departamento ' + atual]);
  $('idDep').innerHTML = '<option value="">Nenhum departamento</option>' + opcoes.map(([id, n]) => `<option value="${esc(id)}" ${id === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('idEntrada').setAttribute('aria-checked', String(!!l.entrada));
}
$('agLiga').onclick = () => agSel && ligarAgente(agSel, $('agLiga'));
$('idEntrada').onclick = () => $('idEntrada').setAttribute('aria-checked', String($('idEntrada').getAttribute('aria-checked') !== 'true'));
document.querySelectorAll('[data-ag]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-ag]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-agp]').forEach(p => p.hidden = p.dataset.agp !== b.dataset.ag);
});
document.querySelector('[data-ag="identidade"]').setAttribute('aria-pressed', 'true');
$('agIdentidade').onsubmit = async e => {
  e.preventDefault(); if (!agDados) return;
  const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    const nome = $('idNome').value.trim();
    if (nome.length < 2) throw Error('Dê um nome ao agente.');
    const config = { ...agDados.config, identidade: { ...agDados.config.identidade, nome, apresentacao: $('idDesc').value.trim(), tom: $('idTom').value, emojis: $('idEmoji').value, tratamento: $('idTrat').value } };
    // Nome e apresentação preenchidos bastam para o motor aceitar ligar o agente.
    const concluir = !!config.identidade.apresentacao;
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao, concluir });
    agDados = { ...agDados, config, nome, versao: r.versao ?? agDados.versao, configurado: agDados.configurado || !!r.configurado };
    const l = lugarAtual(), dep = Number($('idDep').value) || null, entrada = $('idEntrada').getAttribute('aria-checked') === 'true';
    if (dep !== (Number(l.departamentoId) || null) || entrada !== !!l.entrada) await acaoMotor({ acao: 'lugar', agente: agSel, departamento: dep, entrada });
    await carregarMotor();
    desenharMotor(); desenharAgente(); toast('Salvo no motor da IA.');
  } catch (err) { if (!err.status) toast(err.message, true); desenharAgente(); }
  finally { bt.disabled = false; }
};

/* base de conhecimento: os campos empresa, horário, conhecimento e preços que o motor já põe no roteiro da IA */
let kSujo = false;
const DIAS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']];
const SEGMENTOS = ['Loja de veículos', 'Locação', 'Atacado / distribuidora', 'Varejo', 'Clínica / saúde', 'Beleza e estética', 'Alimentação', 'Imobiliária', 'Educação', 'Serviços / manutenção', 'Eventos', 'Tecnologia', 'Igreja / associação'];
const op = (v, t, d) => ({ v, t, d });
const radios = (nome, opcoes, atual) => `<div class="opcoes" role="radiogroup">${opcoes.map(o => `<label class="opcao"><input type="radio" name="${nome}" value="${esc(o.v)}" ${o.v === atual ? 'checked' : ''}><span>${esc(o.t)}${o.d ? `<small>${esc(o.d)}</small>` : ''}</span></label>`).join('')}</div>`;
const radioVal = nome => document.querySelector(`#kForm input[name="${nome}"]:checked`)?.value || '';
const kv = id => $(id).value.trim();
let kUid = 0;
function campoK(c, val) {
  const id = 'kc' + (++kUid), comum = `id="${id}" data-c="${c.k}" maxlength="${c.max || 200}" placeholder="${esc(c.ph || '')}"`;
  return `<label for="${id}">${c.rot}</label>` + (c.tipo === 'textarea' ? `<textarea ${comum}>${esc(val)}</textarea>` : `<input ${comum} value="${esc(val)}">`);
}
// Lista editável (endereços, perguntas, preços…): guarda os itens no próprio elemento e devolve com el._ler().
function listaK(el, itens, campos, opts = {}) {
  itens = itens.map(x => typeof x === 'object' ? { ...x } : x);
  const ler = () => {
    el.querySelectorAll('.linha-lista').forEach(row => {
      const i = +row.dataset.i, obj = {};
      row.querySelectorAll('[data-c]').forEach(inp => obj[inp.dataset.c] = inp.value.trim());
      itens[i] = opts.simples ? obj[campos[0].k] : { ...itens[i], ...obj };
    });
    return itens;
  };
  const desenhar = () => {
    el.innerHTML = itens.map((it, i) => `<div class="linha-lista" data-i="${i}"><button type="button" class="tirar" aria-label="Remover" data-tirar="${i}">×</button>
      ${opts.grade ? `<div class="${opts.grade}">` : ''}${campos.map(c => `<div>${campoK(c, typeof it === 'object' ? it[c.k] : it)}</div>`).join('')}${opts.grade ? '</div>' : ''}</div>`).join('')
      + (itens.length < (opts.max || 50) ? `<button type="button" class="leve" data-mais>+ ${opts.rotMais || 'Adicionar'}</button>` : '');
    el.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => { ler(); itens.splice(+b.dataset.tirar, 1); desenhar(); marcarK(); });
    const m = el.querySelector('[data-mais]');
    if (m) m.onclick = () => { ler(); itens.push(opts.simples ? '' : {}); desenhar(); marcarK(); el.querySelector('.linha-lista:last-of-type input, .linha-lista:last-of-type textarea')?.focus(); };
  };
  desenhar(); el._ler = () => ler().filter(x => typeof x === 'object' ? Object.values(x).some(v => String(v ?? '').trim()) : String(x).trim());
}
function marcarK() { kSujo = true; $('kSujo').textContent = 'Alterações não salvas.'; $('kSujo').style.color = 'var(--amarelo)'; }
function limparK() { kSujo = false; $('kSujo').textContent = 'Tudo salvo.'; $('kSujo').style.color = ''; }

async function abrirConhecimento() {
  const topo = $('kTopo');
  if (!motor) { topo.innerHTML = '<p class="muted">Carregando sua IA…</p>'; $('kForm').hidden = true; return; }
  const ags = motor.agentes || [];
  if (motor.setupPending || !motor.vinculado || !ags.length) {
    topo.innerHTML = `<div class="vazio"><b>Primeiro crie o seu agente de IA</b>A base de conhecimento é o que o agente sabe sobre a sua empresa.<br><button type="button" data-ir="agentes">Ir para Agentes LeadVox IA</button></div>`;
    ligarIr(topo); $('kForm').hidden = true; return;
  }
  if (kSujo && !$('kForm').hidden) return;            // voltou para a página: mantém o que não foi salvo
  if (!agSel || !ags.some(a => a.chave === agSel)) await abrirAgenteMotor((ags.find(a => a.entrada) || ags[0]).chave);
  if (!agDados) return;
  desenharConhecimento();
}

function desenharConhecimento() {
  const ags = motor.agentes || [], c = agDados.config;
  $('kTopo').innerHTML = `<div class="lista-topo"><div><h3>O que a IA sabe</h3><p class="muted" style="margin-top:4px">Ela só responde com o que estiver aqui. O que não souber, passa para a sua equipe.</p></div>
      ${ags.length > 1 ? `<div><label for="kAgente" style="margin:0 0 4px;font-size:13px">Agente</label><select id="kAgente" style="width:auto">${ags.map(a => `<option value="${esc(a.chave)}" ${a.chave === agSel ? 'selected' : ''}>${esc(a.nome || 'Agente sem nome')}</option>`).join('')}</select></div>` : ''}</div>
    <div class="checklist" id="kCheck"></div>`;
  if ($('kAgente')) $('kAgente').onchange = async e => {
    if (kSujo && !confirm('Você tem alterações não salvas. Trocar de agente mesmo assim?')) { e.target.value = agSel; return; }
    await abrirAgenteMotor(e.target.value); desenharConhecimento();
  };
  const ehAgenda = agDados.tipo === 'agendamento' || agDados.tipo === 'agenda';
  $('kPaineis').innerHTML = `
    <div class="card" data-kp="empresa"><h3>Empresa</h3><p class="muted">O que a IA precisa saber sobre o negócio.</p>
      <div class="duas"><div><label for="kNome">Nome da empresa</label><input id="kNome" maxlength="80" value="${esc(c.empresa.nome)}"></div>
        <div><label for="kSeg">Segmento</label><input id="kSeg" maxlength="60" list="kSegs" value="${esc(c.empresa.segmento)}" placeholder="Ex.: loja de veículos seminovos">
        <datalist id="kSegs">${SEGMENTOS.map(s => `<option value="${s}">`).join('')}</datalist></div></div>
      <label for="kDesc">O que a empresa faz</label><textarea id="kDesc" maxlength="1500" placeholder="Produtos, serviços, há quanto tempo, onde atende…">${esc(c.empresa.descricao)}</textarea>
      <label for="kPub">Quem é o cliente <small>(ex.: quem procura o primeiro carro, empresas, pessoa física…)</small></label><input id="kPub" maxlength="300" value="${esc(c.empresa.publico)}">
      <label for="kDif">Diferenciais <small>(a IA usa para convencer)</small></label><textarea id="kDif" maxlength="600" style="min-height:70px">${esc(c.empresa.diferenciais)}</textarea>
      <div class="duas"><div><label for="kSite">Site</label><input id="kSite" maxlength="400" placeholder="https://" value="${esc(c.empresa.site)}"></div>
        <div><label for="kInsta">Instagram</label><input id="kInsta" maxlength="120" placeholder="@empresa" value="${esc(c.empresa.instagram)}"></div></div>
      <label for="kCatLink">Link de catálogo externo <small>(opcional, ex.: catálogo do WhatsApp)</small></label><input id="kCatLink" maxlength="400" placeholder="https://" value="${esc(c.empresa.linkCatalogo)}">
      <h3 style="margin-top:20px">Endereços</h3><p class="muted">Lojas ou unidades. A IA só informa os endereços daqui.</p><div id="kUnid"></div></div>
    <div class="card" data-kp="horario" hidden><h3>Horário da equipe</h3><p class="muted">A IA responde 24h. O horário define quando a sua equipe atende.</p>
      <div style="margin-top:10px">${DIAS.map(([k, n]) => { const d = c.horario.dias?.[k]; return `<div class="dia"><label><input type="checkbox" data-dia="${k}" ${d ? 'checked' : ''}> ${n}</label>
        <input type="time" aria-label="${n}, abre" data-abre="${k}" value="${d ? d.abre : '08:00'}" ${d ? '' : 'disabled'}><input type="time" aria-label="${n}, fecha" data-fecha="${k}" value="${d ? d.fecha : '18:00'}" ${d ? '' : 'disabled'}></div>`; }).join('')}</div>
      <label>Fora do horário</label>${radios('kFora', [op('responde_avisa', 'A IA atende e avisa que a equipe retorna no próximo horário'), op('responde', 'A IA atende normalmente, sem falar de horário')], c.horario.foraDoHorario)}</div>
    <div data-kp="perguntas" hidden>
      <div class="card" style="margin-top:0"><h3>Perguntas frequentes</h3><p class="muted">O que os clientes sempre perguntam, com a resposta certa.</p><div id="kFaq"></div></div>
      <div class="card"><h3>Respostas oficiais</h3><p class="muted">Assuntos delicados em que a IA <b>não pode improvisar</b> (garantia, troca, prazo, documentação…). Ela responde exatamente isso.</p><div id="kOfi"></div></div>
      <div class="card"><h3>O que a IA nunca pode falar</h3><p class="muted">Ex.: "não prometer prazo de entrega", "não dar desconto", "não falar de concorrente".</p><div id="kProib"></div></div>
      <div class="card"><h3>Informações extras</h3><label for="kExtra">Tudo mais que a IA deve saber <small>(políticas, regras, observações)</small></label><textarea id="kExtra" maxlength="4000" style="min-height:140px">${esc(c.conhecimento.extra)}</textarea></div>
    </div>
    <div class="card" data-kp="precos" hidden><h3>${ehAgenda ? 'Serviços e preços' : 'Preços'}</h3>
      <label>A IA pode falar preço?</label>${radios('kPol', [op('livre', 'Sim, o valor exato'), op('a_partir', 'Só "a partir de"', 'O valor final a equipe confirma'), op('nao_fala', 'Não', 'Ela diz que a equipe passa o valor')], c.precos.politica)}
      <p class="muted" style="margin-top:14px">${ehAgenda ? 'Serviços que você oferece:' : 'Lista de preços:'}</p><div id="kPrec"></div></div>`;
  listaK($('kUnid'), c.empresa.unidades || [], [{ k: 'nome', rot: 'Nome', ph: 'Ex.: Matriz', max: 60 }, { k: 'endereco', rot: 'Endereço', max: 200 }, { k: 'mapa', rot: 'Link do Google Maps', ph: 'https://', max: 400 }], { rotMais: 'Adicionar endereço', max: 10 });
  listaK($('kFaq'), c.conhecimento.faq || [], [{ k: 'p', rot: 'Pergunta', max: 200, ph: 'Ex.: Vocês aceitam carro na troca?' }, { k: 'r', rot: 'Resposta', tipo: 'textarea', max: 1000 }], { rotMais: 'Adicionar pergunta', max: 60 });
  listaK($('kOfi'), c.conhecimento.oficiais || [], [{ k: 'tema', rot: 'Assunto', max: 120, ph: 'Ex.: garantia' }, { k: 'resposta', rot: 'Resposta oficial', tipo: 'textarea', max: 1500 }], { rotMais: 'Adicionar resposta oficial', max: 20 });
  listaK($('kProib'), c.conhecimento.proibido || [], [{ k: 'v', rot: 'Regra', max: 300 }], { rotMais: 'Adicionar regra', max: 20, simples: true });
  listaK($('kPrec'), c.precos.lista || [], [{ k: 'nome', rot: 'Produto ou serviço', max: 120 }, { k: 'preco', rot: 'Preço', max: 40, ph: 'R$ 0,00' }, { k: 'obs', rot: 'Observação', max: 200 }], { rotMais: 'Adicionar', max: 60, grade: 'tres' });
  document.querySelectorAll('#kPaineis [data-dia]').forEach(cb => cb.onchange = () => { const k = cb.dataset.dia; $('kPaineis').querySelector(`[data-abre="${k}"]`).disabled = $('kPaineis').querySelector(`[data-fecha="${k}"]`).disabled = !cb.checked; });
  $('kForm').hidden = false; limparK(); desenharCheck(c);
}

// Checklist do que já foi preenchido (baseado no checklist de onboarding do prompt).
function desenharCheck(c) {
  const itens = [['O que a empresa faz', c.empresa.descricao], ['Quem é o cliente', c.empresa.publico], ['Diferenciais', c.empresa.diferenciais],
    ['Endereço', (c.empresa.unidades || []).length], ['Horário da equipe', Object.values(c.horario.dias || {}).some(Boolean)],
    ['3 ou mais perguntas frequentes', (c.conhecimento.faq || []).length >= 3], ['Respostas oficiais', (c.conhecimento.oficiais || []).length],
    ['Preços ou política de preço', c.precos.politica === 'nao_fala' || (c.precos.lista || []).length]];
  const feitos = itens.filter(i => i[1]).length;
  $('kCheck').innerHTML = `<b style="grid-column:1/-1;font-size:13px;color:var(--suave)">${feitos} de ${itens.length} itens preenchidos</b>`
    + itens.map(([n, ok]) => `<span class="${ok ? 'ok' : ''}">${n}</span>`).join('');
}

function lerConhecimento() {
  const c = agDados.config, dias = {};
  document.querySelectorAll('#kPaineis [data-dia]').forEach(cb => { const k = cb.dataset.dia; dias[k] = cb.checked ? { abre: $('kPaineis').querySelector(`[data-abre="${k}"]`).value, fecha: $('kPaineis').querySelector(`[data-fecha="${k}"]`).value } : null; });
  return { ...c,
    empresa: { ...c.empresa, nome: kv('kNome'), segmento: kv('kSeg'), descricao: kv('kDesc'), publico: kv('kPub'), diferenciais: kv('kDif'), site: kv('kSite'), instagram: kv('kInsta'), linkCatalogo: kv('kCatLink'), unidades: $('kUnid')._ler() },
    horario: { ...c.horario, dias, foraDoHorario: radioVal('kFora') || 'responde_avisa' },
    conhecimento: { ...c.conhecimento, faq: $('kFaq')._ler(), oficiais: $('kOfi')._ler(), proibido: $('kProib')._ler(), extra: kv('kExtra') },
    precos: { ...c.precos, politica: radioVal('kPol') || 'a_partir', lista: $('kPrec')._ler() } };
}

document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-kp]').forEach(p => p.hidden = p.dataset.kp !== b.dataset.k);
});
$('kForm').addEventListener('input', marcarK);
$('kForm').addEventListener('change', marcarK);
$('kForm').onsubmit = async e => {
  e.preventDefault(); if (!agDados) return;
  const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    const config = lerConhecimento();
    if (!config.empresa.nome) throw Error('Informe o nome da empresa.');
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
    agDados = { ...agDados, config, versao: r.versao ?? agDados.versao };
    limparK(); desenharCheck(config); desenharAgente(); toast('Base de conhecimento salva. A IA já usa na próxima mensagem.');
  } catch (err) { if (!err.status) toast(err.message, true); }
  finally { bt.disabled = false; }
};
addEventListener('beforeunload', e => { if (kSujo || rgSujo || cpSujo) e.preventDefault(); });

// "Testar a IA": conversa com o agente pelo motor de simulação (nada vai para o WhatsApp nem para a LeadVox)
let tsSessao = '', tsAgente = null;
const novaSessao = () => { tsSessao = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join(''); };
function balao(classe, texto, midia) {
  const b = document.createElement('div'); b.className = 'ts-b ' + classe;
  if (midia) { const i = document.createElement('img'); i.src = midia; i.alt = ''; i.referrerPolicy = 'no-referrer'; i.onload = () => { $('tsChat').scrollTop = $('tsChat').scrollHeight; }; b.append(i); }
  if (texto) b.append(document.createTextNode(texto.replace(/^\*([^*\n]+):\*\n/, '$1:\n')));
  $('tsChat').append(b); return b;
}
// "O que a IA faria": etiquetas, etapa, origem, transferência, notas e avisos (só mostra, não executa)
function oQueFaria(r) {
  const itens = [], a = r.acoes || {};
  (r.etiquetas || []).forEach(e => itens.push('Etiqueta: ' + e));
  (a.tirar || []).forEach(e => itens.push('Tira etiqueta: ' + e));
  if (a.etapa?.nome) itens.push('Etapa do funil: ' + a.etapa.nome);
  if (a.origem?.nome) itens.push('Origem do lead: ' + a.origem.nome);
  if (r.transf) itens.push('Passa para: ' + (r.transf.setor || 'equipe') + (r.transf.vendedor?.nome ? ' → ' + r.transf.vendedor.nome + ' (rodízio)' : '') + (r.transf.destAgente ? ' (agente ' + r.transf.destAgente + ')' : ''));
  (a.notas || []).forEach(() => itens.push('Nota interna para a equipe'));
  (a.avisos || []).forEach(() => itens.push('Aviso no grupo'));
  if (!itens.length && !r.aviso) return;
  const d = document.createElement('div'); d.className = 'ts-faz';
  const t = document.createElement('b'); t.textContent = r.aviso ? r.aviso : 'Na conversa de verdade, a IA também faria: '; d.append(t);
  itens.forEach(x => { const s = document.createElement('span'); s.textContent = x; d.append(s); });
  $('tsChat').append(d);
}
function limparTeste() {
  novaSessao(); tsAgente = agSel;
  $('tsChat').innerHTML = '<div class="vazio-ts">Mande a primeira mensagem como se fosse um cliente chegando no WhatsApp.<br>Ex.: "Boa tarde, vocês têm Corolla?"</div>';
}
$('tsNovo').onclick = limparTeste;
document.querySelector('[data-ag="testar"]').addEventListener('click', () => { if (tsAgente !== agSel) limparTeste(); setTimeout(() => $('tsMsg').focus(), 50); });
$('tsForm').onsubmit = async e => {
  e.preventDefault(); if (!agSel) return;
  if (tsAgente !== agSel || !tsSessao) limparTeste();
  const msg = $('tsMsg').value.trim(); if (!msg) return;
  $('tsChat').querySelector('.vazio-ts')?.remove();
  balao('cli', msg); $('tsMsg').value = '';
  const dig = document.createElement('div'); dig.className = 'ts-digitando'; dig.textContent = (agDados?.config?.identidade?.nome || 'A IA') + ' está digitando…'; $('tsChat').append(dig);
  $('tsChat').scrollTop = $('tsChat').scrollHeight;
  const bt = e.currentTarget.querySelector('button'); bt.disabled = true;
  try {
    const r = await api('simular', { organization: empresa.id, agente: agSel, mensagem: msg, sessao: tsSessao });
    dig.remove();
    (r.envios || []).forEach(x => balao('ia', x.texto, x.midia));
    if (!(r.envios || []).length && !r.aviso) r.aviso = 'A IA não respondeu nada a essa mensagem.';
    oQueFaria(r);
  } catch (err) { dig.remove(); const d = document.createElement('div'); d.className = 'ts-faz'; d.textContent = err.message; $('tsChat').append(d); }
  finally { bt.disabled = false; $('tsChat').scrollTop = $('tsChat').scrollHeight; $('tsMsg').focus(); }
};

// "Mandar mensagem de teste": confere na hora se o número do grupo está certo
document.querySelectorAll('[data-testar-grupo]').forEach(b => b.onclick = async () => {
  const grupo = $(b.dataset.testarGrupo).value.trim();
  if (!grupo) return toast('Cole o número do grupo primeiro.', true);
  b.disabled = true; const txt = b.textContent; b.textContent = 'Mandando…';
  try { await api('grupo-teste', { organization: empresa.id, grupo, ia: agDados?.config?.identidade?.nome || '' }); toast('Mensagem de teste enviada. Confira no grupo do WhatsApp.'); }
  catch (err) { toast(err.message, true); }
  finally { b.disabled = false; b.textContent = txt; }
});

/* comportamento: modelo, criatividade, espera, assinatura, follow-up, avisos e limites (campos que o motor lê) */
let cpSujo = false, cpAgente = null;
const TEMPOS = [[0, 'Desligado'], [15, '15 min'], [30, '30 min'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [1440, '1 dia'], [2880, '2 dias']];
const sw = (id, on) => $(id).setAttribute('aria-checked', String(!!on));
const ligado = id => $(id).getAttribute('aria-checked') === 'true';
function desenharComportamento() {
  if (!agDados || (cpSujo && cpAgente === agSel)) return;
  cpAgente = agSel;
  const c = agDados.config, cp = c.comportamento || {}, fu = c.followup || {}, av = c.avisos || {}, lim = (c.crm || {}).limiteIA || {};
  $('cpModelo').value = cp.modelo || 'rapido'; $('cpCriat').value = cp.criatividade || 'equilibrada'; $('cpEspera').value = String(cp.espera || 10); sw('cpAssina', cp.assinatura);
  sw('cpFu', fu.ativo);
  const toques = Array.isArray(fu.toques) ? fu.toques : [];
  $('cpToques').innerHTML = [0, 1, 2].map(i => { const t = toques[i] || {}, m = Number(t.minutos) || 0;
    return `<div class="duas" style="grid-template-columns:150px minmax(0,1fr)"><div><label for="cpT${i}">${i + 1}ª tentativa, depois de</label><select id="cpT${i}">${TEMPOS.map(([v, n]) => `<option value="${v}" ${v === m ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label for="cpTx${i}">Mensagem</label><input id="cpTx${i}" maxlength="400" value="${esc(t.texto || '')}" placeholder="Em branco: a IA escreve"></div></div>`; }).join('');
  $('cpJIni').value = fu.janelaIni || '09:00'; $('cpJFim').value = fu.janelaFim || '20:00';
  sw('cpRet', av.retomada?.ativo); $('cpRetTxt').value = av.retomada?.texto || '';
  sw('cpGer', av.gerente?.ativo); $('cpGerZap').value = av.gerente?.whatsapp || ''; $('cpGerQuando').value = av.gerente?.quando || 'equipe';
  sw('cpGrupo', av.grupo?.ativo); $('cpGrupoId').value = av.grupo?.id || (c.regras || {}).grupo || ''; $('cpGrupoQuando').value = av.grupo?.quando || 'equipe';
  sw('cpRes', av.resumo?.ativo); $('cpResZap').value = av.resumo?.whatsapp || ''; $('cpResHora').value = String(av.resumo?.hora || 19);
  $('cpLimH').value = lim.hora || 25; $('cpLimD').value = lim.dia || 50;
  mostrarFu(); limparCp();
}
const mostrarFu = () => { $('cpFuBox').hidden = !ligado('cpFu'); };
function marcarCp() { cpSujo = true; $('cpSujo').textContent = 'Alterações não salvas.'; $('cpSujo').style.color = 'var(--amarelo)'; }
function limparCp() { cpSujo = false; $('cpSujo').textContent = 'Tudo salvo.'; $('cpSujo').style.color = ''; }
$('agComportamento').querySelectorAll('.switch').forEach(b => b.onclick = () => { sw(b.id, !ligado(b.id)); mostrarFu(); marcarCp(); });
$('agComportamento').addEventListener('input', marcarCp);
$('agComportamento').addEventListener('change', marcarCp);
$('agComportamento').onsubmit = async e => {
  e.preventDefault(); if (!agDados) return;
  const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    // aceita o número com ou sem 55 (DDD + número vira 55 + DDD + número)
    const zap = id => { const d = $(id).value.replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? '55' + d : d; }, zapOk = z => /^55\d{10,11}$/.test(z);
    if (ligado('cpGer') && !zapOk(zap('cpGerZap'))) throw Error('WhatsApp do gerente: use 55 + DDD + número.');
    if (ligado('cpRes') && !zapOk(zap('cpResZap'))) throw Error('WhatsApp do resumo: use 55 + DDD + número.');
    const grupoId = $('cpGrupoId').value.replace(/@.*/, '').replace(/\D/g, '');
    if (ligado('cpGrupo') && grupoId.length < 10) throw Error('Cole o número do grupo (começa com 120363).');
    const toques = [0, 1, 2].map(i => ({ minutos: Number($('cpT' + i).value), texto: $('cpTx' + i).value.trim() })).filter(t => t.minutos > 0).sort((a, b) => a.minutos - b.minutos);
    if (ligado('cpFu') && !toques.length) throw Error('Escolha quando sai a 1ª tentativa do follow-up.');
    const limH = Math.min(200, Math.max(5, Number($('cpLimH').value) || 25)), limD = Math.min(500, Math.max(limH, Number($('cpLimD').value) || 50));
    const c = agDados.config;
    const config = { ...c,
      comportamento: { ...(c.comportamento || {}), modelo: $('cpModelo').value, criatividade: $('cpCriat').value, espera: Number($('cpEspera').value), assinatura: ligado('cpAssina') },
      followup: { ...(c.followup || {}), ativo: ligado('cpFu'), toques, janelaIni: $('cpJIni').value || '09:00', janelaFim: $('cpJFim').value || '20:00' },
      avisos: { ...(c.avisos || {}), retomada: { ativo: ligado('cpRet'), texto: $('cpRetTxt').value.trim() },
        gerente: { ativo: ligado('cpGer'), whatsapp: zap('cpGerZap'), quando: $('cpGerQuando').value },
        resumo: { ativo: ligado('cpRes'), whatsapp: zap('cpResZap'), hora: Number($('cpResHora').value) },
        grupo: { ativo: ligado('cpGrupo'), id: grupoId, quando: $('cpGrupoQuando').value } },
      // o mesmo grupo vale para a ação "Avisar no grupo" das regras, se lá ainda estiver vazio
      regras: { ...(c.regras || {}), grupo: (c.regras || {}).grupo || grupoId },
      crm: { ...(c.crm || {}), limiteIA: { hora: limH, dia: limD } } };
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
    agDados = { ...agDados, config, versao: r.versao ?? agDados.versao };
    limparCp(); toast('Comportamento salvo. Vale a partir da próxima mensagem.');
  } catch (err) { if (!err.status) toast(err.message, true); }
  finally { bt.disabled = false; }
};

/* ações e regras: o cliente escreve as regras e digita @ para inserir a ação; o motor lê [CÓDIGO:valor] na resposta da IA */
let rgSujo = false, rgAgente = null, rgSel = 0, rgOpcoes = [];
const ACOES = [
  { tipo: 'etiqueta', rot: 'Adicionar etiqueta', cod: 'ETIQUETA', lista: 'etiquetas' },
  { tipo: 'tirar', rot: 'Tirar etiqueta', cod: 'TIRAR_ETIQUETA', lista: 'etiquetas' },
  { tipo: 'etapa', rot: 'Mudar etapa do funil', cod: 'ETAPA', lista: 'status' },
  { tipo: 'origem', rot: 'Definir origem do lead', cod: 'ORIGEM', lista: 'origens' },
  { tipo: 'departamento', rot: 'Transferir para departamento', cod: 'DEPARTAMENTO', lista: 'setores' },
  { tipo: 'pessoa', rot: 'Transferir para pessoa', cod: 'PESSOA', lista: 'usuarios' },
  { tipo: 'nota', rot: 'Nota interna para a equipe', cod: 'NOTA', livre: 'resumo do que aconteceu' },
  { tipo: 'avisar', rot: 'Avisar no grupo', cod: 'AVISAR', livre: 'o que a equipe precisa saber' }
];
const RE_ACAO = /\[(ETIQUETA|TIRAR_ETIQUETA|ETAPA|ORIGEM|DEPARTAMENTO|PESSOA|NOTA|AVISAR)\s*:\s*([^\]\n]*)\]/g;
const semAc = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const limpaNome = t => String(t || '').replace(/[\[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();

async function carregarListasIA() {
  await Promise.all(['etiquetas', 'status', 'usuarios', 'origens', 'departamentos'].map(async k => {
    if (listas[k]) return;
    try { listas[k] = (await api('chat?organization=' + encodeURIComponent(empresa.id) + '&kind=' + k)).items; } catch { listas[k] = null; }
  }));
}
// editor dos departamentos: nome, fila, quando e como o cliente chega aos vendedores (fila pendente ou rodízio)
let setoresEd = [];
const setoresAtuais = () => setoresEd.filter(x => limpaNome(x.nome));
function desenharSetores() {
  const us = listas.usuarios || [];
  $('rgSetores').innerHTML = setoresEd.map((s, i) => `<div class="linha-lista" data-i="${i}"><button type="button" class="tirar" aria-label="Remover departamento" data-tira-set="${i}">×</button>
    <div class="tres"><div><label for="sN${i}">Departamento</label><input id="sN${i}" data-c="nome" list="rgDeps" maxlength="60" placeholder="Ex.: Comercial" value="${esc(s.nome)}"></div>
      <div><label for="sF${i}">Nº da fila na LeadVox</label><input id="sF${i}" data-c="filaId" maxlength="10" inputmode="numeric" placeholder="Ex.: 66" value="${esc(s.filaId)}"></div>
      <div><label for="sQ${i}">Quando a IA manda para cá</label><input id="sQ${i}" data-c="quando" maxlength="200" placeholder="Ex.: cliente quer comprar" value="${esc(s.quando)}"></div></div>
    <label for="sD${i}">Como o cliente chega aos vendedores</label>
    <select id="sD${i}" data-c="distribuicao"><option value="fila">Fila do departamento: fica pendente e quem aceitar primeiro pega</option>
      <option value="rodizio" ${s.distribuicao === 'rodizio' ? 'selected' : ''}>Rodízio: um cliente para cada vendedor, na ordem</option></select>
    ${s.distribuicao !== 'rodizio' ? '' : `<div style="margin-top:6px">${us.length ? us.map(u => `<label class="check-lin" style="margin-top:6px"><input type="checkbox" data-vend="${esc(u.id)}" ${s.vendedores.some(v => String(v.id) === String(u.id)) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')
      : '<p class="muted" style="font-size:13px">Conecte a LeadVox em Credenciais de API para escolher os vendedores.</p>'}
      <p class="muted" style="font-size:13px;margin-top:6px">${s.vendedores.length ? 'Ordem: ' + s.vendedores.map(v => esc(v.nome)).join(' → ') + ' → e começa de novo. O ticket vai direto para o vendedor.' : 'Marque os vendedores deste departamento, na ordem em que devem receber.'}</p></div>`}
  </div>`).join('') + (setoresEd.length < 12 ? '<button type="button" class="leve" id="rgMaisSet">+ Adicionar departamento</button>' : '');
  desenharPadrao();
}
$('rgSetores').addEventListener('input', e => {
  const row = e.target.closest('[data-i]'), k = e.target.dataset.c; if (!row || !k || k === 'distribuicao') return;
  const s = setoresEd[+row.dataset.i]; s[k] = e.target.value;
  if (k === 'nome') { const d = (listas.departamentos || []).find(x => semAc(x.name) === semAc(e.target.value)); if (d) { s.filaId = String(d.id); row.querySelector('[data-c="filaId"]').value = d.id; } desenharPadrao(); }
});
$('rgSetores').addEventListener('change', e => {
  const row = e.target.closest('[data-i]'); if (!row) return;
  const s = setoresEd[+row.dataset.i];
  if (e.target.dataset.c === 'distribuicao') { s.distribuicao = e.target.value; desenharSetores(); }
  else if (e.target.dataset.vend) {
    const id = e.target.dataset.vend, u = (listas.usuarios || []).find(x => String(x.id) === id);
    s.vendedores = e.target.checked ? [...s.vendedores.filter(v => String(v.id) !== id), { id: Number(id) || id, nome: u ? limpaNome(u.name) : id }] : s.vendedores.filter(v => String(v.id) !== id);
    desenharSetores();
  }
});
$('rgSetores').addEventListener('click', e => {
  if (e.target.id === 'rgMaisSet') { setoresEd.push({ nome: '', filaId: '', quando: '', distribuicao: 'fila', vendedores: [] }); desenharSetores(); marcarRg(); $('rgSetores').querySelector('.linha-lista:last-of-type input')?.focus(); }
  else if (e.target.dataset.tiraSet !== undefined) { setoresEd.splice(+e.target.dataset.tiraSet, 1); desenharSetores(); marcarRg(); }
});
function itensDe(lista) {
  if (lista === 'setores') return setoresAtuais().map(s => ({ id: Number(s.filaId) || null, name: limpaNome(s.nome) }));
  return (listas[lista] || []).map(x => ({ id: x.id, name: limpaNome(x.name), funil: x.funil })).filter(x => x.name);
}

function desenharAcoes() {
  if (!agDados || (rgSujo && rgAgente === agSel)) return;
  const c = agDados.config, r = c.regras || {};
  rgAgente = agSel;
  $('rgTexto').value = r.texto || '';
  $('rgGrupo').value = r.grupo || '';
  $('rgModoResp').value = r.responsavel === 'fixo' ? 'fixo' : 'atendente'; modoResp();
  setoresEd = (c.setores || []).map(s => ({ nome: s.nome || '', filaId: s.filaId ? String(s.filaId) : '', quando: s.quando || '', padrao: !!s.padrao,
    distribuicao: s.distribuicao === 'rodizio' ? 'rodizio' : 'fila', vendedores: Array.isArray(s.vendedores) ? s.vendedores.filter(v => v && v.id) : [] }));
  desenharSetores(); atualizarListasAcoes(); limparRg();
  carregarListasIA().then(atualizarListasAcoes);
}
function desenharPadrao() {
  const atual = $('rgPadrao').value || ((agDados.config.setores || []).find(s => s.padrao) || {}).nome || '';
  const nomes = setoresAtuais().map(s => limpaNome(s.nome));
  $('rgPadrao').innerHTML = nomes.length ? nomes.map(n => `<option ${semAc(n) === semAc(atual) ? 'selected' : ''}>${esc(n)}</option>`).join('') : '<option value="">Cadastre um departamento acima</option>';
}
// Departamentos da LeadVox: o nome vira sugestão e o número da fila se preenche sozinho.
function sugerirDepartamentos() {
  const deps = listas.departamentos || [];
  if (!$('rgDeps')) $('rgSetores').insertAdjacentHTML('afterend', '<datalist id="rgDeps"></datalist>');
  $('rgDeps').innerHTML = deps.map(d => `<option value="${esc(d.name)}">`).join('');
}
function atualizarListasAcoes() {
  sugerirDepartamentos();
  if (setoresEd.some(s => s.distribuicao === 'rodizio')) desenharSetores(); // a lista de vendedores chegou
  if (agDados) desenharLugar(); // a lista de departamentos chegou
  const us = listas.usuarios || [], atual = String((agDados.config.regras || {}).usuarioId || '');
  $('rgResp').innerHTML = us.length ? us.map(u => `<option value="${esc(u.id)}" ${String(u.id) === atual ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
    : '<option value="">Conecte a LeadVox em Credenciais de API</option>';
  conferirAcoes();
}
// Lê as ações escritas no texto e confere cada uma com as listas da LeadVox.
function lerAcoes() {
  const out = [], ruins = [];
  for (const m of $('rgTexto').value.matchAll(RE_ACAO)) {
    const def = ACOES.find(a => a.cod === m[1]), valor = limpaNome(m[2]);
    if (def.livre) { out.push({ tipo: def.tipo, cod: def.cod, nome: valor }); continue; }
    const it = itensDe(def.lista).find(x => semAc(x.name) === semAc(valor));
    if (it) out.push({ tipo: def.tipo, cod: def.cod, nome: it.name, id: it.id, ...(it.funil ? { funil: it.funil } : {}) }); else ruins.push(def.rot + ': ' + (valor || '(vazio)'));
  }
  return { acoes: out, ruins };
}
function conferirAcoes() {
  const { acoes, ruins } = lerAcoes(), vistos = new Set();
  $('rgUsadas').innerHTML = acoes.filter(a => { const k = a.cod + a.nome; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map(a => `<span>${esc(ACOES.find(x => x.cod === a.cod).rot)}${a.nome ? ': ' + esc(a.nome) : ''}</span>`).join('')
    + ruins.map(r => `<span class="ruim" title="Não existe na sua LeadVox">${esc(r)}</span>`).join('');
  const semGrupo = acoes.some(a => a.tipo === 'avisar') && !$('rgGrupo').value.replace(/\D/g, '');
  mostra($('rgAviso'), ruins.length ? 'As ações em vermelho não batem com a sua LeadVox. Apague e escolha de novo pelo @.' : semGrupo ? 'Para "Avisar no grupo", preencha o número do grupo de avisos abaixo.' : '');
}

// menu do @: aparece enquanto a palavra antes do cursor começar com @
function consultaArroba() {
  const t = $('rgTexto'), antes = t.value.slice(0, t.selectionStart), m = antes.match(/@([^\s@\[\]]{0,30})$/);
  return m ? { q: semAc(m[1]), ini: antes.length - m[0].length } : null;
}
function abrirMenu() {
  const c = consultaArroba(); if (!c) return fecharMenu();
  rgOpcoes = [];
  for (const a of ACOES) {
    const itens = a.livre ? [{ name: '' }] : itensDe(a.lista);
    for (const it of itens) if (!c.q || semAc(a.rot + ' ' + it.name).includes(c.q)) rgOpcoes.push({ a, nome: it.name });
  }
  if (!rgOpcoes.length) return fecharMenu();
  rgSel = Math.min(rgSel, rgOpcoes.length - 1);
  let grupo = '';
  $('rgMenu').innerHTML = rgOpcoes.map((o, i) => (o.a.rot !== grupo ? `<small>${esc(grupo = o.a.rot)}</small>` : '')
    + `<button type="button" role="option" data-op="${i}" aria-selected="${i === rgSel}">${esc(o.nome || o.a.rot)}</button>`).join('')
    + (ACOES.some(a => a.lista && !itensDe(a.lista).length) ? '<small>Etiquetas, etapas, origens e pessoas vêm da LeadVox conectada; departamentos, do quadro abaixo.</small>' : '');
  $('rgMenu').hidden = false;
  $('rgMenu').querySelectorAll('[data-op]').forEach(b => b.onmousedown = e => { e.preventDefault(); inserirAcao(rgOpcoes[+b.dataset.op]); });
  $('rgMenu').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
function fecharMenu() { $('rgMenu').hidden = true; rgSel = 0; }
function inserirAcao(o) {
  const t = $('rgTexto'), c = consultaArroba(); if (!c) return fecharMenu();
  const marca = '[' + o.a.cod + ':' + (o.a.livre || o.nome) + ']';
  t.value = t.value.slice(0, c.ini) + marca + ' ' + t.value.slice(t.selectionStart);
  // texto livre (nota, aviso) já vem selecionado para a pessoa trocar
  if (o.a.livre) t.setSelectionRange(c.ini + o.a.cod.length + 2, c.ini + marca.length - 1);
  else t.setSelectionRange(c.ini + marca.length + 1, c.ini + marca.length + 1);
  t.focus(); fecharMenu(); marcarRg(); conferirAcoes();
}
$('rgTexto').addEventListener('input', () => { rgSel = 0; abrirMenu(); conferirAcoes(); });
$('rgTexto').addEventListener('click', abrirMenu);
$('rgTexto').addEventListener('blur', () => setTimeout(fecharMenu, 150));
$('rgTexto').addEventListener('keydown', e => {
  if ($('rgMenu').hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); rgSel = (rgSel + (e.key === 'ArrowDown' ? 1 : -1) + rgOpcoes.length) % rgOpcoes.length; abrirMenu(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); inserirAcao(rgOpcoes[rgSel]); }
  else if (e.key === 'Escape') { e.preventDefault(); fecharMenu(); }
});
$('rgGrupo').addEventListener('input', conferirAcoes);
// responsável da oportunidade: o vendedor do ticket (com reserva) ou sempre a mesma pessoa
function modoResp() {
  const fixo = $('rgModoResp').value === 'fixo';
  $('rgRespRot').textContent = fixo ? 'Quem fica com todas as oportunidades' : 'Se ninguém estiver atendendo ainda';
  $('rgRespDica').hidden = fixo;
}
$('rgModoResp').addEventListener('change', modoResp);
function marcarRg() { rgSujo = true; $('rgSujo').textContent = 'Alterações não salvas.'; $('rgSujo').style.color = 'var(--amarelo)'; }
function limparRg() { rgSujo = false; $('rgSujo').textContent = 'Tudo salvo.'; $('rgSujo').style.color = ''; }
$('agAcoes').addEventListener('input', marcarRg);
$('agAcoes').addEventListener('change', marcarRg);
$('agAcoes').onsubmit = async e => {
  e.preventDefault(); if (!agDados) return;
  const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    const { acoes, ruins } = lerAcoes();
    if (ruins.length) throw Error('Corrija as ações em vermelho antes de salvar.');
    const padrao = $('rgPadrao').value;
    const setores = setoresAtuais().map(s => ({ nome: limpaNome(s.nome), filaId: Number(String(s.filaId).replace(/\D/g, '')) || null, quando: s.quando || '', padrao: semAc(s.nome) === semAc(padrao),
      distribuicao: s.distribuicao === 'rodizio' ? 'rodizio' : 'fila', vendedores: s.distribuicao === 'rodizio' ? s.vendedores.map(v => ({ id: Number(v.id), nome: v.nome })).filter(v => v.id) : [] }));
    const semVend = setores.find(s => s.distribuicao === 'rodizio' && !s.vendedores.length);
    if (semVend) throw Error('Marque os vendedores do rodízio de ' + semVend.nome + '.');
    if (setores.some(s => !s.filaId)) throw Error('Informe o número da fila de cada departamento.');
    if (acoes.some(a => a.tipo === 'avisar') && !$('rgGrupo').value.replace(/\D/g, '')) throw Error('Preencha o número do grupo de avisos.');
    const c = agDados.config, crm = c.crm || {};
    // etiqueta usada numa regra entra na lista que o motor aceita (as que já estavam continuam)
    const lista = (Array.isArray(crm.listaEtiquetas) ? crm.listaEtiquetas : []).map(x => typeof x === 'string' ? { nome: x } : x);
    acoes.filter(a => a.tipo === 'etiqueta' || a.tipo === 'tirar').forEach(a => { if (!lista.some(x => semAc(x.nome) === semAc(a.nome))) lista.push({ nome: a.nome }); });
    const unicas = acoes.filter((a, i) => a.id === undefined || acoes.findIndex(b => b.cod === a.cod && b.id === a.id) === i);
    // de qual funil é cada etapa: o motor transfere a oportunidade quando a etapa nova é de outro funil
    const funis = Object.fromEntries((listas.status || []).filter(e => e.funil).map(e => [String(e.id), e.funil]));
    const config = { ...c, setores, crm: { ...crm, listaEtiquetas: lista },
      regras: { texto: $('rgTexto').value.trim(), grupo: $('rgGrupo').value.replace(/\D/g, ''), responsavel: $('rgModoResp').value, usuarioId: Number($('rgResp').value) || null, acoes: unicas,
        ...(Object.keys(funis).length ? { funis } : {}) } };
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
    agDados = { ...agDados, config, versao: r.versao ?? agDados.versao };
    limparRg(); toast('Ações e regras salvas. A IA já usa na próxima mensagem.');
  } catch (err) { if (!err.status) toast(err.message, true); }
  finally { bt.disabled = false; }
};

/* conexão com a LeadVox: credenciais e listas */
let chat = null, listas = {};
const DA_LEADVOX = { etiquetas: 1, status: 1, usuarios: 1, departamentos: 1 };
async function carregarChat() { chat = await api('chat-credentials?organization=' + encodeURIComponent(empresa.id)); }

function desenharCred() {
  const st = $('credStatus'), f = $('credForm');
  if (!chat) { st.innerHTML = '<p class="muted">Carregando…</p>'; f.hidden = true; return; }
  if (chat.setupPending) {
    st.innerHTML = '<h3>Falta liberar no banco</h3><p class="alerta">A conexão com a LeadVox precisa de um ajuste no banco (o SQL das credenciais) antes de salvar.</p>';
    f.hidden = true; return;
  }
  if (chat.connected) {
    const quando = chat.updatedAt ? new Date(chat.updatedAt).toLocaleString('pt-BR') : '';
    st.innerHTML = `<h3>Conectado à sua LeadVox</h3><div class="ag-dados"><div><span>Conta</span>${esc(chat.apiId)}</div>${quando ? `<div><span>Atualizado em</span>${esc(quando)}</div>` : ''}</div>
      <div class="form-bts"><button type="button" class="sm" id="credTrocar">Trocar conexão</button><button type="button" class="sm" data-ir="etiquetas">Ver etiquetas</button></div>`;
    ligarIr(st); $('credTrocar').onclick = () => { f.hidden = false; $('credUrl').focus(); };
    f.hidden = true;
  } else { st.innerHTML = '<h3>Sua LeadVox ainda não está conectada</h3><p class="muted">Sem a conexão, a IA não enxerga suas etiquetas, status, usuários e departamentos.</p>'; f.hidden = false; }
}
$('credForm').onsubmit = async e => {
  e.preventDefault(); const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true; bt.textContent = 'Testando…';
  try {
    await api('chat-credentials', { organization: empresa.id, url: $('credUrl').value, token: $('credToken').value });
    $('credUrl').value = ''; $('credToken').value = ''; listas = {}; await carregarChat(); desenharCred(); toast('LeadVox conectada.');
  } catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; bt.textContent = 'Conectar e testar'; }
};

/* estoque: veículos do catálogo do motor (cadastro aqui ou cópia do AutoCerto / Revenda Mais) */
let estoque = null;
const preco = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
async function abrirEstoque() {
  $('esForm').hidden = true;
  try {
    await Promise.all([estoque ? null : api('estoque?organization=' + encodeURIComponent(empresa.id)).then(r => { estoque = r; }),
      conexoes ? null : carregarConexoes().catch(() => {}), motor ? null : carregarMotor().catch(() => {})]);
  } catch (err) { $('esTopo').innerHTML = '<p class="alerta" style="margin:0">' + esc(err.message) + '</p>'; return; }
  const ags = motor?.agentes || [];
  if (ags.length && !agDados) await abrirAgenteMotor((ags.find(a => a.entrada) || ags[0]).chave);
  desenharEstoque();
}
function desenharEstoque() {
  const topo = $('esTopo');
  if (!estoque || estoque.setupPending) { topo.innerHTML = '<h3>Falta liberar no banco</h3><p class="alerta">O estoque precisa do SQL do estoque antes de funcionar.</p>'; $('esLista').hidden = true; return; }
  if (!estoque.vinculado) {
    topo.innerHTML = '<div class="vazio"><b>Primeiro ligue a sua IA</b>O estoque fica na conta do motor da sua IA.<br><button type="button" data-ir="agentes">Ir para Agentes LeadVox IA</button></div>';
    ligarIr(topo); $('esLista').hidden = true; return;
  }
  const fonte = conexoes?.estoque?.connected ? conexoes.estoque.source : 'leadvox', externa = fonte === 'autocerto' || fonte === 'revendamais';
  const itens = estoque.itens || [], disp = itens.filter(i => i.status === 'disponivel').length, usa = !!agDados?.config?.catalogo?.usar;
  topo.innerHTML = `<div class="lista-topo"><div><h3>Estoque da IA · ${esc(FONTES[fonte] || fonte)}</h3>
      <p class="muted" style="margin-top:4px">${externa ? 'Copiado do ' + esc(FONTES[fonte]) + ': atualiza sozinho a cada 30 minutos.' : 'Cadastre os veículos aqui. A IA só oferece o que estiver disponível.'}
      ${itens.length} veículo${itens.length === 1 ? '' : 's'}, ${disp} disponíve${disp === 1 ? 'l' : 'is'}.</p></div>
      <div class="form-bts" style="margin:0">${externa ? '<button type="button" class="principal sm" id="esSync">Atualizar agora</button>' : '<button type="button" class="principal sm" id="esNovo">+ Cadastrar veículo</button>'}
      <button type="button" class="sm" data-ir="credenciais">Trocar fonte</button></div></div>
    ${agDados ? `<div class="lin-sw" style="margin-top:10px"><span>${esc(agDados.config.identidade.nome || 'A IA')} usa o estoque<small>Mostra os veículos, manda foto e fala de preço conforme a regra de preço da base de conhecimento.</small></span>
      <button type="button" class="switch" role="switch" aria-checked="${usa}" id="esUsar" aria-label="A IA usa o estoque"><span></span></button></div>`
      : '<p class="dica">Crie o seu agente em Agentes LeadVox IA para ele usar o estoque.</p>'}`;
  ligarIr(topo);
  if ($('esNovo')) $('esNovo').onclick = () => editarVeiculo(null);
  if ($('esSync')) $('esSync').onclick = async () => {
    $('esSync').disabled = true; $('esSync').textContent = 'Atualizando…';
    try { const r = await api('estoque', { organization: empresa.id, acao: 'sincronizar' }); estoque = r; const s = r.sincronizado || {};
      toast(`Estoque atualizado: ${s.total ?? 0} veículos (${s.novos ?? 0} novos, ${s.removidos ?? 0} saíram).`); desenharEstoque(); }
    catch (err) { toast(err.message, true); $('esSync').disabled = false; $('esSync').textContent = 'Atualizar agora'; }
  };
  if ($('esUsar')) $('esUsar').onclick = async () => {
    const c = agDados.config, cat = { ...c.catalogo, usar: !usa, fotosPorVez: Math.max(Number(c.catalogo?.fotosPorVez) || 1, 2) };
    if (agDados.tipo !== 'catalogo') cat.modo = 'vitrine';
    try { const r = await acaoMotor({ acao: 'salvar', agente: agSel, config: { ...c, catalogo: cat }, versaoBase: agDados.versao });
      agDados = { ...agDados, config: { ...c, catalogo: cat }, versao: r.versao ?? agDados.versao };
      toast(cat.usar ? 'Pronto: a IA já oferece os veículos do estoque.' : 'A IA parou de usar o estoque.'); desenharEstoque(); } catch {}
  };
  $('esLista').hidden = false;
  $('esLista').innerHTML = itens.length ? itens.map(i => {
    const manual = !/^(ac|rm):/.test(i.codigo || ''), foto = (i.fotos || [])[0];
    return `<div class="veic">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="sem-foto">sem foto</div>'}
      <div><b>${esc(i.nome)}</b><small>${esc(i.descricao || i.categoria || '')}</small>
        <span class="valor">${i.preco ? preco(i.preco) : 'Sob consulta'}</span>${i.status !== 'disponivel' ? ` <span class="st rascunho">${i.status === 'reservado' ? 'Reservado' : 'Vendido'}</span>` : ''}</div>
      <div class="bts">${manual ? `<button type="button" class="sm" data-es-ed="${i.id}">Editar</button><button type="button" class="sm perigo" data-es-ex="${i.id}">Excluir</button>` : ''}</div></div>`;
  }).join('') : `<div class="vazio"><b>Nenhum veículo ainda</b>${externa ? 'Clique em Atualizar agora para trazer o estoque.' : 'Clique em Cadastrar veículo.'}</div>`;
  $('esLista').querySelectorAll('[data-es-ed]').forEach(b => b.onclick = () => editarVeiculo(itens.find(i => String(i.id) === b.dataset.esEd)));
  $('esLista').querySelectorAll('[data-es-ex]').forEach(b => b.onclick = async () => {
    const it = itens.find(i => String(i.id) === b.dataset.esEx);
    if (!confirm('Excluir ' + (it?.nome || 'este veículo') + ' do estoque?')) return;
    try { estoque = await api('estoque', { organization: empresa.id, acao: 'excluir', id: Number(b.dataset.esEx) }); toast('Veículo excluído.'); desenharEstoque(); } catch (err) { toast(err.message, true); }
  });
}
function editarVeiculo(i) {
  const a = i?.atributos || {};
  $('esFormTit').textContent = i ? 'Editar veículo' : 'Cadastrar veículo';
  $('esId').value = i?.id || ''; $('esMarca').value = a.marca || ''; $('esModelo').value = a.modelo || ''; $('esVersao').value = a.versao || '';
  $('esAno').value = a.ano || ''; $('esKm').value = a.km || ''; $('esCor').value = a.cor || ''; $('esCambio').value = a.cambio || ''; $('esComb').value = a.combustivel || '';
  $('esCat').value = i?.categoria || ''; $('esPreco').value = i?.preco ? String(Number(i.preco)).replace('.', ',') : ''; $('esStatus').value = i?.status || 'disponivel';
  $('esFotos').value = (i?.fotos || []).join('\n'); $('esObs').value = a.obs || ''; desenharFotos();
  $('esForm').hidden = false; $('esForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('esMarca').focus();
}
// fotos: o campo de endereços é a lista (uma por linha); a grade mostra e o botão envia do aparelho
const fotosForm = () => $('esFotos').value.split(/\s+/).filter(u => /^https:\/\//.test(u));
function desenharFotos() {
  const fs = fotosForm();
  $('esGrade').innerHTML = fs.map((u, i) => `<div><img src="${esc(u)}" alt="Foto ${i + 1}" referrerpolicy="no-referrer">${i ? '' : '<span class="capa">capa</span>'}
    <button type="button" aria-label="Tirar foto ${i + 1}" data-tira-foto="${i}">×</button></div>`).join('');
  $('esGrade').querySelectorAll('[data-tira-foto]').forEach(b => b.onclick = () => { const l = fotosForm(); l.splice(+b.dataset.tiraFoto, 1); $('esFotos').value = l.join('\n'); desenharFotos(); });
}
// Reduz no próprio aparelho (lado maior até 1600 px, JPEG) para a foto subir rápido e caber no limite.
async function reduzirFoto(arq) {
  const img = await createImageBitmap(arq, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) throw Error('Não consegui abrir essa foto. Tente uma em JPG ou PNG.');
  for (const [lado, q] of [[1600, .82], [1280, .72], [1024, .65]]) {
    const k = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length < 2700000) return url;
  }
  throw Error('A foto é grande demais.');
}
$('esArquivo').onchange = async e => {
  const arqs = [...e.target.files].filter(f => /^image\//.test(f.type)); e.target.value = '';
  const vagas = 10 - fotosForm().length;
  if (!arqs.length) return; if (vagas <= 0) return toast('Cada veículo pode ter até 10 fotos.', true);
  let n = 0;
  for (const arq of arqs.slice(0, vagas)) {
    $('esEnviando').textContent = `Enviando foto ${++n} de ${Math.min(arqs.length, vagas)}…`;
    try { const r = await api('estoque-foto', { organization: empresa.id, imagem: await reduzirFoto(arq) }); $('esFotos').value = [...fotosForm(), r.url].join('\n'); desenharFotos(); }
    catch (err) { toast(err.message, true); }
  }
  $('esEnviando').textContent = '';
  if (arqs.length > vagas) toast('Só cabem 10 fotos por veículo.', true);
};
$('esFotos').addEventListener('input', desenharFotos);
$('esCancelar').onclick = () => { $('esForm').hidden = true; };
$('esForm').onsubmit = async e => {
  e.preventDefault(); const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  const item = { id: Number($('esId').value) || undefined, marca: $('esMarca').value, modelo: $('esModelo').value, versao: $('esVersao').value, ano: $('esAno').value,
    km: $('esKm').value, cor: $('esCor').value, cambio: $('esCambio').value, combustivel: $('esComb').value, categoria: $('esCat').value,
    preco: $('esPreco').value, status: $('esStatus').value, fotos: $('esFotos').value, obs: $('esObs').value, tipo: /moto/i.test($('esCat').value) ? 'moto' : 'carro' };
  try { estoque = await api('estoque', { organization: empresa.id, acao: 'salvar', item }); $('esForm').hidden = true; toast('Veículo salvo. A IA já pode oferecer.'); desenharEstoque(); }
  catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; }
};

/* webhook de eventos (Canais WhatsApp) e o checklist "Sua IA está pronta?" (Agentes) */
let eventos = null;
async function carregarEventos() { try { eventos = await api('eventos?organization=' + encodeURIComponent(empresa.id)); } catch { eventos = { erro: true }; } }
const recebendo = () => !!eventos?.ultimoEvento && Date.now() - Date.parse(eventos.ultimoEvento) < 7 * 864e5;
function desenharEventos() {
  const el = $('evConteudo');
  if (!eventos) { el.innerHTML = '<p class="muted">Carregando…</p>'; return; }
  if (eventos.setupPending || eventos.erro) { el.innerHTML = '<p class="alerta">Falta liberar no banco (o SQL do webhook de eventos).</p>'; return; }
  if (!eventos.vinculado) { el.innerHTML = '<p class="alerta">Primeiro ligue a sua IA em Agentes LeadVox IA. <button type="button" class="sm" data-ir="agentes">Ir para Agentes</button></p>'; ligarIr(el); return; }
  if (eventos.pendente) {
    el.innerHTML = '<p class="dica">Gerando o endereço da sua empresa… aparece em até 2 minutos. <button type="button" class="sm" id="evAtualizar">Atualizar</button></p>';
    $('evAtualizar').onclick = async () => { await carregarEventos(); desenharEventos(); }; return;
  }
  const quando = eventos.ultimoEvento ? new Date(eventos.ultimoEvento).toLocaleString('pt-BR') : '';
  el.innerHTML = `<div class="ev-url"><input id="evUrl" readonly aria-label="Endereço do webhook de eventos" value="${esc(eventos.url)}"><button type="button" class="principal sm" id="evCopiar">Copiar</button></div>
    <p style="margin-top:10px;font-size:14px">${recebendo() ? `<span class="st on">✓ Recebendo mensagens</span> <small class="muted">última em ${esc(quando)}</small>`
      : `<span class="st rascunho">Ainda não chegou nenhuma mensagem</span> <small class="muted">${quando ? 'última em ' + esc(quando) : 'por este endereço'}</small>`}</p>
    <p class="muted" style="font-size:12.5px;margin-top:6px">Esse endereço é só da sua empresa. Não compartilhe fora da LeadVox.</p>`;
  $('evCopiar').onclick = async () => {
    try { await navigator.clipboard.writeText(eventos.url); } catch { $('evUrl').select(); document.execCommand('copy'); }
    toast('Endereço copiado. Cole na LeadVox em Configurações → API → Webhook de eventos.');
  };
}

// Itens na ordem em que o dono resolve; cada um leva para o lugar certo do painel.
function itensProntos() {
  const ags = motor?.agentes || [], ag = ags.find(a => a.chave === agSel) || ags.find(a => a.entrada) || ags[0], c = agDados?.config || {};
  const itens = [
    ['LeadVox conectada', 'A IA conversa pela sua conta da LeadVox.', !!chat?.connected, 'credenciais'],
    ['IA ligada ao WhatsApp', 'Cria a conta da IA e liga o número da LeadVox.', !!(motor?.vinculado && motor?.conexao?.conectado), 'agentes'],
    ['Agente com nome e apresentação', 'Identidade do agente preenchida e salva.', !!ag?.configurado, 'agentes:identidade'],
    ['Onde o agente atende', 'Departamento da LeadVox ou porta de entrada.', !!(ag && (ag.departamentoId || ag.entrada)), 'agentes:identidade'],
    ['Mensagens da LeadVox chegando', 'Endereço do webhook de eventos colado na LeadVox.', recebendo(), 'canais'],
    ['Base de conhecimento', 'O que a empresa faz e pelo menos uma pergunta frequente.', !!(c.empresa?.descricao && (c.conhecimento?.faq || []).length), 'conhecimento']
  ];
  if (cfg.niche === 'automotivo') itens.push(['Estoque com veículos', 'Veículos disponíveis e a IA usando o estoque.', !!(c.catalogo?.usar && (estoque?.itens || []).some(i => i.status === 'disponivel')), 'estoque']);
  itens.push(['Agente ligado', 'Ligado, ele começa a responder os clientes.', !!ag?.ativo, 'agentes:identidade']);
  return itens;
}
let prontoAberto = null;
function desenharPronto() {
  const box = $('prontoBox');
  if (!motor || motor.setupPending) { box.hidden = true; return; }
  if (cfg.niche === 'automotivo' && !estoque && motor.vinculado) api('estoque?organization=' + encodeURIComponent(empresa.id)).then(r => { estoque = r; desenharPronto(); }).catch(() => {});
  const itens = itensProntos(), feitos = itens.filter(i => i[2]).length, tudo = feitos === itens.length;
  const aberto = prontoAberto ?? !tudo;
  box.hidden = false;
  box.innerHTML = `<div class="pronto-topo"><div><h3>${tudo ? '✓ Sua IA está pronta' : 'Sua IA está pronta?'}</h3>
      <p class="muted" style="margin-top:2px">${feitos} de ${itens.length} itens prontos${tudo ? '. Ela já atende os seus clientes.' : '. Resolva os que faltam para a IA atender sozinha.'}</p></div>
      <button type="button" class="sm" id="prontoVer">${aberto ? 'Esconder' : 'Ver itens'}</button></div>
    <div class="pronto-barra"><i style="width:${Math.round(feitos / itens.length * 100)}%"></i></div>
    ${aberto ? `<div class="pronto-lista">${itens.map(([t, d, ok, ir]) => `<div><span class="${ok ? 'ok' : 'falta'}" aria-hidden="true">${ok ? '✓' : '○'}</span>
      <span>${esc(t)}<small>${esc(d)}</small></span>${ok ? '<span class="st on">Pronto</span>' : `<button type="button" class="sm" data-resolver="${ir}">Resolver</button>`}</div>`).join('')}</div>` : ''}`;
  $('prontoVer').onclick = () => { prontoAberto = !aberto; desenharPronto(); };
  box.querySelectorAll('[data-resolver]').forEach(b => b.onclick = () => {
    const [pg, aba] = b.dataset.resolver.split(':');
    abrir(pg);
    if (aba) { document.querySelector('[data-ag="' + aba + '"]')?.click(); $('agDetalhe').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
}

/* outras conexões: estoque e Asaas */
let conexoes = null, estFonte = '';
const FONTES = { autocerto: 'AutoCerto', revendamais: 'Revenda Mais', leadvox: 'Estoque LeadVox' };
async function carregarConexoes() { conexoes = await api('integrations?organization=' + encodeURIComponent(empresa.id)); }
const quandoBR = d => d ? new Date(d).toLocaleString('pt-BR') : '';

function escolherFonte(f) {
  estFonte = f;
  document.querySelectorAll('[data-fonte]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fonte === f)));
  $('estAC').hidden = f !== 'autocerto'; $('estRM').hidden = f !== 'revendamais'; $('estLV').hidden = f !== 'leadvox';
  $('estSalvar').textContent = f === 'leadvox' ? 'Usar o Estoque LeadVox' : 'Salvar e testar';
}
document.querySelectorAll('[data-fonte]').forEach(b => b.onclick = () => escolherFonte(b.dataset.fonte));

function desenharConexoes() {
  const mostraEst = cfg.niche === 'automotivo', mostraAs = !!cfg.billingEnabled;
  ['estTit', 'estStatus'].forEach(id => $(id).hidden = !mostraEst); if (!mostraEst) $('estForm').hidden = true;
  ['asTit', 'asStatus'].forEach(id => $(id).hidden = !mostraAs); if (!mostraAs) $('asForm').hidden = true;
  if (!conexoes) { $('estStatus').innerHTML = $('asStatus').innerHTML = '<p class="muted">Carregando…</p>'; return; }
  if (conexoes.setupPending) {
    $('estStatus').innerHTML = $('asStatus').innerHTML = '<p class="alerta" style="margin:0">Falta liberar no banco (o SQL das conexões) antes de salvar.</p>';
    $('estForm').hidden = $('asForm').hidden = true; return;
  }
  const e = conexoes.estoque;
  if (mostraEst) {
    if (e?.connected) {
      const det = e.source === 'autocerto' ? `<div><span>Unidade</span>${esc(e.unidade)}</div><div><span>Usuário da API</span>${esc(e.usuario)}</div>`
        : e.source === 'revendamais' ? `<div><span>Feed</span>${esc(e.feedHost)}</div><div><span>Veículos no teste</span>${esc(e.vehicles ?? '—')}</div>` : '<div><span>Cadastro</span>Aqui no painel, na página Estoque</div>';
      $('estStatus').innerHTML = `<h3>Estoque: ${esc(FONTES[e.source] || e.source)}</h3><div class="ag-dados">${det}<div><span>Atualizado em</span>${esc(quandoBR(e.updatedAt))}</div></div>
        <div class="form-bts"><button type="button" class="sm" id="estTrocar">Trocar fonte de estoque</button></div>`;
      $('estTrocar').onclick = () => { $('estForm').hidden = false; };
      $('estForm').hidden = true;
      $('estUnidade').value = e.unidade || ''; $('estUsuario').value = e.usuario || '';
      escolherFonte(e.source);
    } else {
      $('estStatus').innerHTML = '<h3>Estoque ainda não configurado</h3><p class="muted">Sem o estoque, a IA não mostra os veículos da loja.</p>';
      $('estForm').hidden = false; if (!estFonte) escolherFonte('autocerto');
    }
  }
  const a = conexoes.asaas;
  if (mostraAs) {
    if (a?.connected) {
      $('asStatus').innerHTML = `<h3>Asaas conectado</h3><div class="ag-dados"><div><span>Ambiente</span>${a.environment === 'production' ? 'Produção' : 'Teste (sandbox)'}</div><div><span>Atualizado em</span>${esc(quandoBR(a.updatedAt))}</div></div>
        <div class="form-bts"><button type="button" class="sm" id="asTrocar">Trocar chave ou ambiente</button></div>`;
      $('asTrocar').onclick = () => { $('asForm').hidden = false; };
      $('asForm').hidden = true; $('asAmb').value = a.environment || 'sandbox';
    } else {
      $('asStatus').innerHTML = '<h3>Asaas ainda não conectado</h3><p class="muted">É pelo Asaas que as cobranças dos seus clientes vão ser emitidas.</p>';
      $('asForm').hidden = false;
    }
  }
}
async function salvarConexao(form, dados, ok) {
  const bt = form.querySelector('button[type=submit]'), txt = bt.textContent; bt.disabled = true; bt.textContent = 'Testando…';
  try { await api('integrations', { organization: empresa.id, ...dados }); form.querySelectorAll('input[type=password]').forEach(i => i.value = ''); await carregarConexoes(); desenharConexoes(); toast(ok); }
  catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; bt.textContent = txt; }
}
$('estForm').onsubmit = e => {
  e.preventDefault();
  if (!estFonte) return toast('Escolha de onde vem o estoque.', true);
  salvarConexao(e.currentTarget, { provider: 'estoque', source: estFonte, unidade: $('estUnidade').value, usuario: $('estUsuario').value, senha: $('estSenha').value, feedUrl: $('estFeed').value },
    estFonte === 'leadvox' ? 'Estoque LeadVox ativado.' : 'Estoque conectado.');
};
$('asForm').onsubmit = e => {
  e.preventDefault();
  salvarConexao(e.currentTarget, { provider: 'asaas', environment: $('asAmb').value, apiKey: $('asChave').value }, 'Asaas conectado.');
};

async function desenharLista(pg, forcar) {
  const [t, d] = LISTA[pg];
  $('listaItens').innerHTML = ''; $('listaTopo').hidden = true;
  const vazio = (titulo, texto, ir) => {
    $('listaVazio').hidden = false;
    $('listaVazio').innerHTML = `<b>${titulo}</b>${texto}` + (ir ? `<br><button type="button" data-ir="${ir[0]}">${ir[1]}</button>` : '');
    ligarIr($('listaVazio'));
  };
  if (!DA_LEADVOX[pg]) return vazio(t, d, pg === 'arquivos' ? ['conhecimento', 'Abrir base de conhecimento'] : null);
  if (!chat?.connected) return vazio(t, d, ['credenciais', 'Conectar minha LeadVox']);
  $('listaVazio').hidden = true; $('listaTopo').hidden = false;
  $('listaInfo').textContent = 'Da sua LeadVox · conta ' + chat.apiId; $('listaItens').innerHTML = '<p class="muted" style="padding:12px 0">Buscando na LeadVox…</p>';
  try {
    if (!listas[pg] || forcar) listas[pg] = (await api('chat?organization=' + encodeURIComponent(empresa.id) + '&kind=' + pg)).items;
    if (abaAtual !== pg) return;
    const itens = listas[pg];
    $('listaInfo').textContent = itens.length + ' na sua LeadVox · conta ' + chat.apiId;
    $('listaItens').innerHTML = itens.map(i => linha(
      (i.color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${i.color};margin-right:8px"></span>` : '') + esc(i.name || 'Sem nome'),
      'ID ' + esc(i.id))).join('') || '<p class="muted" style="padding:12px 0">Nada cadastrado na sua LeadVox.</p>';
  } catch (err) {
    if (abaAtual !== pg) return;
    $('listaItens').innerHTML = ''; vazio('Não deu para buscar agora', esc(err.message), ['credenciais', 'Ver conexão']);
  }
}
$('listaAtualizar').onclick = () => desenharLista(abaAtual, true);

/* dashboard: números do motor por dia (Redis → iag_relatorio pelo n8n a cada 15 min) */
const isoBR = d => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const nomeBonito = k => k.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
function periodo(dias) {
  const hoje = new Date(); $('dFim').value = isoBR(hoje); $('dIni').value = isoBR(new Date(hoje - (dias - 1) * 864e5));
  document.querySelectorAll('[data-dias]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.dias) === dias)));
}
periodo(30);
document.querySelectorAll('[data-dias]').forEach(b => b.onclick = () => { periodo(Number(b.dataset.dias)); carregarDashboard(); });
$('dAplicar').onclick = () => { document.querySelectorAll('[data-dias]').forEach(b => b.setAttribute('aria-pressed', 'false')); carregarDashboard(); };
async function carregarDashboard() {
  const aviso = m => { $('dAviso').textContent = m || ''; $('dAviso').hidden = !m; };
  if ($('dIni').value > $('dFim').value) return aviso('A data de início precisa ser antes do fim.');
  aviso(''); $('dAtual').textContent = 'Carregando…';
  let r;
  try { r = await api('relatorio?organization=' + encodeURIComponent(empresa.id) + '&ini=' + $('dIni').value + '&fim=' + $('dFim').value); }
  catch (err) { $('dAtual').textContent = ''; return aviso(err.message); }
  if (r.setupPending) { $('dAtual').textContent = ''; desenharDashboard([]); return aviso('Falta liberar no banco (o SQL do relatório) para os números aparecerem.'); }
  if (!r.vinculado) { $('dAtual').textContent = ''; desenharDashboard([]); return aviso('Ligue a sua IA em Agentes LeadVox IA para ver os números.'); }
  $('dAtual').textContent = r.atualizado ? 'Atualizado em ' + new Date(r.atualizado).toLocaleString('pt-BR') + ' · os números chegam a cada 15 minutos.' : 'Ainda não chegou nenhum número da IA.';
  desenharDashboard(r.dias || []);
}
function desenharDashboard(dias) {
  const soma = k => dias.reduce((s, d) => s + (Number((d.metricas || {})[k]) || 0), 0);
  const somaU = k => dias.reduce((s, d) => s + (Number((d.uso || {})[k]) || 0), 0);
  const fmt = n => Number(n).toLocaleString('pt-BR');
  const conv = soma('conversas'), transf = soma('transferidos'), teste = somaU('contatosTeste');
  const val = { conversas: conv, novos: soma('novos'), transferidos: transf, respostas: somaU('respostas'), followups: soma('followups'), passagens: soma('passagens'), pedidos: soma('pedidos'), robos: somaU('robos') };
  document.querySelectorAll('#vDashboard [data-d]').forEach(b => { b.textContent = fmt(val[b.dataset.d] || 0); });
  $('dTaxa').textContent = conv ? Math.round(transf / conv * 100) + '% das conversas' : 'das conversas';
  $('dRet').textContent = soma('retomadas') ? 'e ' + fmt(soma('retomadas')) + ' recontatos no dia seguinte' : 'e recontatos';
  $('dTeste').textContent = teste ? 'inclui conversas de números de teste' : 'mensagens que a IA mandou';
  // um ponto por dia do período (dia sem conversa = 0)
  const porDia = {}; dias.forEach(d => { porDia[String(d.dia).slice(0, 10)] = d; });
  const serie = []; for (let t = Date.parse($('dIni').value + 'T12:00:00Z'); t <= Date.parse($('dFim').value + 'T12:00:00Z'); t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10), d = porDia[k] || {};
    serie.push({ k, conv: Number((d.metricas || {}).conversas) || 0, resp: Number((d.uso || {}).respostas) || 0, transf: Number((d.metricas || {}).transferidos) || 0 });
  }
  desenharGrafico(serie);
  $('dTabela').innerHTML = '<table class="tabela-d"><thead><tr><th>Dia</th><th>Conversas</th><th>Passou p/ equipe</th><th>Respostas da IA</th></tr></thead><tbody>'
    + serie.filter(s => s.conv || s.resp || s.transf).reverse().map(s => `<tr><td>${s.k.slice(8)}/${s.k.slice(5, 7)}</td><td>${fmt(s.conv)}</td><td>${fmt(s.transf)}</td><td>${fmt(s.resp)}</td></tr>`).join('')
    + '</tbody></table>';
  const ranking = (el, pre, vazio) => {
    const tot = {}; dias.forEach(d => Object.entries(d.metricas || {}).forEach(([k, v]) => { if (k.startsWith(pre)) tot[k.slice(pre.length)] = (tot[k.slice(pre.length)] || 0) + (Number(v) || 0); }));
    const lista = Object.entries(tot).sort((a, b) => b[1] - a[1]), max = lista[0]?.[1] || 1;
    $(el).innerHTML = lista.length ? '<div class="ranking">' + lista.map(([k, v]) => `<div><span>${esc(nomeBonito(k))}</span><b>${fmt(v)}</b><i style="width:${Math.max(4, v / max * 100)}%"></i></div>`).join('') + '</div>'
      : `<p class="muted" style="font-size:14px">${vazio}</p>`;
  };
  ranking('dSetores', 'setor_', 'Nenhuma passagem no período.');
  ranking('dAgentes', 'ag_', 'Sem conversas no período.');
}
// Barras de conversas por dia (SVG, sem biblioteca). Cada barra tem área de toque maior que ela e mostra o valor no hover/foco.
function desenharGrafico(serie) {
  const el = $('dGrafico'), W = Math.max(300, el.clientWidth || 640), H = 220, mE = 30, mB = 22, mT = 8; // largura real: texto sem distorcer
  if (!serie.some(s => s.conv)) { el.innerHTML = '<div class="vazio"><b>Sem conversas no período</b>Conversas de números de teste não entram neste gráfico.</div>'; return; }
  const max = Math.max(...serie.map(s => s.conv)), passo = Math.max(1, Math.ceil(max / 4)), topo = passo * Math.ceil(max / passo);
  const larg = (W - mE) / serie.length, barra = Math.max(2, Math.min(28, larg - 2)), y = v => mT + (H - mT - mB) * (1 - v / topo);
  const rot = Math.ceil(serie.length / 8);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Conversas com a IA por dia">`;
  for (let v = 0; v <= topo; v += passo) svg += `<line class="grade-l" x1="${mE}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="eixo" x="${mE - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  serie.forEach((s, i) => {
    const x = mE + i * larg + (larg - barra) / 2, h = Math.max(0, H - mB - y(s.conv)), r = Math.min(4, barra / 2, h);
    svg += `<rect class="alvo" x="${mE + i * larg}" y="${mT}" width="${larg}" height="${H - mT - mB}" tabindex="0" data-i="${i}"/>`;
    svg += h ? `<path class="barra" d="M${x},${H - mB} v${-(h - r)} q0,${-r} ${r},${-r} h${barra - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>` : '<g class="barra"></g>';
    if (i % rot === 0) svg += `<text class="eixo" x="${mE + i * larg + larg / 2}" y="${H - 6}" text-anchor="middle">${s.k.slice(8)}/${s.k.slice(5, 7)}</text>`;
  });
  el.innerHTML = svg + '</svg><div class="dica-g" hidden></div>';
  const dica = el.querySelector('.dica-g');
  const mostrar = (alvo) => {
    const s = serie[+alvo.dataset.i], caixa = el.getBoundingClientRect(), a = alvo.getBoundingClientRect();
    dica.replaceChildren(); const b = document.createElement('b'); b.textContent = s.conv + (s.conv === 1 ? ' conversa' : ' conversas');
    const sp = document.createElement('span'); sp.textContent = s.k.slice(8) + '/' + s.k.slice(5, 7) + ' · ' + s.transf + ' para a equipe · ' + s.resp + ' respostas';
    dica.append(b, sp); dica.hidden = false;
    dica.style.left = Math.min(Math.max(a.left - caixa.left + a.width / 2, 90), caixa.width - 90) + 'px'; dica.style.top = (y(s.conv) / H * caixa.height - 6) + 'px';
  };
  el.querySelectorAll('.alvo').forEach(a => { a.onpointerenter = () => mostrar(a); a.onfocus = () => mostrar(a); a.onpointerleave = a.onblur = () => { dica.hidden = true; }; });
}

/* conta */
$('formConfig').onsubmit = async e => {
  e.preventDefault();
  try {
    const zap = $('cfZap').value.replace(/\D/g, '');
    if (zap && (zap.length < 10 || zap.length > 13)) throw Error('Confira o WhatsApp: DDD e número.');
    await salvarCfg({ displayName: $('cfNome').value.trim(), niche: $('cfNicho').value, aiName: $('cfIa').value.trim(), whatsapp: zap, billingEnabled: $('cfCobr').checked });
    abrirApp('conta'); toast('Salvo.');
  } catch (err) { toast(err.message, true); }
};
$('formSenha').onsubmit = async e => {
  e.preventDefault();
  try { await api('password', { password: $('nsSenha').value }); $('nsSenha').value = ''; toast('Senha trocada.'); }
  catch (err) { toast(err.message, true); }
};

/* ═══════════ PAINEL LEADVOX (dono da plataforma) ═══════════ */
async function carregarLv() {
  const d = await api('admin');
  const cfgDe = Object.fromEntries((d.workspaces || []).map(w => [w.organization_id, w.settings || {}]));
  const agora = Date.now();
  const minhas = new Set(conta.organizations.map(o => o.id));
  const lista = (d.organizations || []).filter(o => !minhas.has(o.id)).map(o => ({ ...o, s: cfgDe[o.id] || {} }));
  const emTeste = lista.filter(o => new Date(o.trial_ends_at) > agora).length;
  const prontos = lista.filter(o => o.s.onboarded).length;
  $('lvNumeros').innerHTML = `<div><b>${lista.length}</b><small>clientes</small></div><div><b>${emTeste}</b><small>em teste</small></div>
    <div><b>${prontos}</b><small>com o painel montado</small></div><div><b>${lista.length - prontos}</b><small>ainda montando</small></div>`;
  $('lvLista').innerHTML = lista.map(o => {
    const fim = new Date(o.trial_ends_at), nicho = NICHOS[o.s.niche];
    const sub = [nicho ? nicho.ic + ' ' + nicho.n : 'Ainda montando o painel', 'desde ' + new Date(o.created_at).toLocaleDateString('pt-BR'),
      o.s.whatsapp ? 'WhatsApp ' + o.s.whatsapp : ''].filter(Boolean).join(' · ');
    const st = fim > agora ? `<span class="st on">Teste até ${fim.toLocaleDateString('pt-BR')}</span>` : `<span class="st rascunho">Teste acabou</span>`;
    return linha(esc(o.s.displayName || o.name) + (o.s.aiName ? ` <small style="display:inline">· IA ${esc(o.s.aiName)}</small>` : ''), esc(sub), st + (o.s.billingEnabled ? ' <span class="st">Cobranças</span>' : ''));
  }).join('') || '<p class="muted" style="padding:16px 0">Nenhum cliente ainda.</p>';
}
$('lvAtualizar').onclick = () => carregarLv().then(() => toast('Atualizado.')).catch(err => toast(err.message, true));

/* ═══════════ CLIENTES E COBRANÇAS ═══════════ */
let fin = null, cAba = 'customers', editando = null;
const EVENTOS = { issued: 'Cobrança emitida', paid: 'Pagamento confirmado', overdue: 'Venceu sem pagar', negotiation: 'Pediu para negociar' };
const NOVO = { customers: 'Novo cliente', plans: 'Novo plano', contracts: 'Nova recorrência', rules: 'Nova regra' };
const EDITAR = { customers: 'Editar cliente', plans: 'Editar plano', contracts: 'Editar recorrência', rules: 'Editar regra' };
const DICA = {
  customers: 'Quem paga você todo mês.',
  plans: 'O que você vende e de quanto em quanto tempo cobra.',
  contracts: 'Qual cliente paga qual plano, e a partir de quando.',
  rules: 'O que fazer no funil quando algo acontecer na cobrança. Fica desligado até ligarmos a LeadVox.',
  payments: 'Só aparecem aqui pagamentos confirmados pelo Asaas, quando ele estiver conectado.'
};
const acha = (tipo, id) => fin[tipo].find(x => x.id === id);

async function carregarFin(forcar) {
  if (!fin || forcar) fin = await api('billing?organization=' + encodeURIComponent(empresa.id));
  const pagos = fin.payments.filter(p => ['confirmed', 'received'].includes(p.status)).reduce((s, p) => s + p.amount_cents, 0);
  const rasc = fin.contracts.filter(c => c.status === 'draft').length;
  $('nClientes').textContent = fin.customers.length; $('nPlanos').textContent = fin.plans.length;
  $('nRascunhos').textContent = rasc; $('nPagos').textContent = dinheiro(pagos);
  if (abaAtual === 'cobrancas') desenharFin();
}

function linha(titulo, sub, direita, bts) {
  return `<div class="item"><div><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="bts">${direita || ''}${bts || ''}</div></div>`;
}
const btEditar = id => `<button class="sm" type="button" data-editar="${esc(id)}">Editar</button>`;

function desenharFin() {
  document.querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === cAba)));
  $('cForm').hidden = true; $('cAgenda').hidden = true;
  let itens = [];
  if (cAba === 'customers') itens = fin.customers.map(c => linha(esc(c.name), esc([c.email, c.phone].filter(Boolean).join(' · ')), '', btEditar(c.id)));
  if (cAba === 'plans') itens = fin.plans.map(p => linha(esc(p.name), esc(cycles[p.cycle]), `<span class="valor">${dinheiro(p.amount_cents)}</span>`, btEditar(p.id)));
  if (cAba === 'contracts') itens = fin.contracts.map(c => linha(
    esc(acha('customers', c.customer_id)?.name || 'Cliente'),
    esc((acha('plans', c.plan_id)?.name || 'Plano') + ' · ' + cycles[c.cycle] + ' · 1º vencimento ' + dataBR(c.first_due_date)) + ` <span class="st rascunho">${c.status === 'paused' ? 'Pausada' : 'Rascunho'}</span>`,
    `<span class="valor">${dinheiro(c.amount_cents)}</span>`,
    btEditar(c.id) + `<button class="sm" type="button" data-agenda="${esc(c.id)}">Ver vencimentos</button>`));
  if (cAba === 'rules') itens = fin.rules.map(r => linha(esc(EVENTOS[r.event]), 'Vai para a etapa ' + esc(r.target_step_id) + (r.responsible_id ? ' · responsável ' + esc(r.responsible_id) : '') + ' <span class="st">Desligada</span>', '', btEditar(r.id)));
  if (cAba === 'payments') itens = fin.payments.map(p => linha(dataBR(p.due_date), esc(p.status) + ' · ' + esc(p.provider_payment_id), `<span class="valor">${dinheiro(p.amount_cents)}</span>`));
  $('cLista').innerHTML = `<div class="lista-topo"><div><h2>${document.querySelector(`[data-c="${cAba}"]`).textContent}</h2><p class="muted">${DICA[cAba]}</p></div>
    ${NOVO[cAba] ? `<button class="principal" type="button" id="cNovo">+ ${NOVO[cAba]}</button>` : ''}</div>
    <div style="margin-top:10px">${itens.join('') || `<p class="muted" style="padding:16px 0">Nada cadastrado ainda.</p>`}</div>`;
  $('cNovo')?.addEventListener('click', () => formFin());
  document.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => formFin(b.dataset.editar));
  document.querySelectorAll('[data-agenda]').forEach(b => b.onclick = () => {
    const c = acha('contracts', b.dataset.agenda);
    $('cAgenda').innerHTML = `<h3>Próximos vencimentos</h3><p class="muted">${esc(acha('customers', c.customer_id)?.name || '')} · previsão, nenhum boleto foi emitido.</p>
      <div class="datas">${schedule(c.first_due_date, c.cycle).map(d => `<span>${dataBR(d)}</span>`).join('')}</div>`;
    $('cAgenda').hidden = false; $('cAgenda').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cAba = b.dataset.c; desenharFin(); });

const campo = (rot, nome, valor = '', tipo = 'text', extra = '') =>
  `<label for="f_${nome}">${rot}</label><input id="f_${nome}" name="${nome}" type="${tipo}" value="${esc(valor)}" ${extra}>`;
const escolha = (rot, nome, ops, valor) =>
  `<label for="f_${nome}">${rot}</label><select id="f_${nome}" name="${nome}" required>${ops.map(([id, n]) => `<option value="${esc(id)}" ${id === valor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
const reais = c => c ? String(c / 100).replace('.', ',') : '';

function formFin(id) {
  editando = id || null; const r = (id && acha(cAba, id)) || {};
  let h = '';
  if (cAba === 'customers') h = campo('Nome do cliente', 'name', r.name, 'text', 'required minlength="2" maxlength="120"')
    + `<div class="duas"><div>${campo('E-mail', 'email', r.email, 'email', 'maxlength="254"')}</div><div>${campo('WhatsApp', 'phone', r.phone, 'tel', 'maxlength="30" placeholder="(21) 99999-0000"')}</div></div>`;
  if (cAba === 'plans') h = campo('Nome do plano', 'name', r.name, 'text', 'required minlength="2" maxlength="100"')
    + `<div class="duas"><div>${campo('Valor (R$)', 'amount', reais(r.amount_cents), 'text', 'required inputmode="decimal" placeholder="459,97"')}</div><div>${escolha('Cobra a cada', 'cycle', Object.entries(cycles), r.cycle || 'MONTHLY')}</div></div>`;
  if (cAba === 'contracts') {
    if (!fin.customers.length || !fin.plans.length) return toast('Cadastre primeiro um cliente e um plano.', true);
    const p = acha('plans', r.plan_id) || fin.plans[0];
    h = `<div class="duas"><div>${escolha('Cliente', 'customer_id', fin.customers.map(c => [c.id, c.name]), r.customer_id || fin.customers[0].id)}</div>
      <div>${escolha('Plano', 'plan_id', fin.plans.map(x => [x.id, x.name]), r.plan_id || p.id)}</div></div>
      <div class="duas"><div>${campo('Valor combinado (R$)', 'amount', reais(r.amount_cents || p.amount_cents), 'text', 'required inputmode="decimal"')}</div>
      <div>${escolha('Cobra a cada', 'cycle', Object.entries(cycles), r.cycle || p.cycle)}</div></div>
      <div class="duas"><div>${campo('1º vencimento', 'first_due_date', r.first_due_date || new Date().toISOString().slice(0, 10), 'date', 'required')}</div>
      <div>${escolha('Situação', 'status', [['draft', 'Rascunho'], ['paused', 'Pausada']], r.status || 'draft')}</div></div>
      ${campo('Lembretes <small>(dias antes e depois do vencimento)</small>', 'reminder_days', (r.reminder_days || [-3, 0, 3]).join(','), 'text', 'required')}
      <p class="dica">-3,0,3 = três dias antes, no dia e três dias depois. Os lembretes ainda não são enviados.</p>`;
  }
  if (cAba === 'rules') h = escolha('Quando acontecer', 'event', Object.entries(EVENTOS), r.event || 'issued')
    + `<div class="duas"><div>${campo('ID da etapa do funil', 'target_step_id', r.target_step_id, 'text', 'required maxlength="100"')}</div><div>${campo('ID do responsável <small>(opcional)</small>', 'responsible_id', r.responsible_id, 'text', 'maxlength="100"')}</div></div>
      <p class="dica">Na próxima etapa você vai escolher pelo nome as etapas e os usuários da sua LeadVox, em vez do ID.</p>`;
  const f = $('cForm');
  f.innerHTML = `<h3>${id ? EDITAR[cAba] : NOVO[cAba]}</h3>${h}<div class="form-bts"><button class="principal" type="submit">Salvar</button><button type="button" id="cCancelar">Cancelar</button></div>`;
  f.hidden = false; $('cCancelar').onclick = () => f.hidden = true;
  if (cAba === 'contracts') f.elements.plan_id.onchange = () => { const p = acha('plans', f.elements.plan_id.value); f.elements.amount.value = reais(p.amount_cents); f.elements.cycle.value = p.cycle; };
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('cForm').onsubmit = async e => {
  e.preventDefault(); const bt = e.currentTarget.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    await api('billing', { organization: empresa.id, kind: cAba, id: editando, data: Object.fromEntries(new FormData(e.currentTarget)) });
    await carregarFin(true); toast('Salvo em rascunho. Nada foi cobrado nem enviado.');
  } catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; }
};

/* ═══════════ OPORTUNIDADES ═══════════ */
// Espelho do funil da LeadVox: as colunas são as etapas, na ordem da LeadVox, com as oportunidades de cada uma.
// Arrastar o cartão (ou usar "Mover para…") muda a etapa lá na LeadVox, como a tela Pipeline do chat.
let opDados = null;
async function carregarOportunidades() {
  const aviso = m => { $('opAviso').textContent = m || ''; $('opAviso').hidden = !m; };
  aviso(''); $('opResumo').textContent = 'Buscando na sua LeadVox…'; $('opAtualizar').disabled = true;
  try {
    opDados = await api('oportunidades?organization=' + encodeURIComponent(empresa.id) + '&status=' + $('opStatus').value + '&funil=' + encodeURIComponent($('opFunilSel').value || ''));
    // vários funis na LeadVox: escolhe qual mostrar (vem aberto no funil padrão)
    $('opFunilCx').hidden = opDados.funis.length < 2;
    $('opFunilSel').innerHTML = opDados.funis.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    $('opFunilSel').value = opDados.funil;
    desenharOportunidades();
  }
  catch (err) { opDados = null; $('opResumo').textContent = ''; $('opFunil').innerHTML = ''; aviso(err.message); }
  finally { $('opAtualizar').disabled = false; }
}
function desenharOportunidades() {
  if (!opDados) return;
  const busca = $('opBusca').value.trim().toLowerCase(), digitos = busca.replace(/\D/g, '');
  const ops = opDados.oportunidades.filter(o => !busca || [o.contato, o.nome, o.responsavel].some(t => t.toLowerCase().includes(busca)) || (digitos.length >= 4 && o.numero.includes(digitos)));
  const conhecida = o => opDados.etapas.some(e => e.id === o.etapaId);
  const etapas = ops.some(o => !conhecida(o)) ? [...opDados.etapas, { id: '', name: 'Sem etapa', color: null }] : opDados.etapas;
  const soma = l => preco(l.reduce((t, o) => t + o.valor, 0));
  const STATUS = { won: ['Ganha', 'on'], lost: ['Perdida', 'perdida'] };
  const dataBR = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const inicial = o => esc((o.contato || o.nome || '?').trim().charAt(0).toUpperCase());
  const tots = !busca && $('opStatus').value === 'open' ? Object.values(opDados.totais || {}) : [];
  const n = tots.length ? tots.reduce((t, x) => t + x.count, 0) : ops.length;
  $('opResumo').textContent = `${n} oportunidade${n === 1 ? '' : 's'} · ${tots.length ? preco(tots.reduce((t, x) => t + x.valor, 0)) : soma(ops)}${opDados.incompleto ? ' · nas colunas, as mais recentes' : ''}`;
  $('opFunil').innerHTML = etapas.map(e => {
    const l = ops.filter(o => e.id ? o.etapaId === e.id : !conhecida(o));
    const [titulo, desc] = e.name.split(/➤|→/).map(s => s.trim());
    // sem busca, o topo da coluna usa o total da LeadVox (conta também o que não coube na tela)
    const tot = !busca && $('opStatus').value === 'open' && opDados.totais?.[e.id];
    const topo = tot ? `${tot.count} · ${preco(tot.valor)}` : `${l.length} · ${soma(l)}`;
    return `<div class="fu-col" style="--cor:${e.color || 'var(--linha)'}" ${e.id ? `data-etapa="${esc(e.id)}"` : ''}><div class="fu-cab"><b>${esc(titulo)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}<span>${topo}</span></div>
      <div class="fu-cards">${l.map(o => `<div class="fu-card" draggable="true" data-op="${esc(o.id)}">
        <div class="fu-quem">${o.foto ? `<img src="${esc(o.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-inicial="${inicial(o)}">` : `<i>${inicial(o)}</i>`}
          <div><b>${esc(o.contato || o.nome)}</b>${o.numero ? `<small>${esc(zapFmt(o.numero.replace(/^55/, '')))}</small>` : ''}</div></div>
        ${o.nome && o.nome !== o.contato ? `<p>${esc(o.nome)}</p>` : ''}
        <div class="fu-pe"><b>${preco(o.valor)}</b>${STATUS[o.status] ? `<span class="st ${STATUS[o.status][1]}">${STATUS[o.status][0]}</span>` : ''}${o.previsao ? `<small>Previsão ${dataBR(o.previsao)}</small>` : ''}</div>
        ${o.responsavel ? `<small class="muted">Responsável: ${esc(o.responsavel)}</small>` : ''}
        <select class="fu-mover" data-mover="${esc(o.id)}" aria-label="Mover ${esc(o.contato || o.nome)}">${opcoesMover(o)}</select></div>`).join('') || '<p class="muted fu-vazio">Nenhuma</p>'}</div></div>`;
  }).join('') || '<p class="muted">O funil da sua LeadVox ainda não tem etapas.</p>';
  // foto que não carrega vira a inicial do nome
  $('opFunil').querySelectorAll('img[data-inicial]').forEach(i => i.onerror = () => { const x = document.createElement('i'); x.textContent = i.dataset.inicial; i.replaceWith(x); });
  // arrastar e soltar entre as colunas (computador); no celular, o "Mover para…" de cada cartão
  $('opFunil').querySelectorAll('[data-op]').forEach(c => c.ondragstart = ev => { ev.dataTransfer.setData('text/plain', c.dataset.op); ev.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastando'); });
  $('opFunil').querySelectorAll('[data-op]').forEach(c => c.ondragend = () => c.classList.remove('arrastando'));
  $('opFunil').querySelectorAll('[data-etapa]').forEach(col => {
    col.ondragover = ev => { ev.preventDefault(); col.classList.add('alvo'); };
    col.ondragleave = ev => { if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo'); };
    col.ondrop = ev => { ev.preventDefault(); col.classList.remove('alvo'); moverOportunidade(ev.dataTransfer.getData('text/plain'), col.dataset.etapa, 'open'); };
  });
  $('opFunil').querySelectorAll('[data-mover]').forEach(s => s.onchange = () => { const [st, et] = s.value.split(':'); if (st) moverOportunidade(s.dataset.mover, et, st); });
}
function opcoesMover(o) {
  const etapa = o.etapaId || opDados.etapas[0]?.id || '';
  const nome = e => e.name.split(/➤|→/)[0].trim();
  return '<option value="">Mover para…</option>'
    + opDados.etapas.filter(e => o.status !== 'open' || e.id !== o.etapaId).map(e => `<option value="open:${esc(e.id)}">${o.status === 'open' ? '' : 'Reabrir em '}${esc(nome(e))}</option>`).join('')
    + (etapa && o.status !== 'won' ? `<option value="won:${esc(etapa)}">✅ Marcar como ganha</option>` : '')
    + (etapa && o.status !== 'lost' ? `<option value="lost:${esc(etapa)}">❌ Marcar como perdida</option>` : '');
}
// Muda na tela na hora e manda para a LeadVox; se ela recusar, o cartão volta para onde estava.
async function moverOportunidade(id, etapa, status) {
  const o = opDados?.oportunidades.find(x => x.id === id);
  if (!o || !etapa || (o.etapaId === etapa && o.status === status)) return desenharOportunidades();
  const nome = o.contato || o.nome;
  if (status !== 'open' && !confirm(`Marcar ${nome} como ${status === 'won' ? 'ganha' : 'perdida'} na LeadVox?`)) return desenharOportunidades();
  const antes = { etapaId: o.etapaId, status: o.status, totais: JSON.stringify(opDados.totais || {}) };
  const tot = opDados.totais || {}, conta = (k, sinal) => { if (tot[k]) { tot[k].count += sinal; tot[k].valor += sinal * o.valor; } };
  if (o.status === 'open') conta(o.etapaId, -1);
  Object.assign(o, { etapaId: etapa, status });
  if (status === 'open') conta(etapa, 1);
  const filtro = $('opStatus').value;
  if (filtro !== 'all' && filtro !== status) opDados.oportunidades = opDados.oportunidades.filter(x => x !== o);
  desenharOportunidades();
  try {
    await api('oportunidade-mover', { organization: empresa.id, id, etapa, status });
    const e = opDados.etapas.find(x => x.id === etapa);
    toast(status === 'open' ? `${nome} foi para ${e ? e.name.split(/➤|→/)[0].trim() : 'a nova etapa'}.` : `${nome} marcada como ${status === 'won' ? 'ganha' : 'perdida'}.`);
  } catch (err) {
    Object.assign(o, { etapaId: antes.etapaId, status: antes.status }); opDados.totais = JSON.parse(antes.totais);
    if (!opDados.oportunidades.includes(o)) opDados.oportunidades.push(o);
    desenharOportunidades(); toast(err.message, true);
  }
}
$('opStatus').onchange = carregarOportunidades;
$('opFunilSel').onchange = carregarOportunidades;
$('opAtualizar').onclick = carregarOportunidades;
$('opBusca').oninput = desenharOportunidades;

/* ═══════════ INÍCIO ═══════════ */
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
setModo('login');
if (location.protocol !== 'https:' && !local) { $('pHttp').hidden = false; $('formPorta').hidden = true; $('pLinks').hidden = true; }
else carregar().catch(() => porta(false));
