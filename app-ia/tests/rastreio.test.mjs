import test from 'node:test';
import assert from 'node:assert/strict';
import {createRastreio,lerAnuncio,lerMensagem,lerOportunidade,configRastreio,montarEvento,enviarMeta,conferirMeta,telefone,valor,sha256} from '../supabase/functions/rastreio/rastreio.mjs';

const TOKEN='a'.repeat(32);
// Formatos reais do webhook da LeadVox (campos e tipos conferidos em eventos da P5 Motors; valores inventados).
const msgAnuncio={event:'message.received',tenantId:9,sessionId:226,message:{id:'m1',fromMe:false,contactId:5501,ticketId:77,body:'Oi, vi o anúncio',
 ticket:{id:77,contactId:5501,contact:{id:5501,name:'Cliente Teste',number:'5521999990001',isGroup:false}},
 raw:{id:'wamid.1',from:'5521999990001',type:'text',referral:{source_id:'120261108542910537',source_type:'ad',source_url:'https://fb.me/abc',headline:'CHUVA DE 160',ctwa_clid:'ARAkLkA8rmlFeiCktEJQ',media_type:'video'}}}};
const msgComum={event:'message.received',message:{id:'m2',fromMe:false,contactId:5501,ticket:{contact:{id:5501,number:'5521999990001'}},raw:{from:'5521999990001',type:'text'}}};
const oport=(status,etapa,extra={})=>({id:900,event:'Opportunity',status,value:'89900.50',pipelineStepId:etapa,pipelineStep:{name:etapa===44?'Ganho':'CREDITO APROVADO'},contactId:5501,contact:{id:5501,number:'5521999990001'},...extra});
const pedido=(corpo,t=TOKEN)=>new Request('https://x.supabase.co/functions/v1/rastreio?t='+t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});

test('lê o anúncio da API oficial e do WhatsApp por QR Code; mensagem comum não tem anúncio', () => {
 assert.deepEqual(lerAnuncio(msgAnuncio),{anuncio:'120261108542910537',titulo:'CHUVA DE 160',link:'https://fb.me/abc',clid:'ARAkLkA8rmlFeiCktEJQ',midia:'video'});
 assert.equal(lerAnuncio(msgComum),null);
 const qr={message:{contactId:1,raw:{message:{extendedTextMessage:{contextInfo:{externalAdReply:{sourceId:'123456',title:'Moto',sourceUrl:'javascript:alert(1)',ctwaClid:'XYZ'}}}}}}};
 assert.deepEqual(lerAnuncio(qr),{anuncio:'123456',titulo:'Moto',link:'',clid:'XYZ',midia:''});
 assert.deepEqual(lerMensagem(msgAnuncio),{contato:5501,telefone:'5521999990001',nome:'Cliente Teste',deMim:false,grupo:false});
});

test('lê a oportunidade: etapa, status e valor; mensagem não é oportunidade', () => {
 assert.deepEqual(lerOportunidade(oport('won',44)),{id:900,contato:5501,telefone:'5521999990001',status:'won',etapaId:44,etapa:'Ganho',valor:89900.5});
 assert.equal(lerOportunidade(msgAnuncio),null);
 assert.equal(lerOportunidade({event:'Opportunity'}),null);
 assert.equal(valor('1.234,56'),1234.56);assert.equal(valor('1234.5'),1234.5);assert.equal(valor('R$ 89.900,00'),89900);assert.equal(valor('abc'),null);assert.equal(valor(-3),null);
 assert.equal(telefone('21999990001'),'5521999990001');assert.equal(telefone('5521999990001@s.whatsapp.net'),'5521999990001');assert.equal(telefone('123'),'');
});

test('configuração do painel: IDs só com números, etapas sem repetir e evento da lista', () => {
 const c=configRastreio({ativo:true,pixelId:' 932919801382762 ',etapasQualificado:[4,'4',5,'x',-1],eventoQualificado:'Hack',testeCodigo:'TEST123'});
 assert.deepEqual(c,{ativo:true,modo:'pixel',pixelId:'932919801382762',wabaId:null,pageId:null,etapasQualificado:[4,5],eventoQualificado:'QualifiedLead',enviarCompra:true,testeCodigo:'TEST123'});
 assert.throws(()=>configRastreio({pixelId:'12'}),/ID do pixel/);
 assert.throws(()=>configRastreio({testeCodigo:'TEST-1'}),/código de teste/);
 assert.equal(configRastreio({enviarCompra:false,modo:'whatsapp'}).enviarCompra,false);
});

