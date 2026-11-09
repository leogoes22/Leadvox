import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {anuncioNasMensagens,lerPaginaHistorico} from '../integrations/rastreio-historico.mjs';
import {createApp} from '../server.mjs';
import {sha256} from '../supabase/functions/rastreio/rastreio.mjs';

const agora=Date.parse('2026-11-09T12:00:00Z'),desde=agora-30*864e5;
const ref=(id,titulo)=>({source_id:id,source_type:'ad',headline:titulo,ctwa_clid:'clid-'+id,source_url:'https://fb.me/x'});
const msg=(quando,extra={})=>({id:'m'+quando,fromMe:false,createdAt:quando,raw:{from:'5521999990001',type:'text',...extra}});
const ticket=(id,criado,mexido,contato={})=>({id,contactId:id+1000,createdAt:criado,updatedAt:mexido,contact:{id:id+1000,name:'Cliente '+id,number:'55219999900'+String(id).padStart(2,'0'),isGroup:false,...contato}});

test('acha a primeira mensagem do cliente vinda de anúncio; ignora as da equipe', () => {
 const a=anuncioNasMensagens([msg('2026-11-05T10:05:00Z',{referral:ref('222','Depois')}),{...msg('2026-11-05T09:00:00Z',{referral:ref('999','Equipe')}),fromMe:true},msg('2026-11-05T10:00:00Z',{referral:ref('111','Primeiro')}),msg('2026-11-05T11:00:00Z')]);
 assert.equal(a.anuncio,'111');assert.equal(a.titulo,'Primeiro');assert.equal(a.clid,'clid-111');
 assert.equal(anuncioNasMensagens([msg('2026-11-05T10:00:00Z')]),null);
});

function cliente({tickets,mensagens,falha=new Set()}){
 const chamadas=[];
 return {chamadas,tickets:async(status,pagina)=>{chamadas.push(['tickets',status,pagina]);return tickets[status]?.[pagina-1]||{tickets:[],hasMore:false};},
  messages:async(id,pagina)=>{chamadas.push(['messages',id,pagina]);if(falha.has(id))throw Error('x');return mensagens[id+':'+pagina]||{messages:[],hasMore:false};}};
}

test('lê uma página: só atendimentos da janela, sem grupo, e busca a última página em conversa longa', async () => {
 const c=cliente({tickets:{open:[{tickets:[ticket(1,'2026-11-01T10:00:00Z','2026-11-08T10:00:00Z'),ticket(2,'2026-09-01T10:00:00Z','2026-11-08T09:00:00Z'),
   ticket(3,'2026-11-02T10:00:00Z','2026-11-07T10:00:00Z',{isGroup:true}),ticket(4,'2026-11-03T10:00:00Z','2026-11-06T10:00:00Z'),ticket(5,'2026-11-04T10:00:00Z','2026-11-05T10:00:00Z')],hasMore:true}]},
  mensagens:{'1:1':{messages:[msg('2026-11-01T10:00:00Z',{referral:ref('111','FZ15')})],hasMore:false},
   '4:1':{messages:Array.from({length:20},(_,i)=>msg('2026-11-0'+(i<10?'4':'5')+'T1'+(i%10)+':00:00Z')),hasMore:true,count:45},
   '4:3':{messages:[msg('2026-11-03T10:00:00Z',{referral:ref('444','CG 160')})],hasMore:false}},falha:new Set([5])});
 const p=await lerPaginaHistorico({cliente:c,status:'open',pagina:1,desde});
 assert.equal(p.lidos,5);assert.equal(p.naJanela,3);assert.equal(p.erros,1);assert.equal(p.temMais,true);
 assert.deepEqual(p.leads.map(l=>[l.contato,l.anuncio,l.titulo]).sort(),[[1001,'111','FZ15'],[1004,'444','CG 160']]);
 assert.equal(p.leads.find(l=>l.contato===1001).telefone,'5521999990001');assert.equal(p.leads.find(l=>l.contato===1001).quando,'2026-11-01T10:00:00.000Z');
 assert.ok(c.chamadas.some(x=>x[0]==='messages'&&x[1]===4&&x[2]===3));
 assert.equal(c.chamadas.some(x=>x[0]==='messages'&&(x[1]===2||x[1]===3)),false);
});

