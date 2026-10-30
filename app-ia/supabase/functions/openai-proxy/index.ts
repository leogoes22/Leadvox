import {createProxy} from './proxy.mjs';
// These two variables are injected by Supabase, never configured in the browser/panel/n8n.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,body:unknown){
 const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
  body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('database_unavailable');
 return r.json();
}
Deno.serve(createProxy({rpc,waitUntil:(p:Promise<unknown>)=>EdgeRuntime.waitUntil(p)}));