test('evento pelo pixel: telefone em SHA-256, valor em reais e código de teste', async () => {
 const hash=await sha256('5521999990001');
 const {url,corpo}=await montarEvento({modo:'pixel',pixel:'932919801382762',teste:'TEST123'},{id:7,tipo:'compra',evento:'Purchase',valor:89900.5,hash,contato:5501},new Date('2026-11-08T12:00:00Z'));
 assert.equal(url,'https://graph.facebook.com/v24.0/932919801382762/events');
 const e=corpo.data[0];
 assert.equal(e.action_source,'chat');assert.equal(e.event_time,1794139200);assert.equal(e.event_id,'lvx-7');
 assert.deepEqual(e.user_data.ph,[hash]);assert.equal(e.user_data.country[0],await sha256('br'));
 assert.deepEqual(e.custom_data,{currency:'BRL',value:89900.5});assert.equal(corpo.test_event_code,'TEST123');
 assert.doesNotMatch(JSON.stringify(corpo),/5521999990001/);
 const q=(await montarEvento({modo:'pixel',pixel:'1'},{id:8,tipo:'qualificado',evento:'QualifiedLead',valor:null,hash})).corpo;
 assert.equal(q.data[0].custom_data,undefined);assert.equal(q.test_event_code,undefined);
});

test('evento oficial do WhatsApp usa o código do clique quando existe, senão página e telefone', async () => {
 const meta={modo:'whatsapp',pixel:'555555',waba:'111111',page:'222222'};
 const a=(await montarEvento(meta,{id:1,tipo:'compra',evento:'Purchase',valor:10,clid:'ARAk',hash:'h'})).corpo.data[0];
 assert.equal(a.action_source,'business_messaging');assert.equal(a.messaging_channel,'whatsapp');
 assert.deepEqual(a.user_data,{whatsapp_business_account_id:'111111',ctwa_clid:'ARAk'});
 const b=(await montarEvento(meta,{id:2,tipo:'compra',evento:'Purchase',valor:10,hash:'h'})).corpo.data[0];
 assert.deepEqual(b.user_data,{whatsapp_business_account_id:'111111',page_id:'222222',ph:['h']});
});

test('envio à Meta: token no cabeçalho, nunca na URL; erro da Meta volta legível', async () => {
 let visto;const ok=await enviarMeta({url:'https://graph.facebook.com/v24.0/1/events',corpo:{data:[]},token:'EAAG-secreto',fetchImpl:async(u,op)=>{visto=[u,op.headers.Authorization];return Response.json({events_received:1});}});
 assert.deepEqual(ok,{ok:true,detalhe:'A Meta recebeu.'});assert.doesNotMatch(visto[0],/secreto/);assert.equal(visto[1],'Bearer EAAG-secreto');
 const ruim=await enviarMeta({url:'u',corpo:{},token:'t',fetchImpl:async()=>Response.json({error:{message:'Invalid OAuth access token.'}},{status:400})});
 assert.deepEqual(ruim,{ok:false,detalhe:'Invalid OAuth access token.'});
 assert.deepEqual(await enviarMeta({url:'u',corpo:{},token:'t',fetchImpl:async()=>{throw Error('rede');}}),{ok:false,detalhe:'A Meta não respondeu.'});
 await assert.rejects(conferirMeta({id:'123456',token:'t',fetchImpl:async()=>Response.json({error:{message:'no permission'}},{status:403})}),/não aceitou esse token para o ID 123456: no permission/);
 assert.deepEqual(await conferirMeta({id:'123456',token:'t',fetchImpl:async()=>Response.json({id:'123456',name:'p5motors'})}),{id:'123456',nome:'p5motors'});
});

function cenario(respostas={}){
 const rpcs=[],metas=[];
 const rpc=async(nome,args)=>{rpcs.push([nome,args]);const r=respostas[nome];return typeof r==='function'?r(args):r;};
 const fetchImpl=async(u,op)=>{metas.push([u,JSON.parse(op.body)]);return Response.json({events_received:1});};
 return {h:createRastreio({rpc,fetchImpl,agora:()=>new Date('2026-11-08T12:00:00Z')}),rpcs,metas};
}

