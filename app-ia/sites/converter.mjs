// Converte o site original de uma loja (repositório no GitHub) no modelo fiel do painel.
// Mantém estrutura, efeitos e programação; troca só o que é da loja original por campos que o painel preenche.
// Uso: node sites/converter.mjs <modelo> <pasta do repositório>   (as regras de cada modelo ficam em sites/regras/<modelo>.mjs)
// Campos: {{h:x}} texto no HTML, {{j:x}} texto em string de programação, {{a:x}} endereço/atributo, {{u:x}} texto dentro de link
// (já codificado), {{n:x}} só números, {{bloco:x}} pedaço de HTML montado no servidor. Seções opcionais: <!--lv:se:x-->…<!--lv:fim:x-->.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const [nomeModelo,origem]=process.argv.slice(2);
if(!nomeModelo||!origem)throw Error('Uso: node sites/converter.mjs <modelo> <pasta do repositório>');
const aqui=path.dirname(fileURLToPath(import.meta.url));
const regras=(await import(pathToFileURL(path.join(aqui,'regras',nomeModelo+'.mjs')).href)).default;
const destino=path.join(aqui,nomeModelo);
mkdirSync(destino,{recursive:true});
const relatorio=[];

// troca exigindo achar (minimo vezes, padrão 1): se o site original mudar, o conversor avisa em vez de deixar sobra da loja
function trocar(h,de,para,minimo,nome){
 const n=typeof de==='string'?h.split(de).length-1:(h.match(new RegExp(de.source,de.flags.includes('g')?de.flags:de.flags+'g'))||[]).length;
 if(n<(minimo??1))throw Error((nome||String(de).slice(0,60))+': esperava achar '+(minimo??1)+', achei '+n);
 relatorio.push('  '+(nome||String(de).slice(0,50))+': '+n);
 if(typeof de==='string')return typeof para==='function'?h.split(de).map((p,i,l)=>i<l.length-1?p+para():p).join(''):h.split(de).join(para);
 return h.replace(new RegExp(de.source,de.flags.includes('g')?de.flags:de.flags+'g'),para);
}
// troca só se existir (partes que nem toda página tem)
const talvez=(h,de,para,nome)=>{try{return trocar(h,de,para,1,nome);}catch{return h;}};
// dentro e fora dos <script>, cada um com o seu escape
function porContexto(h,pares){
 return h.split(/(<script\b[\s\S]*?<\/script>)/).map((parte,i)=>{
  for(const [de,campo] of pares)parte=parte.split(de).join(i%2?'{{j:'+campo+'}}':'{{h:'+campo+'}}');
  return parte;
 }).join('');
}
// marca uma seção opcional (some quando a loja não tem o dado)
function secao(h,inicio,fimTag,nome){
 const a=h.indexOf(inicio);if(a<0)throw Error('seção '+nome+': início não achado');
 const b=h.indexOf(fimTag,a);if(b<0)throw Error('seção '+nome+': fim não achado');
 relatorio.push('  seção '+nome+': ok');
 return h.slice(0,a)+'<!--lv:se:'+nome+'-->'+h.slice(a,b+fimTag.length)+'<!--lv:fim:'+nome+'-->'+h.slice(b+fimTag.length);
}
// cor escrita com transparência (rgba da cor da marca) passa a seguir a variável do painel
function corVariavel(h,rgb,variavel){
 const [r,g,b]=rgb;
 return h.replace(new RegExp('rgba\\(\\s*'+r+'\\s*,\\s*'+g+'\\s*,\\s*'+b+'\\s*,\\s*([\\d.]+)\\s*\\)','g'),
  (m,a)=>'color-mix(in srgb,var(--'+variavel+') '+Math.round(parseFloat(a)*100)+'%,transparent)');
}
const util={trocar,talvez,porContexto,secao,corVariavel,relatorio};

for(const [arquivo,pagina] of Object.entries(regras.paginas)){
 let h=readFileSync(path.join(origem,arquivo),'utf8').replace(/\r\n/g,'\n');
 relatorio.push('### '+pagina);
 // camada de temas colada no site próprio: o servidor coloca de novo com a conta certa
 h=h.replace(/<!-- LeadVox: temas[^>]*-->\s*/g,'').replace(/<script src="https:\/\/ia\.leadvox\.com\.br\/site\/tema\.js"[^>]*><\/script>\s*/g,'');
 if(regras.antes)h=regras.antes(h,pagina,util);
 // logos e ícones embutidos (PNG/JPG/WEBP): logo da loja
 h=talvez(h,/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/g,'{{a:logo}}','logos embutidas');
 h=h.replace(/<link rel="icon" type="image\/[a-z+]+" href=/g,'<link rel="icon" href=');
 h=regras.passos(h,pagina,util);
 // nada da loja original pode sobrar
 for(const re of regras.proibido||[]){const m=h.match(re);if(m)throw Error(pagina+': ainda tem '+re+' → …'+h.slice(Math.max(0,m.index-80),m.index+80).replace(/\s+/g,' ')+'…');}
 writeFileSync(path.join(destino,pagina),h);
}
console.log(relatorio.join('\n'));
