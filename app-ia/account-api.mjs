import {handleBilling} from './billing.mjs';
import {createChatClient,parseChatUrl,chatUrlProblem,pickList,normalizeItems} from './integrations/chat-leadvox.mjs';
import {testAutoCerto,testRevendaMais,testAsaas,ConnectionError} from './integrations/connections.mjs';
import {buscarEstoque,itemManual} from './integrations/estoque.mjs';
const URL_BASE='https://dcucemuewipfnneqpgxk.supabase.co';
const KEY='sb_publishable_aoGk_UyAvuroF3asqpSDHg_cs5MIu89';
// Error codes returned by the Motor IA functions (iag_*), in the client's words.
const MOTOR_ERROS={conflito:'Alguém salvou este agente depois de você abrir. Recarregue para ver a versão nova.',sem_vaga:'Sua conta já tem o máximo de agentes.',tipo:'Tipo de agente inválido.',
 conexao_em_uso_motor_ia:'Esse número da LeadVox já está ligado a outra conta do motor.',conexao_em_uso_motor_sdr:'Esse número da LeadVox já está ligado a uma loja do SDR.',
 sem_credencial:'Conecte sua LeadVox em Credenciais de API primeiro.',token_sem_sessao:'O token da LeadVox não traz o número (sessão). Gere a URL da API a partir do canal de WhatsApp.',
 config_grande_demais:'A configuração ficou grande demais.',config_invalida:'Configuração inválida.',agente:'Agente não encontrado.'};
