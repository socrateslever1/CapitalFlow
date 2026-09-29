# Matriz de Operações Financeiras

## Modalidade x operação x efeito

| Modalidade | KEEP_PENDING | RENEW_KEEP_PENDING | CAPITALIZE | SETTLE |
|---|---|---|---|---|
| `MONTHLY` | recebe sem alterar data | +30 dias por escolha explícita | capitaliza saldo de juros/atraso | recebe e audita perdão |
| `INSTALLMENT_FIXED` | recebe na parcela atual | bloqueado | capitaliza saldo da parcela | quita somente a obrigação selecionada |
| `DAILY_FREE` | recebe sem alterar data | bloqueado | capitaliza saldo calculado pelo backend | recebe e audita perdão |
| `DAILY_FIXED_TERM` | recebe sem alterar data | bloqueado | capitaliza saldo da parcela | recebe e audita perdão |
| `DAILY_30_INTEREST` | recebe sem alterar data | bloqueado | capitaliza saldo da parcela | recebe e audita perdão |
| `DAILY_30_CAPITAL` | recebe sem alterar data | bloqueado | capitaliza saldo da parcela | recebe e audita perdão |
| `DAILY` / `GIRO` / `REVOLVING` legadas | compatibilidade sem mudar data | +30 dias quando aceito pelo backend | capitaliza com auditoria | recebe e audita perdão |

## Matriz de efeitos

| Operação | Data | Principal | Juros/atraso remanescente | Perdão | Confirmação |
|---|---|---|---|---|---|
| `KEEP_PENDING` | inalterada | baixa somente o recebido | permanece aberto | somente o explicitamente solicitado | obrigatória na UI |
| `RENEW_KEEP_PENDING` | vencimento anterior +30 | baixa somente o recebido | permanece aberto | somente o explicitamente solicitado | obrigatória e explícita |
| `CAPITALIZE` | inalterada | recebe o saldo capitalizado | zerado e incorporado ao principal | não implícito | obrigatória e explícita |
| `SETTLE` | inalterada | recebido separado do dispensado | zerado | registrado por componente | obrigatória e explícita |
| `REVERSAL` | restaura snapshot | restaura snapshot | restaura snapshot | desfaz efeito da operação | motivo obrigatório |

## Estados e bloqueios

- Saldo até `R$ 0,05` resulta em parcela `PAID`; saldo superior resulta em `PARTIAL`.
- Pagamento excedente é recusado; não vira crédito silencioso.
- Mudança manual de vencimento sem `RENEW_KEEP_PENDING` é recusada.
- Operação em outro perfil é recusada.
- Estorno com evento posterior na mesma parcela é recusado.
- Operação offline é recusada.
- Falha de auditoria ou ledger aborta toda a transação.

## Cobertura operacional

| Caminho | Backend autoritativo | Situação |
|---|---|---|
| Recebimento manual | RPCs V4 | pronto no código; migration pendente de staging |
| Condição especial | RPCs de payment offer existentes | preservado |
| Acordo | RPCs atômicas de acordo | preservado |
| Novo aporte | `process_lend_more_atomic` | V4 local; idempotente e offline bloqueado |
| Estorno de recebimento | V4 ou `reverse_payment_group` | fail-closed |
| Estorno de acordo | `reverse_agreement_payment_atomic` | fail-closed |
| Estorno de aporte | `reverse_capital_advance_v4` | V4 local; legado sem chave bloqueado |

## Critério para Skills

Skills financeiras de escrita ficam **BLOCKED** enquanto as migrations não estiverem validadas no banco e as carteiras não estiverem reconciliadas. Skills futuras só podem chamar RPCs explicitamente permitidas e devem exigir autenticação, confirmação, idempotência e auditoria.
