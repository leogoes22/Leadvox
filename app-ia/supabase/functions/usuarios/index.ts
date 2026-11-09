import {createUsuarios} from './usuarios.mjs';
// Injetadas pelo Supabase; nunca configuradas no painel, no navegador ou no n8n. Publicar com verify_jwt=false (igual à "cobranca"):
// quem confere o login é o banco, em cada chamada feita com o login de quem pede.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
async function rpcComo(jwt:string,name:string,body:unknown){
 const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
  body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
 const t=await r.text();
 if(!r.ok)throw Object.assign(Error('rpc'),{status:r.status,proibido:t.includes('forbidden')});
 return t?JSON.parse(t):null;
}
async function admin(metodo:string,caminho:string,corpo:unknown){
 const r=await fetch(base+'/auth/v1'+caminho,{method:metodo,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
  body:JSON.stringify(corpo),redirect:'error',signal:AbortSignal.timeout(12000)});
 return {status:r.status,dados:await r.json().catch(()=>null)};
}
async function recuperar(email:string){
 const r=await fetch(base+'/auth/v1/recover',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},
  body:JSON.stringify({email}),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('recover');
}
Deno.serve(createUsuarios({rpcComo,admin,recuperar}));
