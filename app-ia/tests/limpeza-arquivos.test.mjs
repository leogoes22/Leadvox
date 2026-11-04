import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fluxo,separarCode} from '../n8n/limpeza-arquivos.mjs';
const roda=linhas=>new Function('$input','return (()=>{'+separarCode+'})()')({all:()=>linhas.map(json=>({json}))});
const sql=readFileSync(new URL('../database/limpeza_arquivos.sql',import.meta.url),'utf8');

test('files are grouped by bucket for the storage API',()=>{
 assert.deepEqual(roda([{bucket:'audios',caminho:'a.ogg'},{bucket:'lv-propostas',caminho:'p/1.pdf'},{bucket:'audios',caminho:'b.ogg'}]),
  [{json:{bucket:'audios',prefixes:['a.ogg','b.ogg']}},{json:{bucket:'lv-propostas',prefixes:['p/1.pdf']}}]);
});
test('catalog photos are never deleted, even if the database returned them',()=>{
 assert.deepEqual(roda([{bucket:'lv-estoque',caminho:'foto.jpg'},{bucket:'sdr-estoque',caminho:'x.jpg'},{bucket:'audios',caminho:''}]),[]);
 assert.deepEqual(roda([]),[]);
 assert.doesNotMatch(sql,/estoque/);assert.doesNotMatch(separarCode,/'[a-z-]*estoque'/);
});
test('the database never lists anything newer than 90 days and only the service key can ask',()=>{
 assert.match(sql,/in\('audios','lv-audio','lv-propostas'\)/);
 assert.match(sql,/greatest\(coalesce\(dias,90\),90\)/);
 assert.match(sql,/least\(greatest\(coalesce\(limite,1\),1\),1000\)/);
 assert.match(sql,/revoke all on function public\.iag_arquivos_antigos\(int,int\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.iag_arquivos_antigos\(int,int\) to service_role/);
 assert.doesNotMatch(sql,/\bdelete\b\s+from/i);
});
test('the flow runs at night, follows the chain, and errors reach the WhatsApp alert',()=>{
 const nomes=fluxo.nodes.map(n=>n.name);
 for(const [de,c] of Object.entries(fluxo.connections)){assert.ok(nomes.includes(de));assert.ok(nomes.includes(c.main[0][0].node));}
 assert.equal(fluxo.settings.errorWorkflow,'Ri7JR6VuL7soi4DX');assert.equal(fluxo.settings.timezone,'America/Sao_Paulo');
 const apagar=fluxo.nodes.find(n=>n.name==='Apagar');assert.equal(apagar.parameters.method,'DELETE');
 assert.match(apagar.parameters.url,/storage\/v1\/object\/\{\{ \$json\.bucket \}\}$/);
 assert.equal(JSON.parse(fluxo.nodes.find(n=>n.name==='Listar antigos').parameters.jsonBody).dias,90);
});
