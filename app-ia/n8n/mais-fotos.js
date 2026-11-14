// LeadVox IA — mais fotos do mesmo item quando o cliente pede (14/11/2026).
// Antes: [FOTO:id] mandava só a capa (fotos[0]) e o motor guardava no máximo 3 fotos por item; o cliente pedia
// "manda mais fotos" e recebia a mesma capa (ou nada). Agora:
//  • [FOTO:id] continua sendo a capa, para apresentar o item;
//  • [MAIS_FOTOS:id] manda as próximas fotos do item (até 5 por vez, até 10 por item), sem repetir as que já saíram
//    (estado.fotosEnviadas); pediu de novo → o lote seguinte; acabou → recomeça da primeira;
//  • o prompt mostra quantas fotos cada item tem e quantas este cliente já recebeu, para a IA não prometer o que não há.
// Vale para o Atendimento (dkipBj6hAhdu7OSp) e para o Simulador do painel (oj3sPq5XcM22cgTt).
// Publicado em 14/11/2026. Para voltar atrás, publique no histórico do n8n a versão anterior de cada fluxo:
// Atendimento 21c1d7b5-0bc4-4ca0-8787-ce1ea55b232b · Simulador 23f86b4d-116b-400f-82ef-b2c86f8f94ce.
// Uso no console do n8n: aplicarMaisFotos(fluxo) → cópia trocada (falha se o fluxo mudou ou já foi aplicado).

const LOTE_FOTOS = 5, MAX_FOTOS = 10;

const MAIS_FOTOS = `// LeadVox IA — cliente pediu mais fotos de um item ([MAIS_FOTOS:id]): saem as próximas, sem repetir as já enviadas
const __fe = estado.fotosEnviadas && typeof estado.fotosEnviadas === 'object' && !Array.isArray(estado.fotosEnviadas) ? estado.fotosEnviadas : {};
fotos.forEach(f => { __fe[f.id] = Math.max(Number(__fe[f.id]) || 0, 1); });
if (A.usaCatalogo && tMais.length) {
  const __idM = [...new Set(tMais.join(',').split(/[,;\\s]+/).map(x => x.replace(/\\D/g, '')).filter(Boolean))].find(id => conhecidos[id] && conhecidos[id].fotos.length);
  const __itM = __idM ? conhecidos[__idM] : null;
  if (__itM) {
    let __ini = Number(__fe[__itM.id]) || 0;
    if (__ini >= __itM.fotos.length) __ini = 0; // já recebeu todas: recomeça da primeira
    const __lote = __itM.fotos.slice(__ini, __ini + ${LOTE_FOTOS});
    __lote.forEach((url, n) => fotos.push({ id: __itM.id, url, legenda: n === 0 ? '*' + __itM.nome + '*' : '' }));
    __fe[__itM.id] = __ini + __lote.length;
    novosVistos.push(String(__itM.id));
  }
}
{ const __kf = Object.keys(__fe); __kf.slice(0, Math.max(0, __kf.length - 60)).forEach(k => delete __fe[k]); }
estado.fotosEnviadas = __fe;
`;

// memória: só os 12 itens vistos por último guardam todas as fotos; os mais antigos ficam com 3 (estado pequeno)
const VISTOS_LEVES = `{ const __kv = Object.keys(vistos); __kv.slice(0, Math.max(0, __kv.length - 12)).forEach(k => { if (vistos[k] && Array.isArray(vistos[k].fotos) && vistos[k].fotos.length > 3) vistos[k] = { ...vistos[k], fotos: vistos[k].fotos.slice(0, 3) }; }); }
`;

const REGRA_PROMPT = `'- Se o cliente pedir MAIS fotos de um item ("tem mais fotos?", "manda foto do interior", "quero ver por dentro"), escreva [MAIS_FOTOS:id]: o sistema manda as próximas fotos dele (até ${LOTE_FOTOS} por vez, fora do limite acima). Você não escolhe qual foto sai: nunca prometa uma foto específica (painel, motor), diga só "olha mais fotos dele 👇". Para apresentar um item pela primeira vez use [FOTO:id]; [MAIS_FOTOS:id] é só quando ele pedir mais.',
(() => { try { const __e = (g || {}).estado || {}, __fe = __e.fotosEnviadas || {}, __vi = __e.vistos || {};
  const __l = Object.entries(__fe).slice(-8).map(([id, n]) => { const it = itensCat.find(x => String(x.id) === String(id)) || __vi[id];
    const tot = it && Array.isArray(it.fotos) ? Math.min(it.fotos.length, ${MAX_FOTOS}) : 0; return tot ? '[id ' + id + '] ' + Math.min(Number(n) || 0, tot) + ' de ' + tot : ''; }).filter(Boolean);
  return __l.length ? '- Fotos que este cliente já recebeu: ' + __l.join('; ') + '. Se ele já recebeu todas as de um item, diga que essas são todas as fotos que você tem e convide para ver de perto — não use [MAIS_FOTOS] para esse item.' : ''; } catch (e) { return ''; } })(),`;

const TROCAS_FOTOS = {
  'Ler Resposta': [
    [".test(String(u))).slice(0, 3) : [] }; };", ".test(String(u))).slice(0, " + MAX_FOTOS + ") : [] }; };"],
    ["const tNome = tags('NOME'), tFoto = tags('FOTOS?'), tMat = tags('MATERIAL');",
     "const tMais = tags('MAIS_FOTOS');\nconst tNome = tags('NOME'), tFoto = tags('FOTOS?'), tMat = tags('MATERIAL');"],
    ["const enviados = (Array.isArray(estado.materiaisEnviados) ? estado.materiaisEnviados : []).map(String);",
     MAIS_FOTOS + "const enviados = (Array.isArray(estado.materiaisEnviados) ? estado.materiaisEnviados : []).map(String);"],
    ["estado.vistos = vistos;", VISTOS_LEVES + "estado.vistos = vistos;"]
  ],
  'Montar Prompt': [
    [", nunca para cima.',", ", nunca para cima.',\n" + REGRA_PROMPT],
    ["(lista(i.fotos).length ? '' : ' — sem foto')",
     "(lista(i.fotos).length > 1 ? ' — ' + Math.min(lista(i.fotos).length, " + MAX_FOTOS + ") + ' fotos' : lista(i.fotos).length ? '' : ' — sem foto')"],
    ["(A.usaCatalogo ? ' [FOTO:id]' : '')", "(A.usaCatalogo ? ' [FOTO:id] [MAIS_FOTOS:id]' : '')"]
  ]
};

function aplicarMaisFotos(fluxoOrig) {
  const w = JSON.parse(JSON.stringify(fluxoOrig));
  for (const [nome, trocas] of Object.entries(TROCAS_FOTOS)) {
    const n = w.nodes.find(x => x.name === nome); if (!n) throw new Error('sem o nó ' + nome);
    let code = n.parameters.jsCode;
    if (code.includes('MAIS_FOTOS')) throw new Error('já aplicado em ' + nome);
    for (const [de, para] of trocas) {
      if (code.split(de).length !== 2) throw new Error(nome + ': trecho mudou → ' + de.slice(0, 60));
      code = code.replace(de, () => para);
    }
    n.parameters.jsCode = code;
  }
  return w;
}
if (typeof module !== 'undefined') module.exports = { aplicarMaisFotos, MAIS_FOTOS, VISTOS_LEVES, REGRA_PROMPT, TROCAS_FOTOS, LOTE_FOTOS, MAX_FOTOS };
