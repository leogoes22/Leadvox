import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarConvitePdf } from '../integrations/convite-pdf.mjs';

// JPEG mínimo de verdade (1x1, cinza) para testar a foto e a logo sem baixar nada
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z', 'base64'));
const latin = (u) => Buffer.from(u).toString('latin1');
const base = {
  loja: { nome: 'Auto Center Ação', cnpj: '12.345.678/0001-90', whatsapp: '(21) 98108-1044', endereco: 'Av. das Américas, 1000', cor: '#0ea5e9' },
  veiculo: { tipo: 'carro', titulo: 'TOYOTA COROLLA 1.8 AUTOMÁTICO', ano: '2018/2019', km: 148774, cor: 'Prata', preco: 90900, opcionais: ['Câmera de ré'] },
  cliente: { nome: 'João Silva' }, vendedor: { nome: 'Leonardo' },
  condicoes: { forma: 'financiado', entrada: 30000, parcelas: 48, valorParcela: 1890.5, troca: { modelo: 'Onix', ano: '2019', valor: 45000 }, extras: ['Documentação inclusa'] },
  validade: '03/11/2026', numero: '2026-0042'
};

test('convite em PDF: arquivo válido, com o índice (xref) apontando para cada objeto', () => {
  const pdf = gerarConvitePdf({ ...base, foto: JPEG, logo: JPEG });
  const s = latin(pdf);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const inicio = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(inicio).startsWith('xref'));
  const linhas = s.slice(inicio).split('\n').slice(3).filter((l) => / n $/.test(l));
  linhas.forEach((l, i) => assert.ok(s.slice(Number(l.slice(0, 10))).startsWith((i + 1) + ' 0 obj'), 'objeto ' + (i + 1)));
});

test('convite em PDF: foto e logo entram como JPEG; mesma imagem não é gravada duas vezes', () => {
  const s = latin(gerarConvitePdf({ ...base, foto: JPEG, logo: JPEG }));
  assert.equal((s.match(/\/Filter \/DCTDecode/g) || []).length, 1);
  assert.match(s, /\/Im1 Do/);
  const sem = latin(gerarConvitePdf({ ...base, foto: null, logo: Uint8Array.from([1, 2, 3]) }));
  assert.doesNotMatch(sem, /DCTDecode/);
});

test('convite em PDF: acentos em WinAnsi, emoji some, texto do test ride para moto', () => {
  const s = latin(gerarConvitePdf({ ...base, veiculo: { ...base.veiculo, tipo: 'moto', titulo: 'Honda CB 500 🏍️' } }));
  assert.match(s, /\/Encoding \/WinAnsiEncoding/);
  assert.match(s, /A\\347\\343o/); // "Ação"
  assert.match(s, /TEST RIDE/);
  assert.doesNotMatch(s, /\uD83C/);
  assert.match(s, /48x de R\$\\240\d\.890,50/); // espaço que não quebra e centavos
});

test('convite em PDF: conteúdo longo passa para a página seguinte, com o rodapé em todas', () => {
  const longo = { ...base, veiculo: { ...base.veiculo, opcionais: Array.from({ length: 30 }, (_, i) => 'Opcional número ' + i) },
    condicoes: { ...base.condicoes, extras: Array.from({ length: 12 }, (_, i) => 'Extra ' + i), obs: 'Observação '.repeat(80) } };
  const s = latin(gerarConvitePdf({ ...longo, foto: JPEG }));
  const n = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(n >= 2);
  assert.equal((s.match(/v\\341lida at\\351 03\/11\/2026/g) || []).length, n);
});
