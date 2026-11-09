import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222',TOK='b'.repeat(32);
const liberado={liberado:true,ativo:false,podeEditar:true,token:TOK,modo:'pixel',pixelId:'932919801382762',etapasQualificado:[],eventoQualificado:'QualifiedLead',enviarCompra:true,testeCodigo:'TEST123',temToken:false};

async function fixture(t,{rastreio=liberado,admin=true,meta=null,segredo='EAAG-salvo'}={}){
 const calls=[],metas=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.startsWith('https://graph.facebook.com/')){metas.push([u,init]);return meta?meta(u,init):ok(init?.method==='POST'?{events_received:1}:{id:'932919801382762',name:'p5motors'});}
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_is_platform_admin')return ok(admin);
  if(fn==='lv_rastreio')return rastreio===null?ok({message:'x'},404):ok(rastreio);
  if(fn==='lv_rastreio_salvar')return ok({...rastreio,...body.conf,temToken:true});
  if(fn==='lv_integration_secret')return ok(segredo?[{settings:{},secret:segredo}]:[]);
  if(fn==='lv_rastreio_relatorio')return ok({totais:{leads:3}});
  if(fn==='lv_admin_rastreio')return ok({liberado:body.liberar===true});
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 return {calls,metas,
  get:p=>fetch(base+'/api/account/'+p,{headers:h}),
  post:(p,b)=>fetch(base+'/api/account/'+p,{method:'POST',headers:h,body:JSON.stringify(b)})};
}

test('tela do rastreamento: endereço do webhook montado no servidor, sem o token cru', async t=>{
 const f=await fixture(t);const r=await (await f.get('rastreio?organization='+org)).json();
 assert.equal(r.url,'https://dcucemuewipfnneqpgxk.supabase.co/functions/v1/rastreio?t='+TOK);assert.equal(r.token,undefined);
 const g=await fixture(t,{rastreio:null});assert.deepEqual(await (await g.get('rastreio?organization='+org)).json(),{setupPending:true});
 assert.equal((await f.get('rastreio?organization=xx')).status,400);
});

test('salvar: confere o token na Meta antes de guardar; token só vai ao cofre, nunca volta para a tela', async t=>{
 const f=await fixture(t);
 const r=await f.post('rastreio',{organization:org,ativo:true,pixelId:'932919801382762',tokenMeta:'EAAGnovoTokenDaMeta123456',etapasQualificado:[4]});
 assert.equal(r.status,200);const j=await r.json();assert.doesNotMatch(JSON.stringify(j),/EAAGnovo/);
 assert.match(f.metas[0][0],/^https:\/\/graph\.facebook\.com\/v24\.0\/932919801382762\?fields=id,name$/);assert.equal(f.metas[0][1].headers.Authorization,'Bearer EAAGnovoTokenDaMeta123456');
 const set=f.calls.find(c=>c.fn==='lv_set_integration');assert.equal(set.body.prov,'meta');assert.equal(set.body.sec,'EAAGnovoTokenDaMeta123456');
 const salvo=f.calls.find(c=>c.fn==='lv_rastreio_salvar');assert.deepEqual(salvo.body.conf.etapasQualificado,[4]);assert.equal(salvo.body.conf.ativo,true);
});

