// Modelos prontos das Regras da IA: as situações já escritas, por função do agente e ramo da empresa.
// O dono só escolhe, nas listas da LeadVox dele, a etiqueta, a etapa, a origem e o departamento de cada linha.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const limpo = t => String(t || '').replace(/[\[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();

const RAMOS = {
  automotivo: { agendar: 'quiser agendar uma visita ou um test drive', fechar: 'quiser fechar a compra ou financiar o veículo' },
  imoveis: { agendar: 'quiser agendar uma visita ao imóvel', fechar: 'quiser fazer uma proposta ou fechar o imóvel' },
  saude: { agendar: 'quiser marcar uma consulta', fechar: 'quiser fechar o tratamento ou o pacote' },
  advocacia: { agendar: 'quiser agendar o atendimento com o advogado', fechar: 'quiser contratar o escritório' },
  educacao: { agendar: 'quiser marcar uma aula experimental ou uma visita', fechar: 'quiser fazer a matrícula' },
  varejo: { agendar: 'quiser combinar a entrega ou a retirada', fechar: 'quiser fechar o pedido' },
  viagens: { agendar: 'quiser marcar uma conversa com o consultor', fechar: 'quiser fechar o pacote' },
  outro: { agendar: 'quiser marcar um horário ou uma visita', fechar: 'quiser fechar a compra ou pedir um orçamento' }
};

// Palavras em ordem de prioridade: a primeira que aparecer no nome de um item da LeadVox já vem marcada.
const INTERESSE = ['interessado', 'quente', 'qualificado'];
const ETAPA_INTERESSE = ['qualificado', 'qualificacao', 'em atendimento', 'negociacao', 'proposta'];
const AGENDA = ['agendad', 'agendamento'];
const ETAPA_AGENDA = [...AGENDA, 'visita', 'consulta'];
const FECHAR = ['fechamento', 'quente', 'comprador', 'negociacao'];
const ETAPA_FECHAR = ['fechamento', 'negociacao', 'proposta'];
const SEM_INTERESSE = ['sem interesse', 'desinteress', 'perdido', 'frio', 'descart'];
const VENDAS = ['comercial', 'vendas', 'pre-venda', 'pre venda'];
const SUPORTE = ['suporte', 'pos-venda', 'pos venda', 'atendimento'];
const FINANCEIRO = ['financeiro', 'cobranca'];

const et = (...sugere) => ({ cod: 'ETIQUETA', sugere });
const ep = (...sugere) => ({ cod: 'ETAPA', sugere });
const dp = (...sugere) => ({ cod: 'DEPARTAMENTO', sugere });
const nt = texto => ({ cod: 'NOTA', texto });

const pessoa = sugere => ({ quando: 'Quando o cliente pedir para falar com uma pessoa', acoes: [dp(...sugere), nt('resumo do que o cliente quer')] });
const financeiro = { quando: 'Quando o assunto for pagamento, boleto ou nota fiscal', acoes: [et(...FINANCEIRO), dp(...FINANCEIRO), nt('o que o cliente precisa no financeiro')] };

