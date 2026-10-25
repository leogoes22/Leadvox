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
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><path d="M7.5 7.5h.01"/>',
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
  ['conhecimento', 'Base de conhecimento', 'livro', 'O que a IA sabe e responde.'],
  ['etiquetas', 'Etiquetas', 'tag', 'As etiquetas da sua LeadVox.'],
  ['status', 'Status do lead', 'kanban', 'As etapas do funil da sua LeadVox.'],
  ['usuarios', 'Usuários LeadVox', 'pessoas', 'Quem atende na sua LeadVox.'],
  ['departamentos', 'Departamentos', 'predio', 'Para onde a IA passa o cliente.'],
  ['motivos', 'Motivos de fechamento', 'bandeira', 'Por que um atendimento termina.'],
  ['arquivos', 'Arquivos da IA', 'arquivo', 'Materiais que a IA pode mandar.'],
  ['canais', 'Canais WhatsApp', 'zap', 'Os números onde a IA atende.'],
  ['credenciais', 'Credenciais de API', 'chave', 'A conexão com a sua LeadVox.'],
  '-',
  ['cobrancas', 'Cobranças', 'cartao', 'Clientes, planos e mensalidades.'],
  ['conta', 'Minha conta', 'engrenagem', 'Empresa, negócio e senha.'],
  ['leadvox', 'Painel LeadVox', 'escudo', 'Todos os clientes da plataforma. Só você vê.']
];
const SECAO = { agentes: 'vAgentes', dashboard: 'vDashboard', conhecimento: 'vConhecimento', etiquetas: 'vLista', status: 'vLista', usuarios: 'vLista',
  departamentos: 'vLista', motivos: 'vLista', arquivos: 'vLista', canais: 'vCanais', credenciais: 'vCredenciais', cobrancas: 'vCobrancas', conta: 'vConta', leadvox: 'vLeadvox' };
const LISTA = {
  etiquetas: ['Suas etiquetas aparecem aqui', 'Puxadas da sua LeadVox quando a conexão estiver ligada. A IA usa as etiquetas para marcar os leads.'],
  status: ['Seus status do lead aparecem aqui', 'As etapas do funil da sua LeadVox. A IA move o lead de etapa conforme a conversa.'],
  usuarios: ['Seus usuários aparecem aqui', 'Quem atende na sua LeadVox. A IA passa o cliente para a pessoa certa.'],
  departamentos: ['Seus departamentos aparecem aqui', 'Comercial, financeiro, pós-venda… A IA transfere para o departamento certo.'],
  motivos: ['Motivos de fechamento', 'Ex.: comprou, sem interesse, sem resposta. A IA marca o motivo quando o atendimento termina.'],
  arquivos: ['Os arquivos ficam na base de conhecimento', 'Catálogo, fotos, PDFs e materiais que a IA pode mandar no WhatsApp.']
};
const CAPS = [['capAudioIn', 'Entende áudio'], ['capAudioOut', 'Responde com áudio'], ['capImage', 'Entende imagem'], ['capDoc', 'Entende documento'], ['capSheet', 'Entende planilhas']];
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
  const url = cfg.niche === 'automotivo' ? 'https://leadvox.com.br/sdr/' : 'https://leadvox.com.br/agente-ia.html';
  if ($('iaFrame').dataset.src !== url) { $('iaFrame').dataset.src = url; $('iaFrame').removeAttribute('src'); }
  $('iaCheia').href = url;
  $('cfNome').value = cfg.displayName || ''; $('cfNome').placeholder = empresa.name;
  $('cfNicho').value = cfg.niche || 'outro'; $('cfIa').value = cfg.aiName || ''; $('cfZap').value = cfg.whatsapp || '';
  $('cfCobr').checked = !!cfg.billingEnabled;
  $('emEmail').textContent = 'Você entrou como ' + conta.user.email + '.';
  const linhas = `<div><span>WhatsApp</span>${esc(zapFmt(cfg.whatsapp))}</div><div><span>Empresa</span>${esc(nome)}</div>`;
  $('canaisZap').innerHTML = linhas; $('canaisDados').innerHTML = linhas;
  desenharAgente(); desenharMenu();
  fin = null; chat = null; listas = {};
  carregarChat().then(() => { if (LISTA[abaAtual]) desenharLista(abaAtual); if (abaAtual === 'credenciais') desenharCred(); }).catch(() => {});
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
  if (pg === 'credenciais') desenharCred();
  if (pg === 'conhecimento' && !$('iaFrame').getAttribute('src')) $('iaFrame').src = $('iaFrame').dataset.src;
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