test('salvar: token recusado pela Meta não é guardado; sem token não liga; sem módulo não salva', async t=>{
 const f=await fixture(t,{meta:()=>ok({error:{message:'Invalid OAuth access token.',code:190}},400)});
 const r=await f.post('rastreio',{organization:org,pixelId:'932919801382762',tokenMeta:'EAAGtokenRuimDaMeta123456'});
 assert.equal(r.status,400);assert.match((await r.json()).error,/não aceitou esse token/);assert.equal(f.calls.some(c=>c.fn==='lv_set_integration'),false);
 const semPermissao=await fixture(t,{meta:()=>ok({error:{message:'Missing permissions',code:100}},400)});
 const r2=await (await semPermissao.post('rastreio',{organization:org,pixelId:'932919801382762',tokenMeta:'EAAGtokenSemLeitura12345'})).json();
 assert.match(r2.aviso,/não deixou ler o pixel/);assert.ok(semPermissao.calls.some(c=>c.fn==='lv_set_integration'));
 assert.match((await (await f.post('rastreio',{organization:org,ativo:true,pixelId:'932919801382762'})).json()).error,/cole o token da Meta/);
 const fechado=await fixture(t,{rastreio:{liberado:false}});
 const r3=await fechado.post('rastreio',{organization:org,pixelId:'932919801382762'});assert.equal(r3.status,403);assert.match((await r3.json()).error,/módulo extra/);
 assert.equal((await f.post('rastreio',{organization:org,pixelId:'12'})).status,400);
});

test('enviar teste: usa o código de teste e o token do cofre; a Meta recusando vira mensagem clara', async t=>{
 const f=await fixture(t);const r=await f.post('rastreio-teste',{organization:org});
 assert.equal(r.status,200);const corpo=JSON.parse(f.metas[0][1].body);
 assert.equal(corpo.test_event_code,'TEST123');assert.equal(corpo.data[0].event_name,'Purchase');assert.equal(f.metas[0][1].headers.Authorization,'Bearer EAAG-salvo');
 const semCodigo=await fixture(t,{rastreio:{...liberado,testeCodigo:null}});assert.match((await (await semCodigo.post('rastreio-teste',{organization:org})).json()).error,/código de teste/);
 const semToken=await fixture(t,{segredo:null});assert.equal((await semToken.post('rastreio-teste',{organization:org})).status,409);
 const recusa=await fixture(t,{meta:()=>ok({error:{message:'Invalid parameter'}},400)});
 assert.match((await (await recusa.post('rastreio-teste',{organization:org})).json()).error,/A Meta recusou o teste: Invalid parameter/);
});

test('relatório pede período válido; Super Admin libera o módulo e só ele', async t=>{
 const f=await fixture(t);
 assert.deepEqual(await (await f.get('rastreio-relatorio?organization='+org+'&ini=2026-11-01&fim=2026-11-08')).json(),{totais:{leads:3}});
 assert.equal((await f.get('rastreio-relatorio?organization='+org+'&ini=2026-11-08&fim=2026-11-01')).status,400);
 assert.deepEqual(await (await f.post('admin-rastreio',{organization:org,liberar:true})).json(),{liberado:true});
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_admin_rastreio').body,{org,liberar:true});
 assert.equal((await f.post('admin-rastreio',{organization:org,liberar:'sim'})).status,400);
 const outro=await fixture(t,{admin:false});assert.equal((await outro.post('admin-rastreio',{organization:org,liberar:true})).status,403);
});

test('banco: funções da função "rastreio" só para service_role; as do painel conferem quem é da empresa', () => {
 const sql=readFileSync(new URL('../database/rastreio.sql',import.meta.url),'utf8');
 for(const fn of ['iag_rastreio_visto','iag_rastreio_lead','iag_rastreio_resultado','iag_rastreio_oportunidade']){
  assert.match(sql,new RegExp('revoke all on function public\\.'+fn+'\\([^)]*\\) from public,anon,authenticated'),fn);
  assert.match(sql,new RegExp('grant execute on function public\\.'+fn+'\\([^)]*\\) to service_role'),fn);
 }
 assert.equal((sql.match(/security definer set search_path=''/g)||[]).length,(sql.match(/create or replace function/g)||[]).length);
 assert.match(sql,/unique\(organization_id,oportunidade_id,tipo\)/);
 assert.match(sql,/lv_is_platform_admin\(\)/);assert.match(sql,/role in\('owner','admin'\)/);
 assert.doesNotMatch(sql,/\\d/,'o editor do Supabase troca \\d por d: use [0-9]');
});
