// Gera app-ia/n8n/cobranca-avisos.json (node cobranca-avisos.mjs cobranca-avisos.json): o fluxo "COBRANÇA · Avisos e resgate"
// do n8n novo. A cada 30 min pede ao banco os avisos do momento (iag_saas_avisos_pendentes: fim do teste, resgate de quem não pagou,
// fatura, vencimento, atraso, pagamento confirmado, suspensão) e manda pelo WhatsApp da LeadVox. O texto fica aqui; os prazos, no banco.
import { writeFileSync } from 'node:fs';

const SUPA = 'https://dcucemuewipfnneqpgxk.supabase.co';
const CRED_SUPA = { supabaseApi: { id: 'kSv5bMKquqHLDxI9', name: 'Supabase Agentes LeadVox' } };
const CONTA_ENVIO = 'leadvox-ia-420245d9'; // WhatsApp da LeadVox que manda os avisos (o mesmo dos alertas de erro)

export const enviarCode = String.raw`// Monta e manda cada aviso pelo WhatsApp da LeadVox e devolve o resultado para o banco.
// Sem WhatsApp cadastrado fica "sem contato" (o aviso do topo do painel continua valendo).
const url = String((($('Rota de envio').first().json || {}).conexao || {}).urlEnvio || '');
const brl = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const T = {
  'teste-3': a => 'Oi! Aqui é a LeadVox 👋 Faltam 3 dias do teste grátis da IA na ' + a.nome + '. Para ela continuar atendendo sem parar, é só assinar: ' + a.link,
  'teste-1': a => 'Oi! Falta 1 dia do teste grátis da IA na ' + a.nome + '. Assine para ela seguir atendendo seus clientes: ' + a.link,
  'teste-0': a => 'O teste grátis da IA na ' + a.nome + ' termina hoje. Para ela continuar atendendo, assine aqui: ' + a.link,
  'teste-acabou': a => 'O teste grátis da IA na ' + a.nome + ' terminou ontem. Ela atende até amanhã e depois fica pausada até a assinatura. Assine aqui: ' + a.link,
  'teste-pausada': a => 'A IA da ' + a.nome + ' foi pausada porque o teste terminou. Assim que você assinar, ela volta a atender sozinha: ' + a.link,
  'carrinho-1h': a => 'Vi que você começou a assinatura da LeadVox IA para a ' + a.nome + ', mas o pagamento ainda não foi concluído. Para terminar, é só abrir: ' + a.link,
  'carrinho-1d': a => 'Passando para lembrar: a assinatura da LeadVox IA da ' + a.nome + ' está esperando o pagamento. Leva menos de 2 minutos: ' + a.link,
  'carrinho-3d': a => 'Última lembrança 🙂 A assinatura da ' + a.nome + ' ainda está aberta. Ficou com alguma dúvida? É só responder esta mensagem. Para pagar: ' + a.link,
  fatura: a => 'Sua fatura da LeadVox IA (' + brl(a.valorCents) + ') já está disponível, com vencimento em ' + a.vencimento + ': ' + a.link,
  'vence-amanha': a => 'Lembrete: a fatura da LeadVox IA da ' + a.nome + ' (' + brl(a.valorCents) + ') vence amanhã, ' + a.vencimento + '. Para pagar: ' + a.link,
  pago: a => 'Pagamento confirmado ✅ Obrigado! A assinatura da LeadVox IA da ' + a.nome + ' está ativa.',
  'atraso-1': a => 'A fatura da LeadVox IA da ' + a.nome + ' venceu ontem. Para a IA não ser pausada, pague por aqui: ' + a.link,
  'atraso-3': a => 'A fatura da ' + a.nome + ' está 3 dias atrasada. Daqui a 2 dias a IA é pausada. Para pagar: ' + a.link,
  suspensa: a => 'A IA da ' + a.nome + ' foi pausada por falta de pagamento. Assim que o pagamento cair, ela volta a atender sozinha: ' + a.link,
  lembrete: a => 'Oi! Segue o link da assinatura da LeadVox IA da ' + a.nome + ': ' + a.link
};
const lista = $input.all().map(i => i.json).flatMap(j => Array.isArray(j) ? j : (j && j.id ? [j] : []));
const out = [];
for (const a of lista) {
  let tel = String(a.telefone || '').replace(/\D/g, ''); if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
  if (!url) { out.push({ json: { p_id: a.id, p_status: 'falhou', p_erro: 'sem rota de envio da LeadVox' } }); continue; }
  if (!/^55\d{10,11}$/.test(tel)) { out.push({ json: { p_id: a.id, p_status: 'sem_contato', p_erro: 'sem WhatsApp' } }); continue; }
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url, json: true, timeout: 20000, returnFullResponse: true, ignoreHttpStatusErrors: true,
      body: { number: tel, body: (T[a.tipo] || T.lembrete)(a), externalKey: 'iag-cobranca-' + a.id } });
    const s = Number(r.statusCode) || 0;
    out.push({ json: { p_id: a.id, p_status: s >= 200 && s < 300 ? 'enviado' : 'falhou', p_erro: s >= 200 && s < 300 ? '' : 'LeadVox respondeu ' + s } });
  } catch (e) { out.push({ json: { p_id: a.id, p_status: 'falhou', p_erro: String(e.message || e).slice(0, 200) } }); }
  await new Promise(r => setTimeout(r, 1000)); // sem rajada no WhatsApp
}
return out;`;

const rpc = (name, pos, fn, body, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: { method: 'POST', url: SUPA + '/rest/v1/rpc/' + fn, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 30000, response: { response: { neverError: true } } } },
  credentials: CRED_SUPA, onError: 'continueRegularOutput', ...extra });

const nodes = [
  { name: 'A cada 30 minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } },
  rpc('Rota de envio', [220, 200], 'iag_motor_rota', JSON.stringify({ p_conta: CONTA_ENVIO, p_departamento: null }), { executeOnce: true }),
  rpc('Avisos pendentes', [440, 200], 'iag_saas_avisos_pendentes', '{}', { executeOnce: true }),
  { name: 'Enviar avisos', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 200], parameters: { jsCode: enviarCode } },
  rpc('Gravar resultado', [880, 200], 'iag_saas_aviso_resultado', '={{ JSON.stringify($json) }}')
];
const L = n => ({ node: n, type: 'main', index: 0 });
const connections = { 'A cada 30 minutos': { main: [[L('Rota de envio')]] }, 'Rota de envio': { main: [[L('Avisos pendentes')]] },
  'Avisos pendentes': { main: [[L('Enviar avisos')]] }, 'Enviar avisos': { main: [[L('Gravar resultado')]] } };
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify({ name: 'COBRANÇA · Avisos e resgate (WhatsApp)', nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all' } }, null, 1) + '\n');
  console.log('ok', nodes.length, 'nós');
}
