// Motor IA (Atendimento V0.9) — fase 3 do vendedor no WhatsApp (10/11/2026): o vendedor responde ao aviso e o card fecha.
// O vendedor escreve no WhatsApp da IA "vendido" ou "perdido" (com mais de um cliente: "vendido 4521", final do telefone).
// • Avisos Preparar: ao avisar o vendedor, guarda o cliente (último e pelo final do telefone) no Redis por 30 dias
//   e põe no aviso a dica de como responder.
// • Agente: mensagem curta de número de vendedor com essas palavras vira comando (o resto continua ignorado).
// • Nós novos VEND *: acham o cliente, o card aberto, mandam para Ganho/Perdido e confirmam ao vendedor.
const TROCAS3 = {
 'Agente': [
  ["  if (__vds.includes(__u8(d.tel)) && !__teste) return [];",
   "  if (__vds.includes(__u8(d.tel)) && !__teste) {\n" +
   "    // vendedor respondendo ao aviso: \"vendido\" ou \"perdido\" (com o final do telefone do cliente, se tiver mais de um)\n" +
   "    const __tx = String(d.chatInput || '').trim();\n" +
   "    const __m = __tx.length <= 80 ? __tx.match(/^\\s*(vendid[oa]|vendi|vendemos|ganho|ganhamos|fechad[oa]|fechou|fechei|fechamos|perdid[oa]|perdi|perdemos|desistiu)\\b/i) : null;\n" +
   "    if (!__m || !/^https:\\/\\/\\S+[?&]token=/.test(urlEnvio)) return [];\n" +
   "    const __dg = __tx.replace(/\\D/g, '');\n" +
   "    return [{ json: { vendCmd: true, conta: d.conta, vendTel: String(d.tel || '').replace(/\\D/g, ''), vend8: __u8(d.tel), status: /^(perd|desist)/i.test(__m[1]) ? 'lost' : 'won', fim4: __dg.length >= 4 ? __dg.slice(-4) : '', urlEnvio } }];\n" +
   "  }"]
 ],
 'Avisos Preparar': [
  ["      f.transf.iaContinua ? '_A IA continua no WhatsApp da loja e te avisa se o cliente mandar algo por lá._' : '_O atendimento está com você na LeadVox._'\n",
   "      f.transf.iaContinua ? '_A IA continua no WhatsApp da loja e te avisa se o cliente mandar algo por lá._' : '_O atendimento está com você na LeadVox._',\n" +
   "      '_Fechou? Responda aqui *vendido* ou *perdido* (com mais de um cliente, junte o final do telefone: vendido ' + __zapCli.slice(-4) + ')._'\n"],
  ["    out.push({ json: { tipo: 'set', key: 'iag_humano_' + f.conta + ':' + norm(zv), valor: 'aviso', ttl: 30 * 86400 } });\n  }\n}",
   "    out.push({ json: { tipo: 'set', key: 'iag_humano_' + f.conta + ':' + norm(zv), valor: 'aviso', ttl: 30 * 86400 } });\n" +
   "    // para o vendedor responder \"vendido\"/\"perdido\": o último cliente dele e o cliente pelo final do telefone\n" +
   "    let __cid = null; try { __cid = Number($('Entrada').first().json.contactId) || null; } catch (e) {}\n" +
   "    const __cli = JSON.stringify({ tel: __zapCli, nome: est.nome || '', contactId: __cid, ts: Date.now() }), __v8 = String(zv).replace(/\\D/g, '').slice(-8);\n" +
   "    out.push({ json: { tipo: 'set', key: 'iag_vend_' + f.conta + ':' + __v8, valor: __cli, ttl: 30 * 86400 } });\n" +
   "    out.push({ json: { tipo: 'set', key: 'iag_vend_' + f.conta + ':' + __v8 + ':' + __zapCli.slice(-4), valor: __cli, ttl: 30 * 86400 } });\n" +
   "  }\n}"]
 ]
};
const VEND_PREPARAR = `// Vendedor respondeu ao aviso ("vendido"/"perdido"): de qual cliente é e para onde mandar
const v = $input.first().json;
const m = String(v.urlEnvio || '').match(/^(https:\\/\\/[^?#]+)\\/api\\/external\\/([^/?#]+)\\/?\\?(?:.*&)?token=([^&#]+)/);
if (!m) return [];
return [{ json: { ...v, base: m[1] + '/api/external/' + m[2], raiz: m[1].replace(/\\/v\\d+$/, ''), token: decodeURIComponent(m[3]),
  chave: 'iag_vend_' + v.conta + ':' + v.vend8 + (v.fim4 ? ':' + v.fim4 : '') } }];`;
const VEND_CLIENTE = `// cliente guardado quando o vendedor foi avisado (o Redis Get devolve só o valor lido)
const p = $('VEND Preparar').first().json;
let cli = null; try { const r = $input.first().json.cli; cli = typeof r === 'string' ? JSON.parse(r) : r; } catch (e) {}
return [{ json: { ...p, cli: cli && cli.contactId ? cli : null } }];`;
const VEND_MONTAR = `// card aberto do cliente → Ganho/Perdido (rota da tela, aceita o token da conexão) e a confirmação para o vendedor
const p = $('VEND Cliente').first().json;
let rO = {}; try { rO = $input.first().json || {}; } catch (e) {}
const b = rO.body || {}; const lista = Array.isArray(b.data) ? b.data : (Array.isArray(b) ? b : []);
const aberta = p.cli ? lista.find(o => !o.status || o.status === 'open') : null;
const fmt = (t) => { let d = String(t || '').replace(/\\D/g, ''); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); return d.length >= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, -4) + '-' + d.slice(-4) : d; };
const quem = p.cli ? (p.cli.nome || 'cliente') + ' · ' + fmt(p.cli.tel) : '';
const reqs = [];
let msg;
if (!p.cli) msg = 'Não achei ' + (p.fim4 ? 'o cliente com final ' + p.fim4 : 'o último cliente que te passei') + '. Responda com o final do telefone dele, ex.: vendido 4521.';
else if (!aberta) msg = 'O cliente ' + quem + ' não tem card aberto no funil. Se precisar, ajuste direto na LeadVox.';
else {
  reqs.push({ method: 'PUT', url: p.raiz + '/opportunity/' + aberta.id + '/status', body: { id: aberta.id, pipelineStepId: Number(aberta.pipelineStepId), status: p.status } });
  msg = (p.status === 'won' ? '✅ Anotado: ' + quem + ' foi para *Ganho*. Parabéns pela venda!' : '📝 Anotado: ' + quem + ' foi para *Perdido*.') + ' Se não era esse cliente, responda com o final do telefone (ex.: vendido 4521).';
}
reqs.push({ method: 'POST', url: p.urlEnvio, body: { number: p.vendTel, body: msg, externalKey: 'iag-vendedor' } });
return reqs.map(x => ({ json: x }));`;
// Nós novos (posição abaixo do Agente) e ligações: Agente → VEND Comando? (sim → VEND Preparar …; não → Classificar Mídia)
