// Avaliações do Google da loja a partir do link do Google Maps que o lojista cola no painel (Site da loja).
// Usa a API do Google Places (New) com a chave da LeadVox (GOOGLE_PLACES_KEY): acha o lugar pelo link e devolve
// as avaliações de 4 e 5 estrelas com texto. O Google entrega até 5 avaliações por lugar (as que ele considera mais relevantes).
const HOSTS_OK=/^(www\.)?(google\.[a-z.]{2,8}|maps\.google\.[a-z.]{2,8}|maps\.app\.goo\.gl|goo\.gl|g\.page)$/i;
const API='https://places.googleapis.com/v1/';

// segue os redirecionamentos do link curto (maps.app.goo.gl → google.com/maps/place/...) sem sair dos endereços do Google
export async function abrirLink(link,{fetchImpl=fetch}={}){
 let u;try{u=new URL(String(link||'').trim());}catch{return null;}
 for(let i=0;i<6;i++){
  if(u.protocol!=='https:'||!HOSTS_OK.test(u.hostname))return null;
  if(!/goo\.gl$|g\.page$/i.test(u.hostname))return u;
  let r;try{r=await fetchImpl(u.href,{redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{return null;}
  const loc=r.headers.get('location');if(!loc)return u;
  try{u=new URL(loc,u);}catch{return null;}
 }
 return null;
}
// o que dá para tirar do endereço: id do lugar, nome e coordenadas
export function lerLink(u){
 if(!u)return null;
 const s=decodeURIComponent(u.href.replace(/\+/g,' '));
 const id=(s.match(/(ChIJ[A-Za-z0-9_-]{10,})/)||[])[1]||u.searchParams.get('query_place_id')||'';
 const nome=((u.pathname.match(/\/maps\/place\/([^/@]+)/)||[])[1]||u.searchParams.get('q')||u.searchParams.get('query')||'').replace(/\+/g,' ').trim();
 const c=s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)||s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
 return {id,nome:decodeURIComponent(nome).slice(0,200),lat:c?Number(c[1]):null,lng:c?Number(c[2]):null};
}

export async function avaliacoesDoGoogle(link,{chave,fetchImpl=fetch}={}){
 if(!chave)return {ok:false,erro:'chave'};
 const u=await abrirLink(link,{fetchImpl});
 if(!u)return {ok:false,erro:'link'};
 const l=lerLink(u);
 let id=l&&l.id;
 const h=mask=>({'X-Goog-Api-Key':chave,'X-Goog-FieldMask':mask,'Content-Type':'application/json'});
 if(!id){
  if(!l||!l.nome)return {ok:false,erro:'link'};
  const body={textQuery:l.nome,languageCode:'pt-BR',pageSize:1};
  if(l.lat!=null)body.locationBias={circle:{center:{latitude:l.lat,longitude:l.lng},radius:1000}};
  let r;try{r=await fetchImpl(API+'places:searchText',{method:'POST',headers:h('places.id,places.displayName'),body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
  catch{return {ok:false,erro:'google'};}
  const j=await r.json().catch(()=>null);
  if(!r.ok)return {ok:false,erro:r.status===403||r.status===401?'chave':'google'};
  id=j&&j.places&&j.places[0]&&j.places[0].id;
  if(!id)return {ok:false,erro:'lugar'};
 }
 let r;try{r=await fetchImpl(API+'places/'+encodeURIComponent(id)+'?languageCode=pt-BR',{headers:h('id,displayName,formattedAddress,rating,userRatingCount,reviews'),signal:AbortSignal.timeout(10000)});}
 catch{return {ok:false,erro:'google'};}
 const p=await r.json().catch(()=>null);
 if(!r.ok||!p)return {ok:false,erro:r.status===403||r.status===401?'chave':'google'};
 const avaliacoes=(Array.isArray(p.reviews)?p.reviews:[])
  .map(v=>({nome:String(((v.authorAttribution||{}).displayName)||'').trim().slice(0,60),
   texto:String(((v.originalText||v.text)||{}).text||'').replace(/\s+/g,' ').trim().slice(0,400),nota:Number(v.rating)||0,
   quando:String(v.relativePublishTimeDescription||'').slice(0,40)}))
  .filter(v=>v.nota>=4&&v.nome&&v.texto.length>=15)
  .sort((a,b)=>b.nota-a.nota||Math.min(b.texto.length,300)-Math.min(a.texto.length,300))
  .slice(0,3);
 return {ok:true,lugar:{nome:String((p.displayName||{}).text||'').slice(0,120),endereco:String(p.formattedAddress||'').slice(0,200),
  nota:Number(p.rating)||null,total:Number(p.userRatingCount)||0},avaliacoes};
}
