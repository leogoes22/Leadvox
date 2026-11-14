// Assistente "Monte sua IA": confere as respostas do painel, monta o pedido para o fluxo do n8n novo (iag-montar-ia)
// e limpa o que a IA devolveu antes de ir para a tela de revisão. Nada é gravado aqui: quem cria o agente é o painel,
// depois que o dono confere tudo.
export const TRABALHOS={vender:'sdr',agendar:'agendamento',orcamento:'catalogo',duvidas:'recepcao',suporte:'suporte'};
const PRECOS=['livre','a_partir','nao_fala'],TONS=['amigavel','profissional','descontraido'];
const t=(v,n)=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,n);
const hora=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):null;
const faixa=v=>Array.isArray(v)&&hora(v[0])&&hora(v[1])?[v[0],v[1]]:null;

// Respostas que vêm da tela. Erro com mensagem para o dono quando falta o essencial.
export function conferirRespostas(b){
 const r=b?.respostas||{},f=b?.fontes||{},e=b?.empresa||{};
 const vende=t(r.vende,400);
 if(vende.length<3)throw {status:400,message:'Conte em uma frase o que a sua empresa vende ou faz.'};
 if(!TRABALHOS[r.trabalho])throw {status:400,message:'Escolha o principal trabalho da IA.'};
 if(!PRECOS.includes(r.preco))throw {status:400,message:'Escolha se a IA pode falar preço.'};
 const nome=t(r.nome,30).replace(/[^\p{L}\p{N} .'-]/gu,'');
 if(!nome)throw {status:400,message:'Dê um nome para a sua IA.'};
 const h=r.horario||{};
 let site=t(f.site,200).replace(/\s/g,'');
 if(site&&!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(site))throw {status:400,message:'Confira o endereço do site (ex.: www.suaempresa.com.br).'};
 const insta=t(f.instagram,60).replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?#].*$/,'').replace(/^@/,'');
 if(insta&&!/^[A-Za-z0-9_.]{2,30}$/.test(insta))throw {status:400,message:'Confira o Instagram (só o @, sem o link).'};
 const mapa=t(f.mapa,400);
 if(mapa&&!/^https:\/\/\S+$/.test(mapa))throw {status:400,message:'O link do Google Maps precisa começar com https://.'};
 return {
  empresa:{nome:t(e.nome,80)||'a empresa',nicho:/^[a-z]{2,20}$/.test(e.nicho||'')?e.nicho:'outro'},
  respostas:{vende,trabalho:r.trabalho,tipo:TRABALHOS[r.trabalho],preco:r.preco,nome,tom:TONS.includes(r.tom)?r.tom:'amigavel',
   horario:{semana:faixa(h.semana),sabado:faixa(h.sabado),domingo:faixa(h.domingo)}},
  fontes:{site,instagram:insta?'@'+insta:'',mapa}
 };
}

// O que vai para o n8n: as respostas e o texto do site já cortado (a IA não precisa de mais que isso).
export function pedidoN8n(c,lido){
 const paginas=(lido?.paginas||[]).slice(0,4).map(p=>({url:t(p.url,300),titulo:t(p.titulo,120),texto:t(p.texto,6000)}));
 const id=lido?.identidade||{};
 return {empresa:c.empresa,respostas:c.respostas,instagram:c.fontes.instagram,mapa:c.fontes.mapa,
  site:{paginas,contatos:{endereco:t(id.endereco,160),telefone:t(id.telefone,20),whatsapp:t(id.whatsapp,20),email:t(id.email,120)}}};
}

const ORIGENS={site:'site',respostas:'respostas',resposta:'respostas',confira:'confira'};
// Limpa a resposta da IA: só os campos esperados, tamanhos máximos, listas curtas. O que vier fora disso some.
export function limparRascunho(d,c,lido){
 const o=d&&typeof d==='object'?(d.rascunho&&typeof d.rascunho==='object'?d.rascunho:d):{};
 const lista=(v,n)=>Array.isArray(v)?v.slice(0,n):[];
 const faq=lista(o.faq,14).map(x=>({p:t(x?.p??x?.pergunta,200),r:t(x?.r??x?.resposta,1000),origem:ORIGENS[x?.origem]||'confira',nota:t(x?.nota,200)}))
  .filter(x=>x.p.length>=4).map(x=>x.r?x:{...x,origem:'confira',nota:x.nota||'Escreva a resposta ou apague esta pergunta.'});
 const vistos=new Set(),coleta=[];
 for(const x of lista(o.coleta,8)){const nome=t(typeof x==='string'?x:x?.nome,60);const k=nome.toLowerCase();if(nome&&!vistos.has(k)){vistos.add(k);coleta.push({nome,obrigatorio:x?.obrigatorio===true});}}
 const id=lido?.identidade||{},contatos=[];
 if(id.endereco)contatos.push({tema:'Endereço',resposta:t(id.endereco,160),origem:'site'});
 if(id.telefone)contatos.push({tema:'Telefone',resposta:t(id.telefone,20),origem:'site'});
 if(id.email)contatos.push({tema:'E-mail',resposta:t(id.email,120),origem:'site'});
 if(c?.fontes?.mapa)contatos.push({tema:'Como chegar (Google Maps)',resposta:c.fontes.mapa,origem:'respostas'});
 return {
  apresentacao:t(o.apresentacao,400),
  empresa:{segmento:t(o.segmento,120),descricao:t(o.descricao,800),publico:t(o.publico,400),diferenciais:t(o.diferenciais,800)},
  faq,contatos,
  proibido:lista(o.proibido,10).map(x=>typeof x==='string'?t(x,300):'').filter(Boolean),
  coleta:coleta.slice(0,5),
  followup:lista(o.followup,2).map(x=>typeof x==='string'?t(x,500):'').filter(Boolean),
  transferencia:t(o.transferencia,400)
 };
}
