// Asaas integration boundary: no credentials or live financial operations exposed to clients.
import {validDate,cycles} from '../billing.mjs';
export function subscriptionPayload(contract,providerCustomerId){
 if(!/^cus_[a-zA-Z0-9]+$/.test(providerCustomerId||''))throw Error('Cliente Asaas inválido.');
 if(!cycles[contract.cycle]||!Number.isInteger(contract.amount_cents)||contract.amount_cents<100)throw Error('Contrato inválido.');
 validDate(contract.first_due_date);
 if(!/^[0-9a-f-]{36}$/.test(contract.id||''))throw Error('Contrato inválido.');
 return {customer:providerCustomerId,billingType:'BOLETO',value:contract.amount_cents/100,nextDueDate:contract.first_due_date,cycle:contract.cycle,externalReference:contract.id,description:'Contrato LeadVox '+contract.id};
}
export function createAsaasSandboxReader({apiKey,fetchImpl=fetch}){
 if(typeof apiKey!=='string'||!apiKey||/[\r\n]/.test(apiKey))throw Error('Credencial inválida.');
 return Object.freeze({async customer(id){
  if(!/^cus_[a-zA-Z0-9]+$/.test(id))throw Error('Cliente inválido.');
  let response;try{response=await fetchImpl('https://api-sandbox.asaas.com/v3/customers/'+id,{method:'GET',headers:{access_token:apiKey,Accept:'application/json','User-Agent':'LeadVoxIA/0.1'},signal:AbortSignal.timeout(10000),redirect:'error'});}catch{throw Error('Asaas indisponível.');}
  if(!response.ok)throw Error('Não foi possível validar o cliente no Asaas.');
  const data=await response.json();return {id:data.id,name:data.name};
 }});
}
// externalReference is only a correlation field. An atomic unique job/outbox is still
// required before enabling issuance; the application currently exposes no issuance endpoint.

