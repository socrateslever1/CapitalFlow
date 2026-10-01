# CapitalFlow Tools

## Responsabilidades

```text
Skill → ToolRegistry → Tool → gateway autorizado → RPC/backend
```

- Skill define a capacidade permitida e traduz a intenção.
- Tool valida entrada, permissão, risco, confirmação e chama o backend.
- Backend determina fatos; o Payment Engine determina matemática.
- `profileId` nunca faz parte do input de uma Tool. O tenant vem de `ToolContext`, criado pela sessão autenticada.

## Registry e erros

`ToolRegistry` registra, lista, busca e executa Tools. Tools inexistentes, desabilitadas, sem permissão, sem confirmação ou com input inválido retornam JSON estruturado por `ToolResult`.

## Tools READ_ONLY

| Tool | Backend |
|---|---|
| `client.search` / `client.get` | `skill_find_clients_v1` |
| `contract.get` | `skill_list_contracts_v1` |
| `debt.get` | `skill_get_debt_position_v1` |
| `installments.list` | `skill_list_installments_v1` |
| `due_dates.list` | `skill_list_due_v1` |
| `agreement.get` | `skill_get_agreement_v1` |

`client.get` e `contract.get` recusam ambiguidade. Os schemas são estritos e rejeitam campos como `profileId` enviados no input.

## Tools financeiras

`payment.preview`, `payment.execute`, `payment.reverse`, `payment.capitalize`, `payment.renew`, `payment.settle` e `loan.lend_more` estão desabilitadas com `requiresConfirmation: true` enquanto `STAGING_NOT_VERIFIED` permanecer.

`payment.preview` aponta para `previewFinancialOperation`, o mesmo Payment Engine V4 cuja prévia é recalculada por `process_financial_operation_v4`; não existe cálculo financeiro na Tool.

## Adicionar uma Tool

1. Defina schema estrito e tipos.
2. Não aceite tenant/owner/profile no input.
3. Use gateway/RPC autorizado; não use SQL ou acesso direto a tabelas.
4. Registre risco, permissões, autenticação e confirmação.
5. Adicione testes de input, autorização, tenant, ambiguidade e falha do backend.
6. Exponha no MCP apenas se for explicitamente aprovada e READ_ONLY.
