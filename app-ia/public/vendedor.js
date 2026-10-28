// Plugin do Vendedor (dentro da LeadVox): a LeadVox manda o atendimento aberto por postMessage (DEFAULT_DATA);
// o link do plugin traz a chave da loja (?k=conta&t=chave). Tudo passa por /api/plugin (o servidor repassa ao motor).
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = new URLSearchParams(location.search);
const CHAVE = { k: qs.get('k') || '', t: qs.get('t') || '' };
let ticket = null, ctx = null, toastT = null, ocupado = false;

function toast(msg, erro) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (erro ? ' erro' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 3200);
}
const aviso = msg => { $('pvAviso').textContent = msg || ''; $('pvAviso').hidden = !msg; };
const fone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); return d.length >= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, -4) + '-' + d.slice(-4) : d; };
const dataBR = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

// dados do atendimento que a LeadVox manda (só de *.leadvox.com.br)
function lerTicket(t) {
  if (!t || !t.id) return null;
  const c = t.contact || {};
  return { id: String(t.id), tel: String(c.number || t.number || ''), cliente: c.name || c.pushname || '', contactId: String(t.contactId || c.id || ''),
    vendedor: (t.user && t.user.name) || '', depto: (t.queue && (t.queue.queue || t.queue.name)) || '' };
}
window.addEventListener('message', ev => {
  let host = ''; try { host = new URL(ev.origin).hostname; } catch (e) { return; }
  if (!/(^|\.)leadvox\.com\.br$/.test(host)) return;
  let m = ev.data; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  const t = m && m.type === 'DEFAULT_DATA' && m.data ? lerTicket(m.data.ticket) : null;
  if (t && (!ticket || t.id !== ticket.id || t.vendedor !== ticket.vendedor)) { ticket = t; esItens = null; prVeic = null; prMsgEditada = false; lerOrc(); if (!$('abaOrcamento').hidden) desenharOrcamento(); if (!$('abaProposta').hidden) desenharProposta(); $('esLista').innerHTML = ''; $('esTotal').textContent = ''; cabecalhoEstoque(); if (!$('abaEstoque').hidden) carregarEstoque(); abrirTicket(); }
});

