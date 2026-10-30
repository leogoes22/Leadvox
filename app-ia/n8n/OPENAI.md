# OpenAI por empresa

Implementado no painel, banco e proxy. Não altera n8n antigo nem substitui a chave global existente.

## Implantação

1. Aplicar `database/openai.sql` e executar `tests/openai-database.sql` (rollback no final).
2. Publicar `supabase/functions/openai-proxy/index.ts` com `proxy.mjs`, `verify_jwt=false`.
   A própria função exige bearer `lvai_…`, com 256 bits aleatórios, hash no banco, validade de 10 min e 16 chamadas.
   Emissão e resgate são RPCs exclusivas de service_role. A chave real fica no Vault e só o proxy a lê.
3. Criar uma NOVA credencial OpenAI no n8n novo, sem modificar `OpenAI LeadVox`:
   - Nome: `OpenAI por empresa (proxy)`.
   - API Key em modo Expression: `{{ $('OpenAI da Empresa').first().json.token }}`.
   - Base URL: `https://dcucemuewipfnneqpgxk.supabase.co/functions/v1/openai-proxy/v1`.
   - Organization ID vazio, sem cabeçalhos globais, sem chave real.
   O teste de credencial fora de uma execução não tem um grant e deve falhar fechado.
4. Exportar os fluxos atuais de Atendimento e Simulador do n8n novo e converter com
   `comOpenAIPropria(export, {credentialId, homologacao:true})` em `openai-por-empresa.mjs`.
   Importar como CÓPIAS DESLIGADAS, sem substituir as versões publicadas.
   A cópia tem webhook separado e envios externos bloqueados. Usa os dados do motor existente:
   testar somente uma empresa/contato de homologação isolados, pois Redis e estado ainda são compartilhados.
5. Cadastrar chave da empresa pelo painel. O teste lê `/v1/models`, sem gerar tokens;
   saldo e permissões de geração só se comprovam com chamada real.
6. Testar conversa, ferramentas, imagem, áudio de entrada/saída, chave recusada e duas empresas isoladas.
   Só então preparar conversão sem `homologacao` e conectar o roteamento dos novos clientes.
   Redis não deve conter chave OpenAI ou grant; execuções, erros, progresso e manuais ficam sem persistência.

## Consumo

Cada chamada é reservada no banco antes de sair para OpenAI (sem reserva, não há gasto).
O registro contém empresa, agente, teste, horário de Brasília, operação, modelo, status e unidades.
Não armazena prompt, resposta, arquivo, telefone ou credencial.
Ferramentas e tentativas do SDK contam como chamadas próprias. Retentativas de gravação não duplicam o registro.
Se a medição final falhar, a chamada permanece pendente; custo ausente não é apresentado como zero confirmado.
O painel mostra somente o consumo iniciado depois da ativação deste motor, não todo o uso da organização OpenAI.

Tarifas standard verificadas em 30/10/2026 nas páginas oficiais de GPT-4.1 Mini, GPT-4.1, GPT-4o Mini e Whisper:
https://developers.openai.com/api/docs/models/gpt-4.1-mini
https://developers.openai.com/api/docs/models/gpt-4.1
https://developers.openai.com/api/docs/models/gpt-4o-mini
https://developers.openai.com/api/docs/models/whisper-1
Cada registro conserva a versão da tarifa. Atualizar `proxy.mjs` quando houver mudança.
Voz binária (gpt-4o-mini-tts) não informa tokens: registrar caracteres e mostrar custo não medido.
Estimativas em USD excluem impostos, câmbio, descontos e uso fora da LeadVox.

## Reversão

Manter as cópias de homologação desligadas e a branch anterior implantada preserva toda a operação atual.
O banco é aditivo e o proxy não é chamado pelos fluxos antigos. Não apagar dados/segredos na reversão.
Não ativar fallback para chave LeadVox: uma falha de chave deve parar o uso daquela empresa.
