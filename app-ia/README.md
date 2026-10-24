# LeadVox IA — painel único (homologação)

Versão 0.2.0. Um só endereço para o lojista: login da conta, empresa, os painéis de IA que já funcionam e o financeiro dos clientes.

## Identidade visual
Mesma de leadvox.com.br/agente-ia.html e /sdr/: fundo #070d1c, cartões #0e1730, linhas #1f2b4a, verde #2be87b, títulos em Syne e texto em DM Sans, abas em pílula. Tokens e componentes em `public/lv.css`. Não usar tema claro.

## O que tem no painel (`public/index.html` + `public/painel.js`)
- **Entrada**: login, criar conta, código por e-mail, esqueci a senha e nova senha (Supabase Auth via `account-api.mjs`, sessão em cookie HttpOnly).
- **Início**: resumo da empresa e atalhos para os módulos.
- **Agentes de IA** e **SDR automotivo**: abrem os painéis reais de leadvox.com.br dentro do app. Por enquanto cada um ainda pede o próprio login (n8n).
- **Clientes e cobranças**: clientes, planos, recorrências, regras do funil e previsão de vencimentos, salvos por empresa (`billing.mjs`). Tudo em rascunho: não emite boleto, não manda mensagem, não move lead.
- **Empresa**: nome de exibição, outra empresa na mesma conta, troca de senha.

`conta.html` e `cobrancas.html` só redirecionam para o painel.

## Executar
Node.js 24, sem dependências: `npm start` e `npm test`. Padrão http://127.0.0.1:4173. O login só funciona por HTTPS.

## Coolify / Hostinger
Contexto de build = esta pasta, Dockerfile incluído, porta interna 3000. Conferir /api/health. O proxy deve sobrescrever X-Forwarded-Proto.

## Próximos passos
1. Entrega do código por e-mail (SMTP próprio no Supabase) e a jornada completa de login com contato@leadvox.com.br.
2. Entrar nos Agentes e no SDR com a mesma conta: o servidor guarda o vínculo empresa ↔ conta do n8n e fala com os webhooks, sem segundo login.
3. Regras do funil escolhendo etapas e usuários reais da LeadVox pelo nome.
4. Asaas sandbox: emissão idempotente, eventos autenticados e reconciliação.
