// Proposta comercial (ou orçamento de serviços) em PDF, com a identidade da loja: logo, nome, CNPJ, contatos e cor.
// Mesmo motor do convite (convite-pdf.mjs): sem biblioteca, roda aqui nos testes e no Code do n8n (cole a função sem o "export").
// Itens com quantidade, unidade e preço; desconto em % ou R$; frete; condições; e o pedido de aprovação pelo WhatsApp.
export function gerarPropostaPdf(d) {
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

  const loja = d.loja || {}, acento = loja.cor || '#16a34a', servico = d.tipo === 'servicos';
  const imgs = [], paginas = [];
  let s = '', y = 0;
  const texto = (t, x, yy, tam, neg, rgb) => { s += 'BT /' + (neg ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + (rgb || '0.11 0.13 0.17') + ' rg ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' Td (' + pdfTexto(t) + ') Tj ET\n'; };
  const direita = (t, xd, yy, tam, neg, rgb) => texto(t, xd - largura(t, tam, neg), yy, tam, neg, rgb);
  const ret = (x, yy, w, h, rgb) => { s += rgb + ' rg ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f\n'; };
  const linha = (x1, y1, x2, y2, rgb, esp) => { s += rgb + ' RG ' + (esp || 0.6) + ' w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S\n'; };
  const imagem = (j, x, yy, w, h) => { if (!j) return; let k = imgs.findIndex((z) => z.bytes === j.bytes); if (k < 0) { imgs.push(j); k = imgs.length - 1; } s += 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' cm /Im' + (k + 1) + ' Do Q\n'; };
  const CINZA = '0.42 0.45 0.50', ESCURO = '0.11 0.13 0.17', LINHA = '0.88 0.89 0.91', ZEBRA = '0.97 0.975 0.98';
  const dinheiro = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtdTxt = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  // contas: subtotal dos itens, desconto (% ou R$), frete cobrado e total
  const itens = (Array.isArray(d.itens) ? d.itens : []).filter((i) => i && String(i.nome || '').trim() && Number(i.qtd) > 0).slice(0, 200);
  const sub = Math.round(itens.reduce((t, i) => t + Number(i.qtd) * (Number(i.preco) || 0), 0) * 100) / 100;
  const dsc = d.desconto || {};
  const desc = Math.round((dsc.tipo === 'pct' ? sub * Math.min(Number(dsc.valor) || 0, 100) / 100 : Math.min(Number(dsc.valor) || 0, sub)) * 100) / 100;
  const fr = d.frete || {}, frete = !servico && fr.tipo === 'cobrado' ? Math.max(Number(fr.valor) || 0, 0) : 0;
  const totalGeral = Math.round((sub - desc + frete) * 100) / 100;

  // ── cabeçalho de cada página: logo e dados da loja à esquerda, número e datas à direita ──
  const logo = jpeg(d.logo);
  const cabecalho = () => {
    y = A - M;
    let hLogo = 0;
    if (logo) { const k = Math.min(130 / logo.w, 50 / logo.h); hLogo = logo.h * k; imagem(logo, M, y - hLogo, logo.w * k, hLogo); }
    const xLoja = logo ? M + 142 : M, larLoja = 250;
    let yl = y - 12;
    for (const l of quebrar(loja.nome || 'Nossa empresa', 12, true, larLoja)) { texto(l, xLoja, yl, 12, true, ESCURO); yl -= 14; }
    const dados = [loja.razao && loja.razao !== loja.nome ? loja.razao : '', loja.cnpj ? 'CNPJ ' + loja.cnpj : '',
      [loja.telefone, loja.whatsapp && loja.whatsapp !== loja.telefone ? 'WhatsApp ' + loja.whatsapp : ''].filter(Boolean).join(' · '),
      loja.endereco || '', [loja.email, loja.site].filter(Boolean).join(' · ')].filter(Boolean);
    for (const t of dados) for (const l of quebrar(t, 8, false, larLoja)) { texto(l, xLoja, yl, 8, false, CINZA); yl -= 10; }
    const xd = L - M;
    direita(servico ? 'ORÇAMENTO' : 'PROPOSTA COMERCIAL', xd, y - 10, 9, true, cor(acento));
    direita('Nº ' + (d.numero || ''), xd, y - 26, 14, true, ESCURO);
    if (d.emissao) direita('Emitida em ' + d.emissao, xd, y - 40, 8.5, false, CINZA);
    if (d.validade) direita('Válida até ' + d.validade, xd, y - 51, 8.5, false, CINZA);
    y = Math.min(y - hLogo, yl, y - 56) - 10;
    ret(M, y, LARG, 2.5, cor(acento)); y -= 18;
  };
  const novaPagina = () => { if (s) paginas.push(s); s = ''; cabecalho(); };
  const cabe = (h) => { if (y - h < M + 30) { novaPagina(); return true; } return false; };
  const paragrafo = (t, tam, neg, rgb, x, max, entre) => { for (const l of quebrar(t, tam, neg, max || LARG)) { cabe(tam + 4); texto(l, x || M, y - tam, tam, neg, rgb); y -= tam + (entre || 4); } };

  novaPagina();

  // ── para quem é ──
  const cli = d.cliente || {};
  const quem = [cli.nome || 'Cliente', cli.documento ? (String(cli.documento).replace(/\D/g, '').length > 11 ? 'CNPJ ' : 'CPF ') + cli.documento : ''].filter(Boolean).join(' · ');
  texto('PARA', M, y - 8, 7.5, true, CINZA); texto('ATENDIDO POR', M + LARG / 2 + 10, y - 8, 7.5, true, CINZA);
  texto(quem, M, y - 22, 11, true, ESCURO);
  texto(d.vendedor && d.vendedor.nome ? d.vendedor.nome : (loja.nome || ''), M + LARG / 2 + 10, y - 22, 11, true, ESCURO);
  const contatoCli = [cli.telefone, cli.endereco].filter(Boolean).join(' · ');
  if (contatoCli) texto(contatoCli, M, y - 35, 8.5, false, CINZA);
  const contatoVend = [loja.whatsapp || loja.telefone].filter(Boolean).join(' · ');
  if (contatoVend) texto('WhatsApp ' + contatoVend, M + LARG / 2 + 10, y - 35, 8.5, false, CINZA);
  y -= contatoCli || contatoVend ? 50 : 38;

  // ── itens ──
  const C = { nome: M + 8, qtd: M + LARG * 0.53, un: M + LARG * 0.59, vu: M + LARG * 0.76, tot: L - M - 8 };
  const larNome = LARG * 0.47;
  const cabTabela = () => {
    ret(M, y - 20, LARG, 20, clara(acento, 0.86));
    texto(servico ? 'Serviço' : 'Produto', C.nome, y - 13.5, 8.5, true, ESCURO);
    direita('Qtd.', C.qtd + 12, y - 13.5, 8.5, true, ESCURO);
    texto('Un.', C.un, y - 13.5, 8.5, true, ESCURO);
    direita('Valor un.', C.vu + 18, y - 13.5, 8.5, true, ESCURO);
    direita('Total', C.tot, y - 13.5, 8.5, true, ESCURO);
    y -= 20;
  };
  cabe(60); cabTabela();
  itens.forEach((it, n) => {
    const ls = quebrar(String(it.nome).trim(), 9.5, false, larNome), extra = it.detalhe ? quebrar(it.detalhe, 8, false, larNome) : [];
    const h = 8 + ls.length * 12 + extra.length * 10;
    if (cabe(h + 4)) cabTabela();
    if (n % 2) ret(M, y - h, LARG, h, ZEBRA);
    ls.forEach((l, k) => texto(l, C.nome, y - 14 - k * 12, 9.5, false, ESCURO));
    extra.forEach((l, k) => texto(l, C.nome, y - 14 - ls.length * 12 - k * 10 + 2, 8, false, CINZA));
    direita(qtdTxt(it.qtd), C.qtd + 12, y - 14, 9.5, false, ESCURO);
    texto(String(it.unidade || (servico ? 'serviço' : 'un.')).slice(0, 10), C.un, y - 14, 9, false, CINZA);
    direita(Number(it.preco) ? dinheiro(it.preco) : 'a combinar', C.vu + 18, y - 14, 9.5, false, ESCURO);
    direita(dinheiro(Number(it.qtd) * (Number(it.preco) || 0)), C.tot, y - 14, 9.5, true, ESCURO);
    y -= h;
    linha(M, y, L - M, y, LINHA, 0.5);
  });
  y -= 10;

  // ── totais à direita ──
  const linhasTot = [['Subtotal', dinheiro(sub)]];
  if (desc) linhasTot.push(['Desconto' + (dsc.tipo === 'pct' ? ' (' + qtdTxt(dsc.valor) + '%)' : ''), '- ' + dinheiro(desc)]);
  if (!servico && fr.tipo === 'cobrado') linhasTot.push(['Frete', dinheiro(frete)]);
  cabe(linhasTot.length * 16 + 40);
  const xr = L - M, xl = L - M - 220;
  linhasTot.forEach(([k, v]) => { texto(k, xl, y - 11, 9.5, false, CINZA); direita(v, xr, y - 11, 9.5, false, ESCURO); y -= 16; });
  ret(xl - 10, y - 30, xr - xl + 10, 28, cor(acento));
  texto('Total', xl, y - 20, 11, true, '1 1 1'); direita(dinheiro(totalGeral), xr - 8, y - 20.5, 14, true, '1 1 1');
  y -= 44;

  // ── condições ──
  const FRETES = { cif: 'Grátis (por nossa conta)', retirada: 'Retirada na loja', cobrado: 'Incluído no total', combinar: 'A combinar' };
  const cond = [['Pagamento', d.pagamento || 'A combinar'], [servico ? 'Prazo de execução' : 'Prazo de entrega', d.entrega || 'A combinar']];
  if (!servico) cond.push(['Frete', FRETES[fr.tipo] || 'A combinar']);
  if (d.validade) cond.push(['Validade', 'Até ' + d.validade]);
  cabe(30 + cond.length * 18);
  texto('Condições', M, y - 12, 11.5, true, ESCURO); y -= 22;
  for (const [k, v] of cond) {
    const ls = quebrar(v, 9.5, true, LARG * 0.62);
    cabe(ls.length * 13 + 8);
    texto(k, M, y - 11, 9.5, false, CINZA);
    ls.forEach((l, i) => direita(l, L - M, y - 11 - i * 13, 9.5, true, ESCURO));
    y -= ls.length * 13 + 4; linha(M, y - 2, L - M, y - 2, LINHA); y -= 6;
  }
  if (d.obs) { y -= 6; cabe(30); texto('Observações', M, y - 11, 10.5, true, ESCURO); y -= 18; paragrafo(d.obs, 9.5, false, CINZA, M, LARG, 3); }

  // ── como aprovar ──
  const aprovar = 'Para aprovar, responda esta mensagem no WhatsApp' + (d.vendedor && d.vendedor.nome ? ' com ' + d.vendedor.nome : '') + '. Ficamos à disposição para ajustar quantidades e condições.';
  const lsA = quebrar(aprovar, 10, false, LARG - 32), hA = 30 + lsA.length * 14;
  y -= 8; cabe(hA + 6);
  ret(M, y - hA, LARG, hA, clara(acento, 0.9)); ret(M, y - hA, 4, hA, cor(acento));
  texto('Gostou da proposta?', M + 16, y - 19, 12, true, ESCURO);
  lsA.forEach((l, i) => texto(l, M + 16, y - 35 - i * 14, 10, false, ESCURO));
  y -= hA;

  // ── rodapé em todas as páginas ──
  paginas.push(s);
  const rod = [(servico ? 'Orçamento' : 'Proposta') + ' nº ' + (d.numero || ''), d.validade ? 'válida até ' + d.validade : '', 'Valores sujeitos a confirmação de disponibilidade.'].filter(Boolean).join(' · ');
  const rodLinhas = quebrar(rod, 7.5, false, LARG - 40);
  const conteudos = paginas.map((p, i) => {
    let r = '';
    rodLinhas.forEach((l, k) => { r += 'BT /F1 7.5 Tf ' + CINZA + ' rg ' + M + ' ' + (M - 4 - k * 10).toFixed(2) + ' Td (' + pdfTexto(l) + ') Tj ET\n'; });
    const n = (i + 1) + '/' + paginas.length; r += 'BT /F1 7.5 Tf ' + CINZA + ' rg ' + (L - M - largura(n, 7.5, false)).toFixed(2) + ' ' + (M - 4) + ' Td (' + n + ') Tj ET\n';
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
