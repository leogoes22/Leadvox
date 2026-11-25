// Ponte nova LeadVox (Z-PRO) ↔ Motor IA — 25/11/2026.
// O Motor foi feito para o CRM antigo (ChatFlow que chama o webhook e API de envio que também muda fila e vendedor).
// A nova LeadVox manda outro aviso e tem outras chamadas. Esta ponte fica no meio e traduz, sem mexer no Motor:
//   ENTRADA  nova LeadVox (canal → "URL do N8N", aviso `message_n8n`)  →  formato ChatFlow que o Motor já lê
//   SAÍDA    corpo de envio do Motor (number/body/mediaUrl/queueId/userId/onlyNote)  →  chamadas da API externa v2
// Tudo aqui são funções puras: o fluxo do n8n só junta os pedaços (Code → HTTP) e os testes rodam sem rede.
// Formatos conferidos com avisos reais da Loja Teste em 25/11/2026 (ver memória nova-leadvox-api-motor).

const s = (v) => String(v ?? '').trim();
const digitos = (v) => s(v).replace(/\D/g, '');
const inteiro = (v) => { const n = parseInt(digitos(v), 10); return Number.isFinite(n) && n > 0 ? n : null; };

// tipo do arquivo pelo começo do base64 (o aviso não traz o mime): vale para áudio de voz, foto e PDF do WhatsApp
function extensaoPorConteudo(base64, tipo) {
  const b = s(base64).slice(0, 12);
  if (b.startsWith('T2dnU')) return 'ogg';            // "OggS": nota de voz (opus)
  if (b.startsWith('/9j/')) return 'jpg';
  if (b.startsWith('iVBOR')) return 'png';
  if (b.startsWith('JVBER')) return 'pdf';
  if (b.startsWith('UklGR')) return tipo === 'imageMessage' ? 'webp' : 'wav';
  if (b.startsWith('SUQz') || b.startsWith('//uQ') || b.startsWith('//sw') || b.startsWith('//tA')) return 'mp3';
  if (b.startsWith('UEsDB')) return 'zip';
  if (/^[A-Za-z0-9+/]{4}ZnR5c/.test(b) || b.slice(4, 9) === 'ZnR5c') return tipo === 'audioMessage' ? 'm4a' : 'mp4';
  return { audioMessage: 'ogg', imageMessage: 'jpg', videoMessage: 'mp4', documentMessage: 'pdf' }[tipo] || 'bin';
}

const TIPOS_TEXTO = ['conversation', 'extendedTextMessage'];
const TIPOS_MIDIA = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage'];

// ENTRADA — body: o que a nova LeadVox manda para a "URL do N8N" do canal.
// opcoes.mediaBase: endereço público onde a ponte serve o arquivo (…/webhook/nl-midia/); opcoes.novoId: id curto da mídia.
// Devolve { ignorar: motivo } ou { motor, midia, ticket }.
function entrada(body, opcoes = {}) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.type !== 'message_n8n') return { ignorar: b.method === 'message' ? 'duplicado' : 'outro_evento' };
  const c = b.content || {}, t = b.ticket || {}, ct = b.contact || {};
  if (t.fromMe === true || t.fromMe === 'true') return { ignorar: 'mensagem_da_equipe' };
  if (t.isGroup === true || t.isGroup === 'true') return { ignorar: 'grupo' };
  const tel = digitos(ct.number);
  if (tel.length < 10) return { ignorar: 'sem_telefone' };
  const tipo = s(c.type);
  let chatInput = '', midia = null;
  if (TIPOS_MIDIA.includes(tipo)) {
    const base64 = s(c.media);
    if (!base64 || base64 === 'false') return { ignorar: 'midia_sem_arquivo' };
    const ext = extensaoPorConteudo(base64, tipo);
    const id = s(opcoes.novoId) || Math.random().toString(36).slice(2, 12);
    midia = { id, ext, tipo, base64 };
    chatInput = s(opcoes.mediaBase) + id + '.' + ext;
  } else if (TIPOS_TEXTO.includes(tipo) || !tipo) {
    chatInput = s(c.text).slice(0, 4000);
  } else {
    return { ignorar: 'tipo_nao_tratado' };
  }
  if (!chatInput) return { ignorar: 'vazio' };
  const motor = {
    chatInput, sessionId: tel,
    Departamento: inteiro(t.queueId) || '',
    ticketId: s(t.id), nomeContato: s(ct.name).slice(0, 40),
    Id_usuario: s(t.userId),
  };
  return { motor, midia, ticket: { id: s(t.id), queueId: inteiro(t.queueId), userId: inteiro(t.userId), contactId: inteiro(ct.id), tel } };
}

// SAÍDA — corpo: o que o Motor mandaria para o CRM antigo. ctx: { ticketId } (a ponte guarda o ticket do cliente na entrada).
// Devolve a lista de chamadas à API externa v2 ({metodo, rota, corpo}); rota é relativa a /v2/api/external/{apiId}.
function saida(corpo, ctx = {}) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const numero = s(c.number);
  if (!numero) return { erro: 'sem_numero', chamadas: [] };
  const ticketId = inteiro(ctx.ticketId);
  const chamadas = [];
  // nota interna do Motor ({onlyNote:true, note:{body}}) → nota de verdade no ticket
  if (c.onlyNote) {
    const texto = s(c.note && c.note.body);
    if (!texto) return { erro: 'nota_vazia', chamadas: [] };
    if (!ticketId) return { erro: 'sem_ticket', chamadas: [] };
    return { chamadas: [{ metodo: 'POST', rota: '/createNotes', corpo: { notes: texto, ticketId } }] };
  }
  const chave = s(c.externalKey);
  if (/@g\.us$/i.test(numero)) {                       // aviso no grupo do WhatsApp
    chamadas.push({ metodo: 'POST', rota: c.mediaUrl ? '/groupMediaUrl' : '/group',
      corpo: { number: numero, body: s(c.body), ...(c.mediaUrl ? { mediaUrl: s(c.mediaUrl) } : {}), ...(chave ? { externalKey: chave } : {}) } });
    return { chamadas };
  }
  const base = { number: numero, body: s(c.body), ...(chave ? { externalKey: chave } : {}), validateNumber: false };
  chamadas.push(c.mediaUrl
    ? { metodo: 'POST', rota: '/url', corpo: { ...base, mediaUrl: s(c.mediaUrl) } }
    : { metodo: 'POST', rota: '/', corpo: base });
  // a transferência: no CRM antigo ia junto da mensagem; aqui é uma chamada à parte, depois do envio
  const filaId = inteiro(c.queueId), userId = inteiro(c.userId);
  if ((filaId && c.forceTicketToDepartment) || (userId && c.forceTicketToUser)) {
    if (!ticketId) return { erro: 'sem_ticket', chamadas };
    chamadas.push({ metodo: 'POST', rota: '/updateticketinfo', transfere: true,
      corpo: { ticketId, ...(filaId && c.forceTicketToDepartment ? { queueId: filaId } : {}), ...(userId && c.forceTicketToUser ? { userId } : {}), n8nStatus: 'disabled' } });
  }
  return { chamadas };
}

module.exports = { entrada, saida, extensaoPorConteudo };
