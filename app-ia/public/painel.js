import { schedule, cycles } from '/billing-schedule.js';
import { modeloRegras, sugerirItem, montarRegra, juntarRegras } from '/modelos-regras.js';

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
  signup: { t: 'Criar conta', s: 'Use uma senha de pelo menos 12 caracteres. Depois confirme o código que chega no seu e-mail.', b: 'Criar conta', email: 1, senha: 1, aceite: 1 },
  recover: { t: 'Esqueci minha senha', s: 'Vamos mandar um código para o seu e-mail.', b: 'Receber código', email: 1 },
  verify: { t: 'Confirmar código', s: 'Digite o código que chegou no seu e-mail. Para trocar a senha, use "Esqueci minha senha".', b: 'Confirmar', email: 1, codigo: 1 },
  password: { t: 'Crie sua nova senha', s: 'Use de 12 a 128 caracteres.', b: 'Salvar senha e entrar', senha: 1 }
};

// Olhinho em todo campo de senha ou chave: mostra ou oculta o que foi digitado, para conferir antes de enviar.
const OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_RISCADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
// Chave de API não é senha: fica como texto mascarado, senão o Chrome oferece guardar a URL e o token como login.
const SENHAS_DE_VERDADE = ['pSenha', 'nsSenha'];
const oculto = inp => inp.dataset.chave ? inp.classList.contains('mascara') : inp.type === 'password';
function ocultarSenha(inp) {
  const bt = inp.parentNode.querySelector('.olho');
  if (inp.dataset.chave) inp.classList.add('mascara'); else inp.type = 'password';
  if (bt) { bt.innerHTML = OLHO; bt.setAttribute('aria-pressed', 'false'); bt.setAttribute('aria-label', 'Mostrar o que foi digitado'); }
}
document.querySelectorAll('input[type=password]').forEach(inp => {
  if (!SENHAS_DE_VERDADE.includes(inp.id)) { inp.dataset.chave = '1'; inp.type = 'text'; inp.autocomplete = 'off'; }
  const caixa = document.createElement('div'); caixa.className = 'campo-senha';
  inp.parentNode.insertBefore(caixa, inp); caixa.appendChild(inp);
  const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'olho';
  bt.onclick = () => {
    if (!oculto(inp)) return ocultarSenha(inp);
    if (inp.dataset.chave) inp.classList.remove('mascara'); else inp.type = 'text';
    bt.innerHTML = OLHO_RISCADO; bt.setAttribute('aria-pressed', 'true'); bt.setAttribute('aria-label', 'Ocultar o que foi digitado');
  };
  caixa.appendChild(bt); ocultarSenha(inp);
});

function setModo(m) {
  modo = m; const c = MODOS[m];
  $('pTitulo').textContent = c.t; $('pSub').textContent = c.s; $('btPorta').textContent = c.b;
  $('campoEmail').hidden = !c.email; $('campoSenha').hidden = !c.senha; $('campoCodigo').hidden = !c.codigo;
  $('campoAceite').hidden = !c.aceite; $('pAceite').checked = false;
  $('rotSenha').textContent = m === 'login' ? 'Senha' : 'Nova senha';
  $('pSenha').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('pSenha').value = ''; $('pCodigo').value = ''; ocultarSenha($('pSenha'));
  $('pLinks').hidden = m !== 'login'; $('btVoltarPorta').hidden = m === 'login' || m === 'password';
  $('btJaTenhoCodigo').hidden = m !== 'recover';
  mostra($('pErro')); mostra($('pOk'));
}

function porta(montar) {
  $('telaApp').hidden = true; $('telaPorta').hidden = false;
  $('cardLogin').hidden = !!montar; $('cardMontar').hidden = !montar;
}

document.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { tipoCodigo = 'signup'; setModo(b.dataset.modo); });
$('btVoltarPorta').onclick = () => setModo('login');
// quem foi convidado (ou pediu a redefinição a alguém) já tem o código no e-mail: vai direto para digitar o código e criar a senha
$('btJaTenhoCodigo').onclick = () => { tipoCodigo = 'recovery'; setModo('verify'); };

$('formPorta').onsubmit = async e => {
  e.preventDefault(); const bt = $('btPorta'); bt.disabled = true; mostra($('pErro')); mostra($('pOk'));
  try {
    if (modo === 'signup' && !$('pAceite').checked) throw Error('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.');
    const d = await api(modo, { email: $('pEmail').value, password: $('pSenha').value, code: $('pCodigo').value.trim(), type: tipoCodigo, aceite: modo === 'signup' ? $('pAceite').checked : undefined });
    $('pSenha').value = ''; ocultarSenha($('pSenha'));
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
// exemplos dos campos (o texto cinza de dentro) conforme o segmento da empresa
const EXEMPLOS = {
  automotivo: { seg: 'loja de veículos seminovos', apres: 'Posso te ajudar a achar o carro certo e agendar sua visita.', pub: 'quem procura o primeiro carro, empresas, pessoa física…', faq: 'Vocês aceitam carro na troca?', lembra: 'o carro que o cliente viu', regra: 'quer financiar' },
  imoveis: { seg: 'imobiliária', apres: 'Posso te ajudar a achar o imóvel certo e agendar sua visita.', pub: 'quem procura o primeiro imóvel, famílias, investidores…', faq: 'Vocês ajudam com o financiamento?', lembra: 'o imóvel que o cliente viu', regra: 'quer agendar uma visita' },
  saude: { seg: 'clínica de estética', apres: 'Posso tirar suas dúvidas e marcar sua consulta.', pub: 'pacientes particulares, convênios, quem busca estética…', faq: 'Vocês atendem convênio?', lembra: 'o tratamento que o cliente perguntou', regra: 'quer marcar uma consulta' },
  advocacia: { seg: 'escritório de direito trabalhista', apres: 'Posso entender o seu caso e agendar o atendimento com o advogado.', pub: 'trabalhadores, empresas, aposentados…', faq: 'A primeira consulta é paga?', lembra: 'o caso que o cliente contou', regra: 'quer falar com o advogado' },
  educacao: { seg: 'escola de idiomas', apres: 'Posso te apresentar os cursos e ajudar na sua matrícula.', pub: 'estudantes, adultos que trabalham, empresas…', faq: 'Tem aula experimental?', lembra: 'o curso que o cliente perguntou', regra: 'quer fazer a matrícula' },
  varejo: { seg: 'loja de materiais de construção', apres: 'Posso te ajudar a escolher os produtos e fechar o seu pedido.', pub: 'construtoras, pedreiros, quem está reformando…', faq: 'Vocês entregam na minha cidade?', lembra: 'os produtos que o cliente pediu', regra: 'quer fechar o pedido' },
  viagens: { seg: 'agência de turismo', apres: 'Posso te apresentar os pacotes e montar a sua viagem.', pub: 'famílias, casais, grupos, empresas…', faq: 'Dá para parcelar o pacote?', lembra: 'o destino que o cliente perguntou', regra: 'quer fechar o pacote' },
  outro: { seg: 'fábrica de lajes e pré-moldados', apres: 'Posso tirar suas dúvidas e te ajudar com o seu orçamento.', pub: 'construtoras, revendas, pessoa física…', faq: 'Vocês entregam na minha cidade?', lembra: 'o que o cliente pediu', regra: 'quer um orçamento' }
};
const exemplo = () => EXEMPLOS[cfg.niche] || EXEMPLOS.outro;
function aplicarExemplos() {
  const ex = exemplo();
  $('idDesc').placeholder = `Sou a ${cfg.aiName || 'Carol'}, da ${cfg.displayName || empresa?.name || 'empresa'}. ${ex.apres}`;
  $('exLembra').textContent = ex.lembra;
  $('rgTexto').placeholder = `Ex.: Quando o cliente disser que ${ex.regra}: @Adicionar etiqueta @Mudar etapa do funil\nQuando pedir para falar com o gerente: @Transferir para pessoa @Nota interna`;
}
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
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  desligarSuporte();
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
  // Mais de uma empresa (ex.: acesso de suporte da LeadVox): lembra a última escolhida neste aparelho.
  const orgs = conta.organizations || [];
  let salva = ''; try { salva = localStorage.getItem('lv_empresa') || ''; } catch {}
  empresa = orgs.find(o => o.id === salva) || orgs.find(o => o.role === 'owner') || orgs[0] || null;
  cfg = {};
  if (empresa) {
    try { const w = await api('workspace?organization=' + encodeURIComponent(empresa.id)); cfg = w.workspace?.[0]?.settings || {}; } catch {}
  }
  pedirAceite();
  if (!empresa || !cfg.onboarded) return montar();
  abrirApp(location.hash.slice(1) || 'agentes');
}

const IC = {
  robo: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  grafico: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
  livro: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19V5"/>',
  carro: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM5 11h14"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/>',
  origem: '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
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
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  caixa: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>'
};
// O catálogo muda com o segmento da empresa: veículos (automotivo), serviços (saúde, advocacia, educação, viagens) ou produtos (o resto).
const CATALOGO = {
  veiculos: { titulo: 'Estoque', ic: 'carro', item: 'veículo', itens: 'veículos', desc: 'Os veículos que a IA oferece, com foto e preço.' },
  servicos: { titulo: 'Serviços', ic: 'lista', item: 'serviço', itens: 'serviços', desc: 'Os serviços e pacotes que a IA oferece, com preço.' },
  produtos: { titulo: 'Produtos', ic: 'caixa', item: 'produto', itens: 'produtos', desc: 'Os produtos que a IA oferece, com foto e preço.' }
};
const tipoCatalogo = () => cfg.niche === 'automotivo' ? 'veiculos' : ['saude', 'advocacia', 'educacao', 'viagens'].includes(cfg.niche) ? 'servicos' : 'produtos';
const UNIDADES = ['un.', 'kg', 'g', 'L', 'm', 'm²', 'cx.', 'pct.', 'par', 'kit', 'serviço', 'hora', 'sessão', 'consulta', 'diária', 'pacote', 'mês', 'ano'];
// nome do item do menu (o Estoque segue o segmento)
const itemMenu = m => m[0] === 'estoque' ? (c => ['estoque', c.titulo, c.ic, c.desc])(CATALOGO[tipoCatalogo()]) : m;
const MENU = [
  ['agentes', 'Agentes LeadVox IA', 'robo', 'Sua IA: identidade, o que ela entende e como age.'],
  ['painel', 'Painel', 'grafico', 'Visão geral, oportunidades e anúncios.'],
  ['estoque', 'Estoque', 'carro', 'Os veículos que a IA oferece, com foto e preço.'],
  ['site', 'Site da loja', 'globo', 'Temas de datas comemorativas e campanha em pop-up no seu site.'],
  ['etiquetas', 'Etiquetas', 'tag', 'As etiquetas da sua LeadVox.'],
  ['status', 'Etapas do funil', 'kanban', 'As etapas do funil da sua LeadVox.'],
  ['origens', 'Origens do lead', 'origem', 'De onde vêm os seus clientes, na sua LeadVox.'],
  ['usuarios', 'Usuários LeadVox', 'pessoas', 'Quem atende na sua LeadVox.'],
  ['departamentos', 'Departamentos', 'predio', 'Para onde a IA passa o cliente.'],
  ['motivos', 'Motivos de fechamento', 'bandeira', 'Por que um atendimento termina.'],
  ['canais', 'Canais WhatsApp', 'zap', 'Os números onde a IA atende.'],
  ['credenciais', 'Credenciais de API', 'chave', 'LeadVox, estoque e cobranças.'],
  '-',
  ['cobrancas', 'Cobranças', 'cartao', 'Clientes, planos e mensalidades.'],
  ['conta', 'Minha conta', 'engrenagem', 'Empresa, negócio e senha.'],
  ['leadvox', 'Painel LeadVox', 'escudo', 'Todos os clientes da plataforma. Só você vê.']
];
// O item Painel do menu junta três telas em abas; cada aba continua com o seu endereço (#dashboard, #oportunidades, #rastreio).
const PAINEL_ABAS = [
  ['dashboard', 'Visão geral', 'grafico', 'O que a IA fez no período.'],
  ['oportunidades', 'Oportunidades', 'funil', 'O funil da sua LeadVox: cada cliente na etapa em que está.'],
  ['rastreio', 'Anúncios', 'alvo', 'Qual anúncio trouxe cada lead e cada venda, e o aviso para a Meta.']
];
let painelAba = 'dashboard';
const SECAO = { agentes: 'vAgentes', painel: 'vDashboard', dashboard: 'vDashboard', oportunidades: 'vOportunidades', rastreio: 'vRastreio', estoque: 'vEstoque', site: 'vSite', etiquetas: 'vLista', status: 'vLista', origens: 'vLista', usuarios: 'vLista',
  departamentos: 'vLista', motivos: 'vLista', canais: 'vCanais', credenciais: 'vCredenciais', cobrancas: 'vCobrancas', conta: 'vConta', leadvox: 'vLeadvox' };
const LISTA = {
  etiquetas: ['Suas etiquetas aparecem aqui', 'Puxadas da sua LeadVox quando a conexão estiver ligada. A IA usa as etiquetas para marcar os leads.'],
  status: ['Suas etapas do funil aparecem aqui', 'As etapas do funil da sua LeadVox. A IA move o lead de etapa conforme a conversa.'],
  origens: ['Suas origens do lead aparecem aqui', 'Puxadas da sua LeadVox: Instagram, site, indicação… A IA marca de onde o cliente veio.'],
  usuarios: ['Seus usuários aparecem aqui', 'Quem atende na sua LeadVox. A IA passa o cliente para a pessoa certa.'],
  departamentos: ['Seus departamentos aparecem aqui', 'Comercial, financeiro, pós-venda… A IA transfere para o departamento certo.'],
  motivos: ['Seus motivos de fechamento aparecem aqui', 'Puxados da sua LeadVox (Configurações → Motivos de fechamento): comprou, sem interesse, sem resposta…']
};
const visivel = pg => pg === 'cobrancas' ? !!cfg.billingEnabled : pg === 'site' ? (cfg.niche === 'automotivo' || !!conta.platformAdmin) : pg === 'leadvox' ? !!conta.platformAdmin : !!SECAO[pg];
const zapFmt = z => z ? z.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : 'Não informado';

function desenharMenu() {
  $('menu').innerHTML = MENU.map(m => m === '-' ? m : itemMenu(m)).map(m => m === '-' ? '<div class="menu-sep"></div>' : visivel(m[0])
    ? `<button type="button" class="menu-it" data-pg="${m[0]}" title="${m[1]}"><svg viewBox="0 0 24 24" aria-hidden="true">${IC[m[2]]}</svg>${m[1]}</button>` : '').join('');
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => abrir(b.dataset.pg));
  aplicarExemplos();
}

function abrirApp(pg) {
  $('telaPorta').hidden = true; $('telaApp').hidden = false;
  const nicho = NICHOS[cfg.niche] || NICHOS.outro, nome = cfg.displayName || empresa.name;
  const fim = empresa.trial_ends_at ? new Date(empresa.trial_ends_at) : null;
  $('rodape').innerHTML = `<b style="color:var(--texto)">${esc(nome)}</b><br>${esc(nicho.n)}${fim ? '<br>Teste até ' + fim.toLocaleDateString('pt-BR') : ''}`;
  $('cfNome').value = cfg.displayName || ''; $('cfNome').placeholder = empresa.name;
  $('cfNicho').value = cfg.niche || 'outro'; $('cfIa').value = cfg.aiName || ''; $('cfZap').value = cfg.whatsapp || '';
  $('cfCobr').checked = !!cfg.billingEnabled;
  preencherLoja();
  $('emEmail').textContent = 'Você entrou como ' + conta.user.email + '.';
  const linhas = `<div><span>WhatsApp</span>${esc(zapFmt(cfg.whatsapp))}</div><div><span>Empresa</span>${esc(nome)}</div>`;
  $('canaisZap').innerHTML = linhas; $('canaisDados').innerHTML = linhas;
  motor = null; agSel = null; agDados = null; desenharMenu();
  carregarMotor().then(() => { if (eventos) desenharSaude(); if (abaAtual === 'agentes') desenharMotor(); if (kAberta()) abrirConhecimento(); atualizarGuia(); guiaPrimeiraVez(); })
    .catch(() => { motor = { setupPending: true }; if (abaAtual === 'agentes') desenharMotor(); if (kAberta()) abrirConhecimento(); atualizarGuia(); });
  fin = null; chat = null; listas = {}; conexoes = null; estoque = null; eventos = null; prontoAberto = null;
  $('saudeAviso').hidden = true;
  carregarEventos().then(() => { desenharSaude(); if (abaAtual === 'agentes') desenharPronto(); if (abaAtual === 'canais') desenharEventos(); atualizarGuia(); });
  carregarConexoes().then(() => { if (abaAtual === 'credenciais') desenharConexoes(); }).catch(() => {});
  carregarChat().then(() => { if (LISTA[abaAtual]) desenharLista(abaAtual); if (abaAtual === 'credenciais') desenharCred(); if (abaAtual === 'agentes') desenharPronto(); atualizarGuia(); }).catch(() => {});
  $('btGuia').innerHTML = '🚀 Primeiros passos';
  desenharEmpresas();
  assin = null; $('planoAviso').hidden = true;
  const querAssinar = pg === 'assinar';
  carregarAssinatura().then(() => { if (querAssinar) abrirAssinar(); }).catch(() => {});
  abrir(querAssinar ? 'conta' : pg);
  setTimeout(ligarSuporte, 1500);
}

/* ═══════════ TERMOS ═══════════ */
// Versão nova dos termos: o painel só segue depois do aceite (fica registrado no login, com a data).
function pedirAceite() {
  const t = conta.termos; if (!t || t.aceito === t.atual) return;
  const d = $('dlgTermos'); $('tmAceite').checked = false; mostra($('tmErro'), '');
  d.oncancel = e => e.preventDefault(); // não fecha com Esc
  if (!d.open) d.showModal();
  $('tmOk').onclick = async () => {
    if (!$('tmAceite').checked) return mostra($('tmErro'), 'Marque que leu e aceita para continuar.');
    try { await api('aceite', { versao: t.atual }); t.aceito = t.atual; d.close(); toast('Obrigado! Termos aceitos.'); }
    catch (err) { mostra($('tmErro'), err.message); }
  };
}

/* ═══════════ EMPRESA E SUPORTE ═══════════ */
const suporteAberto = () => { try { return JSON.parse(localStorage.getItem('lv_suporte') || '[]'); } catch { return []; } };
function marcarSuporte(id, aberto) {
  const l = suporteAberto().filter(x => x !== id); if (aberto) l.push(id);
  try { localStorage.setItem('lv_suporte', JSON.stringify(l)); } catch {}
}
// Seletor de empresa (quem tem mais de uma) e o aviso do acesso de suporte da LeadVox.
function desenharEmpresas() {
  const orgs = conta.organizations || [], sel = $('cabEmpresa');
  sel.hidden = orgs.length < 2;
  sel.innerHTML = orgs.map(o => `<option value="${esc(o.id)}"${o.id === empresa.id ? ' selected' : ''}>${esc(o.name)}${o.role === 'owner' || !conta.platformAdmin ? '' : ' · suporte'}</option>`).join('');
  sel.onchange = () => { try { localStorage.setItem('lv_empresa', sel.value); } catch {} carregar().catch(err => toast(err.message, true)); };
  // aviso só nas empresas em que o admin entrou pelo Gerenciar → Entrar como suporte (anotado neste aparelho)
  const suporte = conta.platformAdmin && empresa.role !== 'owner' && suporteAberto().includes(empresa.id);
  $('suporteAviso').hidden = !suporte;
  if (suporte) {
    $('suporteAviso').innerHTML = `<span>🛟</span><div><b>Modo suporte: você está no painel de ${esc(empresa.name)}</b>
      <p>O que você mudar aqui vale para o cliente. O acesso fica registrado e termina sozinho.</p>
      <div class="bts"><button class="sm" type="button" id="supSair">Encerrar suporte e voltar</button></div></div>`;
    $('supSair').onclick = async () => {
      try { await api('admin-suporte', { organization: empresa.id, encerrar: true }); } catch (err) { return toast(err.message, true); }
      try { localStorage.removeItem('lv_empresa'); } catch {}
      marcarSuporte(empresa.id, false);
      toast('Suporte encerrado.'); carregar().catch(err => toast(err.message, true));
    };
  }
}

