import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
import {tipoDoArquivo} from '../account-api.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d,text:async()=>JSON.stringify(d)});
const org='22222222-2222-4222-8222-222222222222';
const mp4=(extra='')=>{const b=Buffer.alloc(800);b.write('ftyp',4,'latin1');b.write('avc1'+extra,20,'latin1');return b;};
const pdf=()=>{const b=Buffer.alloc(800);b.write('%PDF-1.7',0,'latin1');return b;};
async function fixture(t,{salvar={ok:true,id:7},excluir={ok:true,url:''},arquivoOk=true}={}){
 const calls=[],arquivos=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/storage/v1/object/lv-materiais/')){arquivos.push({u,method:init.method,mime:init.headers['Content-Type'],tam:init.body?.length});return ok({},arquivoOk?200:400);}
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_motor_status')return ok({vinculado:true,conta:'loja-teste-ab12'});
  if(fn==='lv_motor_materiais')return ok({vinculado:true,materiais:[{id:1,titulo:'Vídeo',tipo:'video',url:'https://x/y.mp4'}]});
  if(fn==='lv_motor_material_salvar')return ok(salvar);
  if(fn==='lv_motor_material_excluir')return ok(excluir);
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,arquivos,
  get:o=>fetch(base+'/api/account/materiais?organization='+o,{headers:h}),
  envia:(o,b)=>fetch(base+'/api/account/material-arquivo?organization='+o,{method:'POST',headers:{...h,'Content-Type':'application/octet-stream'},body:b}),
  post:(a,b)=>fetch(base+'/api/account/'+a,{method:'POST',headers:h,body:JSON.stringify(b)})};
}
test('the file type comes from the content, not the name',()=>{
 assert.equal(tipoDoArquivo(mp4()).tipo,'video');
 assert.equal(tipoDoArquivo(pdf()).tipo,'pdf');
 assert.match(tipoDoArquivo(mp4('hvc1')).erro,/H\.265/);
 assert.match(tipoDoArquivo(Buffer.from('curto')).erro,/vazio/);
 assert.match(tipoDoArquivo(Buffer.alloc(800,65)).erro,/MP4/);
 const png=Buffer.alloc(6000000);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);
 assert.match(tipoDoArquivo(png).erro,/5 MB/);
});
test('lists the files of the company',async t=>{
 const f=await fixture(t);const r=await f.get(org);
 assert.equal(r.status,200);assert.equal((await r.json()).materiais[0].titulo,'Vídeo');
 assert.equal((await f.get('nao-e-uuid')).status,400);
});
test('uploads into the folder of the account, with the login of who sent',async t=>{
 const f=await fixture(t);const r=await f.envia(org,mp4());const d=await r.json();
 assert.equal(r.status,200);assert.equal(d.tipo,'video');
 assert.match(d.url,/\/storage\/v1\/object\/public\/lv-materiais\/loja-teste-ab12\/[a-z0-9-]+\.mp4$/);
 assert.equal(f.arquivos[0].mime,'video/mp4');assert.equal(f.arquivos[0].tam,800);
 assert.equal((await f.envia(org,Buffer.alloc(800,65))).status,400);
 assert.equal((await f.envia('nao-e-uuid',mp4())).status,400);
 assert.equal((await f.envia(org,Buffer.alloc(16777217))).status,413);
});
test('saving explains what is missing',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post('material-salvar',{organization:org,material:{titulo:'V',tipo:'link',url:'https://a.b/c'}})).status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_motor_material_salvar').body,{org,item:{id:null,titulo:'V',tipo:'link',url:'https://a.b/c',descricao:''}});
 const g=await fixture(t,{salvar:{ok:false,erro:'titulo'}});
 const e=await g.post('material-salvar',{organization:org,material:{}});
 assert.equal(e.status,400);assert.match((await e.json()).error,/título/);
});
test('deleting removes the file only from the materials folder',async t=>{
 const f=await fixture(t,{excluir:{ok:true,url:'https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/loja-teste-ab12/a.mp4'}});
 assert.equal((await f.post('material-excluir',{organization:org,id:3})).status,200);
 assert.equal(f.arquivos[0].method,'DELETE');assert.match(f.arquivos[0].u,/lv-materiais\/loja-teste-ab12\/a\.mp4$/);
 const g=await fixture(t,{excluir:{ok:true,url:'https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/iag-arquivos/a.mp4'}});
 assert.equal((await g.post('material-excluir',{organization:org,id:3})).status,200);assert.equal(g.arquivos.length,0);
 assert.equal((await g.post('material-excluir',{organization:org,id:'x'})).status,400);
});
test('the database keeps files inside the account folder and removes them from the robots',()=>{
 const sql=readFileSync(new URL('../database/materiais.sql',import.meta.url),'utf8');
 assert.match(sql,/leadvox_private\.motor_conta\(org,true\)/);
 assert.match(sql,/pasta\|\|v_conta\|\|'\/'/);
 assert.match(sql,/public\.lv_motor_pasta_estoque\(name\)/);
 assert.match(sql,/jsonb_set\(a\.config,'\{materiais\}'/);
 assert.match(sql,/revoke all on function public\.lv_motor_material_salvar\(uuid,jsonb\) from public,anon/);
});
test('the side menu no longer has the files page; it became a tab of the agent',()=>{
 const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(js,/\['arquivos', 'Arquivos da IA'/);
 assert.match(html,/data-ag="arquivos"/);assert.match(html,/data-agp="arquivos"/);
});
