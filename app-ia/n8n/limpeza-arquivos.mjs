// Gera app-ia/n8n/limpeza-arquivos.json (node limpeza-arquivos.mjs limpeza-arquivos.json): o fluxo "LIMPEZA · Arquivos antigos".
// Toda madrugada pede ao banco o que passou de 90 dias (iag_arquivos_antigos: áudios e PDFs, nunca fotos) e apaga pela API de arquivos.
// Também apaga as pastas das contas excluídas no Super Admin (iag_arquivos_excluidos), inclusive as fotos delas.
// Apaga até 1.000 por noite; o que sobrar fica para a noite seguinte. Erro cai no fluxo de alerta do WhatsApp.
import { writeFileSync } from 'node:fs';

const SUPA = 'https://dcucemuewipfnneqpgxk.supabase.co';
const CRED_SUPA = { supabaseApi: { id: 'mj3pFXF83Np7OZ56', name: 'Agentes de IA Leadvox' } };
const ALERTA = 'Ri7JR6VuL7soi4DX';

export const separarCode = String.raw`// Junta os arquivos por pasta: a API de arquivos apaga uma lista por pasta. Pasta fora da lista nunca é apagada.
const PASTAS = ['audios', 'lv-audio', 'lv-propostas'];
const por = {};
for (const i of $input.all()) {
  const { bucket, caminho } = i.json || {};
  if (PASTAS.includes(bucket) && caminho) (por[bucket] = por[bucket] || []).push(caminho);
}
return Object.entries(por).map(([bucket, prefixes]) => ({ json: { bucket, prefixes } }));`;

// Contas excluídas: as fotos entram aqui, mas só o que o banco listou como pasta de conta excluída.
export const separarExcluidosCode = String.raw`const PASTAS = ['lv-estoque', 'lv-audio', 'lv-propostas', 'iag-arquivos', 'lv-materiais'];
const por = {};
for (const i of $input.all()) {
  const { bucket, caminho } = i.json || {};
  if (PASTAS.includes(bucket) && caminho && caminho.includes('/')) (por[bucket] = por[bucket] || []).push(caminho);
}
return Object.entries(por).map(([bucket, prefixes]) => ({ json: { bucket, prefixes } }));`;

const supa = { authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi' };
export const fluxo = {
  name: 'LIMPEZA · Arquivos antigos',
  nodes: [
    { id: 'limpa-1', name: 'Toda madrugada', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 3 * * *' }] } } },
    { id: 'limpa-2', name: 'Listar antigos', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 0], credentials: CRED_SUPA,
      parameters: { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_arquivos_antigos', ...supa, sendBody: true, specifyBody: 'json',
        jsonBody: '{ "dias": 90, "limite": 1000 }', options: { timeout: 30000 } } },
    { id: 'limpa-3', name: 'Separar por pasta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0], parameters: { jsCode: separarCode } },
    { id: 'limpa-4', name: 'Apagar', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 0], credentials: CRED_SUPA,
      parameters: { method: 'DELETE', url: '=' + SUPA + '/storage/v1/object/{{ $json.bucket }}', ...supa, sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ prefixes: $json.prefixes }) }}', options: { timeout: 60000 } } },
    { id: 'limpa-5', name: 'Listar excluídos', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 200], credentials: CRED_SUPA,
      parameters: { method: 'POST', url: SUPA + '/rest/v1/rpc/iag_arquivos_excluidos', ...supa, sendBody: true, specifyBody: 'json',
        jsonBody: '{ "limite": 1000 }', options: { timeout: 30000 } } },
    { id: 'limpa-6', name: 'Separar excluídos', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 200], parameters: { jsCode: separarExcluidosCode } }
  ],
  connections: {
    'Toda madrugada': { main: [[{ node: 'Listar antigos', type: 'main', index: 0 }, { node: 'Listar excluídos', type: 'main', index: 0 }]] },
    'Listar excluídos': { main: [[{ node: 'Separar excluídos', type: 'main', index: 0 }]] },
    'Separar excluídos': { main: [[{ node: 'Apagar', type: 'main', index: 0 }]] },
    'Listar antigos': { main: [[{ node: 'Separar por pasta', type: 'main', index: 0 }]] },
    'Separar por pasta': { main: [[{ node: 'Apagar', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', errorWorkflow: ALERTA }
};

if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(fluxo, null, 1));
