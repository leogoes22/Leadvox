export const cycles={WEEKLY:'Semanal',BIWEEKLY:'Quinzenal (14 dias)',MONTHLY:'Mensal'};
export function amountCents(value){const s=String(value??'').trim();if(!/^\d{1,7}([.,]\d{1,2})?$/.test(s))throw Error('Informe o valor sem separador de milhar, com até duas casas decimais.');const [whole,part='']=s.replace(',','.').split('.');const cents=Number(whole)*100+Number(part.padEnd(2,'0'));if(cents<100||cents>100000000)throw Error('Valor fora do intervalo permitido.');return cents;}
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Data inválida.');const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)throw Error('Data inválida.');return date;}
export function schedule(firstDate,cycle,count=6){
 if(!cycles[cycle]||!Number.isInteger(count)||count<1||count>24)throw Error('Recorrência inválida.');
 const first=validDate(firstDate),day=first.getUTCDate();
 return Array.from({length:count},(_,index)=>{let d=new Date(first);if(cycle==='MONTHLY'){d=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index,1,12));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()+index*(cycle==='WEEKLY'?7:14));return d.toISOString().slice(0,10);});
}
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x||'');
export function validateBilling(kind,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Dados inválidos.');
 const text=(key,max,required=false)=>{const v=String(input[key]??'').trim();if(v.length>max||(required&&v.length<2))throw Error('Confira o campo '+key+'.');return v;};
 if(kind==='customers'){const email=text('email',254);if(email&&!/^\S+@\S+\.\S+$/.test(email))throw Error('E-mail inválido.');return {name:text('name',120,true),email,phone:text('phone',30)};}
 if(kind==='plans'){if(!cycles[input.cycle])throw Error('Selecione a periodicidade.');return {name:text('name',100,true),amount_cents:amountCents(input.amount),cycle:input.cycle};}
 if(kind==='contracts'){if(!uuid(input.customer_id)||!uuid(input.plan_id))throw Error('Selecione cliente e plano.');if(!cycles[input.cycle])throw Error('Recorrência inválida.');validDate(input.first_due_date);const reminder_days=[...new Set(String(input.reminder_days??'-3,0,3').split(',').map(x=>Number(x.trim())))];const allowed=[-30,-15,-7,-5,-3,-2,-1,0,1,2,3,5,7,10,15,30];if(reminder_days.length>10||reminder_days.some(x=>!Number.isInteger(x)||!allowed.includes(x)))throw Error('Dias de lembrete inválidos.');if(input.status&&!['draft','paused'].includes(input.status))throw Error('A emissão real ainda não está habilitada.');return {customer_id:input.customer_id,plan_id:input.plan_id,amount_cents:amountCents(input.amount),cycle:input.cycle,first_due_date:input.first_due_date,reminder_days,status:input.status||'draft'};}
 if(kind==='rules'){if(!['issued','paid','overdue','negotiation'].includes(input.event)||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.target_step_id||''))throw Error('Confira evento e ID da etapa.');const responsible_id=text('responsible_id',100);if(responsible_id&&!/^[a-zA-Z0-9_-]+$/.test(responsible_id))throw Error('ID do responsável inválido.');return {event:input.event,target_step_id:input.target_step_id,responsible_id,enabled:false};}
 throw Error('Recurso inválido.');
}
export async function handleBilling({req,body,user,authToken,upstream,send,res}){
 const url=new URL(req.url,'https://localhost');
 const org=req.method==='GET'?url.searchParams.get('organization'):body.organization;
 if(!uuid(org))throw {status:400,message:'Empresa inválida.'};
 const memberships=await upstream('/rest/v1/lv_memberships?select=role&organization_id=eq.'+org+'&user_id=eq.'+user.id,{token:authToken});
 if(!memberships?.length)throw {status:403,message:'Você não tem acesso a esta empresa.'};
 if(req.method==='GET'){
  const result={};for(const kind of ['customers','plans','contracts','rules','payments'])result[kind]=await upstream('/rest/v1/lv_billing_'+kind+'?select=*&organization_id=eq.'+org+'&order=id&limit=500',{token:authToken});
  send(res,200,{...result,providerConnected:false,automationEnabled:false,limit:500});return;
 }
 if(!['owner','admin'].includes(memberships[0].role))throw {status:403,message:'Seu perfil não pode editar o financeiro.'};
 let data;try{data=validateBilling(body.kind,body.data);}catch(e){throw {status:400,message:e.message};}
 const kind=body.kind;
 const recordId=body.id;
 if(recordId&&!uuid(recordId))throw {status:400,message:'Registro inválido.'};
 // Composite foreign keys + RLS reject references to another organization.
 const route='/rest/v1/lv_billing_'+kind+(recordId?'?organization_id=eq.'+org+'&id=eq.'+recordId:'');
 const rows=await upstream(route,{method:recordId?'PATCH':'POST',token:authToken,body:recordId?data:{organization_id:org,...data}});
 if(recordId&&!rows?.length)throw {status:404,message:'Registro não encontrado nesta empresa.'};
 send(res,recordId?200:201,{rows,automationEnabled:false});
}

