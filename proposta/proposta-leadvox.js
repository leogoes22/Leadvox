/* ═══════════════════════════════════════════════════════════════════
   PROPOSTA LEADVOX · gerador de PDF no navegador
   Junta as 2 páginas fixas (base-carro.pdf / base-moto.pdf) com uma
   página personalizada:
     modo "plano"       → itens e valores montados no site  (vai no fim)
     modo "diagnostico" → resultado do quiz, sem valores    (vai no início)

   Uso:
     const r = await LeadVoxProposta.gerar({ modo:"plano", tipo:"carro", ... });
     r.base64  → PDF em base64 (para mandar ao N8N)
     r.blob    → para baixar no navegador
     r.nome    → nome do arquivo     r.numero → nº da proposta

   Arquivos que ficam na mesma pasta deste script:
     base-carro.pdf · base-moto.pdf · pagina-modelo.pdf · Poppins-*.ttf (aqui ou em fonts/)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  // ─────────────── TEXTOS EDITÁVEIS ───────────────
  const CONFIG = {
    validadeDias: 7,
    whatsapp: "(21) 98769-6628",
    email: "contato@leadvox.com.br",
    site: "leadvox.com.br",
    responsavel: "Leonardo Vasconcellos",
    cargo: "CEO · LeadVox",
    condicoes: [
      "Pré-pago e sem fidelidade: cada pagamento libera 30 dias corridos de plataforma e serviços.",
      "O 1º pagamento soma a implementação (quando houver) à primeira mensalidade.",
      "Garantia de 7 dias: se não gostar, devolvemos 100% do valor investido.",
      "Os serviços de IA funcionam de forma independente do CRM.",
    ],
    plano: {
      selo: "PROPOSTA COMERCIAL",
      titulo1: "PROPOSTA PARA",
      intro: "{nome}, este é o plano que você montou no nosso site. A sua Central de Vendas começa a ser montada assim que o 1º pagamento for confirmado.",
      aprovar: "Para aprovar, responda APROVADO no WhatsApp ou assine abaixo e devolva este PDF.",
    },
    diagnostico: {
      selo: "DIAGNÓSTICO DE VENDAS",
      titulo1: "DIAGNÓSTICO DA",
      escapando: "ONDE A VENDA ESTÁ ESCAPANDO",
      solucoes: "O QUE A LEADVOX COLOCA NA SUA LOJA",
      cta: "Vamos colocar isso para rodar na {loja}?",
      ctaSub: "Responda a mensagem no WhatsApp e eu te mostro funcionando com o estoque da sua loja.",
    },
  };
  // ─────────────────────────────────────────────────

  const BASE = ((document.currentScript && document.currentScript.src) || location.href).replace(/[^/]*$/, "");
  const LIBS = [
    ["PDFLib", "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"],
    ["fontkit", "https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"],
  ];
  const W = 595.5, H = 842.25, MX = 37.5, CW = W - MX * 2;

  function carregar(nome, url) {
    if (window[nome]) return Promise.resolve();
    return new Promise(function (ok, erro) {
      const s = document.createElement("script"); s.src = url; s.onload = ok;
      s.onerror = function () { erro(new Error("Não carregou " + url)); }; document.head.appendChild(s);
    });
  }
  async function bytes(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("Arquivo não encontrado: " + url);
    return new Uint8Array(await r.arrayBuffer());
  }
  // fontes: aceita na mesma pasta do script ou na subpasta fonts/
  const fonte = (nome) => bytes(BASE + nome).catch(() => bytes(BASE + "fonts/" + nome));
  const limpa = (s) => String(s == null ? "" : s)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hoje = () => new Date().toLocaleDateString("pt-BR");
  function numeroProposta() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return "LV-" + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
      Math.random().toString(16).slice(2, 6).toUpperCase();
  }

  async function gerar(o) {
    for (const [n, u] of LIBS) await carregar(n, u);
    const { PDFDocument, rgb } = window.PDFLib;
    const modo = o.modo === "diagnostico" ? "diagnostico" : "plano";
    const tipo = o.tipo === "moto" ? "moto" : "carro";
    const numero = o.numero || numeroProposta();

    const [baseB, modeloB, fR, fM, fB] = await Promise.all([
      bytes(BASE + "base-" + tipo + ".pdf").catch(() => bytes(BASE + "base-carro.pdf")),
      bytes(BASE + "pagina-modelo.pdf"),
      fonte("Poppins-Regular.ttf"), fonte("Poppins-Medium.ttf"), fonte("Poppins-Bold.ttf"),
    ]);
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const F = { r: await doc.embedFont(fR, { subset: true }), m: await doc.embedFont(fM, { subset: true }), b: await doc.embedFont(fB, { subset: true }) };
    const base = await PDFDocument.load(baseB), modelo = await PDFDocument.load(modeloB);

    const C = {
      branco: rgb(1, 1, 1), verde: rgb(0.482, 0.89, 0.353), verdeSelo: rgb(0.561, 0.89, 0.435), teal: rgb(0.204, 0.827, 0.6),
      texto: rgb(0.878, 0.925, 0.894), suave: rgb(0.659, 0.741, 0.686), apagado: rgb(0.45, 0.55, 0.48),
      card: rgb(0.031, 0.075, 0.051), borda: rgb(0.118, 0.361, 0.204), vermelho: rgb(1, 0.353, 0.373),
      cta: rgb(0.122, 0.478, 0.216), ctaTexto: rgb(0.851, 0.949, 0.875), escuro: rgb(0.051, 0.267, 0.125),
    };

    // ── helpers de desenho (coordenadas "de cima para baixo", como no Canva) ──
    let page, y, TOPO = H;   // TOPO: topo real da página (o modelo tem a caixa deslocada)
    async function novaPagina(selo) {
      const [p] = await doc.copyPages(modelo, [0]); page = doc.addPage(p); y = 104;
      const mb = page.getMediaBox(); TOPO = mb.y + mb.height;
      espacado(selo, 478.5, 52.9, F.b, 6.38, C.verdeSelo, "centro");
    }
    function texto(t, x, top, f, size, cor, opt) {
      opt = opt || {}; t = limpa(t);
      let xx = x; const w = f.widthOfTextAtSize(t, size);
      if (opt.alinha === "direita") xx = x - w; else if (opt.alinha === "centro") xx = x - w / 2;
      page.drawText(t, { x: xx, y: TOPO - top - size * 0.78, size, font: f, color: cor }); return w;
    }
    function espacado(t, x, top, f, size, cor, alinha) {   // texto com letras espaçadas (selos e rótulos)
      t = limpa(t).toUpperCase(); const track = size * 0.42;
      const larg = [...t].reduce((s, c) => s + f.widthOfTextAtSize(c, size) + track, -track);
      let xx = alinha === "centro" ? x - larg / 2 : x;
      for (const c of t) { page.drawText(c, { x: xx, y: TOPO - top - size * 0.78, size, font: f, color: cor }); xx += f.widthOfTextAtSize(c, size) + track; }
    }
    function quebra(t, f, size, largura) {
      const linhas = []; let atual = "";
      for (const p of limpa(t).split(" ")) {
        const teste = atual ? atual + " " + p : p;
        if (f.widthOfTextAtSize(teste, size) > largura && atual) { linhas.push(atual); atual = p; } else atual = teste;
      }
      if (atual) linhas.push(atual); return linhas;
    }
    function paragrafo(t, x, top, f, size, cor, largura, entre) {
      const ls = quebra(t, f, size, largura); entre = entre || size * 1.45;
      ls.forEach((l, i) => texto(l, x, top + i * entre, f, size, cor)); return ls.length * entre;
    }
    function caixa(x, top, w, h, fill, borda, raio) {
      raio = raio || 8;
      const path = `M ${raio} 0 H ${w - raio} Q ${w} 0 ${w} ${raio} V ${h - raio} Q ${w} ${h} ${w - raio} ${h} H ${raio} Q 0 ${h} 0 ${h - raio} V ${raio} Q 0 0 ${raio} 0 Z`;
      const op = { x, y: TOPO - top, color: fill };
      if (borda) { op.borderColor = borda; op.borderWidth = 0.7; }
      page.drawSvgPath(path, op);
    }
    function bolinha(x, top, cor, marca) {
      page.drawCircle({ x, y: TOPO - top, size: 5.2, borderColor: cor, borderWidth: 0.9 });
      if (marca === "x") {
        page.drawLine({ start: { x: x - 2, y: TOPO - top - 2 }, end: { x: x + 2, y: TOPO - top + 2 }, thickness: 0.9, color: cor });
        page.drawLine({ start: { x: x - 2, y: TOPO - top + 2 }, end: { x: x + 2, y: TOPO - top - 2 }, thickness: 0.9, color: cor });
      } else {
        page.drawLine({ start: { x: x - 2.3, y: TOPO - top }, end: { x: x - 0.6, y: TOPO - top - 1.8 }, thickness: 1, color: cor });
        page.drawLine({ start: { x: x - 0.6, y: TOPO - top - 1.8 }, end: { x: x + 2.5, y: TOPO - top + 1.9 }, thickness: 1, color: cor });
      }
    }
    async function garante(altura, selo) { if (y + altura > 800) await novaPagina(selo); }
    function titulo(l1, l2) {
      texto(l1, MX, y, F.b, 21, C.branco); y += 24;
      const ls = quebra(l2.toUpperCase(), F.b, 21, CW);
      ls.slice(0, 2).forEach((l) => { texto(l, MX, y, F.b, 21, C.verde); y += 24; }); y += 6;
    }

    const cli = o.cliente || {};
    const primeiro = limpa(cli.nome).split(" ")[0] || "Olá";
    const loja = limpa(cli.loja) || limpa(cli.nome) || "sua loja";

    // ═════════════ PÁGINA DO PLANO (site) ═════════════
    async function paginaPlano() {
      const T = CONFIG.plano, pl = o.plano || {};
      await novaPagina(T.selo);
      espacado(`Proposta nº ${numero}  ·  ${hoje()}  ·  válida por ${CONFIG.validadeDias} dias`, MX, y, F.b, 6, C.verde); y += 18;
      titulo(T.titulo1, loja);
      y += paragrafo((o.intro || T.intro).replace("{nome}", primeiro), MX, y, F.r, 8.4, C.suave, CW * 0.8) + 14;

      espacado("O que está incluso", MX, y, F.b, 6, C.verde); y += 14;
      for (const it of (pl.itens || [])) {
        const desc = limpa(it.desc);
        const linhasDesc = desc ? quebra(desc, F.r, 6.9, CW - 160) : [];
        const h = 22 + linhasDesc.length * 9.5;
        await garante(h + 6, T.selo);
        caixa(MX, y, CW, h, C.card, C.borda, 8);
        texto(it.nome, MX + 14, y + 8, F.b, 8.1, C.branco);
        linhasDesc.forEach((l, i) => texto(l, MX + 14, y + 19 + i * 9.5, F.r, 6.9, C.suave));
        const valor = it.tipo === "c" ? "Sob consulta" : brl(it.valor);
        let sufixo = it.tipo === "m" ? "por mês" : it.tipo === "u" ? "pagamento único" : "";
        if (it.valorDe && it.valorDe > it.valor) {   // preço com desconto: mostra o "de" riscado
          const de = "de " + brl(it.valorDe), wDe = F.r.widthOfTextAtSize(de, 6.3), xDe = MX + CW - 14;
          texto(de, xDe, y + h / 2 + 2, F.r, 6.3, C.apagado, { alinha: "direita" });
          page.drawLine({ start: { x: xDe - wDe + 8, y: TOPO - (y + h / 2 + 4.6) }, end: { x: xDe, y: TOPO - (y + h / 2 + 4.6) }, thickness: 0.6, color: C.apagado });
          sufixo = "";
          texto(valor, MX + CW - 14, y + h / 2 - 9, F.b, 9, C.verde, { alinha: "direita" });
        } else {
          texto(valor, MX + CW - 14, y + (sufixo ? h / 2 - 9 : h / 2 - 5), F.b, 9, C.branco, { alinha: "direita" });
        }
        if (sufixo) texto(sufixo, MX + CW - 14, y + h / 2 + 2, F.r, 6.3, C.apagado, { alinha: "direita" });
        y += h + 6;
      }

      // totais
      await garante(74, T.selo); y += 6;
      caixa(MX, y, CW, 64, C.cta, rgb(0.3, 0.75, 0.38), 10);
      texto("Mensalidade", MX + 18, y + 13, F.r, 7.7, C.ctaTexto);
      texto(brl(pl.mensal), MX + 18, y + 25, F.b, 21, C.branco);
      const xr = MX + CW - 18;
      texto("Implementação (única)", xr - 92, y + 15, F.r, 7.4, C.ctaTexto, { alinha: "direita" });
      texto(brl(pl.taxa), xr, y + 15, F.m, 7.4, C.branco, { alinha: "direita" });
      texto("1º pagamento", xr - 92, y + 36, F.b, 8.4, C.branco, { alinha: "direita" });
      texto(brl(pl.primeiro), xr, y + 34, F.b, 11, C.branco, { alinha: "direita" });
      y += 76;

      // condição especial (resgate): caixa de destaque
      if (o.oferta && o.oferta.texto) {
        const ls = quebra(o.oferta.texto, F.r, 7.8, CW - 36);
        const h = 28 + ls.length * 11;
        await garante(h + 10, T.selo);
        caixa(MX, y, CW, h, rgb(0.17, 0.13, 0.02), rgb(0.96, 0.77, 0.26), 10);
        espacado(o.oferta.titulo || "Condição especial", MX + 18, y + 10, F.b, 6.3, rgb(0.96, 0.77, 0.26));
        ls.forEach((l, i) => texto(l, MX + 18, y + 22 + i * 11, i === 0 ? F.b : F.r, 7.8, C.branco));
        y += h + 10;
      }
      y += 6;

      // condições
      const condH = CONFIG.condicoes.reduce((s, c) => s + quebra(c, F.r, 7.4, CW - 24).length * 10.5 + 4, 0);
      await garante(condH + 20, T.selo);
      espacado("Condições", MX, y, F.b, 6, C.verde); y += 14;
      for (const c of CONFIG.condicoes) {
        bolinha(MX + 5, y + 4.5, C.verde, "ok");
        y += paragrafo(c, MX + 16, y, F.r, 7.4, C.texto, CW - 24, 10.5) + 4;
      }

      // aceite
      await garante(96, T.selo); y += 12;
      espacado("Como aprovar", MX, y, F.b, 6, C.verde); y += 14;
      y += paragrafo(T.aprovar, MX, y, F.r, 7.6, C.texto, CW) + 34;
      const meia = (CW - 30) / 2;
      [[MX, loja, limpa(cli.nome) ? limpa(cli.nome) + " · Cliente" : "Cliente"], [MX + meia + 30, CONFIG.responsavel, CONFIG.cargo]].forEach(([x, n, c]) => {
        page.drawLine({ start: { x, y: TOPO - y }, end: { x: x + meia, y: TOPO - y }, thickness: 0.6, color: C.apagado });
        texto(n, x, y + 6, F.b, 7.5, C.branco); texto(c, x, y + 16, F.r, 6.6, C.suave);
      });
    }

    // ═════════════ PÁGINA DO DIAGNÓSTICO (quiz) ═════════════
    async function paginaDiagnostico() {
      const T = CONFIG.diagnostico, dg = o.diagnostico || {};
      await novaPagina(T.selo);
      espacado(`Diagnóstico nº ${numero}  ·  ${hoje()}`, MX, y, F.b, 6, C.verde); y += 18;
      titulo(T.titulo1, loja);

      const score = Math.max(0, Math.min(100, Math.round(Number(dg.score) || 0)));
      const corNivel = score < 30 ? rgb(1, 0.54, 0.36) : score < 55 ? rgb(0.96, 0.77, 0.26) : score < 80 ? rgb(0.56, 0.88, 0.54) : C.verde;
      const descL = quebra(limpa(dg.nivelDesc), F.r, 7.6, CW - 170);
      const hS = Math.max(78, 40 + descL.length * 11);
      caixa(MX, y, CW, hS, C.card, C.borda, 10);
      const wN = texto(String(score), MX + 18, y + 14, F.b, 34, C.branco);
      texto("/100", MX + 20 + wN, y + 30, F.m, 11, C.suave);
      texto(dg.nivel || "", MX + 140, y + 15, F.b, 12, corNivel);
      descL.forEach((l, i) => texto(l, MX + 140, y + 33 + i * 11, F.r, 7.6, C.texto));
      const by = y + hS - 14;
      caixa(MX + 18, by, CW - 36, 5, rgb(0.12, 0.2, 0.16), null, 2.5);
      caixa(MX + 18, by, Math.max(6, (CW - 36) * score / 100), 5, corNivel, null, 2.5);
      y += hS + 18;

      const pontos = (dg.pontos || []).map(limpa).filter(Boolean).slice(0, 6);
      if (pontos.length) {
        espacado(T.escapando, MX, y, F.b, 6, C.vermelho); y += 14;
        for (const p of pontos) {
          const ls = quebra(p, F.r, 7.8, CW - 24); await garante(ls.length * 11 + 6, T.selo);
          bolinha(MX + 5, y + 4.5, C.vermelho, "x");
          ls.forEach((l, i) => texto(l, MX + 16, y + i * 11, F.r, 7.8, C.texto)); y += ls.length * 11 + 6;
        }
        y += 10;
      }

      const sols = (dg.solucoes || []).slice(0, 8);
      if (sols.length) {
        await garante(40, T.selo);
        espacado(T.solucoes, MX, y, F.b, 6, C.verde); y += 14;
        const colW = (CW - 10) / 2;
        for (let i = 0; i < sols.length; i += 2) {
          const par = sols.slice(i, i + 2).map((s) => ({ nome: limpa(s.nome), ls: quebra(s.txt || s.texto || "", F.r, 6.9, colW - 24).slice(0, 4) }));
          const h = 26 + Math.max(...par.map((p) => p.ls.length)) * 9.5;
          await garante(h + 8, T.selo);
          par.forEach((p, k) => {
            const x = MX + k * (colW + 10);
            caixa(x, y, colW, h, C.card, C.borda, 8);
            texto(p.nome, x + 12, y + 9, F.b, 8.1, C.branco);
            p.ls.forEach((l, j) => texto(l, x + 12, y + 21 + j * 9.5, F.r, 6.9, C.suave));
          });
          y += h + 8;
        }
      }

      await garante(76, T.selo); y += 8;
      caixa(MX, y, CW, 62, C.cta, rgb(0.3, 0.75, 0.38), 10);
      texto(T.cta.replace("{loja}", loja), MX + 18, y + 14, F.b, 11.5, C.branco);
      paragrafo(T.ctaSub, MX + 18, y + 32, F.r, 7.4, C.ctaTexto, CW - 170, 10);
      caixa(MX + CW - 140, y + 18, 122, 26, C.branco, null, 7);
      texto(CONFIG.whatsapp, MX + CW - 79, y + 27, F.b, 8, C.escuro, { alinha: "centro" });
    }

    // ═════════════ MONTAGEM ═════════════
    const fixas = await doc.copyPages(base, base.getPageIndices());
    if (modo === "diagnostico") { await paginaDiagnostico(); fixas.forEach((p) => doc.addPage(p)); }
    else { fixas.forEach((p) => doc.addPage(p)); await paginaPlano(); }

    doc.setTitle((modo === "diagnostico" ? "Diagnóstico LeadVox - " : "Proposta LeadVox - ") + loja);
    doc.setAuthor("LeadVox"); doc.setCreator("LeadVox");
    const out = await doc.save();
    let bin = ""; for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    const slug = loja.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "Cliente";
    return {
      base64: btoa(bin), bytes: out, blob: new Blob([out], { type: "application/pdf" }), numero,
      nome: (modo === "diagnostico" ? "Diagnostico-LeadVox-" : "Proposta-LeadVox-") + slug + ".pdf",
    };
  }

  window.LeadVoxProposta = { gerar, CONFIG };
})();
