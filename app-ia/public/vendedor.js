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
  if (t && (!ticket || t.id !== ticket.id || t.vendedor !== ticket.vendedor)) { ticket = t; esItens = null; $('esLista').innerHTML = ''; $('esTotal').textContent = ''; cabecalhoEstoque(); if (!$('abaEstoque').hidden) carregarEstoque(); abrirTicket(); }
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
const titulo = v => [v.marca, v.modelo, v.versao].filter(Boolean).join(' ') || v.nome;
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
const fichaCurta = (v, com) => '🚗 *' + titulo(v) + '*' + (v.ano ? '\n◽ ' + v.ano : '') + (v.cor ? '\n◽ Cor: ' + v.cor : '') + (v.km !== null && v.km !== undefined ? '\n◽ ' + kmTxt(v.km) : '') + linhaPreco(v, com);
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
  abrirFolha(titulo(v), gal + video + ficha + ops + obs,
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

document.querySelectorAll('#pvAbas [data-aba]').forEach(b => b.onclick = () => {
  document.querySelectorAll('#pvAbas [data-aba]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  ['ia', 'estoque', 'proposta'].forEach(a => { $('aba' + a.charAt(0).toUpperCase() + a.slice(1)).hidden = a !== b.dataset.aba; });
  if (b.dataset.aba === 'estoque' && ticket) { cabecalhoEstoque(); if (!esItens) carregarEstoque(); }
});

// início: sem a chave da loja não há o que fazer; fora da LeadVox, explica como abrir
if (!/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(CHAVE.k) || !/^[0-9a-f]{24}$/.test(CHAVE.t)) aviso('Link do plugin incompleto. Peça o link ao gestor (painel → Canais WhatsApp → Plugin do Vendedor).');
else setTimeout(() => { if (!ticket) aviso(window.top === window ? 'Este plugin abre dentro da LeadVox, ao lado do atendimento.' : 'Abra um atendimento na LeadVox para ver os dados do cliente.'); }, 4000);
