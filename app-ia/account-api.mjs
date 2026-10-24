import {handleBilling} from './billing.mjs';
const URL_BASE='https://dcucemuewipfnneqpgxk.supabase.co';
const KEY='sb_publishable_aoGk_UyAvuroF3asqpSDHg_cs5MIu89';
export function createAccountApi({fetchImpl=fetch,allowLocal=false}={}){
 const attempts=new Map();
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function upstream(route,{method='GET',body,token}={}){
  let r;try{r=await fetchImpl(URL_BASE+route,{method,headers:{apikey:KEY,Authorization:'Bearer '+(token||KEY),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw {status:503,message:'Serviço temporariamente indisponível.'};}
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw {status:r.status===429?429:400,message:r.status===429?'Muitas tentativas. Aguarde alguns minutos.':'Não foi possível concluir. Confira os dados e tente novamente.'};
  return data;
 }
 return async(req,res,pathname)=>{
  if(!pathname.startsWith('/api/account/'))return false;
  const host=req.headers.host||'';
  const local=allowLocal&&/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  // Only the TLS proxy may supply this header in production.
  const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
  if(!secure&&!local){send(res,426,{error:'Use o endereço HTTPS para entrar na sua conta.'});return true;}
  if(!['GET','POST'].includes(req.method)){send(res,405,{error:'Método não permitido'});return true;}
  if(req.method==='POST'){
   const expected=(secure?'https://':'http://')+host;
   if(req.headers.origin!==expected){send(res,403,{error:'Origem inválida'});return true;}
  }
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-lv_session='));
  const token=cookie?.slice('__Host-lv_session='.length);
  const setSession=(session)=>res.setHeader('Set-Cookie','__Host-lv_session='+encodeURIComponent(session.access_token)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.min(Number(session.expires_in)||3600,3600));
  try{
   let body={};
   if(req.method==='POST'){
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>110000)throw {status:413,message:'Dados muito grandes.'};}
    try{body=JSON.parse(raw||'{}');}catch{throw {status:400,message:'Dados inválidos.'};}
   }
   const action=pathname.slice('/api/account/'.length);
   const publicActions=['login','signup','verify','recover'];
   if(publicActions.includes(action)){
    if(req.method!=='POST')throw {status:405,message:'Método não permitido.'};
    const now=Date.now(),ip=req.socket.remoteAddress||'unknown';
    for(const [key,v] of attempts)if(v.until<now)attempts.delete(key);
    const a=attempts.get(ip)||{count:0,until:now+900000};a.count++;attempts.set(ip,a);
    if(a.count>20||attempts.size>10000)throw {status:429,message:'Muitas tentativas. Aguarde alguns minutos.'};
    if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email))throw {status:400,message:'Informe um e-mail válido.'};
    const email=body.email.trim().toLowerCase();
    if(action==='signup'||action==='login'){
     if(typeof body.password!=='string'||body.password.length<(action==='signup'?12:1)||body.password.length>128)throw {status:400,message:'Use uma senha de 12 a 128 caracteres.'};
     const data=await upstream(action==='login'?'/auth/v1/token?grant_type=password':'/auth/v1/signup',{method:'POST',body:{email,password:body.password}});
     if(data?.access_token){setSession(data);send(res,200,{authenticated:true});}else send(res,200,{confirmationRequired:true,message:'Confira seu e-mail para confirmar o cadastro.'});
    }else if(action==='verify'){
     if(!['signup','recovery'].includes(body.type)||!/^\d{6,10}$/.test(body.code||''))throw {status:400,message:'Confira o código recebido por e-mail.'};
     const data=await upstream('/auth/v1/verify',{method:'POST',body:{email,token:body.code,type:body.type}});
     if(!data?.access_token)throw {status:400,message:'Código inválido ou expirado.'};setSession(data);send(res,200,{authenticated:true});
    }else{
     await upstream('/auth/v1/recover',{method:'POST',body:{email}});
     send(res,200,{message:'Se houver uma conta, você receberá instruções por e-mail.'});
    }
    return true;
   }
   if(!token)throw {status:401,message:'Entre na sua conta.'};
   let user;try{user=await upstream('/auth/v1/user',{token:decodeURIComponent(token)});}catch{throw {status:401,message:'Sessão expirada. Entre novamente.'};}
   if(!user?.id||!user.email_confirmed_at)throw {status:401,message:'Confirme seu e-mail antes de continuar.'};
   const authToken=decodeURIComponent(token);
   if(action==='billing'){await handleBilling({req,body,user,authToken,upstream,send,res});}
   else if(action==='logout'&&req.method==='POST'){
    await upstream('/auth/v1/logout',{method:'POST',token:authToken,body:{}});
    res.setHeader('Set-Cookie','__Host-lv_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');send(res,200,{ok:true});
   }else if(action==='password'&&req.method==='POST'){
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw {status:400,message:'Use uma senha de 12 a 128 caracteres.'};
    await upstream('/auth/v1/user',{method:'PUT',token:authToken,body:{password:body.password}});send(res,200,{ok:true});
   }else if(action==='me'&&req.method==='GET'){
    const organizations=await upstream('/rest/v1/lv_organizations?select=id,name,trial_ends_at,created_at',{token:authToken});
    send(res,200,{user:{id:user.id,email:user.email},organizations});
   }else if(action==='organization'&&req.method==='POST'){
    if(typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>100)throw {status:400,message:'Informe o nome da empresa.'};
    const organizations=await upstream('/rest/v1/lv_organizations',{method:'POST',token:authToken,body:{name:body.name.trim()}});
    send(res,201,{organizations});
   }else if(action==='workspace'){
    const org=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('organization'):body.organization;
    if(!/^[0-9a-f-]{36}$/.test(org||''))throw {status:400,message:'Empresa inválida.'};
    // Membership is checked by RLS and by a fresh explicit read. No service-role key.
    const memberships=await upstream('/rest/v1/lv_memberships?select=role&organization_id=eq.'+org+'&user_id=eq.'+user.id,{token:authToken});
    if(!Array.isArray(memberships)||!memberships.length)throw {status:403,message:'Você não tem acesso a esta empresa.'};
    if(req.method==='GET')send(res,200,{workspace:await upstream('/rest/v1/lv_workspace?select=settings,updated_at&organization_id=eq.'+org,{token:authToken})});
    else{
     if(!['owner','admin'].includes(memberships[0].role))throw {status:403,message:'Você não tem permissão para editar.'};
     // Explicit allowlist; CRM tokens and passwords are never accepted as workspace settings.
     if(!body.settings||typeof body.settings!=='object'||Array.isArray(body.settings)||Object.keys(body.settings).some(k=>!['displayName','timezone'].includes(k)))throw {status:400,message:'Configurações inválidas.'};
     const settings={displayName:String(body.settings.displayName||'').slice(0,100),timezone:'America/Sao_Paulo'};
     const existing=await upstream('/rest/v1/lv_workspace?select=organization_id&organization_id=eq.'+org,{token:authToken});
     await upstream('/rest/v1/lv_workspace'+(existing.length?'?organization_id=eq.'+org:''),{method:existing.length?'PATCH':'POST',token:authToken,body:existing.length?{settings}:{organization_id:org,settings}});
     send(res,200,{ok:true});
    }
   }else send(res,404,{error:'Recurso não encontrado.'});
  }catch(e){send(res,e.status||500,{error:e.message||'Não foi possível concluir a solicitação.'});}
  return true;
 };
}

