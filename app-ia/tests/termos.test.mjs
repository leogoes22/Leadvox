import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {TERMOS_VERSAO} from '../account-api.mjs';
async function fixture(t,fetchImpl){const s=createApp({allowLocal:true,fetchImpl});await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const USER={id:'11111111-1111-4111-8111-111111111111',email:'dono@loja.com.br',email_confirmed_at:'2026-01-01'};

test('criar conta exige o aceite e grava a versão dos termos no login', async t => {
 const corpos=[];const base=await fixture(t,async(url,init)=>{corpos.push([url,JSON.parse(init.body||'null')]);return response({});});
 const post=b=>fetch(base+'/api/account/signup',{method:'POST',headers:{Origin:base},body:JSON.stringify(b)});
 const sem=await post({email:'novo@loja.com.br',password:'senha-bem-longa-123'});
 assert.equal(sem.status,400); assert.match((await sem.json()).error,/aceite os Termos/); assert.equal(corpos.length,0);
 const com=await post({email:'novo@loja.com.br',password:'senha-bem-longa-123',aceite:true});
 assert.equal(com.status,200);
 const [url,body]=corpos[0]; assert.match(url,/\/auth\/v1\/signup$/);
 assert.equal(body.data.termos_versao,TERMOS_VERSAO); assert.ok(Date.parse(body.data.termos_aceite_em));
});

test('o painel sabe se falta aceitar a versão atual e grava o aceite só da versão atual', async t => {
 let meta={},puts=[];const base=await fixture(t,async(url,init)=>{
  if(url.endsWith('/auth/v1/user')&&init.method==='PUT'){puts.push(JSON.parse(init.body));meta={...meta,...JSON.parse(init.body).data};return response({});}
  if(url.endsWith('/auth/v1/user'))return response({...USER,user_metadata:meta});
  return response([]);});
 const h={Cookie:'__Host-lv_session=x'};
 let me=await (await fetch(base+'/api/account/me',{headers:h})).json();
 assert.deepEqual(me.termos,{atual:TERMOS_VERSAO,aceito:null});
 const velha=await fetch(base+'/api/account/aceite',{method:'POST',headers:{...h,Origin:base},body:JSON.stringify({versao:'2020-01-01'})});
 assert.equal(velha.status,400); assert.equal(puts.length,0);
 const ok=await fetch(base+'/api/account/aceite',{method:'POST',headers:{...h,Origin:base},body:JSON.stringify({versao:TERMOS_VERSAO})});
 assert.equal(ok.status,200); assert.equal(puts[0].data.termos_versao,TERMOS_VERSAO);
 me=await (await fetch(base+'/api/account/me',{headers:h})).json();
 assert.equal(me.termos.aceito,TERMOS_VERSAO);
});

test('as páginas de termos e privacidade são públicas', async t => {
 const base=await fixture(t,async()=>response({}));
 for(const p of ['/termos.html','/privacidade.html','/legal.css']){const r=await fetch(base+p);assert.equal(r.status,200,p);}
 assert.match(await (await fetch(base+'/termos.html')).text(),/7 dias de teste grátis/);
});
