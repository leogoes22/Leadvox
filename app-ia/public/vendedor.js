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
  if (t && (!ticket || t.id !== ticket.id || t.vendedor !== ticket.vendedor)) { ticket = t; abrirTicket(); }
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
document.querySelectorAll('#pvAbas [data-aba]').forEach(b => b.onclick = () => {
  document.querySelectorAll('#pvAbas [data-aba]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  ['ia', 'estoque', 'proposta'].forEach(a => { $('aba' + a.charAt(0).toUpperCase() + a.slice(1)).hidden = a !== b.dataset.aba; });
});

// início: sem a chave da loja não há o que fazer; fora da LeadVox, explica como abrir
if (!/^[a-z0-9-]{1,24}-[0-9a-f]{8}$/.test(CHAVE.k) || !/^[0-9a-f]{24}$/.test(CHAVE.t)) aviso('Link do plugin incompleto. Peça o link ao gestor (painel → Canais WhatsApp → Plugin do Vendedor).');
else setTimeout(() => { if (!ticket) aviso(window.top === window ? 'Este plugin abre dentro da LeadVox, ao lado do atendimento.' : 'Abra um atendimento na LeadVox para ver os dados do cliente.'); }, 4000);