/* ═══════════ ASSINATURA ═══════════ */
let assin = null;
const FORMA_NOME = { CREDIT_CARD: 'Cartão de crédito', PIX: 'Pix', BOLETO: 'Boleto' };
const FATURA_NOME = { pago: 'Paga', pendente: 'Em aberto', vencida: 'Vencida', estornada: 'Estornada', cancelada: 'Cancelada' };
async function carregarAssinatura() {
  assin = await api('assinatura?organization=' + encodeURIComponent(empresa.id));
  desenharPlanoAviso(); desenharAssinatura(); atualizarGuia();
}
// Aviso do topo em todas as telas: contagem do teste, pagamento em aberto, atraso e suspensão.
function desenharPlanoAviso() {
  const el = $('planoAviso'), a = assin;
  if (!a || ['ativa', 'cortesia'].includes(a.status)) { el.hidden = true; return; }
  const venc = a.proximoVencimento ? dataBR(a.proximoVencimento) : '';
  let cls = '', dias = '', t = '', p = '', bt = 'Assinar agora', pagar = false;
  if (a.status === 'teste') {
    dias = a.diasTeste; cls = a.diasTeste <= 2 ? 'aviso' : '';
    t = a.diasTeste === 0 ? 'Seu teste grátis termina hoje' : `Faltam ${a.diasTeste} ${a.diasTeste === 1 ? 'dia' : 'dias'} do seu teste grátis`;
    p = 'Assine para a IA continuar atendendo sem parar. O pagamento só começa quando o teste acabar.';
  } else if (a.status === 'expirado') {
    cls = 'erro'; dias = '0'; t = 'Seu teste grátis terminou';
    p = 'Assine para a IA voltar a atender. Leva menos de 2 minutos.';
  } else if (a.status === 'aguardando') {
    cls = 'aviso'; t = 'Falta só concluir o pagamento'; p = venc ? 'A primeira fatura vence em ' + venc + '.' : 'Sua assinatura está esperando o pagamento.';
    bt = 'Pagar agora'; pagar = true;
  } else if (a.status === 'atrasada') {
    cls = 'erro'; t = 'Sua fatura venceu' + (a.atrasadaDesde ? ' em ' + dataBR(a.atrasadaDesde) : '');
    p = 'Pague para a IA não ser pausada. Depois de 5 dias de atraso ela para de atender.'; bt = 'Pagar agora'; pagar = true;
  } else if (a.status === 'suspensa') {
    cls = 'erro'; t = 'A IA está pausada por falta de pagamento'; p = 'Assim que o pagamento cair, ela volta a atender sozinha.'; bt = 'Pagar e reativar'; pagar = true;
  } else if (a.status === 'cancelada') {
    cls = 'erro'; t = 'Sua assinatura foi cancelada'; p = 'Assine de novo para a IA voltar a atender.';
  } else { el.hidden = true; return; }
  el.className = 'plano-aviso ' + cls; el.hidden = false;
  el.innerHTML = `<div class="txt">${dias !== '' ? `<span class="dias" aria-hidden="true">${esc(dias)}</span>` : ''}<div><b>${esc(t)}</b><p>${esc(p)}</p></div></div>
    ${a.podeAssinar ? `<button class="principal sm" type="button" id="paBt">${esc(bt)}</button>` : ''}`;
  if ($('paBt')) $('paBt').onclick = () => pagar && a.link ? window.open(a.link, '_blank', 'noopener') : abrirAssinar();
}
function desenharAssinatura() {
  const a = assin, el = $('assinConteudo'); if (!a) return;
  const ST = { teste: ['Em teste grátis', 'on'], expirado: ['Teste terminou', 'perdida'], aguardando: ['Aguardando pagamento', 'rascunho'], ativa: ['Ativa', 'on'],
    atrasada: ['Pagamento atrasado', 'perdida'], suspensa: ['IA pausada', 'perdida'], cancelada: ['Cancelada', 'perdida'], cortesia: ['Cortesia LeadVox', 'on'] };
  const st = ST[a.status] || [a.status, ''];
  const linhas = [a.planoNome ? `<div><span>Plano</span>${esc(a.planoNome)} · ${dinheiro(a.valorCents)}/mês</div>` : '',
    a.forma ? `<div><span>Pagamento</span>${esc(FORMA_NOME[a.forma] || a.forma)}${a.documentoFinal ? ' · documento final ' + esc(a.documentoFinal) : ''}</div>` : '',
    a.status === 'teste' ? `<div><span>Teste até</span>${new Date(a.testeAte).toLocaleDateString('pt-BR')}</div>` : '',
    a.proximoVencimento && ['aguardando', 'ativa', 'atrasada', 'suspensa'].includes(a.status) ? `<div><span>Próxima fatura</span>${dataBR(a.proximoVencimento)}</div>` : '',
    a.status === 'cortesia' ? `<div><span>Cortesia</span>${a.cortesiaAte ? 'até ' + dataBR(a.cortesiaAte) : 'sem prazo'}</div>` : ''].join('');
  const faturas = (a.faturas || []).map(f => `<tr><td>${dataBR(f.vencimento)}</td><td class="num">${dinheiro(f.valorCents)}</td><td>${esc(FATURA_NOME[f.status] || f.status)}</td>
    <td>${f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">${f.status === 'pago' ? 'Recibo' : 'Pagar'} ↗</a>` : ''}</td></tr>`).join('');
  const podeTrocar = a.podeAssinar && !['cortesia'].includes(a.status);
  el.innerHTML = `<p><span class="st ${st[1]}">${esc(st[0])}</span></p><div class="ag-dados" style="margin-top:8px">${linhas}</div>
    ${faturas ? `<div class="rolo" style="margin-top:12px"><table class="lv-tabela"><thead><tr><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${faturas}</tbody></table></div>` : ''}
    ${podeTrocar ? `<div class="form-bts" style="margin-top:12px"><button class="principal sm" type="button" id="assinBt">${['ativa', 'atrasada', 'suspensa', 'aguardando'].includes(a.status) ? 'Trocar plano ou forma de pagamento' : 'Assinar agora'}</button>
      ${a.link && ['aguardando', 'atrasada', 'suspensa'].includes(a.status) ? `<a class="bt sm" href="${esc(a.link)}" target="_blank" rel="noopener">Pagar fatura em aberto ↗</a>` : ''}</div>` : ''}`;
  if ($('assinBt')) $('assinBt').onclick = abrirAssinar;
}
function abrirAssinar() {
  const a = assin; if (!a) return;
  if (!a.podeAssinar) return toast('Só o dono ou um admin da empresa pode assinar.', true);
  $('asPlanos').innerHTML = '<legend>Plano</legend>' + (a.planos || []).map((p, i) => `<label class="as-op"><input type="radio" name="asPlano" value="${esc(p.chave)}"${(a.plano ? a.plano === p.chave : i === 0) ? ' checked' : ''}>
    <span><b>${esc(p.nome)}</b><small>${esc(p.descricao)}</small></span><span class="preco">${dinheiro(p.valorCents)}<small>/mês</small></span></label>`).join('');
  if (a.forma) document.querySelectorAll('[name=asForma]').forEach(r => r.checked = r.value === a.forma);
  const zap = String(a.telefoneCobranca || cfg.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  $('asEmail').value = a.emailCobranca || conta.user.email || ''; $('asZap').value = zap ? zapFmt(zap) : '';
  $('asDoc').value = ''; $('asDoc').placeholder = a.documentoFinal ? 'Digite de novo (final ' + a.documentoFinal + ')' : '000.000.000-00';
  $('asVence').textContent = a.status === 'teste' ? 'A primeira cobrança é no fim do teste, em ' + new Date(a.testeAte).toLocaleDateString('pt-BR') + '. Depois, todo mês no mesmo dia.' : 'A cobrança é mensal. Você pode cancelar quando quiser.';
  mostra($('asErro'), ''); $('dlgAssinar').showModal();
}
$('formAssinar').onsubmit = async e => {
  e.preventDefault();
  const bt = $('asIr'), plano = document.querySelector('[name=asPlano]:checked')?.value, forma = document.querySelector('[name=asForma]:checked')?.value;
  mostra($('asErro'), '');
  // abre a aba já no clique (o navegador bloqueia janela aberta depois de esperar a resposta)
  const aba = window.open('', '_blank');
  bt.disabled = true; bt.textContent = 'Abrindo o pagamento…';
  try {
    const r = await api('assinatura', { organization: empresa.id, plano, forma, documento: $('asDoc').value, email: $('asEmail').value.trim(), telefone: $('asZap').value });
    if (aba && r.link) { aba.opener = null; aba.location.href = r.link; } else if (aba) aba.close();
    $('dlgAssinar').close();
    toast(r.link ? 'Página de pagamento aberta em outra aba.' : 'Assinatura atualizada.');
    await carregarAssinatura();
  } catch (err) { if (aba) aba.close(); mostra($('asErro'), err.message); }
  finally { bt.disabled = false; bt.textContent = 'Ir para o pagamento'; }
};
document.querySelectorAll('dialog [data-fechar]').forEach(b => b.onclick = () => b.closest('dialog').close());

let abaAtual = 'agentes';
// a base de conhecimento é de cada agente: fica numa aba dele, não no menu
const kAberta = () => abaAtual === 'agentes' && document.querySelector('[data-ag="conhecimento"]')?.getAttribute('aria-pressed') === 'true';
function abrir(pg) {
  if (pg === 'conhecimento') { abrir('agentes'); document.querySelector('[data-ag="conhecimento"]')?.click(); return; }
  if (pg === 'painel') pg = painelAba;
  if (!visivel(pg)) pg = 'agentes';
  abaAtual = pg;
  const aba = PAINEL_ABAS.find(m => m[0] === pg);
  if (aba) painelAba = pg;
  const item = aba ? ['painel', 'Painel', aba[2], aba[3]] : itemMenu(MENU.find(m => m[0] === pg));
  $('painelAbas').hidden = !aba;
  document.querySelectorAll('#painelAbas [data-ir]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ir === pg)));
  for (const id of new Set(Object.values(SECAO))) $(id).hidden = id !== SECAO[pg];
  document.querySelectorAll('[data-pg]').forEach(b => b.dataset.pg === item[0] ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('cabTitulo').textContent = item[1]; $('cabSub').textContent = item[3];
  if (LISTA[pg]) desenharLista(pg);
  if (pg === 'credenciais') { desenharCred(); desenharConexoes(); carregarOpenAI(); }
  if (pg === 'agentes') desenharMotor();
  if (pg === 'estoque') abrirEstoque();
  if (pg === 'dashboard') carregarDashboard();
  if (pg === 'oportunidades') carregarOportunidades();
  if (pg === 'rastreio') carregarRastreio();
  if (pg === 'site') carregarSite();
  if (pg === 'canais') { desenharEventos(); carregarEventos().then(desenharEventos); }
  if (pg === 'cobrancas') carregarFin().catch(err => toast(err.message, true));
  if (pg === 'leadvox') carregarLv().catch(err => toast(err.message, true));
  if (pg === 'conta') carregarUsuariosConta();
  $('lateral').classList.remove('aberta');
  if (location.hash.slice(1) !== pg) history.replaceState(null, '', '#' + pg);
  scrollTo(0, 0);
}
const ligarIr = raiz => raiz.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => abrir(b.dataset.ir));
ligarIr(document);
// ☰: no celular abre a gaveta do menu; no computador recolhe o menu para só os ícones (e lembra a escolha)
const menuRecolhido = on => {
  $('telaApp').classList.toggle('recolhido', on);
  $('btMenu').setAttribute('aria-label', on ? 'Abrir menu' : 'Recolher menu');
  try { localStorage.setItem('lv_menu_recolhido', on ? '1' : '0'); } catch {}
};
try { if (localStorage.getItem('lv_menu_recolhido') === '1') menuRecolhido(true); } catch {}
$('btMenu').onclick = () => {
  if (matchMedia('(max-width: 760px)').matches) $('lateral').classList.toggle('aberta');
  else menuRecolhido(!$('telaApp').classList.contains('recolhido'));
};
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
    avisos: { retomada: { ativo: false, texto: '' }, gerente: { ativo: false, whatsapp: '', quando: 'equipe' }, vendedor: { ativo: false, iaContinua: false }, resumo: { ativo: false, whatsapp: '', hora: 19 } }
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
  const pedido = ags.length ? roboPedido() : null;
  if (pedido && ags.some(a => a.chave === pedido.chave)) abrirAgenteMotor(pedido.chave).then(() => document.querySelector(`[data-ag="${pedido.aba}"]`)?.click());
  else if (!agSel && ags.length) abrirAgenteMotor((ags.find(a => a.entrada) || ags[0]).chave);
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

// Modo de teste: a IA ligada responde só os números da lista (o motor ignora os outros; o follow-up também).
let testeSujo = false;
const zapCurto = v => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); return d.length >= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, -4) + '-' + d.slice(-4) : d; };
const zapCompleto = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? '55' + d : (d.startsWith('55') && (d.length === 12 || d.length === 13) ? d : ''); };
async function salvarModoTeste(ativo) {
  if (!agDados) return;
  const brutos = $('agTesteNum').value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const numeros = [...new Set(brutos.map(zapCompleto).filter(Boolean))].slice(0, 10);
  if (ativo && !numeros.length) { $('agTesteBox').hidden = false; $('agTesteNum').focus(); testeSujo = true; return toast('Coloque pelo menos um número de teste (com DDD) e toque em Salvar.', true); }
  if (brutos.length > numeros.length) return toast('Confira os números: use DDD + número, por exemplo (21) 98894-3529.', true);
  try {
    const c = agDados.config, config = { ...c, modoTeste: { ativo, numeros } };
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
    agDados = { ...agDados, config, versao: r.versao ?? agDados.versao }; testeSujo = false; desenharAgente();
    toast(ativo ? `Modo de teste ligado: ${agDados.nome || 'a IA'} responde só ${numeros.map(zapCurto).join(', ')}.` : 'Modo de teste desligado: a IA ligada responde todos os clientes.');
  } catch (err) { if (!err.status) toast(err.message, true); }
}
$('agTesteSw').onclick = () => { const on = !ligado('agTesteSw'); sw('agTesteSw', on); $('agTesteBox').hidden = !on; salvarModoTeste(on); };
$('agTesteSalvar').onclick = () => { sw('agTesteSw', true); salvarModoTeste(true); };
$('agTesteNum').addEventListener('input', () => { testeSujo = true; });

async function abrirAgenteMotor(chave) {
  try {
    const a = await api('motor?organization=' + encodeURIComponent(empresa.id) + '&agente=' + encodeURIComponent(chave));
    agSel = chave; agDados = { ...a, config: mesclar(configPadrao(a.tipo, a.nome), a.config || {}) };
    desenharAgente(); $('agDetalhe').hidden = false;
    document.querySelectorAll('[data-abrir-ag]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.abrirAg === chave)));
    if (kAberta()) { limparK(); desenharConhecimento(); }
    if (arqAberta()) abrirArquivos();
  } catch (err) { toast(err.message, true); }
}

/* ═══════════ ARQUIVOS DA IA (aba do agente) ═══════════ */
// A biblioteca é da empresa (iag_material); cada agente guarda em config.materiais quais usa e quando manda.
let arqLista = [], arqEditando = null;
const TIPO_ARQ = { video: 'Vídeo', pdf: 'PDF', imagem: 'Imagem', link: 'Link' };
const arqAberta = () => document.querySelector('[data-ag="arquivos"]')?.getAttribute('aria-pressed') === 'true';
const arqDoAgente = () => (Array.isArray(agDados?.config?.materiais) ? agDados.config.materiais : []);
const arqQuandoTexto = m => m.quando === 'tema' ? 'Quando falar de ' + (m.tema || 'um assunto') : m.quando === 'fim' ? 'No fim, antes de passar para a equipe' : 'Quando o cliente pedir';
async function abrirArquivos() {
  if (!agDados) return;
  limparArq();
  try { const r = await api('materiais?organization=' + encodeURIComponent(empresa.id)); arqLista = r.materiais || []; desenharArquivos(); }
  catch (err) { $('arqLista').innerHTML = '<p class="muted">Não deu para carregar os arquivos.</p>'; toast(err.message, true); }
}
function desenharArquivos() {
  const usados = arqDoAgente();
  $('arqLista').innerHTML = arqLista.length ? arqLista.map(m => {
    const u = usados.find(x => String(x.id) === String(m.id));
    return `<div class="item"><div><b>${esc(m.titulo)}</b><small>${esc(TIPO_ARQ[m.tipo] || m.tipo)} · ${u ? esc(arqQuandoTexto(u)) : 'Não usado por este agente'}</small></div>
      <div class="bts"><a class="sm" href="${esc(m.url)}" target="_blank" rel="noopener">Abrir ↗</a><button type="button" class="sm" data-arq-usa="${m.id}">${u ? 'Tirar deste agente' : 'Usar neste agente'}</button><button type="button" class="sm" data-arq-ed="${m.id}">Editar</button><button type="button" class="sm perigo" data-arq-ex="${m.id}">Excluir</button></div></div>`;
  }).join('') : '<p class="muted">Nenhum arquivo ainda. Envie o primeiro abaixo.</p>';
  document.querySelectorAll('[data-arq-usa]').forEach(b => b.onclick = () => alternarArq(Number(b.dataset.arqUsa)));
  document.querySelectorAll('[data-arq-ed]').forEach(b => b.onclick = () => editarArq(Number(b.dataset.arqEd)));
  document.querySelectorAll('[data-arq-ex]').forEach(b => b.onclick = () => excluirArq(Number(b.dataset.arqEx)));
}
function limparArq() {
  arqEditando = null; $('arqForm').reset(); $('arqFormTitulo').textContent = 'Novo arquivo';
  $('arqOrigem').hidden = false; $('arqCancelar').hidden = true; $('arqTemaBox').hidden = true;
}
async function salvarMateriaisAgente(lista) {
  const config = { ...agDados.config, materiais: lista };
  const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
  agDados = { ...agDados, config, versao: r?.versao ?? agDados.versao };
}
async function alternarArq(id) {
  const usados = arqDoAgente(), tem = usados.some(x => String(x.id) === String(id));
  try {
    await salvarMateriaisAgente(tem ? usados.filter(x => String(x.id) !== String(id)) : [...usados, { id, quando: 'pedir', tema: '', legenda: '' }]);
    toast(tem ? 'Tirado deste agente.' : 'Agora este agente pode enviar este arquivo.');
    desenharArquivos();
  } catch {}
}
function editarArq(id) {
  const m = arqLista.find(x => x.id === id); if (!m) return;
  const u = arqDoAgente().find(x => String(x.id) === String(id)) || {};
  arqEditando = m; $('arqFormTitulo').textContent = 'Editar arquivo'; $('arqOrigem').hidden = true; $('arqCancelar').hidden = false;
  $('arqTitulo').value = m.titulo || ''; $('arqDescricao').value = m.descricao || ''; $('arqQuando').value = u.quando || 'pedir';
  $('arqTema').value = u.tema || ''; $('arqLegenda').value = u.legenda || ''; $('arqTemaBox').hidden = $('arqQuando').value !== 'tema';
  $('arqTitulo').focus();
}
async function excluirArq(id) {
  const m = arqLista.find(x => x.id === id); if (!m) return;
  if (!confirm('Excluir "' + m.titulo + '"? Ele sai de todos os agentes e não tem como desfazer.')) return;
  try {
    await api('material-excluir', { organization: empresa.id, id });
    await abrirAgenteMotor(agSel); toast('Arquivo excluído.');
  } catch (err) { toast(err.message, true); }
}
$('arqCancelar').onclick = limparArq;
$('arqQuando').onchange = () => { $('arqTemaBox').hidden = $('arqQuando').value !== 'tema'; };
$('arqForm').onsubmit = async e => {
  e.preventDefault();
  const bt = $('arqSalvar'), arquivo = $('arqArquivo').files[0], link = $('arqLink').value.trim(), titulo = $('arqTitulo').value.trim();
  const quando = $('arqQuando').value, tema = $('arqTema').value.trim();
  if (!titulo) return toast('Dê um título para o arquivo.', true);
  if (quando === 'tema' && !tema) return toast('Escreva de qual assunto a IA deve falar para enviar.', true);
  if (!arqEditando && !arquivo && !link) return toast('Escolha um arquivo ou cole um link.', true);
  if (!arqEditando && arquivo && link) return toast('Use o arquivo ou o link, não os dois.', true);
  bt.disabled = true; bt.textContent = arquivo ? 'Enviando…' : 'Salvando…';
  try {
    let url = arqEditando?.url || link, tipo = arqEditando?.tipo || 'link';
    if (arquivo) {
      const r = await fetch('/api/account/material-arquivo?organization=' + encodeURIComponent(empresa.id), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: await arquivo.arrayBuffer() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Não deu para enviar o arquivo.');
      url = d.url; tipo = d.tipo;
    }
    const s = await api('material-salvar', { organization: empresa.id, material: { id: arqEditando?.id ?? null, titulo, tipo, url, descricao: $('arqDescricao').value.trim() } });
    const item = { id: s.id, quando, tema: quando === 'tema' ? tema : '', legenda: $('arqLegenda').value.trim() };
    const usados = arqDoAgente();
    await salvarMateriaisAgente(usados.some(x => String(x.id) === String(s.id)) ? usados.map(x => String(x.id) === String(s.id) ? item : x) : [...usados, item]);
    toast('Arquivo salvo. Este agente já pode enviar.');
    await abrirArquivos();
  } catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; bt.textContent = 'Salvar arquivo'; }
};

function desenharAgente() {
  if (!agDados) return;
  const c = agDados.config, id = c.identidade, nome = id.nome || agDados.nome || 'Agente sem nome';
  $('agFoto').textContent = nome.trim().charAt(0).toUpperCase() || 'IA';
  $('agNome').textContent = nome; $('agFuncao').textContent = nomeTipo(agDados.tipo);
  $('agLiga').setAttribute('aria-checked', String(!!agDados.ativo)); $('agLiga').disabled = false;
  const mt = c.modoTeste || {}, nums = (mt.numeros || []).map(zapCurto);
  const emTeste = agDados.ativo && mt.ativo && nums.length;
  $('agSt').textContent = !agDados.ativo ? 'IA desligada' : emTeste ? 'IA em teste' : 'IA ligada'; $('agSt').className = agDados.ativo ? 'on' : '';
  $('agStDica').textContent = !agDados.ativo ? 'Não responde ninguém. Toque para ligar.' : emTeste ? 'Responde só: ' + nums.join(', ') + '.' : 'Respondendo os clientes no WhatsApp.';
  if (!testeSujo) { sw('agTesteSw', mt.ativo); $('agTesteBox').hidden = !mt.ativo; $('agTesteNum').value = nums.length ? nums.join(', ') : zapCurto(cfg.whatsapp || ''); }
  $('agDados').innerHTML = `<div><span>Tipo</span>${esc(nomeTipo(agDados.tipo))}</div><div><span>Porta de entrada</span>${agDados.entrada ? 'Sim' : 'Não'}</div>`
    + `<div><span>Versão salva</span>${esc(agDados.versao)}</div><div><span>Configuração</span>${agDados.configurado ? 'Concluída' : 'Pendente'}</div>`
    + `<div><span>Fala preço?</span>${esc({ livre: 'Sim, o valor exato', a_partir: 'Só "a partir de"', nao_fala: 'Não fala valor' }[(c.precos || {}).politica] || 'Só "a partir de"')} <button type="button" class="link-bt" id="agMudaPreco">mudar</button></div>`;
  $('agMudaPreco').onclick = () => {
    document.querySelector('[data-ag="conhecimento"]')?.click();
    let n = 0; const ir = () => { if (document.querySelector('[data-kp="precos"]')) { document.querySelector('[data-k="precos"]').click(); document.querySelector('[data-kp="precos"]').scrollIntoView({ behavior: 'smooth', block: 'start' }); } else if (n++ < 30) setTimeout(ir, 200); };
    ir();
  };
  const au = c.audio || {}, mm = c.multimodal || {}, falaTxt = { espelho: '✓ quando o cliente manda áudio', sempre: '✓ sempre' }[au.modo];
  const caps = [['Entende áudio', mm.entendeAudio !== false], ['Entende imagem', mm.entendeImagem !== false], ['Responde com áudio', !!falaTxt, falaTxt],
    ['Entende PDF e documentos', !!mm.documentos?.ativo], ['Entende planilhas', !!mm.planilhas?.ativo]];
  $('agCaps').innerHTML = caps.map(([n, on, txt]) => `<div>${n}<i class="${on ? 'on' : ''}">${on ? txt || '✓ sim' : 'não'}</i></div>`).join('');
  if (!mmSujo || mmAgente !== agSel) {
    mmAgente = agSel;
    sw('mmOuve', mm.entendeAudio !== false); sw('mmVe', mm.entendeImagem !== false); sw('mmFala', !!falaTxt);
    $('mmModo').value = au.modo === 'sempre' ? 'sempre' : 'espelho'; $('mmVoz').value = au.voz || 'nova'; $('mmEstilo').value = au.estilo || '';
    $('mmProv').value = au.provedor === 'elevenlabs' ? 'elevenlabs' : 'openai'; $('mmElVoz').dataset.quer = au.vozEleven || '';
    sw('mmDoc', mm.documentos?.ativo); $('mmDocPag').value = String(mm.documentos?.paginas || 10); $('mmDocLim').value = String(mm.documentos?.limite || 6000);
    sw('mmPlan', mm.planilhas?.ativo); $('mmPlanLin').value = String(mm.planilhas?.linhas || 100); $('mmPlanLim').value = String(mm.planilhas?.limite || 6000);
    mostrarMm(); limparMm();
  }
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
  if (b.dataset.ag === 'conhecimento') abrirConhecimento();
  if (b.dataset.ag === 'arquivos') abrirArquivos();
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
// aviso de alteração não salva; com alteração pendente, a barra de salvar gruda embaixo da tela
function avisoSujo(id, on) { const e = $(id); e.textContent = on ? 'Alterações não salvas.' : 'Tudo salvo.'; e.style.color = on ? 'var(--amarelo)' : ''; e.closest('.salvar-barra')?.classList.toggle('sujo', on); }
function marcarK() { kSujo = true; avisoSujo('kSujo', true); }
function limparK() { kSujo = false; avisoSujo('kSujo', false); }

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
  const c = agDados.config;
  // o agente é o que está aberto acima (a base fica numa aba dele)
  $('kTopo').innerHTML = `<div class="lista-topo"><div><h3>O que ${esc(c.identidade?.nome || agDados.nome || 'a IA')} sabe</h3><p class="muted" style="margin-top:4px">Ela só responde com o que estiver aqui. O que não souber, passa para a sua equipe.</p></div></div>
    <div class="checklist" id="kCheck"></div>`;
  const ehAgenda = agDados.tipo === 'agendamento' || agDados.tipo === 'agenda';
  $('kPaineis').innerHTML = `
    <div class="card" data-kp="empresa"><h3>Empresa</h3><p class="muted">O que a IA precisa saber sobre o negócio.</p>
      <div class="duas"><div><label for="kNome">Nome da empresa</label><input id="kNome" maxlength="80" value="${esc(c.empresa.nome)}"></div>
        <div><label for="kSeg">Segmento</label><input id="kSeg" maxlength="60" list="kSegs" value="${esc(c.empresa.segmento)}" placeholder="Ex.: ${esc(exemplo().seg)}">
        <datalist id="kSegs">${SEGMENTOS.map(s => `<option value="${s}">`).join('')}</datalist></div></div>
      <label for="kDesc">O que a empresa faz</label><textarea id="kDesc" maxlength="1500" placeholder="Produtos, serviços, há quanto tempo, onde atende…">${esc(c.empresa.descricao)}</textarea>
      <label for="kPub">Quem é o cliente <small>(ex.: ${esc(exemplo().pub)})</small></label><input id="kPub" maxlength="300" value="${esc(c.empresa.publico)}">
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
  listaK($('kFaq'), c.conhecimento.faq || [], [{ k: 'p', rot: 'Pergunta', max: 200, ph: 'Ex.: ' + exemplo().faq }, { k: 'r', rot: 'Resposta', tipo: 'textarea', max: 1000 }], { rotMais: 'Adicionar pergunta', max: 60 });
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
/* aba Multimodal: cada capacidade é uma chave sim/não; as opções só aparecem com a chave ligada.
   Leitura de PDF e planilha tem limite: o texto fica na memória da conversa e gasta token a cada resposta. */
let mmSujo = false, mmAgente = null;
const mostrarMm = () => {
  $('mmVozBox').hidden = !ligado('mmFala'); $('mmDocBox').hidden = !ligado('mmDoc'); $('mmPlanBox').hidden = !ligado('mmPlan');
  const el = $('mmProv').value === 'elevenlabs';
  $('mmElBox').hidden = !el; $('mmVozRot').textContent = el ? 'Voz da OpenAI (reserva)' : 'Voz';
  if (el && ligado('mmFala')) desenharVozesEl();
};
// vozes da conta ElevenLabs da empresa (o servidor guarda a chave; aqui chegam só nome e id)
let elVozes = null;
async function desenharVozesEl() {
  const s = $('mmElVoz'), quer = s.value || s.dataset.quer || '';
  try {
    if (!elVozes) elVozes = (await api('elevenlabs-vozes?organization=' + encodeURIComponent(empresa.id))).vozes || [];
    s.innerHTML = '<option value="">Escolha a voz</option>' + elVozes.map(v => `<option value="${esc(v.id)}">${esc(v.nome)}${v.detalhe ? ' · ' + esc(v.detalhe) : ''}</option>`).join('');
    s.value = elVozes.some(v => v.id === quer) ? quer : '';
    $('mmElAviso').textContent = elVozes.length ? 'Se a ElevenLabs falhar ou acabarem os créditos, a IA usa a voz da OpenAI abaixo.' : 'A sua conta ElevenLabs ainda não tem vozes. Adicione uma na ElevenLabs e volte aqui.';
  } catch (err) { s.innerHTML = '<option value="">Sem vozes</option>'; $('mmElAviso').textContent = err.message; }
}
function marcarMm() { mmSujo = true; avisoSujo('mmSujo', true); }
function limparMm() { mmSujo = false; avisoSujo('mmSujo', false); }
$('mmAudio').querySelectorAll('.switch').forEach(b => b.onclick = () => { sw(b.id, !ligado(b.id)); mostrarMm(); marcarMm(); });
$('mmAudio').addEventListener('input', marcarMm);
$('mmAudio').addEventListener('change', e => { if (e.target.id === 'mmProv') mostrarMm(); marcarMm(); });
$('mmAudio').onsubmit = async e => {
  e.preventDefault(); if (!agDados) return;
  const bt = e.submitter; bt.disabled = true;
  try {
    const el = ligado('mmFala') && $('mmProv').value === 'elevenlabs';
    if (el && !$('mmElVoz').value) throw Error('Escolha a voz da ElevenLabs (ou conecte a ElevenLabs em Credenciais de API).');
    const c = agDados.config, config = { ...c,
      audio: { modo: ligado('mmFala') ? $('mmModo').value : 'desligado', provedor: $('mmProv').value, voz: $('mmVoz').value, estilo: $('mmEstilo').value.trim().slice(0, 300),
        vozEleven: $('mmElVoz').value || (c.audio || {}).vozEleven || '' },
      multimodal: { entendeAudio: ligado('mmOuve'), entendeImagem: ligado('mmVe'),
        documentos: { ativo: ligado('mmDoc'), paginas: Number($('mmDocPag').value), limite: Number($('mmDocLim').value) },
        planilhas: { ativo: ligado('mmPlan'), linhas: Number($('mmPlanLin').value), limite: Number($('mmPlanLim').value) } } };
    const r = await acaoMotor({ acao: 'salvar', agente: agSel, config, versaoBase: agDados.versao });
    agDados = { ...agDados, config, versao: r.versao ?? agDados.versao };
    limparMm(); desenharAgente();
    toast('Multimodal salvo. Vale a partir da próxima mensagem.');
  } catch (err) { if (!err.status) toast(err.message, true); }
  finally { bt.disabled = false; }
};

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
  sw('cpVend', av.vendedor?.ativo); $('cpVendModo').value = av.vendedor?.iaContinua ? 'continua' : 'pausa';
  sw('cpGrupo', av.grupo?.ativo); $('cpGrupoId').value = av.grupo?.id || (c.regras || {}).grupo || ''; $('cpGrupoQuando').value = av.grupo?.quando || 'equipe';
  sw('cpRes', av.resumo?.ativo); $('cpResZap').value = av.resumo?.whatsapp || ''; $('cpResHora').value = String(av.resumo?.hora || 19);
  $('cpLimH').value = lim.hora || 25; $('cpLimD').value = lim.dia || 50;
  mostrarFu(); limparCp();
}
const mostrarFu = () => { $('cpFuBox').hidden = !ligado('cpFu'); };
function marcarCp() { cpSujo = true; avisoSujo('cpSujo', true); }
function limparCp() { cpSujo = false; avisoSujo('cpSujo', false); }
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
        vendedor: { ativo: ligado('cpVend'), iaContinua: $('cpVendModo').value === 'continua' },
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
// número com ou sem 55: DDD + número vira 55 + DDD + número; vazio continua vazio
const zap55 = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? '55' + d : d; };
// editor dos departamentos: nome, fila, quando e como o cliente chega aos vendedores (fila pendente ou rodízio)
let setoresEd = [];
const setoresAtuais = () => setoresEd.filter(x => limpaNome(x.nome));
function desenharSetores() {
  const us = listas.usuarios || [];
  $('rgSetores').innerHTML = setoresEd.map((s, i) => `<div class="linha-lista" data-i="${i}"><button type="button" class="tirar" aria-label="Remover departamento" data-tira-set="${i}">×</button>
    <div class="tres"><div><label for="sN${i}">Departamento</label><input id="sN${i}" data-c="nome" list="rgDeps" maxlength="60" placeholder="Ex.: Comercial" value="${esc(s.nome)}"></div>
      <div><label for="sF${i}">Nº da fila na LeadVox</label><input id="sF${i}" data-c="filaId" maxlength="10" inputmode="numeric" placeholder="Ex.: 66" value="${esc(s.filaId)}"></div>
      <div><label for="sQ${i}">Quando a IA manda para cá</label><input id="sQ${i}" data-c="quando" maxlength="200" placeholder="Ex.: cliente quer comprar" value="${esc(s.quando)}"></div></div>
    <label for="sD${i}">Como o cliente chega aos usuários</label>
    <select id="sD${i}" data-c="distribuicao"><option value="fila">Fila do departamento: fica pendente e quem aceitar primeiro pega</option>
      <option value="rodizio" ${s.distribuicao === 'rodizio' ? 'selected' : ''}>Rodízio: um cliente para cada usuário, na ordem</option></select>
    ${s.distribuicao !== 'rodizio' ? '' : `<div style="margin-top:6px">${us.length ? us.map(u => { const v = s.vendedores.find(x => String(x.id) === String(u.id)); return `<div class="vend-lin"><label class="check-lin" style="margin-top:6px"><input type="checkbox" data-vend="${esc(u.id)}" ${v ? 'checked' : ''}> ${esc(u.name)}</label>${v ? `<input data-vzap="${esc(u.id)}" inputmode="numeric" maxlength="15" placeholder="WhatsApp do usuário: 5521999999999" value="${esc(v.whatsapp || '')}" aria-label="WhatsApp de ${esc(u.name)}">` : ''}</div>`; }).join('')
      : '<p class="muted" style="font-size:13px">Conecte a LeadVox em Credenciais de API para escolher os usuários.</p>'}
      <p class="muted" style="font-size:13px;margin-top:6px">${s.vendedores.length ? 'Ordem: ' + s.vendedores.map(v => esc(v.nome)).join(' → ') + ' → e começa de novo. O ticket vai direto para o usuário. Cliente que volta fica com o mesmo usuário. Quem não está marcado nunca recebe por aqui (nem pela IA, nem pelo plugin).' : 'Marque os usuários deste departamento, na ordem em que devem receber. Só eles recebem.'}</p>
      <label for="sP${i}">Transferir pelo plugin</label>
      <select id="sP${i}" data-c="pluginEscolha"><option value="fila">Sempre para o próximo da fila (ninguém escolhe)</option><option value="escolher" ${s.pluginEscolha === 'escolher' ? 'selected' : ''}>O usuário pode escolher a pessoa (só entre os marcados)</option></select>
      <p class="muted" style="font-size:13px;margin-top:6px">O botão Transferir do plugin usa a mesma fila da IA. A oportunidade passa junto para quem receber o cliente.</p>
      <label for="sT${i}">Se o usuário não responder o cliente</label>
      <select id="sT${i}" data-c="trocaMin">${[[0, 'Não trocar de usuário'], ...[15, 20, 30, 40, 50, 60].map(m => [m, 'Passar para o próximo usuário depois de ' + m + ' min'])]
        .map(([v, t]) => `<option value="${v}" ${Number(s.trocaMin) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <p class="muted" style="font-size:13px;margin-top:6px">Conta só dentro do horário de atendimento, troca uma vez por atendimento e fica registrado em nota interna. Cliente sem responder nunca troca o usuário.</p></div>`}
  </div>`).join('') + (setoresEd.length < 12 ? '<button type="button" class="leve" id="rgMaisSet">+ Adicionar departamento</button>' : '');
  desenharPadrao();
}
$('rgSetores').addEventListener('input', e => {
  const row = e.target.closest('[data-i]'), k = e.target.dataset.c; if (!row || (!k && !e.target.dataset.vzap) || k === 'distribuicao') return;
  const s = setoresEd[+row.dataset.i]; if (e.target.dataset.vzap) { const v = s.vendedores.find(x => String(x.id) === e.target.dataset.vzap); if (v) v.whatsapp = e.target.value; marcarRg(); return; } s[k] = e.target.value;
  if (k === 'nome') { const d = (listas.departamentos || []).find(x => semAc(x.name) === semAc(e.target.value)); if (d) { s.filaId = String(d.id); row.querySelector('[data-c="filaId"]').value = d.id; } desenharPadrao(); }
});
$('rgSetores').addEventListener('change', e => {
  const row = e.target.closest('[data-i]'); if (!row) return;
  const s = setoresEd[+row.dataset.i];
  if (e.target.dataset.c === 'distribuicao') { s.distribuicao = e.target.value; desenharSetores(); }
  else if (e.target.dataset.vend) {
    const id = e.target.dataset.vend, u = (listas.usuarios || []).find(x => String(x.id) === id);
    s.vendedores = e.target.checked ? [...s.vendedores.filter(v => String(v.id) !== id), { id: Number(id) || id, nome: u ? limpaNome(u.name) : id, whatsapp: '' }] : s.vendedores.filter(v => String(v.id) !== id);
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
    distribuicao: s.distribuicao === 'rodizio' ? 'rodizio' : 'fila', vendedores: Array.isArray(s.vendedores) ? s.vendedores.filter(v => v && v.id) : [],
    trocaMin: Number(s.trocaMin) || 0, pluginEscolha: s.pluginEscolha === 'escolher' ? 'escolher' : 'fila' }));
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
// Modelo pronto: as situações já escritas para a função e o ramo; cada ação é escolhida numa lista da LeadVox, sem digitar nome.
let mdLinhas = [];
const MD_LISTA = { ETIQUETA: 'etiquetas', TIRAR_ETIQUETA: 'etiquetas', ETAPA: 'status', ORIGEM: 'origens' };
const MD_ROTULO = { ETIQUETA: 'Etiqueta', TIRAR_ETIQUETA: 'Tirar etiqueta', ETAPA: 'Etapa do funil', ORIGEM: 'Origem do lead', DEPARTAMENTO: 'Passar para o departamento', NOTA: 'Nota interna' };
const nomesLeadVox = k => (listas[k] || []).map(x => limpaNome(x.name)).filter(Boolean);
// departamento: os que já estão no quadro abaixo e os da LeadVox (ao usar, entra no quadro com a fila preenchida)
const mdOpcoes = cod => cod === 'DEPARTAMENTO'
  ? [...new Set([...setoresAtuais().map(s => limpaNome(s.nome)), ...nomesLeadVox('departamentos')])]
  : nomesLeadVox(MD_LISTA[cod]);
async function abrirModelo(forcar) {
  if (!agDados) return;
  $('mdCorpo').innerHTML = '<p class="muted">Buscando as listas da sua LeadVox…</p>';
  $('mdUsar').disabled = true;
  if (!$('dlgModelo').open) $('dlgModelo').showModal();
  if (forcar) ['etiquetas', 'status', 'origens', 'departamentos'].forEach(k => { listas[k] = null; });
  await carregarListasIA();
  if (agDados) atualizarListasAcoes();
  desenharModelo();
}
function desenharModelo() {
  const nicho = NICHOS[cfg.niche] || NICHOS.outro;
  $('mdTitulo').textContent = 'Modelo pronto: ' + nomeTipo(agDados.tipo) + ' · ' + nicho.n;
  if (!chat?.connected) {
    $('mdCorpo').innerHTML = '<p class="alerta">Conecte a sua LeadVox em Credenciais de API. As etiquetas, etapas e origens do modelo vêm de lá.</p>';
    return;
  }
  mdLinhas = modeloRegras(agDados.tipo, cfg.niche, nomesLeadVox('origens')).map(l => ({ ...l, acoes: l.acoes.map(a => ({ ...a, opcoes: a.texto ? null : mdOpcoes(a.cod) })) }));
  mdLinhas.forEach(l => l.acoes.forEach(a => { if (a.opcoes && !a.valor) a.valor = sugerirItem(a.opcoes, a.sugere); }));
  const marcadas = mdLinhas.flatMap(l => l.acoes).filter(a => a.opcoes && a.valor && a.cod !== 'ORIGEM').length;
  $('mdResumo').textContent = marcadas
    ? marcadas + (marcadas === 1 ? ' ação já veio marcada porque o nome bate' : ' ações já vieram marcadas porque o nome bate') + ' com a sua LeadVox. Confira e escolha o resto.'
    : 'Escolha em cada linha o que a IA deve marcar. O que ficar em "Não usar" fica de fora.';
  $('mdCorpo').innerHTML = mdLinhas.map((l, i) => `<fieldset class="md-linha" data-md="${i}">
    <label class="check-lin"><input type="checkbox" data-md-usa checked aria-label="Usar esta regra"><input type="text" data-md-q maxlength="200" value="${esc(l.quando)}" aria-label="Situação"></label>
    <div class="md-acoes">${l.acoes.map((a, j) => {
      const id = `md${i}a${j}`;
      // a origem já está na própria linha; a nota do motor leva a regra e a última mensagem do cliente
      if (a.cod === 'ORIGEM') return `<input type="hidden" data-md-a="${j}" value="${esc(a.valor)}">`;
      if (!a.opcoes) return `<div><label for="${id}">${esc(MD_ROTULO[a.cod])}</label><select id="${id}" data-md-a="${j}"><option value="${esc(a.texto)}">Sim, com a última mensagem do cliente</option><option value="">Não usar</option></select></div>`;
      return `<div><label for="${id}">${esc(MD_ROTULO[a.cod])}</label><select id="${id}" data-md-a="${j}"><option value="">Não usar</option>${a.opcoes.map(n => `<option value="${esc(n)}" ${n === a.valor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
    }).join('')}</div></fieldset>`).join('');
  $('mdUsar').disabled = false;
}
$('rgModelo').onclick = () => abrirModelo(false);
$('mdAtualizar').onclick = () => abrirModelo(true);
$('mdUsar').onclick = () => {
  const novas = [], deps = [];
  $('mdCorpo').querySelectorAll('[data-md]').forEach(f => {
    if (!f.querySelector('[data-md-usa]').checked) return;
    const l = mdLinhas[+f.dataset.md], quando = f.querySelector('[data-md-q]').value;
    const acoes = l.acoes.map((a, j) => ({ cod: a.cod, valor: f.querySelector(`[data-md-a="${j}"]`).value }));
    const regra = montarRegra(quando, acoes); if (!regra) return;
    novas.push(regra);
    acoes.filter(a => a.cod === 'DEPARTAMENTO' && a.valor).forEach(a => deps.push({ nome: limpaNome(a.valor), quando: limpaNome(quando).replace(/^quando\s+/i, '') }));
  });
  if (!novas.length) return toast('Escolha pelo menos uma ação em alguma regra.', true);
  const texto = juntarRegras($('rgTexto').value, novas);
  if (texto.length > 12000) return toast('As regras passariam do limite de 12.000 caracteres. Desmarque algumas ou apague regras antigas.', true);
  $('rgTexto').value = texto;
  // departamento novo entra no quadro, com a fila que veio da LeadVox
  let mudou = false;
  for (const d of deps) {
    if (setoresAtuais().some(s => semAc(s.nome) === semAc(d.nome)) || setoresEd.length >= 12) continue;
    const dep = (listas.departamentos || []).find(x => semAc(x.name) === semAc(d.nome)); if (!dep) continue;
    setoresEd.push({ nome: d.nome, filaId: String(dep.id), quando: d.quando, distribuicao: 'fila', vendedores: [], trocaMin: 0 }); mudou = true;
  }
  if (mudou) desenharSetores();
  $('dlgModelo').close(); marcarRg(); conferirAcoes();
  toast('Modelo colocado nas regras. Confira e clique em Salvar ações e regras.');
  $('rgTexto').focus();
};
// responsável da oportunidade: o vendedor do ticket (com reserva) ou sempre a mesma pessoa
function modoResp() {
  const fixo = $('rgModoResp').value === 'fixo';
  $('rgRespRot').textContent = fixo ? 'Quem fica com todas as oportunidades' : 'Quem fica com a oportunidade quando ela é criada (ex.: a pré-venda)';
  $('rgRespDica').hidden = fixo;
}
$('rgModoResp').addEventListener('change', modoResp);
function marcarRg() { rgSujo = true; avisoSujo('rgSujo', true); }
function limparRg() { rgSujo = false; avisoSujo('rgSujo', false); }
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
      distribuicao: s.distribuicao === 'rodizio' ? 'rodizio' : 'fila', vendedores: s.distribuicao === 'rodizio' ? s.vendedores.map(v => ({ id: Number(v.id), nome: v.nome, whatsapp: zap55(v.whatsapp) })).filter(v => v.id) : [],
      trocaMin: s.distribuicao === 'rodizio' && [15, 20, 30, 40, 50, 60].includes(Number(s.trocaMin)) ? Number(s.trocaMin) : 0,
      pluginEscolha: s.distribuicao === 'rodizio' && s.pluginEscolha === 'escolher' ? 'escolher' : 'fila' }));
    const zapRuim = setores.flatMap(s => s.vendedores).find(v => v.whatsapp && !/^55\d{10,11}$/.test(v.whatsapp));
    if (zapRuim) throw Error('WhatsApp de ' + zapRuim.nome + ': use 55 + DDD + número.');
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
async function carregarOpenAI() {
  $('oaChave').value = ''; $('oaForm').hidden = true; $('oaStatus').textContent = 'Carregando…';
  try {
    const d = await api('openai?organization=' + encodeURIComponent(empresa.id));
    $('oaStatus').innerHTML = d.connected
      ? `<h3>OpenAI conectada</h3><p class="muted">Chave terminada em ${esc(d.suffix)} · atualizada em ${esc(quandoBR(d.updatedAt))}.</p><button type="button" class="sm" id="oaTrocar">Trocar chave</button>`
      : '<h3>Conecte a OpenAI da sua empresa</h3><p class="muted">O atendimento com chave própria depende desta conexão.</p>';
    $('oaForm').hidden = !!d.connected;
    if (d.connected) $('oaTrocar').onclick = () => { $('oaForm').hidden = false; $('oaChave').focus(); };
  } catch (e) { $('oaStatus').textContent = e.message; }
}
$('oaForm').onsubmit = async e => {
  e.preventDefault(); const bt = e.currentTarget.querySelector('button'); bt.disabled = true;
  try { await api('openai', { organization: empresa.id, apiKey: $('oaChave').value }); await carregarOpenAI(); toast('OpenAI conectada. O consumo será cobrado na sua conta OpenAI.'); }
  catch (err) { toast(err.message, true); }
  finally { $('oaChave').value = ''; bt.disabled = false; }
};

let chat = null, listas = {};
const DA_LEADVOX = { etiquetas: 1, status: 1, origens: 1, usuarios: 1, departamentos: 1, motivos: 1 };
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
  const tipo = tipoCatalogo(), C = CATALOGO[tipo], veic = tipo === 'veiculos';
  // fora do automotivo o catálogo é sempre cadastrado aqui (AutoCerto e Revenda Mais são só de veículos)
  const fonte = veic && conexoes?.estoque?.connected ? conexoes.estoque.source : 'leadvox', externa = fonte === 'autocerto' || fonte === 'revendamais';
  const itens = estoque.itens || [], disp = itens.filter(i => i.status === 'disponivel').length, usa = !!agDados?.config?.catalogo?.usar;
  topo.innerHTML = `<div class="lista-topo"><div><h3>${veic ? 'Estoque da IA · ' + esc(FONTES[fonte] || fonte) : esc(C.titulo) + ' da IA'}</h3>
      <p class="muted" style="margin-top:4px">${externa ? 'Copiado do ' + esc(FONTES[fonte]) + ': atualiza sozinho a cada 30 minutos.' : 'Cadastre os ' + C.itens + ' aqui. A IA só oferece o que estiver disponível, e o vendedor usa no plugin.'}
      ${itens.length} ${itens.length === 1 ? C.item : C.itens}, ${disp} disponíve${disp === 1 ? 'l' : 'is'}.</p></div>
      <div class="form-bts" style="margin:0">${externa ? '<button type="button" class="principal sm" id="esSync">Atualizar agora</button>' : `<button type="button" class="principal sm" id="esNovo">+ Cadastrar ${C.item}</button>`}
      ${veic ? '<button type="button" class="sm" data-ir="credenciais">Trocar fonte</button>' : ''}</div></div>
    ${agDados ? `<div class="lin-sw" style="margin-top:10px"><span>${esc(agDados.config.identidade.nome || 'A IA')} usa ${veic ? 'o estoque' : 'os ' + C.itens}<small>Mostra os ${C.itens}, manda foto e fala de preço conforme a regra de preço da base de conhecimento.</small></span>
      <button type="button" class="switch" role="switch" aria-checked="${usa}" id="esUsar" aria-label="A IA usa ${veic ? 'o estoque' : 'os ' + C.itens}"><span></span></button></div>`
      : `<p class="dica">Crie o seu agente em Agentes LeadVox IA para ele usar ${veic ? 'o estoque' : 'os ' + C.itens}.</p>`}`;
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
      toast(cat.usar ? 'Pronto: a IA já oferece os ' + C.itens + '.' : 'A IA parou de usar os ' + C.itens + '.'); desenharEstoque(); } catch {}
  };
  $('esLista').hidden = false;
  $('esLista').innerHTML = itens.length ? itens.map(i => {
    const manual = !/^(ac|rm):/.test(i.codigo || ''), foto = (i.fotos || [])[0];
    return `<div class="veic">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="sem-foto">sem foto</div>'}
      <div><b>${esc(i.nome)}</b><small>${esc(veic ? (i.descricao || i.categoria || '') : [i.categoria, i.descricao].filter(Boolean).join(' · '))}</small>
        <span class="valor">${i.preco ? preco(i.preco) + (!veic && i.atributos?.unidade ? ' / ' + esc(i.atributos.unidade) : '') : 'Sob consulta'}</span>${i.status !== 'disponivel' ? ` <span class="st rascunho">${i.status === 'reservado' ? 'Reservado' : veic ? 'Vendido' : 'Indisponível'}</span>` : ''}</div>
      <div class="bts">${manual ? `<button type="button" class="sm" data-es-ed="${i.id}">Editar</button><button type="button" class="sm perigo" data-es-ex="${i.id}">Excluir</button>` : ''}</div></div>`;
  }).join('') : `<div class="vazio"><b>Nenhum ${C.item} ainda</b>${externa ? 'Clique em Atualizar agora para trazer o estoque.' : 'Clique em Cadastrar ' + C.item + '.'}</div>`;
  $('esLista').querySelectorAll('[data-es-ed]').forEach(b => b.onclick = () => editarVeiculo(itens.find(i => String(i.id) === b.dataset.esEd)));
  $('esLista').querySelectorAll('[data-es-ex]').forEach(b => b.onclick = async () => {
    const it = itens.find(i => String(i.id) === b.dataset.esEx);
    if (!confirm('Excluir ' + (it?.nome || 'este ' + C.item) + '?')) return;
    try { estoque = await api('estoque', { organization: empresa.id, acao: 'excluir', id: Number(b.dataset.esEx) }); toast(C.item.charAt(0).toUpperCase() + C.item.slice(1) + ' excluído.'); desenharEstoque(); } catch (err) { toast(err.message, true); }
  });
}
// cadastro: veículo no automotivo; produto ou serviço nos outros segmentos (o formulário mostra só os campos de cada um)
function editarVeiculo(i) {
  const a = i?.atributos || {}, tipo = tipoCatalogo(), C = CATALOGO[tipo], veic = tipo === 'veiculos';
  $('esCamposVeic').hidden = !veic; $('esObsBox').hidden = !veic; $('esCamposProd').hidden = veic;
  $('esFormTit').textContent = (i ? 'Editar ' : 'Cadastrar ') + C.item; $('esSalvar').textContent = 'Salvar ' + C.item;
  $('esStatus').innerHTML = veic ? '<option value="disponivel">Disponível</option><option value="reservado">Reservado</option><option value="indisponivel">Vendido / fora do estoque</option>'
    : '<option value="disponivel">Disponível</option><option value="indisponivel">Indisponível</option>';
  $('esId').value = i?.id || ''; $('esStatus').value = i?.status || 'disponivel'; $('esFotos').value = (i?.fotos || []).join('\n');
  const precoTxt = i?.preco ? String(Number(i.preco)).replace('.', ',') : '';
  if (veic) {
    $('esMarca').value = a.marca || ''; $('esModelo').value = a.modelo || ''; $('esVersao').value = a.versao || '';
    $('esAno').value = a.ano || ''; $('esKm').value = a.km || ''; $('esCor').value = a.cor || ''; $('esCambio').value = a.cambio || ''; $('esComb').value = a.combustivel || '';
    $('esCat').value = i?.categoria || ''; $('esPreco').value = precoTxt; $('esObs').value = a.obs || ''; $('esOpc').value = (a.opcionais || []).join(', ');
  } else {
    const padrao = tipo === 'servicos' ? 'serviço' : 'un.';
    $('esUnidade').innerHTML = UNIDADES.map(u => `<option${u === (a.unidade || padrao) ? ' selected' : ''}>${esc(u)}</option>`).join('');
    $('esGrupos').innerHTML = [...new Set((estoque?.itens || []).map(x => x.categoria).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('');
    $('esNome').value = i?.nome || ''; $('esGrupo').value = i?.categoria || ''; $('esPrecoP').value = precoTxt; $('esDescricao').value = i?.descricao || '';
  }
  desenharFotos();
  $('esForm').hidden = false; $('esForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); $(veic ? 'esMarca' : 'esNome').focus();
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
  const tipo = tipoCatalogo(), C = CATALOGO[tipo], id = Number($('esId').value) || undefined;
  const item = tipo === 'veiculos'
    ? { id, marca: $('esMarca').value, modelo: $('esModelo').value, versao: $('esVersao').value, ano: $('esAno').value,
      km: $('esKm').value, cor: $('esCor').value, cambio: $('esCambio').value, combustivel: $('esComb').value, categoria: $('esCat').value,
      preco: $('esPreco').value, status: $('esStatus').value, fotos: $('esFotos').value, obs: $('esObs').value, opcionais: $('esOpc').value, tipo: /moto/i.test($('esCat').value) ? 'moto' : 'carro' }
    : { id, tipo: tipo === 'servicos' ? 'servico' : 'produto', nome: $('esNome').value, categoria: $('esGrupo').value, unidade: $('esUnidade').value,
      preco: $('esPrecoP').value, descricao: $('esDescricao').value, status: $('esStatus').value, fotos: $('esFotos').value };
  try { estoque = await api('estoque', { organization: empresa.id, acao: 'salvar', item }); $('esForm').hidden = true; toast(C.item.charAt(0).toUpperCase() + C.item.slice(1) + ' salvo. A IA já pode oferecer.'); desenharEstoque(); }
  catch (err) { toast(err.message, true); }
  finally { bt.disabled = false; }
};

/* webhook de eventos (Canais WhatsApp) e o checklist "Sua IA está pronta?" (Agentes) */
let eventos = null;
async function carregarEventos() { try { eventos = await api('eventos?organization=' + encodeURIComponent(empresa.id)); } catch { eventos = { erro: true }; } }
const recebendo = () => !!eventos?.ultimoEvento && Date.now() - Date.parse(eventos.ultimoEvento) < 7 * 864e5;

// Saúde da conexão: a LeadVox recusou o último envio da IA, ou parou de mandar mensagens em horário comercial.
function saudeConexao() {
  if (!eventos || !eventos.vinculado) return null;
  const e = eventos.ultimoEnvio, quando = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
  if (e && e.ok === false) {
    const t = (e.erro || '') + ' ' + e.status;
    if (/SESSION|session|desconect|disconnect/i.test(t) || e.status === 404) return { nivel: 'erro', titulo: 'O WhatsApp da loja está desconectado na LeadVox',
      texto: 'Desde ' + quando(e.ts) + ' a IA não consegue mandar mensagens. Na LeadVox, abra Conexões e reconecte o número (QR code). O aviso some sozinho no próximo envio que der certo.' };
    if ([401, 403].includes(e.status)) return { nivel: 'erro', titulo: 'A LeadVox recusou a chave da IA', ir: ['credenciais', 'Abrir Credenciais'],
      texto: 'Desde ' + quando(e.ts) + ' a IA não consegue mandar mensagens. Gere a URL da API de novo no canal de WhatsApp da LeadVox e cole em Credenciais de API.' };
    return { nivel: 'erro', titulo: 'A LeadVox recusou o último envio da IA', texto: 'Em ' + quando(e.ts) + ' (código ' + (e.status || '?') + '). Confira a conexão do WhatsApp na LeadVox.' };
  }
  // eventos parados: só com agente ligado, de segunda a sábado, das 9h às 20h (horário de Brasília)
  const sp = new Date(Date.now() - 3 * 3600e3), h = sp.getUTCHours(), ligado = (motor?.agentes || []).some(a => a.ativo);
  const ult = eventos.ultimoEvento ? Date.parse(eventos.ultimoEvento) : 0, horas = ult ? (Date.now() - ult) / 3600e3 : 0;
  if (ligado && ult && horas >= 3 && sp.getUTCDay() !== 0 && h >= 9 && h < 20) return { nivel: 'aviso', titulo: 'A LeadVox não manda mensagens para a IA há ' + Math.floor(horas) + ' h', ir: ['canais', 'Ver o webhook'],
    texto: 'Se a loja teve conversas nesse tempo, o webhook de eventos pode ter sido desligado pela LeadVox. Na LeadVox, abra Configurações → API, edite a integração e deixe "Ativo" ligado.' };
  return null;
}
function desenharSaude() {
  const s = saudeConexao(), el = $('saudeAviso');
  el.hidden = !s; if (!s) return;
  el.className = 'saude' + (s.nivel === 'aviso' ? ' aviso' : '');
  el.innerHTML = `<span aria-hidden="true">${s.nivel === 'aviso' ? '⚠️' : '🔴'}</span><div><b>${esc(s.titulo)}</b><p>${esc(s.texto)}</p>
    <div class="bts">${s.ir ? `<button type="button" class="sm" data-ir="${s.ir[0]}">${esc(s.ir[1])}</button>` : ''}<button type="button" class="sm leve" id="saudeAtualizar">Verificar de novo</button></div></div>`;
  ligarIr(el);
  $('saudeAtualizar').onclick = async () => { await carregarEventos(); desenharSaude(); if (!saudeConexao()) toast('Conexão em dia.'); };
}
// confere de novo a cada 3 minutos enquanto o painel está aberto
setInterval(() => { if (empresa && !document.hidden && !$('telaApp').hidden) carregarEventos().then(() => { desenharSaude(); if (abaAtual === 'canais') desenharEventos(); }); }, 180000);
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
  desenharPluginLink();
}
// link do Plugin do Usuário (mesmo endereço deste painel, página /vendedor com a chave da loja)
function desenharPluginLink() {
  const el = $('pvConteudo'), p = eventos && eventos.plugin;
  if (!p) { el.innerHTML = '<p class="dica">Gerando o link do plugin… aparece em até 2 minutos.</p>'; return; }
  const link = location.origin + '/vendedor?k=' + encodeURIComponent(p.conta) + '&t=' + encodeURIComponent(p.t);
  el.innerHTML = `<div class="ev-url"><input id="pvUrl" readonly aria-label="Link do Plugin do Usuário" value="${esc(link)}"><button type="button" class="principal sm" id="pvCopiar">Copiar</button></div>`;
  $('pvCopiar').onclick = async () => {
    try { await navigator.clipboard.writeText(link); } catch { $('pvUrl').select(); document.execCommand('copy'); }
    toast('Link do plugin copiado. Cole na LeadVox ao criar o plugin.');
  };
}

// Itens na ordem em que o dono resolve; cada um leva para o lugar certo do painel.
// [título, resumo, feito, onde resolver, o que apontar na tela, explicação do guia]
function itensProntos() {
  const ags = motor?.agentes || [], ag = ags.find(a => a.chave === agSel) || ags.find(a => a.entrada) || ags[0], c = agDados?.config || {};
  const itens = [
    ['LeadVox conectada', 'A IA conversa pela sua conta da LeadVox.', !!chat?.connected, 'credenciais', '#credStatus',
      'Na sua LeadVox, abra Configurações → API, copie a URL da API externa e cole aqui. É por ela que a IA lê e responde as conversas.'],
    ['IA ligada ao WhatsApp', 'Cria a conta da IA e liga o número da LeadVox.', !!(motor?.vinculado && motor?.conexao?.conectado), 'agentes', '#motorBox',
      'Clique em "Ligar minha IA". Com a LeadVox já conectada, o número do WhatsApp fica ligado na hora. Depois crie o seu primeiro agente.'],
    ['Agente com nome e apresentação', 'Identidade do agente preenchida e salva.', !!ag?.configurado, 'agentes:identidade', '#idNome',
      'Dê um nome ao agente e escreva como ele se apresenta. É assim que o cliente vai conhecer a sua IA. Não esqueça de Salvar.'],
    ['Onde o agente atende', 'Departamento da LeadVox ou porta de entrada.', !!(ag && (ag.departamentoId || ag.entrada)), 'agentes:identidade', '#idDep',
      'Escolha o departamento da LeadVox em que a IA responde, ou ligue "Porta de entrada" para ela atender as conversas novas.'],
    ['Mensagens da LeadVox chegando', 'Endereço do webhook de eventos colado na LeadVox.', recebendo(), 'canais', '#evCard',
      'Copie este endereço e cole na LeadVox em Configurações → API → Webhook de eventos. Sem ele, a IA não fica sabendo que chegou mensagem.'],
    ['Base de conhecimento', 'O que a empresa faz e pelo menos uma pergunta frequente.', !!(c.empresa?.descricao && (c.conhecimento?.faq || []).length), 'agentes:conhecimento', '#kForm',
      'Conte o que a empresa faz e cadastre as perguntas que os clientes mais fazem. A IA responde com base no que está aqui.']
  ];
  if (cfg.niche === 'automotivo') itens.push(['Estoque com veículos', 'Veículos disponíveis e a IA usando o estoque.', !!(c.catalogo?.usar && (estoque?.itens || []).some(i => i.status === 'disponivel')), 'estoque', '#esTopo',
    'Cadastre os veículos aqui ou conecte o AutoCerto ou o Revenda Mais em Credenciais. A IA só oferece o que está no estoque.']);
  itens.push(['IA testada', 'Conversou com a IA no "Testar a IA".', !!ag && testouIA(), 'agentes:testar', '#tsMsg',
    'Converse como se fosse um cliente. Nada vai para o WhatsApp. Se algo não ficar do seu jeito, ajuste nas outras abas e teste de novo.']);
  itens.push(['Agente ligado', 'Ligado, ele começa a responder os clientes.', !!ag?.ativo, 'agentes:identidade', '#agLiga',
    'Ligue o agente para ele responder os clientes. Quer ir com calma? Ligue antes o Modo de teste: ele responde só os números que você colocar.']);
  return itens;
}
// "IA testada" fica anotado neste aparelho quando a pessoa manda a primeira mensagem no Testar a IA
const chaveTestou = () => 'lv_testou_' + (empresa?.id || '');
const testouIA = () => { try { return localStorage.getItem(chaveTestou()) === '1'; } catch { return false; } };
$('tsForm').addEventListener('submit', () => { try { localStorage.setItem(chaveTestou(), '1'); } catch {} atualizarGuia(); });
let prontoAberto = null;
function desenharPronto() {
  atualizarGuia();
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

/* ═══════════ PRIMEIROS PASSOS ═══════════ */
// Botão no topo: os passos para pôr a IA no ar (marcam sozinhos), como a plataforma funciona, um tour
// que aponta cada coisa na tela e as dúvidas comuns. Abre sozinho na primeira vez em cada empresa.
// Suporte pelo webchat da LeadVox (o mesmo do site leadvox.com.br): balão flutuante em todas as telas depois do login;
// a pessoa se identifica no formulário do próprio chat (nome e e-mail).
const WEBCHAT = { sdk: 'https://chat.leadvox.com.br/webchat/sdk.js', token: '78ed9e3c-95ca-4b18-80e5-daa62c3ceb02', base: 'https://chatapi.leadvox.com.br' };
let webchat = null;
function carregarWebchat() {
  if (!webchat) webchat = new Promise((ok, falha) => {
    const s = document.createElement('script'); s.src = WEBCHAT.sdk; s.async = true;
    s.onload = () => { try { window.envioMensagemSDK.run({ widgetToken: WEBCHAT.token, baseUrl: WEBCHAT.base }); ok(); } catch (e) { falha(e); } };
    s.onerror = () => falha(Error('webchat'));
    document.head.appendChild(s);
  });
  return webchat;
}
// O webchat da LeadVox recusa sessão com identificador (setUser) enquanto a "identidade" não estiver ligada no canal
// (ERR_WEBCHAT_IDENTITY_DISABLED). Sem identificador, a conversa começa pelo formulário do chat.
function identificarSuporte() {}
function ligarSuporte() {
  carregarWebchat().then(() => { identificarSuporte(); try { window.$envioMensagemChat.toggleBubbleVisibility('show'); } catch {} }).catch(() => { webchat = null; });
}
function desligarSuporte() {
  try { const c = window.$envioMensagemChat; c.reset(); c.toggleBubbleVisibility('hide'); } catch {}
}
function abrirSuporte() {
  carregarWebchat().then(() => {
    // a janela do guia fica por cima de tudo; fecha para o chat aparecer
    if ($('dlgGuia').open) $('dlgGuia').close();
    identificarSuporte();
    window.$envioMensagemChat.open();
  }).catch(() => { webchat = null; toast('Não deu para abrir o chat agora. Tente de novo em instantes.', true); });
}
function passosGuia() {
  const p = itensProntos().map(([t, d, ok, ir, alvo, explica]) => ({ t, d, ok, ir, alvo, explica }));
  if (assin && assin.podeAssinar && assin.status !== 'cortesia') p.push({ t: 'Plano escolhido', d: 'Assine para a IA seguir atendendo depois do teste.',
    ok: assin.status === 'ativa', ir: 'conta', alvo: '#assinCard', explica: 'Escolha o plano e a forma de pagamento. No teste grátis, a primeira cobrança só vem quando o teste acaba.' });
  return p;
}
function atualizarGuia() {
  const bt = $('btGuia'); if (!bt || !empresa) return;
  if (!motor || motor.setupPending) { bt.innerHTML = '🚀 Primeiros passos'; return; }
  const p = passosGuia(), feitos = p.filter(x => x.ok).length;
  bt.innerHTML = feitos === p.length ? '✓ IA no ar' : `🚀 Primeiros passos <span class="guia-n">${feitos}/${p.length}</span>`;
  if ($('dlgGuia').open) desenharGuia();
}
function desenharGuia() {
  const p = motor && !motor.setupPending ? passosGuia() : [], feitos = p.filter(x => x.ok).length, prox = p.findIndex(x => !x.ok);
  const nome = cfg.aiName || 'sua IA';
  $('guiaProgresso').innerHTML = p.length ? `<p class="muted">${feitos === p.length ? `Tudo pronto: ${esc(nome)} já atende os seus clientes. 🎉` : `${feitos} de ${p.length} passos prontos. Siga na ordem: cada passo leva você ao lugar certo e mostra onde clicar.`}</p>
    <div class="pronto-barra"><i style="width:${Math.round(feitos / p.length * 100)}%"></i></div>` : '<p class="muted">Carregando os seus passos…</p>';
  $('guiaPassos').innerHTML = p.map((x, i) => `<li class="${x.ok ? 'ok' : i === prox ? 'agora' : ''}"><span class="guia-num" aria-hidden="true">${x.ok ? '✓' : i + 1}</span>
    <div><b>${esc(x.t)}</b>${i === prox ? ' <span class="st rascunho">próximo passo</span>' : ''}<small>${esc(x.ok ? x.d : x.explica)}</small></div>
    <button type="button" class="sm${i === prox ? ' principal' : ''}" data-guia-ir="${i}">${x.ok ? 'Rever' : 'Me mostra'}</button></li>`).join('');
  document.querySelectorAll('[data-guia-ir]').forEach(b => b.onclick = () => { const x = p[+b.dataset.guiaIr]; tourIniciar([{ ir: x.ir, alvo: x.alvo, t: x.t, txt: x.explica }], true); });
  $('guiaTourAdmin').hidden = !conta.platformAdmin;
}
function abrirGuia() {
  desenharGuia(); if (!$('dlgGuia').open) $('dlgGuia').showModal();
  // o que o guia confere e ainda não foi carregado nesta tela: o agente e o estoque
  const ags = motor?.agentes || [];
  if (ags.length && !agDados) abrirAgenteMotor((ags.find(a => a.entrada) || ags[0]).chave).then(atualizarGuia);
  if (cfg.niche === 'automotivo' && !estoque && motor?.vinculado) api('estoque?organization=' + encodeURIComponent(empresa.id)).then(r => { estoque = r; atualizarGuia(); }).catch(() => {});
}
$('btGuia').onclick = abrirGuia;
$('guiaTour').onclick = () => tourIniciar(TOUR_PAINEL());
$('guiaTourAdmin').onclick = () => tourIniciar(TOUR_ADMIN);
$('guiaSuporte').onclick = abrirSuporte;
// primeira vez nesta empresa: abre o guia (menos no acesso de suporte do admin)
function guiaPrimeiraVez() {
  // só conta como visto quando abriu de verdade (com os termos na tela, fica para a próxima vez)
  const k = 'lv_guia_visto_' + empresa.id; let visto = true;
  try { visto = localStorage.getItem(k) === '1'; } catch {}
  if (visto || empresa.role !== 'owner' || document.querySelector('dialog[open]')) return;
  try { localStorage.setItem(k, '1'); } catch {}
  abrirGuia();
}

// Tour: escurece a tela, destaca o elemento e mostra um balão com a explicação.
const TOUR_PAINEL = () => [
  { alvo: '[data-pg="agentes"]', menu: 1, t: 'Agentes LeadVox IA', txt: 'Aqui fica a sua IA: nome, jeito de falar, o que ela entende e o botão de ligar e desligar.' },
  { ir: 'agentes', alvo: '#prontoBox', t: 'Sua IA está pronta?', txt: 'Mostra o que falta para a IA atender sozinha. Cada item tem um botão Resolver que leva ao lugar certo.' },
  { ir: 'agentes:testar', alvo: '[data-ag="testar"]', t: 'Testar a IA', txt: 'Converse com a IA como se fosse um cliente. Nada vai para o WhatsApp, a LeadVox nem o funil.' },
  { ir: 'agentes', alvo: '#agLiga', t: 'Liga e desliga', txt: 'Ligada, a IA responde os clientes. Desligou, ela para na hora. O Modo de teste logo abaixo faz ela responder só os seus números.' },
  { alvo: '[data-pg="painel"]', menu: 1, t: 'Painel', txt: 'Três abas: Visão geral (o que a IA fez no período), Oportunidades (o funil da sua LeadVox) e Anúncios (qual anúncio trouxe cada lead e cada venda).' },
  { ir: 'agentes:conhecimento', alvo: '[data-ag="conhecimento"]', t: 'Base de conhecimento', txt: 'Tudo o que este agente sabe da empresa: o que vende, horário, regras e as perguntas frequentes.' },
  { alvo: '[data-pg="estoque"]', menu: 1, t: CATALOGO[tipoCatalogo()].titulo, txt: CATALOGO[tipoCatalogo()].desc + ' A IA só oferece o que está aqui.' },
  { alvo: '[data-pg="etiquetas"]', menu: 1, t: 'Dados da sua LeadVox', txt: 'Etiquetas, etapas do funil, origens, usuários, departamentos e motivos vêm da sua LeadVox. A IA usa para marcar o lead e passar para a pessoa certa.' },
  { alvo: '[data-pg="canais"]', menu: 1, t: 'Canais WhatsApp', txt: 'O endereço que você cola na LeadVox para as mensagens chegarem até a IA, e o link do Plugin do Usuário.' },
  { alvo: '[data-pg="credenciais"]', menu: 1, t: 'Credenciais de API', txt: 'Onde você conecta a LeadVox, o estoque e outras contas. As chaves ficam guardadas em cofre e não voltam para a tela.' },
  { alvo: '[data-pg="conta"]', menu: 1, t: 'Minha conta', txt: 'Dados da empresa e da loja, o seu plano e a senha.' },
  { alvo: '#btGuia', t: 'Primeiros passos', txt: 'Volte aqui quando quiser: os passos que faltam, este tour e as dúvidas comuns.' }
];
const TOUR_ADMIN = [
  { ir: 'leadvox', alvo: '#lvNumeros', t: 'Números da plataforma', txt: 'Quantos clientes estão em teste, ativos, atrasados ou pausados, e quanto entra por mês.' },
  { ir: 'leadvox', alvo: '#lvAlertas', t: 'Precisa de você', txt: 'Teste acabando, fatura vencida, IA pausada, sem mensagens chegando. Comece o dia por aqui.' },
  { ir: 'leadvox', alvo: '#lvConsumo', t: 'Consumo de IA', txt: 'Quanto cada cliente gastou de IA no período. Serve para ver quem está caro antes da conta da OpenAI chegar.' },
  { ir: 'leadvox', alvo: '#lvLista', t: 'Clientes', txt: 'Busque a empresa e clique nela para estender o teste, trocar o plano, dar cortesia, suspender ou entrar como suporte.' },
  { ir: 'leadvox', alvo: '#lvAsaas', t: 'Asaas da LeadVox', txt: 'A conta que recebe as assinaturas. Teste (sandbox) para testar sem dinheiro; Produção para cobrar de verdade.' }
];
let tour = null;
const esperar = ms => new Promise(r => setTimeout(r, ms));
const celular = () => matchMedia('(max-width: 760px)').matches;
function tourIniciar(passos, unico) {
  // só os passos cujo alvo existe neste painel (ex.: sem menu de Estoque, sem agente criado)
  const ok = passos.filter(p => !p.menu || document.querySelector(p.alvo));
  if (!ok.length) return;
  if ($('dlgGuia').open) $('dlgGuia').close();
  tour = { passos: ok, i: 0, unico: !!unico };
  tourMostrar();
}
async function tourMostrar() {
  const p = tour.passos[tour.i], vez = tour;
  if (p.ir) {
    const [pg, aba] = p.ir.split(':');
    if (abaAtual !== pg) abrir(pg);
    if (aba) document.querySelector('[data-ag="' + aba + '"]')?.click();
  }
  if (p.menu && celular()) $('lateral').classList.add('aberta'); else if (celular()) $('lateral').classList.remove('aberta');
  await esperar(250); if (tour !== vez) return;
  // alvo escondido (ex.: ainda sem agente): aponta o quadro principal da tela
  let el = document.querySelector(p.alvo);
  if (!el || !el.getClientRects().length) el = document.querySelector('.pagina section:not([hidden]) .card') || null;
  tour.el = el;
  el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const n = tour.passos.length, ult = tour.i === n - 1;
  $('guiaBalao').innerHTML = `<p class="guia-conta">${tour.unico ? 'Onde fazer' : `${tour.i + 1} de ${n}`}</p><h3>${esc(p.t)}</h3><p>${esc(p.txt)}</p>
    <div class="form-bts">${tour.unico ? '<button type="button" class="sm" data-tour="guia">Voltar aos passos</button><button type="button" class="principal sm" data-tour="fim">Entendi</button>'
      : `<button type="button" class="leve" data-tour="fim">Sair do tour</button>${tour.i ? '<button type="button" class="sm" data-tour="voltar">Voltar</button>' : ''}<button type="button" class="principal sm" data-tour="${ult ? 'fim' : 'prox'}">${ult ? 'Concluir' : 'Próximo'}</button>`}</div>`;
  $('guiaBalao').querySelectorAll('[data-tour]').forEach(b => b.onclick = () => tourAcao(b.dataset.tour));
  $('guiaFoco').hidden = $('guiaBalao').hidden = false;
  tourPosicionar(); setTimeout(tourPosicionar, 400);
  $('guiaBalao').querySelector('.principal')?.focus({ preventScroll: true });
}
function tourPosicionar() {
  if (!tour) return;
  const foco = $('guiaFoco'), balao = $('guiaBalao'), el = tour.el, m = 6;
  const r = el ? el.getBoundingClientRect() : { top: innerHeight / 2, left: innerWidth / 2, width: 0, height: 0, bottom: innerHeight / 2 };
  Object.assign(foco.style, { top: r.top - m + 'px', left: r.left - m + 'px', width: r.width + m * 2 + 'px', height: r.height + m * 2 + 'px' });
  if (celular()) { Object.assign(balao.style, { top: '', left: '', bottom: '16px' }); return; }
  const bw = balao.offsetWidth, bh = balao.offsetHeight;
  const embaixo = r.bottom + 14 + bh < innerHeight, top = embaixo ? r.bottom + 14 : Math.max(16, r.top - 14 - bh);
  const left = Math.min(Math.max(16, r.left), innerWidth - bw - 16);
  Object.assign(balao.style, { top: top + 'px', left: left + 'px', bottom: '' });
}
function tourAcao(a) {
  if (a === 'prox') { tour.i++; return tourMostrar(); }
  if (a === 'voltar') { tour.i--; return tourMostrar(); }
  tour = null; $('guiaFoco').hidden = $('guiaBalao').hidden = true;
  if (celular()) $('lateral').classList.remove('aberta');
  if (a === 'guia') abrirGuia();
}
addEventListener('resize', tourPosicionar);
addEventListener('scroll', tourPosicionar, { passive: true, capture: true });
addEventListener('keydown', e => {
  if (!tour) return;
  if (e.key === 'Escape') tourAcao('fim');
  else if (e.key === 'ArrowRight' && !tour.unico && tour.i < tour.passos.length - 1) tourAcao('prox');
  else if (e.key === 'ArrowLeft' && !tour.unico && tour.i) tourAcao('voltar');
});

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
  if (!conexoes) { $('estStatus').innerHTML = $('asStatus').innerHTML = $('elStatus').innerHTML = '<p class="muted">Carregando…</p>'; return; }
  if (conexoes.setupPending) {
    $('estStatus').innerHTML = $('asStatus').innerHTML = $('elStatus').innerHTML = '<p class="alerta" style="margin:0">Falta liberar no banco (o SQL das conexões) antes de salvar.</p>';
    $('estForm').hidden = $('asForm').hidden = $('elForm').hidden = true; return;
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
  const el = conexoes.elevenlabs;
  if (el?.connected) {
    $('elStatus').innerHTML = `<h3>ElevenLabs conectada</h3><div class="ag-dados"><div><span>Vozes na conta</span>${esc(el.vozes ?? '—')}</div><div><span>Atualizado em</span>${esc(quandoBR(el.updatedAt))}</div></div>
      <div class="form-bts"><button type="button" class="sm" id="elTrocar">Trocar chave</button></div>`;
    $('elTrocar').onclick = () => { $('elForm').hidden = false; };
    $('elForm').hidden = true;
  } else {
    $('elStatus').innerHTML = '<h3>ElevenLabs ainda não conectada</h3><p class="muted">Com ela, a IA responde em áudio com uma voz mais natural. Sem ela, usa a voz da OpenAI.</p>';
    $('elForm').hidden = false;
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
  try { await api('integrations', { organization: empresa.id, ...dados }); form.querySelectorAll('input[type=password], input[data-chave]').forEach(i => i.value = ''); await carregarConexoes(); desenharConexoes(); toast(ok); }
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
$('elForm').onsubmit = e => {
  e.preventDefault(); elVozes = null;
  salvarConexao(e.currentTarget, { provider: 'elevenlabs', apiKey: $('elChave').value }, 'ElevenLabs conectada. Escolha a voz na aba Multimodal do agente.');
};

async function desenharLista(pg, forcar) {
  const [t, d] = LISTA[pg];
  $('listaItens').innerHTML = ''; $('listaTopo').hidden = true;
  const vazio = (titulo, texto, ir) => {
    $('listaVazio').hidden = false;
    $('listaVazio').innerHTML = `<b>${titulo}</b>${texto}` + (ir ? `<br><button type="button" data-ir="${ir[0]}">${ir[1]}</button>` : '');
    ligarIr($('listaVazio'));
  };
  if (!DA_LEADVOX[pg]) return vazio(t, d, null);
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
  carregarUsoOpenAI();
  let r;
  try { r = await api('relatorio?organization=' + encodeURIComponent(empresa.id) + '&ini=' + $('dIni').value + '&fim=' + $('dFim').value); }
  catch (err) { $('dAtual').textContent = ''; return aviso(err.message); }
  if (r.setupPending) { $('dAtual').textContent = ''; desenharDashboard([]); return aviso('Falta liberar no banco (o SQL do relatório) para os números aparecerem.'); }
  if (!r.vinculado) { $('dAtual').textContent = ''; desenharDashboard([]); return aviso('Ligue a sua IA em Agentes LeadVox IA para ver os números.'); }
  $('dAtual').textContent = r.atualizado ? 'Atualizado em ' + new Date(r.atualizado).toLocaleString('pt-BR') + ' · os números chegam a cada 15 minutos.' : 'Ainda não chegou nenhum número da IA.';
  desenharDashboard(r.dias || []);
}
let usoPedido = 0;
async function carregarUsoOpenAI() {
  const pedido = ++usoPedido;
  ['oaEntrada','oaSaida','oaChamadas','oaCusto'].forEach(id => $(id).textContent = '—');
  $('oaUsoTabela').replaceChildren(); $('oaUsoStatus').textContent = 'Carregando consumo…';
  $('oaCache').textContent = $('oaErros').textContent = '';
  try {
    const d = await api('openai-usage?organization=' + encodeURIComponent(empresa.id) + '&ini=' + $('dIni').value + '&fim=' + $('dFim').value);
    if (pedido !== usoPedido) return;
    const rows = d.rows || [], soma = k => rows.reduce((s,r) => s + (Number(r[k]) || 0), 0);
    const fmt = n => Number(n).toLocaleString('pt-BR'), usd = n => Number(n).toLocaleString('pt-BR', {style:'currency',currency:'USD',minimumFractionDigits:4});
    $('oaEntrada').textContent = fmt(soma('input')); $('oaSaida').textContent = fmt(soma('output'));
    $('oaChamadas').textContent = fmt(soma('calls')); $('oaCache').textContent = fmt(soma('cached')) + ' tokens de entrada em cache';
    $('oaErros').textContent = fmt(soma('errors')) + ' falhas · ' + fmt(rows.filter(r=>r.teste).reduce((s,r)=>s+Number(r.calls),0)) + ' chamadas de teste';
    const medidos = rows.some(r=>r.usd!==null); $('oaCusto').textContent = medidos ? usd(soma('usd')) : '—';
    $('oaUsoStatus').textContent = !rows.length ? 'Sem consumo registrado neste período. O histórico começa quando o motor com chave própria for ativado.'
      : `${fmt(soma('unpriced'))} chamadas sem custo confirmado; ${fmt(soma('pending'))} pendentes. Voz gerada registra caracteres, sem inventar tokens ou custo. Valores não incluem impostos, câmbio ou uso fora da LeadVox.`;
    if (rows.length) $('oaUsoTabela').innerHTML = '<table class="tabela-d"><thead><tr><th>Dia</th><th>Agente</th><th>Modelo / operação</th><th>Chamadas</th><th>Entrada / saída</th><th>Áudio / voz</th><th>Estimativa USD</th></tr></thead><tbody>' + rows.map(r=>`<tr><td>${esc(r.dia)}</td><td>${esc(r.agente)}${r.teste?' · teste':''}</td><td>${esc(r.model)}<br><small>${esc(r.operation)}</small></td><td>${fmt(r.calls)}</td><td>${fmt(r.input||0)} / ${fmt(r.output||0)}</td><td>${fmt(r.seconds||0)} s / ${fmt(r.characters||0)} caracteres</td><td>${r.usd===null?'—':usd(r.usd)}${Number(r.unpriced)?' · parcial':''}</td></tr>`).join('') + '</tbody></table>';
  } catch (e) { if (pedido === usoPedido) $('oaUsoStatus').textContent = 'Consumo indisponível: ' + e.message; }
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

/* ═══════════ IDENTIDADE DA LOJA (vai no convite em PDF do plugin) ═══════════ */
let ljLogo = '';
const LJ = { nome: 'ljNome', razao: 'ljRazao', cnpj: 'ljCnpj', telefone: 'ljTel', whatsapp: 'ljZap', email: 'ljEmail', endereco: 'ljEnd', site: 'ljSite', instagram: 'ljInsta' };
function desenharLogo() {
  $('ljLogoImg').innerHTML = ljLogo ? `<img src="${esc(ljLogo)}" alt="Logo da loja">` : 'Sem logo';
  $('ljTiraLogo').hidden = !ljLogo;
}
function preencherLoja() {
  const l = cfg.loja || {};
  for (const [k, id] of Object.entries(LJ)) $(id).value = l[k] || '';
  if (!l.nome) $('ljNome').value = cfg.displayName || empresa.name || '';
  if (!l.whatsapp && cfg.whatsapp) $('ljZap').value = zapFmt(cfg.whatsapp);
  $('ljCor').value = l.cor || '#16a34a'; $('ljCorTxt').textContent = $('ljCor').value;
  ljLogo = l.logo || ''; desenharLogo();
}
$('ljCor').oninput = () => { $('ljCorTxt').textContent = $('ljCor').value; };
// a logo vira JPEG com fundo branco (o PDF usa JPEG) e vai para a pasta pública da conta, como as fotos do estoque
async function logoEmJpeg(src) {
  const img = new Image(); img.decoding = 'async';
  await new Promise((ok, falha) => { img.onload = ok; img.onerror = () => falha(Error('Não consegui abrir essa imagem. Tente uma em PNG ou JPG.')); img.src = src; });
  const k = Math.min(1, 800 / img.naturalWidth, 320 / img.naturalHeight), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
async function guardarLogo(src) {
  const r = await api('estoque-foto', { organization: empresa.id, imagem: await logoEmJpeg(src) });
  ljLogo = r.url; desenharLogo();
}
$('ljArquivo').onchange = async e => {
  const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
  const url = URL.createObjectURL(arq);
  try { $('ljLogoImg').textContent = 'Enviando…'; await guardarLogo(url); toast('Logo enviada. Salve a identidade para usar no PDF.'); }
  catch (err) { desenharLogo(); toast(err.message, true); }
  finally { URL.revokeObjectURL(url); }
};
$('ljTiraLogo').onclick = () => { ljLogo = ''; desenharLogo(); };
$('ljPuxar').onclick = async () => {
  const site = $('ljSite').value.trim(); if (!site) { toast('Escreva o endereço do site.', true); $('ljSite').focus(); return; }
  const bt = $('ljPuxar'); bt.disabled = true; $('ljPuxarInfo').textContent = 'Lendo o site…';
  try {
    const r = await api('loja-site?url=' + encodeURIComponent(site));
    const achou = [];
    for (const [k, id] of Object.entries(LJ)) if (r[k]) { $(id).value = r[k]; if (k !== 'site') achou.push(k); }
    if (r.cor) { $('ljCor').value = r.cor; $('ljCorTxt').textContent = r.cor; achou.push('cor'); }
    if (r.logo) {
      $('ljPuxarInfo').textContent = 'Baixando a logo…';
      try { const l = await api('loja-site-logo?url=' + encodeURIComponent(r.logo)); await guardarLogo(l.imagem); achou.push('logo'); }
      catch { /* sem logo do site: o dono envia à mão */ }
    }
    const nomes = { nome: 'nome', cnpj: 'CNPJ', telefone: 'telefone', whatsapp: 'WhatsApp', email: 'e-mail', endereco: 'endereço', instagram: 'Instagram', cor: 'cor', logo: 'logo', razao: 'razão social' };
    $('ljPuxarInfo').textContent = achou.length ? 'Achei: ' + achou.map(k => nomes[k]).join(', ') + '. Confira e salve.' : 'Não achei os dados nesse site. Preencha à mão.';
  } catch (err) { $('ljPuxarInfo').textContent = err.message; }
  finally { bt.disabled = false; }
};
$('formLoja').onsubmit = async e => {
  e.preventDefault();
  const loja = Object.fromEntries(Object.entries(LJ).map(([k, id]) => [k, $(id).value.trim()]));
  loja.cor = $('ljCor').value; loja.logo = ljLogo;
  if (loja.cnpj && loja.cnpj.replace(/\D/g, '').length !== 14) return toast('Confira o CNPJ: são 14 números.', true);
  try { await salvarCfg({ loja }); toast('Identidade da loja salva. Já vai no próximo convite em PDF.'); }
  catch (err) { toast(err.message, true); }
};
$('formSenha').onsubmit = async e => {
  e.preventDefault();
  try { await api('password', { password: $('nsSenha').value }); $('nsSenha').value = ''; toast('Senha trocada.'); }
  catch (err) { toast(err.message, true); }
};

/* ═══════════ USUÁRIOS DO PAINEL ═══════════ */
// Quem entra no painel de cada empresa. A mesma lista serve a Minha conta (dono e admin) e o Gerenciar do Super Admin;
// o banco decide quem pode o quê. Senha nenhuma passa pela tela: a pessoa cria a dela pelo código de "Esqueci minha senha".
const PAPEL_NOME = { owner: 'Dono', admin: 'Admin', member: 'Membro' };
const COMO_ENTRA = 'Ela entra em ia.leadvox.com.br, clica em Esqueci minha senha → Já recebi o código, digita o e-mail e o código e cria a senha. Se o código vencer, é só pedir outro ali.';
async function carregarUsuarios(box, org, superAdmin) {
  box.innerHTML = '<p class="muted">Carregando os usuários…</p>'; box.dataset.org = org;
  let d; try { d = await api('usuarios-painel?organization=' + encodeURIComponent(org)); }
  catch (err) { if (box.dataset.org === org) box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  if (box.dataset.org === org) desenharUsuarios(box, org, d, superAdmin); // trocou de empresa no meio: não mistura as listas
}
function desenharUsuarios(box, org, d, superAdmin) {
  const g = d.gestor, lista = d.usuarios || [], pre = superAdmin ? 'usuA' : 'usuC';
  const mexeDono = g === 'plataforma' || g === 'owner';
  const opcoes = sel => Object.entries(PAPEL_NOME).filter(([p]) => mexeDono || p !== 'owner' || p === sel)
    .map(([p, n]) => `<option value="${p}"${p === sel ? ' selected' : ''}>${n}</option>`).join('');
  // o dono principal não muda; ninguém mexe no próprio acesso (só o Super Admin); o admin não mexe em dono
  const editavel = u => !u.principal && (g === 'plataforma' || u.id !== d.eu) && (mexeDono || u.papel !== 'owner');
  box.innerHTML = `${lista.length ? `<div class="rolo"><table class="lv-tabela usu-tabela"><thead><tr><th>E-mail de login</th><th>Função</th><th>Último acesso</th><th></th></tr></thead><tbody>
    ${lista.map(u => `<tr data-usu="${esc(u.id)}"><td><b>${esc(u.email)}</b>${u.principal ? ' <span class="st on">dono principal</span>' : ''}${u.suporte ? ' <span class="st">suporte LeadVox</span>' : ''}${u.id === d.eu ? ' <span class="st">você</span>' : ''}</td>
      <td>${editavel(u) ? `<select class="sm-sel" data-usu-papel aria-label="Função de ${esc(u.email)}">${opcoes(u.papel)}</select>` : esc(PAPEL_NOME[u.papel] || u.papel)}</td>
      <td>${u.ultimoAcesso ? 'há ' + quando(u.ultimoAcesso) : '<span class="muted">ainda não entrou</span>'}</td>
      <td><div class="bts">${superAdmin && !u.suporte ? '<button class="sm" type="button" data-usu-acao="email">Trocar e-mail</button>' : ''}
        ${superAdmin || !u.suporte ? '<button class="sm" type="button" data-usu-acao="senha">Redefinir senha</button>' : ''}
        ${editavel(u) ? '<button class="sm perigo" type="button" data-usu-acao="remover">Remover</button>' : ''}</div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ninguém entra no painel desta empresa ainda.</p>'}
    <form class="usu-email" data-usu-email-form hidden>
      <p><b>Trocar o e-mail de login</b> de <span data-usu-email-de></span></p>
      <div class="duas" style="align-items:end"><div><label for="${pre}NovoEmail">E-mail novo</label><input id="${pre}NovoEmail" type="email" maxlength="254" required autocomplete="off"></div>
        <label class="check-lin"><input type="checkbox" id="${pre}Avisar" checked> Mandar o código para criar a senha no e-mail novo</label></div>
      <div class="form-bts"><button class="principal sm" type="submit">Trocar e-mail</button><button class="sm" type="button" data-usu-email-cancelar>Cancelar</button></div>
    </form>
    <form class="usu-novo" data-usu-novo>
      <h3>${superAdmin ? 'Cadastrar usuário nesta empresa' : 'Convidar alguém'}</h3>
      <div class="duas" style="align-items:end">
        <div><label for="${pre}Email">E-mail da pessoa</label><input id="${pre}Email" type="email" maxlength="254" required autocomplete="off" placeholder="nome@sualoja.com.br"></div>
        <div><label for="${pre}Papel">Função</label><select id="${pre}Papel">${opcoes('member')}</select></div>
      </div>
      <div class="form-bts"><button class="principal sm" type="submit">${superAdmin ? 'Cadastrar' : 'Convidar'}</button></div>
      <p class="muted usu-dica"><b>Admin</b> muda tudo no painel, inclusive os usuários. <b>Membro</b> vê o painel, sem mudar as configurações.${mexeDono ? ' <b>Dono</b> é como o admin e também mexe em outros donos.' : ''}
        Quem ainda não tem login recebe por e-mail um código para criar a senha.</p>
    </form>`;
  const recarregar = () => carregarUsuarios(box, org, superAdmin);
  // o resultado fica escrito em cima da lista (tem o passo a passo para passar à pessoa), não só no aviso que some
  const fazer = async (corpo, ok, bt) => {
    if (bt) bt.disabled = true;
    let msg = '', erro = false;
    try { const r = await api('usuarios-painel', { organization: org, ...corpo }); msg = typeof ok === 'function' ? ok(r) : ok; toast('Pronto.'); }
    catch (err) { msg = err.message; erro = true; toast(err.message, true); }
    await recarregar();
    box.insertAdjacentHTML('afterbegin', `<p class="${erro ? 'erro' : 'ok-msg'} usu-nota" role="status">${esc(msg)}</p>`);
  };
  const linha = el => { const id = el.closest('[data-usu]')?.dataset.usu; return { id, u: lista.find(x => x.id === id) }; };
  box.querySelectorAll('[data-usu-papel]').forEach(s => s.onchange = () => {
    const { id, u } = linha(s);
    fazer({ acao: 'papel', alvo: id, papel: s.value }, `${u.email} agora é ${PAPEL_NOME[s.value]}.`, s);
  });
  const fEmail = box.querySelector('[data-usu-email-form]');
  box.querySelectorAll('[data-usu-acao]').forEach(b => b.onclick = () => {
    const { id, u } = linha(b), acao = b.dataset.usuAcao;
    if (acao === 'remover') {
      if (!confirm(`Tirar ${u.email} do painel de ${superAdmin ? (emAtual?.nome || 'esta empresa') : 'sua empresa'}? O login continua existindo, mas não entra mais nesta empresa.`)) return;
      return fazer({ acao, alvo: id }, `${u.email} não entra mais nesta empresa.`, b);
    }
    if (acao === 'senha') {
      if (!confirm(`Mandar para ${u.email} o código para criar uma senha nova? A senha atual continua valendo até a pessoa trocar.`)) return;
      return fazer({ acao, alvo: id }, `Código enviado para ${u.email}. ${COMO_ENTRA}`, b);
    }
    fEmail.dataset.alvo = id; fEmail.querySelector('[data-usu-email-de]').textContent = u.email;
    fEmail.hidden = false; $(pre + 'NovoEmail').value = ''; $(pre + 'NovoEmail').focus();
  });
  if (fEmail) {
    fEmail.querySelector('[data-usu-email-cancelar]').onclick = () => { fEmail.hidden = true; };
    fEmail.onsubmit = e => {
      e.preventDefault();
      const novo = $(pre + 'NovoEmail').value.trim(), avisar = $(pre + 'Avisar').checked;
      fazer({ acao: 'email', alvo: fEmail.dataset.alvo, email: novo, avisar },
        r => `Login trocado para ${r.email}.` + (avisar ? (r.emailEnviado ? ' O código para criar a senha foi para o e-mail novo.' : ' Não deu para mandar o código agora: use Redefinir senha.') : ' A senha continua a mesma.'),
        e.submitter);
    };
  }
  box.querySelector('[data-usu-novo]').onsubmit = e => {
    e.preventDefault();
    const email = $(pre + 'Email').value.trim(), papel = $(pre + 'Papel').value;
    fazer({ acao: 'convidar', email, papel },
      r => r.novo ? `Login criado para ${r.email} (${PAPEL_NOME[papel]}).` + (r.emailEnviado ? ' ' + COMO_ENTRA : ' O e-mail com o código não saiu agora: use Redefinir senha daqui a pouco.')
        : `${r.email} já tinha login e agora entra nesta empresa como ${PAPEL_NOME[papel]}, com a mesma senha de sempre.`,
      e.submitter);
  };
}
// Minha conta: só o dono e o admin veem (o Super Admin em suporte também).
function carregarUsuariosConta() {
  const pode = ['owner', 'admin'].includes(empresa?.role) || !!conta?.platformAdmin;
  $('usuCard').hidden = !pode;
  if (pode) carregarUsuarios($('usuConta'), empresa.id, false);
}

/* ═══════════ SUPER ADMIN (dono da plataforma) ═══════════ */
// Assinaturas, quem precisa de atenção, consumo de IA, ações de cobrança e acesso de suporte.
let lv = [], lvAsaas = {};
const SIT = { teste: ['Em teste', 'on'], expirado: ['Teste acabou', 'perdida'], aguardando: ['Aguardando pagamento', 'rascunho'], ativa: ['Ativa', 'on'],
  atrasada: ['Atrasada', 'perdida'], suspensa: ['IA pausada', 'perdida'], cancelada: ['Cancelada', 'perdida'], cortesia: ['Cortesia', 'on'] };
const AVISO_NOME = { 'teste-3': 'Teste acaba em 3 dias', 'teste-1': 'Teste acaba amanhã', 'teste-0': 'Teste acaba hoje', 'teste-acabou': 'Teste acabou',
  'teste-pausada': 'IA pausada (teste acabou)', 'carrinho-1h': 'Resgate: 1 hora', 'carrinho-1d': 'Resgate: 1 dia', 'carrinho-3d': 'Resgate: 3 dias',
  fatura: 'Fatura criada', 'vence-amanha': 'Fatura vence amanhã', pago: 'Pagamento confirmado', 'atraso-1': 'Atraso de 1 dia', 'atraso-3': 'Atraso de 3 dias',
  suspensa: 'IA suspensa', lembrete: 'Lembrete enviado por você' };
const quando = iso => { if (!iso) return '—'; const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; };
const usd = v => Number(v || 0) ? 'US$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

async function carregarLv() {
  const d = await api('admin-empresas');
  lv = d.empresas || []; lvAsaas = d.asaas || {};
  desenharLv(); desenharAsaas();
  carregarConsumo().catch(err => { $('lvConsumo').innerHTML = `<p class="muted">${esc(err.message)}</p>`; });
  carregarRastreioLista();
  carregarDominiosAdmin();
}
// Módulo "Rastreamento de anúncios": quem tem, quantas contas de anúncio, leads e vendas em 30 dias e a mensalidade
// (R$ 99 com 1 conta + R$ 39 por conta a mais). Some sem erro se o banco ainda não tiver rastreio_contas.sql.
const RASTREIO_PRECO = 99, RASTREIO_CONTA = 39;
async function carregarRastreioLista() {
  const box = $('lvRastreio'); if (!box) return;
  let d; try { d = await api('admin-rastreio-lista'); } catch { box.hidden = true; return; }
  const lista = d.empresas || [];
  box.hidden = !lista.length;
  const preco = e => RASTREIO_PRECO + RASTREIO_CONTA * Math.max(0, (Number(e.contas) || 1) - 1);
  const total = lista.reduce((t, e) => t + preco(e), 0);
  $('lvRastreioResumo').textContent = `${lista.length} cliente(s) com o módulo · ${dinheiro(total * 100)} por mês pela tabela (R$ ${RASTREIO_PRECO} + R$ ${RASTREIO_CONTA} por conta de anúncio a mais).`;
  $('lvRastreioLista').innerHTML = `<div class="rolo"><table class="lv-tabela"><thead><tr><th>Empresa</th><th>Situação</th><th class="num">Contas</th><th class="num">Leads 30d</th><th class="num">Vendas 30d</th><th class="num">Valor vendido</th><th class="num">Mensalidade</th><th>Último evento</th><th></th></tr></thead><tbody>
    ${lista.map(e => {
      const s = !e.ativo ? ['rascunho', 'Liberado, falta ligar'] : e.erros7 ? ['perdida', e.erros7 + ' envio(s) com erro'] : ['on', 'Ligado'];
      return `<tr><td><b>${esc(e.nome)}</b></td><td><span class="st ${s[0]}">${esc(s[1])}</span></td><td class="num">${e.contas || '—'}</td><td class="num">${e.leads30 || 0}</td>
        <td class="num">${e.vendas30 || 0}</td><td class="num">${rsReais(e.valor30)}</td><td class="num">${dinheiro(preco(e) * 100)}</td><td>${quando(e.ultimoEvento)}</td>
        <td><button class="sm" type="button" data-em-abrir="${esc(e.id)}">Gerenciar</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function alertasDe(e) {
  const a = [], c = e.cobranca || {}, agora = Date.now(), u = e.uso7 || {};
  const semEvento = e.ultimoEvento ? (agora - Date.parse(e.ultimoEvento)) / 864e5 : null;
  if (c.status === 'suspensa') a.push(['bad', 'IA pausada por falta de pagamento']);
  if (c.status === 'atrasada') a.push(['bad', 'Fatura atrasada desde ' + dataBR(c.atrasadaDesde)]);
  if (c.status === 'expirado') a.push(['bad', 'O teste acabou e não assinou']);
  if (c.status === 'teste' && c.diasTeste <= 2) a.push(['warn', c.diasTeste === 0 ? 'O teste acaba hoje' : 'O teste acaba em ' + c.diasTeste + (c.diasTeste === 1 ? ' dia' : ' dias')]);
  if (c.status === 'aguardando') a.push(['warn', 'Clicou em Assinar e ainda não pagou']);
  if (e.ultimoEnvio && e.ultimoEnvio.ok === false) a.push(['bad', 'A LeadVox recusou o último envio da IA']);
  if (e.agentesAtivos > 0 && semEvento !== null && semEvento > 2) a.push(['warn', 'Sem mensagens da LeadVox há ' + Math.floor(semEvento) + ' dias']);
  if (e.agentesAtivos > 0 && semEvento !== null && semEvento < 7 && !u.respostas) a.push(['warn', 'Recebe conversas, mas a IA não respondeu em 7 dias (confira o departamento e o modo de teste)']);
  if (e.montado && e.conta && !e.agentesAtivos) a.push(['info', 'Nenhum agente ligado']);
  if (e.bloqueado && !e.bloqueioCobranca) a.push(['warn', 'IA bloqueada à mão']);
  if (e.suporte) a.push(['info', 'Acesso de suporte aberto até ' + new Date(e.suporte.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })]);
  return a;
}
function desenharLv() {
  const por = s => lv.filter(e => (e.cobranca || {}).status === s).length;
  const mrr = lv.filter(e => ['ativa', 'atrasada'].includes((e.cobranca || {}).status)).reduce((t, e) => t + (Number(e.cobranca.valorCents) || 0), 0);
  $('lvNumeros').innerHTML = `<div><b>${dinheiro(mrr)}</b><small>por mês em assinaturas</small></div><div><b>${por('ativa')}</b><small>ativas</small></div>
    <div><b>${por('teste')}</b><small>em teste</small></div><div><b>${por('aguardando')}</b><small>aguardando pagamento</small></div>
    <div><b>${por('atrasada') + por('suspensa')}</b><small>atrasadas ou pausadas</small></div><div><b>${por('expirado')}</b><small>teste acabou sem assinar</small></div>`;
  const todos = lv.flatMap(e => alertasDe(e).map(([t, m]) => ({ t, m, e }))).sort((x, y) => ({ bad: 0, warn: 1, info: 2 })[x.t] - ({ bad: 0, warn: 1, info: 2 })[y.t]);
  $('lvNAlertas').textContent = '(' + todos.filter(a => a.t !== 'info').length + ')';
  $('lvAlertas').innerHTML = todos.length ? todos.map(a => `<button type="button" class="${a.t}" data-em-abrir="${esc(a.e.id)}"><span>${a.t === 'bad' ? '🔴' : a.t === 'warn' ? '🟡' : 'ℹ️'} ${esc(a.m)}</span><small class="muted">${esc(a.e.nome)}</small></button>`).join('')
    : '<p class="muted">Nada pedindo atenção agora.</p>';
  desenharLvLista();
}
function desenharLvLista() {
  const busca = ($('lvBusca').value || '').trim().toLowerCase();
  const lista = lv.filter(e => !busca || (e.nome + ' ' + (e.email || '')).toLowerCase().includes(busca));
  $('lvLista').innerHTML = lista.length ? `<div class="rolo"><table class="lv-tabela"><thead><tr><th>Empresa</th><th>Situação</th><th>Plano</th>
    <th class="num">Conversas 7d</th><th class="num">Respostas 7d</th><th>Última mensagem</th><th class="num">Custo IA 30d</th><th></th></tr></thead><tbody>${lista.map(e => {
      const c = e.cobranca || {}, s = SIT[c.status] || [c.status, ''], u = e.uso7 || {};
      const extra = c.status === 'teste' ? ' · ' + c.diasTeste + 'd' : '';
      return `<tr><td><b>${esc(e.nome)}</b><br><small class="muted">${esc(e.email || '')}</small></td><td><span class="st ${s[1]}">${esc(s[0] + extra)}</span>${e.suporte ? ' <span class="st">suporte</span>' : ''}</td>
        <td>${esc(c.planoNome || '—')}</td><td class="num">${u.conversas || 0}</td><td class="num">${u.respostas || 0}</td><td>${quando(e.ultimoEvento)}</td><td class="num">${usd(e.usd30)}</td>
        <td><button class="sm" type="button" data-em-abrir="${esc(e.id)}">Gerenciar</button></td></tr>`; }).join('')}</tbody></table></div>`
    : '<p class="muted" style="padding:16px 0">Nenhuma empresa.</p>';
}
$('lvBusca').oninput = desenharLvLista;
$('lvAtualizar').onclick = () => carregarLv().then(() => toast('Atualizado.')).catch(err => toast(err.message, true));
$('lvPeriodo').onchange = () => carregarConsumo().catch(err => toast(err.message, true));
document.addEventListener('click', ev => { const b = ev.target.closest('[data-em-abrir]'); if (b) abrirEmpresa(b.dataset.emAbrir); });

// Consumo: respostas da IA por dia (relatório do motor) e custo medido quando a empresa usa a própria chave OpenAI.
async function carregarConsumo() {
  const dias = Number($('lvPeriodo').value) || 30, br = d => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const fim = br(new Date()), ini = br(new Date(Date.now() - (dias - 1) * 864e5));
  const d = await api('admin-consumo?ini=' + ini + '&fim=' + fim), linhas = d.dias || [];
  const porDia = {}, porOrg = {};
  for (let i = 0; i < dias; i++) porDia[br(new Date(Date.parse(ini + 'T15:00:00Z') + i * 864e5))] = 0;
  for (const l of linhas) { porDia[l.dia] = (porDia[l.dia] || 0) + (Number(l.respostas) || 0);
    const o = porOrg[l.org] ||= { respostas: 0, conversas: 0, usd: 0 }; o.respostas += Number(l.respostas) || 0; o.conversas += Number(l.conversas) || 0; o.usd += Number(l.usd) || 0; }
  const serie = Object.entries(porDia).sort(), max = Math.max(1, ...serie.map(s => s[1])), W = 600, H = 150, base = 128, larg = W / serie.length;
  const barras = serie.map(([dia, v], i) => { const h = Math.round(v / max * 108); return `<rect x="${(i * larg + larg * .15).toFixed(1)}" y="${base - h}" width="${(larg * .7).toFixed(1)}" height="${h}" rx="2" fill="var(--verde)"><title>${dataBR(dia)}: ${v} respostas</title></rect>`; }).join('');
  const total = serie.reduce((t, s) => t + s[1], 0), nome = id => (lv.find(e => e.id === id) || {}).nome || 'Empresa';
  const tabela = Object.entries(porOrg).sort((a, b) => b[1].respostas - a[1].respostas).map(([id, o]) => `<tr><td>${esc(nome(id))}</td><td class="num">${o.conversas}</td><td class="num">${o.respostas}</td><td class="num">${usd(o.usd)}</td></tr>`).join('');
  $('lvConsumo').innerHTML = `<p class="muted" style="font-size:13px;margin:0">${total.toLocaleString('pt-BR')} respostas da IA em ${dias} dias · pico de ${max.toLocaleString('pt-BR')} num dia</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Respostas da IA por dia"><line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--linha)"/>${barras}
      <text x="0" y="${H - 4}" fill="var(--suave)" font-size="11">${dataBR(serie[0][0])}</text><text x="${W}" y="${H - 4}" fill="var(--suave)" font-size="11" text-anchor="end">${dataBR(serie[serie.length - 1][0])}</text>
      <text x="0" y="12" fill="var(--suave)" font-size="11">${max}</text></svg>
    ${tabela ? `<div class="rolo"><table><thead><tr><th>Empresa</th><th class="num">Conversas</th><th class="num">Respostas</th><th class="num">Custo medido</th></tr></thead><tbody>${tabela}</tbody></table></div>` : ''}
    <p class="muted" style="font-size:12px">O custo medido aparece quando a empresa usa a própria chave OpenAI (Credenciais de API). Valores estimados em dólar, sem impostos.</p>`;
}

function desenharAsaas() {
  const a = lvAsaas || {};
  $('lvAsaasStatus').innerHTML = a.conectado
    ? `<span class="st on">Conectado · ${a.ambiente === 'production' ? 'produção' : 'teste (sandbox)'}</span> ${a.retorno ? 'O retorno de pagamentos está ligado.' : 'Falta ligar o retorno de pagamentos.'} Para trocar, conecte de novo.`
    : 'Conecte a conta do Asaas que recebe as assinaturas. A chave fica guardada no cofre e não volta para a tela.';
  if (a.ambiente) $('lvAsaasAmb').value = a.ambiente;
}
$('lvAsaasForm').onsubmit = async e => {
  e.preventDefault();
  const bt = e.submitter || e.target.querySelector('button'); bt.disabled = true;
  try { lvAsaas = await api('admin-asaas', { ambiente: $('lvAsaasAmb').value, chave: $('lvAsaasChave').value }); $('lvAsaasChave').value = ''; desenharAsaas(); toast('Asaas conectado. O retorno de pagamentos foi criado no Asaas.'); }
  catch (err) { toast(err.message, true); } finally { bt.disabled = false; }
};

let emAtual = null;
function abrirEmpresa(id) {
  const e = lv.find(x => x.id === id); if (!e) return;
  emAtual = e; const c = e.cobranca || {}, s = SIT[c.status] || [c.status, ''], u = e.uso7 || {};
  $('emTitulo').textContent = e.nome;
  $('emExcluirNome').value = ''; $('emExcluir').disabled = true; document.querySelector('.em-excluir').open = false;
  const it = (r, v) => v ? `<div><span>${r}</span>${v}</div>` : '';
  $('emResumo').innerHTML = `<p><span class="st ${s[1]}">${esc(s[0])}</span></p><div class="ag-dados" style="margin-top:8px">
    ${it('Plano', c.planoNome ? esc(c.planoNome) + ' · ' + dinheiro(c.valorCents) + '/mês' : '')}${it('Pagamento', esc(FORMA_NOME[c.forma] || ''))}
    ${it('Teste até', c.testeAte ? new Date(c.testeAte).toLocaleDateString('pt-BR') : '')}${it('Próxima fatura', c.proximoVencimento ? dataBR(c.proximoVencimento) : '')}
    ${it('Atrasada desde', c.atrasadaDesde ? dataBR(c.atrasadaDesde) : '')}${it('Cortesia', c.status === 'cortesia' ? (c.cortesiaAte ? 'até ' + dataBR(c.cortesiaAte) : 'sem prazo') : '')}
    ${it('E-mail', esc(e.email || ''))}${it('WhatsApp', esc(zapFmt(e.whatsapp || '')))}${it('Conta do motor', esc(e.conta || 'não vinculada'))}
    ${it('Agentes', e.agentes ? e.agentesAtivos + ' ligado(s) de ' + e.agentes : '')}${it('Últimos 7 dias', u.conversas + ' conversas · ' + u.respostas + ' respostas · ' + u.transferidos + ' para a equipe')}
    ${it('Última mensagem', e.ultimoEvento ? quando(e.ultimoEvento) + ' atrás' : '')}${it('Custo IA 30 dias', usd(e.usd30))}
    ${c.link ? it('Link de pagamento', `<a href="${esc(c.link)}" target="_blank" rel="noopener">abrir ↗</a>`) : ''}</div>
    ${alertasDe(e).map(([t, m]) => `<div class="saude ${t === 'bad' ? '' : 'aviso'}" style="margin:10px 0 0"><span>${t === 'bad' ? '🔴' : t === 'warn' ? '🟡' : 'ℹ️'}</span><div><b>${esc(m)}</b></div></div>`).join('')}`;
  $('emPlano').value = c.plano || 'ia'; $('emObs').value = e.obs || ''; $('emCortesia').value = '';
  $('emAvisos').innerHTML = (e.avisos || []).length ? `<h3 style="margin-top:16px">Avisos enviados</h3><div class="rolo"><table class="lv-tabela"><tbody>${e.avisos.map(v =>
    `<tr><td>${esc(AVISO_NOME[v.tipo] || v.tipo)}</td><td>${esc({ enviado: 'Enviado', pendente: 'Na fila', enviando: 'Enviando', falhou: 'Falhou', sem_contato: 'Sem WhatsApp' }[v.status] || v.status)}</td><td>${new Date(v.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('')}</tbody></table></div>` : '';
  carregarRobos(e); carregarRastreioAdmin(e); carregarUsuarios($('emUsuariosLista'), e.id, true);
  if (!$('dlgEmpresa').open) $('dlgEmpresa').showModal();
}

// Robôs da empresa: ver o que está ligado e o que falta, ligar/pausar e, para editar ou testar,
// abrir o acesso de suporte (4 h, registrado) e cair direto no robô, sem chave.
let robos = null;
async function carregarRobos(e) {
  const box = $('emRobos'); robos = null;
  box.innerHTML = '<h3 id="emRobosTitulo">Robôs</h3><p class="muted">Carregando os robôs…</p>';
  try { robos = await api('admin-robos?organization=' + encodeURIComponent(e.id)); }
  catch (err) { box.innerHTML = `<h3 id="emRobosTitulo">Robôs</h3><p class="muted">${esc(err.message)}</p>`; return; }
  if (emAtual?.id === e.id) desenharRobos(e);
}
function faltasDoRobo(r) {
  const f = [];
  if (!r.configurado) f.push('identidade não salva');
  if (!r.descricao) f.push('sem descrição da empresa');
  if (!r.faq) f.push('sem perguntas frequentes');
  if (r.modoTeste && !r.numerosTeste) f.push('modo teste sem números');
  return f;
}
function desenharRobos(e) {
  const d = robos || {}, lista = d.robos || [];
  const topo = !d.vinculado ? '<span class="st rascunho">IA ainda não ligada ao motor</span>'
    : d.whatsapp ? `<span class="st on">WhatsApp ligado</span> <small class="muted">sessão ${esc(d.sessao)}${d.itens ? ' · ' + d.itens + ' itens no catálogo' : ''}</small>`
    : '<span class="st rascunho">Sem WhatsApp</span>';
  $('emRobos').innerHTML = `<div class="lista-topo"><div><h3 id="emRobosTitulo">Robôs</h3><p class="muted" style="margin-top:4px">${topo}</p></div>
      ${e.suporte ? '<span class="st">suporte aberto</span>' : ''}</div>
    ${lista.map(r => {
      const f = faltasDoRobo(r);
      return `<div class="item"><div><b>${esc(r.nome || 'Robô sem nome')}${r.entrada ? ' <span class="st">porta de entrada</span>' : ''}${r.modoTeste ? ` <span class="st rascunho">modo teste · ${r.numerosTeste} nº</span>` : ''}</b>
        <small>${esc(r.tipoNome || r.tipo)} · versão ${esc(r.versao)}${r.atualizadoEm ? ' · mexido há ' + quando(r.atualizadoEm) : ''}</small>
        ${f.length ? `<small style="color:var(--amarelo)">Falta: ${esc(f.join(', '))}</small>` : ''}</div>
        <div class="bts"><span class="liga"><button type="button" class="switch" role="switch" aria-checked="${!!r.ativo}" data-robo-liga="${esc(r.chave)}" aria-label="${esc(r.nome || 'Robô')} ligado"><span></span></button><b class="${r.ativo ? 'on' : ''}">${r.ativo ? 'Ligado' : 'Pausado'}</b></span>
          <button type="button" class="principal sm" data-robo-ir="${esc(r.chave)}" data-aba="identidade">Editar</button><button type="button" class="sm" data-robo-ir="${esc(r.chave)}" data-aba="testar">Testar a IA</button></div></div>`;
    }).join('') || `<p class="muted" style="padding:8px 0">${d.vinculado ? 'Nenhum robô criado ainda.' : 'O cliente ainda não ligou a IA. Entre como suporte para ligar e criar o primeiro robô.'}</p>`}`;
  document.querySelectorAll('[data-robo-liga]').forEach(b => b.onclick = () => ligarRobo(e, b.dataset.roboLiga, b));
  document.querySelectorAll('[data-robo-ir]').forEach(b => b.onclick = () => irParaRobo(e, b.dataset.roboIr, b.dataset.aba, b));
}
async function ligarRobo(e, chave, bt) {
  const r = (robos?.robos || []).find(x => x.chave === chave); if (!r) return;
  const ligar = !r.ativo, nome = r.nome || 'O robô';
  if (!ligar && !confirm(`Pausar ${nome} de ${e.nome}? Ele para de responder os clientes no WhatsApp até ligar de novo.`)) return;
  bt.disabled = true;
  try { robos = await api('admin-robo-ativo', { organization: e.id, agente: chave, ativo: ligar }); toast(ligar ? `${nome} ligado.` : `${nome} pausado.`); desenharRobos(e); }
  catch (err) { toast(err.message, true); bt.disabled = false; }
}
async function irParaRobo(e, chave, aba, bt) {
  const r = (robos?.robos || []).find(x => x.chave === chave);
  bt.disabled = true;
  try {
    if (!e.suporte) await api('admin-suporte', { organization: e.id, horas: 4, motivo: 'Ajustar o robô ' + (r?.nome || chave) });
  } catch (err) { bt.disabled = false; return toast(err.message, true); }
  try { localStorage.setItem('lv_empresa', e.id); sessionStorage.setItem('lv_ir_robo', JSON.stringify({ org: e.id, chave, aba })); } catch {}
  marcarSuporte(e.id, true);
  history.replaceState(null, '', '#agentes');
  $('dlgEmpresa').close(); toast('Abrindo ' + (r?.nome || 'o robô') + ' de ' + e.nome + '…');
  carregar().catch(err => toast(err.message, true));
}
// Chegou pelo "Editar" / "Testar a IA" do Super Admin: abre aquele robô na aba pedida (uma vez).
function roboPedido() {
  let p = null; try { p = JSON.parse(sessionStorage.getItem('lv_ir_robo') || 'null'); } catch {}
  if (!p || p.org !== empresa?.id) return null;
  try { sessionStorage.removeItem('lv_ir_robo'); } catch {}
  return p;
}
document.querySelectorAll('[data-em]').forEach(b => b.onclick = async () => {
  const e = emAtual; if (!e) return;
  const acao = b.dataset.em;
  if (acao === 'suspender' && !confirm('Pausar a IA de ' + e.nome + '? Ela para de atender até reativar ou até o pagamento cair.')) return;
  b.disabled = true;
  try {
    if (acao === 'suporte') {
      await api('admin-suporte', { organization: e.id, horas: Number($('emHoras').value), motivo: $('emMotivo').value.trim() });
      try { localStorage.setItem('lv_empresa', e.id); } catch {}
      marcarSuporte(e.id, true);
      $('dlgEmpresa').close(); toast('Entrando no painel de ' + e.nome + '…'); return carregar();
    }
    if (acao === 'suporte-fim') { await api('admin-suporte', { organization: e.id, encerrar: true }); marcarSuporte(e.id, false); toast('Suporte encerrado.'); }
    else {
      const dados = acao === 'estender' ? { dias: Number(b.dataset.dias) } : acao === 'plano' ? { plano: $('emPlano').value } : acao === 'cortesia' ? { ate: $('emCortesia').value } : acao === 'obs' ? { texto: $('emObs').value } : {};
      await api('admin-acao', { organization: e.id, acao, dados });
      toast({ estender: 'Teste estendido.', plano: 'Plano trocado.', cortesia: 'Cortesia aplicada.', suspender: 'IA pausada.', reativar: 'Empresa reativada.', obs: 'Observação salva.', lembrete: 'Lembrete na fila de envio.' }[acao]);
    }
    await carregarLv(); abrirEmpresa(e.id);
  } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
});

// Excluir o cliente de vez: o botão só libera com o nome exato da empresa.
$('emExcluirNome').oninput = () => { $('emExcluir').disabled = !emAtual || $('emExcluirNome').value.trim() !== emAtual.nome.trim(); };
$('emExcluir').onclick = async () => {
  const e = emAtual; if (!e) return;
  $('emExcluir').disabled = true;
  try {
    await api('admin-excluir', { organization: e.id, confirma: $('emExcluirNome').value });
    try { if (localStorage.getItem('lv_empresa') === e.id) localStorage.removeItem('lv_empresa'); } catch {}
    $('dlgEmpresa').close(); toast(e.nome + ' foi excluída.');
    if (empresa?.id === e.id) return carregar();
    await carregarLv();
  } catch (err) { toast(err.message, true); $('emExcluir').disabled = false; }
};

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

/* ═══════════ RASTREAMENTO DE ANÚNCIOS (módulo extra) ═══════════
   Webhook próprio na LeadVox → função "rastreio" do Supabase: grava de qual anúncio veio o lead e avisa a Meta
   quando o card fica qualificado ou ganho. Aqui o dono configura e acompanha; o Super Admin libera o módulo. */
let rast = null, rastPeriodo = 30, rastRel = null, rastConta = null;
const rsReais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const EVENTO_QUALIF = { QualifiedLead: 'Lead qualificado (QualifiedLead)', Lead: 'Lead (Lead)', LeadSubmitted: 'Lead na conversa (LeadSubmitted)', Contact: 'Contato (Contact)',
  Schedule: 'Agendamento (Schedule)', SubmitApplication: 'Ficha enviada (SubmitApplication)', CompleteRegistration: 'Cadastro completo (CompleteRegistration)' };
async function carregarRastreio() {
  const el = $('rsConteudo'); el.innerHTML = '<div class="card"><p class="muted">Carregando…</p></div>'; rastRel = null; rsAbertos = null;
  try { rast = await api('rastreio?organization=' + encodeURIComponent(empresa.id)); }
  catch (err) { el.innerHTML = `<div class="card"><p class="alerta">${esc(err.message)}</p></div>`; return; }
  desenharRastreio();
  if (rast.liberado) { carregarRelatorioRastreio(); if (rast.podeEditar) carregarEtapasRastreio(); }
}
function desenharRastreio() {
  const el = $('rsConteudo'), r = rast || {};
  if (r.setupPending) { el.innerHTML = '<div class="card"><p class="alerta">O módulo ainda não foi instalado no banco (rastreio.sql).</p></div>'; return; }
  if (!r.liberado) {
    el.innerHTML = `<div class="card estreito"><h3>Saiba qual anúncio vende de verdade</h3>
      <p class="muted" style="margin-top:6px">A Meta conta conversas iniciadas. O rastreamento da LeadVox segue cada cliente que chegou por um anúncio de clique para WhatsApp até a venda.</p>
      <ul class="rs-lista"><li><b>Leads por anúncio:</b> quem mandou mensagem por cada anúncio, sem planilha.</li>
        <li><b>Vendas e valor por anúncio:</b> quando o card vai para Ganho, a venda fica ligada ao anúncio que trouxe o cliente.</li>
        <li><b>A Meta aprende com quem compra:</b> o lead qualificado e a compra voltam para o seu pixel, para as campanhas buscarem mais compradores.</li></ul>
      <p class="dica">É um módulo extra. Fale com a LeadVox para liberar na sua empresa.</p>
      <div class="form-bts"><button type="button" class="principal" id="rsQuero">Quero o rastreamento</button></div></div>`;
    $('rsQuero').onclick = () => (typeof abrirSuporte === 'function' ? abrirSuporte() : toast('Fale com a LeadVox pelo WhatsApp de suporte.'));
    return;
  }
  const ed = r.podeEditar, dis = ed ? '' : ' disabled', quando = r.ultimoEvento ? new Date(r.ultimoEvento).toLocaleString('pt-BR') : '';
  // Configuração em três linhas com status. O passo que falta vem aberto (amarelo); os prontos ficam fechados (verde).
  const ps = rsPassos(r);
  if (!rsAbertos) rsAbertos = new Set([1, 2, 3].filter(k => !ps[k][2]));
  const passo = (k, titulo, corpo) => { const ab = rsAbertos.has(k); return `<div class="rs-passo" data-rs-passo="${k}">
    <div class="rs-passo-topo"><b>${k}. ${titulo}</b><span class="st ${ps[k][0]}">${esc(ps[k][1])}</span>
      <button type="button" class="sm" data-rs-abrir="${k}" aria-expanded="${ab}">${ab ? 'Fechar' : 'Abrir'}</button></div>
    <div class="rs-passo-corpo"${ab ? '' : ' hidden'}>${corpo}</div></div>`; };
  el.innerHTML = `
    <div class="card"><div class="lista-topo"><div><h3>Rastreamento de anúncios</h3>
      <p class="muted" style="margin-top:4px">${r.ativo ? '<span class="st on">Ligado</span> registrando leads de anúncio e avisando a Meta' : '<span class="st rascunho">Desligado</span> ligue depois de configurar os 3 passos abaixo'}</p></div>
      ${ed ? `<span class="liga"><button type="button" class="switch grande" role="switch" aria-checked="${!!r.ativo}" id="rsAtivo" aria-label="Rastreamento ligado"><span></span></button></span>` : ''}</div>
    ${passo(1, 'Eventos da LeadVox', `<p class="muted">Crie na LeadVox uma API só para o rastreamento. Assim o rastreamento não mexe na API que a sua IA usa.</p>
      ${r.url ? `<div class="ev-url"><input id="rsUrl" readonly aria-label="Endereço do webhook do rastreamento" value="${esc(r.url)}"><button type="button" class="principal sm" id="rsCopiar">Copiar</button></div>` : '<p class="muted">Só o dono ou um admin vê o endereço.</p>'}
      <p class="muted" style="margin-top:8px;font-size:13px">${quando ? 'Último evento em ' + esc(quando) + '.' : 'Ainda não chegou nada por este endereço.'}</p>
      <ol class="passos-ev"><li>Na LeadVox, abra <b>Configurações → API</b> e crie uma <b>API nova</b> com o nome <b>Rastreamento LeadVox IA</b>, no mesmo canal de WhatsApp dos anúncios.</li>
        <li>No campo <b>Webhook</b>, cole o endereço acima.</li>
        <li>Marque os eventos de <b>mensagens</b> e de <b>oportunidades</b> e salve.</li>
        <li>Mande um "oi" para o WhatsApp da empresa: esta linha fica verde, com <b>✓ Recebendo</b>.</li></ol>
      <p class="muted" style="font-size:12.5px;margin-top:6px">O endereço é só da sua empresa. Não compartilhe fora da LeadVox.</p>`)}
    ${passo(2, 'Pixel da Meta', `<form id="rsMeta"><p class="muted">No Gerenciador de Eventos: escolha o pixel → <b>Configurações</b> → <b>API de Conversões</b> → <b>Gerar token de acesso</b>. O ID do pixel aparece no topo da mesma tela.</p>
      <div class="duas"><div><label for="rsPixel">ID do pixel (conjunto de dados)</label><input id="rsPixel" inputmode="numeric" maxlength="20" placeholder="123456789012345" value="${esc(r.pixelId || '')}"${dis}></div>
        <div><label for="rsToken">Token da API de Conversões</label><input id="rsToken" type="password" autocomplete="off" spellcheck="false" maxlength="1000" placeholder="${r.temToken ? 'Salvo. Deixe em branco para manter.' : 'EAAG…'}"${dis}></div></div>
      <label for="rsTeste">Código de teste <small>(opcional: aba Eventos de teste, ex.: TEST12345)</small></label><input id="rsTeste" maxlength="40" value="${esc(r.testeCodigo || '')}"${dis}>
      <details class="rs-avancado"${r.temTokenAnuncios ? '' : ' open'}><summary>Conta de anúncio e campanha de cada lead ${r.temTokenAnuncios ? '<span class="st on">conectado</span>' : '<small>(recomendado)</small>'}</summary>
        <p class="muted" style="margin-top:6px">O WhatsApp só informa o anúncio. Com este token o painel mostra a conta de anúncio, a campanha e o conjunto, e separa os resultados por conta.</p>
        <ol class="passos-ev"><li>Configurações do negócio → <b>Usuários do sistema</b> → escolha ou crie um usuário (função Administrador).</li>
          <li><b>Atribuir ativos</b> → marque as contas de anúncio (ver desempenho).</li>
          <li><b>Gerar token</b> → permissão <b>ads_read</b> → validade <b>Nunca</b> → copie e cole aqui.</li></ol>
        <label for="rsTokenAds">Token de leitura de anúncios</label><input id="rsTokenAds" type="password" autocomplete="off" spellcheck="false" maxlength="1000" placeholder="${r.temTokenAnuncios ? 'Salvo. Deixe em branco para manter.' : 'EAAG…'}"${dis}></details>
      <details class="rs-avancado"${r.modo === 'whatsapp' ? ' open' : ''}><summary>Modo WhatsApp oficial (precisa do app da LeadVox aprovado pela Meta)</summary>
        <label for="rsModo">Como avisar a Meta</label><select id="rsModo"${dis}><option value="pixel">Pelo pixel, com o telefone do cliente (padrão)</option><option value="whatsapp"${r.modo === 'whatsapp' ? ' selected' : ''}>WhatsApp oficial, com o código do clique no anúncio</option></select>
        <div class="duas"><div><label for="rsWaba">ID da conta do WhatsApp Business</label><input id="rsWaba" inputmode="numeric" maxlength="20" value="${esc(r.wabaId || '')}"${dis}></div>
          <div><label for="rsPage">ID da página do Facebook</label><input id="rsPage" inputmode="numeric" maxlength="20" value="${esc(r.pageId || '')}"${dis}></div></div></details>
      ${ed ? '<div class="form-bts"><button class="principal" type="submit">Salvar</button><button type="button" id="rsEnviarTeste">Enviar teste</button></div>' : ''}
      <p class="dica">O token fica criptografado e não aparece de novo. O teste manda uma compra de R$ 1,00 marcada como teste: ela só aparece em Eventos de teste e não conta nas campanhas.</p></form>`)}
    ${passo(3, 'Quando avisar a Meta', `<form id="rsQuando">
      <label class="aceite"><input type="checkbox" id="rsCompra"${r.enviarCompra !== false ? ' checked' : ''}${dis}><span><b>Venda:</b> quando o card vai para <b>Ganho</b>, envia uma compra (Purchase) com o valor do card.</span></label>
      <p style="margin-top:12px"><b>Lead qualificado:</b> quando o card entra em uma destas etapas</p><div id="rsEtapas"><p class="muted">Carregando as etapas da LeadVox…</p></div>
      <label for="rsEvento">Evento enviado para o lead qualificado</label><select id="rsEvento"${dis}>${Object.entries(EVENTO_QUALIF).map(([k, n]) => `<option value="${k}"${k === (r.eventoQualificado || 'QualifiedLead') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${ed ? '<div class="form-bts"><button class="principal" type="submit">Salvar</button></div>' : ''}
      <p class="dica">Só vão para a Meta os clientes que chegaram por anúncio, uma vez por card.</p></form>`)}
    </div>
    <div class="card" id="rsRel"><p class="muted">Carregando os resultados…</p></div>`;
  document.querySelectorAll('[data-rs-abrir]').forEach(b => b.onclick = () => {
    const k = Number(b.dataset.rsAbrir), corpo = b.closest('.rs-passo').querySelector('.rs-passo-corpo'), abrirAgora = corpo.hidden;
    corpo.hidden = !abrirAgora; b.textContent = abrirAgora ? 'Fechar' : 'Abrir'; b.setAttribute('aria-expanded', String(abrirAgora));
    if (abrirAgora) rsAbertos.add(k); else rsAbertos.delete(k);
  });
  if (r.url) $('rsCopiar').onclick = async () => {
    try { await navigator.clipboard.writeText(r.url); } catch { $('rsUrl').select(); document.execCommand('copy'); }
    toast('Endereço copiado. Cole na API nova da LeadVox, no campo Webhook.');
  };
  if (!ed) { desenharEtapasRastreio(); return; }
  $('rsMeta').onsubmit = ev => { ev.preventDefault(); salvarRastreio(undefined, 2); };
  $('rsQuando').onsubmit = ev => { ev.preventDefault(); salvarRastreio(undefined, 3); };
  $('rsAtivo').onclick = () => salvarRastreio(!r.ativo);
  $('rsEnviarTeste').onclick = async () => {
    const b = $('rsEnviarTeste'); b.disabled = true;
    try { const d = await api('rastreio-teste', { organization: empresa.id }); toast(d.detalhe + ' Confira em Eventos de teste no Gerenciador de Eventos.'); }
    catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  };
}
// Status de cada passo da configuração: [classe, texto, pronto]. rsAbertos guarda os passos abertos (null = decidir pelo que falta).
let rsAbertos = null;
function rsPassos(r) {
  const recente = r.ultimoEvento && Date.now() - Date.parse(r.ultimoEvento) < 36 * 3600e3;
  const n = (r.etapasQualificado || []).length;
  const quando = [r.enviarCompra !== false ? 'Ganho' : '', n ? n + (n === 1 ? ' etapa' : ' etapas') : ''].filter(Boolean).join(' + ');
  return {
    1: recente ? ['on', '✓ Recebendo', true] : ['rascunho', r.ultimoEvento ? 'Sem eventos recentes' : 'Falta configurar', false],
    2: r.pixelId && r.temToken ? ['on', '✓ Conectado' + (r.temTokenAnuncios ? ' · conta e campanha' : ''), true] : ['rascunho', 'Falta configurar', false],
    3: quando ? ['on', '✓ ' + quando, true] : ['rascunho', 'Falta configurar', false]
  };
}
let rastEtapas = null;
async function carregarEtapasRastreio() {
  try { rastEtapas = listas.status || (listas.status = (await api('chat?organization=' + encodeURIComponent(empresa.id) + '&kind=status')).items); }
  catch (err) { rastEtapas = { erro: err.message }; }
  desenharEtapasRastreio();
}
function desenharEtapasRastreio() {
  const el = $('rsEtapas'); if (!el) return;
  const marcadas = new Set((rast?.etapasQualificado || []).map(String)), dis = rast?.podeEditar ? '' : ' disabled';
  if (!rastEtapas) { el.innerHTML = marcadas.size ? `<p class="muted">${marcadas.size} etapa(s) escolhida(s).</p>` : '<p class="muted">Nenhuma etapa escolhida.</p>'; return; }
  if (rastEtapas.erro) { el.innerHTML = `<p class="alerta">${esc(rastEtapas.erro)}</p>`; return; }
  el.innerHTML = rastEtapas.length ? `<div class="rs-etapas">${rastEtapas.map(s => `<label class="aceite"><input type="checkbox" data-rs-etapa="${esc(s.id)}"${marcadas.has(String(s.id)) ? ' checked' : ''}${dis}><span>${esc(s.name)}</span></label>`).join('')}</div>`
    : '<p class="muted">A LeadVox não devolveu etapas de funil.</p>';
}
// passo: 2 ou 3 quando o Salvar é de um bloco (ele fecha sozinho se ficou pronto). Todos os campos vão juntos: o banco guarda a configuração inteira.
async function salvarRastreio(ativo, passo) {
  const etapas = $('rsEtapas').querySelector('[data-rs-etapa]') ? [...document.querySelectorAll('[data-rs-etapa]:checked')].map(x => Number(x.dataset.rsEtapa)) : (rast.etapasQualificado || []);
  const corpo = { organization: empresa.id, ativo: ativo === undefined ? !!rast.ativo : ativo, modo: $('rsModo').value, pixelId: $('rsPixel').value.trim(), tokenMeta: $('rsToken').value.trim(), tokenAnuncios: $('rsTokenAds').value.trim(),
    testeCodigo: $('rsTeste').value.trim(), wabaId: $('rsWaba').value.trim(), pageId: $('rsPage').value.trim(), enviarCompra: $('rsCompra').checked,
    etapasQualificado: etapas, eventoQualificado: $('rsEvento').value };
  try {
    const d = await api('rastreio', corpo); rast = { ...rast, ...d };
    toast(d.aviso || (ativo === true ? 'Rastreamento ligado.' : ativo === false ? 'Rastreamento desligado.' : 'Rastreamento salvo.'), !!d.aviso);
    if (passo && rsPassos(rast)[passo][2]) rsAbertos?.delete(passo);
    const rel = $('rsRel').innerHTML; desenharRastreio(); $('rsRel').innerHTML = rel; ligarPeriodoRastreio(); desenharEtapasRastreio();
  } catch (err) { toast(err.message, true); }
}
async function carregarRelatorioRastreio() {
  const fim = new Date(), ini = new Date(Date.now() - (rastPeriodo - 1) * 864e5), dia = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  try { rastRel = await api('rastreio-relatorio?organization=' + encodeURIComponent(empresa.id) + '&ini=' + dia(ini) + '&fim=' + dia(fim) + (rastConta ? '&conta=' + encodeURIComponent(rastConta) : '')); }
  catch (err) { rastRel = { erro: err.message }; }
  desenharRelatorioRastreio();
}
// Telefone para mostrar: 5521998761234 → (21) 99876-1234. Sem o número completo (leads antigos), só o final.
function rsFone(x) {
  const d = String(x?.telefone || '').replace(/\D/g, ''), n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return d ? '+' + d : x?.final ? '…' + x.final : '';
}
const rsConta = x => x?.conta ? `<span class="rs-conta">${esc(x.conta)}</span>` : '';
function desenharRelatorioRastreio() {
  const el = $('rsRel'); if (!el) return;
  const d = rastRel || {}, t = d.totais || {}, contas = d.contas || [];
  const periodo = `<div class="form-bts">${[7, 30, 90].map(n => `<button type="button" class="sm${n === rastPeriodo ? ' principal' : ''}" data-rs-periodo="${n}">${n} dias</button>`).join('')}</div>`;
  if (d.erro) { el.innerHTML = `<h3>Resultados</h3>${periodo}<p class="alerta">${esc(d.erro)}</p>`; ligarPeriodoRastreio(); return; }
  // Filtro por conta de anúncio: aparece quando há mais de uma conta (ou um filtro já escolhido).
  const filtro = contas.length > 1 || rastConta ? `<div class="form-bts rs-filtro"><button type="button" class="sm${!rastConta ? ' principal' : ''}" data-rs-conta="">Todas as contas</button>${contas.map(c =>
    `<button type="button" class="sm${rastConta === c.id ? ' principal' : ''}" data-rs-conta="${esc(c.id)}">${esc(c.id === 'sem' ? 'Conta não identificada' : c.nome || 'Conta ' + c.id)} <small>${c.leads}</small></button>`).join('')}</div>` : '';
  const aviso = d.semConta && !rast?.temTokenAnuncios ? `<p class="dica">${d.semConta} lead(s) ainda sem conta de anúncio. Para ver a conta e a campanha, cole o token de leitura de anúncios no passo 2.</p>` : '';
  const st = { enviado: ['on', 'A Meta recebeu'], erro: ['perdida', 'Não enviado'], pendente: ['rascunho', 'Enviando'] };
  const sit = { venda: ['on', 'Venda'], qualificado: ['rascunho', 'Qualificado'], lead: ['', 'Lead'] };
  const hora = x => new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div class="lista-topo"><div><h3>Resultados</h3><p class="muted" style="margin-top:4px">Leads que chegaram por anúncio nos últimos ${rastPeriodo} dias e o que eles viraram.</p></div></div>${periodo}${filtro}${aviso}
    <div class="rs-totais"><div><b>${t.leads || 0}</b><span>leads de anúncio</span></div><div><b>${t.qualificados || 0}</b><span>qualificados</span></div>
      <div><b>${t.vendas || 0}</b><span>vendas</span></div><div><b>${rsReais(t.valor)}</b><span>em vendas</span></div></div>
    ${(d.anuncios || []).length ? `<div class="rolo"><table class="tabela-d"><thead><tr><th>Campanha / anúncio</th><th>Conta</th><th>Leads</th><th>Qualificados</th><th>Vendas</th><th>Valor</th></tr></thead><tbody>
      ${d.anuncios.map(a => `<tr><td>${a.campanha ? esc(a.campanha) + '<br>' : ''}<small class="${a.campanha ? 'muted' : ''}">${esc(a.titulo || 'Anúncio sem título')}${a.conjunto ? ' · ' + esc(a.conjunto) : ''}</small></td>
        <td>${rsConta(a) || '<small class="muted">—</small>'}</td><td>${a.leads}</td><td>${a.qualificados}</td><td>${a.vendas}</td><td>${rsReais(a.valor)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted" style="margin-top:10px">Nenhum lead de anúncio no período. Os leads aparecem aqui quando o cliente manda mensagem por um anúncio de clique para WhatsApp.</p>'}
    ${(d.leads || []).length ? `<h3 style="margin-top:18px">Últimos leads de anúncio</h3>${d.leads.map(x => `<div class="item"><div><b>${esc(x.nome || 'Cliente')}</b> <small class="muted">${esc(rsFone(x))}</small>
      <small>${esc(x.campanha ? x.campanha + ' · ' : '')}${esc(x.titulo || 'Anúncio sem título')} ${rsConta(x)}</small></div>
      <div style="text-align:right"><span class="st ${sit[x.situacao]?.[0] || ''}">${sit[x.situacao]?.[1] || 'Lead'}${x.situacao === 'venda' && Number(x.valor) ? ' · ' + rsReais(x.valor) : ''}</span><br><small class="muted">${hora(x.em)}</small></div></div>`).join('')}` : ''}
    ${(d.envios || []).length ? `<h3 style="margin-top:18px">Últimos avisos para a Meta</h3>${d.envios.map(x => `<div class="item"><div><b>${esc(x.tipo === 'compra' ? 'Venda' : 'Lead qualificado')}${x.valor != null ? ' · ' + rsReais(x.valor) : ''} · ${esc(x.nome || 'Cliente')}</b> <small class="muted">${esc(rsFone(x))}</small>
      <small>${esc(x.titulo || '')}${x.etapa ? ' · ' + esc(x.etapa) : ''} · ${hora(x.em)} ${rsConta(x)}</small>${x.status === 'erro' && x.detalhe ? `<small style="color:var(--erro)">${esc(x.detalhe)}</small>` : ''}</div>
      <span class="st ${(st[x.status] || st.pendente)[0]}">${(st[x.status] || st.pendente)[1]}</span></div>`).join('')}` : ''}`;
  ligarPeriodoRastreio();
}
function ligarPeriodoRastreio() {
  document.querySelectorAll('[data-rs-periodo]').forEach(b => b.onclick = () => { rastPeriodo = Number(b.dataset.rsPeriodo); carregarRelatorioRastreio(); });
  document.querySelectorAll('[data-rs-conta]').forEach(b => b.onclick = () => { rastConta = b.dataset.rsConta || null; carregarRelatorioRastreio(); });
}
// Super Admin: liberar ou tirar o módulo da empresa (fica no histórico).
async function carregarRastreioAdmin(e) {
  const box = $('emRastreio'); box.innerHTML = '<h3>Rastreamento de anúncios</h3><p class="muted">Carregando…</p>';
  let d; try { d = await api('admin-rastreio?organization=' + encodeURIComponent(e.id)); }
  catch (err) { box.innerHTML = `<h3>Rastreamento de anúncios</h3><p class="muted">${esc(err.message)}</p>`; return; }
  if (emAtual?.id !== e.id) return;
  const sit = !d.liberado ? 'Não contratado' : d.ativo ? 'Ligado pelo cliente' : 'Liberado; o cliente ainda não ligou';
  const extra = d.liberado ? ` · ${d.pixel ? 'pixel conectado' : 'sem pixel'} · ${d.leads30} lead(s) e ${d.vendas30} venda(s) em 30 dias${d.ultimoEvento ? ' · último evento há ' + quando(d.ultimoEvento) : ''}` : '';
  box.innerHTML = `<div class="lista-topo"><div><h3>Rastreamento de anúncios <small class="muted">módulo extra</small></h3><p class="muted" style="margin-top:4px">${esc(sit + extra)}</p></div>
    <span class="liga"><button type="button" class="switch" role="switch" aria-checked="${!!d.liberado}" id="emRsLiga" aria-label="Módulo de rastreamento liberado"><span></span></button><b class="${d.liberado ? 'on' : ''}">${d.liberado ? 'Liberado' : 'Bloqueado'}</b></span></div>`;
  $('emRsLiga').onclick = async () => {
    $('emRsLiga').disabled = true;
    try { await api('admin-rastreio', { organization: e.id, liberar: !d.liberado }); toast(d.liberado ? 'Módulo retirado da empresa.' : 'Módulo liberado para a empresa.'); }
    catch (err) { toast(err.message, true); }
    carregarRastreioAdmin(e);
  };
}

/* ═══════════ INÍCIO ═══════════ */
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
setModo('login');
if (location.protocol !== 'https:' && !local) { $('pHttp').hidden = false; $('formPorta').hidden = true; $('pLinks').hidden = true; }
else carregar().catch(() => porta(false));

// ═══ Site da loja: temas de datas comemorativas e campanha em pop-up (public/site/tema.js) ═══
const SITE_TEMAS = [['natal', '🎄 Natal'], ['ano-novo', '✨ Ano Novo'], ['carnaval', '🎉 Carnaval'], ['dia-das-maes', '💐 Dia das Mães'],
  ['dia-dos-pais', '👔 Dia dos Pais'], ['dia-do-cliente', '🤝 Dia do Cliente'], ['black-friday', '🏷️ Black Friday']];
// INÍCIO datasDoAno: as próximas datas de cada tema a partir de hoje (o teste roda este trecho sozinho)
function datasDoAno(hoje) {
  const d = (a, m, dia) => new Date(Date.UTC(a, m - 1, dia));
  const iso = x => x.toISOString().slice(0, 10), mais = (x, n) => new Date(x.getTime() + n * 864e5);
  const pascoa = a => {
    const b = a % 19, c = Math.floor(a / 100), e = a % 100, f = Math.floor(c / 4), g = c % 4, h = Math.floor((c + 8) / 25), i = Math.floor((c - h + 1) / 3);
    const j = (19 * b + c - f - i + 15) % 30, k = Math.floor(e / 4), l = e % 4, m = (32 + 2 * g + 2 * k - j - l) % 7, n = Math.floor((b + 11 * j + 22 * m) / 451);
    return d(a, Math.floor((j + m - 7 * n + 114) / 31), ((j + m - 7 * n + 114) % 31) + 1);
  };
  const domingo = (a, m, qual) => { let x = d(a, m, 1); while (x.getUTCDay() !== 0) x = mais(x, 1); return mais(x, 7 * (qual - 1)); };
  const blackFriday = a => { let x = d(a, 11, 1); while (x.getUTCDay() !== 4) x = mais(x, 1); return mais(x, 22); }; // a sexta depois da 4ª quinta
  const faixas = a => ({
    'carnaval': [mais(pascoa(a), -54), mais(pascoa(a), -46)],
    'dia-das-maes': [mais(domingo(a, 5, 2), -7), domingo(a, 5, 2)],
    'dia-dos-pais': [mais(domingo(a, 8, 2), -7), domingo(a, 8, 2)],
    'dia-do-cliente': [d(a, 9, 10), d(a, 9, 15)],
    'black-friday': [mais(blackFriday(a), -7), mais(blackFriday(a), 3)],
    'natal': [d(a, 12, 1), d(a, 12, 26)],
    'ano-novo': [d(a, 12, 27), d(a + 1, 1, 2)]
  });
  const h = iso(hoje), ano = Number(h.slice(0, 4));
  return SITE_TEMAS.map(([tema]) => {
    let [ini, fim] = faixas(ano)[tema];
    if (iso(fim) < h) [ini, fim] = faixas(ano + 1)[tema];
    return { tema, inicio: iso(ini), fim: iso(fim) };
  }).sort((x, y) => x.inicio.localeCompare(y.inicio));
}
// FIM datasDoAno
let siteCfg = null;
async function carregarSite() {
  const el = $('stConteudo'); el.innerHTML = '<div class="card"><p class="muted">Carregando…</p></div>';
  try { siteCfg = await api('site-temas?organization=' + encodeURIComponent(empresa.id)); }
  catch (err) { el.innerHTML = `<div class="card"><p class="alerta">${esc(err.message)}</p></div>`; return; }
  desenharSite();
}
function desenharSite() {
  const s = siteCfg || {}, c = s.campanha || {}, el = $('stConteudo');
  const opcoes = sel => SITE_TEMAS.map(([v, n]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const linha = (a, i) => `<div class="duas st-linha" data-i="${i}"><div><label>Tema</label><select class="stAgTema">${opcoes(a.tema)}</select></div>
    <div class="st-datas"><div><label>De</label><input type="date" class="stAgIni" value="${esc(a.inicio || '')}"></div><div><label>Até</label><input type="date" class="stAgFim" value="${esc(a.fim || '')}"></div>
    <button type="button" class="sm" data-st-tira="${i}" aria-label="Tirar esta data">Tirar</button></div></div>`;
  const codigo = s.conta ? `<script src="${location.origin}/site/tema.js" data-loja="${s.conta}" defer></script>` : '';
  const siteLoja = (cfg.loja && cfg.loja.site) || '';
  el.innerHTML = `<div id="stModelo"></div><div id="stDominio"></div>
    <h2 class="st-secao">Temas e campanha</h2>
    <div class="card estreito"><h3>1 · Ligar no seu site (só para site próprio)</h3>
      ${s.conta ? `<p class="muted" style="margin-top:6px">Cole este código uma vez no seu site, antes de &lt;/body&gt;. Nos sites feitos pela LeadVox, a gente já cola para você.</p>
        <div class="form-bts" style="flex-wrap:nowrap"><input id="stCodigo" readonly value="${esc(codigo)}"><button type="button" class="sm" id="stCopiar">Copiar</button></div>`
        : '<p class="alerta" style="margin-top:6px">Ligue a sua IA primeiro (menu Agentes): o código do site usa a conta da IA.</p>'}
    </div>
    <form class="card estreito" id="stForm">
      <h3>2 · Tema agora</h3>
      <p class="muted" style="margin-top:6px">Liga na hora e fica até você desligar. Para deixar no automático, use a agenda abaixo.</p>
      <div class="duas"><div><label for="stTema">Tema</label><select id="stTema"><option value="">Nenhum (usar a agenda)</option>${opcoes(s.tema || '')}</select></div>
        <div><label class="st-check"><input type="checkbox" id="stMusica"${s.musica ? ' checked' : ''}> Botão de música no Natal e no Ano Novo (só toca se o cliente clicar)</label></div></div>
      <h3 class="st-tit">3 · Agenda do ano</h3>
      <p class="muted" style="margin-top:6px">Cada tema liga e desliga sozinho nas datas. Até 12 datas.</p>
      <div id="stAgenda">${(s.agenda || []).map(linha).join('') || '<p class="muted">Nenhuma data na agenda.</p>'}</div>
      <div class="form-bts"><button type="button" class="sm" id="stSugerir">Sugerir as datas do ano</button><button type="button" class="sm" id="stMais">Adicionar data</button></div>
      <h3 class="st-tit">4 · Campanha em pop-up</h3>
      <p class="muted" style="margin-top:6px">Aparece uma vez por visita, alguns segundos depois de abrir o site. O botão leva ao WhatsApp do site com a oferta na mensagem.</p>
      <label class="st-check"><input type="checkbox" id="stCampAtiva"${c.ativa ? ' checked' : ''}> Campanha ligada</label>
      <div class="duas"><div><label for="stCampTitulo">Título</label><input id="stCampTitulo" maxlength="60" value="${esc(c.titulo || '')}" placeholder="Feirão de Natal"></div>
        <div><label for="stCampCond">Condição em destaque</label><input id="stCampCond" maxlength="80" value="${esc(c.condicao || '')}" placeholder="Entrada a partir de R$ 0"></div></div>
      <label for="stCampTexto">Texto</label><textarea id="stCampTexto" maxlength="240" rows="2" placeholder="Seminovos revisados com garantia e primeira parcela para março.">${esc(c.texto || '')}</textarea>
      <div class="duas"><div><label for="stCampVal">Válida até</label><input type="date" id="stCampVal" value="${esc(c.validade || '')}"></div>
        <div><label for="stCampBotao">Texto do botão</label><input id="stCampBotao" maxlength="24" value="${esc(c.botao || '')}" placeholder="Quero a oferta"></div></div>
      <label for="stArteArq">Arte (opcional, JPG ou PNG até 5 MB)</label>
      <div class="form-bts"><input type="file" id="stArteArq" accept="image/jpeg,image/png"><button type="button" class="sm" id="stArteTira"${c.arte ? '' : ' hidden'}>Tirar a arte</button></div>
      <img id="stArtePrev" class="st-arte" alt="Arte da campanha" src="${esc(c.arte || '')}"${c.arte ? '' : ' hidden'}>
      <h3 class="st-tit">Prévia</h3>
      <div class="duas"><div><label for="stSiteUrl">Endereço do seu site</label><input id="stSiteUrl" placeholder="https://" value="${esc(siteLoja)}"></div>
        <div class="form-bts st-previa"><button type="button" class="sm" id="stPrevia">Ver no meu site</button></div></div>
      <p class="muted">A prévia mostra o tema escolhido e a campanha só para você, sem ligar nada.</p>
      <div class="form-bts"><button class="principal" id="stSalvar">Salvar</button></div>
      <p class="alerta" id="stErro" hidden></p>
    </form>`;
  desenharSiteModelo(); carregarDominio();
  let arte = c.arte || '';
  const agenda = () => [...document.querySelectorAll('#stAgenda .st-linha')].map(l => ({ tema: l.querySelector('.stAgTema').value, inicio: l.querySelector('.stAgIni').value, fim: l.querySelector('.stAgFim').value }));
  const ligarTira = () => document.querySelectorAll('[data-st-tira]').forEach(b => b.onclick = () => { const l = agenda(); l.splice(Number(b.dataset.stTira), 1); redesenharAgenda(l); });
  const redesenharAgenda = lista => { $('stAgenda').innerHTML = lista.map(linha).join('') || '<p class="muted">Nenhuma data na agenda.</p>'; ligarTira(); };
  ligarTira();
  if ($('stCopiar')) $('stCopiar').onclick = async () => { try { await navigator.clipboard.writeText($('stCodigo').value); toast('Código copiado.'); } catch { $('stCodigo').select(); } };
  $('stSugerir').onclick = () => {
    const atuais = agenda(), novas = datasDoAno(new Date()).filter(n => !atuais.some(a => a.tema === n.tema));
    redesenharAgenda([...atuais, ...novas].slice(0, 12)); toast('Datas sugeridas. Ajuste se quiser e clique em Salvar.');
  };
  $('stMais').onclick = () => { const l = agenda(); if (l.length >= 12) return toast('A agenda tem até 12 datas.', true); l.push({ tema: 'natal', inicio: '', fim: '' }); redesenharAgenda(l); };
  $('stArteArq').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 5242880) { ev.target.value = ''; return toast('A arte pode ter até 5 MB.', true); }
    try {
      $('smLogoAviso').hidden = true;
      const pr = await prepararLogo(f);
      const r = await fetch('/api/account/material-arquivo?organization=' + encodeURIComponent(empresa.id), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: pr.blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.tipo !== 'imagem') throw Error(d.error || 'Envie uma imagem JPG ou PNG.');
      arte = d.url; $('stArtePrev').src = arte; $('stArtePrev').hidden = false; $('stArteTira').hidden = false; toast('Arte enviada. Clique em Salvar.');
    } catch (err) { ev.target.value = ''; toast(err.message, true); }
  };
  $('stArteTira').onclick = () => { arte = ''; $('stArtePrev').hidden = true; $('stArteTira').hidden = true; $('stArteArq').value = ''; };
  $('stPrevia').onclick = () => {
    let u; try { u = new URL($('stSiteUrl').value.trim()); if (!/^https?:$/.test(u.protocol)) throw Error(); } catch { return toast('Coloque o endereço do seu site, começando com https://', true); }
    u.searchParams.set('lv_tema', $('stTema').value || agenda()[0]?.tema || 'natal');
    if ($('stCampTitulo').value.trim()) u.searchParams.set('lv_campanha', '1');
    window.open(u.href, '_blank', 'noopener');
  };
  $('stForm').onsubmit = async ev => {
    ev.preventDefault(); const bt = $('stSalvar'); $('stErro').hidden = true;
    const titulo = $('stCampTitulo').value.trim();
    const config = { tema: $('stTema').value || null, musica: $('stMusica').checked, agenda: agenda().filter(a => a.inicio || a.fim),
      campanha: titulo || $('stCampAtiva').checked ? { titulo, texto: $('stCampTexto').value.trim(), condicao: $('stCampCond').value.trim(), validade: $('stCampVal').value || null,
        botao: $('stCampBotao').value.trim(), arte: arte || null, ativa: $('stCampAtiva').checked } : null };
    bt.disabled = true; bt.textContent = 'Salvando…';
    try { await api('site-temas', { organization: empresa.id, conta: siteCfg?.conta || '', config }); toast('Site atualizado. Aparece no site em até 1 minuto.'); await carregarSite(); }
    catch (err) { mostra($('stErro'), err.message); }
    finally { bt.disabled = false; bt.textContent = 'Salvar'; }
  };
}

// ═══ Site da loja: modelo, identidade, textos e publicar (public/site/motor.js + /site/modelos/<id>.css) ═══
const SITE_MODELOS = [
  ['garagem', 'Garagem', 'Para lojas de MOTOS. O site completo da MG: 4 páginas, vitrine animada, estilos (trail, scooter…), avaliações e Instagram.', true],
  ['premium', 'Premium', 'Para CARROS. O site completo da Elite: preto e amarelo, capa que troca de carro sozinha, filtros e ficha com galeria.', true],
  ['neon', 'Neon', 'Para CARROS. O site completo da Machado: vidro e neon, brilho que segue o mouse, mapa da loja e ficha com galeria.', true],
  ['claro', 'Claro', 'Para CARROS. O site completo da Glycerio: fundo claro, busca na capa, horário do dia em destaque e página de cada veículo.', true],
  ['editorial', 'Editorial', 'Para CARROS. O site completo da Ervatti: letra elegante, capa com foto, números animados e ficha com galeria.', true],
  ['vitrine', 'Vitrine', 'Para CARROS e MOTOS. O site completo da Ultra: estoque em lista com prévia flutuante, degradê e ficha da loja.', true]
];
const SITE_FONTES = [['saira', 'Saira Condensed + Albert Sans'], ['bebas', 'Bebas Neue + Sora'], ['barlow', 'Barlow Condensed + Barlow'], ['oswald', 'Oswald + Manrope'], ['outfit', 'Outfit + Manrope']];
// Logo do site: tira o fundo liso (branco, preto ou de uma cor só) a partir das bordas, corta as sobras transparentes,
// reduz para no máximo 1200 x 400 e devolve PNG. Avisa quando ela é escura (some no topo escuro) ou pequena.
async function prepararLogo(arq) {
  const img = await createImageBitmap(arq).catch(() => null);
  if (!img) throw Error('Não consegui abrir a logo. Envie em PNG ou JPG.');
  const k0 = Math.min(1, 1600 / Math.max(img.width, img.height)), W = Math.max(1, Math.round(img.width * k0)), H = Math.max(1, Math.round(img.height * k0));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const id = cx.getImageData(0, 0, W, H), px = id.data, avisos = [];
  // fundo: as bordas quase todas de uma cor só e opacas
  const borda = []; for (let x = 0; x < W; x += Math.max(1, W >> 6)) borda.push(x, (H - 1) * W + x); for (let y = 0; y < H; y += Math.max(1, H >> 6)) borda.push(y * W, y * W + W - 1);
  const opacas = borda.filter(p => px[p * 4 + 3] > 240);
  let tirouFundo = false;
  if (opacas.length > borda.length * 0.9) {
    const m = [0, 1, 2].map(c => opacas.reduce((s, p) => s + px[p * 4 + c], 0) / opacas.length);
    const perto = (p, tol) => Math.abs(px[p * 4] - m[0]) + Math.abs(px[p * 4 + 1] - m[1]) + Math.abs(px[p * 4 + 2] - m[2]) <= tol;
    if (opacas.filter(p => perto(p, 60)).length > opacas.length * 0.9) {
      // a cor do fundo sai da imagem inteira, inclusive de dentro das letras (miolo do A, do O…), com a borda suave
      for (let p = 0; p < W * H; p++) {
        const dif = Math.abs(px[p * 4] - m[0]) + Math.abs(px[p * 4 + 1] - m[1]) + Math.abs(px[p * 4 + 2] - m[2]);
        if (dif <= 45) px[p * 4 + 3] = 0; else if (dif < 90) px[p * 4 + 3] = Math.round(px[p * 4 + 3] * (dif - 45) / 45);
      }
      tirouFundo = true;
    }
  }
  // corta as sobras transparentes e mede o quanto a logo é escura
  let x0 = W, y0 = H, x1 = -1, y1 = -1, lum = 0, peso = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, a = px[p + 3]; if (a <= 16) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    lum += a * (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255; peso += a;
  }
  if (x1 < 0) throw Error('A logo ficou vazia: envie a imagem com a logo bem visível.');
  cx.putImageData(id, 0, 0);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, 1200 / cw, 400 / ch);
  const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  out.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, out.width, out.height);
  if (peso && lum / peso < 0.22) avisos.push('Sua logo é escura e vai sumir no topo escuro do site: envie a versão com letras brancas ou coloridas.');
  if (cw < 300) avisos.push('A logo é pequena (' + cw + ' px de largura) e pode ficar borrada: se tiver, envie uma maior, com pelo menos 600 px.');
  if (ch > cw * 1.3) avisos.push('A logo é em pé: no topo do site ela fica pequena. Se tiver a versão deitada, ela fica melhor.');
  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  if (!blob) throw Error('Não consegui preparar a logo. Tente outra imagem.');
  if (blob.size > 5242880) throw Error('A logo ficou maior que 5 MB. Envie uma imagem menor.');
  return { blob, avisos, tirouFundo };
}
function desenharSiteModelo() {
  const box = $('stModelo'); if (!box) return;
  const s = siteCfg || {}, i = s.identidade || {}, modelo = s.modelo || 'garagem';
  const nomePadrao = i.nome || cfg.displayName || empresa.name || '';
  if (!s.conta) { box.innerHTML = '<div class="card estreito"><h3>Modelo do site</h3><p class="alerta" style="margin-top:6px">Ligue a sua IA primeiro (menu Agentes): o site usa a conta e o estoque da IA.</p></div>'; return; }
  const endereco = location.origin + '/s/' + s.conta + '/';
  box.innerHTML = `<form class="card estreito" id="smForm">
    <h3>Modelo do site</h3>
    <p class="muted" style="margin-top:6px">Escolha o visual. O estoque entra sozinho e você pode trocar de modelo quando quiser.</p>
    <div class="sm-modelos">${SITE_MODELOS.map(([id, n, d, ok]) => `<label class="sm-modelo${ok ? '' : ' breve'}">
      <input type="radio" name="smModelo" value="${id}"${id === modelo ? ' checked' : ''}${ok ? '' : ' disabled'}>
      <span class="sm-amostra sm-${id}"><i></i><i></i><i></i></span>
      <b>${esc(n)}</b><small>${esc(d)}</small>
      ${ok ? `<a href="/s/demo-${id}/" target="_blank" rel="noopener" class="sm-previa">Ver prévia</a>` : '<span class="sm-previa">Em preparação</span>'}</label>`).join('')}</div>
    <h3 class="st-tit">Identidade</h3>
    <div class="duas"><div><label for="smNome">Nome da loja</label><input id="smNome" maxlength="60" required value="${esc(nomePadrao)}"></div>
      <div><label for="smFonte">Fonte</label><select id="smFonte">${SITE_FONTES.map(([v, n]) => `<option value="${v}"${v === (i.fonte || 'saira') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>
    <label for="smLogoArq">Logo da loja <span class="dica-i" tabindex="0" role="note" aria-label="Logo ideal: PNG sem fundo (transparente), deitada (mais larga que alta), com pelo menos 600 px de largura, até 5 MB. O topo dos sites é escuro: use a versão com letras brancas ou coloridas (logo preta some). Se a sua logo tiver fundo branco ou preto liso, o painel tira o fundo e as sobras sozinho." data-dica="Logo ideal: PNG sem fundo (transparente), deitada (mais larga que alta), com pelo menos 600 px de largura, até 5 MB. O topo dos sites é escuro: use a versão com letras brancas ou coloridas (logo preta some). Se a sua logo tiver fundo branco ou preto liso, o painel tira o fundo e as sobras sozinho.">i</span></label>
    <p class="muted" style="margin:2px 0 6px;font-size:13px">PNG sem fundo, deitada, com letras claras ou coloridas. Fundo branco ou preto liso o painel tira sozinho.</p>
    <div class="form-bts"><input type="file" id="smLogoArq" accept="image/png,image/jpeg"><button type="button" class="sm" id="smLogoTira"${i.logo ? '' : ' hidden'}>Tirar a logo</button></div>
    <div class="sm-logo-topo" id="smLogoTopo" style="background:${esc(i.cor2 || '#121110')}"${i.logo ? '' : ' hidden'}><img id="smLogoPrev" class="sm-logo" alt="Logo da loja" src="${esc(i.logo || '')}"><small>Assim ela fica no topo do site</small></div>
    <p class="alerta" id="smLogoAviso" hidden></p>
    <div class="duas"><div><label for="smCor1">Cor principal (botões e destaques)</label><input type="color" id="smCor1" value="${esc(i.cor1 || '#d6921e')}"></div>
      <div><label for="smCor2">Cor de fundo (no modelo Claro: topo e faixas)</label><input type="color" id="smCor2" value="${esc(i.cor2 || '#121110')}"></div></div>
    <div class="form-bts"><button type="button" class="sm" id="smSugCores"${i.logo ? '' : ' disabled'}>Sugerir cores da logo</button><span class="muted" id="smCoresInfo"></span></div>
    <h3 class="st-tit">Textos</h3>
    <label for="smFrase">Frase da capa</label><input id="smFrase" maxlength="90" value="${esc(i.frase || '')}" placeholder="Seu próximo veículo está no nosso pátio.">
    <label for="smSub">Subtítulo</label><input id="smSub" maxlength="200" value="${esc(i.subtitulo || '')}" placeholder="Seminovos revisados, com foto, ficha e preço. Financiamento com resposta no mesmo dia.">
    <label for="smSobre">Sobre a loja</label><textarea id="smSobre" maxlength="600" rows="3" placeholder="Há quanto tempo a loja existe, o que ela tem de diferente…">${esc(i.sobre || '')}</textarea>
    <h3 class="st-tit">Contato</h3>
    <div class="duas"><div><label for="smZap">WhatsApp (para onde vão os clientes)</label><input id="smZap" inputmode="tel" maxlength="20" value="${esc(i.whatsapp || cfg.whatsapp || '')}" placeholder="(21) 99999-9999"></div>
      <div><label for="smTel">Telefone fixo (opcional)</label><input id="smTel" maxlength="20" value="${esc(i.telefone || '')}"></div></div>
    <div class="duas"><div><label for="smEnd">Endereço</label><input id="smEnd" maxlength="160" value="${esc(i.endereco || '')}"></div>
      <div><label for="smCidade">Cidade (aparece nos textos do site)</label><input id="smCidade" maxlength="60" value="${esc(i.cidade || '')}" placeholder="Nova Iguaçu"></div></div>
    <div class="duas"><div><label for="smHora">Horário (separe os dias com ·)</label><input id="smHora" maxlength="120" value="${esc(i.horario || '')}" placeholder="Seg a sex 9h às 18h · Sáb 9h às 14h"></div><div></div></div>
    <h3 class="st-tit">Avaliações do Google</h3>
    <p class="muted" style="margin-top:6px">Coloque até 3 avaliações reais da loja no Google: no Google Maps, abra a loja → Avaliações → escolha as de 5 estrelas e copie o nome e o texto. Sem nenhuma, a seção de avaliações não aparece no site.</p>
    <div class="duas"><div><label for="smMapa">Link da loja no Google Maps (opcional)</label><input id="smMapa" maxlength="400" value="${esc(i.mapa || '')}" placeholder="https://maps.app.goo.gl/…"></div><div></div></div>
    ${[0, 1, 2].map(k => { const a = (i.avaliacoes || [])[k] || {}; return `<div class="duas sm-av"><div><label for="smAvN${k}">Nome do cliente</label><input id="smAvN${k}" maxlength="60" value="${esc(a.nome || '')}"></div>
      <div><label for="smAvT${k}">O que ele escreveu</label><textarea id="smAvT${k}" maxlength="400" rows="2">${esc(a.texto || '')}</textarea></div></div>`; }).join('')}
    <div class="duas"><div><label for="smInsta">Instagram</label><input id="smInsta" maxlength="31" value="${esc(i.instagram ? '@' + i.instagram : '')}" placeholder="@sualoja"></div>
      <div></div></div>
    <h3 class="st-tit">Estoque</h3>
    <p class="muted" style="margin-top:6px">${Number(s.veiculos) || 0} veículo(s) disponível(is) no menu Estoque. O site mostra os mesmos, com as fotos, e atualiza sozinho. Escolha o que aparece de cada veículo:</p>
    <div class="sm-mostrar">${[['km', 'Quilometragem'], ['preco', 'Preço'], ['opcionais', 'Opcionais'], ['descricao', 'Descrição']].map(([k, t]) =>
      `<label class="st-check"><input type="checkbox" data-mostrar="${k}"${(i.mostrar || {})[k] === false ? '' : ' checked'}> ${t}</label>`).join('')}</div>
    <p class="muted" style="margin-top:4px">O que ficar desmarcado aparece como "Consulte" no site. Opcionais e descrição vêm do cadastro de cada veículo no menu Estoque.</p>
    <h3 class="st-tit">Publicar</h3>
    <label class="st-check"><input type="checkbox" id="smPub"${s.publicado ? ' checked' : ''}> Site publicado (aparece no Google)</label>
    <p class="muted">Endereço do site: <a href="${esc(endereco)}" target="_blank" rel="noopener">${esc(endereco)}</a>. Para usar o domínio da loja, fale com a LeadVox.</p>
    <div class="form-bts"><button class="principal" id="smSalvar">Salvar o site</button>${s.modelo ? `<a class="sm" href="${esc(endereco)}" target="_blank" rel="noopener">Abrir o meu site</a>` : ''}</div>
    <p class="alerta" id="smErro" hidden></p>
  </form>`;
  let logo = i.logo || '';
  $('smLogoArq').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 5242880) { ev.target.value = ''; return toast('A logo pode ter até 5 MB.', true); }
    try {
      const r = await fetch('/api/account/material-arquivo?organization=' + encodeURIComponent(empresa.id), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.tipo !== 'imagem') throw Error(d.error || 'Envie a logo em PNG ou JPG.');
      logo = d.url; $('smLogoPrev').src = logo; $('smLogoTopo').hidden = false; $('smLogoTira').hidden = false; $('smSugCores').disabled = false;
      if (pr.avisos.length) mostra($('smLogoAviso'), pr.avisos.join(' '));
      if (pr.tirouFundo) toast('Logo enviada: o fundo foi tirado. Confira a prévia.');
      sugerirCores(true);
    } catch (err) { ev.target.value = ''; toast(err.message, true); }
  };
  $('smCor2').addEventListener('input', () => { $('smLogoTopo').style.background = $('smCor2').value; });
  $('smLogoTira').onclick = () => { logo = ''; $('smLogoTopo').hidden = true; $('smLogoAviso').hidden = true; $('smLogoTira').hidden = true; $('smLogoArq').value = ''; $('smSugCores').disabled = true; };
  $('smSugCores').onclick = () => sugerirCores(false);
  // cores da logo: lê os pixels, junta os parecidos e escolhe a cor mais forte (principal) e uma escura para o fundo
  function sugerirCores(silencioso) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'), w = 64, hh = Math.max(1, Math.round(64 * img.height / img.width)); c.width = w; c.height = hh;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, hh);
        const px = ctx.getImageData(0, 0, w, hh).data, grupos = {};
        for (let k = 0; k < px.length; k += 4) {
          if (px[k + 3] < 128) continue;
          const r = px[k], g = px[k + 1], b = px[k + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
          const chave = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
          const gr = grupos[chave] || (grupos[chave] = { n: 0, r: 0, g: 0, b: 0, sat: 0 });
          gr.n++; gr.r += r; gr.g += g; gr.b += b; gr.sat += max ? (max - min) / max : 0;
        }
        const lista = Object.values(grupos).map(gr => ({ n: gr.n, cor: [gr.r / gr.n, gr.g / gr.n, gr.b / gr.n].map(Math.round), sat: gr.sat / gr.n }));
        const hex = c3 => '#' + c3.map(v => v.toString(16).padStart(2, '0')).join('');
        const forte = lista.filter(x => x.sat > 0.35 && Math.max(...x.cor) > 70).sort((a, b) => b.n * b.sat - a.n * a.sat)[0];
        if (!forte) { if (!silencioso) toast('Não achei uma cor forte na logo. Escolha à mão.', true); return; }
        const fundo = forte.cor.map(v => Math.round(v * 0.12 + 8));
        $('smCor1').value = hex(forte.cor); $('smCor2').value = hex(fundo);
        $('smCoresInfo').textContent = 'Cores sugeridas a partir da logo. Ajuste se quiser.';
      } catch { if (!silencioso) toast('Não deu para ler as cores da logo. Escolha à mão.', true); }
    };
    img.onerror = () => { if (!silencioso) toast('Não deu para abrir a logo.', true); };
    img.src = logo;
  }
  $('smForm').onsubmit = async ev => {
    ev.preventDefault(); const bt = $('smSalvar'); $('smErro').hidden = true;
    const modeloSel = (document.querySelector('input[name="smModelo"]:checked') || {}).value || 'garagem';
    const identidade = { nome: $('smNome').value.trim(), logo: logo || null, cor1: $('smCor1').value, cor2: $('smCor2').value, fonte: $('smFonte').value,
      frase: $('smFrase').value.trim(), subtitulo: $('smSub').value.trim(), sobre: $('smSobre').value.trim(), whatsapp: $('smZap').value, telefone: $('smTel').value.trim(),
      endereco: $('smEnd').value.trim(), horario: $('smHora').value.trim(), instagram: $('smInsta').value.trim().replace(/^@/, ''), mapa: $('smMapa').value.trim(),
      cidade: $('smCidade').value.trim(),
      avaliacoes: [0, 1, 2].map(k => ({ nome: $('smAvN' + k).value.trim(), texto: $('smAvT' + k).value.trim() })).filter(a => a.nome && a.texto),
      mostrar: Object.fromEntries([...document.querySelectorAll('[data-mostrar]')].map(c => [c.dataset.mostrar, c.checked])) };
    // os modelos fiéis usam a cidade nos textos ("motos 0 km e seminovas em …"): sem ela, não publica
    if ($('smPub').checked && !identidade.cidade) return mostra($('smErro'), 'Para publicar, coloque a cidade da loja: ela aparece nos textos do site.');
    if ($('smPub').checked && !logo) return mostra($('smErro'), 'Para publicar, envie a logo da loja: o site com o nome escrito no lugar da logo não fica com cara de marca.');
    bt.disabled = true; bt.textContent = 'Salvando…';
    try { await api('site-modelo', { organization: empresa.id, conta: s.conta, modelo: modeloSel, identidade, publicado: $('smPub').checked }); toast('Site salvo. Aparece em até 1 minuto.'); await carregarSite(); }
    catch (err) { mostra($('smErro'), err.message); }
    finally { bt.disabled = false; bt.textContent = 'Salvar o site'; }
  };
}

// ═══ Site da loja → Domínio próprio (www.sualoja.com.br ou estoque.sualoja.com.br) ═══
// O lojista conecta um domínio que já tem (registros DNS + Verificar conexão) ou pede para a LeadVox registrar um.
// "Domínio ativo" só quando o servidor conferiu de verdade: DNS na hospedagem certa, HTTPS válido e o site desta loja abrindo.
let domDados = null, domForm = '';
const DOM_STATUS = { pendente: ['rascunho', 'Pendente'], verificado: ['aviso', 'Domínio confirmado, falta pouco'], ativo: ['on', 'Domínio ativo'] };
const DOM_PEDIDO = { recebido: 'Solicitação recebida', cotado: 'Cotação pronta', indisponivel: 'Nome indisponível', aceito: 'Aceito: registrando', registrado: 'Registrado', cancelado: 'Cancelado' };
const reaisDom = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function carregarDominio() {
  const box = $('stDominio'); if (!box) return;
  try { domDados = await api('site-dominio?organization=' + encodeURIComponent(empresa.id)); }
  catch (err) { box.innerHTML = `<h2 class="st-secao">Domínio próprio</h2><div class="card estreito"><p class="muted">${esc(err.message)}</p></div>`; return; }
  desenharDominio();
}
function desenharDominio() {
  const box = $('stDominio'); if (!box || !domDados) return;
  const d = domDados, dom = d.dominio, ped = (d.pedidos || []).find(p => p.status !== 'cancelado');
  const gh = (d.hospedagem || {}).tipo === 'github';
  const modo = domForm || (dom ? 'status' : ped && ped.status !== 'registrado' ? 'pedido' : 'escolher');
  let html = '<h2 class="st-secao">Domínio próprio</h2>';
  if (!d.conta) { box.innerHTML = html + '<div class="card estreito"><p class="alerta">Ligue a sua IA primeiro (menu Agentes): o site usa a conta da IA.</p></div>'; return; }
  if (modo === 'escolher') {
    html += `<div class="card estreito"><h3>Use o endereço da sua marca</h3>
      <p class="muted" style="margin-top:4px">Hoje o site abre em <a href="/s/${esc(d.conta)}/" target="_blank" rel="noopener">${esc(location.host)}/s/${esc(d.conta)}/</a>. Com o domínio próprio ele abre em um endereço como <b>www.sualoja.com.br</b>.</p>
      <div class="duas" style="margin-top:12px"><button type="button" class="principal" data-dom="tenho">Já tenho domínio</button><button type="button" data-dom="registrar">Quero registrar um domínio</button></div></div>`;
  } else if (modo === 'tenho') {
    html += `<form class="card estreito" id="domSalvar"><h3>Já tenho domínio</h3>
      <label for="domEnd">Endereço</label><input id="domEnd" maxlength="253" required placeholder="sualoja.com.br" value="${esc(dom ? dom.dominio : '')}">
      <label for="domTipo">O que conectar</label><select id="domTipo">
        <option value="principal"${dom && dom.tipo === 'subdominio' ? '' : ' selected'}>O domínio principal (sualoja.com.br e www.sualoja.com.br)</option>
        <option value="subdominio"${dom && dom.tipo === 'subdominio' ? ' selected' : ''}>Só um subdomínio (ex.: estoque.sualoja.com.br): o site principal continua onde está</option></select>
      <div id="domPrefBox"><label for="domPref">Endereço que abre o site</label><select id="domPref">
        <option value="www"${dom && dom.preferido === 'raiz' ? '' : ' selected'}>Com www (recomendado): sem www redireciona</option>
        <option value="raiz"${dom && dom.preferido === 'raiz' ? ' selected' : ''}>Sem www: com www redireciona</option></select></div>
      <p class="alerta" id="domErro" hidden></p>
      <div class="form-bts"><button class="principal" type="submit">Salvar e ver os registros</button><button type="button" data-dom="voltar">Voltar</button></div></form>`;
  } else if (modo === 'registrar') {
    html += `<form class="card estreito" id="domPedir"><h3>Quero registrar um domínio</h3>
      <p class="muted" style="margin-top:4px">A equipe LeadVox consulta se o nome está livre e manda o valor do registro e da renovação. O domínio fica no nome da sua loja (CNPJ ou CPF do titular).</p>
      <label for="domNome">Nome desejado</label><input id="domNome" maxlength="253" required placeholder="sualoja.com.br">
      <p class="alerta" id="domErro" hidden></p>
      <div class="form-bts"><button class="principal" type="submit">Enviar solicitação</button><button type="button" data-dom="voltar">Voltar</button></div></form>`;
  } else if (modo === 'pedido' && ped) {
    html += desenharPedidoDominio(ped);
  } else if (dom) {
    const st = DOM_STATUS[dom.status] || DOM_STATUS.pendente, ch = dom.checagem || {};
    const linhaCheck = (ok, txt) => `<li class="${ok === true ? 'ok' : ok === false ? 'falta' : ''}">${ok === true ? '✓' : ok === false ? '✗' : '·'} ${esc(txt)}</li>`;
    const checks = ch.em ? [
      linhaCheck(ch.propriedade, 'Controle do domínio (registro TXT)'),
      ...(ch.dns || []).map(x => linhaCheck(x.ok, x.host + ' aponta para ' + (gh ? 'o GitHub Pages' : 'a LeadVox'))),
      ...(ch.https || []).map(x => linhaCheck(x.ok, x.host + ' com HTTPS')),
      linhaCheck(ch.identidade, (ch.principal || d.principal) + ' abre o site desta loja'),
      ...(ch.redirecionamento === null || ch.redirecionamento === undefined ? [] : [linhaCheck(ch.redirecionamento, 'O outro endereço redireciona para ' + (ch.principal || d.principal))])
    ].join('') : '';
    const pend = (ch.pendencias || []).map(p => `<li><span class="st ${p.quem === 'loja' ? 'rascunho' : 'aviso'}">${p.quem === 'loja' ? 'Você' : 'Equipe LeadVox'}</span> ${esc(p.texto)}</li>`).join('');
    html += `<div class="card estreito dom-card"><div class="lista-topo"><div><h3>${esc(dom.tipo === 'principal' ? dom.dominio + ' e www.' + dom.dominio : dom.dominio)}</h3>
        <p class="muted">${dom.status === 'ativo' ? 'O site abre em ' : 'Quando estiver ativo, o site abre em '}<a href="https://${esc(d.principal)}" target="_blank" rel="noopener">https://${esc(d.principal)}</a></p></div>
        <span class="st ${st[0]}">${esc(st[1])}</span></div>
      ${d.publicado ? '' : '<p class="alerta" style="margin-top:8px">O site ainda não está publicado: marque "Site publicado" no Modelo do site, acima.</p>'}
      ${d.verificacaoLigada ? '' : '<p class="alerta" style="margin-top:8px">Pendente na LeadVox: a verificação de domínio ainda está sendo ligada na hospedagem. Você já pode criar os registros abaixo.</p>'}
      <h4 style="margin-top:14px">1 · Crie estes registros no DNS do domínio</h4>
      <div class="rolo"><table class="lv-tabela dom-tabela"><thead><tr><th>Tipo</th><th>Nome</th><th>Valor</th><th></th></tr></thead><tbody>
        ${(d.registros || []).map((r, i) => `<tr><td><b>${esc(r.tipo)}</b></td><td><code>${esc(r.nome)}</code><small class="muted">${esc(r.completo)}</small></td>
          <td><code>${esc(r.valor)}</code><small class="muted">${esc(r.para)}</small></td><td><button type="button" class="sm" data-dom-copiar="${i}">Copiar</button></td></tr>`).join('')}
      </tbody></table></div>
      <details class="dom-ajuda" open><summary>Onde colocar esses registros</summary>
        <p><b>Domínio .br com o DNS no Registro.br:</b> entre em registro.br com a conta do titular → Painel → clique no domínio → <b>DNS</b> → Configurar zona DNS (ou "Editar zona") → <b>Nova entrada</b> para cada linha da tabela → Salvar.</p>
        <p><b>DNS em outro provedor</b> (Cloudflare, Hostinger, GoDaddy, Locaweb, HostGator…): faça a alteração no painel desse provedor, na área de DNS ou Zona DNS. No Registro.br, em "Servidores DNS", aparece quem administra o DNS do seu domínio.</p>
        <p><b>Não apague nada que já existe.</b> E-mail (registros MX e TXT do e-mail, como SPF), Google e outros serviços continuam funcionando. ${dom.tipo === 'principal' ? 'Só troque o registro A do "@" e o "www", se eles apontarem para o site antigo.' : 'Seu site principal continua onde está: só o subdomínio passa a abrir o site da LeadVox.'}</p>
        <p><b>No Nome</b>, "@" é o próprio domínio. Alguns provedores pedem o endereço completo (ele aparece embaixo de cada nome).${gh ? ' Este site fica no GitHub Pages: o domínio também é configurado no repositório pela equipe LeadVox.' : ''}</p>
        <p>Depois de salvar, a mudança pode levar de alguns minutos a algumas horas para valer. Aí é só clicar em Verificar conexão.</p>
      </details>
      <h4 style="margin-top:14px">2 · Verifique a conexão</h4>
      ${checks ? `<ul class="dom-checks">${checks}</ul>` : '<p class="muted">Ainda não verificado.</p>'}
      ${ch.em ? `<p class="muted" style="font-size:13px">Última verificação: ${esc(new Date(ch.em).toLocaleString('pt-BR'))}</p>` : ''}
      ${pend ? `<h4 style="margin-top:10px">O que falta</h4><ul class="dom-pend">${pend}</ul>` : ''}
      <p style="margin-top:8px"><b>Próxima ação:</b> ${esc(ch.proximo || 'Crie os registros da tabela e clique em Verificar conexão.')}</p>
      <p class="alerta" id="domErro" hidden></p>
      <div class="form-bts"><button type="button" class="principal" data-dom="verificar"${d.verificacaoLigada ? '' : ' disabled'}>Verificar conexão</button>
        <button type="button" data-dom="tenho">Trocar endereço</button><button type="button" class="perigo" data-dom="remover">Remover domínio</button></div>
    </div>`;
    if (ped && ped.status !== 'registrado') html += desenharPedidoDominio(ped);
  }
  box.innerHTML = html;
  const mostraErro = msg => { const e = $('domErro'); if (e) { e.textContent = msg; e.hidden = false; } else toast(msg, true); };
  box.querySelectorAll('[data-dom]').forEach(b => b.onclick = async () => {
    const a = b.dataset.dom;
    if (a === 'tenho' || a === 'registrar') { domForm = a; return desenharDominio(); }
    if (a === 'voltar') { domForm = ''; return desenharDominio(); }
    if (a === 'remover' && !confirm('Remover o domínio ' + (dom ? dom.dominio : '') + ' deste site? O site volta a abrir só no endereço da LeadVox.')) return;
    const txt = b.textContent; b.disabled = true; if (a === 'verificar') b.textContent = 'Verificando…';
    try { domDados = await api('site-dominio', { organization: empresa.id, acao: a }); domForm = ''; desenharDominio();
      if (a === 'verificar') toast(domDados.dominio && domDados.dominio.status === 'ativo' ? 'Domínio ativo!' : 'Verificação feita: veja o que falta.'); }
    catch (err) { mostraErro(err.message); b.disabled = false; b.textContent = txt; }
  });
  box.querySelectorAll('[data-dom-copiar]').forEach(b => b.onclick = async () => {
    const r = (d.registros || [])[+b.dataset.domCopiar]; if (!r) return;
    try { await navigator.clipboard.writeText(r.valor); toast('Valor copiado.'); } catch { toast(r.valor); }
  });
  if ($('domTipo')) { const pref = () => { $('domPrefBox').hidden = $('domTipo').value !== 'principal'; }; $('domTipo').onchange = pref; pref(); }
  if ($('domSalvar')) $('domSalvar').onsubmit = async ev => {
    ev.preventDefault(); const bt = ev.target.querySelector('button[type=submit]'); bt.disabled = true;
    try { domDados = await api('site-dominio', { organization: empresa.id, acao: 'salvar', dominio: $('domEnd').value, tipo: $('domTipo').value, preferido: $('domPref').value });
      domForm = ''; desenharDominio(); toast('Domínio salvo. Agora crie os registros no DNS.'); }
    catch (err) { mostraErro(err.message); bt.disabled = false; }
  };
  if ($('domPedir')) $('domPedir').onsubmit = async ev => {
    ev.preventDefault(); const bt = ev.target.querySelector('button[type=submit]'); bt.disabled = true;
    try { domDados = await api('site-dominio', { organization: empresa.id, acao: 'pedir', nome: $('domNome').value }); domForm = ''; desenharDominio(); toast('Solicitação recebida.'); }
    catch (err) { mostraErro(err.message); bt.disabled = false; }
  };
  if ($('domAceitar')) $('domAceitar').onsubmit = async ev => {
    ev.preventDefault(); const bt = ev.target.querySelector('button[type=submit]'); bt.disabled = true;
    try { domDados = await api('site-dominio', { organization: empresa.id, acao: 'aceitar', id: Number(ev.target.dataset.id), titular: $('domTitular').value, documento: $('domDoc').value });
      desenharDominio(); toast('Cotação aceita. A LeadVox vai registrar o domínio.'); }
    catch (err) { mostraErro(err.message); bt.disabled = false; }
  };
  box.querySelectorAll('[data-dom-cancelar]').forEach(b => b.onclick = async () => {
    if (!confirm('Cancelar este pedido de domínio?')) return;
    try { domDados = await api('site-dominio', { organization: empresa.id, acao: 'cancelar', id: Number(b.dataset.domCancelar) }); domForm = ''; desenharDominio(); }
    catch (err) { mostraErro(err.message); }
  });
}
function desenharPedidoDominio(p) {
  const resp = p.responsavelRenovacao === 'leadvox' ? 'a LeadVox renova' : 'a loja renova';
  let corpo = '';
  if (p.status === 'recebido') corpo = '<p><b>Solicitação recebida.</b> A equipe LeadVox vai consultar se o nome está livre e mandar aqui o valor do registro e da renovação.</p>';
  else if (p.status === 'indisponivel') corpo = `<p>O nome <b>${esc(p.nome)}</b> não está disponível.${p.observacao ? ' ' + esc(p.observacao) : ''}</p><div class="form-bts"><button type="button" data-dom="registrar">Pedir outro nome</button></div>`;
  else if (p.status === 'cotado') corpo = `<ul class="dom-cota"><li>Registro (1º ano): <b>${reaisDom(p.valorRegistro)}</b></li>
      <li>Renovação (por ano): <b>${reaisDom(p.valorRenovacao)}</b> · ${p.renovacaoInclusa ? 'incluída no seu plano' : 'cobrada à parte'} · ${resp}</li></ul>
      ${p.observacao ? `<p class="muted">${esc(p.observacao)}</p>` : ''}
      <form id="domAceitar" data-id="${esc(p.id)}"><p class="muted">O domínio é registrado no nome do titular. Informe quem será o dono:</p>
        <div class="duas"><div><label for="domTitular">Nome do titular (loja ou pessoa)</label><input id="domTitular" maxlength="120" required></div>
          <div><label for="domDoc">CNPJ ou CPF do titular</label><input id="domDoc" inputmode="numeric" maxlength="18" required placeholder="00.000.000/0001-00"></div></div>
        <p class="alerta" id="domErro" hidden></p>
        <div class="form-bts"><button class="principal" type="submit">Aceitar e pedir o registro</button><button type="button" data-dom-cancelar="${esc(p.id)}">Não quero</button></div></form>`;
  else if (p.status === 'aceito') corpo = `<p><b>Aceito.</b> A equipe LeadVox está registrando ${esc(p.nome)} no nome de ${esc(p.titularNome || 'titular')} (${esc(p.titularDocumento || '')}). Quando terminar, a configuração do domínio aparece aqui.</p>`;
  else if (p.status === 'registrado') corpo = '<p><b>Registrado.</b> Agora siga a configuração do domínio.</p>';
  return `<div class="card estreito"><div class="lista-topo"><div><h3>Pedido: ${esc(p.nome)}</h3><p class="muted">Enviado em ${esc(new Date(p.criadoEm).toLocaleDateString('pt-BR'))}</p></div>
    <span class="st ${p.status === 'indisponivel' ? 'perdida' : p.status === 'cotado' ? 'aviso' : 'rascunho'}">${esc(DOM_PEDIDO[p.status] || p.status)}</span></div>${corpo}
    ${p.status === 'recebido' ? `<div class="form-bts"><button type="button" data-dom-cancelar="${esc(p.id)}">Cancelar pedido</button></div>` : ''}</div>`;
}

// ═══ Super Admin → Domínios das lojas e pedidos de registro ═══
let lvDom = null;
async function carregarDominiosAdmin() {
  const box = $('lvDominios'); if (!box) return;
  try { lvDom = await api('admin-dominios'); } catch (err) { box.hidden = false; $('lvDominiosLista').innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  box.hidden = false; desenharDominiosAdmin();
}
function desenharDominiosAdmin() {
  const d = lvDom || {}, doms = d.dominios || [], peds = d.pedidos || [];
  const pendExt = doms.filter(x => x.status !== 'ativo' && (x.checagem || {}).pendencias && x.checagem.pendencias.some(p => p.quem === 'leadvox'));
  $('lvDominiosResumo').textContent = `${doms.length} domínio(s) · ${doms.filter(x => x.status === 'ativo').length} ativo(s) · ${peds.filter(p => ['recebido', 'aceito'].includes(p.status)).length} pedido(s) esperando a LeadVox`;
  const st = s => DOM_STATUS[s] || DOM_STATUS.pendente;
  $('lvDominiosLista').innerHTML = `
    ${d.verificacaoLigada ? '' : `<div class="alerta" style="margin-bottom:10px"><b>Pendente na VPS:</b> a verificação de domínio está desligada. No Coolify, app do painel → Environment Variables, crie <code>SITE_DOMINIO_SEGREDO</code> com a chave abaixo e faça Redeploy.
      <div class="form-bts"><button type="button" class="sm" id="lvDomChave">Mostrar a chave</button><code id="lvDomChaveTxt"></code></div></div>`}
    ${pendExt.length ? `<div class="card" style="margin-bottom:10px"><h3>Esperando a equipe LeadVox</h3><ul class="dom-pend">${pendExt.map(x => `<li><b>${esc(x.empresa)}</b> · ${esc(x.dominio)}: ${x.checagem.pendencias.filter(p => p.quem === 'leadvox').map(p => esc(p.texto)).join(' ')}
      ${x.hospedagem && x.hospedagem.tipo === 'github' ? '' : `<br><small class="muted">No Coolify, app do painel → Domains: acrescente ${(x.hosts || []).map(h => 'https://' + esc(h)).join(',')} (sem apagar os que já existem; o Coolify às vezes cria um "www." a mais: tire o que não for da loja) e faça Redeploy depois que o DNS já estiver apontando.</small>`}</li>`).join('')}</ul></div>` : ''}
    <h3>Pedidos de registro</h3>
    ${peds.length ? `<div class="rolo"><table class="lv-tabela"><thead><tr><th>Empresa</th><th>Nome</th><th>Situação</th><th>Valores</th><th></th></tr></thead><tbody>
      ${peds.map(p => `<tr><td><b>${esc(p.empresa)}</b><small class="muted">${esc(new Date(p.criadoEm).toLocaleDateString('pt-BR'))}</small></td><td><code>${esc(p.nome)}</code></td>
        <td><span class="st ${p.status === 'aceito' || p.status === 'recebido' ? 'aviso' : 'rascunho'}">${esc(DOM_PEDIDO[p.status] || p.status)}</span>${p.titularNome ? `<small class="muted">Titular: ${esc(p.titularNome)} · ${esc(p.titularDocumento || '')}</small>` : ''}</td>
        <td>${p.valorRegistro != null ? `${reaisDom(p.valorRegistro)} + ${reaisDom(p.valorRenovacao)}/ano<small class="muted">${p.renovacaoInclusa ? 'renovação no plano' : 'renovação à parte'} · ${p.responsavelRenovacao === 'leadvox' ? 'LeadVox renova' : 'loja renova'}</small>` : '—'}</td>
        <td>${['recebido', 'cotado', 'indisponivel'].includes(p.status) ? `<button class="sm" type="button" data-lvdom-cotar="${esc(p.id)}">Consultar e cotar</button>` : ''}
          ${p.status === 'aceito' ? `<button class="sm principal" type="button" data-lvdom-registrado="${esc(p.id)}">Já registrei</button>` : ''}</td></tr>
        <tr hidden id="lvDomCota${esc(p.id)}"><td colspan="5"><form class="lv-dom-cota" data-id="${esc(p.id)}" data-nome="${esc(p.nome)}">
          <div class="form-bts"><button type="button" class="sm" data-lvdom-consultar>Ver disponibilidade</button><span class="muted" data-lvdom-res></span></div>
          <div class="tres"><div><label>Disponível?</label><select name="disp"><option value="sim">Sim</option><option value="nao">Não</option></select></div>
            <div><label>Registro (R$)</label><input name="reg" inputmode="decimal" value="${p.valorRegistro ?? ''}" placeholder="40,00"></div>
            <div><label>Renovação por ano (R$)</label><input name="ren" inputmode="decimal" value="${p.valorRenovacao ?? ''}" placeholder="40,00"></div></div>
          <div class="duas"><div><label>Renovação incluída no plano?</label><select name="incl"><option value="nao">Não, cobrada à parte</option><option value="sim"${p.renovacaoInclusa ? ' selected' : ''}>Sim, incluída</option></select></div>
            <div><label>Quem renova</label><select name="resp"><option value="loja">A loja</option><option value="leadvox"${p.responsavelRenovacao === 'leadvox' ? ' selected' : ''}>A LeadVox</option></select></div></div>
          <label>Observação para o cliente</label><input name="obs" maxlength="400" value="${esc(p.observacao || '')}">
          <div class="form-bts"><button class="principal sm" type="submit">Mandar cotação</button></div></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum pedido.</p>'}
    <h3 style="margin-top:14px">Domínios das lojas</h3>
    ${doms.length ? `<div class="rolo"><table class="lv-tabela"><thead><tr><th>Empresa</th><th>Domínio</th><th>Situação</th><th>Hospedagem</th></tr></thead><tbody>
      ${doms.map(x => `<tr><td><b>${esc(x.empresa)}</b><small class="muted">${esc(x.conta || '')}</small></td><td>${(x.hosts || []).map(h => `<code>${esc(h)}</code>`).join(' ')}</td>
        <td><span class="st ${st(x.status)[0]}">${esc(st(x.status)[1])}</span>${(x.checagem || {}).proximo ? `<small class="muted">${esc(x.checagem.proximo)}</small>` : ''}</td>
        <td><form class="lv-dom-hosp" data-org="${esc(x.organization)}"><select name="tipo"><option value="leadvox">LeadVox (VPS)</option><option value="github"${x.hospedagem && x.hospedagem.tipo === 'github' ? ' selected' : ''}>GitHub Pages</option></select>
          <input name="repo" placeholder="dono/repositorio" value="${esc((x.hospedagem || {}).repo || '')}" maxlength="140"><button class="sm" type="submit">Salvar</button></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma loja configurou domínio ainda.</p>'}`;
  const box = $('lvDominiosLista');
  if ($('lvDomChave')) $('lvDomChave').onclick = async () => { try { const r = await api('admin-dominio-chave'); $('lvDomChaveTxt').textContent = r.chave || ''; } catch (err) { toast(err.message, true); } };
  box.querySelectorAll('[data-lvdom-cotar]').forEach(b => b.onclick = () => { const tr = $('lvDomCota' + b.dataset.lvdomCotar); tr.hidden = !tr.hidden; });
  box.querySelectorAll('[data-lvdom-consultar]').forEach(b => b.onclick = async () => {
    const f = b.closest('form'), out = f.querySelector('[data-lvdom-res]'); out.textContent = 'Consultando…';
    try { const r = await api('admin-dominio-disponivel', { nome: f.dataset.nome });
      out.textContent = r.ok ? (r.disponivel ? 'Livre para registro.' : 'Já registrado por alguém.') : r.erro; if (r.ok) f.disp.value = r.disponivel ? 'sim' : 'nao'; }
    catch (err) { out.textContent = err.message; }
  });
  box.querySelectorAll('form.lv-dom-cota').forEach(f => f.onsubmit = async ev => {
    ev.preventDefault();
    try { lvDom = { ...lvDom, ...await api('admin-dominio-cotar', { id: Number(f.dataset.id), disponivel: f.disp.value === 'sim', valorRegistro: f.reg.value, valorRenovacao: f.ren.value,
        inclusa: f.incl.value === 'sim', responsavel: f.resp.value, observacao: f.obs.value }) }; desenharDominiosAdmin(); toast('Cotação enviada ao cliente.'); }
    catch (err) { toast(err.message, true); }
  });
  box.querySelectorAll('[data-lvdom-registrado]').forEach(b => b.onclick = async () => {
    if (!confirm('Confirma que o domínio já foi registrado no Registro.br no nome do titular? A configuração do domínio vai aparecer para a loja.')) return;
    try { lvDom = { ...lvDom, ...await api('admin-dominio-registrado', { id: Number(b.dataset.lvdomRegistrado) }) }; desenharDominiosAdmin(); toast('Marcado como registrado.'); }
    catch (err) { toast(err.message, true); }
  });
  box.querySelectorAll('form.lv-dom-hosp').forEach(f => f.onsubmit = async ev => {
    ev.preventDefault();
    try { lvDom = { ...lvDom, ...await api('admin-site-hospedagem', { organization: f.dataset.org, tipo: f.tipo.value, repo: f.repo.value }) }; desenharDominiosAdmin(); toast('Hospedagem salva.'); }
    catch (err) { toast(err.message, true); }
  });
}
