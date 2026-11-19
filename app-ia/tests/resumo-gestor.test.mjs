import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const mod={exports:{}};vm.runInNewContext(readFileSync(new URL('../n8n/resumo-gestor.js',import.meta.url),'utf8'),{module:mod});
const {TROCAS,MARCA,aplicarResumoGestor}=mod.exports;
const de=(no,i)=>TROCAS[no][i][0], para=(no,i)=>TROCAS[no][i][1];
const s=v=>String(v??'').trim();
const linhas=b=>{const o={};String(b||'').split('\n').forEach(l=>{const i=l.indexOf(':');if(i>0)o[l.slice(0,i).trim()]=l.slice(i+1).trim();});return o;};
const semIA=(ctx)=>vm.runInNewContext(para('Ler Resposta',1)+'\n__resumoSemIA()',{s,linhas,g:{mensagem:'ok pode ser amanhã'},estado:{},bTransf:null,...ctx});

test('nota sem [RESUMO]: nunca a última mensagem do cliente; usa o que a IA coletou', () => {
 assert.match(de('Ler Resposta',0),/Cliente disse/);assert.doesNotMatch(para('Ler Resposta',0),/Cliente disse|__ultimaMsg/);
 const r=semIA({estado:{interesse:{nome:'Onix 2020'},coleta:{Pagamento:'financiado',Entrada:'10 mil',CPF:'não informado'}}});
 assert.equal(r,'Interesse: Onix 2020 · Pagamento: financiado · Entrada: 10 mil');
 assert.doesNotMatch(r,/amanhã/);
 const t=semIA({bTransf:'Setor: Vendas\nResumo: quer o Onix financiado\nEntrada: 10 mil\nOrientação: ligar hoje\nGestor: quente'});
 assert.equal(t,'quer o Onix financiado · Entrada: 10 mil · Próximo passo: ligar hoje');
 assert.match(semIA({}),/^Resumo: a IA ainda não tem dados/);
});

test('prompt: resumo obrigatório do atendimento inteiro, com próximo passo; [TRANSFERIR] ganha a linha Gestor', () => {
 assert.match(para('Montar Prompt',0),/OBRIGATÓRIO/);assert.match(para('Montar Prompt',0),/Próximo passo:/);assert.match(para('Montar Prompt',0),/nunca copie a mensagem do cliente/);
 assert.match(para('Montar Prompt',1),/'Gestor: /);
 assert.match(para('Ler Resposta',2),/'gestor'\]\.includes/);assert.match(para('Ler Resposta',2),/gestor: pegaT\('gestor'\)/);
 assert.match(para('Ler Resposta',3),/!\/\^gestor\$\/i\.test\(kk\)/,'a leitura do dono não vai para o plugin do vendedor');
});

const aviso=(ctx)=>vm.runInNewContext(para('Avisos Preparar',0)+'\ncorpo',{fmtTel:t=>'('+t.slice(2,4)+') '+t.slice(4),A:{nome:'Manu',contaNome:'Start Car'},humano:true,est:{nome:'Ana',interesse:{nome:'Onix 2020'}},...ctx});
test('aviso ao dono: resumo gerencial com quem está, interesse, pagamento, leitura e próximo passo', () => {
 const lr={transf:{resumo:'quer o Onix',gestor:'Quente: quer fechar esta semana',dados:{Pagamento:'financiado',Entrada:'10 mil',Troca:'Gol 2012',Visita:'sábado 10h',Orientação:'ligar hoje e mandar a simulação'}}};
 const c=aviso({$:()=>({first:()=>({json:lr})}),f:{tel:'5521999990000',transf:{setor:'Vendas',vendedor:{id:3,nome:'Carlos'}},nota:'🤖 *Manu* passou\n👤 Para: *Carlos* (rodízio do setor)\nTelefone: x\nResumo: quer o Onix\n🌙 Chegou fora do horário da equipe.'}});
 assert.equal(c,['📊 *Resumo para o gestor* · cliente passado para a equipe · Start Car','👤 Ana · (21) 999990000','📍 Com quem está: Carlos · Vendas','🚗 Interesse: Onix 2020','💳 financiado · entrada 10 mil · troca: Gol 2012','📅 Visita: sábado 10h','🌡️ Quente: quer fechar esta semana','➡️ Próximo passo: ligar hoje e mandar a simulação','🌙 Chegou fora do horário da equipe.','_Atendido pela IA Manu_'].join('\n'));
 const c2=aviso({$:()=>{throw new Error('x')},est:{},f:{tel:'5521999990000',transf:{setor:'Vendas'},nota:'🤖 x\n📝 Interesse: HB20 · Próximo passo: ligar'}});
 assert.match(c2,/📍 Com quem está: Vendas · ainda sem vendedor definido/);assert.match(c2,/🌡️ Interesse: HB20 · Próximo passo: ligar/);
 const c3=aviso({$:()=>({first:()=>({json:{}})}),f:{tel:'5521999990000',transf:{setor:'Vendas',autocerto:true},nota:''}});
 assert.match(c3,/Com quem está: AutoCerto/);
});

test('aplicar: troca cada trecho uma vez só e recusa fluxo já trocado ou mudado', () => {
 const wf={nodes:Object.entries(TROCAS).map(([name,t])=>({name,parameters:{jsCode:t.map(([d])=>d).join('\n//--\n')}}))};
 const o=aplicarResumoGestor(wf);
 for(const [name,t] of Object.entries(TROCAS)){const c=o.nodes.find(n=>n.name===name).parameters.jsCode;t.forEach(([,p])=>assert.ok(c.includes(p)));}
 assert.throws(()=>aplicarResumoGestor(o),/já aplicado/);
 assert.throws(()=>aplicarResumoGestor({nodes:wf.nodes.slice(1)}),/sem o nó/);
 assert.ok(MARCA);
});
