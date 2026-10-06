# Validação Financeira em Staging

## Nova tentativa local — 05/10/2026

| Verificação | Estado | Evidência |
|---|---|---|
| Docker e CLI | PASS | Docker `29.6.2`; Supabase CLI `2.119.0`; imagens locais baixadas. |
| Proteção contra banco remoto | PASS | CLI sem projeto vinculado e `tests/db/run-local-db-tests.mjs` rejeita `.supabase.co`/projeto principal. |
| Aplicação ordenada das migrations | BLOQUEADO | `20260222_campaign_bot_trigger.sql` referencia `public.campaign_messages`, ausente; não existe baseline anterior versionado. |
| Quatro migrations de outubro | BLOQUEADO | Não alcançadas devido à falha de baseline em `20260222`. |
| PostgreSQL/RLS/RPCs/ledger | BLOQUEADO | Não é seguro fabricar tabelas ou usar produção como baseline. |
| Testes em memória | PASS parcial | Idempotência, concorrência e rollback; não substituem PostgreSQL. |
| Quality gate não-DB | PASS | `npm run test:quality`, incluindo build e 32/32 testes n8n. |

Comandos relevantes: `npx supabase start`, `npm run test:db` e `npm run test:quality`. Nenhuma migration foi aplicada fora da instância local descartável; nenhum dado real foi alterado e o custo adicional foi **R$ 0,00**. Para desbloquear, é necessário versionar um baseline fiel do esquema (obtido de uma fonte segura e revisada) antes da primeira migration atual; produção não deve ser usada como ambiente de teste.

## Estado

**BLOQUEADA — não existe ambiente de staging identificado.**

Em 29/09/2026, a conexão Supabase retornou somente o projeto principal `CapitalFlow` (`hzchchbxkhryextaymkn`) e nenhuma branch de desenvolvimento. O projeto principal não foi utilizado como substituto de staging.

## Migrations

As migrations desta etapa estão registradas no projeto remoto principal:

- `20260929042054_payment_engine_v4.sql`
- `20260929042059_harden_capital_advances.sql`
- `20260929042103_ai_skills_read_models.sql`
- `20260929042436_cleanup_database_surface.sql`
- `20260929224507_harden_profit_withdrawals_v2.sql`

Isso comprova implantação no projeto principal, não valida staging nem a matriz financeira.

## Cenários financeiros

Os testes reais de pagamento total, parcial, `KEEP_PENDING`, `RENEW_KEEP_PENDING`, `CAPITALIZE`, `SETTLE`, acordo, aporte, estorno, idempotência, concorrência e falha intermediária **não foram executados em banco remoto**, pois isso exigiria dados artificiais em um staging isolado.

## Evidências locais

- Build, testes financeiros, Skills, arquitetura e automação são executados por `npm run test:quality`.
- O código V4 contém advisory locks, `FOR UPDATE`, idempotência, preview vinculante e estorno por snapshot.
- As Skills financeiras continuam desabilitadas.

## Pendência para liberação

1. Disponibilizar uma branch/staging Supabase isolada.
2. Aplicar as três migrations acima em ordem.
3. Criar fixtures artificiais exclusivas.
4. Executar a matriz financeira, concorrência, idempotência, rollback e reconciliação.
5. Registrar resultados e evidências neste documento.

Enquanto essas etapas não forem concluídas, nenhuma Skill financeira pode ser marcada como pronta.