test('para de ler páginas quando a lista já passou dos 30 dias', async () => {
 const c=cliente({tickets:{closed:[{tickets:[ticket(7,'2026-09-01T10:00:00Z','2026-09-20T10:00:00Z')],hasMore:true}]},mensagens:{}});
 const p=await lerPaginaHistorico({cliente:c,status:'closed',pagina:1,desde});
 assert.equal(p.temMais,false);assert.equal(p.naJanela,0);
 await assert.rejects(lerPaginaHistorico({cliente:c,status:'hack',pagina:1,desde}));
});

const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
async function fixture(t,{rastreio={liberado:true,podeEditar:true},segredo=true,lv}={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.startsWith('https://chatapi.leadvox.com.br/')){calls.push({lv:u.replace(/token=[^&]+/,'token=***')});return lv(u);}
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_rastreio')return ok(rastreio);
  if(fn==='lv_chat_secret')return ok(segredo?[{api_root:'https://chatapi.leadvox.com.br/v1',api_id:'acc1',token:'tok-lv'}]:[]);
  if(fn==='lv_rastreio_importar')return ok({ok:true,gravados:body.leads.length});
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port;
 return {calls,post:b=>fetch(base+'/api/account/rastreio-importar',{method:'POST',headers:{Origin:base,Cookie:'__Host-lv_session=x'},body:JSON.stringify(b)})};
}
const recente=new Date(Date.now()-2*864e5).toISOString();
const lvRespostas=u=>{
 if(u.includes('/tickets?status=open'))return ok({tickets:[{id:9,contactId:5501,createdAt:recente,updatedAt:recente,contact:{id:5501,name:'Cliente',number:'5521999990001'}}],hasMore:false});
 if(u.includes('/messages/9?'))return ok({messages:[{fromMe:false,createdAt:recente,raw:{referral:{source_id:'120',headline:'FZ15',ctwa_clid:'c1'}}}],hasMore:false});
 return ok({});
};

test('rota: prévia conta sem gravar; importar grava com telefone em hash e indica a próxima lista', async t => {
 const f=await fixture(t,{lv:lvRespostas});
 const p=await (await f.post({organization:org,status:'open',pagina:1,previa:true})).json();
 assert.equal(p.achados,1);assert.equal(p.gravados,0);assert.deepEqual(p.proxima,{status:'pending',pagina:1});
 assert.equal(f.calls.some(c=>c.fn==='lv_rastreio_importar'),false);
 assert.ok(f.calls.some(c=>c.lv&&c.lv.startsWith('https://chatapi.leadvox.com.br/tickets?status=open&showAll=true&pageNumber=1')));
 const r=await (await f.post({organization:org,status:'open',pagina:1})).json();assert.equal(r.gravados,1);
 const g=f.calls.find(c=>c.fn==='lv_rastreio_importar').body.leads[0];
 assert.equal(g.hash,await sha256('5521999990001'));assert.equal(g.final,'0001');assert.equal(g.anuncio,'120');assert.equal(g.telefone,undefined);
 assert.doesNotMatch(JSON.stringify(g),/5521999990001/);
 const fim=await (await f.post({organization:org,status:'closed',pagina:1,previa:true})).json();assert.equal(fim.proxima,null);
});

test('rota: só com o módulo liberado e a LeadVox conectada; token recusado vira mensagem clara', async t => {
 const fechado=await fixture(t,{rastreio:{liberado:false},lv:lvRespostas});assert.equal((await fechado.post({organization:org})).status,403);
 const sem=await fixture(t,{segredo:false,lv:lvRespostas});assert.equal((await sem.post({organization:org})).status,409);
 const recusa=await fixture(t,{lv:()=>ok({error:'x'},403)});
 const r=await recusa.post({organization:org});assert.equal(r.status,400);assert.match((await r.json()).error,/não deixou ler os atendimentos/);
});

test('banco: importação só para dono ou admin, com o módulo liberado e sem sobrescrever lead', () => {
 const sql=readFileSync(new URL('../database/rastreio_importar.sql',import.meta.url),'utf8');
 assert.match(sql,/role in\('owner','admin'\)/);assert.match(sql,/liberado\) then raise exception 'nao_liberado'/);
 assert.match(sql,/on conflict\(organization_id,contato_id\) do nothing/);assert.match(sql,/revoke all on function public\.lv_rastreio_importar\(uuid,jsonb\) from public,anon/);
 assert.doesNotMatch(sql,/\\d/);
});