async function chamar(acao, extra) {
  const r = await fetch('/api/plugin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...CHAVE, acao, tel: ticket.tel, ticketId: ticket.id, vendedor: ticket.vendedor, cliente: ticket.cliente, contactId: ticket.contactId, ...extra }) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok || j.ok === false) throw new Error(j.erro || 'Não deu para falar com o motor da IA agora.');
  return j;
}

function abrirTicket() {
  aviso('');
  $('pvCliente').hidden = false;
  $('pvCliente').innerHTML = `<b>${esc(ticket.cliente || 'Cliente')}</b><small>${esc(fone(ticket.tel))}${ticket.depto ? ' · ' + esc(ticket.depto) : ''}</small>
    <small>Vendedor: ${esc(ticket.vendedor || 'ninguém assumiu ainda')}</small>`;
  carregar();
}
async function carregar() {
  $('pvSituacao').innerHTML = '<p class="muted">Buscando a IA deste cliente…</p>';
  try { ctx = await chamar('contexto'); desenhar(); }
  catch (err) { $('pvSituacao').innerHTML = `<p class="alerta" style="margin:0">${esc(err.message)}</p>`; }
}
function desenhar() {
  ajustarAbas();
  const ia = ctx.ia || {}, r = ctx.resumo || {};
  const cor = { atendendo: 'on', equipe: 'pausa', pausada: 'pausa', desligada: 'off', teste: 'off' }[ia.estado] || '';
  const titulo = { atendendo: 'IA atendendo', equipe: 'Equipe conversando', pausada: 'IA pausada neste atendimento', desligada: 'IA desligada', teste: 'IA em teste' }[ia.estado] || 'IA';
  const pode = ['atendendo', 'equipe', 'pausada'].includes(ia.estado);
  $('pvSituacao').innerHTML = `<div class="st-ia"><i class="${cor}"></i><div><h3>${esc(titulo)}</h3><p class="muted" style="font-size:13px;margin-top:2px">${esc(ia.texto || '')}</p></div></div>
    ${pode ? (ia.estado === 'pausada'
      ? '<button type="button" class="principal bt-largo" id="pvAlternar" data-acao="devolver">▶️ Devolver para a IA</button>'
      : '<button type="button" class="bt-largo" id="pvAlternar" data-acao="pausar">⏸️ Pausar a IA neste atendimento</button>') : ''}`;
  if ($('pvAlternar')) $('pvAlternar').onclick = alternar;
  desenharPainel(); desenharAgenda();
  // o que a IA já sabe, enxuto: nome, carros que viu e a última mensagem do cliente
  const vistos = (r.vistos || []).map(v => `<li>${esc(v.nome)}${v.preco ? ' — ' + Number(v.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : ''}</li>`).join('');
  $('pvResumo').hidden = false;
  $('pvResumo').innerHTML = `<h3>📋 O que a IA já sabe</h3>
    <p style="margin-top:6px"><span class="muted">Nome:</span> ${esc(r.nome || ticket.cliente || '—')}</p>
    ${vistos ? '<p class="muted" style="font-size:13px;margin-top:8px">🚗 Viu com a IA:</p><ul>' + vistos + '</ul>' : ''}
    ${r.ultimaCliente ? `<p class="muted" style="font-size:13px;margin-top:8px">Última mensagem do cliente${r.ultimaCliente.ts ? ' (' + esc(dataBR(r.ultimaCliente.ts)) + ')' : ''}:</p><div class="msg">${esc(r.ultimaCliente.texto)}</div>` : ''}`;
}

// ── painelzinho do cliente: tudo já guardado no motor e na LeadVox, nenhuma chamada de IA ──
const ha = ts => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return 'há ' + h + ' h' + (m % 60 && h < 3 ? ' ' + (m % 60) + ' min' : '');
  const d = Math.floor(h / 24); return 'há ' + d + (d === 1 ? ' dia' : ' dias');
};
const quandoBR = ms => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
const vezes = n => n === 1 ? '1 vez' : n + ' vezes';
function desenharPainel() {
  const p = ctx.painel; if (!p) { $('pvPainel').hidden = true; return; }
  // a LeadVox recusou o último envio da IA (WhatsApp desconectado, chave inválida): o vendedor avisa o gestor
  aviso(p.alerta ? '🔴 ' + p.alerta : '');
  const item = (ic, titulo, sub, cls) => `<div class="num${cls ? ' ' + cls : ''}"><span>${ic}</span><div><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  const espera = p.esperando
    ? item('⏱️', 'Cliente esperando ' + esc(ha(p.esperando)), 'A última mensagem foi dele.', 'alerta-num')
    : item('⏱️', 'Sem cliente esperando', p.ultimaLoja ? 'Última mensagem da loja ' + esc(ha(p.ultimaLoja.ts)) + (p.ultimaLoja.quem === 'ia' ? ' (IA)' : ' (equipe)') : '');
  const fu = p.followups || {}, eq = p.equipe || {};
  const subFu = [fu.ultimo ? 'último ' + esc(ha(fu.ultimo)) : '', fu.proximo && fu.proximo > Date.now() ? 'próximo ' + esc(quandoBR(fu.proximo)) : ''].filter(Boolean).join(' · ');
  const subEq = eq.ultimo ? 'última ' + esc(ha(eq.ultimo)) + (eq.nome ? ' (' + esc(eq.nome) + ')' : '') : 'Ninguém da equipe falou ainda.';
  $('pvPainel').hidden = false;
  $('pvPainel').innerHTML = `<h3>📊 Este cliente</h3><div class="nums">
    ${espera}
    ${item('🔁', 'Follow-ups da IA: ' + (fu.n ? esc(vezes(fu.n)) : 'nenhum ainda'), subFu)}
    ${item('💬', 'Equipe falou com ele: ' + (eq.n ? esc(vezes(eq.n)) : 'nenhuma vez'), subEq)}
    ${item('📍', p.etapa ? 'Etapa: ' + esc(p.etapa) : 'Sem oportunidade aberta no funil', p.etapa ? 'Oportunidade aberta no funil da LeadVox.' : '')}
  </div>`;
}

// ── agendar follow-up da IA: data, hora e o assunto; na hora a IA escreve no contexto ──
const RESULTADO = { enviado: 'O último follow-up agendado foi enviado', cancelado: 'O último follow-up agendado foi cancelado', ia_desligada: 'O último agendado não saiu: IA desligada',
  modo_teste: 'O último agendado não saiu: IA em modo de teste', waba_24h: 'O último agendado não saiu: WhatsApp oficial passou de 24 h (só modelo)' };
const local = d => { const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
function desenharAgenda() {
  const p = ctx.painel || {}, a = p.agenda, card = $('pvAgendar');
  card.hidden = false;
  if (a) {
    card.innerHTML = `<h3>📅 Follow-up da IA agendado</h3>
      <div class="num" style="margin-top:8px"><span>🗓️</span><div><b>${esc(quandoBR(a.quando))}</b><small>${a.assunto ? 'Assunto: ' + esc(a.assunto) : 'Retomar o último assunto da conversa'}${a.vendedor ? ' · por ' + esc(a.vendedor) : ''}</small></div></div>
      <button type="button" class="bt-largo" id="pvCancelar">Cancelar agendamento</button>`;
    $('pvCancelar').onclick = cancelarAgenda; return;
  }
  const ult = p.ultimaAgenda && RESULTADO[p.ultimaAgenda.resultado];
  const agora = new Date(), min = new Date(agora.getTime() + 10 * 60000);
  card.innerHTML = `<h3>📅 Agendar follow-up da IA</h3>
    <p class="muted" style="font-size:13px;margin-top:4px">Na hora marcada a IA manda uma mensagem retomando o assunto, mesmo com o atendimento finalizado. Fica registrado em nota interna.</p>
    ${ult ? `<p class="muted" style="font-size:12px;margin-top:6px">${esc(ult)} (${esc(ha(p.ultimaAgenda.em))}).</p>` : ''}
    <div class="atalhos" role="group" aria-label="Atalhos de data">
      <button type="button" class="sm" data-dias="1">Amanhã 10h</button><button type="button" class="sm" data-dias="2">Em 2 dias 10h</button><button type="button" class="sm" data-dias="7">Em 1 semana 10h</button>
    </div>
    <label for="pvQuando" style="margin-top:8px">Data e hora</label>
    <input id="pvQuando" type="datetime-local" min="${local(min)}" max="${local(new Date(agora.getTime() + 90 * 864e5))}">
    <label for="pvAssunto">O que a IA deve retomar <small>(opcional)</small></label>
    <textarea id="pvAssunto" maxlength="300" placeholder="Ex.: retomar a simulação do financiamento do Renegade"></textarea>
    <button type="button" class="principal bt-largo" id="pvAgendarBt">Agendar follow-up</button>
    <p class="muted" style="font-size:12px;margin-top:6px">WhatsApp oficial: passadas 24 h da última mensagem do cliente, só sai mensagem modelo (template). Aí a IA não manda e avisa em nota interna.</p>`;
  card.querySelectorAll('[data-dias]').forEach(b => b.onclick = () => { const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.dias)); d.setHours(10, 0, 0, 0); $('pvQuando').value = local(d); });
  $('pvAgendarBt').onclick = agendar;
}
async function agendar() {
  if (ocupado) return; const quando = $('pvQuando').value;
  if (!quando) { toast('Escolha a data e a hora.', true); $('pvQuando').focus(); return; }
  ocupado = true; const bt = $('pvAgendarBt'); bt.disabled = true; bt.textContent = 'Agendando…';
  try { const j = await chamar('agendar', { quando: quando.slice(0, 16), assunto: $('pvAssunto').value.trim() }); ctx = { ...ctx, ia: j.ia || ctx.ia, painel: j.painel || ctx.painel }; desenhar(); toast('Follow-up agendado. Ficou registrado em nota interna.'); }
  catch (err) { toast(err.message, true); bt.disabled = false; bt.textContent = 'Agendar follow-up'; }
  finally { ocupado = false; }
}
async function cancelarAgenda() {
  if (ocupado || !confirm('Cancelar o follow-up agendado deste cliente?')) return;
  ocupado = true; $('pvCancelar').disabled = true;
  try { const j = await chamar('cancelar'); ctx = { ...ctx, painel: j.painel || ctx.painel }; desenhar(); toast('Agendamento cancelado.'); }
  catch (err) { toast(err.message, true); desenhar(); }
  finally { ocupado = false; }
}
async function alternar(e) {
  if (ocupado) return; const acao = e.currentTarget.dataset.acao;
  if (acao === 'pausar' && !confirm('Pausar a IA neste atendimento? Ela não responde este cliente até você devolver ou o atendimento fechar.')) return;
  ocupado = true; e.currentTarget.disabled = true;
  try { const j = await chamar(acao); ctx = { ...ctx, ia: j.ia, painel: j.painel || ctx.painel }; desenhar(); toast(acao === 'pausar' ? 'IA pausada neste atendimento. Ficou registrado em nota interna.' : 'Atendimento devolvido para a IA.'); }
  catch (err) { toast(err.message, true); desenhar(); }
  finally { ocupado = false; }
}
// ── aba Estoque (mesma experiência do plugin Estoque LeadVox): lista com busca e filtros na hora; o detalhe abre a galeria
// para marcar as fotos; Ficha / Fotos / Vídeo mostram "vai chegar assim" com o texto editável e o preço opcional. ──
let esItens = null, esFiltro = 'todos', esAberto = null, esEnviando = false;
const MAX_FOTOS = 10;
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const kmTxt = n => n === null || n === undefined ? '' : Number(n) === 0 ? '0 km' : Number(n).toLocaleString('pt-BR') + ' km';
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const codigo = c => String(c || '').replace(/^[a-z]{1,4}:/i, '');
// marca + modelo + versão, sem repetir o que já está no título (ex.: versão "G 310 GS" igual ao modelo)
const titulo = v => [v.marca, v.modelo, v.versao].reduce((t, p) => p && !semAcento(t).includes(semAcento(p)) ? (t + ' ' + p).trim() : t, '') || v.nome;
const achar = id => (esItens || []).find(v => v.id === String(id));
const primeiroNome = () => ((ticket && ticket.cliente) || '').trim().split(/\s+/)[0] || 'o cliente';
const IC = {
  ficha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  fotos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3z"/><path d="m10 13 4-4"/></svg>',
  carro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M5 12h14"/></svg>'
};

// mensagens no mesmo padrão da IA
const linhaPreco = (v, com) => com && v.preco ? '\n◽ *' + brl(v.preco) + '*' : '';
// produto ou serviço: nome, descrição e o preço por unidade (se marcar); veículo: ano, cor, km e preço
const fichaCurta = (v, com) => ['produto', 'servico'].includes(v.tipoItem) ? '*' + v.nome + '*' + (v.descricao ? '\n' + v.descricao : '') + (com && v.preco ? '\n◽ *' + dinheiro(v.preco) + '* / ' + (v.unidade || 'un.') : '') : '🚗 *' + titulo(v) + '*' + (v.ano ? '\n◽ ' + v.ano : '') + (v.cor ? '\n◽ Cor: ' + v.cor : '') + (v.km !== null && v.km !== undefined ? '\n◽ ' + kmTxt(v.km) : '') + linhaPreco(v, com);
function fichaCompleta(v, com) {
  let t = fichaCurta(v, false) + (v.cambio ? '\n◽ Câmbio: ' + v.cambio : '') + (v.combustivel ? '\n◽ Combustível: ' + v.combustivel : '') + linhaPreco(v, com);
  if (v.opcionais && v.opcionais.length) t += '\n\n*Itens do veículo:*\n' + v.opcionais.map(o => '• ' + o).join('\n');
  if (v.obs) t += '\n\n' + v.obs;
  return t;
}
const textoVideo = v => '🎥 *' + titulo(v) + '*' + (v.ano ? ' ' + v.ano : '');

function cabecalhoEstoque() {
  const nome = (ticket && ticket.cliente) || 'Cliente', p = primeiroNome();
  $('esAv').textContent = nome.trim().charAt(0).toUpperCase() || '?';
  $('esPara').textContent = nome;
  $('esTermo').placeholder = 'Buscar veículo para ' + (p === 'o cliente' ? 'o cliente' : p);
}
async function carregarEstoque() {
  if (!ticket) { toast('Abra um atendimento na LeadVox primeiro.', true); return; }
  cabecalhoEstoque();
  $('esTotal').textContent = ''; $('esLista').innerHTML = '<div class="es-esq"></div><div class="es-esq"></div><div class="es-esq"></div>';
  try { const j = await chamar('estoque'); esItens = j.itens || []; desenharEstoque(); }
  catch (err) { esItens = null; $('esLista').innerHTML = `<div class="es-aviso"><strong>Não consegui carregar o estoque</strong>${esc(err.message)}<br><button type="button" class="sm" id="esDeNovo">Tentar de novo</button></div>`; $('esDeNovo').onclick = carregarEstoque; }
}
function desenharEstoque() {
  if (!esItens) return;
  if (modoCat() !== 'veiculos') return desenharProdutos();
  const termos = semAcento($('esTermo').value).split(/\s+/).filter(Boolean);
  const lista = esItens.filter(v => (esFiltro === 'todos' || (esFiltro === 'destaque' ? v.destaque : v.tipo === esFiltro))
    && termos.every(t => semAcento([v.nome, v.marca, v.modelo, v.versao, codigo(v.codigo), v.ano, v.cor, v.categoria].join(' ')).includes(t)));
  $('esTotal').textContent = lista.length === 1 ? '1 veículo' : lista.length + ' veículos';
  if (!lista.length) { $('esLista').innerHTML = `<div class="es-aviso"><strong>${esItens.length ? 'Nenhum veículo encontrado' : 'Nenhum veículo no estoque'}</strong>${esItens.length ? 'Tente outra marca ou modelo, ou toque em Todos.' : 'Os veículos aparecem aqui assim que a loja cadastra o estoque.'}</div>`; return; }
  $('esLista').innerHTML = lista.slice(0, 80).map(v => `<article class="card pv-veic">
    <button type="button" class="pv-veic-topo" data-abrir="${esc(v.id)}" aria-label="Ver detalhes de ${esc(titulo(v))}">
      <span class="pv-veic-foto">${v.capa ? `<img src="${esc(v.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : IC.carro}${v.fotos > 1 ? `<span>${v.fotos} fotos</span>` : ''}</span>
      <span class="pv-veic-info"><b>${esc(titulo(v))}</b>
        <small>${esc([v.ano, kmTxt(v.km), v.cor].filter(Boolean).join(' · '))}</small>
        <span class="pv-veic-preco">${v.preco ? `<strong>${esc(brl(v.preco))}</strong>` : '<em>Sem preço</em>'}${v.destaque ? '<span class="selo dest">Destaque</span>' : ''}${v.video ? '<span class="selo">Vídeo</span>' : ''}${v.codigo ? `<span class="selo">Cód. ${esc(codigo(v.codigo))}</span>` : ''}</span></span>
    </button>
    <div class="pv-veic-acoes">
      <button type="button" data-ficha="${esc(v.id)}">${IC.ficha}Ficha</button>
      <button type="button" data-fotos="${esc(v.id)}"${v.fotos ? '' : ' disabled'}>${IC.fotos}Fotos${v.fotos ? ' (' + v.fotos + ')' : ''}</button>
      <button type="button" data-video="${esc(v.id)}"${v.video ? '' : ' disabled title="Este veículo não tem vídeo"'}>${IC.video}Vídeo</button>
    </div></article>`).join('') + (lista.length > 80 ? '<p class="muted" style="font-size:13px">Mostrando 80. Busque pelo modelo para achar os outros.</p>' : '');
}

