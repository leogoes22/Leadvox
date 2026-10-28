import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarPropostaPdf } from '../integrations/proposta-pdf.mjs';

const latin = (u) => Buffer.from(u).toString('latin1');
const base = {
  loja: { nome: 'GranRio', cnpj: '12.345.678/0001-90', whatsapp: '(21) 98108-1044', cor: '#c62828' },
  numero: '261028-A1B2', emissao: '28/10/2026', validade: '04/11/2026', tipo: 'produtos',
  cliente: { nome: 'Mercado Bom Preço' }, vendedor: { nome: 'Leonardo' },
  itens: [{ nome: 'Vassoura 40 cm', qtd: 120, unidade: 'un.', preco: 12.9 }, { nome: 'Rodo 60 cm', qtd: 48, unidade: 'un.', preco: 18.5 }],
  desconto: { tipo: 'pct', valor: 5 }, frete: { tipo: 'cobrado', valor: 85 }, pagamento: 'PIX', entrega: '5 dias úteis'
};

test('proposta em PDF: índice válido e as contas certas (subtotal, desconto em %, frete e total)', () => {
  const s = latin(gerarPropostaPdf(base));
  const inicio = Number(/startxref\n(\d+)/.exec(s)[1]);
  s.slice(inicio).split('\n').filter((l) => / n $/.test(l)).forEach((l, i) => assert.ok(s.slice(Number(l.slice(0, 10))).startsWith((i + 1) + ' 0 obj')));
  // 120 x 12,90 + 48 x 18,50 = 2.436,00; 5% = 121,80; + 85 de frete = 2.399,20
  for (const v of ['\\(R\\$ 2\\.436,00\\)', '\\(- R\\$ 121,80\\)', '\\(R\\$ 85,00\\)', '\\(R\\$ 2\\.399,20\\)']) assert.match(s, new RegExp(v), v);
  assert.match(s, /PROPOSTA COMERCIAL/);
});

test('proposta em PDF: desconto em R$ não passa do subtotal; item sem quantidade ou sem nome fica fora', () => {
  const s = latin(gerarPropostaPdf({ ...base, desconto: { tipo: 'rs', valor: 99999 }, frete: { tipo: 'cif' },
    itens: [...base.itens, { nome: '', qtd: 3, preco: 1 }, { nome: 'Pá', qtd: 0, preco: 9 }] }));
  assert.match(s, /\(Total\) Tj ET\n[^\n]*\(R\$ 0,00\)/);
  assert.doesNotMatch(s, /\(P\\341\)/);
  assert.match(s, /Gr\\341tis/);
});

test('orçamento de serviços: título próprio e sem frete', () => {
  const s = latin(gerarPropostaPdf({ ...base, tipo: 'servicos', itens: [{ nome: 'Consulta', qtd: 1, unidade: 'consulta', preco: 250 }] }));
  assert.match(s, /OR\\307AMENTO/);
  assert.match(s, /Prazo de execu\\347\\343o/);
  assert.doesNotMatch(s, /\(Frete\)/);
});

test('muitos itens: a tabela continua nas páginas seguintes, com o cabeçalho da loja e o rodapé em cada uma', () => {
  const itens = Array.from({ length: 70 }, (_, i) => ({ nome: 'Produto número ' + i, qtd: i + 1, unidade: 'un.', preco: 2.5 }));
  const s = latin(gerarPropostaPdf({ ...base, itens }));
  const n = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(n >= 2);
  assert.equal((s.match(/\(GranRio\) Tj/g) || []).length, n);
  assert.equal((s.match(/\(Produto\) Tj/g) || []).length, n);
});
