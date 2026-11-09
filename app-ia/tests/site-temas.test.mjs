import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const tema=readFileSync(new URL('../public/site/tema.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../database/site_temas.sql',import.meta.url),'utf8');

async function servidor(t,rpc={}){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body,auth:init?.headers?.Authorization});
  if(fn==='lv_is_platform_admin')return ok(false);
  if(fn in rpc)return typeof rpc[fn]==='number'?ok({message:'forbidden'},rpc[fn]):ok(rpc[fn]);
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=sessao-x'};
 return {calls,base,
  get:p=>fetch(base+'/api/account/'+p,{headers:h}),
  post:b=>fetch(base+'/api/account/site-temas',{method:'POST',headers:h,body:JSON.stringify(b)})};
}

test('datas do ano: Black Friday, Natal e Ano Novo deste ano; Carnaval e o resto já no ano que vem', () => {
 const ini=js.indexOf('const SITE_TEMAS'),fim=js.indexOf('// FIM datasDoAno');
 const ctx={};vm.runInNewContext(js.slice(ini,fim)+';globalThis.datasDoAno=datasDoAno;',ctx);
 const d=Object.fromEntries(ctx.datasDoAno(new Date('2026-11-09T12:00:00Z')).map(x=>[x.tema,[x.inicio,x.fim]]));
 assert.deepEqual(d['black-friday'],['2026-11-20','2026-11-30']);
 assert.deepEqual(d['natal'],['2026-12-01','2026-12-26']);
 assert.deepEqual(d['ano-novo'],['2026-12-27','2027-01-02']);
 assert.deepEqual(d['carnaval'],['2027-02-02','2027-02-10'],'Páscoa 2027 em 28/03: Carnaval na terça 09/02');
 assert.deepEqual(d['dia-das-maes'],['2027-05-02','2027-05-09']);
 assert.deepEqual(d['dia-dos-pais'],['2027-08-01','2027-08-08']);
 assert.deepEqual(d['dia-do-cliente'],['2027-09-10','2027-09-15']);
 for(const [a,b] of Object.values(d))assert.ok((Date.parse(b)-Date.parse(a))/864e5<=62,'cada tema cabe no limite de 2 meses do banco');
});

test('rota pública do tema: o site de outro domínio lê sem login, guardado 60 s; loja inválida nem consulta', async t => {
 const f=await servidor(t,{lv_site_publico:{tema:'natal',musica:true,campanha:null}});
 let r=await fetch(f.base+'/api/site/tema?loja=mg-motos-1a2b3c4d');
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('cache-control'),/max-age=60/);
 assert.deepEqual(await r.json(),{tema:'natal',musica:true,campanha:null});
 await fetch(f.base+'/api/site/tema?loja=mg-motos-1a2b3c4d');
 assert.equal(f.calls.filter(c=>c.fn==='lv_site_publico').length,1,'a segunda visita vem da memória');
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_site_publico').body,{p_conta:'mg-motos-1a2b3c4d'});
 assert.ok(!/sessao-x/.test(f.calls.find(c=>c.fn==='lv_site_publico').auth||''),'a leitura pública não usa login de ninguém');
 r=await fetch(f.base+'/api/site/tema?loja=../x');assert.equal(r.status,400);
 r=await fetch(f.base+'/api/site/tema?loja=mg-motos-1a2b3c4d',{method:'POST'});assert.equal(r.status,405);
});

test('painel: lê e salva pelo banco; recusa vira mensagem clara; empresa inválida nem sai daqui', async t => {
 let f=await servidor(t,{lv_site_config:{conta:'mg-motos-1a2b3c4d',tema:null,agenda:[],musica:false,campanha:null},lv_site_salvar:{ok:true}});
 let r=await f.get('site-temas?organization='+org);
 assert.equal(r.status,200);assert.equal((await r.json()).conta,'mg-motos-1a2b3c4d');
 const config={tema:'natal',musica:true,agenda:[{tema:'black-friday',inicio:'2026-11-20',fim:'2026-11-30'}],campanha:{titulo:'Feirão',ativa:true}};
 r=await f.post({organization:org,conta:'mg-motos-1a2b3c4d',config});
 assert.equal(r.status,200);assert.deepEqual(f.calls.find(c=>c.fn==='lv_site_salvar').body,{org,cfg:config});
 f=await servidor(t,{lv_site_salvar:{ok:false,erro:'agenda'}});
 r=await f.post({organization:org,config:{}});assert.equal(r.status,400);assert.match((await r.json()).error,/datas da agenda/);
 f=await servidor(t,{lv_site_config:400});
 r=await f.get('site-temas?organization='+org);assert.equal(r.status,403);assert.match((await r.json()).error,/dono ou um admin/);
 assert.equal((await f.get('site-temas?organization=x')).status,400);
});

test('banco: só a leitura pública é aberta; a arte só pode ser da pasta da própria loja; registro no controle', () => {
 assert.match(sql,/grant execute on function public\.lv_site_publico\(text\) to anon,authenticated/);
 assert.match(sql,/grant execute on function public\.lv_site_config\(uuid\),public\.lv_site_salvar\(uuid,jsonb\) to authenticated/);
 assert.doesNotMatch(sql,/lv_site_salvar\([^)]*\)[^;]*to anon/);
 assert.match(sql,/lv-materiais\/'\|\|conta\|\|'\//);
 assert.match(sql,/usuarios_gestor\(org\)/);
 assert.match(readFileSync(new URL('../database/controle.sql',import.meta.url),'utf8'),/site_temas\.sql/);
});

test('tema.js: nada de HTML vindo de fora, música só com clique, respeita quem pede menos movimento', () => {
 assert.doesNotMatch(tema,/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
 assert.match(tema,/attachShadow/);
 assert.match(tema,/prefers-reduced-motion/);
 assert.match(tema,/som\.onclick = function/);assert.doesNotMatch(tema,/autoplay/);
 assert.match(tema,/String\(c\.arte\)\.indexOf\(ARTE\) === 0/);
 assert.match(tema,/sessionStorage/);
});

test('menu: Site da loja só para loja de veículos (e a equipe LeadVox), com seção própria', () => {
 assert.match(js,/\['site', 'Site da loja', 'globo'/);
 assert.match(js,/pg === 'site' \? \(cfg\.niche === 'automotivo' \|\| !!conta\.platformAdmin\)/);
 assert.match(js,/site: 'vSite'/);assert.match(html,/<section id="vSite" hidden>/);
});
