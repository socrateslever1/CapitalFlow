# Operacao e Suporte

## Como o suporte identifica estado da sincronizacao

Via servico do portal (`/services/portal.service.ts`):

- `getOfflineSyncStats()`
  - retorna totais de fila: `total`, `pending`, `failed`, `dead`.
- `retryDeadOutbox(limit)`
  - requeue manual de itens `DEAD`.

## Estados da fila (outbox)

- `PENDING`: aguardando envio.
- `FAILED`: falhou, aguardando `nextRetryAt`.
- `DEAD`: excedeu `maxAttempts`, nao tenta automaticamente.

## Cenarios comuns

## 1) Cliente sem internet

Comportamento esperado:

- portal abre pelo cache (se app shell ja cacheado);
- dados aparecem pelo snapshot (se ja carregados anteriormente);
- intencao de pagamento fica enfileirada para sync posterior.

## 2) Internet voltou

Comportamento esperado:

- flush automatico roda;
- itens sincronizados sao removidos da outbox;
- portal recarrega dados quando houver sincronizacao bem-sucedida.

## 3) Pagamento online indisponivel

Mensagem tratada no servico:

- "Funcao de pagamento online indisponivel no servidor. Solicite o deploy da Edge Function mp-create-preference."

Indica problema de publicacao/infra da funcao, nao erro de UI.

## Diagnostico tecnico rapido

1. Confirmar funcao publicada:
   - endpoint `/functions/v1/mp-create-preference` nao pode retornar `404 NOT_FOUND`.
2. Verificar conectividade do navegador.
3. Verificar volume de itens `DEAD`.
4. Executar `retryDeadOutbox` se necessario.

## Limites conhecidos da etapa atual

- Upload de comprovante depende de conectividade no momento do upload.
- Assinatura juridica continua dependente de backend online.
- Snapshot offline expira (TTL) para evitar uso indefinido de dados antigos.

