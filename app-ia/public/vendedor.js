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
  return { id: String(t.id), tel: String(c.number || t.number || ''), cliente: c.name || c.pushname || '',
    vendedor: (t.user && t.user.name) || '', depto: (t.queue && (t.queue.queue || t.queue.name)) || '' };
}
window.addEventListener('message', ev => {
  let host = ''; try { host = new URL(ev.origin).hostname; } catch (e) { return; }
  if (!/(^|\.)leadvox\.com\.br$/.test(host)) return;
  let m = ev.data; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  const t = m && m.type === 'DEFAULT_DATA' && m.data ? lerTicket(m.data.ticket) : null;
  if (t && (!ticket || t.id !== ticket.id || t.vendedor !== ticket.vendedor)) { ticket = t; abrirTicket(); }
});

async function chamar(acao) {
  const r = await fetch('/api/plugin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...CHAVE, acao, tel: ticket.tel, ticketId: ticket.id, vendedor: ticket.vendedor, cliente: ticket.cliente }) });
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
  const vistos = (r.vistos || []).map(v => `<li>${esc(v.nome)}${v.preco ? ' — ' + Number(v.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : ''}</li>`).join('');
  $('pvResumo').hidden = false;
  $('pvResumo').innerHTML = `<h3>📋 O que a IA já sabe</h3>
    <div class="ag-dados" style="margin-top:6px"><div><span>Nome</span>${esc(r.nome || ticket.cliente || '—')}</div><div><span>Mensagens guardadas</span>${esc(r.mensagens || 0)}</div></div>
    ${vistos ? '<p class="muted" style="font-size:13px;margin-top:8px">Viu com a IA:</p><ul>' + vistos + '</ul>' : ''}
    ${r.ultimaCliente ? `<p class="muted" style="font-size:13px;margin-top:8px">Última mensagem do cliente${r.ultimaCliente.ts ? ' (' + esc(dataBR(r.ultimaCliente.ts)) + ')' : ''}:</p><div class="msg">${esc(r.ultimaCliente.texto)}</div>` : ''}`;
  $('pvAgendar').hidden = false;
}
async function alternar(e) {
  if (ocupado) return; const acao = e.currentTarget.dataset.acao;
  if (acao === 'pausar' && !confirm('Pausar a IA neste atendimento? Ela não responde este cliente até você devolver ou o atendimento fechar.')) return;
  ocupado = true; e.currentTarget.disabled = true;
  try { const j = await chamar(acao); ctx = { ...ctx, ia: j.ia }; desenhar(); toast(acao === 'pausar' ? 'IA pausada neste atendimento. Ficou registrado em nota interna.' : 'Atendimento devolvido para a IA.'); }
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
