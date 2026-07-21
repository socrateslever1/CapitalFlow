# Automação WhatsApp / n8n

Esta pasta contém artefatos versionáveis da automação do CapitalFlow.

`normalize-waha-message.cjs` define o contrato de entrada entre WAHA e n8n. Mensagens só são aceitas quando são privadas, recebidas, suportadas, possuem `message_id` e quando a organização é resolvida por um mapeamento confiável da sessão ou do número receptor.

O mapeamento de tenant não deve ser aceito do corpo livre da mensagem. No workflow, ele deve vir da configuração protegida da instância WAHA ou de uma ferramenta interna do CapitalFlow.

Execute os testes com:

```powershell
node --test automation/n8n/normalize-waha-message.test.cjs
```
