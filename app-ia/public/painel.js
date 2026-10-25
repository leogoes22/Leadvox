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
      return abrirApp('inicio');
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
  abrirApp(location.hash.slice(1) || 'inicio');
}

function abrirApp(aba) {
  $('telaPorta').hidden = true; $('telaApp').hidden = false;
  const nicho = NICHOS[cfg.niche] || NICHOS.outro;
  const nome = cfg.displayName || empresa.name, ia = cfg.aiName || 'Sua IA';
  $('nomeEmpresa').textContent = nome;
  $('iOla').textContent = 'Olá, ' + nome + '!';
  const fim = empresa.trial_ends_at ? new Date(empresa.trial_ends_at) : null;
  $('iTeste').textContent = (fim ? 'Período de teste até ' + fim.toLocaleDateString('pt-BR') + '. ' : '') + 'Negócio: ' + nicho.n + '.';
  $('iIaTitulo').textContent = ia;
  $('iIaTexto').textContent = ia + ' ' + nicho.ia;
  const url = cfg.niche === 'automotivo' ? 'https://leadvox.com.br/sdr/' : 'https://leadvox.com.br/agente-ia.html';
  if ($('iaFrame').dataset.src !== url) { $('iaFrame').dataset.src = url; $('iaFrame').removeAttribute('src'); }
  $('iaCheia').href = url;
  $('iCardCobr').hidden = !cfg.billingEnabled;
  document.querySelector('[data-aba="cobrancas"]').hidden = !cfg.billingEnabled;
  document.querySelector('[data-aba="leadvox"]').hidden = !conta.platformAdmin;
  $('cfNome').value = cfg.displayName || ''; $('cfNome').placeholder = empresa.name;
  $('cfNicho').value = cfg.niche || 'outro'; $('cfIa').value = cfg.aiName || ''; $('cfZap').value = cfg.whatsapp || '';
  $('cfCobr').checked = !!cfg.billingEnabled;
  $('emEmail').textContent = 'Você entrou como ' + conta.user.email + '.';
  fin = null;
  abrir(aba);
}

const ABAS = { inicio: 'vInicio', ia: 'vIa', cobrancas: 'vCobrancas', conta: 'vConta', leadvox: 'vLeadvox' };
let abaAtual = 'inicio';
function abrir(aba) {
  if (!ABAS[aba] || document.querySelector(`[data-aba="${aba}"]`)?.hidden) aba = 'inicio';
  abaAtual = aba;
  for (const [k, id] of Object.entries(ABAS)) $(id).hidden = k !== aba;
  document.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aba === aba)));
  if (aba === 'ia' && !$('iaFrame').getAttribute('src')) $('iaFrame').src = $('iaFrame').dataset.src;
  if (cfg.billingEnabled && (aba === 'cobrancas' || aba === 'inicio')) carregarFin().catch(err => toast(err.message, true));
  if (aba === 'leadvox') carregarLv().catch(err => toast(err.message, true));
  if (location.hash.slice(1) !== aba) history.replaceState(null, '', '#' + aba);
}
document.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => abrir(b.dataset.aba));
document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => abrir(b.dataset.ir));
addEventListener('hashchange', () => { if (conta && empresa && cfg.onboarded) abrir(location.hash.slice(1)); });

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
  $('iCobr').textContent = fin.customers.length
    ? fin.customers.length + ' cliente(s), ' + fin.plans.length + ' plano(s) e ' + rasc + ' recorrência(s) em rascunho. Ainda não emite boleto.'
    : 'Clientes, planos e recorrências. Ainda não emite boleto nem manda mensagem.';
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
