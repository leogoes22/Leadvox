// Server-only: busca o estoque na fonte da empresa e converte cada veículo para um item do catálogo do Motor IA.
// Mesma leitura de campos do Motor SDR no n8n (nós "Formatar Estoque" e "Normalizar Revenda Mais").
import {ConnectionError,safeFeedUrl} from './connections.mjs';
const timeout=()=>AbortSignal.timeout(20000);
const txt=(v,max=120)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v??'').replace(/[^\d.,-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?n:0;};
const sem=s=>txt(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
const urlFoto=u=>{const s=String(u??'').trim();return /^https:\/\/[^\s"<>]{3,1500}$/.test(s)?s:null;};

// Um veículo no formato comum → item do catálogo (nome que a IA fala, descrição curta e atributos para a busca).
export function itemDeVeiculo(v){
 const marca=txt(v.marca,40),modelo=txt(v.modelo,80),versao=txt(v.versao,80);
 const mN=sem(modelo),vN=sem(versao);
 const nomeModelo=!versao||vN===mN||mN.includes(vN)?modelo:vN.includes(mN)?versao:(modelo+' '+versao).trim();
 const anoFab=txt(v.anoFab,4),anoMod=txt(v.anoMod,4),ano=anoFab&&anoMod&&anoFab!==anoMod?anoFab+'/'+anoMod:(anoMod||anoFab);
 const km=Math.round(num(v.km)),preco=num(v.preco);
 const atributos={marca,modelo,versao,ano,km:km>0?km:null,cor:txt(v.cor,30),cambio:txt(v.cambio,30),combustivel:txt(v.combustivel,30),tipo:v.tipo==='moto'?'moto':'carro'};
 Object.keys(atributos).forEach(k=>{if(atributos[k]===''||atributos[k]===null)delete atributos[k];});
 const descricao=[atributos.cor&&'Cor '+atributos.cor.toLowerCase(),km>0&&km.toLocaleString('pt-BR')+' km',atributos.cambio&&'câmbio '+atributos.cambio.toLowerCase(),
  atributos.combustivel&&atributos.combustivel.toLowerCase(),txt(v.obs,1500)].filter(Boolean).join(' · ');
 return {codigo:txt(v.codigo,36),nome:[marca,nomeModelo,ano].filter(Boolean).join(' ').slice(0,160),categoria:txt(v.categoria,80)||(v.tipo==='moto'?'Moto':''),
  descricao:descricao.slice(0,4000),preco:preco>0?preco:null,atributos,fotos:(Array.isArray(v.fotos)?v.fotos:[]).map(urlFoto).filter(Boolean).slice(0,10)};
}

// AutoCerto: login OAuth (grant_type=password) e ObterEstoque da unidade.
export function deAutoCerto(r){
 const fotos=(r.Fotos||r.fotos||r.Imagens||[]).slice().sort((a,b)=>(a?.Posicao||0)-(b?.Posicao||0)).map(f=>f?.URL||f?.Url||f?.url);
 const tipo=sem(r.TipoVeiculo||r.Tipo);
 return itemDeVeiculo({codigo:r.Codigo,marca:r.Marca,modelo:r.Modelo,versao:r.Versao,cor:r.Cor,anoFab:r.AnoFabricacao,anoMod:r.AnoModelo,km:r.Km??r.Quilometragem,
  preco:r.Preco||r.PrecoClassificados,cambio:r.Cambio,combustivel:r.Combustivel,categoria:r.Categoria,tipo:tipo.includes('MOTO')?'moto':'carro',obs:r.Observacao,fotos});
}
// Revenda Mais: feed JSON do "app da loja".
export function deRevendaMais(v){
 const preco=num(v.price),promo=num(v.promotion_price),cat=sem(v.category);
 return itemDeVeiculo({codigo:v.vehicle_id??v.id,marca:v.make,modelo:v.model||v.base_model||v.title,versao:v.version,cor:v.color,anoFab:v.fabric_year,anoMod:v.year,km:v.mileage,
  preco:promo>0&&(!preco||promo<preco)?promo:preco,cambio:v.transmission,combustivel:v.fuel,categoria:v.body_type,tipo:/MOTO|CICLOMOTOR/.test(cat)?'moto':'carro',
  fotos:Array.isArray(v.images)&&v.images.length?v.images:v.images_large});
}
const lista=d=>Array.isArray(d)?d:d&&typeof d==='object'?(d.vehicles||d.veiculos||d.Veiculos||d.data||Object.values(d).find(Array.isArray)||[]):[];

export async function buscarEstoque({source,settings={},secret,fetchImpl=fetch}){
 if(source==='autocerto'){
  let r;try{r=await fetchImpl('https://integracao.autocerto.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
   body:new URLSearchParams({grant_type:'password',username:String(settings.usuario||''),password:String(secret||'')}).toString(),redirect:'error',signal:timeout()});}
  catch{throw new ConnectionError('Não deu para falar com o AutoCerto agora. Tente de novo em instantes.');}
  const tok=(await r.json().catch(()=>null))?.access_token;
  if(!r.ok||!tok)throw new ConnectionError('O AutoCerto não aceitou o usuário e a senha salvos. Confira em Credenciais de API.');
  let e;try{e=await fetchImpl('https://integracao.autocerto.com/api/Veiculo/ObterEstoque?CodigoUnidade='+encodeURIComponent(String(settings.unidade||'')),
   {headers:{Authorization:'Bearer '+tok,Accept:'application/json'},redirect:'error',signal:timeout()});}
  catch{throw new ConnectionError('Não deu para ler o estoque no AutoCerto agora.');}
  if(!e.ok)throw new ConnectionError('O AutoCerto não devolveu o estoque dessa unidade.');
  return lista(await e.json().catch(()=>null)).filter(x=>x&&(x.Modelo||x.Marca)).map(deAutoCerto).filter(i=>i.codigo&&i.nome);
 }
 if(source==='revendamais'){
  const u=safeFeedUrl(secret);
  let r;try{r=await fetchImpl(u.href,{headers:{Accept:'application/json'},redirect:'error',signal:timeout()});}
  catch{throw new ConnectionError('Não deu para abrir o feed do Revenda Mais.');}
  if(!r.ok)throw new ConnectionError('O feed do Revenda Mais respondeu com erro.');
  return lista(await r.json().catch(()=>null)).filter(x=>x&&(x.model||x.make||x.title)).map(deRevendaMais).filter(i=>i.codigo&&i.nome);
 }
 throw new ConnectionError('Esta empresa usa o Estoque LeadVox: os veículos são cadastrados aqui no painel.');
}

// Produto ou serviço cadastrado à mão no painel (segmentos que não são de veículos): nome, grupo, preço, unidade e fotos.
export const UNIDADES=['un.','kg','g','L','m','m²','cx.','pct.','par','kit','serviço','hora','sessão','consulta','diária','pacote','mês','ano'];
export function itemProduto(b){
 if(!b||typeof b!=='object')throw new ConnectionError('Item inválido.');
 const nome=txt(b.nome,160);
 if(!nome)throw new ConnectionError('Informe o nome do item.');
 const preco=num(b.preco),id=Number(b.id),tipo=b.tipo==='servico'?'servico':'produto';
 return {codigo:'',id:Number.isInteger(id)&&id>0?id:undefined,nome,categoria:txt(b.categoria,80),descricao:txt(b.descricao,1500),preco:preco>0?preco:null,
  atributos:{tipo,unidade:UNIDADES.includes(b.unidade)?b.unidade:(tipo==='servico'?'serviço':'un.')},
  fotos:String(b.fotos??'').split(/[\s,]+/).map(urlFoto).filter(Boolean).slice(0,10),
  status:['disponivel','indisponivel'].includes(b.status)?b.status:'disponivel'};
}

// Veículo cadastrado à mão no painel.
export function itemManual(b){
 if(!b||typeof b!=='object')throw new ConnectionError('Veículo inválido.');
 const [af,am]=String(b.ano??'').split('/').map(x=>x.replace(/\D/g,''));
 const item=itemDeVeiculo({marca:b.marca,modelo:b.modelo,versao:b.versao,anoFab:am?af:'',anoMod:am||af,km:b.km,cor:b.cor,cambio:b.cambio,combustivel:b.combustivel,
  preco:b.preco,categoria:b.categoria,tipo:b.tipo,obs:b.obs,fotos:String(b.fotos??'').split(/[\s,]+/)});
 if(!item.atributos.modelo)throw new ConnectionError('Informe pelo menos o modelo do veículo.');
 const id=Number(b.id);
 return {...item,codigo:'',id:Number.isInteger(id)&&id>0?id:undefined,status:['disponivel','reservado','indisponivel'].includes(b.status)?b.status:'disponivel',
  atributos:{...item.atributos,obs:txt(b.obs,1500)||undefined}};
}
