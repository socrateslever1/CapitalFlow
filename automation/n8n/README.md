# Automação WhatsApp / n8n

Esta pasta contém artefatos versionáveis da automação do CapitalFlow.

`normalize-waha-message.cjs` define o contrato de entrada entre WAHA e n8n. Mensagens só são aceitas quando são privadas, recebidas, suportadas, possuem `message_id` e quando a organização é resolvida por um mapeamento confiável da sessão ou do número receptor.

O mapeamento de tenant não deve ser aceito do corpo livre da mensagem. No workflow, ele deve vir da configuração protegida da instância WAHA ou de uma ferramenta interna do CapitalFlow.

Execute os testes com:

```powershell
node --test automation/n8n/normalize-waha-message.test.cjs
```
# Confiabilidade operacional

Os workflows de cobrança usam as variáveis abaixo no container do n8n:

- `CAPITALFLOW_PROFILE_ID`: perfil processado pelos agendadores.
- `CAPITALFLOW_N8N_SECRET`: segredo compartilhado, validado pelo hash armazenado em `n8n_automation_integrations`.

A fila `whatsapp_queue` é reservada pelas RPCs `claim_whatsapp_queue` e
`claim_whatsapp_queue_item`. Toda confirmação precisa enviar o `lock_token`
recebido no claim. Falhas temporárias voltam para `PENDING` com backoff
exponencial; após cinco tentativas, terminam em `ERROR`.

Não altere o status da fila diretamente nos workflows.
