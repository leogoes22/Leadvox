import test from 'node:test';
import assert from 'node:assert/strict';
import {createCobranca,documentoValido,pedidoAssinatura,primeiroVencimento} from '../supabase/functions/cobranca/cobranca.mjs';

const ORG='0f2a3b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b';
const pedido=(b,headers={})=>new Request('https://x.supabase.co/functions/v1/cobranca/assinar',{method:'POST',headers:{Authorization:'Bearer jwt-ok','Content-Type':'application/json',...headers},body:JSON.stringify(b)});
const corpo={organization:ORG,plano:'ia',forma:'PIX',documento:'529.982.247-25',email:'dono@loja.com.br',telefone:'(21) 98888-7777'};

test('CPF e CNPJ conferem os dígitos', () => {
 assert.equal(documentoValido('529.982.247-25'),true);
 assert.equal(documentoValido('529.982.247-24'),false);
 assert.equal(documentoValido('111.111.111-11'),false);
 assert.equal(documentoValido('11.222.333/0001-81'),true);
 assert.equal(documentoValido('11.222.333/0001-80'),false);
 assert.throws(()=>pedidoAssinatura({...corpo,documento:'123'}),/CPF ou CNPJ/);
 assert.throws(()=>pedidoAssinatura({...corpo,forma:'DINHEIRO'}),/como quer pagar/);
 assert.equal(pedidoAssinatura(corpo).telefone,'5521988887777');
});

test('1ª fatura vence no fim do teste, ou hoje se o teste já acabou (horário de Brasília)', () => {
 const agora=new Date('2026-11-01T12:00:00Z');
 assert.equal(primeiroVencimento('2026-11-04T13:35:00Z',agora),'2026-11-04');
 assert.equal(primeiroVencimento('2026-10-25T10:00:00Z',agora),'2026-11-01');
 assert.equal(primeiroVencimento('2026-11-02T01:00:00Z',new Date('2026-11-01T23:30:00Z')),'2026-11-01'); // 22h de 01/11 em Brasília
});

function cenario({dados={},asaasFalha=null}={}){
 const chamadas=[],rpcs=[];
 const rpc=async(nome,args)=>{rpcs.push([nome,args]);
  if(nome==='iag_saas_segredos')return {chave:'$aact_teste_123456',ambiente:'sandbox',retorno:'a'.repeat(48)};
  if(nome==='iag_saas_checkout_dados')return {ok:true,nome:'Lajes Bueno',testeAte:'2026-11-04T13:35:00Z',status:'teste',planos:{ia:{nome:'IA SDR LeadVox Pro',valorCents:65997}},...dados};
  return null;};
 const fetchImpl=async(url,op)=>{chamadas.push([op.method,url.replace('https://api-sandbox.asaas.com/v3',''),op.body?JSON.parse(op.body):null,op.headers.access_token]);
  if(asaasFalha)return new Response(JSON.stringify({errors:[{description:asaasFalha}]}),{status:400});
  if(url.endsWith('/customers'))return Response.json({id:'cus_1'});
  if(url.endsWith('/subscriptions'))return Response.json({id:'sub_1'});
  if(url.includes('/payments'))return Response.json({data:[{id:'pay_1',status:'PENDING',dueDate:'2026-11-04',invoiceUrl:'https://sandbox.asaas.com/i/pay_1'}]});
  return Response.json({id:'x'});};
 const getUser=async jwt=>jwt==='jwt-ok'?{id:'u1'}:null;
 return {h:createCobranca({rpc,getUser,fetchImpl,agora:()=>new Date('2026-11-01T12:00:00Z')}),chamadas,rpcs};
}

test('assinar cria cliente e assinatura mensal no Asaas e devolve o link da 1ª fatura', async () => {
 const {h,chamadas,rpcs}=cenario();
 const r=await h(pedido(corpo)); const j=await r.json();
 assert.equal(r.status,200); assert.equal(j.link,'https://sandbox.asaas.com/i/pay_1'); assert.equal(j.vencimento,'2026-11-04');
 assert.deepEqual(chamadas.map(c=>c[0]+' '+c[1].split('?')[0]),['POST /customers','POST /subscriptions','GET /subscriptions/sub_1/payments']);
 const sub=chamadas[1][2]; assert.equal(sub.value,659.97); assert.equal(sub.cycle,'MONTHLY'); assert.equal(sub.billingType,'PIX'); assert.equal(sub.nextDueDate,'2026-11-04'); assert.equal(sub.externalReference,ORG);
 assert.equal(chamadas[0][2].cpfCnpj,'52998224725'); assert.equal(chamadas[0][3],'$aact_teste_123456');
 const g=rpcs.find(x=>x[0]==='iag_saas_checkout_gravar'); assert.equal(g[1].p.assinatura,'sub_1'); assert.equal(g[1].p.cliente,'cus_1');
});

test('quem já tem assinatura troca a forma/valor na mesma assinatura, sem duplicar', async () => {
 const {h,chamadas}=cenario({dados:{cliente:'cus_9',assinatura:'sub_9',status:'ativa'}});
 const r=await h(pedido({...corpo,forma:'CREDIT_CARD'})); assert.equal(r.status,200);
 assert.deepEqual(chamadas.map(c=>c[0]+' '+c[1].split('?')[0]),['POST /customers/cus_9','POST /subscriptions/sub_9','GET /subscriptions/sub_9/payments']);
 assert.equal(chamadas[1][2].updatePendingPayments,true);
});

test('assinar recusa sem login, sem permissão, vindo do navegador e mostra o erro do Asaas', async () => {
 assert.equal((await cenario().h(pedido(corpo,{Authorization:'Bearer outro'}))).status,401);
 assert.equal((await cenario({dados:{ok:false}}).h(pedido(corpo))).status,403);
 assert.equal((await cenario().h(pedido(corpo,{Origin:'https://evil.com'}))).status,403);
 const r=await cenario({asaasFalha:'O CPF/CNPJ informado é inválido.'}).h(pedido(corpo)); assert.equal(r.status,400); assert.match((await r.json()).erro,/CPF\/CNPJ/);
});

test('retorno do Asaas só entra com o token certo e repassa o evento', async () => {
 const {h,rpcs}=cenario();
 const ev={id:'evt_1',event:'PAYMENT_RECEIVED',payment:{id:'pay_1',externalReference:ORG}};
 const req=t=>new Request('https://x.supabase.co/functions/v1/cobranca/asaas',{method:'POST',headers:{'asaas-access-token':t,'Content-Type':'application/json'},body:JSON.stringify(ev)});
 assert.equal((await h(req('b'.repeat(48)))).status,401);
 assert.equal(rpcs.some(x=>x[0]==='iag_saas_evento'),false);
 assert.equal((await h(req('a'.repeat(48)))).status,200);
 assert.deepEqual(rpcs.find(x=>x[0]==='iag_saas_evento')[1],{p:ev});
});