// ── folha que sobe: detalhe do veículo e "vai chegar assim" ──
let focoAntes = null;
function abrirFolha(t, meio, pe) {
  focoAntes = document.activeElement;
  $('folhaTitulo').textContent = t; $('folhaMeio').innerHTML = meio; $('folhaPe').innerHTML = pe; $('folhaMeio').scrollTop = 0;
  $('folha').classList.add('on'); $('fundo').classList.add('on'); $('folha').setAttribute('aria-hidden', 'false');
  setTimeout(() => { const f = $('folha').querySelector('.fechar'); if (f) f.focus(); }, 60);
}
function fecharFolha() {
  if (esEnviando) return;
  $('folha').classList.remove('on'); $('fundo').classList.remove('on'); $('folha').setAttribute('aria-hidden', 'true'); esAberto = null;
  if (focoAntes && focoAntes.focus) try { focoAntes.focus(); } catch (e) {}
}
const lin = (k, v) => v || v === 0 ? `<div class="ficha-l"><span>${esc(k)}</span><span>${esc(v)}</span></div>` : '';
function detalhe(id) {
  const v = achar(id); if (!v) return;
  esAberto = { v, sel: v.galeria.slice(0, MAX_FOTOS).map((_, i) => i) };
  const gal = v.galeria.length
    ? `<div class="sel"><span id="contaSel"></span><button type="button" data-todas>Marcar todas</button></div><div class="galeria">${v.galeria.map((f, i) =>
      `<button type="button" class="foto" data-foto="${i}" aria-pressed="${i < MAX_FOTOS}" aria-label="Foto ${i + 1}"><img src="${esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="marcar">${IC.check}</span><span class="num">${i + 1}</span></button>`).join('')}</div>`
    : '<div class="es-aviso"><strong>Sem fotos</strong>A loja ainda não colocou fotos deste veículo.</div>';
  const video = v.video ? `<div class="secao"><h3>Vídeo</h3><div class="video-box">${IC.video}<span>Vídeo do anúncio</span></div></div>` : '';
  const ficha = '<div class="secao"><h3>Ficha técnica</h3>' + lin('Ano', v.ano) + lin('Quilometragem', kmTxt(v.km)) + lin('Cor', v.cor) + lin('Câmbio', v.cambio) +
    lin('Combustível', v.combustivel) + lin('Categoria', v.categoria) + lin('Preço', v.preco ? brl(v.preco) : 'Sem preço no estoque') + lin('Código', codigo(v.codigo)) + '</div>';
  const ops = v.opcionais && v.opcionais.length ? `<div class="secao"><h3>Itens e opcionais</h3><div class="ops">${v.opcionais.map(o => `<span>${esc(o)}</span>`).join('')}</div></div>` : '';
  const obs = v.obs ? `<div class="secao"><h3>Observações</h3><p class="obs">${esc(v.obs)}</p></div>` : '';
  const convite = `<button type="button" class="btn" style="width:100%;margin-bottom:12px" data-convite="${esc(v.id)}">📄 Convite para ${testeDe(v)} em PDF</button>`;
  abrirFolha(titulo(v), convite + gal + video + ficha + ops + obs,
    `<button type="button" class="btn" data-ficha-completa="${esc(v.id)}">${IC.ficha}Ficha completa</button>` +
    (v.galeria.length ? `<button type="button" class="btn principal" id="btnEnviarFotos" data-enviar-fotos>${IC.fotos}Enviar fotos</button>` : ''));
  contarSel();
}
function contarSel() {
  if (!esAberto || !$('contaSel')) return;
  const n = esAberto.sel.length;
  $('contaSel').textContent = n + (n === 1 ? ' foto marcada' : ' fotos marcadas') + (n >= MAX_FOTOS ? ' (máximo ' + MAX_FOTOS + ')' : '');
  const b = $('btnEnviarFotos'); if (b) { b.disabled = !n; b.innerHTML = IC.fotos + (n ? 'Enviar ' + n + (n === 1 ? ' foto' : ' fotos') : 'Marque as fotos'); }
}
function marcarFoto(i) {
  const k = esAberto.sel.indexOf(i);
  if (k > -1) esAberto.sel.splice(k, 1);
  else { if (esAberto.sel.length >= MAX_FOTOS) return toast('Máximo de ' + MAX_FOTOS + ' fotos por envio.', true); esAberto.sel.push(i); esAberto.sel.sort((a, b) => a - b); }
  document.querySelectorAll('#folha .foto').forEach(el => el.setAttribute('aria-pressed', String(esAberto.sel.includes(Number(el.dataset.foto)))));
  contarSel();
}

