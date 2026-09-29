# Validação Financeira em Staging

## Estado

**BLOQUEADA — não existe ambiente de staging identificado.**

Em 28/09/2026, a conexão Supabase retornou somente o projeto `CapitalFlow` (`hzchchbxkhryextaymkn`) e nenhuma branch de desenvolvimento. Esse projeto não foi utilizado como substituto de staging.

## Migrations

Nenhuma migration desta etapa foi aplicada remotamente:

- `20260929042054_payment_engine_v4.sql`
- `20260929042059_harden_capital_advances.sql`
- `20260929042103_ai_skills_read_models.sql`

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