const POR_TIPO = {
  sdr: r => [
    { quando: 'Quando o cliente pedir preço, valor ou condição', acoes: [et(...INTERESSE), ep(...ETAPA_INTERESSE)] },
    { quando: 'Quando o cliente ' + r.agendar, acoes: [et(...AGENDA), ep(...ETAPA_AGENDA), nt('o que o cliente quer e o dia combinado')] },
    { quando: 'Quando o cliente ' + r.fechar, acoes: [et(...FECHAR), ep(...ETAPA_FECHAR), dp(...VENDAS), nt('resumo do que o cliente quer fechar')] },
    { quando: 'Quando o cliente disser que não tem interesse ou que já resolveu', acoes: [et(...SEM_INTERESSE), ep(...SEM_INTERESSE)] },
    pessoa(VENDAS)
  ],
  recepcao: r => [
    { quando: 'Quando o cliente quiser comprar ou pedir preço', acoes: [et(...INTERESSE), dp(...VENDAS)] },
    { quando: 'Quando o cliente ' + r.agendar, acoes: [et(...AGENDA), dp(...VENDAS), nt('o que o cliente quer e o dia combinado')] },
    { quando: 'Quando o cliente já for cliente e tiver uma dúvida ou um problema', acoes: [et('suporte'), dp(...SUPORTE)] },
    financeiro,
    pessoa(['atendimento', ...VENDAS])
  ],
  suporte: () => [
    { quando: 'Quando o cliente relatar um problema', acoes: [et('suporte', 'problema', 'chamado'), nt('qual é o problema do cliente')] },
    { quando: 'Quando o problema do cliente for resolvido', acoes: [et('resolvido', 'concluido'), { cod: 'TIRAR_ETIQUETA', sugere: ['problema', 'chamado', 'suporte'] }] },
    { quando: 'Quando o cliente reclamar muito ou pedir o gerente', acoes: [et('urgente', 'reclamacao', 'critico'), dp('gerencia', ...SUPORTE), nt('o motivo da reclamação')] },
    { quando: 'Quando o cliente quiser comprar algo novo', acoes: [et(...INTERESSE), dp(...VENDAS)] },
    financeiro,
    pessoa(SUPORTE)
  ],
  catalogo: r => [
    { quando: 'Quando o cliente pedir preço ou perguntar por um produto', acoes: [et(...INTERESSE), ep(...ETAPA_INTERESSE)] },
    { quando: 'Quando o cliente ' + r.fechar, acoes: [et('pedido', ...FECHAR), ep('pedido', ...ETAPA_FECHAR), dp(...VENDAS), nt('os itens do pedido')] },
    { quando: 'Quando o cliente disser que não tem interesse ou que já resolveu', acoes: [et(...SEM_INTERESSE), ep(...SEM_INTERESSE)] },
    pessoa(VENDAS)
  ],
  agendamento: r => [
    { quando: 'Quando o cliente ' + r.agendar, acoes: [et(...AGENDA), ep(...ETAPA_AGENDA), nt('o dia e o horário combinados')] },
    { quando: 'Quando o cliente quiser cancelar ou remarcar', acoes: [et('cancel', 'remarc'), nt('o que o cliente pediu')] },
    financeiro,
    pessoa(['atendimento', ...VENDAS])
  ]
};
POR_TIPO.agenda = POR_TIPO.agendamento;

// O item da lista que combina com as palavras do modelo (a mais prioritária primeiro); vazio se nenhum combina.
// Etapa de quem tem vários funis vem como "Funil › Etapa": só o nome da etapa conta.
export function sugerirItem(nomes, palavras) {
  for (const p of palavras || []) {
    const achou = (nomes || []).find(n => norm(String(n).split('›').pop()).includes(norm(p)));
    if (achou) return achou;
  }
  return '';
}

// As linhas do modelo: uma cópia nova a cada chamada, com uma linha por origem que existe na LeadVox do cliente.
export function modeloRegras(tipo, nicho, origens = []) {
  const linhas = (POR_TIPO[tipo] || POR_TIPO.sdr)(RAMOS[nicho] || RAMOS.outro).map(l => ({ quando: l.quando, acoes: l.acoes.map(a => ({ ...a })) }));
  for (const o of origens.map(limpo).filter(Boolean).slice(0, 12)) {
    linhas.push({ quando: 'Quando o cliente indicar que veio de ' + o, acoes: [{ cod: 'ORIGEM', sugere: [o], valor: o }] });
  }
  return linhas;
}

// Uma linha pronta para o motor: a situação e as ações escolhidas. Sem nenhuma ação, a linha não entra.
export function montarRegra(quando, acoes) {
  const marcas = (acoes || []).map(a => ({ cod: a.cod, valor: limpo(a.valor) })).filter(a => a.valor).map(a => '[' + a.cod + ':' + a.valor + ']');
  const situacao = limpo(quando).replace(/[:\s]+$/, '');
  return situacao && marcas.length ? situacao + ': ' + marcas.join(' ') : '';
}

// Junta com o que já estava escrito: nada é apagado e a linha igual não entra duas vezes.
export function juntarRegras(atual, novas) {
  const texto = String(atual || '').trim(), vistas = new Set(texto.split('\n').map(norm));
  const entram = [];
  for (const l of novas) { if (l && !vistas.has(norm(l))) { vistas.add(norm(l)); entram.push(l); } }
  return [texto, ...entram].filter(Boolean).join('\n');
}