// "vai chegar assim": anexo, texto editável e o preço só se o vendedor marcar
function confirmar(v, modo, fotos) {
  const plano = { v, modo, fotos: fotos || [] }, temPreco = !!v.preco && modo !== 'video';
  const texto = modo === 'video' ? textoVideo(v) : modo === 'completa' ? fichaCompleta(v, false) : fichaCurta(v, false);
  let anexo;
  if (modo === 'galeria') anexo = `<img src="${esc(plano.fotos[0])}" alt="" referrerpolicy="no-referrer">${plano.fotos.length}${plano.fotos.length === 1 ? ' foto' : ' fotos'}, o texto vai na primeira`;
  else if (modo === 'video') anexo = IC.video + 'Vídeo do veículo';
  else anexo = v.capa ? `<img src="${esc(v.capa)}" alt="" referrerpolicy="no-referrer">Foto de capa + texto` : IC.ficha + 'Só texto (veículo sem foto)';
  const nome = modo === 'galeria' ? 'Enviar fotos' : modo === 'video' ? 'Enviar vídeo' : modo === 'completa' ? 'Enviar ficha completa' : 'Enviar ficha';
  abrirFolha(nome,
    `<p class="previa-rot">Vai chegar assim para <b>${esc(primeiroNome())}</b>. Você pode editar o texto.</p>
    <div class="anexo">${anexo}</div>
    <textarea class="texto" id="textoEnvio" aria-label="Texto da mensagem" maxlength="3000">${esc(texto)}</textarea>
    ${temPreco ? `<label class="opcao"><input type="checkbox" id="comPreco"> Incluir o preço (${esc(brl(v.preco))})</label>` : ''}
    ${!v.preco && modo !== 'video' ? '<p class="dica">Este veículo está sem preço no estoque.</p>' : ''}
    <div class="progresso" id="progresso" hidden><i id="barra"></i></div>`,
    `<button type="button" class="btn" data-voltar>Voltar</button><button type="button" class="btn principal" data-confirmar>${IC.enviar}Enviar agora</button>`);
  $('folha').plano = plano;
  const cp = $('comPreco');
  if (cp) cp.onchange = () => {
    const t = $('textoEnvio'), comp = plano.modo === 'completa', base = comp ? fichaCompleta(v, cp.checked) : fichaCurta(v, cp.checked), antes = comp ? fichaCompleta(v, !cp.checked) : fichaCurta(v, !cp.checked);
    const linha = '\n◽ *' + brl(v.preco) + '*';
    t.value = t.value === antes ? base : (cp.checked ? t.value + linha : t.value.replace(linha, ''));
  };
}
async function enviarAgora() {
  const plano = $('folha').plano; if (!plano || esEnviando) return;
  if (!ticket) return toast('Abra o plugin dentro de um atendimento para enviar.', true);
  const v = plano.v, texto = ($('textoEnvio').value || '').trim();
  let itens = plano.restante;
  if (!itens) {
    if (plano.modo === 'galeria') itens = plano.fotos.map((f, i) => ({ mediaUrl: f, body: i === 0 ? texto : '' }));
    else if (plano.modo === 'video') itens = [{ mediaUrl: v.video, body: texto }];
    else itens = [v.capa ? { mediaUrl: v.capa, body: texto } : { body: texto }];
  }
  if (!itens.some(x => x.mediaUrl || x.body)) return toast('Escreva o texto da mensagem.', true);
  esEnviando = true;
  const pe = $('folhaPe'), bt = pe.querySelector('[data-confirmar]');
  pe.querySelectorAll('button').forEach(b => { b.disabled = true; });
  bt.textContent = itens.length > 1 ? 'Enviando ' + itens.length + ' mensagens…' : 'Enviando…';
  $('progresso').hidden = itens.length < 2; $('barra').style.width = '35%';
  try {
    const j = await chamar('enviar_carro', { itemId: v.id, modo: plano.modo === 'galeria' ? 'fotos' : plano.modo === 'capa' ? 'ficha' : plano.modo, itens });
    $('barra').style.width = '100%';
    if (j.seguidas < j.total) { plano.restante = itens.slice(j.seguidas); throw new Error('Saíram ' + j.seguidas + ' de ' + j.total + ' mensagens.'); }
    esEnviando = false; fecharFolha();
    toast(itens.length > 1 ? itens.length + ' mensagens enviadas para ' + primeiroNome() + '.' : 'Enviado para ' + primeiroNome() + '. Ficou registrado em nota interna.');
  } catch (err) {
    esEnviando = false; pe.querySelectorAll('button').forEach(b => { b.disabled = false; });
    bt.innerHTML = IC.enviar + (plano.restante ? 'Enviar o resto' : 'Tentar de novo');
    toast(err.message, true);
  }
}

