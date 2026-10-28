import test from 'node:test';
import assert from 'node:assert/strict';
import { ipInterno, extrairIdentidade, lerSiteLoja, baixarLogoSite } from '../integrations/site-loja.mjs';
import { cleanLoja } from '../account-api.mjs';

const msg = (re) => (e) => re.test(e.message);
const publico = async () => [{ address: '104.21.3.4', family: 4 }];
const pagina = (html, extra = {}) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html', ...extra }), arrayBuffer: async () => new TextEncoder().encode(html).buffer });

test('puxar do site: endereços internos nunca são lidos (IP, rede local, redirecionamento para dentro)', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(ipInterno(ip), true, ip);
  for (const ip of ['104.21.3.4', '8.8.8.8', '2606:4700::1']) assert.equal(ipInterno(ip), false, ip);
  const nunca = async () => { throw Error('não devia buscar'); };
  await assert.rejects(lerSiteLoja('http://127.0.0.1/', { fetchImpl: nunca, lookup: publico }), msg(/público/));
  await assert.rejects(lerSiteLoja('https://loja.com.br:8000/', { fetchImpl: nunca, lookup: publico }), msg(/http ou https/));
  await assert.rejects(lerSiteLoja('https://intranet.loja.com.br/', { fetchImpl: nunca, lookup: async () => [{ address: '10.1.2.3', family: 4 }] }), msg(/público/));
  const redireciona = async () => ({ ok: false, status: 302, headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }) });
  await assert.rejects(lerSiteLoja('https://loja.com.br/', { fetchImpl: redireciona, lookup: async (h) => [{ address: h === 'loja.com.br' ? '104.21.3.4' : '169.254.169.254', family: 4 }] }), msg(/público/));
});

test('puxar do site: nome, logo, CNPJ, telefone, WhatsApp, e-mail, endereço, Instagram e cor', async () => {
  const html = `<html><head><title>Auto Center Ação | Seminovos</title><meta name="theme-color" content="#0EA5E9">
    <script type="application/ld+json">{"@type":"AutoDealer","name":"Auto Center Ação","address":{"streetAddress":"Av. das Américas, 1000","addressLocality":"Rio de Janeiro","addressRegion":"RJ"}}</script></head>
    <body><img class="site-logo" src="/img/logo.png"><a href="tel:+552133334444">Ligue</a><a href="https://wa.me/5521981081044">WhatsApp</a>
    <a href="mailto:contato@acao.com.br">e-mail</a><a href="https://instagram.com/autocenteracao">insta</a><footer>CNPJ 12.345.678/0001-90</footer></body></html>`;
  const r = await lerSiteLoja('www.acao.com.br', { fetchImpl: async () => pagina(html), lookup: publico });
  assert.deepEqual(r, { nome: 'Auto Center Ação', logo: 'https://www.acao.com.br/img/logo.png', cnpj: '12.345.678/0001-90', telefone: '(21) 3333-4444', whatsapp: '(21) 98108-1044',
    email: 'contato@acao.com.br', endereco: 'Av. das Américas, 1000, Rio de Janeiro, RJ', instagram: '@autocenteracao', site: 'acao.com.br', cor: '#0ea5e9' });
  assert.equal(extrairIdentidade('<title>Loja X - Carros</title>', 'https://x.com.br/').nome, 'Loja X');
});

test('puxar do site: a logo volta como imagem; outro tipo de arquivo é recusado', async () => {
  const img = { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer };
  assert.match(await baixarLogoSite('https://acao.com.br/logo.png', { fetchImpl: async () => img, lookup: publico }), /^data:image\/png;base64,/);
  await assert.rejects(baixarLogoSite('https://acao.com.br/x', { fetchImpl: async () => pagina('<html>'), lookup: publico }), msg(/imagem/));
});

test('identidade da loja: só campos conhecidos, logo da pasta do painel, CNPJ com 14 dígitos e cor #rrggbb', () => {
  const ok = cleanLoja({ nome: '  Auto <b>Center</b> ', cnpj: '12.345.678/0001-90', cor: '#0EA5E9', logo: 'https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-estoque/conta-1/logo.jpg', senha: 'x' });
  assert.equal(ok.nome, 'Auto  b Center /b'.replace(/\s+/g, ' '));
  assert.equal(ok.cor, '#0ea5e9'); assert.equal(ok.senha, undefined);
  assert.throws(() => cleanLoja({ logo: 'https://outro.site/logo.jpg' }));
  assert.throws(() => cleanLoja({ cnpj: '123' }));
  assert.equal(cleanLoja({ cor: 'red' }).cor, '');
});
