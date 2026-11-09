# LeadVox IA — painel único

Versão 1.0.0 (produção). Um só endereço para o lojista: login da conta, empresa, os painéis de IA que já funcionam e o financeiro dos clientes.

## Identidade visual
Mesma de leadvox.com.br/agente-ia.html e /sdr/: fundo #070d1c, cartões #0e1730, linhas #1f2b4a, verde #2be87b, títulos em Syne e texto em DM Sans, abas em pílula. Tokens e componentes em `public/lv.css`. Não usar tema claro.

## O que tem no painel (`public/index.html` + `public/painel.js`)
- **Entrada**: login, criar conta, código por e-mail, esqueci a senha e nova senha (Supabase Auth via `account-api.mjs`, sessão em cookie HttpOnly).
- **Início**: resumo da empresa e atalhos para os módulos.
- **Agentes de IA** e **SDR automotivo**: abrem os painéis reais de leadvox.com.br dentro do app. Por enquanto cada um ainda pede o próprio login (n8n).
- **Clientes e cobranças**: clientes, planos, recorrências, regras do funil e previsão de vencimentos, salvos por empresa (`billing.mjs`). Tudo em rascunho: não emite boleto, não manda mensagem, não move lead.
- **Empresa**: nome de exibição, outra empresa na mesma conta, troca de senha.

`conta.html` e `cobrancas.html` só redirecionam para o painel.

## Rastreamento de anúncios (módulo extra)
Liga o lead que chegou por anúncio de clique para WhatsApp à venda e avisa a Meta (lead qualificado e compra com o valor no Ganho).
- **Liberar para um cliente:** Painel LeadVox → Gerenciar a empresa → chave "Rastreamento de anúncios". Sem a chave, o cliente vê o convite para contratar.
- **O cliente configura sozinho** (menu Rastreamento de anúncios): cria na LeadVox uma API só para o rastreamento com o webhook mostrado na tela (eventos de mensagens e de oportunidades), cola o ID do pixel e o token da API de Conversões (Gerenciador de Eventos), escolhe as etapas de "lead qualificado" e liga.
- **Peças:** `database/rastreio.sql` (rodar parte por parte), função `supabase/functions/rastreio` (publicar com verify_jwt desligado, `rastreio.mjs` + `index.ts`), rotas `rastreio`, `rastreio-relatorio`, `rastreio-teste` e `admin-rastreio` em `account-api.mjs`.
- **Como avisa a Meta:** modo padrão pelo pixel (action_source `chat`, telefone em SHA-256). O modo "WhatsApp oficial" (business_messaging com o código do clique) só funciona com um app da Meta com `whatsapp_business_manage_events` aprovado.
- O telefone do cliente fica só no banco da empresa (ele já tem o número na LeadVox); para a Meta vai só o SHA-256. Um envio por card e por tipo.
- **Conta de anúncio e campanha:** o WhatsApp só traz o id e o título do anúncio. Ao abrir os Resultados, o painel busca na Meta a conta, a campanha e o conjunto de cada anúncio novo (token de leitura `ads_read` de um usuário do sistema, provedor `meta_ads`; sem ele tenta o token da API de Conversões) e guarda em `rastreio_anuncios`. Os Resultados filtram por conta (ex.: Carros e Motos). Rodar `database/rastreio_contas.sql`.
- **Super Admin:** Painel LeadVox → card "Rastreamento de anúncios" com cada cliente do módulo, contas, leads, vendas e a mensalidade pela tabela (R$ 99 + R$ 39 por conta a mais).
- **Sem histórico:** o rastreamento conta a partir do dia em que é ligado. A LeadVox não guarda nas mensagens de qual anúncio o cliente veio, e ler `/messages/{ticketId}` marca a conversa como lida (e pode mandar o "visto" ao cliente). Não ler conversas da LeadVox em massa.

## Site da loja: temas e campanha (lojas de veículos)

- **O que faz:** um código colado uma vez no site da loja (`<script src="https://ia.leadvox.com.br/site/tema.js" data-loja="CONTA" defer></script>`) liga temas de datas (Natal, Ano Novo, Carnaval, Dia das Mães, Dia dos Pais, Dia do Cliente, Black Friday) e uma campanha em pop-up. Tudo fica numa shadow root: não muda o estilo do site.
- **O lojista configura** no menu Site da loja (só nicho automotivo e Super Admin): tema agora, agenda do ano (botão "Sugerir as datas do ano"), música (só toca com clique; melodias de domínio público geradas no navegador) e campanha com arte (JPG/PNG em lv-materiais, pasta da conta).
- **Prévia sem ligar nada:** abrir o site com `?lv_tema=natal` (ou outro tema, ou `nenhum`) e `?lv_campanha=1`.
- **Modelos e identidade:** no mesmo menu, o lojista escolhe o modelo (os 5 prontos: Garagem, Premium, Neon, Claro e Editorial), sobe a logo (o painel sugere as cores a partir dela), escolhe cores, fonte, textos e contatos e publica. O site abre em `/s/<conta>/` (`public/site/loja.html` + `motor.js` + `modelos/<id>.css`), com o estoque do menu Estoque. Prévia com loja de exemplo: `/s/demo/?modelo=garagem`. Banco: `database/site_modelos.sql`.
- **Peças:** `database/site_temas.sql`, rotas `/api/site/tema` (pública, CORS aberto, 60 s de memória) e `/api/account/site-temas`, `public/site/tema.js`, `tests/site-temas.test.mjs`.

## Executar
Node.js 24, sem dependências: `npm start` e `npm test`. Padrão http://127.0.0.1:4173. O login só funciona por HTTPS.

## Coolify / Hostinger
Contexto de build = esta pasta, Dockerfile incluído, porta interna 3000. Conferir /api/health. O proxy deve sobrescrever X-Forwarded-Proto.

Deploy automático: todo push na `main` avisa o Coolify pelo webhook do GitHub, e o Coolify monta e publica sozinho. A montagem roda `npm test` antes; se algum teste falhar, a versão nova não entra no ar e o painel segue na anterior. O GitHub Actions ("Testes LeadVox IA") roda os mesmos testes e confere a montagem a cada mudança. SQL novo em `database/` termina anotando o arquivo em `leadvox_private.sql_aplicado` (ver `controle.sql`).

## Próximos passos
1. Entrega do código por e-mail (SMTP próprio no Supabase) e a jornada completa de login com contato@leadvox.com.br.
2. Entrar nos Agentes e no SDR com a mesma conta: o servidor guarda o vínculo empresa ↔ conta do n8n e fala com os webhooks, sem segundo login.
3. Regras do funil escolhendo etapas e usuários reais da LeadVox pelo nome.
4. Asaas sandbox: emissão idempotente, eventos autenticados e reconciliação.
