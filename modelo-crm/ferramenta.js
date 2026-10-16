/* ═══════════════════════════════════════════════════════════════════════════
   LeadVox · Modelo de CRM  (v1 · out/2026)
   Copia a ESTRUTURA do CRM de uma conta LeadVox para outra:
   filas, etiquetas, funis e etapas, status do lead, origens, motivos de
   fechamento, motivos de ganho/perda, campos personalizados e respostas rápidas.
   Nunca copia contatos, conversas, usuários, canais ou oportunidades.

   Roda dentro do painel da LeadVox (chat.leadvox.com.br, chat2…), com o
   usuário admin já logado — usa a própria sessão do painel.
   Abre pelo favorito "Modelo de CRM" (leadvox.com.br/modelo-crm/).
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  if (window.__lvModeloCrm && document.getElementById('lv-modelo-crm')) { window.__lvModeloCrm.abrir(); return; }

  const API = localStorage.getItem('backendUrl');
  if (!API || !/leadvox\.com\.br/.test(location.hostname)) {
    alert('Abra esta ferramenta dentro do painel da LeadVox (ex.: chat.leadvox.com.br), já logado como admin.');
    return;
  }

  // ── sessão: pega um token novo pela própria sessão do painel (cookie) ──
  let TOKEN = null;
  async function renovar() {
    const r = await fetch(API + '/auth/refresh_token', { method: 'POST', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) throw new Error('Sua sessão no painel expirou. Entre de novo na LeadVox e abra a ferramenta outra vez.');
    TOKEN = j.token;
  }
  async function api(metodo, caminho, corpo) {
    if (!TOKEN) await renovar();
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await fetch(API + caminho, {
        method: metodo,
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch (e) { j = txt; }
      if ((r.status === 401 || r.status === 403) && tentativa === 0 && /token/i.test(txt)) { await renovar(); continue; }
      return { ok: r.ok, status: r.status, dados: j };
    }
  }
  const lista = (j) => Array.isArray(j) ? j : (j && typeof j === 'object' ? (Object.values(j).find(Array.isArray) || []) : []);
  const N = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const SEM = ['id', 'tenantId', 'userId', 'createdAt', 'updatedAt'];
  const limpo = (o) => { const c = { ...o }; SEM.forEach(k => delete c[k]); return c; };

  // ── o que existe em cada tipo ──
  const TIPOS = [
    { k: 'filas', rot: 'Filas (departamentos)', get: '/queue/', post: '/queue/', nome: 'queue' },
    { k: 'etiquetas', rot: 'Etiquetas', get: '/tags/', post: '/tags/', nome: 'tag' },
    { k: 'funisCliente', rot: 'Funis da Gestão de Cliente', get: '/funnel/', post: '/funnel/', nome: 'name' },
    { k: 'pipelines', rot: 'Funis de venda (pipeline) e etapas', get: '/pipelines?includeSteps=true', post: '/pipelines', nome: 'name' },
    { k: 'statusLead', rot: 'Status do lead', get: '/lead-status/', post: '/lead-status/', nome: 'status' },
    { k: 'origens', rot: 'Origens do lead', get: '/lead-origin/', post: '/lead-origin/', nome: 'name' },
    { k: 'motivosFechamento', rot: 'Motivos de fechamento', get: '/closing-reason/', post: '/closing-reason/', nome: 'reason' },
    { k: 'ganhoPerda', rot: 'Motivos de ganho/perda', get: '/gain-loss-reason/', post: '/gain-loss-reason/', nome: 'name' },
    { k: 'campos', rot: 'Campos personalizados', get: '/custom-field/', post: '/custom-field/', nome: 'name' },
    { k: 'respostas', rot: 'Respostas rápidas', get: '/fastreply/', post: '/fastreply/', nome: 'key' }
  ];
  const nomeDe = (tipo, o) => o[tipo.nome] ?? o.name ?? o.label ?? o.title ?? '';

  async function lerConta() {
    const conta = {};
    for (const t of TIPOS) {
      const r = await api('GET', t.get);
      if (!r.ok) throw new Error('Não consegui ler ' + t.rot + ' (HTTP ' + r.status + ').');
      conta[t.k] = lista(r.dados);
    }
    return conta;
  }

  // ── EXPORTAR: monta o modelo (sem IDs da conta, guardando só os vínculos por NOME) ──
  function montarModelo(conta, lojaNome) {
    const filaNome = Object.fromEntries(conta.filas.map(q => [q.id, q.queue]));
    const funilNome = Object.fromEntries(conta.funisCliente.map(f => [f.id, f.name]));
    const nomesFilas = (arr) => (arr || []).map(q => filaNome[q.id ?? q.queueId ?? q] || q.queue).filter(Boolean);
    return {
      tipo: 'leadvox-modelo-crm', versao: 1, geradoEm: new Date().toISOString(),
      origem: { painel: location.hostname, loja: lojaNome || '' },
      filas: conta.filas.map(q => ({ queue: q.queue, isActive: q.isActive !== false, messageDefaultContact: q.messageDefaultContact ?? null })),
      etiquetas: conta.etiquetas.map(t => ({ tag: t.tag, color: t.color, isActive: t.isActive !== false })),
      funisCliente: conta.funisCliente.map(f => limpo(f)),
      pipelines: conta.pipelines.map(p => ({ name: p.name, description: p.description ?? '', isDefault: !!p.isDefault, color: p.color,
        steps: (p.steps || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => ({ name: s.name, color: s.color, order: s.order, predefinedTasks: s.predefinedTasks || [] })) })),
      statusLead: conta.statusLead.map(s => ({ status: s.status, color: s.color, active: s.active !== false, funil: s.funnelId ? funilNome[s.funnelId] || null : null })),
      origens: conta.origens.map(o => ({ name: o.name, active: o.active !== false })),
      motivosFechamento: conta.motivosFechamento.map(m => ({ reason: m.reason, farewellMessage: m.farewellMessage ?? null, active: m.active !== false,
        sendSatisfactionSurvey: !!m.sendSatisfactionSurvey, sendSaleValue: !!m.sendSaleValue, funil: m.funnelId ? funilNome[m.funnelId] || null : null, filas: nomesFilas(m.queues) })),
      ganhoPerda: conta.ganhoPerda.map(m => ({ name: m.name, message: m.message ?? null, active: m.active !== false, funil: m.funnelId ? funilNome[m.funnelId] || null : null })),
      campos: conta.campos.map(c => limpo(c)),
      respostas: conta.respostas.map(r => ({ key: r.key, message: r.message ?? '', isUserReply: !!r.isUserReply, filas: nomesFilas(r.queues), midias: (r.medias || []).length }))
    };
  }

  // ── APLICAR: prévia e criação ──
  const trocaLoja = (txt, de, para) => {
    if (!txt || !de || !para) return txt;
    const esc = de.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return String(txt).replace(new RegExp(esc, 'gi'), para.trim());
  };
  function previa(modelo, conta) {
    const p = [];
    for (const t of TIPOS) {
      const itens = modelo[t.k] || [];
      const existe = new Set((conta[t.k] || []).map(o => N(nomeDe(t, o))));
      const novos = itens.filter(o => !existe.has(N(nomeDe(t, o))));
      p.push({ t, total: itens.length, novos, pulados: itens.length - novos.length });
    }
    return p;
  }

  async function aplicar(modelo, conta, de, para, log) {
    const rel = { criados: 0, pulados: 0, erros: [], avisos: [] };
    // 1) filas e funis da Gestão de Cliente primeiro (os outros itens apontam para eles)
    const idFila = Object.fromEntries((conta.filas || []).map(q => [N(q.queue), q.id]));
    const idFunil = Object.fromEntries((conta.funisCliente || []).map(f => [N(f.name), f.id]));

    const criar = async (t, corpo, nome) => {
      const r = await api('POST', t.post, corpo);
      await espera(120);
      if (r.ok) { rel.criados++; log('✓ ' + t.rot + ': ' + nome); return r.dados; }
      rel.erros.push(t.rot + ': ' + nome + ' (HTTP ' + r.status + ' ' + String(r.dados && r.dados.error || '').slice(0, 120) + ')');
      log('✗ ' + t.rot + ': ' + nome + ' (HTTP ' + r.status + ')'); return null;
    };
    const ja = (t) => new Set((conta[t.k] || []).map(o => N(nomeDe(t, o))));
    const T = Object.fromEntries(TIPOS.map(t => [t.k, t]));

    // filas
    { const t = T.filas, ex = ja(t);
      for (const q of modelo.filas || []) { if (ex.has(N(q.queue))) { rel.pulados++; continue; }
        const d = await criar(t, q, q.queue); if (d && d.id) idFila[N(q.queue)] = d.id; } }
    // funis da gestão de cliente
    { const t = T.funisCliente, ex = ja(t);
      for (const f of modelo.funisCliente || []) { if (ex.has(N(f.name))) { rel.pulados++; continue; }
        const d = await criar(t, f, f.name); if (d && d.id) idFunil[N(f.name)] = d.id; } }
    const filasIds = (nomes, onde) => (nomes || []).map(n => { const id = idFila[N(n)]; if (!id) rel.avisos.push(onde + ': a fila "' + n + '" não existe na conta, ficou sem vínculo.'); return id; }).filter(Boolean);
    const funilId = (nome) => nome ? (idFunil[N(nome)] || null) : null;

    // etiquetas
    { const t = T.etiquetas, ex = ja(t);
      for (const e of modelo.etiquetas || []) { if (ex.has(N(e.tag))) { rel.pulados++; continue; } await criar(t, e, e.tag); } }
    // funis de venda + etapas (a LeadVox grava as etapas junto com o funil)
    { const t = T.pipelines;
      const atuais = Object.fromEntries((conta.pipelines || []).map(p => [N(p.name), p]));
      for (const p of modelo.pipelines || []) {
        const steps = (p.steps || []).map((s, i) => ({ name: s.name, color: s.color, order: s.order ?? i + 1, predefinedTasks: s.predefinedTasks || [] }));
        const atual = atuais[N(p.name)];
        if (atual && (atual.steps || []).length) { rel.pulados++; continue; }
        let id = atual && atual.id;
        if (!id) { const d = await criar(t, { name: p.name, description: p.description, isDefault: p.isDefault, color: p.color }, p.name); id = d && d.id; }
        if (id && steps.length) {
          const r = await api('PUT', '/pipelines/' + id, { name: p.name, description: p.description, isDefault: p.isDefault, color: p.color, steps });
          await espera(120);
          if (r.ok) log('✓ Etapas do funil "' + p.name + '": ' + steps.length);
          else rel.erros.push('Etapas do funil "' + p.name + '" (HTTP ' + r.status + ')');
        }
      } }
    // status do lead
    { const t = T.statusLead, ex = ja(t);
      for (const s of modelo.statusLead || []) { if (ex.has(N(s.status))) { rel.pulados++; continue; }
        await criar(t, { status: s.status, color: s.color, active: s.active, funnelId: funilId(s.funil) }, s.status); } }
    // origens
    { const t = T.origens, ex = ja(t);
      for (const o of modelo.origens || []) { if (ex.has(N(o.name))) { rel.pulados++; continue; } await criar(t, o, o.name); } }
    // motivos de fechamento
    { const t = T.motivosFechamento, ex = ja(t);
      for (const m of modelo.motivosFechamento || []) { if (ex.has(N(m.reason))) { rel.pulados++; continue; }
        await criar(t, { reason: m.reason, farewellMessage: trocaLoja(m.farewellMessage, de, para), active: m.active,
          sendSatisfactionSurvey: m.sendSatisfactionSurvey, sendSaleValue: m.sendSaleValue, funnelId: funilId(m.funil),
          queues: filasIds(m.filas, 'Motivo "' + m.reason + '"') }, m.reason); } }
    // ganho / perda
    { const t = T.ganhoPerda, ex = ja(t);
      for (const m of modelo.ganhoPerda || []) { if (ex.has(N(m.name))) { rel.pulados++; continue; }
        await criar(t, { name: m.name, message: trocaLoja(m.message, de, para), active: m.active, funnelId: funilId(m.funil) }, m.name); } }
    // campos personalizados
    { const t = T.campos, ex = ja(t);
      for (const c of modelo.campos || []) { const nome = nomeDe(t, c); if (ex.has(N(nome))) { rel.pulados++; continue; } await criar(t, c, nome); } }
    // respostas rápidas
    { const t = T.respostas, ex = ja(t);
      for (const r of modelo.respostas || []) { if (ex.has(N(r.key))) { rel.pulados++; continue; }
        if (r.midias) rel.avisos.push('Resposta "' + r.key + '": tinha ' + r.midias + ' anexo(s) na conta de origem. O texto foi copiado; anexe a mídia de novo.');
        await criar(t, { key: r.key, message: trocaLoja(r.message, de, para), isUserReply: r.isUserReply, queues: filasIds(r.filas, 'Resposta "' + r.key + '"') }, r.key); } }
    return rel;
  }

  // textos que costumam ser da loja de origem e merecem revisão
  function paraRevisar(modelo) {
    const out = [];
    for (const r of modelo.respostas || []) {
      const m = String(r.message || '');
      if (/https?:\/\//i.test(m) || /\b(rua|r\.|av\.|avenida|estrada|rod\.)\s/i.test(m) || /\d{5}-?\d{3}/.test(m)) out.push('Resposta rápida "' + r.key + '": tem link ou endereço — confira se é da loja nova.');
    }
    return out;
  }

  // ═════════════════════════════ interface ═════════════════════════════
  const host = document.createElement('div');
  host.id = 'lv-modelo-crm';
  document.body.appendChild(host);
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Syne:wght@600;700&display=swap');
  :host{all:initial}
  .fundo{position:fixed;inset:0;background:rgba(3,7,16,.6);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto;font:14px/1.5 "DM Sans",system-ui,sans-serif;color:#e8edf7}
  .caixa{width:min(760px,100%);background:#070d1c;border:1px solid #1f2b4a;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  header{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #1f2b4a}
  .marca{font:700 18px Syne,sans-serif}.marca b{color:#2be87b}
  header .conta{flex:1;color:#8b97b3;font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .x{background:none;border:0;color:#8b97b3;font-size:22px;cursor:pointer;padding:0 4px}
  nav{display:flex;gap:6px;padding:12px 18px 0}
  nav button{background:#0e1730;border:1px solid #1f2b4a;color:#e8edf7;border-radius:999px;padding:7px 14px;cursor:pointer;font:600 13px "DM Sans",sans-serif}
  nav button[aria-selected="true"]{background:#2be87b;color:#070d1c;border-color:#2be87b}
  section{padding:16px 18px 20px}
  h2{font:700 17px Syne,sans-serif;margin:0 0 6px}
  p{margin:0 0 10px;color:#c5cde0}.muted{color:#8b97b3;font-size:13px}
  label{display:block;font-weight:600;margin:12px 0 4px}
  input[type=text],textarea{width:100%;box-sizing:border-box;background:#0e1730;border:1px solid #1f2b4a;border-radius:10px;color:#e8edf7;padding:9px 11px;font:inherit}
  textarea{min-height:90px;font:12px/1.4 ui-monospace,monospace}
  .duas{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.duas{grid-template-columns:1fr}}
  .bt{background:#2be87b;color:#070d1c;border:0;border-radius:10px;padding:10px 16px;font:700 14px "DM Sans",sans-serif;cursor:pointer;margin-top:14px}
  .bt.sec{background:#131e3b;color:#e8edf7;border:1px solid #1f2b4a}
  .bt:disabled{opacity:.5;cursor:default}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #1f2b4a}th{color:#8b97b3;font-weight:600}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  .ok{color:#2be87b}.av{color:#ffc457}.er{color:#ff6b6b}
  .caixinha{background:#0e1730;border:1px solid #1f2b4a;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:13px}
  .log{max-height:180px;overflow:auto;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap}
  .op{display:flex;gap:8px;align-items:flex-start;border:1px solid #1f2b4a;border-radius:10px;padding:9px 11px;margin-top:8px;cursor:pointer}
  .op input{margin-top:3px}
</style>
<div class="fundo"><div class="caixa" role="dialog" aria-label="Modelo de CRM">
  <header><div class="marca">Lead<b>Vox</b> · Modelo de CRM</div><div class="conta" id="conta"></div><button class="x" id="fechar" aria-label="Fechar">×</button></header>
  <nav><button id="abaExp" aria-selected="true">1 · Exportar desta conta</button><button id="abaApl" aria-selected="false">2 · Aplicar nesta conta</button></nav>
  <section id="secExp">
    <h2>Exportar a estrutura desta conta</h2>
    <p class="muted">Lê filas, etiquetas, funis, status, origens, motivos, campos e respostas rápidas. Nada é alterado aqui.</p>
    <label for="lojaOrig">Nome da loja como aparece nos textos (para trocar depois)</label>
    <input type="text" id="lojaOrig" placeholder="Ex.: Machados Veículos">
    <button class="bt" id="btLer">Ler estrutura</button>
    <div id="expRes"></div>
  </section>
  <section id="secApl" hidden>
    <h2>Aplicar um modelo nesta conta</h2>
    <p class="muted">Cria só o que ainda não existe (compara pelo nome). Nada é apagado nem alterado.</p>
    <label>Modelo</label>
    <input type="file" id="arq" accept=".json,application/json">
    <p class="muted" style="margin-top:6px">ou cole o conteúdo do modelo:</p>
    <textarea id="colar" placeholder='{"tipo":"leadvox-modelo-crm", ...}'></textarea>
    <div class="duas">
      <div><label for="de">Nome da loja de origem nos textos</label><input type="text" id="de"></div>
      <div><label for="para">Nome da loja nova</label><input type="text" id="para" placeholder="Ex.: Ervatti Veículos"></div>
    </div>
    <button class="bt" id="btPrevia">Ver o que vai ser criado</button>
    <div id="aplRes"></div>
  </section>
</div></div>`;
  const $ = (id) => raiz.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('conta').textContent = 'Conta aberta: ' + location.hostname + (localStorage.getItem('username') ? ' · ' + localStorage.getItem('username').replace(/"/g, '') : '');
  const aba = (exp) => { $('abaExp').setAttribute('aria-selected', String(exp)); $('abaApl').setAttribute('aria-selected', String(!exp)); $('secExp').hidden = !exp; $('secApl').hidden = exp; };
  $('abaExp').onclick = () => aba(true); $('abaApl').onclick = () => aba(false);
  $('fechar').onclick = () => { host.style.display = 'none'; };
  window.__lvModeloCrm = { abrir: () => { host.style.display = ''; } };

  // exportar
  $('btLer').onclick = async () => {
    const bt = $('btLer'); bt.disabled = true; $('expRes').innerHTML = '<p class="muted">Lendo…</p>';
    try {
      const conta = await lerConta();
      const modelo = montarModelo(conta, $('lojaOrig').value.trim());
      const json = JSON.stringify(modelo, null, 2);
      const linhas = TIPOS.map(t => `<tr><td>${esc(t.rot)}</td><td class="n">${(modelo[t.k] || []).length}</td></tr>`).join('');
      const etapas = (modelo.pipelines || []).reduce((s, p) => s + (p.steps || []).length, 0);
      const rev = paraRevisar(modelo);
      $('expRes').innerHTML = `<table><tr><th>Item</th><th class="n">Qtde</th></tr>${linhas}<tr><td>Etapas dos funis de venda</td><td class="n">${etapas}</td></tr></table>
        ${rev.length ? '<div class="caixinha av">' + rev.map(esc).join('<br>') + '</div>' : ''}
        <button class="bt" id="btBaixar">Baixar modelo (.json)</button> <button class="bt sec" id="btCopiar">Copiar modelo</button>
        <p class="muted" id="dicaExp" style="margin-top:8px">Guarde o arquivo. Na conta nova, abra a ferramenta e use "2 · Aplicar nesta conta".</p>`;
      const nomeArq = 'modelo-crm-' + (N(modelo.origem.loja || location.hostname).replace(/[^a-z0-9]+/g, '-') || 'leadvox') + '.json';
      $('btBaixar').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = nomeArq; a.click(); };
      $('btCopiar').onclick = async () => { try { await navigator.clipboard.writeText(json); $('dicaExp').textContent = 'Modelo copiado. Na conta nova, cole em "2 · Aplicar nesta conta".'; } catch (e) { $('dicaExp').textContent = 'Não consegui copiar automaticamente. Use "Baixar modelo".'; } };
    } catch (e) { $('expRes').innerHTML = '<p class="er">' + esc(e.message) + '</p>'; }
    bt.disabled = false;
  };

  // aplicar
  let MODELO = null, CONTA = null;
  $('arq').onchange = async () => { const f = $('arq').files[0]; if (f) $('colar').value = await f.text(); preencherDe(); };
  $('colar').addEventListener('input', preencherDe);
  function preencherDe() { try { const m = JSON.parse($('colar').value); if (m.origem && m.origem.loja && !$('de').value) $('de').value = m.origem.loja; } catch (e) {} }
  $('btPrevia').onclick = async () => {
    const bt = $('btPrevia'); bt.disabled = true; $('aplRes').innerHTML = '<p class="muted">Conferindo a conta…</p>';
    try {
      try { MODELO = JSON.parse($('colar').value); } catch (e) { throw new Error('O modelo não é um arquivo válido. Baixe de novo na conta de origem.'); }
      if (MODELO.tipo !== 'leadvox-modelo-crm') throw new Error('Este arquivo não é um modelo de CRM da LeadVox.');
      CONTA = await lerConta();
      const pv = previa(MODELO, CONTA);
      const totalNovos = pv.reduce((s, x) => s + x.novos.length, 0);
      const de = $('de').value.trim(), para = $('para').value.trim();
      const rev = paraRevisar(MODELO);
      $('aplRes').innerHTML = `<table><tr><th>Item</th><th class="n">No modelo</th><th class="n">Já existe</th><th class="n">Vai criar</th></tr>
        ${pv.map(x => `<tr><td>${esc(x.t.rot)}</td><td class="n">${x.total}</td><td class="n">${x.pulados}</td><td class="n ${x.novos.length ? 'ok' : ''}">${x.novos.length}</td></tr>`).join('')}</table>
        ${de && para ? `<div class="caixinha">Nos textos, <b>${esc(de)}</b> vira <b>${esc(para)}</b>.</div>` : '<div class="caixinha av">Preencha o nome da loja de origem e o da loja nova para trocar nos textos das respostas rápidas.</div>'}
        ${rev.length ? '<div class="caixinha av">' + rev.map(esc).join('<br>') + '</div>' : ''}
        <label class="op"><input type="checkbox" id="conf"><span>Confirmo que esta é a conta certa (<b>${esc(location.hostname)}</b>) e quero criar ${totalNovos} item(ns).</span></label>
        <button class="bt" id="btAplicar" disabled>Aplicar modelo</button>
        <div class="caixinha log" id="log" hidden></div><div id="fim"></div>`;
      $('conf').onchange = () => { $('btAplicar').disabled = !$('conf').checked || !totalNovos; };
      $('btAplicar').onclick = async () => {
        $('btAplicar').disabled = true; $('conf').disabled = true; $('btPrevia').disabled = true;
        const log = $('log'); log.hidden = false; const L = (s) => { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; };
        try {
          const rel = await aplicar(MODELO, CONTA, $('de').value.trim(), $('para').value.trim(), L);
          $('fim').innerHTML = `<div class="caixinha"><b class="ok">${rel.criados} criado(s)</b> · ${rel.pulados} já existiam` +
            (rel.erros.length ? `<br><b class="er">${rel.erros.length} erro(s):</b><br>${rel.erros.map(esc).join('<br>')}` : '') +
            (rel.avisos.length ? `<br><b class="av">Atenção:</b><br>${rel.avisos.map(esc).join('<br>')}` : '') +
            `<br><span class="muted">Recarregue o painel (F5) para ver tudo nas telas de configuração.</span></div>`;
        } catch (e) { $('fim').innerHTML = '<p class="er">' + esc(e.message) + '</p>'; }
        $('btPrevia').disabled = false;
      };
    } catch (e) { $('aplRes').innerHTML = '<p class="er">' + esc(e.message) + '</p>'; }
    bt.disabled = false;
  };
})();
