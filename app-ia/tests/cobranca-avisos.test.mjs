import test from 'node:test';
import assert from 'node:assert/strict';
import {enviarCode} from '../n8n/cobranca-avisos.mjs';

const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function rodar(avisos,{url='https://chatapi.leadvox.com.br/v1/api/external/x?token=t',status=200}={}){
 const enviados=[];
 const ctx={helpers:{httpRequest:async op=>{enviados.push(op);return {statusCode:typeof status==='function'?status(op):status};}}};
 const $=n=>({first:()=>({json:n==='Rota de envio'?{conexao:{urlEnvio:url}}:{}})});
 const $input={all:()=>[{json:avisos}]};
 const orig=globalThis.setTimeout; globalThis.setTimeout=f=>orig(f,0);
 try{return {out:(await new AsyncFunction('$','$input',enviarCode).call(ctx,$,$input)).map(i=>i.json),enviados};}finally{globalThis.setTimeout=orig;}
}

test('cada tipo de aviso vira a mensagem certa, com o link e o valor em reais', async () => {
 const {out,enviados}=await rodar([
  {id:1,tipo:'teste-3',nome:'Lajes Bueno',telefone:'15981513252',link:'https://ia.leadvox.com.br/#assinar'},
  {id:2,tipo:'vence-amanha',nome:'P5 Motors',telefone:'5521999990000',link:'https://asaas.com/i/1',valorCents:65997,vencimento:'04/11'},
  {id:3,tipo:'pago',nome:'P5 Motors',telefone:'21999990000',link:'x'}]);
 assert.deepEqual(out.map(o=>o.p_status),['enviado','enviado','enviado']);
 assert.equal(enviados[0].body.number,'5515981513252');
 assert.match(enviados[0].body.body,/Faltam 3 dias.*Lajes Bueno.*#assinar/);
 assert.match(enviados[1].body.body,/R\$\s?659,97.*04\/11.*asaas\.com\/i\/1/);
 assert.match(enviados[2].body.body,/Pagamento confirmado/);
 assert.equal(enviados[0].body.externalKey,'iag-cobranca-1'); // a Sentinela ignora iag-*
});

test('sem WhatsApp fica "sem contato"; erro da LeadVox fica "falhou" para tentar de novo', async () => {
 const {out,enviados}=await rodar([{id:7,tipo:'atraso-1',nome:'A',telefone:'',link:'l'},{id:8,tipo:'atraso-3',nome:'B',telefone:'21988887777',link:'l'}],{status:404});
 assert.deepEqual(out,[{p_id:7,p_status:'sem_contato',p_erro:'sem WhatsApp'},{p_id:8,p_status:'falhou',p_erro:'LeadVox respondeu 404'}]);
 assert.equal(enviados.length,1);
 const sem=await rodar([{id:9,tipo:'pago',nome:'C',telefone:'21988887777'}],{url:''});
 assert.equal(sem.out[0].p_status,'falhou'); assert.equal(sem.enviados.length,0);
});

test('lista vazia não manda nada', async () => {
 const {out,enviados}=await rodar([]); assert.deepEqual(out,[]); assert.equal(enviados.length,0);
});
