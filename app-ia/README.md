# LeadVox IA — aplicativo em homologação

Versão 0.1.0. Esta entrega é a base navegável do produto, com servidor HTTP, endpoint de saúde e implantação por contêiner. Todos os indicadores, conversas, veículos, integrações e cobranças são demonstrativos.

## Executar
Requer Node.js 24. Sem dependências externas:
```
npm start
npm test
```
Abrir http://127.0.0.1:4173. PORT e HOST são configuráveis.

## O que já funciona nesta prévia
Navegação responsiva; gráficos por período; busca e filtros; criação e edição de agentes/veículos; configuração de conhecimento; simulação de fontes de estoque; montagem de integração de site/plugin; cadastro e jornada de sete dias em demonstração; checkout ilustrativo sem cobrança; persistência apenas no navegador; exportação JSON de dados demonstrativos; limpeza de dados locais.

A simulação não escreve nos bancos ou workflows existentes, não solicita credenciais de integradores e não processa pagamento. O servidor só atende GET/HEAD e não oferece API de clientes. Dados demonstrativos ficam separados por versão de armazenamento no navegador; não inserir dados de clientes reais.

## Coolify / Hostinger
Usar um recurso novo de homologação, com este diretório como contexto de build e o Dockerfile fornecido. Porta interna 3000. Verificar /api/health antes de vincular o domínio. O compose inclui processo sem root, filesystem somente leitura, limite de memória e remoção de capabilities. Antes de produção, verificar e fixar o digest da imagem base.

## Integrações ainda necessárias
- Autenticação real, recuperação confiável, organizações e permissões no servidor.
- Backend de agentes e estoque com isolamento entre empresas.
- Workers AutoCerto/Revenda Mais e sincronização.
- ClickMass: instalação e permissões do plugin, transferência e pausa.
- Eventos reais e relatórios, com definição de cada indicador.
- Checkout e webhook autenticado do Asaas, idempotência e estados de assinatura.
- Teste de sete dias controlado pelo servidor e limites de uso.
- Backup externo e teste de restauração; monitoramento e teste de carga.

Não publicar como produto operacional. A prévia pode ser implantada em homologação com dados fictícios. A aparência e os valores de planos são exemplos a validar, não uma oferta comercial aprovada.