// eventos da aba e da folha
$('esBusca').onsubmit = e => { e.preventDefault(); desenharEstoque(); };
let esTb; $('esTermo').oninput = () => { clearTimeout(esTb); esTb = setTimeout(desenharEstoque, 140); };
document.querySelectorAll('.es-chips [data-f]').forEach(b => b.onclick = () => {
  esFiltro = b.dataset.f;
  document.querySelectorAll('.es-chips [data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  desenharEstoque();
});
document.addEventListener('click', e => {
  const a = e.target.closest('button'); if (!a || !a.closest('#abaEstoque, #folha')) return;
  const d = n => a.getAttribute(n);
  if (d('data-abrir')) return detalhe(d('data-abrir'));
  if (d('data-ficha')) { const v = achar(d('data-ficha')); return v && confirmar(v, 'capa'); }
  if (d('data-fotos')) return detalhe(d('data-fotos'));
  if (d('data-video')) { const v = achar(d('data-video')); return v && confirmar(v, 'video'); }
  if (d('data-convite')) return abrirProposta(d('data-convite'));
  if (d('data-or-add')) { const v = achar(d('data-or-add')); if (v) { adicionarAoOrc(v); desenharProdutos(); } return; }
  if (d('data-ficha-completa')) { const v = achar(d('data-ficha-completa')); return v && confirmar(v, 'completa'); }
  if (a.hasAttribute('data-foto')) return marcarFoto(Number(d('data-foto')));
  if (a.hasAttribute('data-todas')) { esAberto.sel = esAberto.v.galeria.slice(0, MAX_FOTOS).map((_, i) => i); document.querySelectorAll('#folha .foto').forEach(el => el.setAttribute('aria-pressed', String(Number(el.dataset.foto) < MAX_FOTOS))); return contarSel(); }
  if (a.hasAttribute('data-enviar-fotos')) { const g = esAberto.v; return confirmar(g, 'galeria', esAberto.sel.map(i => g.galeria[i])); }
  if (a.hasAttribute('data-voltar')) { const p = $('folha').plano; if (p && (p.modo === 'galeria' || p.modo === 'completa')) return detalhe(p.v.id); return fecharFolha(); }
  if (a.hasAttribute('data-confirmar')) return enviarAgora();
  if (a.hasAttribute('data-fechar')) return fecharFolha();
});
$('fundo').onclick = fecharFolha;
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharFolha(); });

