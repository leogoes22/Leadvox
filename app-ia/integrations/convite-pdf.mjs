// Convite para test drive (ou test ride) em PDF, com a identidade da loja: logo, nome, CNPJ, contatos e cor.
// Feito à mão, sem biblioteca: roda igual aqui (testes) e dentro do Code do n8n (cole a função sem o "export").
// Imagens só em JPEG (o PDF lê o JPEG direto, DCTDecode): a foto do estoque e a logo, que o painel já guarda em JPEG.
// Texto em Helvetica (fonte padrão do PDF) com acentos do português (WinAnsi).
export function gerarConvitePdf(d) {
  const L = 595.28, A = 841.89, M = 40, LARG = L - 2 * M;
  // larguras (1/1000 pt) de 32..126 — Helvetica e Helvetica-Bold
  const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  // Unicode → WinAnsi (cp1252); o que não existir vira o caractere-base sem acento ou some (emoji)
  const ESPECIAIS = { '•': 0x95, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '…': 0x85, '€': 0x80, '·': 0xb7, 'º': 0xba, 'ª': 0xaa, '°': 0xb0 };
  const codigoDe = (ch) => {
    if (ESPECIAIS[ch]) return ESPECIAIS[ch];
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) return c;
    if (c >= 160 && c <= 255) return c;
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126 ? base.charCodeAt(0) : null;
  };
  const codigos = (t) => [...String(t == null ? '' : t).replace(/[\r\t]/g, ' ')].map(codigoDe).filter((c) => c !== null);
  const largCod = (c, neg) => {
    const W = neg ? WB : WR;
    if (c >= 32 && c <= 126) return W[c - 32];
    if (c === 0x95) return 350; if (c === 0x96) return 556; if (c === 0x97) return 1000; if (c === 0x85) return 1000;
    if (c >= 0xc0) { const b = String.fromCharCode(c).normalize('NFD').replace(/[̀-ͯ]/g, ''); const k = b.charCodeAt(0); return k >= 32 && k <= 126 ? W[k - 32] : 556; }
    return 556;
  };
  const largura = (t, tam, neg) => codigos(t).reduce((s, c) => s + largCod(c, neg), 0) * tam / 1000;
  const pdfTexto = (t) => codigos(t).map((c) => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('');
  const quebrar = (t, tam, neg, max) => {
    const linhas = [];
    for (const par of String(t == null ? '' : t).split('\n')) {
      let atual = '';
      for (const p of par.split(/ +/).filter(Boolean)) {
        const tenta = atual ? atual + ' ' + p : p;
        if (largura(tenta, tam, neg) <= max || !atual) atual = tenta; else { linhas.push(atual); atual = p; }
      }
      linhas.push(atual);
    }
    return linhas;
  };
  const cor = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const n = m ? parseInt(m[1], 16) : 0x16a34a; return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)).join(' '); };
  const clara = (hex, k) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const n = m ? parseInt(m[1], 16) : 0x16a34a; return [(n >> 16), (n >> 8) & 255, n & 255].map((x) => ((x + (255 - x) * k) / 255).toFixed(3)).join(' '); };
  // espaço que não quebra (R$ 45.000 fica junto) e centavos só quando houver
  const brl = (n) => { const x = Number(n); return 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 }); };
  const km = (n) => n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('pt-BR') + ' km';

  // JPEG: lê largura, altura e cores no marcador SOF
  const jpeg = (b) => {
    if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1], tam = (b[i + 2] << 8) | b[i + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(mk)) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comp: b[i + 9], bytes: b };
      }
      i += 2 + tam;
    }
    return null;
  };

  const loja = d.loja || {}, v = d.veiculo || {}, cond = d.condicoes || {}, acento = loja.cor || '#16a34a';
  const moto = v.tipo === 'moto', teste = moto ? 'test ride' : 'test drive';
  const imgs = [], paginas = [];
  let s = '', y = 0;
  const novaPagina = () => { if (s) paginas.push(s); s = ''; y = A - M; };
  const texto = (t, x, yy, tam, neg, rgb) => { s += 'BT /' + (neg ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + (rgb || '0.11 0.13 0.17') + ' rg ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' Td (' + pdfTexto(t) + ') Tj ET\n'; };
  const ret = (x, yy, w, h, rgb) => { s += rgb + ' rg ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f\n'; };
  const linha = (x1, y1, x2, y2, rgb, esp) => { s += rgb + ' RG ' + (esp || 0.6) + ' w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S\n'; };
  const imagem = (j, x, yy, w, h) => { if (!j) return; let k = imgs.findIndex((x) => x.bytes === j.bytes); if (k < 0) { imgs.push(j); k = imgs.length - 1; } s += 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' cm /Im' + (k + 1) + ' Do Q\n'; };
  const cabe = (h) => { if (y - h < M + 40) novaPagina(); };
  const paragrafo = (t, tam, neg, rgb, x, max, entre) => { for (const l of quebrar(t, tam, neg, max || LARG)) { cabe(tam + 4); texto(l, x || M, y - tam, tam, neg, rgb); y -= tam + (entre || 4); } };
  const CINZA = '0.42 0.45 0.50', ESCURO = '0.11 0.13 0.17', LINHA = '0.88 0.89 0.91';

  novaPagina();
  // ── cabeçalho com a identidade da loja ──
  const logo = jpeg(d.logo);
  let hLogo = 0;
  if (logo) { const k = Math.min(150 / logo.w, 56 / logo.h); hLogo = logo.h * k; imagem(logo, M, y - hLogo, logo.w * k, hLogo); }
  const dir = [loja.cnpj ? 'CNPJ ' + loja.cnpj : '', [loja.telefone, loja.whatsapp && loja.whatsapp !== loja.telefone ? 'WhatsApp ' + loja.whatsapp : ''].filter(Boolean).join(' · '),
    loja.endereco || '', [loja.site, loja.instagram].filter(Boolean).join(' · ')].filter(Boolean);
  const xDir = logo ? M + 170 : M, larDir = L - M - xDir;
  let yd = y - 13;
  texto(loja.nome || 'Nossa loja', L - M - Math.min(largura(loja.nome || 'Nossa loja', 13, true), larDir), yd, 13, true, ESCURO); yd -= 15;
  for (const t of dir) for (const l of quebrar(t, 8.5, false, larDir)) { texto(l, L - M - largura(l, 8.5, false), yd, 8.5, false, CINZA); yd -= 11; }
  y = Math.min(y - hLogo, yd) - 10;
  ret(M, y, LARG, 3, cor(acento)); y -= 26;

  // ── convite ──
  texto(('Convite para ' + teste).toUpperCase(), M, y, 9.5, true, cor(acento)); y -= 24;
  const primeiro = String((d.cliente && d.cliente.nome) || '').trim().split(/\s+/)[0];
  paragrafo((primeiro ? primeiro + ', ' : '') + (moto ? 'esta moto está esperando por você!' : 'este carro está esperando por você!'), 20, true, ESCURO, M, LARG, 6);
  y -= 2;
  paragrafo('Separamos uma condição especial e queremos que você sinta na prática. Venha fazer um ' + teste + ' na ' + (loja.nome || 'nossa loja') + ', sem compromisso.', 10.5, false, CINZA, M, LARG, 4);
  y -= 10;

  // ── foto grande do veículo ──
  const foto = jpeg(d.foto);
  if (foto) {
    const w = LARG, h = Math.min(w * foto.h / foto.w, 225), wReal = Math.min(w, h * foto.w / foto.h);
    cabe(h + 10); imagem(foto, M + (w - wReal) / 2, y - h, wReal, h); y -= h + 16;
  }

  // ── nome e preço ──
  cabe(60);
  const preco = Number(v.preco) ? brl(v.preco) : '';
  const larPreco = preco ? largura(preco, 18, true) + 24 : 0;
  const nomeLinhas = quebrar(v.titulo || 'Veículo', 15, true, LARG - larPreco - 12);
  const hNome = nomeLinhas.length * 19;
  if (preco) { ret(L - M - larPreco, y - 30, larPreco, 30, cor(acento)); texto(preco, L - M - larPreco + 12, y - 21, 18, true, '1 1 1'); }
  nomeLinhas.forEach((l, i) => texto(l, M, y - 15 - i * 19, 15, true, ESCURO));
  y -= Math.max(hNome, 30) + 6;
  if (preco) { texto('Valor anunciado', L - M - largura('Valor anunciado', 8, false), y - 2, 8, false, CINZA); }
  y -= 16;

  // ── ficha técnica (duas colunas) ──
  const ficha = [['Ano', v.ano], ['Quilometragem', km(v.km)], ['Cor', v.cor], ['Câmbio', v.cambio], ['Combustível', v.combustivel], ['Categoria', v.categoria], ['Código', v.codigo]].filter((x) => x[1]);
  if (ficha.length) {
    cabe(30); texto('Ficha técnica', M, y - 12, 11.5, true, ESCURO); y -= 22;
    const col = LARG / 2 - 8;
    for (let i = 0; i < ficha.length; i += 2) {
      cabe(20);
      [ficha[i], ficha[i + 1]].forEach((f, k) => {
        if (!f) return;
        const x = M + k * (col + 16);
        texto(f[0], x, y - 11, 9.5, false, CINZA);
        const val = String(f[1]); texto(val, x + col - largura(val, 9.5, true), y - 11, 9.5, true, ESCURO);
        linha(x, y - 17, x + col, y - 17, LINHA);
      });
      y -= 21;
    }
    y -= 4;
  }
  const ops = (Array.isArray(v.opcionais) ? v.opcionais : []).filter(Boolean).slice(0, 30);
  if (ops.length) { cabe(26); texto('Itens e opcionais', M, y - 11, 10.5, true, ESCURO); y -= 18; paragrafo(ops.join('  •  '), 9.5, false, CINZA, M, LARG, 3); y -= 6; }
  if (v.obs) { cabe(26); paragrafo(v.obs, 9.5, false, CINZA, M, LARG, 3); y -= 6; }

  // ── condições preparadas pelo vendedor ──
  const FORMAS = { avista: 'À vista', financiado: 'Financiamento', consorcio: 'Consórcio', cartao: 'Cartão de crédito' };
  const linhasCond = [];
  if (FORMAS[cond.forma]) linhasCond.push(['Forma de pagamento', FORMAS[cond.forma] + (cond.banco ? ' · ' + cond.banco : '')]);
  if (Number(cond.entrada)) linhasCond.push(['Entrada', brl(cond.entrada)]);
  if (Number(cond.parcelas) && Number(cond.valorParcela)) linhasCond.push(['Parcelas', cond.parcelas + 'x de ' + brl(cond.valorParcela)]);
  const tr = cond.troca || {};
  if (tr.modelo) linhasCond.push(['Seu veículo na troca', [tr.modelo, tr.ano, km(tr.km)].filter(Boolean).join(' · ') + (Number(tr.valor) ? ' — avaliação ' + brl(tr.valor) : '')]);
  const extras = (Array.isArray(cond.extras) ? cond.extras : []).filter(Boolean).slice(0, 12);
  if (linhasCond.length || extras.length || cond.obs) {
    // o bloco vai inteiro: se não couber aqui, começa na próxima página
    const hBloco = 26 + linhasCond.reduce((t, [, val]) => t + quebrar(val, 9.5, true, LARG / 2 - 10).length * 13 + 10, 0)
      + (extras.length ? 16 + extras.length * 13 : 0) + (cond.obs ? quebrar(cond.obs, 9.5, false, LARG).length * 13 + 2 : 0);
    cabe(Math.min(hBloco, A - 2 * M - 60)); y -= 4; texto('Condições para você', M, y - 12, 11.5, true, ESCURO); y -= 22;
    for (const [k, val] of linhasCond) {
      const ls = quebrar(val, 9.5, true, LARG / 2 - 10);
      cabe(ls.length * 13 + 8);
      texto(k, M, y - 11, 9.5, false, CINZA);
      ls.forEach((l, i) => texto(l, L - M - largura(l, 9.5, true), y - 11 - i * 13, 9.5, true, ESCURO));
      y -= ls.length * 13 + 4; linha(M, y - 2, L - M, y - 2, LINHA); y -= 6;
    }
    if (extras.length) { cabe(18); texto('Incluso', M, y - 11, 9.5, false, CINZA); y -= 16; for (const e of extras) paragrafo('•  ' + e, 9.5, false, ESCURO, M + 6, LARG - 6, 3); }
    if (cond.obs) { y -= 2; paragrafo(cond.obs, 9.5, false, CINZA, M, LARG, 3); }
    y -= 6;
  }

  // ── chamada para o test drive ──
  const contato = [d.vendedor && d.vendedor.nome ? 'Fale com ' + d.vendedor.nome : 'Fale com a gente', loja.whatsapp || loja.telefone ? 'pelo WhatsApp ' + (loja.whatsapp || loja.telefone) : 'respondendo esta mensagem'].join(' ');
  const corpoCta = [d.sugestao ? 'Sugestão de horário: ' + d.sugestao + '.' : '', contato + ' e escolha o melhor dia para o seu ' + teste + '.', loja.endereco ? 'Endereço: ' + loja.endereco : ''].filter(Boolean);
  const lsCta = corpoCta.flatMap((t) => quebrar(t, 10, false, LARG - 32));
  const hCta = 34 + lsCta.length * 14;
  cabe(hCta + 10); y -= 4;
  ret(M, y - hCta, LARG, hCta, clara(acento, 0.88)); ret(M, y - hCta, 4, hCta, cor(acento));
  texto('Agende o seu ' + teste, M + 16, y - 22, 13, true, ESCURO);
  lsCta.forEach((l, i) => texto(l, M + 16, y - 40 - i * 14, 10, false, ESCURO));
  y -= hCta + 14;

  // ── rodapé em todas as páginas ──
  paginas.push(s);
  const rod = [d.numero ? 'Proposta nº ' + d.numero : '', d.validade ? 'válida até ' + d.validade : '', 'Valores e condições sujeitos a análise de crédito e à disponibilidade do veículo.'].filter(Boolean).join(' · ');
  const rodLinhas = quebrar(rod, 7.5, false, LARG);
  const conteudos = paginas.map((p, i) => {
    let r = '';
    rodLinhas.forEach((l, k) => { r += 'BT /F1 7.5 Tf ' + CINZA + ' rg ' + M + ' ' + (M - 4 - k * 10).toFixed(2) + ' Td (' + pdfTexto(l) + ') Tj ET\n'; });
    if (paginas.length > 1) { const n = (i + 1) + '/' + paginas.length; r += 'BT /F1 7.5 Tf ' + CINZA + ' rg ' + (L - M - largura(n, 7.5, false)).toFixed(2) + ' ' + (M + 8) + ' Td (' + n + ') Tj ET\n'; }
    return p + CINZA + ' RG 0.5 w ' + M + ' ' + (M + 8) + ' m ' + (L - M) + ' ' + (M + 8) + ' l S\n' + r;
  });

  // ── monta o arquivo ──
  const enc = (t) => { const out = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 255; return out; };
  const partes = [], offsets = [];
  let total = 0;
  const add = (u) => { partes.push(u); total += u.length; };
  const obj = (n, corpo) => { offsets[n] = total; add(enc(n + ' 0 obj\n')); for (const c of [].concat(corpo)) add(typeof c === 'string' ? enc(c) : c); add(enc('\nendobj\n')); };
  add(enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  const nImg = imgs.length, nPag = conteudos.length;
  // 1 catálogo, 2 páginas, 3 F1, 4 F2, 5.. imagens, depois (página, conteúdo) por página
  const primeiraPag = 5 + nImg;
  const kids = conteudos.map((_, i) => (primeiraPag + i * 2) + ' 0 R').join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + nPag + ' >>');
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  imgs.forEach((j, i) => {
    const cs = j.comp === 1 ? '/DeviceGray' : j.comp === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
    obj(5 + i, ['<< /Type /XObject /Subtype /Image /Width ' + j.w + ' /Height ' + j.h + ' /ColorSpace ' + cs + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + j.bytes.length + ' >>\nstream\n', j.bytes, '\nendstream']);
  });
  const xobj = nImg ? ' /XObject << ' + imgs.map((_, i) => '/Im' + (i + 1) + ' ' + (5 + i) + ' 0 R').join(' ') + ' >>' : '';
  conteudos.forEach((c, i) => {
    const np = primeiraPag + i * 2;
    obj(np, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + L + ' ' + A + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + xobj + ' >> /Contents ' + (np + 1) + ' 0 R >>');
    const bytes = enc(c);
    obj(np + 1, ['<< /Length ' + bytes.length + ' >>\nstream\n', bytes, '\nendstream']);
  });
  const nObj = primeiraPag + nPag * 2;
  const inicioXref = total;
  let xref = 'xref\n0 ' + nObj + '\n0000000000 65535 f \n';
  for (let i = 1; i < nObj; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  add(enc(xref + 'trailer\n<< /Size ' + nObj + ' /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF\n'));
  const pdf = new Uint8Array(total); let p = 0; for (const u of partes) { pdf.set(u, p); p += u.length; }
  return pdf;
}
