import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {deAutoCerto,deRevendaMais,itemManual,buscarEstoque} from '../integrations/estoque.mjs';
const ok=(d,status=200)=>({ok:status<400,status,json:async()=>d});
const org='22222222-2222-4222-8222-222222222222';

test('AutoCerto vehicles become catalog items with name, km, photos and price',()=>{
 const i=deAutoCerto({Codigo:4512,Marca:'Hyundai',Modelo:'HB20',Versao:'HB20 1.0 Comfort',Cor:'Prata',AnoFabricacao:2020,AnoModelo:2021,Km:45000,Preco:62900,TipoVeiculo:'CARRO',Categoria:'Hatch',
  Fotos:[{URL:'https://f.autocerto.com/2.jpg',Posicao:2},{URL:'https://f.autocerto.com/1.jpg',Posicao:1},{URL:'javascript:alert(1)',Posicao:3}]});
 assert.equal(i.codigo,'4512');assert.equal(i.nome,'Hyundai HB20 1.0 Comfort 2020/2021');assert.equal(i.preco,62900);assert.equal(i.categoria,'Hatch');
 assert.deepEqual(i.fotos,['https://f.autocerto.com/1.jpg','https://f.autocerto.com/2.jpg']);
 assert.match(i.descricao,/Cor prata · 45\.000 km/);assert.equal(i.atributos.km,45000);
});
test('Revenda Mais uses the promotion price and marks motorcycles',()=>{
 const i=deRevendaMais({vehicle_id:'x9',make:'Honda',model:'CG 160',year:2022,mileage:'12.000',price:'15.990,00',promotion_price:'14.990,00',category:'MOTO',images:['https://img/1.jpg']});
 assert.equal(i.preco,14990);assert.equal(i.atributos.tipo,'moto');assert.equal(i.categoria,'Moto');assert.equal(i.atributos.km,12000);
});
test('manual vehicles need a model and split the year',()=>{
 const i=itemManual({marca:'Fiat',modelo:'Argo',ano:'2019/2020',km:'30000',preco:'55.000',fotos:'https://a/1.jpg  http://inseguro/2.jpg'});
 assert.equal(i.nome,'Fiat Argo 2019/2020');assert.equal(i.preco,55000);assert.deepEqual(i.fotos,['https://a/1.jpg']);assert.equal(i.codigo,'');
 assert.throws(()=>itemManual({marca:'Fiat'}),/modelo/);
});
test('AutoCerto stock is read with the saved login and unit',async()=>{
 const urls=[];const itens=await buscarEstoque({source:'autocerto',settings:{usuario:'api',unidade:'4425'},secret:'s3nha',fetchImpl:async(u,o)=>{urls.push(u);
  if(u.endsWith('/oauth/token')){assert.match(o.body,/username=api&password=s3nha/);return ok({access_token:'tk'});}
  assert.equal(o.headers.Authorization,'Bearer tk');return ok([{Codigo:1,Marca:'VW',Modelo:'Gol'},{Codigo:2}]);}});
 assert.equal(itens.length,1);assert.equal(urls[1],'https://integracao.autocerto.com/api/Veiculo/ObterEstoque?CodigoUnidade=4425');
 await assert.rejects(buscarEstoque({source:'leadvox'}),/Estoque LeadVox/);
});

test('vehicle photos must be real images and go to the account folder with the user login',async t=>{
 const ups=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('/rpc/lv_motor_status'))return ok({vinculado:true,conta:'loja-teste-ab12'});
  if(u.includes('/storage/v1/object/')){ups.push({u,h:init.headers,n:init.body.length});return ok({Key:'x'});}
  return ok({});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=tok'};
 const post=imagem=>fetch(base+'/api/account/estoque-foto',{method:'POST',headers:h,body:JSON.stringify({organization:org,imagem})});
 const jpg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(800,1)]).toString('base64');
 assert.equal((await post('data:image/jpeg;base64,'+Buffer.from('<svg onload=alert(1)>'.repeat(40)).toString('base64'))).status,400);
 assert.equal((await post('data:image/png;base64,'+jpg)).status,400);
 const r=await post('data:image/jpeg;base64,'+jpg);assert.equal(r.status,200);
 assert.match((await r.json()).url,/^https:\/\/dcucemuewipfnneqpgxk\.supabase\.co\/storage\/v1\/object\/public\/lv-estoque\/loja-teste-ab12\/[a-z0-9]+-[0-9a-f]{12}\.jpg$/);
 assert.equal(ups.length,1);assert.equal(ups[0].h.Authorization,'Bearer tok');assert.equal(ups[0].h['Content-Type'],'image/jpeg');
 assert.equal((await fetch(base+'/api/account/estoque-foto',{method:'POST',headers:h,body:'x'.repeat(3000000)})).status,413);
});
test('panel saves manual vehicles and syncs the saved source into the catalog',async t=>{
 const calls=[];
 const s=createApp({allowLocal:true,fetchImpl:async(u,init)=>{
  if(u.endsWith('/auth/v1/user'))return ok({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'});
  if(u.includes('revenda'))return ok({vehicles:[{vehicle_id:7,make:'Fiat',model:'Mobi',price:40000}]});
  const fn=(u.match(/rpc\/([a-z_]+)/)||[])[1];const body=init?.body?JSON.parse(init.body):null;calls.push({fn,body});
  if(fn==='lv_integration_secret')return ok([{settings:{source:'revendamais'},secret:'https://feed.revenda.com.br/loja.json'}]);
  if(fn==='lv_motor_itens')return ok({vinculado:true,itens:[]});
  return ok({ok:true});
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
 const base='http://127.0.0.1:'+s.address().port,h={Origin:base,Cookie:'__Host-lv_session=x'};
 const post=b=>fetch(base+'/api/account/estoque',{method:'POST',headers:h,body:JSON.stringify({organization:org,...b})});
 assert.equal((await post({acao:'salvar',item:{marca:'Fiat'}})).status,400);
 assert.equal((await post({acao:'salvar',item:{marca:'Fiat',modelo:'Argo',ano:'2020'}})).status,200);
 assert.equal(calls.find(c=>c.fn==='lv_motor_item_salvar').body.item.nome,'Fiat Argo 2020');
 const r=await post({acao:'sincronizar'});assert.equal(r.status,200);
 const imp=calls.find(c=>c.fn==='lv_motor_estoque_importar').body;
 assert.equal(imp.fonte,'revendamais');assert.equal(imp.itens[0].nome,'Fiat Mobi');assert.equal(imp.itens[0].codigo,'7');
});
