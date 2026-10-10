/* ═══════════════════════════════════════════════════════════
   LEADVOX · TABELA DE PREÇOS CENTRAL
   Única fonte de preço do site. Altere aqui e vale para a home
   (calculadora "Monte seu plano") e para todas as páginas de segmento.

   Regra comercial:
   - O que vendemos é a ferramenta (CRM). Todo o resto é avulso.
   - Única condição: contratando o agente de IA, o CRM sai com 50% de desconto.
   - Adicionais aparecem sem preço: quem marcar algum vai para a reunião com o closer.
   ═══════════════════════════════════════════════════════════ */
(function(){
  var P = window.LV_PRECOS = {
    crm: 397.00,              // Ferramenta LeadVox (CRM), por mês
    descontoCrmComIA: 0.5,    // contratando a IA, o CRM sai com 50% de desconto
    ia: 459.97,               // IA SDR LeadVox Pro, por mês
    implIa: 750.00,           // implementação da IA (pagamento único, entra junto com a IA)
    implCrm: 500.00,          // implementação CRM personalizada (opcional, pagamento único)
    garantiaDias: 30,
    nomes: {
      crm: "Ferramenta LeadVox (CRM)",
      ia: "IA SDR LeadVox Pro",
      implIa: "Implementação da IA",
      implCrm: "Implementação CRM Personalizada"
    },
    desc: {
      crm: "Acesso ao sistema, com treinamento autônomo",
      ia: "Pré-atendimento e distribuição de leads 24h",
      implIa: "Configuração e treinamento do agente com os dados do seu negócio",
      implCrm: "Configuração completa da plataforma feita pela nossa equipe"
    },
    /* Adicionais: valores apresentados na reunião (tabela interna) */
    adicionais: [
      { k:"wa",      nome:"WhatsApp adicional",       desc:"Mais um número conectado à plataforma" },
      { k:"ig",      nome:"Instagram",                desc:"Direct na mesma caixa de atendimento" },
      { k:"fb",      nome:"Facebook",                 desc:"Messenger da sua página no mesmo atendimento" },
      { k:"wc",      nome:"Webchat",                  desc:"Chat do seu site integrado à plataforma" },
      { k:"em",      nome:"E-mail",                   desc:"Caixa de e-mail atendida na mesma plataforma" },
      { k:"voip",    nome:"Ligação VoIP",             desc:"Ligações feitas e recebidas pela plataforma" },
      { k:"estoque", nome:"Integrador de estoque",    desc:"Cadastro de veículos para quem não usa RevendaMais ou AutoCerto" },
      { k:"site",    nome:"Site completo",            desc:"Integrado ao estoque ou à sua agenda" },
      { k:"trafego", nome:"Gestão de tráfego pago",   desc:"Campanhas no Meta e no Google" },
      { k:"social",  nome:"Social media",             desc:"Criação de conteúdo com visitas mensais" },
      { k:"api",     nome:"API Oficial do WhatsApp",  desc:"Configuração e verificação" },
      { k:"bm",      nome:"Business Manager",         desc:"Criação e configuração da conta de anúncios" },
      { k:"outras",  nome:"Outras integrações",       desc:"Outro canal ou sistema que você precise conectar" }
    ]
  };
  P.crmComIA = Math.round(P.crm * (1 - P.descontoCrmComIA) * 100) / 100;
  P.mensalComIA = Math.round((P.crmComIA + P.ia) * 100) / 100;

  function brl(v){ return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
  P.brl = brl;

  /* ── Bloco "Quanto custa" das páginas de segmento: <div data-lv-precos></div> */
  var CSS = ''
    + '.lvp{max-width:1080px;margin:0 auto}'
    + '.lvp-h{text-align:center;margin-bottom:36px}'
    + '.lvp-h p{color:var(--muted,#6b7fa8);max-width:620px;margin:12px auto 0;line-height:1.6}'
    + '.lvp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}'
    + '.lvp-card{background:var(--card,rgba(255,255,255,.03));border:1px solid var(--border,rgba(255,255,255,.07));border-radius:14px;padding:24px;text-align:left}'
    + '.lvp-card.dest{border-color:var(--green,#2be87b);background:var(--gdim,rgba(43,232,123,.08))}'
    + '.lvp-card .k{font-size:.74rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#6b7fa8)}'
    + '.lvp-card.dest .k{color:var(--green,#2be87b)}'
    + '.lvp-card h3{font-size:1.08rem;margin:8px 0 4px}'
    + '.lvp-card .v{font-size:1.9rem;font-weight:800;margin:10px 0 2px}'
    + '.lvp-card .v small{font-size:.85rem;font-weight:500;color:var(--muted,#6b7fa8)}'
    + '.lvp-card .de{font-size:.88rem;color:var(--muted,#6b7fa8)}'
    + '.lvp-card ul{list-style:none;padding:0;margin:14px 0 0;font-size:.9rem;line-height:1.5}'
    + '.lvp-card li{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--border,rgba(255,255,255,.07))}'
    + '.lvp-card li span:last-child{white-space:nowrap;font-weight:600}'
    + '.lvp-add{margin-top:16px}'
    + '.lvp-add p{font-size:.9rem;color:var(--muted,#6b7fa8);margin:6px 0 12px;line-height:1.5}'
    + '.lvp-chips{display:flex;flex-wrap:wrap;gap:8px}'
    + '.lvp-chips span{font-size:.82rem;padding:6px 12px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.12))}'
    + '.lvp-cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:28px}'
    + '.lvp-out{display:inline-block;padding:13px 28px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,.18));color:var(--text,#e6edf8);text-decoration:none;font-weight:600}'
    + '.lvp-out:hover{border-color:var(--green,#2be87b);color:var(--green,#2be87b)}'
    + '.lvp-obs{text-align:center;font-size:.82rem;color:var(--muted,#6b7fa8);margin-top:14px}'
    + '@media(max-width:760px){.lvp-grid{grid-template-columns:1fr}.lvp-card .v{font-size:1.6rem}}';

  function render(el){
    if(!document.getElementById("lvp-css")){
      var st = document.createElement("style"); st.id = "lvp-css"; st.textContent = CSS; document.head.appendChild(st);
    }
    var whats = el.getAttribute("data-whats") || "5521981081044";
    var msg = el.getAttribute("data-msg") || "Olá! Vi os valores no site da LeadVox e quero conversar.";
    var chips = P.adicionais.map(function(a){ return "<span>" + a.nome + "</span>"; }).join("");
    el.innerHTML = ''
      + '<div class="lvp">'
      +   '<div class="lvp-h"><span class="tag">Quanto custa</span>'
      +     '<h2>Você contrata a ferramenta<br>e adiciona só o que precisar</h2>'
      +     '<p>A LeadVox cobra por item, sem pacote fechado. Tudo começa na ferramenta. Contratando o agente de IA, o CRM sai com 50% de desconto.</p></div>'
      +   '<div class="lvp-grid">'
      +     '<div class="lvp-card"><div class="k">Ferramenta</div><h3>' + P.nomes.crm + '</h3>'
      +       '<div class="v">' + brl(P.crm) + '<small>/mês</small></div>'
      +       '<div class="de">CRM com funil, atendimento no WhatsApp e equipe no mesmo número.</div>'
      +       '<ul><li><span>' + P.nomes.implCrm + ' (opcional)</span><span>' + brl(P.implCrm) + ' uma vez</span></li></ul></div>'
      +     '<div class="lvp-card dest"><div class="k">Ferramenta + agente de IA · CRM com 50% off</div><h3>CRM + ' + P.nomes.ia + '</h3>'
      +       '<div class="v">' + brl(P.mensalComIA) + '<small>/mês</small></div>'
      +       '<div class="de">IA que atende, qualifica e agenda 24h no seu WhatsApp.</div>'
      +       '<ul><li><span>' + P.nomes.crm + '</span><span><s style="opacity:.6;font-weight:400">' + brl(P.crm) + '</s> ' + brl(P.crmComIA) + '/mês</span></li>'
      +       '<li><span>' + P.nomes.ia + '</span><span>' + brl(P.ia) + '/mês</span></li>'
      +       '<li><span>' + P.nomes.implIa + '</span><span>' + brl(P.implIa) + ' uma vez</span></li></ul></div>'
      +   '</div>'
      +   '<div class="lvp-card lvp-add"><div class="k">Adicionais</div>'
      +     '<p>Canais, ligação, site, tráfego pago e outros serviços. Os valores são apresentados na reunião com nosso especialista, de acordo com o que a sua operação precisa.</p>'
      +     '<div class="lvp-chips">' + chips + '</div></div>'
      +   '<div class="lvp-cta"><a class="btn-primary" href="/#planos">Montar meu plano</a>'
      +     '<a class="lvp-out" href="https://wa.me/' + whats + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener noreferrer">Falar com um especialista</a></div>'
      +   '<p class="lvp-obs">Pré-pago · sem fidelidade · garantia de ' + P.garantiaDias + ' dias. O 1º pagamento soma a implementação à primeira mensalidade.</p>'
      + '</div>';
  }
  P.render = render;
  function iniciar(){ document.querySelectorAll("[data-lv-precos]").forEach(render); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
