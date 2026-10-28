// Tela de entrada: monta o cubo da logo (3x3 cubinhos por face, o do centro verde) e desenha no fundo uma rede
// de pontos que se ligam, como uma rede neural. Só anima enquanto a tela de entrada está à vista; quem pede
// menos movimento no sistema vê a rede parada.
const cubo = document.getElementById('portaCubo');
if (cubo && !cubo.childElementCount) {
  cubo.innerHTML = [1, 2, 3, 4, 5, 6].map(f => `<div class="face f${f}">${Array.from({ length: 9 }, (_, i) => `<span${i === 4 ? ' class="centro"' : ''}></span>`).join('')}</div>`).join('');
}

const porta = document.getElementById('telaPorta');
const tela = document.getElementById('portaRede');
const g = tela && tela.getContext('2d');
const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CORES = ['43,232,123', '91,155,255'];
let pontos = [], larg = 0, alt = 0, escala = 1, mouse = null, quadro = 0;

function montar() {
  escala = Math.min(window.devicePixelRatio || 1, 2);
  larg = tela.clientWidth; alt = tela.clientHeight;
  tela.width = Math.round(larg * escala); tela.height = Math.round(alt * escala);
  g.setTransform(escala, 0, 0, escala, 0, 0);
  const n = Math.max(28, Math.min(110, Math.round(larg * alt / 14000)));
  pontos = Array.from({ length: n }, () => ({
    x: Math.random() * larg, y: Math.random() * alt,
    vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    r: 1 + Math.random() * 1.6, c: CORES[Math.random() < 0.55 ? 0 : 1]
  }));
}

function desenhar() {
  g.clearRect(0, 0, larg, alt);
  const lim = Math.min(150, Math.max(90, larg / 9));
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    for (let j = i + 1; j < pontos.length; j++) {
      const b = pontos[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
      if (d < lim) { g.strokeStyle = `rgba(${a.c},${(1 - d / lim) * 0.35})`; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
    if (mouse) {
      const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (d < lim * 1.4) { g.strokeStyle = `rgba(43,232,123,${(1 - d / (lim * 1.4)) * 0.55})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(mouse.x, mouse.y); g.stroke(); }
    }
  }
  for (const p of pontos) { g.fillStyle = `rgba(${p.c},0.85)`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
}

function mover() {
  for (const p of pontos) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < -10) p.x = larg + 10; else if (p.x > larg + 10) p.x = -10;
    if (p.y < -10) p.y = alt + 10; else if (p.y > alt + 10) p.y = -10;
  }
}

function laco() {
  quadro = 0;
  if (porta.hidden || document.hidden) return;
  mover(); desenhar();
  quadro = requestAnimationFrame(laco);
}
function iniciar() {
  if (!g || porta.hidden) return;
  montar(); desenhar();
  if (!calmo && !quadro) quadro = requestAnimationFrame(laco);
}

if (g) {
  iniciar();
  let espera;
  addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(iniciar, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) iniciar(); });
  porta.addEventListener('pointermove', e => { const r = tela.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (calmo) desenhar(); });
  porta.addEventListener('pointerleave', () => { mouse = null; });
  // volta a animar quando a tela de entrada aparece de novo (ao sair do painel)
  new MutationObserver(() => { if (!porta.hidden) iniciar(); }).observe(porta, { attributes: true, attributeFilter: ['hidden'] });
}
