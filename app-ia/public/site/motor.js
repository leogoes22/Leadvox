/* LeadVox · motor do site da loja (/s/<conta>/).
   Lê /api/site/dados?loja=<conta> (modelo, identidade e estoque) e monta a página. Cada modelo é uma folha de estilo
   em /site/modelos/<modelo>.css sobre a mesma marcação. /s/demo/?modelo=<id> mostra uma loja de exemplo (prévia do painel).
   Tudo que vem do banco entra como texto (textContent), nunca como HTML. */
(function () {
  'use strict';
  var conta = (location.pathname.match(/^\/s\/([a-z0-9-]{3,60})\/?$/) || [])[1] || '';
  var params = new URLSearchParams(location.search);
  var MODELOS = ['garagem', 'premium', 'neon', 'claro', 'editorial', 'vitrine'];
  var FONTES = {
    saira: ['Saira Condensed', 'Albert Sans', 'Saira+Condensed:wght@600;700;800&family=Albert+Sans:wght@400;500;600;700'],
    bebas: ['Bebas Neue', 'Sora', 'Bebas+Neue&family=Sora:wght@400;500;600;700'],
    barlow: ['Barlow Condensed', 'Barlow', 'Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700'],
    oswald: ['Oswald', 'Manrope', 'Oswald:wght@500;600;700&family=Manrope:wght@400;500;600;700'],
    outfit: ['Outfit', 'Manrope', 'Outfit:wght@500;600;700;800&family=Manrope:wght@400;500;600;700']
  };
  var app = document.getElementById('app');

  function h(tag, attrs, filhos) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    (filhos || []).forEach(function (f) { if (f == null || f === false) return; e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  function seguro(u) {
    if (typeof u !== 'string') return '';
    if (demo && u.indexOf('data:image/svg+xml') === 0) return u; // só os desenhos da loja de exemplo
    return /^https:\/\/[^\s"'<>]{4,600}$/.test(u) ? u : '';
  }
  function reais(v) { return typeof v === 'number' && v > 0 ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : ''; }
  function luz(hex) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function zapLink(numero, msg) {
    var n = String(numero || '').replace(/\D/g, ''); if (!n) return '';
    if (n.length <= 11) n = '55' + n;
    return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }
  function falha(texto) { app.textContent = ''; app.appendChild(h('p', { class: 'lv-carregando', text: texto })); }

  if (!conta) return falha('Endereço de loja inválido.');
  var demo = conta === 'demo';
  var pedido = demo ? Promise.resolve(lojaDemo(params.get('modelo'))) :
    fetch('/api/site/dados?loja=' + encodeURIComponent(conta)).then(function (r) { return r.ok ? r.json() : { ativo: false }; });
  pedido.catch(function () { return { ativo: false, erro: 'rede' }; }).then(function (d) {
    if (!d || !d.ativo) return falha(d && d.erro ? 'Não deu para carregar a loja agora. Tente de novo em instantes.' : 'Este site ainda está em preparação.');
    if (!demo && params.get('modelo') && MODELOS.indexOf(params.get('modelo')) >= 0) d.modelo = params.get('modelo');
    montar(d);
  });

  function montar(d) {
    var id = d.identidade || {}, itens = Array.isArray(d.itens) ? d.itens : [];
    var modelo = MODELOS.indexOf(d.modelo) >= 0 ? d.modelo : 'garagem';
    var cor1 = /^#[0-9a-f]{6}$/i.test(id.cor1 || '') ? id.cor1 : '#d6921e', cor2 = /^#[0-9a-f]{6}$/i.test(id.cor2 || '') ? id.cor2 : '#121110';
    var fonte = FONTES[id.fonte] || FONTES.saira;
    var nome = id.nome || 'Loja';
    document.title = nome + ' · Veículos';
    var desc = document.querySelector('meta[name="description"]'); if (desc) desc.setAttribute('content', (id.subtitulo || id.frase || nome).slice(0, 160));
    if (d.publicado && !demo) { var rb = document.querySelector('meta[name="robots"]'); if (rb) rb.setAttribute('content', 'index,follow'); }
    document.getElementById('lvFonte').href = 'https://fonts.googleapis.com/css2?family=' + fonte[2] + '&display=swap';
    document.getElementById('lvModelo').href = '/site/modelos/' + modelo + '.css';
    var raiz = document.documentElement.style;
    raiz.setProperty('--c1', cor1); raiz.setProperty('--c2', cor2);
    raiz.setProperty('--c1-texto', luz(cor1) > 0.6 ? '#111111' : '#ffffff');
    raiz.setProperty('--c2-texto', luz(cor2) > 0.6 ? '#111111' : '#ffffff');
    raiz.setProperty('--f-titulo', "'" + fonte[0] + "', system-ui, sans-serif"); raiz.setProperty('--f-texto', "'" + fonte[1] + "', system-ui, sans-serif");
    document.body.className = 'lv m-' + modelo;

    var zap = function (msg) { return zapLink(id.whatsapp, msg); };
    var abrirZap = function (msg) { var l = zap(msg); return l ? h('a', { class: 'bt bt-zap', href: l, target: '_blank', rel: 'noopener', text: 'Chamar no WhatsApp' }) : null; };
    var logo = seguro(id.logo) ? h('img', { class: 'logo-img', src: id.logo, alt: nome }) : h('span', { class: 'logo-txt', text: nome });

    app.textContent = '';
    // topo
    app.appendChild(h('header', { class: 'topo' }, [
      h('a', { class: 'logo', href: '#inicio', 'aria-label': nome }, [logo]),
      h('nav', { class: 'menu' }, [h('a', { href: '#estoque', text: 'Estoque' }), h('a', { href: '#financiamento', text: 'Financiamento' }), h('a', { href: '#loja', text: 'A loja' })]),
      abrirZap('Olá! Vim pelo site da ' + nome + '.')
    ]));
    // capa
    var capaFoto = itens.length && itens[0].fotos && seguro(itens[0].fotos[0]) ? itens[0] : null;
    app.appendChild(h('section', { class: 'capa', id: 'inicio' }, [
      h('div', { class: 'capa-txt' }, [
        h('p', { class: 'selo', text: itens.length ? itens.length + (itens.length === 1 ? ' veículo no pátio' : ' veículos no pátio') : 'Estoque atualizado' }),
        h('h1', { text: id.frase || 'Seu próximo veículo está aqui.' }),
        id.subtitulo ? h('p', { class: 'sub', text: id.subtitulo }) : null,
        h('div', { class: 'capa-bts' }, [h('a', { class: 'bt bt-1', href: '#estoque', text: 'Ver estoque' }), abrirZap('Olá! Vim pelo site da ' + nome + '.')])
      ]),
      capaFoto ? h('button', { class: 'capa-foto', type: 'button', onclick: function () { detalhe(capaFoto); } }, [
        h('img', { src: capaFoto.fotos[0], alt: capaFoto.nome, loading: 'eager' }),
        h('span', { class: 'capa-legenda' }, [h('b', { text: titulo(capaFoto) }), h('span', { text: reais(capaFoto.preco) || 'Consulte' })])
      ]) : null
    ]));
    // estoque
    var busca = h('input', { type: 'search', placeholder: 'Buscar marca, modelo ou ano', 'aria-label': 'Buscar no estoque' });
    var tipos = uniq(itens.map(function (i) { return (i.atributos || {}).tipo; }));
    var marcas = uniq(itens.map(function (i) { return (i.atributos || {}).marca; }));
    var selTipo = sel('Tipo', ['Todos'].concat(tipos.map(cap))), selMarca = sel('Marca', ['Todas'].concat(marcas.map(cap)));
    var selOrdem = sel('Ordenar', ['Destaques', 'Menor preço', 'Maior preço', 'Mais novos']);
    var grade = h('div', { class: 'grade' }), vazio = h('p', { class: 'vazio', text: 'Nenhum veículo com esses filtros.', hidden: true });
    app.appendChild(h('section', { class: 'estoque', id: 'estoque' }, [
      h('div', { class: 'tit' }, [h('h2', { text: 'Estoque' }), h('p', { text: 'Fotos, ficha e preço de cada veículo. Gostou? Chame no WhatsApp.' })]),
      h('div', { class: 'filtros' }, [busca, tipos.length > 1 ? selTipo : null, marcas.length > 1 ? selMarca : null, selOrdem]),
      grade, vazio
    ]));
    function filtrar() {
      var q = busca.value.trim().toLowerCase(), t = selTipo.value, m = selMarca.value, o = selOrdem.value;
      var lista = itens.filter(function (i) {
        var a = i.atributos || {};
        if (t !== 'Todos' && cap(a.tipo) !== t) return false;
        if (m !== 'Todas' && cap(a.marca) !== m) return false;
        return !q || (i.nome + ' ' + (a.ano || '') + ' ' + (a.cor || '')).toLowerCase().indexOf(q) >= 0;
      });
      if (o === 'Menor preço') lista.sort(function (a, b) { return (a.preco || 1e12) - (b.preco || 1e12); });
      if (o === 'Maior preço') lista.sort(function (a, b) { return (b.preco || 0) - (a.preco || 0); });
      if (o === 'Mais novos') lista.sort(function (a, b) { return anoNum(b) - anoNum(a); });
      grade.textContent = '';
      lista.forEach(function (i) { grade.appendChild(card(i)); });
      vazio.hidden = lista.length > 0;
    }
    [busca, selTipo, selMarca, selOrdem].forEach(function (e) { e.addEventListener(e === busca ? 'input' : 'change', filtrar); });
    if (!itens.length) { grade.appendChild(h('p', { class: 'vazio', text: 'O estoque está sendo atualizado. Chame no WhatsApp para saber as novidades.' })); }
    else filtrar();

    // financiamento: a mensagem vai pronta para o WhatsApp da loja (nada fica guardado no site)
    var fNome = h('input', { required: true, maxlength: 60, placeholder: 'Seu nome', 'aria-label': 'Seu nome' });
    var fCarro = h('input', { maxlength: 80, placeholder: 'Veículo de interesse (opcional)', 'aria-label': 'Veículo de interesse' });
    var fEntrada = h('input', { maxlength: 20, inputmode: 'numeric', placeholder: 'Entrada (opcional)', 'aria-label': 'Valor de entrada' });
    app.appendChild(h('section', { class: 'financiamento', id: 'financiamento' }, [
      h('div', { class: 'tit' }, [h('h2', { text: 'Financiamento' }), h('p', { text: 'Simule sem compromisso. A gente responde pelo WhatsApp com as condições.' })]),
      zap('') ? h('form', { class: 'fin-form', onsubmit: function (ev) {
        ev.preventDefault();
        var msg = 'Olá! Sou ' + fNome.value.trim() + ' e quero simular um financiamento' + (fCarro.value.trim() ? ' do ' + fCarro.value.trim() : '') + (fEntrada.value.trim() ? ', com entrada de ' + fEntrada.value.trim() : '') + '.';
        window.open(zap(msg), '_blank', 'noopener');
      } }, [fNome, fCarro, fEntrada, h('button', { class: 'bt bt-1', type: 'submit', text: 'Simular no WhatsApp' })]) : null
    ]));
    // a loja
    app.appendChild(h('section', { class: 'loja', id: 'loja' }, [
      h('div', { class: 'tit' }, [h('h2', { text: 'A loja' }), id.sobre ? h('p', { text: id.sobre }) : null]),
      h('ul', { class: 'contatos' }, [
        id.endereco ? h('li', {}, [h('b', { text: 'Endereço' }), h('span', { text: id.endereco }), seguro(id.mapa) ? h('a', { href: id.mapa, target: '_blank', rel: 'noopener', text: 'Ver no mapa' }) : null]) : null,
        id.horario ? h('li', {}, [h('b', { text: 'Horário' }), h('span', { text: id.horario })]) : null,
        id.whatsapp ? h('li', {}, [h('b', { text: 'WhatsApp' }), h('a', { href: zap(''), target: '_blank', rel: 'noopener', text: fone(id.whatsapp) })]) : null,
        id.telefone ? h('li', {}, [h('b', { text: 'Telefone' }), h('span', { text: id.telefone })]) : null,
        id.instagram ? h('li', {}, [h('b', { text: 'Instagram' }), h('a', { href: 'https://instagram.com/' + id.instagram, target: '_blank', rel: 'noopener', text: '@' + id.instagram })]) : null
      ])
    ]));
    app.appendChild(h('footer', { class: 'rodape' }, [h('span', { text: '© ' + new Date().getFullYear() + ' ' + nome }), h('a', { href: 'https://leadvox.com.br', target: '_blank', rel: 'noopener', text: 'Site feito com LeadVox' })]));
    if (zap('')) app.appendChild(h('a', { class: 'zap-flutua', href: zap('Olá! Vim pelo site da ' + nome + '.'), target: '_blank', rel: 'noopener', 'aria-label': 'Chamar no WhatsApp', text: 'WhatsApp' }));

    // temas e campanha do painel (não na loja de exemplo)
    if (!demo) { var s = document.createElement('script'); s.src = '/site/tema.js'; s.defer = true; s.setAttribute('data-loja', conta); document.body.appendChild(s); }

    function card(i) {
      var a = i.atributos || {}, foto = i.fotos && seguro(i.fotos[0]) ? i.fotos[0] : '';
      return h('article', { class: 'card' }, [
        h('button', { class: 'card-foto', type: 'button', 'aria-label': 'Ver ' + i.nome, onclick: function () { detalhe(i); } }, [foto ? h('img', { src: foto, alt: i.nome, loading: 'lazy' }) : h('span', { class: 'sem-foto', text: 'Sem foto' })]),
        h('div', { class: 'card-txt' }, [
          h('h3', { text: titulo(i) }),
          a.versao ? h('p', { class: 'versao', text: a.versao }) : null,
          h('p', { class: 'ficha', text: [a.ano, a.cambio, a.combustivel].filter(Boolean).join(' · ') }),
          h('p', { class: 'preco', text: reais(i.preco) || 'Consulte' })
        ]),
        h('div', { class: 'card-bts' }, [h('button', { class: 'bt bt-2', type: 'button', text: 'Ver detalhes', onclick: function () { detalhe(i); } }),
          zap('') ? h('a', { class: 'bt bt-1', href: zap('Olá! Vi o ' + i.nome + ' no site e quero saber mais.'), target: '_blank', rel: 'noopener', text: 'Tenho interesse' }) : null])
      ]);
    }
    function detalhe(i) {
      var a = i.atributos || {}, fotos = (i.fotos || []).filter(seguro), n = 0;
      var img = h('img', { alt: i.nome, src: fotos[0] || '' });
      var mostra = function (k) { if (!fotos.length) return; n = (k + fotos.length) % fotos.length; img.src = fotos[n]; cont.textContent = (n + 1) + ' / ' + fotos.length; };
      var cont = h('span', { class: 'cont', text: fotos.length ? '1 / ' + fotos.length : '' });
      var linhas = [['Marca', cap(a.marca)], ['Modelo', a.modelo], ['Versão', a.versao], ['Ano', a.ano], ['Câmbio', a.cambio], ['Combustível', a.combustivel], ['Cor', a.cor]]
        .filter(function (l) { return l[1]; }).map(function (l) { return h('tr', {}, [h('th', { text: l[0] }), h('td', { text: String(l[1]) })]); });
      var fundo = h('div', { class: 'det-fundo', onclick: function (e) { if (e.target === fundo) fechar(); } });
      var fechar = function () { fundo.remove(); document.removeEventListener('keydown', tecla); document.body.classList.remove('travado'); };
      var tecla = function (e) { if (e.key === 'Escape') fechar(); if (e.key === 'ArrowRight') mostra(n + 1); if (e.key === 'ArrowLeft') mostra(n - 1); };
      fundo.appendChild(h('div', { class: 'det', role: 'dialog', 'aria-modal': 'true', 'aria-label': i.nome }, [
        h('button', { class: 'det-x', type: 'button', 'aria-label': 'Fechar', text: '×', onclick: fechar }),
        h('div', { class: 'det-galeria' }, [img, fotos.length > 1 ? h('button', { class: 'seta esq', type: 'button', 'aria-label': 'Foto anterior', text: '‹', onclick: function () { mostra(n - 1); } }) : null,
          fotos.length > 1 ? h('button', { class: 'seta dir', type: 'button', 'aria-label': 'Próxima foto', text: '›', onclick: function () { mostra(n + 1); } }) : null, cont]),
        h('div', { class: 'det-txt' }, [h('h3', { text: titulo(i) }), a.versao ? h('p', { class: 'versao', text: a.versao }) : null,
          h('p', { class: 'preco', text: reais(i.preco) || 'Consulte' }), linhas.length ? h('table', { class: 'ficha-tab' }, linhas) : null,
          i.descricao ? h('p', { class: 'desc', text: i.descricao }) : null,
          h('div', { class: 'card-bts' }, [zap('') ? h('a', { class: 'bt bt-1', href: zap('Olá! Vi o ' + i.nome + ' no site e quero saber mais.'), target: '_blank', rel: 'noopener', text: 'Chamar no WhatsApp' }) : null,
            zap('') ? h('a', { class: 'bt bt-2', href: zap('Olá! Quero simular o financiamento do ' + i.nome + '.'), target: '_blank', rel: 'noopener', text: 'Simular financiamento' }) : null])])
      ]));
      document.body.appendChild(fundo); document.body.classList.add('travado'); document.addEventListener('keydown', tecla);
      fundo.querySelector('.det-x').focus();
    }
  }

  function titulo(i) { var a = i.atributos || {}; return a.marca && a.modelo ? cap(a.marca) + ' ' + a.modelo : i.nome; }
  function anoNum(i) { var m = String((i.atributos || {}).ano || '').match(/(\d{4})\D*$/); return m ? Number(m[1]) : 0; }
  function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }
  function uniq(l) { return l.filter(function (x, k) { return x && l.indexOf(x) === k; }).sort(); }
  function fone(n) { var d = String(n).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'); }
  function sel(rotulo, opcoes) { return h('select', { 'aria-label': rotulo }, opcoes.map(function (o) { return h('option', { value: o, text: o }); })); }

  // Loja de exemplo para a prévia do painel: veículos com desenho no lugar da foto.
  function lojaDemo(m) {
    var cores = { garagem: ['#d6921e', '#121110'], premium: ['#dbc300', '#0a0a0c'], neon: ['#7b2ff7', '#070409'], claro: ['#c8131e', '#000000'], editorial: ['#d3252f', '#0a0a0c'], vitrine: ['#2fc4b2', '#0a1228'] };
    var c = cores[m] || cores.garagem;
    var desenho = function (cor, moto) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#1d1d22"/><rect y="190" width="400" height="70" fill="#141418"/>' +
        (moto ? '<circle cx="120" cy="190" r="38" fill="none" stroke="#ddd" stroke-width="10"/><circle cx="285" cy="190" r="38" fill="none" stroke="#ddd" stroke-width="10"/><path d="M120 190 L185 120 L250 120 L285 190 M185 120 L215 95 L250 100" stroke="' + cor + '" stroke-width="14" fill="none" stroke-linecap="round"/>'
          : '<path d="M60 185 Q70 135 130 128 L170 92 Q200 80 250 84 L300 120 Q350 128 352 170 L352 185 Z" fill="' + cor + '"/><circle cx="125" cy="188" r="26" fill="#222" stroke="#ddd" stroke-width="6"/><circle cx="295" cy="188" r="26" fill="#222" stroke="#ddd" stroke-width="6"/>') + '</svg>';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    var v = [['carro', 'TOYOTA', 'COROLLA', '2.0 XEI CVT', '2021/2022', 'Automático', 'Flex', 119900], ['moto', 'HONDA', 'CG 160', 'FAN', '2023/2023', 'Manual', 'Flex', 15990],
      ['carro', 'JEEP', 'COMPASS', 'LONGITUDE 1.3 TURBO', '2022/2023', 'Automático', 'Flex', 139900], ['moto', 'YAMAHA', 'FAZER 250', 'ABS', '2022/2022', 'Manual', 'Flex', 18990],
      ['carro', 'VOLKSWAGEN', 'POLO', '1.0 TSI', '2020/2021', 'Automático', 'Flex', 79900], ['carro', 'CHEVROLET', 'ONIX', '1.0 LT', '2019/2020', 'Manual', 'Flex', 0],
      ['moto', 'HONDA', 'XRE 300', 'SAHARA', '2024/2024', 'Manual', 'Flex', 27990], ['carro', 'FIAT', 'TORO', 'VOLCANO 2.0 DIESEL', '2021/2021', 'Automático', 'Diesel', 149900]];
    return { ativo: true, modelo: MODELOS.indexOf(m) >= 0 ? m : 'garagem', publicado: false,
      identidade: { nome: 'Loja Demo Veículos', cor1: c[0], cor2: c[1], fonte: { premium: 'oswald', neon: 'outfit', claro: 'barlow', editorial: 'outfit' }[m] || 'saira',
        frase: 'Seu próximo veículo está no nosso pátio.', subtitulo: 'Carros e motos revisados, com foto, ficha e preço. Financiamento com resposta no mesmo dia.',
        sobre: 'Loja de exemplo da LeadVox para mostrar como fica o site com o seu estoque.', whatsapp: '21999999999', endereco: 'Av. Exemplo, 100 · Rio de Janeiro',
        horario: 'Seg a sex 9h às 18h · Sáb 9h às 14h', instagram: 'leadvox.com.br' },
      itens: v.map(function (x, k) {
        return { id: k + 1, nome: x[1] + ' ' + x[2] + ' ' + x[3] + ' ' + x[4], categoria: x[0] === 'moto' ? 'Moto' : 'Carro', preco: x[7] || null,
          atributos: { tipo: x[0], marca: x[1], modelo: x[2], versao: x[3], ano: x[4], cambio: x[5], combustivel: x[6], cor: 'Exemplo' },
          descricao: 'Veículo de exemplo da loja demo.', fotos: [desenho(c[0], x[0] === 'moto'), desenho('#888', x[0] === 'moto')] };
      }) };
  }
})();
