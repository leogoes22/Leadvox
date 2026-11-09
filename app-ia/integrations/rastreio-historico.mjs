// Histórico do rastreamento de anúncios: lê os atendimentos da LeadVox (uma página por vez) e, em cada um,
// a primeira mensagem do cliente que veio de anúncio de clique para WhatsApp. Não grava nada: devolve os leads achados.
import {lerAnuncio,telefone} from '../supabase/functions/rastreio/rastreio.mjs';

export const STATUS_HISTORICO=['open','pending','closed'];
const lista=b=>Array.isArray(b)?b:Array.isArray(b?.tickets)?b.tickets:Array.isArray(b?.messages)?b.messages:Array.isArray(b?.data)?b.data:[];
const quando=x=>{const t=Date.parse(x?.createdAt||x?.msgCreatedAt||x?.updatedAt||'');return Number.isFinite(t)?t:null;};
// A lista vem pela última atualização: é ela que diz quando parar de ler páginas.
const mexido=x=>{const t=Date.parse(x?.updatedAt||x?.lastMessageAt||x?.createdAt||'');return Number.isFinite(t)?t:null;};

// Primeira mensagem do cliente com anúncio nesta página (a mais antiga, se houver mais de uma).
export function anuncioNasMensagens(msgs){
 let melhor=null;
 for(const m of msgs){
  if(!m||m.fromMe===true||!m.raw)continue;
  const a=lerAnuncio({message:{raw:m.raw}});
  if(!a)continue;
  const t=quando(m);
  if(!melhor||(t!==null&&(melhor.t===null||t<melhor.t)))melhor={...a,t};
 }
 return melhor;
}

// Uma página de atendimentos de um status. "desde" é o início da janela (ms); para quando a página só tem atendimento mais antigo.
export async function lerPaginaHistorico({cliente,status,pagina=1,desde,concorrencia=4}){
 if(!STATUS_HISTORICO.includes(status))throw new Error('status');
 const b=await cliente.tickets(status,pagina);
 const tickets=lista(b);
 const naJanela=tickets.filter(t=>t&&t.id!=null&&!t.isGroup&&!t.contact?.isGroup&&(quando(t)??0)>=desde);
 const leads=[];let erros=0;
 const fila=[...naJanela];
 async function trabalhador(){
  while(fila.length){
   const t=fila.shift();
   try{
    const p1=await cliente.messages(t.id,1);
    const msgs=lista(p1);
    let a=anuncioNasMensagens(msgs);
    // Conversa longa: a primeira mensagem pode estar na última página.
    if(!a&&p1?.hasMore&&msgs.length){
     const ultima=Math.min(50,Math.ceil(Number(p1.count||0)/msgs.length));
     if(ultima>1)a=anuncioNasMensagens(lista(await cliente.messages(t.id,ultima)));
    }
    if(a){
     const c=t.contact||{};
     leads.push({contato:Number(t.contactId??c.id)||null,telefone:telefone(c.number),nome:String(c.name||'').slice(0,80),
      anuncio:a.anuncio,titulo:a.titulo,link:a.link,clid:a.clid,midia:a.midia,quando:a.t?new Date(a.t).toISOString():null});
    }
   }catch{erros++;}
  }
 }
 await Promise.all(Array.from({length:Math.max(1,Math.min(concorrencia,naJanela.length||1))},trabalhador));
 const datas=tickets.map(mexido).filter(x=>x!==null);
 const temMais=!!(b?.hasMore??tickets.length)&&tickets.length>0&&(!datas.length||Math.min(...datas)>=desde);
 return {lidos:tickets.length,naJanela:naJanela.length,leads:leads.filter(l=>l.contato),erros,temMais};
}