/* agente */
function desenharAgente() {
  const ia = cfg.aiName || 'Sua IA', ativo = !!cfg.aiActive, nicho = NICHOS[cfg.niche] || NICHOS.outro;
  $('agFoto').textContent = ia.trim().charAt(0).toUpperCase() || 'IA';
  $('agNome').textContent = ia; $('agFuncao').textContent = cfg.aiRole || 'SDR';
  $('agSt').textContent = ativo ? 'Ativo' : 'Desligado'; $('agSt').className = 'st' + (ativo ? ' on' : '');
  $('agDados').innerHTML = `<div><span>Negócio</span>${esc(nicho.n)}</div><div><span>WhatsApp</span>${esc(zapFmt(cfg.whatsapp))}</div>`
    + `<div><span>Empresa</span>${esc(cfg.displayName || empresa.name)}</div>`;
  $('agCaps').innerHTML = CAPS.map(([k, n]) => `<div>${n}<i class="${cfg[k] ? 'on' : ''}">${cfg[k] ? '✓ sim' : 'não'}</i></div>`).join('');
  $('idNome').value = cfg.aiName || ''; $('idFuncao').value = cfg.aiRole || 'SDR'; $('idDesc').value = cfg.aiDescription || '';
  $('idAtivo').setAttribute('aria-checked', String(ativo));
  $('mmLista').innerHTML = CAPS.map(([k, n]) => `<div class="lin-sw"><span>${n}</span><button type="button" class="switch" role="switch" aria-checked="${!!cfg[k]}" data-cap="${k}" aria-label="${n}"><span></span></button></div>`).join('');
  document.querySelectorAll('[data-cap], #idAtivo').forEach(s => s.onclick = () => s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true')));
}
document.querySelectorAll('[data-ag]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-ag]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-agp]').forEach(p => p.hidden = p.dataset.agp !== b.dataset.ag);
});
document.querySelector('[data-ag="identidade"]').setAttribute('aria-pressed', 'true');
$('agIdentidade').onsubmit = async e => {
  e.preventDefault();
  try {
    await salvarCfg({ aiName: $('idNome').value.trim(), aiRole: $('idFuncao').value, aiDescription: $('idDesc').value.trim(), aiActive: $('idAtivo').getAttribute('aria-checked') === 'true' });
    desenharAgente(); toast('Salvo.');
  } catch (err) { toast(err.message, true); }
};
$('agMultimodal').onsubmit = async e => {
  e.preventDefault();
  try {
    await salvarCfg(Object.fromEntries(CAPS.map(([k]) => [k, document.querySelector(`[data-cap="${k}"]`).getAttribute('aria-checked') === 'true'])));
    desenharAgente(); toast('Salvo.');
  } catch (err) { toast(err.message, true); }
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
    await api('chat-credentials', { organization: empresa.id, url: $('credUrl').value });
    $('credUrl').value = ''; listas = {}; await carregarChat(); desenharCred(); toast('LeadVox conectada.');
  } catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; bt.textContent = 'Conectar e testar'; }
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

/* dashboard */
{
  const hoje = new Date(), ini = new Date(hoje - 29 * 864e5), iso = d => d.toISOString().slice(0, 10);
  $('dIni').value = iso(ini); $('dFim').value = iso(hoje);
  $('dAplicar').onclick = () => toast('Ainda sem dados: a IA não está ligada a este painel.');
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

/* ═══════════ INÍCIO ═══════════ */
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
setModo('login');
if (location.protocol !== 'https:' && !local) { $('pHttp').hidden = false; $('formPorta').hidden = true; $('pLinks').hidden = true; }
else carregar().catch(() => porta(false));
