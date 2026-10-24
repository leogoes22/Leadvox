// Endereços antigos (conta.html, cobrancas.html) agora abrem o painel único.
location.replace('/' + location.search + '#' + (document.documentElement.dataset.aba || 'inicio'));
