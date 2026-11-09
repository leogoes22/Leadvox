import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';
const js=readFileSync(new URL('../public/painel.js',import.meta.url),'utf8');
const motor=readFileSync(new URL('../public/site/motor.js',import.meta.url),'utf8');
const require_css=m=>{try{return readFileSync(new URL('../public/site/modelos/'+m+'.css',import.meta.url),'utf8').includes('--c1');}catch{return false;}};
const sql=readFileSync(new URL('../database/site_modelos.sql',import.meta.url),'utf8');

async function servidor(t,rpc={},falhar=false){
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(falhar&&fn==='lv_site_dados')throw Error('rede');
  if(fn==='lv_is_platform_admin')return ok(false);
  if(fn in rpc)return typeof rpc[fn]==='number'?ok({message:'forbidden'},rpc[fn]):ok(rpc[fn]);
  return ok(null);
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=sessao-x'};
 return {calls,base,post:b=>fetch(base+'/api/account/site-modelo',{method:'POST',headers:h,body:JSON.stringify(b)})};
}

test('site da loja: /s/<conta>/ abre o motor; sem a barra final redireciona; endereço estranho não abre', async t => {
 const f=await servidor(t);
 let r=await fetch(f.base+'/s/mg-motos-23b9c4b9/');
 assert.equal(r.status,200);const html=await r.text();assert.match(html,/\/site\/motor\.js/);assert.match(html,/name="robots" content="noindex"/);
 r=await fetch(f.base+'/s/mg-motos-23b9c4b9',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/s/mg-motos-23b9c4b9/');
 r=await fetch(f.base+'/s/MG_Motos/');assert.equal(r.status,404);
 r=await fetch(f.base+'/site/modelos/garagem.css');assert.equal(r.status,200);
});

test('dados públicos do site: sem login, 60 s de memória; banco fora do ar não vira página quebrada', async t => {
 const dados={ativo:true,modelo:'garagem',publicado:true,identidade:{nome:'MG Motos'},itens:[]};
 let f=await servidor(t,{lv_site_dados:dados});
 let r=await fetch(f.base+'/api/site/dados?loja=mg-motos-23b9c4b9');
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.deepEqual(await r.json(),dados);
 await fetch(f.base+'/api/site/dados?loja=mg-motos-23b9c4b9');
 assert.equal(f.calls.filter(c=>c.fn==='lv_site_dados').length,1);
 assert.equal((await fetch(f.base+'/api/site/dados?loja=x')).status,400);
 f=await servidor(t,{},true);
 r=await fetch(f.base+'/api/site/dados?loja=mg-motos-23b9c4b9');assert.equal(r.status,503);assert.equal((await r.json()).ativo,false);
});

test('salvar o modelo: vai ao banco com o login de quem pede; recusa vira mensagem clara', async t => {
 let f=await servidor(t,{lv_site_modelo_salvar:{ok:true}});
 const identidade={nome:'MG Motos',cor1:'#d6921e',cor2:'#121110',fonte:'saira',whatsapp:'21999999999'};
 let r=await f.post({organization:org,conta:'mg-motos-23b9c4b9',modelo:'garagem',identidade,publicado:true});
 assert.equal(r.status,200);
 assert.deepEqual(f.calls.find(c=>c.fn==='lv_site_modelo_salvar').body,{org,p_modelo:'garagem',ident:identidade,p_publicado:true});
 f=await servidor(t,{lv_site_modelo_salvar:{ok:false,erro:'publicar_sem_zap'}});
 r=await f.post({organization:org,modelo:'garagem',identidade:{},publicado:true});assert.equal(r.status,400);assert.match((await r.json()).error,/WhatsApp/);
 f=await servidor(t,{lv_site_modelo_salvar:400});
 r=await f.post({organization:org,modelo:'garagem',identidade:{}});assert.equal(r.status,403);
 assert.equal((await f.post({organization:'x',modelo:'garagem'})).status,400);
});

test('banco: só a leitura do site é pública; logo só da pasta da loja; só veículos disponíveis', () => {
 assert.match(sql,/grant execute on function public\.lv_site_dados\(text\) to anon,authenticated/);
 assert.doesNotMatch(sql,/lv_site_modelo_salvar\([^)]*\)[^;]*to anon/);
 assert.match(sql,/lv-materiais\/'\|\|v_conta\|\|'\//);
 assert.match(sql,/i\.status='disponivel'/);
 assert.match(sql,/usuarios_gestor\(org\)/);
 assert.match(readFileSync(new URL('../database/controle.sql',import.meta.url),'utf8'),/site_modelos\.sql/);
});

test('motor do site: texto do banco nunca vira HTML; só imagens https (os desenhos só na loja de exemplo)', () => {
 assert.doesNotMatch(motor,/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
 assert.match(motor,/if \(demo && u\.indexOf\('data:image\/svg\+xml'\) === 0\) return u;/);
 assert.match(motor,/\/\^https:\\\/\\\/\[\^\\s"'<>\]\{4,600\}\$\//);
 assert.match(motor,/if \(!demo\) \{ var s = document\.createElement\('script'\); s\.src = '\/site\/tema\.js'/);
});

test('painel: os 5 modelos aparecem; Garagem e Premium já podem ser escolhidos; logo, cores, fonte e publicar', () => {
 for(const m of ['garagem','premium','neon','claro','editorial'])assert.match(js,new RegExp("\\['"+m+"', '"));
 assert.match(js,/\['garagem', 'Garagem', '[^']+', true\]/);
 assert.match(js,/\['premium', 'Premium', '[^']+', true\]/);
 assert.match(js,/\['claro', 'Claro', '[^']+', true\]/);
 assert.match(js,/\['neon', 'Neon', '[^']+', true\]/);
 assert.match(js,/\['editorial', 'Editorial', '[^']+', true\]/);
 for(const m of ['garagem','premium','claro','neon','editorial'])assert.ok(require_css(m),m+'.css existe e usa as cores do painel');
 const bloco=js.slice(js.indexOf('const SITE_MODELOS = ['),js.indexOf('];',js.indexOf('const SITE_MODELOS = [')));
 assert.equal((bloco.match(/', false\]/g)||[]).length,0,'os 5 modelos estão prontos');
 assert.match(js,/id="smLogoArq"/);assert.match(js,/id="smCor1"/);assert.match(js,/id="smCor2"/);assert.match(js,/id="smFonte"/);assert.match(js,/id="smPub"/);
 assert.match(js,/api\('site-modelo'/);assert.match(js,/function desenharSiteModelo\(\)/);
});