// Why the motor refuses to turn an agent on (iag__pendencias).
const MOTOR_PENDENCIAS={nao_configurado:'preencha nome e "como ele se apresenta" e salve',sem_departamento:'escolha o departamento deste agente',sem_conexao:'ligue o WhatsApp (Credenciais de API)',conta_suspensa:'a conta está suspensa',arquivado:'o agente está arquivado'};
function motorErro(r,msg){
 if(r.erro==='pendencias'&&Array.isArray(r.pendencias))return 'Para ligar o agente: '+r.pendencias.map(p=>MOTOR_PENDENCIAS[p]||p).join('; ')+'.';
 return MOTOR_ERROS[r.erro]||msg;
}
export function jwtPayload(token){
 try{const part=String(token).split('.')[1];return JSON.parse(Buffer.from(part.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));}catch{return null;}
}
export const NICHES=['automotivo','imoveis','saude','advocacia','educacao','varejo','viagens','outro'];
const AI_ROLES=['SDR','Atendimento','Recepção','Suporte','Pós-venda','Cobrança'];
const AI_FLAGS=['aiActive','capAudioIn','capAudioOut','capImage','capDoc','capSheet'];
// Explicit allowlist; CRM tokens and passwords are never accepted as workspace settings.
export function cleanSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('settings');
 const out={};
 for(const [k,v] of Object.entries(input)){
  if(k==='displayName'&&typeof v==='string')out[k]=v.trim().slice(0,100);
  else if(k==='aiName'&&typeof v==='string')out[k]=v.trim().slice(0,40);
  else if(k==='aiRole'&&AI_ROLES.includes(v))out[k]=v;
  else if(k==='aiDescription'&&typeof v==='string')out[k]=v.trim().slice(0,500);
  else if(AI_FLAGS.includes(k)&&typeof v==='boolean')out[k]=v;
  else if(k==='niche'&&NICHES.includes(v))out[k]=v;
  else if(k==='whatsapp'&&typeof v==='string'&&/^\d{10,13}$/.test(v.replace(/\D/g,'')))out[k]=v.replace(/\D/g,'');
  else if(k==='whatsapp'&&v==='')out[k]='';
  else if((k==='billingEnabled'||k==='onboarded')&&typeof v==='boolean')out[k]=v;
  else throw Error('settings');
 }
 return out;
}
export function createAccountApi({fetchImpl=fetch,allowLocal=false}={}){
 const attempts=new Map();
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function upstream(route,{method='GET',body,token,prefer='return=representation'}={}){
  let r;try{r=await fetchImpl(URL_BASE+route,{method,headers:{apikey:KEY,Authorization:'Bearer '+(token||KEY),'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw {status:503,message:'Serviço temporariamente indisponível.'};}
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw {status:r.status===429?429:400,message:r.status===429?'Muitas tentativas. Aguarde alguns minutos.':'Não foi possível concluir. Confira os dados e tente novamente.'};
  return data;
 }
 // False until database/platform_admin.sql has been applied.
 async function isPlatformAdmin(token){try{return (await upstream('/rest/v1/rpc/lv_is_platform_admin',{method:'POST',token,body:{}}))===true;}catch{return false;}}
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
    // Through memberships: the platform owner can read every organization, but "me" lists only their own.
    const rows=await upstream('/rest/v1/lv_memberships?select=role,lv_organizations(id,name,trial_ends_at,created_at)&user_id=eq.'+user.id,{token:authToken});
    const organizations=(rows||[]).map(r=>r.lv_organizations).filter(Boolean);
    send(res,200,{user:{id:user.id,email:user.email},organizations,platformAdmin:await isPlatformAdmin(authToken)});
   }else if(action==='admin'&&req.method==='GET'){
    if(!await isPlatformAdmin(authToken))throw {status:403,message:'Área exclusiva da LeadVox.'};
    const organizations=await upstream('/rest/v1/lv_organizations?select=id,name,trial_ends_at,created_at&order=created_at.desc&limit=500',{token:authToken});
    const workspaces=await upstream('/rest/v1/lv_workspace?select=organization_id,settings,updated_at&limit=500',{token:authToken});
    send(res,200,{organizations,workspaces});
   }else if(action==='motor'){
    const q=new URL(req.url,'https://localhost').searchParams;
    const org=req.method==='GET'?q.get('organization'):body.organization;
    if(!/^[0-9a-f-]{36}$/.test(org||''))throw {status:400,message:'Empresa inválida.'};
    const rpc=async(fn,args)=>upstream('/rest/v1/rpc/'+fn,{method:'POST',token:authToken,body:{org,...args}});
    const falha=(r,msg)=>{if(r&&r.ok===false)throw {status:400,message:motorErro(r,msg)};return r;};
    if(req.method==='GET'){
     const agente=q.get('agente');
     if(agente){if(!/^[a-z0-9-]{3,120}$/.test(agente))throw {status:400,message:'Agente inválido.'};const r=await rpc('lv_motor_agente',{agente});if(!r)throw {status:404,message:'Agente não encontrado.'};return send(res,200,r),true;}
     let st;try{st=await rpc('lv_motor_status',{});}catch{return send(res,200,{setupPending:true}),true;}
     return send(res,200,st),true;
    }
    const acao=body.acao;
    // Uses the LeadVox connection saved in Credenciais: tenant and session come from the token itself.
    const conectar=async()=>{
     let rows;try{rows=await upstream('/rest/v1/rpc/lv_chat_secret',{method:'POST',token:authToken,body:{org}});}catch{rows=[];}
     const c=rows?.[0];if(!c)return {ok:false,erro:'sem_credencial'};
     const p=jwtPayload(c.token);
     if(!Number.isInteger(p?.tenantId)||!Number.isInteger(p?.sessionId))return {ok:false,erro:'token_sem_sessao'};
     return rpc('lv_motor_conectar',{tenant:p.tenantId,sessao:p.sessionId,url:c.api_root+'/api/external/'+c.api_id+'/?token='+encodeURIComponent(c.token)});
    };
    try{
     if(acao==='vincular'){await rpc('lv_motor_vincular',{});const r=await conectar();if(r?.ok===false&&r.erro!=='sem_credencial')falha(r,'Conta criada, mas não deu para ligar a LeadVox.');}
     else if(acao==='conectar')falha(await conectar(),'Não deu para ligar a LeadVox ao motor.');
     else if(acao==='criar'){
      if(!/^[a-z]{2,30}$/.test(body.tipo||''))throw {status:400,message:'Escolha o tipo de agente.'};
      falha(await rpc('lv_motor_criar_agente',{tipo:body.tipo,config:{}}),'Não deu para criar o agente.');
     }else if(acao==='salvar'){
      if(!/^[a-z0-9-]{3,120}$/.test(body.agente||'')||!body.config||typeof body.config!=='object'||Array.isArray(body.config)||JSON.stringify(body.config).length>300000)throw {status:400,message:'Configuração inválida.'};
      const r=await rpc('lv_motor_salvar_agente',{agente:body.agente,config:body.config,versao_base:Number.isInteger(body.versaoBase)?body.versaoBase:null,concluir:body.concluir===true});
      falha(r,'Não deu para salvar o agente.');return send(res,200,r),true;
     }else if(acao==='ativo'){
      if(!/^[a-z0-9-]{3,120}$/.test(body.agente||''))throw {status:400,message:'Agente inválido.'};
      falha(await rpc('lv_motor_ativo',{agente:body.agente,ativo:body.ativo===true}),'Não deu para mudar o agente.');
     }else throw {status:400,message:'Ação inválida.'};
    }catch(e){if(e.status&&e.message)throw e;throw {status:400,message:'Não deu para concluir. Só o dono da empresa pode mexer na IA.'};}
    send(res,200,await rpc('lv_motor_status',{}));
   }else if(action==='estoque'){
    // Veículos do catálogo do motor: cadastro à mão (Estoque LeadVox) ou cópia do AutoCerto / Revenda Mais.
    const org=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('organization'):body.organization;
    if(!/^[0-9a-f-]{36}$/.test(org||''))throw {status:400,message:'Empresa inválida.'};
    const rpc=async(fn,args)=>upstream('/rest/v1/rpc/'+fn,{method:'POST',token:authToken,body:{org,...args}});
    if(req.method==='GET'){
     let r;try{r=await rpc('lv_motor_itens',{});}catch{return send(res,200,{setupPending:true}),true;}
     return send(res,200,r),true;
    }
    try{
     if(body.acao==='salvar'){
      const r=await rpc('lv_motor_item_salvar',{item:itemManual(body.item)});
      if(r?.ok===false)throw {status:400,message:{nome:'Informe o modelo do veículo.',limite_itens:'O estoque chegou ao limite de 2.000 veículos.'}[r.erro]||'Não deu para salvar o veículo.'};
     }else if(body.acao==='excluir'){
      if(!Number.isInteger(body.id)||body.id<1)throw {status:400,message:'Veículo inválido.'};
      await rpc('lv_motor_item_excluir',{item_id:body.id});
     }else if(body.acao==='sincronizar'){
      let s;try{s=(await upstream('/rest/v1/rpc/lv_integration_secret',{method:'POST',token:authToken,body:{org,prov:'estoque'}}))?.[0];}catch{s=null;}
      if(!s?.settings?.source)throw {status:400,message:'Escolha a fonte do estoque em Credenciais de API.'};
      const itens=await buscarEstoque({source:s.settings.source,settings:s.settings,secret:s.secret,fetchImpl});
      // lista vazia quase sempre é falha de leitura: não apaga o estoque que já está na IA
      if(!itens.length)throw {status:400,message:'A fonte devolveu o estoque vazio. Nada foi apagado; tente de novo daqui a pouco.'};
      const r=await rpc('lv_motor_estoque_importar',{fonte:s.settings.source,itens});
      const lista=await rpc('lv_motor_itens',{});
      return send(res,200,{...lista,sincronizado:r}),true;
     }else throw {status:400,message:'Ação inválida.'};
    }catch(e){if(e instanceof ConnectionError)throw {status:400,message:e.message};if(e.status&&e.message)throw e;throw {status:400,message:'Não deu para concluir. Só o dono da empresa pode mexer no estoque.'};}
    send(res,200,await rpc('lv_motor_itens',{}));
   }else if(action==='integrations'){
    const org=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('organization'):body.organization;
    if(!/^[0-9a-f-]{36}$/.test(org||''))throw {status:400,message:'Empresa inválida.'};
    if(req.method==='GET'){
     let rows;try{rows=await upstream('/rest/v1/rpc/lv_integrations',{method:'POST',token:authToken,body:{org}});}catch{return send(res,200,{setupPending:true}),true;}
     const out={};for(const r of rows||[])out[r.provider]={...(r.settings||{}),connected:true,hasSecret:!!r.has_secret,updatedAt:r.updated_at};
     return send(res,200,out),true;
    }
    const prov=body.provider;
    let stored=null;const salvo=async()=>{if(stored===null){try{stored=(await upstream('/rest/v1/rpc/lv_integration_secret',{method:'POST',token:authToken,body:{org,prov}}))?.[0]||{};}catch{stored={};}}return stored;};
    const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
    let conf,sec='';
    try{
     if(prov==='estoque'){
      const source=body.source;
      if(source==='autocerto'){
       const unidade=str(body.unidade,12),usuario=str(body.usuario,160);let senha=str(body.senha,500);
       if(!/^\d{1,12}$/.test(unidade))throw {status:400,message:'Informe o código de unidade do AutoCerto (só números).'};
       if(!usuario)throw {status:400,message:'Informe o usuário da API do AutoCerto.'};
       if(!senha){const s=await salvo();if(s.settings?.source==='autocerto'&&s.secret)senha=s.secret;else throw {status:400,message:'Informe a senha da API do AutoCerto.'};}
       await testAutoCerto({usuario,senha,fetchImpl});
       conf={source,unidade,usuario,testedAt:new Date().toISOString()};sec=senha;
      }else if(source==='revendamais'){
       let feed=str(body.feedUrl,2000);
       if(!feed){const s=await salvo();if(s.settings?.source==='revendamais'&&s.secret)feed=s.secret;else throw {status:400,message:'Cole a URL do feed JSON do Revenda Mais.'};}
       const t=await testRevendaMais({feedUrl:feed,fetchImpl});
       conf={source,feedHost:new URL(feed).hostname,vehicles:t.count,testedAt:new Date().toISOString()};sec=feed;
      }else if(source==='leadvox')conf={source};
      else throw {status:400,message:'Escolha de onde vem o estoque.'};
     }else if(prov==='asaas'){
      const environment=body.environment;let key=str(body.apiKey,500);
      if(!key){const s=await salvo();if(s.settings?.environment===environment&&s.secret)key=s.secret;else throw {status:400,message:'Cole a chave de API do Asaas.'};}
      await testAsaas({environment,apiKey:key,fetchImpl});
      conf={environment,testedAt:new Date().toISOString()};sec=key;
     }else throw {status:400,message:'Conexão inválida.'};
    }catch(e){if(e instanceof ConnectionError)throw {status:400,message:e.message};throw e;}
    try{await upstream('/rest/v1/rpc/lv_set_integration',{method:'POST',token:authToken,body:{org,prov,conf,sec},prefer:'return=minimal'});}
    catch{throw {status:400,message:'Não deu para salvar. Só o dono da empresa pode mudar as conexões.'};}
    send(res,200,{...conf,connected:true});
   }else if(action==='chat-credentials'||action==='chat'){
    const org=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('organization'):body.organization;
    if(!/^[0-9a-f-]{36}$/.test(org||''))throw {status:400,message:'Empresa inválida.'};
    if(action==='chat-credentials'&&req.method==='GET'){
     let rows;try{rows=await upstream('/rest/v1/rpc/lv_chat_status',{method:'POST',token:authToken,body:{org}});}catch{rows=null;}
     send(res,200,rows===null?{connected:false,setupPending:true}:{connected:!!rows[0],apiId:rows[0]?.api_id||null,updatedAt:rows[0]?.updated_at||null});
    }else if(action==='chat-credentials'&&req.method==='POST'){
     const problem=chatUrlProblem(body.url,body.token);
     if(problem)throw {status:400,message:{host:'A URL precisa ser da API da LeadVox (chatapi ou chat2api.leadvox.com.br).',path:'Faltou o ID da conta na URL: ela tem /api/external/ seguido de um código.',token:'Faltou o token: cole no campo Token ou deixe no fim da URL, depois de ?token=.'}[problem]};
     let parsed;try{parsed=parseChatUrl(body.url,body.token);}catch{throw {status:400,message:'Não entendi essa URL. Confira se copiou a URL inteira da API da LeadVox.'};}
     // Test before saving: a token the LeadVox rejects is never stored.
     try{await createChatClient({...parsed,fetchImpl}).users();}
     catch(e){throw e.code==='CHAT_UNAUTHORIZED'?{status:400,message:'A LeadVox não aceitou esse token. Confira a URL e tente de novo.'}:{status:502,message:'Não deu para falar com a LeadVox agora. Tente de novo em instantes.'};}
     try{await upstream('/rest/v1/rpc/lv_set_chat_credentials',{method:'POST',token:authToken,body:{org,root:parsed.root,api:parsed.apiId,tok:parsed.token},prefer:'return=minimal'});}
     catch{throw {status:400,message:'Não deu para salvar a conexão. Só o dono da empresa pode conectar.'};}
     send(res,200,{connected:true,apiId:parsed.apiId});
    }else if(action==='chat'&&req.method==='GET'){
     const kind=new URL(req.url,'https://localhost').searchParams.get('kind');
     const call={etiquetas:'tags',status:'pipelineSteps',usuarios:'users',departamentos:'departments',origens:'leadOrigins'}[kind];
     if(!call)throw {status:400,message:'Lista inválida.'};
     let rows;try{rows=await upstream('/rest/v1/rpc/lv_chat_secret',{method:'POST',token:authToken,body:{org}});}catch{rows=[];}
     if(!rows?.[0])throw {status:409,message:'Conecte sua LeadVox em Credenciais de API.'};
     let list;
     try{const c=createChatClient({root:rows[0].api_root,apiId:rows[0].api_id,token:rows[0].token,fetchImpl});list=call==='departments'||call==='leadOrigins'?await c[call]():pickList(await c[call]());}
     catch(e){throw e.code==='CHAT_UNAUTHORIZED'?{status:400,message:'A LeadVox recusou o token salvo. Conecte de novo em Credenciais de API.'}
      :e.code==='CHAT_DEPARTMENTS_UNAVAILABLE'?{status:502,message:'A LeadVox não devolveu os departamentos por esta conexão.'}
      :e.code==='CHAT_ORIGINS_UNAVAILABLE'?{status:502,message:'A LeadVox não devolveu as origens do lead por esta conexão.'}:{status:502,message:'Não deu para falar com a LeadVox agora. Tente de novo em instantes.'};}
     send(res,200,{items:normalizeItems(list)});
    }else throw {status:405,message:'Método não permitido.'};
   }else if(action==='organization'&&req.method==='POST'){
    if(typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>100)throw {status:400,message:'Informe o nome da empresa.'};
    // return=minimal: the read policy depends on the owner membership, which the AFTER INSERT trigger creates only after RETURNING is checked.
    await upstream('/rest/v1/lv_organizations',{method:'POST',token:authToken,body:{name:body.name.trim()},prefer:'return=minimal'});
    const organizations=await upstream('/rest/v1/lv_organizations?select=id,name,trial_ends_at,created_at&owner_id=eq.'+user.id,{token:authToken});
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
     let changes;try{changes=cleanSettings(body.settings);}catch{throw {status:400,message:'Configurações inválidas.'};}
     const existing=await upstream('/rest/v1/lv_workspace?select=organization_id,settings&organization_id=eq.'+org,{token:authToken});
     const settings={...(existing[0]?.settings||{}),...changes,timezone:'America/Sao_Paulo'};
     await upstream('/rest/v1/lv_workspace'+(existing.length?'?organization_id=eq.'+org:''),{method:existing.length?'PATCH':'POST',token:authToken,body:existing.length?{settings}:{organization_id:org,settings}});
     send(res,200,{ok:true});
    }
   }else send(res,404,{error:'Recurso não encontrado.'});
  }catch(e){send(res,e.status||500,{error:e.message||'Não foi possível concluir a solicitação.'});}
  return true;
 };
}

