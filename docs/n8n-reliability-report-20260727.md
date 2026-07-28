# Relatorio de confiabilidade n8n - 27/07/2026

## Mudancas aplicadas

- Reserva atomica da fila com `FOR UPDATE SKIP LOCKED`.
- Token exclusivo por tentativa para impedir acknowledgements atrasados.
- Contador real de tentativas, limite de cinco envios e backoff de 30 a 900 segundos.
- Recuperacao automatica de locks abandonados apos cinco minutos.
- Tratamento simetrico de sucesso e falha nos workflows manual e diario.
- Remocao do UUID fixo dos workflows em favor de `CAPITALFLOW_PROFILE_ID`.
- Polling manual reduzido de 10 para 30 segundos.
- RPCs de fila restritas exclusivamente a `service_role`.
- PostgreSQL, Redis, WAHA e n8n vinculados somente a `127.0.0.1`.
- Testes de regressao para tenant, lock, sucesso e falha dos workflows.

## Componentes publicados

- Migration `harden_n8n_delivery_queue`.
- Migration `recover_legacy_whatsapp_queue_locks_v2`.
- Edge Function `capitalflow-manual-collections`, versao 7.
- Edge Function `whatsapp-send`, versao 11.
- Workflows `CapitalFlow - Cobranca Manual Imediata` e
  `CapitalFlow - Regua de Cobranca`.

## Validacoes

- Oito testes Node aprovados.
- TypeScript aprovado.
- Build de producao aprovado.
- JSON dos workflows aprovado.
- Teste remoto de claim, falha e backoff aprovado.
- Permissoes das RPCs confirmadas: `anon` e `authenticated` sem acesso.
- Tres workflows confirmados ativos depois da reinicializacao do n8n.
- Webhook de atendimento executado com sucesso apos a reinicializacao.

## Operacao

Os avisos gerais encontrados pelos advisors do Supabase pertencem ao esquema
legado e nao foram introduzidos por esta mudanca. A atualizacao do n8n 1.50.0 e
a ativacao de chave no WAHA exigem uma janela propria de compatibilidade para
nao interromper o atendimento existente.
