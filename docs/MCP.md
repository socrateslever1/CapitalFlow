# MCP CapitalFlow

## Arquitetura

```text
MCP Server → CapitalFlowMcpAdapter → ToolRegistry → Tool → backend
```

O servidor é criado por `createCapitalFlowMcpServer`. Ele exige um `resolveAuthenticatedContext` injetado pelo host. Não existe entrada MCP para `profileId`; o tenant vem da sessão autenticada resolvida fora do LLM.

## MCP V1 READ_ONLY

- `search_client`
- `get_client`
- `get_debt`
- `list_installments`
- `get_contract`
- `list_due_dates`
- `get_agreement`

As respostas usam `structuredContent` e o formato `{ "ok": true, "data": ... }` ou `{ "ok": false, "error": "...", "message": "..." }`.

## Segurança

- Sem `service_role`, senha, token administrativo ou SQL arbitrário.
- Sem seleção de tenant pelo modelo.
- Schemas estritos rejeitam propriedades extras.
- Nenhuma Tool financeira é registrada no MCP V1.
- O factory não inicia transporte público sozinho: o host deve autenticar a sessão e fornecer o contexto confiável.
- Não há agente autônomo, loop de tools, RAG ou fine-tuning.

## Expor uma Tool

Adicione o mapeamento em `ai/mcp/adapter.ts` somente após revisar risco, schema, autorização e testes. O servidor registra apenas Tools `enabled` e `READ_ONLY`; operações financeiras continuam internas e bloqueadas até validação real em staging.
