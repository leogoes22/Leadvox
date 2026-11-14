import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,join,normalize,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// A imagem de produção copia só alguns arquivos. Todo arquivo que o servidor importa (seguindo os imports locais)
// precisa estar no Dockerfile; senão o servidor não sobe e o Coolify segura a versão anterior (13/11: assistente-ia.mjs).
const raiz=dirname(dirname(fileURLToPath(import.meta.url)));
test('Dockerfile: a imagem de produção leva todo arquivo que o servidor importa', () => {
 const docker=readFileSync(join(raiz,'Dockerfile'),'utf8').split('FROM node:24-alpine').pop();
 const copiados=[...docker.matchAll(/^COPY --chown=\S+ (.+) \S+$/gm)].flatMap(m=>m[1].split(/\s+/)).map(x=>normalize(x));
 const vistos=new Set(),fila=['server.mjs'];
 while(fila.length){
  const f=fila.pop();if(vistos.has(f))continue;vistos.add(f);
  const src=readFileSync(join(raiz,f),'utf8');
  for(const m of src.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){
   const alvo=normalize(relative(raiz,join(raiz,dirname(f),m[1])));
   if(existsSync(join(raiz,alvo)))fila.push(alvo);
  }
 }
 const faltam=[...vistos].filter(f=>!copiados.some(c=>f===c||f.startsWith(c.replace(/[\\/]$/,'')+(f.includes('\\')?'\\':'/'))));
 assert.deepEqual(faltam,[]);
});