// ── aba Proposta: convite para test drive em PDF (identidade da loja + foto e ficha do veículo + condições do vendedor) ──
const EXTRAS_PADRAO = ['Documentação inclusa', 'Transferência grátis', 'Tanque cheio', 'Revisão feita', 'Laudo cautelar aprovado', 'Garantia de 3 meses'];
let prVeic = null, prForma = '', prExtras = new Set(), prExtrasLista = [...EXTRAS_PADRAO], prMsgEditada = false;
const testeDe = v => v && v.tipo === 'moto' ? 'test ride' : 'test drive';
function mensagemPadrao() {
  const p = primeiroNome();
  return `Oi${p === 'o cliente' ? '' : ', ' + p}! Preparei um convite especial para você conhecer ${prVeic ? 'o ' + titulo(prVeic) : 'o veículo'} de perto. Dá uma olhada nas condições no PDF e me diz o melhor dia para o seu ${testeDe(prVeic)} 😉`;
}
function listarParaProposta() {
  const lista = $('prBuscaLista'); if (!lista) return;
  if (!esItens) { lista.innerHTML = '<p class="muted" style="margin-top:8px">Carregando o estoque…</p>'; return; }
  const termos = semAcento($('prBusca').value).split(/\s+/).filter(Boolean);
  const l = esItens.filter(v => termos.every(t => semAcento([v.nome, v.marca, v.modelo, v.versao, codigo(v.codigo), v.ano, v.cor].join(' ')).includes(t))).slice(0, 6);
  lista.innerHTML = l.map(v => `<button type="button" data-pr-veic="${esc(v.id)}">${v.capa ? `<img src="${esc(v.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span><b>${esc(titulo(v))}</b>${esc([v.ano, v.preco ? brl(v.preco) : ''].filter(Boolean).join(' · '))}</span></button>`).join('')
    || '<p class="muted" style="margin-top:8px">Nenhum veículo encontrado.</p>';
  lista.querySelectorAll('[data-pr-veic]').forEach(b => b.onclick = () => escolherVeiculo(b.dataset.prVeic));
}
function desenharProposta() {
  const el = $('prVeiculo');
  if (!prVeic) {
    $('prForm').hidden = true;
    el.innerHTML = `<h3>Veículo</h3><p class="muted" style="font-size:13px;margin-top:4px">Escolha o veículo. A foto, a ficha técnica e o preço vêm do estoque.</p>
      <div class="es-busca" style="margin-top:8px"><span aria-hidden="true">🔍</span><input id="prBusca" type="search" maxlength="60" placeholder="Buscar veículo" aria-label="Buscar veículo para o convite"></div>
      <div class="pr-busca-lista" id="prBuscaLista"></div>`;
    $('prBusca').oninput = listarParaProposta; listarParaProposta();
    if (!esItens && ticket) carregarEstoque().then(listarParaProposta);
    return;
  }
  const v = prVeic;
  el.innerHTML = `<div class="pr-veic">${v.capa ? `<img src="${esc(v.capa)}" alt="" referrerpolicy="no-referrer">` : '<span class="sem" aria-hidden="true">🚗</span>'}
    <div><b>${esc(titulo(v))}</b><small class="muted">${esc([v.ano, kmTxt(v.km), v.cor].filter(Boolean).join(' · '))}</small><div>${v.preco ? `<strong>${esc(brl(v.preco))}</strong>` : '<small class="muted">Sem preço no estoque</small>'}</div></div></div>
    <div class="linha2"><button type="button" class="sm" id="prTrocarVeic">Trocar veículo</button><span class="muted" style="font-size:12px">Foto e ficha técnica completas vão no PDF.</span></div>
    <div id="prPreviaBox"></div>`;
  $('prTrocarVeic').onclick = () => { prVeic = null; desenharProposta(); };
  $('prForm').hidden = false;
  if (!prMsgEditada) $('prMensagem').value = mensagemPadrao();
}
function escolherVeiculo(id) { prVeic = achar(id); desenharProposta(); }
function abrirProposta(id) {
  fecharFolha();
  document.querySelector('#pvAbas [data-aba="proposta"]').click();
  escolherVeiculo(id);
  scrollTo(0, 0);
}
function desenharExtras() {
  $('prExtras').innerHTML = prExtrasLista.map((x, i) => `<button type="button" data-extra="${i}" aria-pressed="${prExtras.has(x)}">${esc(x)}</button>`).join('');
  $('prExtras').querySelectorAll('[data-extra]').forEach(b => b.onclick = () => { const x = prExtrasLista[+b.dataset.extra]; prExtras.has(x) ? prExtras.delete(x) : prExtras.add(x); desenharExtras(); });
}
$('prExtraAdd').onclick = () => {
  const x = $('prExtraNovo').value.trim(); if (!x) return;
  if (!prExtrasLista.includes(x)) prExtrasLista.push(x);
  prExtras.add(x); $('prExtraNovo').value = ''; desenharExtras();
};
$('prExtraNovo').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('prExtraAdd').click(); } };
document.querySelectorAll('#prFormas [data-forma]').forEach(b => b.onclick = () => {
  prForma = b.dataset.forma;
  document.querySelectorAll('#prFormas [data-forma]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('prParcelado').hidden = !['financiado', 'consorcio', 'cartao'].includes(prForma);
});
$('prTemTroca').onchange = () => { $('prTroca').hidden = !$('prTemTroca').checked; };
$('prMensagem').oninput = () => { prMsgEditada = true; };
function dadosProposta(modo) {
  const parcelado = ['financiado', 'consorcio', 'cartao'].includes(prForma), troca = $('prTemTroca').checked;
  return { modo, itemId: prVeic.id, forma: prForma, fotoUrl: prVeic.capa || '',
    entrada: parcelado ? $('prEntrada').value : '', banco: parcelado ? $('prBanco').value.trim() : '',
    parcelas: parcelado ? $('prParcelas').value : '', valorParcela: parcelado ? $('prValorParcela').value : '',
    troca: troca ? { modelo: $('prTrocaModelo').value.trim(), ano: $('prTrocaAno').value.trim(), km: $('prTrocaKm').value, valor: $('prTrocaValor').value } : {},
    extras: prExtrasLista.filter(x => prExtras.has(x)), validadeDias: Number($('prValidade').value),
    sugestao: $('prSugestao').value.trim(), obs: $('prObs').value.trim(), mensagem: $('prMensagem').value.trim() };
}
async function gerarProposta(modo) {
  if (ocupado || !prVeic) return;
  if (!ticket) return toast('Abra um atendimento na LeadVox primeiro.', true);
  if (modo === 'enviar' && !confirm(`Mandar o convite do ${titulo(prVeic)} para ${ticket.cliente || 'o cliente'}?`)) return;
  const bt = $(modo === 'previa' ? 'prPrevia' : 'prEnviar'), antes = bt.textContent;
  ocupado = true; bt.disabled = true; bt.textContent = modo === 'previa' ? 'Montando o PDF…' : 'Enviando o convite…';
  try {
    const j = await chamar('proposta', dadosProposta(modo));
    $('prPreviaBox').innerHTML = j.pdfUrl ? `<p style="margin-top:8px"><a href="${esc(j.pdfUrl)}" target="_blank" rel="noopener">📄 Abrir o PDF${modo === 'previa' ? ' (prévia)' : ''}</a></p>` : '';
    toast(modo === 'previa' ? 'Prévia pronta: toque em "Abrir o PDF".' : 'Convite enviado para ' + primeiroNome() + '. Ficou registrado em nota interna.' + (j.funil ? ' ' + j.funil : ''));
  } catch (err) { toast(err.message, true); }
  finally { ocupado = false; bt.disabled = false; bt.textContent = antes; }
}
$('prPrevia').onclick = () => gerarProposta('previa');
$('prForm').onsubmit = e => { e.preventDefault(); gerarProposta('enviar'); };
desenharExtras();

// ── segmento da loja: veículos (Estoque + Convite) ou produtos / serviços (catálogo + Proposta comercial no modelo Gran Rio) ──
const modoCat = () => (ctx && ctx.painel && ctx.painel.catalogo) || 'veiculos';
const ehServico = () => modoCat() === 'servicos';
function ajustarAbas() {
  const m = modoCat();
  document.querySelector('#pvAbas [data-aba="estoque"]').textContent = m === 'veiculos' ? '🚗 Estoque' : m === 'servicos' ? '🧾 Serviços' : '📦 Produtos';
  document.querySelector('#pvAbas [data-aba="proposta"]').textContent = m === 'veiculos' ? '📄 Convite' : '📄 Proposta';
}
const dinheiro = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numBR = s => { const t = String(s ?? '').trim(); const v = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(v) && v > 0 ? v : 0; };
const num2 = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// catálogo de produtos ou serviços: grupos como filtro, preço por unidade, adicionar à proposta, enviar ao cliente
function desenharProdutos() {
  const serv = ehServico(), nomeItem = serv ? 'serviço' : 'produto';
  const grupos = [...new Set(esItens.map(v => v.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (esFiltro !== 'todos' && !grupos.includes(esFiltro)) esFiltro = 'todos';
  $('esChips').innerHTML = ['todos', ...grupos].map(g => `<button type="button" data-g="${esc(g)}" aria-pressed="${g === esFiltro}">${g === 'todos' ? 'Todos' : esc(g)}</button>`).join('');
  $('esChips').querySelectorAll('[data-g]').forEach(b => b.onclick = () => { esFiltro = b.dataset.g; desenharProdutos(); });
  const termos = semAcento($('esTermo').value).split(/\s+/).filter(Boolean);
  const lista = esItens.filter(v => (esFiltro === 'todos' || v.categoria === esFiltro) && termos.every(t => semAcento([v.nome, v.categoria, v.descricao, codigo(v.codigo)].join(' ')).includes(t)));
  $('esTotal').textContent = lista.length + ' ' + (lista.length === 1 ? nomeItem : nomeItem + 's');
  if (!lista.length) { $('esLista').innerHTML = `<div class="es-aviso"><strong>${esItens.length ? 'Nada encontrado' : 'Catálogo vazio'}</strong>${esItens.length ? 'Tente outro nome ou toque em Todos.' : 'Os ' + nomeItem + 's aparecem aqui assim que a loja cadastra no painel.'}</div>`; return; }
  $('esLista').innerHTML = lista.slice(0, 120).map(v => {
    const it = orc.itens.find(i => i.id === v.id);
    return `<article class="card pv-veic">
    <button type="button" class="pv-veic-topo" ${v.fotos ? `data-abrir="${esc(v.id)}"` : 'tabindex="-1"'} aria-label="${esc(v.nome)}">
      <span class="pv-veic-foto">${v.capa ? `<img src="${esc(v.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : (serv ? '🧾' : '📦')}${v.fotos > 1 ? `<span>${v.fotos} fotos</span>` : ''}</span>
      <span class="pv-veic-info"><b style="text-transform:none">${esc(v.nome)}</b>
        ${v.descricao ? `<small>${esc(v.descricao.slice(0, 110))}</small>` : ''}
        <span class="pv-veic-preco">${v.preco ? `<strong>${esc(dinheiro(v.preco))}</strong><em>/ ${esc(v.unidade || (serv ? 'serviço' : 'un.'))}</em>` : '<em>Sob consulta</em>'}${v.categoria ? `<span class="selo">${esc(v.categoria)}</span>` : ''}</span></span>
    </button>
    <div class="pv-veic-acoes">
      <button type="button" class="add-or${it ? ' dentro' : ''}" data-or-add="${esc(v.id)}">${it ? '✓ ' + esc(String(it.qtd).replace('.', ',')) + ' na proposta' : '➕ Proposta'}</button>
      <button type="button" data-ficha="${esc(v.id)}">${IC.enviar}Enviar</button>
      <button type="button" data-fotos="${esc(v.id)}"${v.fotos ? '' : ' disabled'}>${IC.fotos}Fotos${v.fotos ? ' (' + v.fotos + ')' : ''}</button>
    </div></article>`;
  }).join('');
}

// ── proposta comercial: rascunho por atendimento (fica neste navegador) ──
const PAGAMENTOS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Transferência', 'Faturado'];
const orcVazio = () => ({ itens: [], pagamento: [], faturado: '28 dias', desc: { tipo: 'pct', valor: 0 }, frete: { tipo: 'combinar', valor: 0 }, entrega: '', validade: 7, doc: '', obs: '', msg: '', msgEditada: false });
let orc = orcVazio();
const chaveOrc = () => 'lv_orc_' + CHAVE.k + '_' + (ticket ? ticket.id : '');
function lerOrc() { try { const o = JSON.parse(localStorage.getItem(chaveOrc()) || 'null'); orc = o && Array.isArray(o.itens) ? { ...orcVazio(), ...o } : orcVazio(); } catch (e) { orc = orcVazio(); } }
function guardarOrc() { try { localStorage.setItem(chaveOrc(), JSON.stringify(orc)); } catch (e) {} }
function calcOrc() {
  const sub = Math.round(orc.itens.reduce((t, i) => t + (Number(i.qtd) || 0) * (Number(i.preco) || 0), 0) * 100) / 100;
  const dv = Number(orc.desc.valor) || 0, desc = Math.round((orc.desc.tipo === 'pct' ? sub * Math.min(dv, 100) / 100 : Math.min(dv, sub)) * 100) / 100;
  const frete = !ehServico() && orc.frete.tipo === 'cobrado' ? Number(orc.frete.valor) || 0 : 0;
  return { sub, desc, frete, total: Math.round((sub - desc + frete) * 100) / 100 };
}
const textoPagamento = () => {
  const f = orc.pagamento.map(p => p === 'Faturado' ? 'Faturado em ' + orc.faturado : p);
  return !f.length ? '' : f.length === 1 ? f[0] : f.slice(0, -1).join(', ') + ' ou ' + f[f.length - 1];
};
function mensagemOrc() {
  const p = primeiroNome(), t = calcOrc();
  return `Oi${p === 'o cliente' ? '' : ', ' + p}! Segue a ${ehServico() ? 'proposta de orçamento' : 'proposta'} que preparei para você, no total de ${dinheiro(t.total)}. Qualquer ajuste de quantidade ou condição, é só me dizer por aqui.`;
}
function adicionarAoOrc(v) {
  const it = orc.itens.find(i => i.id === v.id);
  if (it) it.qtd = (Number(it.qtd) || 0) + 1;
  else orc.itens.push({ id: v.id, nome: v.nome, qtd: 1, preco: Number(v.preco) || 0, precoTab: Number(v.preco) || 0, unidade: v.unidade || (ehServico() ? 'serviço' : 'un.') });
  guardarOrc(); toast('“' + v.nome + '” na proposta (' + orc.itens.length + (orc.itens.length === 1 ? ' item' : ' itens') + ').');
}
function desenharOrcamento() {
  const serv = ehServico();
  $('orTitulo').textContent = serv ? '📄 Proposta de orçamento' : '📄 Proposta comercial';
  $('orFreteBox').hidden = serv; $('orEntregaRot').textContent = serv ? 'Prazo de execução' : 'Prazo de entrega';
  $('orQtdItens').textContent = orc.itens.length ? '· ' + orc.itens.length + (orc.itens.length === 1 ? ' item' : ' itens') : '';
  $('orItens').innerHTML = orc.itens.length ? orc.itens.map((it, i) => {
    const fora = it.id && it.precoTab && Math.abs(Number(it.preco) - it.precoTab) > 0.004;
    return `<div class="or-it">
      <div class="or-it-nome">${it.id ? `<b>${esc(it.nome)}</b>` : `<input data-or-nome="${i}" value="${esc(it.nome)}" maxlength="160" placeholder="Nome do item" aria-label="Nome do item">`}
        <button type="button" class="sm leve or-x" data-or-rm="${i}" aria-label="Tirar ${esc(it.nome || 'item')}">×</button></div>
      <div class="or-ctl"><div class="or-stp"><button type="button" data-or-q="-" data-i="${i}" aria-label="Menos">−</button><input data-or-qtd="${i}" inputmode="decimal" value="${esc(String(it.qtd).replace('.', ','))}" aria-label="Quantidade"><button type="button" data-or-q="+" data-i="${i}" aria-label="Mais">+</button></div>
        <label class="or-preco">R$ <input data-or-preco="${i}" inputmode="decimal" value="${esc(num2(it.preco))}" aria-label="Valor por ${esc(it.unidade)}"> / ${esc(it.unidade)}</label>
        <span class="or-sub" data-or-sub="${i}">${esc(dinheiro((Number(it.qtd) || 0) * (Number(it.preco) || 0)))}</span></div>
      ${fora ? `<span class="or-aviso">Preço diferente do catálogo (${esc(dinheiro(it.precoTab))}).</span>` : ''}
    </div>`;
  }).join('') : '<p class="muted" style="margin-top:8px">Nenhum item ainda. Toque em “+ Do catálogo” ou em “➕ Proposta” nos ' + (serv ? 'serviços' : 'produtos') + '.</p>';
  $('orPagamentos').innerHTML = PAGAMENTOS.map(p => `<button type="button" data-pg="${esc(p)}" aria-pressed="${orc.pagamento.includes(p)}">${esc(p)}</button>`).join('');
  $('orFaturadoBox').hidden = !orc.pagamento.includes('Faturado'); $('orFaturado').value = orc.faturado;
  document.querySelectorAll('#orDescTipo [data-dt]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dt === orc.desc.tipo)));
  $('orDescValor').value = orc.desc.valor ? num2(orc.desc.valor).replace(/,00$/, '') : '';
  document.querySelectorAll('#orFrete [data-fr]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fr === orc.frete.tipo)));
  $('orFreteValorBox').hidden = orc.frete.tipo !== 'cobrado'; $('orFreteValor').value = orc.frete.valor ? num2(orc.frete.valor) : '';
  $('orEntrega').value = orc.entrega; $('orValidade').value = String(orc.validade); $('orDoc').value = orc.doc; $('orObs').value = orc.obs;
  if (!orc.msgEditada) orc.msg = mensagemOrc();
  $('orMensagem').value = orc.msg;
  ligarItensOrc(); resumoOrc();
}
function resumoOrc() {
  const t = calcOrc(), un = orc.itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
  $('orResumo').innerHTML = `<h3>Resumo</h3>
    <div><span class="muted">Itens</span><b>${orc.itens.length} · ${esc(un.toLocaleString('pt-BR'))} ${ehServico() ? 'un.' : 'unidades'}</b></div>
    <div><span class="muted">Subtotal</span><b>${esc(dinheiro(t.sub))}</b></div>
    ${t.desc ? `<div><span class="muted">Desconto</span><b>- ${esc(dinheiro(t.desc))}</b></div>` : ''}
    ${t.frete ? `<div><span class="muted">Frete</span><b>${esc(dinheiro(t.frete))}</b></div>` : ''}
    <div><span class="muted">Pagamento</span><b>${esc(textoPagamento() || 'A combinar')}</b></div>
    <div class="grande"><span>Total</span><span>${esc(dinheiro(t.total))}</span></div>`;
  orc.itens.forEach((it, i) => { const el = document.querySelector(`[data-or-sub="${i}"]`); if (el) el.textContent = dinheiro((Number(it.qtd) || 0) * (Number(it.preco) || 0)); });
  if (!orc.msgEditada) { orc.msg = mensagemOrc(); $('orMensagem').value = orc.msg; }
}
function ligarItensOrc() {
  const mudou = () => { guardarOrc(); resumoOrc(); };
  document.querySelectorAll('[data-or-rm]').forEach(b => b.onclick = () => { orc.itens.splice(+b.dataset.orRm, 1); guardarOrc(); desenharOrcamento(); });
  document.querySelectorAll('[data-or-q]').forEach(b => b.onclick = () => {
    const it = orc.itens[+b.dataset.i]; it.qtd = Math.max(1, Math.round(((Number(it.qtd) || 0) + (b.dataset.orQ === '+' ? 1 : -1)) * 1000) / 1000);
    document.querySelector(`[data-or-qtd="${b.dataset.i}"]`).value = String(it.qtd).replace('.', ','); mudou();
  });
  document.querySelectorAll('[data-or-qtd]').forEach(el => el.oninput = () => { orc.itens[+el.dataset.orQtd].qtd = numBR(el.value); mudou(); });
  document.querySelectorAll('[data-or-preco]').forEach(el => el.oninput = () => { orc.itens[+el.dataset.orPreco].preco = numBR(el.value); mudou(); });
  document.querySelectorAll('[data-or-preco]').forEach(el => el.onblur = () => desenharOrcamento());
  document.querySelectorAll('[data-or-nome]').forEach(el => el.oninput = () => { orc.itens[+el.dataset.orNome].nome = el.value; guardarOrc(); });
  document.querySelectorAll('#orPagamentos [data-pg]').forEach(b => b.onclick = () => {
    const p = b.dataset.pg; orc.pagamento = orc.pagamento.includes(p) ? orc.pagamento.filter(x => x !== p) : [...orc.pagamento, p];
    guardarOrc(); desenharOrcamento();
  });
}
// campos fixos das condições (ligados uma vez)
$('orDoCatalogo').onclick = () => document.querySelector('#pvAbas [data-aba="estoque"]').click();
$('orAvulso').onclick = () => { orc.itens.push({ id: '', nome: '', qtd: 1, preco: 0, precoTab: 0, unidade: ehServico() ? 'serviço' : 'un.' }); guardarOrc(); desenharOrcamento(); const n = document.querySelector(`[data-or-nome="${orc.itens.length - 1}"]`); if (n) n.focus(); };
document.querySelectorAll('#orDescTipo [data-dt]').forEach(b => b.onclick = () => { orc.desc.tipo = b.dataset.dt; guardarOrc(); desenharOrcamento(); });
$('orDescValor').oninput = () => { orc.desc.valor = numBR($('orDescValor').value); guardarOrc(); resumoOrc(); };
document.querySelectorAll('#orFrete [data-fr]').forEach(b => b.onclick = () => { orc.frete.tipo = b.dataset.fr; guardarOrc(); desenharOrcamento(); });
$('orFreteValor').oninput = () => { orc.frete.valor = numBR($('orFreteValor').value); guardarOrc(); resumoOrc(); };
$('orFaturado').onchange = () => { orc.faturado = $('orFaturado').value; guardarOrc(); resumoOrc(); };
$('orEntrega').oninput = () => { orc.entrega = $('orEntrega').value; guardarOrc(); };
$('orValidade').onchange = () => { orc.validade = Number($('orValidade').value); guardarOrc(); };
$('orDoc').oninput = () => { orc.doc = $('orDoc').value; guardarOrc(); };
$('orObs').oninput = () => { orc.obs = $('orObs').value; guardarOrc(); };
$('orMensagem').oninput = () => { orc.msg = $('orMensagem').value; orc.msgEditada = true; guardarOrc(); };
$('orLimpar').onclick = () => { if (!confirm('Começar outra proposta? Os itens e condições desta somem.')) return; orc = orcVazio(); guardarOrc(); $('orLink').innerHTML = ''; desenharOrcamento(); };
async function gerarOrcamento(modo) {
  if (ocupado) return;
  if (!ticket) return toast('Abra um atendimento na LeadVox primeiro.', true);
  const itens = orc.itens.filter(i => (i.id || String(i.nome).trim()) && Number(i.qtd) > 0);
  if (!itens.length) return toast('Adicione pelo menos um item com quantidade.', true);
  if (orc.itens.some(i => !i.id && !String(i.nome).trim())) return toast('Tem item sem nome. Preencha ou tire da proposta.', true);
  const t = calcOrc();
  if (modo === 'enviar' && !confirm(`Mandar a proposta de ${dinheiro(t.total)} para ${ticket.cliente || 'o cliente'}?`)) return;
  const bt = $(modo === 'previa' ? 'orPrevia' : 'orEnviar'), antes = bt.textContent;
  ocupado = true; bt.disabled = true; bt.textContent = modo === 'previa' ? 'Montando o PDF…' : 'Enviando a proposta…';
  try {
    const j = await chamar('orcamento', { modo, itens: itens.map(i => ({ id: i.id, nome: i.id ? '' : i.nome, qtd: i.qtd, preco: i.preco, unidade: i.unidade })),
      desconto: orc.desc, frete: ehServico() ? { tipo: 'combinar' } : orc.frete, pagamento: textoPagamento(), entrega: orc.entrega, validadeDias: orc.validade,
      documento: orc.doc, obs: orc.obs, mensagem: orc.msg });
    $('orLink').innerHTML = j.pdfUrl ? `<p style="margin-top:10px"><a href="${esc(j.pdfUrl)}" target="_blank" rel="noopener">📄 Abrir o PDF nº ${esc(j.numero || '')}${modo === 'previa' ? ' (prévia)' : ''}</a></p>` : '';
    toast(modo === 'previa' ? 'Prévia pronta: toque em "Abrir o PDF".' + (j.aviso ? ' Obs.: ' + j.aviso + '.' : '') : 'Proposta enviada para ' + primeiroNome() + '. Ficou registrado em nota interna.' + (j.funil ? ' ' + j.funil : ''));
  } catch (err) { toast(err.message, true); }
  finally { ocupado = false; bt.disabled = false; bt.textContent = antes; }
}
$('orPrevia').onclick = () => gerarOrcamento('previa');
$('orEnviar').onclick = () => gerarOrcamento('enviar');

document.querySelectorAll('#pvAbas [data-aba]').forEach(b => b.onclick = () => {
  document.querySelectorAll('#pvAbas [data-aba]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  const veic = modoCat() === 'veiculos';
  ['ia', 'estoque', 'proposta'].forEach(a => { $('aba' + a.charAt(0).toUpperCase() + a.slice(1)).hidden = a !== b.dataset.aba || (a === 'proposta' && !veic); });
  $('abaOrcamento').hidden = !(b.dataset.aba === 'proposta' && !veic);
  if (b.dataset.aba === 'estoque' && ticket) { cabecalhoEstoque(); if (!esItens) carregarEstoque(); }
  if (b.dataset.aba === 'proposta') { if (veic) desenharProposta(); else { if (ticket && !esItens) carregarEstoque(); desenharOrcamento(); } }
});

// início: sem a chave da loja não há o que fazer; fora da LeadVox, explica como abrir
if (!/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(CHAVE.k) || !/^[0-9a-f]{24}$/.test(CHAVE.t)) aviso('Link do plugin incompleto. Peça o link ao gestor (painel → Canais WhatsApp → Plugin do Vendedor).');
else setTimeout(() => { if (!ticket) aviso(window.top === window ? 'Este plugin abre dentro da LeadVox, ao lado do atendimento.' : 'Abra um atendimento na LeadVox para ver os dados do cliente.'); }, 4000);
