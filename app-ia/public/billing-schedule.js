export const cycles={WEEKLY:'Semanal',BIWEEKLY:'Quinzenal (14 dias)',MONTHLY:'Mensal'};
export function amountCents(value){const s=String(value??'').trim();if(!/^\d{1,7}([.,]\d{1,2})?$/.test(s))throw Error('Informe o valor sem separador de milhar, com até duas casas decimais.');const [whole,part='']=s.replace(',','.').split('.');const cents=Number(whole)*100+Number(part.padEnd(2,'0'));if(cents<100||cents>100000000)throw Error('Valor fora do intervalo permitido.');return cents;}
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Data inválida.');const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)throw Error('Data inválida.');return date;}
export function schedule(firstDate,cycle,count=6){
 if(!cycles[cycle]||!Number.isInteger(count)||count<1||count>24)throw Error('Recorrência inválida.');
 const first=validDate(firstDate),day=first.getUTCDate();
 return Array.from({length:count},(_,index)=>{let d=new Date(first);if(cycle==='MONTHLY'){d=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index,1,12));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()+index*(cycle==='WEEKLY'?7:14));return d.toISOString().slice(0,10);});
}