test('webhook: mensagem de anúncio grava a origem com telefone em hash; mensagem comum só marca que chegou', async () => {
 const {h,rpcs}=cenario({iag_rastreio_lead:{ok:true,novo:true},iag_rastreio_visto:{ok:true}});
 const r=await h(pedido(msgAnuncio));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,novo:true});
 const [nome,args]=rpcs[0];assert.equal(nome,'iag_rastreio_lead');assert.equal(args.p_token,TOKEN);
 assert.deepEqual(args.p,{contato:5501,hash:await sha256('5521999990001'),final:'0001',nome:'Cliente Teste',anuncio:'120261108542910537',titulo:'CHUVA DE 160',link:'https://fb.me/abc',clid:'ARAkLkA8rmlFeiCktEJQ',midia:'video'});
 assert.doesNotMatch(JSON.stringify(args),/5521999990001/);
 await h(pedido(msgComum));assert.equal(rpcs[1][0],'iag_rastreio_visto');
 // mensagem da equipe e de grupo não chegam ao banco
 await h(pedido({message:{...msgAnuncio.message,fromMe:true}}));await h(pedido({message:{...msgComum.message,ticket:{contact:{id:1,isGroup:true}}}}));
 assert.equal(rpcs.length,2);
});

test('webhook: Ganho manda a compra com o valor e grava o resultado de cada envio', async () => {
 const hash=await sha256('5521999990001');
 const {h,rpcs,metas}=cenario({iag_rastreio_oportunidade:{ok:true,enviar:[{id:31,tipo:'compra',evento:'Purchase',valor:89900.5}],lead:{hash,clid:'ARAk',contato:5501},
  meta:{modo:'pixel',pixel:'932919801382762',token:'EAAG-tok',teste:null}},iag_rastreio_resultado:null});
 const r=await h(pedido(oport('won',44)));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,envios:1});
 assert.deepEqual(rpcs[0][1].p,{oportunidade:900,contato:5501,hash,status:'won',etapaId:44,etapa:'Ganho',valor:89900.5});
 assert.equal(metas.length,1);assert.equal(metas[0][1].data[0].event_name,'Purchase');assert.equal(metas[0][1].data[0].custom_data.value,89900.5);
 assert.deepEqual(rpcs[1],['iag_rastreio_resultado',{p_token:TOKEN,p_id:31,p_status:'enviado',p_detalhe:'A Meta recebeu.'}]);
});

test('webhook: sem token da Meta o envio fica com erro explicado; nada a enviar não chama a Meta', async () => {
 const {h,rpcs,metas}=cenario({iag_rastreio_oportunidade:{ok:true,enviar:[{id:5,tipo:'qualificado',evento:'QualifiedLead'}],lead:{hash:'h'},meta:{modo:'pixel',pixel:'1',token:null}}});
 await h(pedido(oport('open',4)));
 assert.equal(metas.length,0);assert.equal(rpcs[1][1].p_status,'erro');assert.match(rpcs[1][1].p_detalhe,/Conecte o pixel/);
 const s=cenario({iag_rastreio_oportunidade:{ok:true,enviar:[]}});await s.h(pedido(oport('open',3)));assert.equal(s.metas.length,0);assert.equal(s.rpcs.length,1);
});

test('webhook: token errado é recusado sem tocar no banco; token desconhecido devolve 404; banco fora devolve 503', async () => {
 const {h,rpcs}=cenario({iag_rastreio_visto:{ok:false}});
 assert.equal((await h(pedido(msgComum,'nao-e-token'))).status,404);assert.equal(rpcs.length,0);
 assert.equal((await h(pedido(msgComum))).status,404);
 assert.equal((await h(new Request('https://x.supabase.co/functions/v1/rastreio?t='+TOKEN,{method:'POST',body:'{quebrado'}))).status,400);
 assert.equal((await h(new Request('https://x.supabase.co/functions/v1/rastreio',{method:'GET'}))).status,200);
 const f=createRastreio({rpc:async()=>{throw Error('fora');}});assert.equal((await f(pedido(msgAnuncio))).status,503);
});
