import {createRastreio} from './rastreio.mjs';
// Injetadas pelo Supabase; nunca configuradas no painel, no navegador ou no n8n. Publicar com verify_jwt=false:
// quem chama é o webhook da LeadVox, sem login; a função confere o token da empresa (?t=) no banco.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,body:unknown){
 const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
  body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('database_unavailable');
 const t=await r.text();return t?JSON.parse(t):null;
}
// O envio à Meta termina depois da resposta, para a LeadVox não esperar (e não desligar o webhook por demora).
const depois=(p:Promise<unknown>)=>{const rt=(globalThis as any).EdgeRuntime;if(rt?.waitUntil)rt.waitUntil(p);else return p;};
Deno.serve(createRastreio({rpc,depois}));
