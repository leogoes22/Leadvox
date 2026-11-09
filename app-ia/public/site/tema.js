/* LeadVox · temas do site da loja (Natal, Black Friday…) e campanha em pop-up.
   Colar uma vez no site, antes de </body>:
   <script src="https://ia.leadvox.com.br/site/tema.js" data-loja="CONTA-DA-LOJA" defer></script>
   O lojista liga e agenda tudo pelo painel. Prévia sem ligar: abrir o site com ?lv_tema=natal (ou outro tema) e ?lv_campanha=1.
   Tudo fica dentro de uma "shadow root": o estilo do site não muda e o do site não quebra o nosso. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || window.__lvTema) return;
  window.__lvTema = true;
  var loja = (script.getAttribute('data-loja') || '').toLowerCase();
  var base = new URL(script.src).origin;
  var ARTE = 'https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/';
  var params = new URLSearchParams(location.search);
  var calmo = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var celular = window.matchMedia && matchMedia('(max-width: 640px)').matches;

  // Cada tema: cores, emoji, frase, efeito e melodia (só domínio público, tocada no próprio navegador).
  var TEMAS = {
    'natal': { c1: '#c8102e', c2: '#0b6e4f', ouro: '#f5d76e', emoji: '🎄', frase: 'Feliz Natal! Condições especiais de fim de ano.', efeito: 'neve', melodia: 'jingle' },
    'ano-novo': { c1: '#d4af37', c2: '#111111', ouro: '#f8e7a1', emoji: '✨', frase: 'Ano novo, veículo novo! Comece o ano de chave na mão.', efeito: 'confete-ouro', melodia: 'auld' },
    'carnaval': { c1: '#7b2ff7', c2: '#ff3d7f', ouro: '#ffd400', emoji: '🎉', frase: 'Carnaval com condições especiais. Aproveite!', efeito: 'confete' },
    'dia-das-maes': { c1: '#e75480', c2: '#8e2453', ouro: '#ffd1dc', emoji: '💐', frase: 'Feliz Dia das Mães! Um presente que leva a família toda.', efeito: 'coracoes' },
    'dia-dos-pais': { c1: '#1e3a8a', c2: '#0f172a', ouro: '#93c5fd', emoji: '👔', frase: 'Feliz Dia dos Pais! Condições especiais nesta semana.', efeito: '' },
    'dia-do-cliente': { c1: '#0e9f6e', c2: '#064e3b', ouro: '#a7f3d0', emoji: '🤝', frase: 'Dia do Cliente: obrigado pela confiança! Ofertas especiais.', efeito: 'confete' },
    'black-friday': { c1: '#ffd400', c2: '#000000', ouro: '#ffd400', emoji: '🏷️', frase: 'BLACK FRIDAY: ofertas por tempo limitado.', efeito: '' }
  };

  if (!/^[a-z0-9-]{3,60}$/.test(loja)) return;
  var previaTema = params.get('lv_tema');
  var previaCampanha = params.get('lv_campanha') === '1';

  fetch(base + '/api/site/tema?loja=' + encodeURIComponent(loja), { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : { tema: null }; })
    .catch(function () { return { tema: null }; })
    .then(function (d) {
      d = d && typeof d === 'object' ? d : { tema: null };
      if (previaTema) d.tema = previaTema === 'nenhum' ? null : previaTema;
      if (previaCampanha && !d.campanha) d.campanha = { titulo: 'Prévia da campanha', texto: 'Assim fica o pop-up da oferta no seu site.', condicao: 'Entrada facilitada', botao: 'Quero a oferta' };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { montar(d); });
      else montar(d);
    });

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  // WhatsApp do próprio site: o primeiro link de WhatsApp da página recebe a mensagem da oferta.
  function linkWhatsApp(msg) {
    var a = document.querySelector('a[href*="wa.me/"], a[href*="api.whatsapp.com/send"], a[href*="whatsapp://send"]');
    if (!a) return '';
    try {
      var u = new URL(a.href, location.href);
      if (u.hostname === 'wa.me' || u.hostname === 'api.whatsapp.com') { u.searchParams.set('text', msg); return u.href; }
    } catch (e) { }
    return '';
  }
  function linkEstoque() {
    var a = document.querySelector('a[href*="estoque"]');
    return a ? a.href : '';
  }
  function dataBR(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] : ''; }
  function evento(nome, dados) { try { if (typeof window.fbq === 'function') window.fbq('trackCustom', nome, dados); } catch (e) { } }

  function montar(d) {
    var t = TEMAS[d.tema] || null;
    var c = d.campanha && typeof d.campanha === 'object' && d.campanha.titulo ? d.campanha : null;
    if (!t && !c) return;
    var host = el('div'); host.id = 'leadvox-tema';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';
    document.body.appendChild(host);
    var raiz = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var cor1 = t ? t.c1 : '#111', cor2 = t ? t.c2 : '#000', ouro = t ? t.ouro : '#fff';
    var st = el('style');
    st.textContent = ':host,*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
      '.fita{position:fixed;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,' + cor1 + ',' + ouro + ',' + cor2 + ',' + ouro + ',' + cor1 + ');pointer-events:none}' +
      '.card{position:fixed;left:16px;bottom:16px;max-width:340px;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;' +
      'background:' + cor2 + ';color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);border:2px solid ' + cor1 + ';pointer-events:auto;animation:sobe .5s ease both}' +
      '.card .em{font-size:26px;line-height:1}.card p{margin:0;font-size:13px;line-height:1.35}.card .acoes{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}' +
      '.bt{border:0;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;background:' + cor1 + ';color:' + (cor1 === '#ffd400' || cor1 === '#d4af37' ? '#000' : '#fff') + '}' +
      '.card.mini{width:50px;height:50px;padding:0;justify-content:center;border-radius:999px;cursor:pointer;right:auto}.card.mini>div:not(.em),.card.mini .x{display:none}' +
      '@media (max-width:640px){.card.mini{right:auto}}' +
      '.bt.sec{background:rgba(255,255,255,.14);color:#fff}.x{position:absolute;top:4px;right:6px;background:none;border:0;color:#fff;opacity:.7;font-size:16px;cursor:pointer}' +
      '.fundo{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;pointer-events:auto;animation:aparece .25s ease both}' +
      '.pop{position:relative;width:min(420px,92vw);max-height:88vh;overflow:auto;border-radius:18px;background:#fff;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.45)}' +
      '.pop img{display:block;width:100%;height:auto}.pop .corpo{padding:18px 20px 20px}.pop h2{margin:0 0 6px;font-size:22px;line-height:1.2}' +
      '.pop p{margin:0 0 8px;font-size:15px;line-height:1.45;color:#333}.pop .cond{display:inline-block;margin:4px 0 10px;padding:6px 10px;border-radius:8px;background:#f3f3f4;font-weight:700}' +
      '.pop .val{font-size:12px;color:#666}.pop .ir{display:block;width:100%;margin-top:12px;padding:13px;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;text-align:center;text-decoration:none;' +
      'background:' + (t ? cor1 : '#16a34a') + ';color:' + (t && (cor1 === '#ffd400' || cor1 === '#d4af37') ? '#000' : '#fff') + '}' +
      '.pop .x{color:#111;background:rgba(255,255,255,.8);border-radius:999px;width:30px;height:30px;top:8px;right:8px;opacity:1}' +
      '@media (max-width:640px){.fundo{align-items:flex-end}.pop{width:100%;max-height:80vh;border-radius:18px 18px 0 0}.card{left:10px;right:86px;bottom:12px;max-width:none}}' +
      'canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}' +
      '@keyframes sobe{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}@keyframes aparece{from{opacity:0}to{opacity:1}}';
    raiz.appendChild(st);

    if (t) {
      raiz.appendChild(el('div', 'fita'));
      if (!calmo && t.efeito) efeito(raiz, t);
      var fechado = false;
      try { fechado = sessionStorage.getItem('lv_tema_card_' + d.tema) === '1'; } catch (e) { }
      if (!fechado) cartao(raiz, d, t, c);
    }
    if (c) {
      var chave = 'lv_camp_' + c.titulo + '|' + (c.validade || '');
      var visto = false;
      try { visto = sessionStorage.getItem(chave) === '1'; } catch (e) { }
      if (!visto || previaCampanha) setTimeout(function () { popup(raiz, c, t); try { sessionStorage.setItem(chave, '1'); } catch (e) { } }, previaCampanha ? 600 : 4000);
    }
  }

  function cartao(raiz, d, t, c) {
    var card = el('div', 'card'); card.setAttribute('role', 'note');
    card.appendChild(el('div', 'em', t.emoji));
    var box = el('div'); box.appendChild(el('p', '', t.frase));
    var acoes = el('div', 'acoes');
    var dest = c ? null : linkEstoque();
    if (c || dest) {
      var ver = el('button', 'bt', c ? 'Ver a oferta' : 'Ver estoque'); ver.type = 'button';
      ver.onclick = function () { if (c) popup(raiz, c, t); else location.href = dest; };
      acoes.appendChild(ver);
    }
    if (d.musica && t.melodia && !calmo) {
      var som = el('button', 'bt sec', '🎵 Tocar música'); som.type = 'button';
      som.onclick = function () { var tocando = musica(t.melodia); som.textContent = tocando ? '🔇 Parar música' : '🎵 Tocar música'; };
      acoes.appendChild(som);
    }
    if (acoes.childNodes.length) box.appendChild(acoes);
    card.appendChild(box);
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
    x.onclick = function () { card.remove(); musica(null); try { sessionStorage.setItem('lv_tema_card_' + d.tema, '1'); } catch (e) { } };
    card.appendChild(x);
    raiz.appendChild(card);
    // depois de 10 s vira só a bolinha com o emoji (não fica em cima do site); tocar abre de novo
    setTimeout(function () { if (card.isConnected && !card.matches(':hover')) card.classList.add('mini'); }, 10000);
    card.addEventListener('click', function (e) { if (card.classList.contains('mini')) { e.stopPropagation(); card.classList.remove('mini'); } }, true);
  }

  function popup(raiz, c, t) {
    if (raiz.querySelector('.fundo')) return;
    var fundo = el('div', 'fundo');
    var pop = el('div', 'pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', c.titulo);
    if (c.arte && String(c.arte).indexOf(ARTE) === 0) { var img = el('img'); img.src = c.arte; img.alt = c.titulo; pop.appendChild(img); }
    var corpo = el('div', 'corpo');
    corpo.appendChild(el('h2', '', (t ? t.emoji + ' ' : '') + c.titulo));
    if (c.texto) corpo.appendChild(el('p', '', c.texto));
    if (c.condicao) corpo.appendChild(el('div', 'cond', c.condicao));
    if (c.validade) corpo.appendChild(el('div', 'val', 'Válido até ' + dataBR(c.validade)));
    var link = linkWhatsApp('Olá! Vi a oferta "' + c.titulo + '" no site e quero saber mais.');
    if (link) {
      var ir = el('a', 'ir', c.botao || 'Quero a oferta'); ir.href = link; ir.target = '_blank'; ir.rel = 'noopener';
      ir.onclick = function () { evento('CampanhaClique', { campanha: c.titulo }); };
      corpo.appendChild(ir);
    }
    pop.appendChild(corpo);
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
    var fechar = function () { fundo.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') fechar(); };
    x.onclick = fechar; fundo.onclick = function (e) { if (e.target === fundo) fechar(); };
    document.addEventListener('keydown', esc);
    pop.appendChild(x); fundo.appendChild(pop); raiz.appendChild(fundo);
    evento('CampanhaVista', { campanha: c.titulo });
    x.focus();
  }

  // Efeitos leves: poucas partículas, param sozinhos depois de 25 s e quando a aba fica escondida.
  function efeito(raiz, t) {
    var cv = el('canvas'); raiz.appendChild(cv);
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W, H;
    function medir() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    medir(); addEventListener('resize', medir);
    var n = celular ? 22 : 45, ps = [], cores = t.efeito === 'confete-ouro' ? ['#d4af37', '#f8e7a1', '#fff'] : t.efeito === 'confete' ? [t.c1, t.c2, t.ouro, '#fff'] : ['#fff'];
    for (var i = 0; i < n; i++) ps.push({ x: Math.random() * W, y: Math.random() * -H, v: 0.6 + Math.random() * 1.4, r: 2 + Math.random() * 3, o: Math.random() * 6.28, c: cores[i % cores.length] });
    var inicio = performance.now(), parar = false;
    document.addEventListener('visibilitychange', function () { if (document.hidden) parar = true; });
    (function quadro(agora) {
      var dur = agora - inicio, alfa = dur > 22000 ? Math.max(0, 1 - (dur - 22000) / 3000) : 1;
      if (parar || alfa <= 0) { cv.remove(); return; }
      ctx.clearRect(0, 0, W, H); ctx.globalAlpha = alfa;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i]; p.y += p.v; p.o += 0.03; p.x += Math.sin(p.o) * 0.6;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        ctx.fillStyle = p.c;
        if (t.efeito === 'coracoes') { ctx.font = (p.r * 5) + 'px serif'; ctx.fillText('♥', p.x, p.y); }
        else if (t.efeito === 'neve') { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.o); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
      }
      requestAnimationFrame(quadro);
    })(inicio);
  }

  // Música: só depois do clique da pessoa (o navegador bloqueia som automático). Melodias de domínio público, tocadas
  // como sininho pelo próprio navegador, sem arquivo de áudio. Toca duas vezes e para.
  var audio = null;
  function musica(qual) {
    if (audio) { try { audio.close(); } catch (e) { } audio = null; return false; }
    if (!qual) return false;
    var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return false;
    audio = new Ctx();
    var N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3 };
    var notas = qual === 'jingle'
      ? 'E4 E4 E4- E4 E4 E4- E4 G4 C4 D4 E4-- F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4- G4-'
      : 'C4 F4 F4 F4 A4 G4 F4 G4 A4 F4 F4 A4 C5 D5-- D5 C5 A4 A4 F4 G4 F4 G4 A4 F4 D4 D4 C4 F4--';
    var t = audio.currentTime + 0.1, passo = qual === 'jingle' ? 0.22 : 0.32;
    for (var volta = 0; volta < 2; volta++) {
      notas.split(' ').forEach(function (s) {
        var nome = s.replace(/-+$/, ''), dur = passo * (1 + (s.length - nome.length));
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = N[nome] || 440;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur);
        t += dur;
      });
      t += 0.6;
    }
    var este = audio;
    setTimeout(function () { if (audio === este) { try { audio.close(); } catch (e) { } audio = null; } }, (t - audio.currentTime) * 1000 + 300);
    return true;
  }
})();
