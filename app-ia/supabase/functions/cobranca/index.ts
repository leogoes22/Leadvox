import {createCobranca} from './cobranca.mjs';
// Injetadas pelo Supabase; nunca configuradas no painel, no navegador ou no n8n. Publicar com verify_jwt=false:
// o retorno do Asaas não tem login, e /assinar confere o login do cliente aqui dentro.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
async function rpc(name:string,body:unknown){
 const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
  body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('database_unavailable');
 const t=await r.text();return t?JSON.parse(t):null;
}
async function getUser(jwt:string){
 const r=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+jwt},redirect:'error',signal:AbortSignal.timeout(8000)});
 return r.ok?r.json():null;
}
Deno.serve(createCobranca({rpc,getUser}));
