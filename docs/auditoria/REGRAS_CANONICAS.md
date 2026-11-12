# Auditoria de integridade — inventário de regras canônicas

Iniciado em 12/11/2026, sobre a `main` em `7006006`. Somente leitura: nenhum código de produção,
RPC, migration ou registro do banco foi alterado.

**Legenda de status**
- **Confirmado (teste)**: comprovado por `tests/audit/business-date-consistency.test.ts`.
- **Confirmado (código)**: verificado lendo o código, mas ainda sem teste executável.
- **Hipótese**: indício no código, pendente de prova.

Para rodar a prova: `npm run test:audit`. Os testes marcados `todo` afirmam o comportamento
correto e hoje falham. O runner os reporta como TODO, sem quebrar o CI. Ao corrigir um
ponto, remova o `todo` correspondente para que ele vire bloqueio de regressão.

---

## R1. "Hoje" (dia civil de vencimento)

**Definição canônica declarada:** `utils/businessDate.ts → businessDateInManaus()`. O dia civil
segue **America/Manaus (UTC-4)**. O próprio arquivo diz que "a mesma referência de fuso é usada
nas validações SQL".

**Implementações concorrentes encontradas (3 convenções):**

| Convenção | Onde | Efeito |
|---|---|---|
| Manaus (canônica) | `utils/businessDate.ts` e ~17 telas da Carteira/ofertas; `capitalflow-admin-whatsapp`, `capitalflow-daily-collections`, `capitalflow-manual-collections` | Correto |
| Fuso do aparelho | `utils/dateHelpers.ts → todayDateOnlyUTC()` (nome enganoso: usa o fuso local) e `services/financialLogic.ts → getDaysDiff` | Aparelho fora de Manaus muda o "hoje"; no servidor (UTC) vira data UTC |
| UTC (`new Date().toISOString().slice(0,10)`) | 16 arquivos; os relevantes estão listados abaixo | Entre **20h e 24h em Manaus** o "hoje" já é o dia seguinte |

**Divergências por consumidor:**

| # | Arquivo | Uso | Consequência | Status |
|---|---|---|---|---|
| 1 | `features/agreements/services/agreementService.ts:108` (e `.legacy.ts`) | `p_payment_date` enviado para a RPC `process_agreement_payment_atomic` | A RPC calcula `v_days_late = p_payment_date - due_date` e grava `p_payment_date` no ledger (`20260916013905_harden_agreement_payments_and_ledger_links.sql:268,428,449`). **Pagamento de acordo feito após 20h no dia do vencimento conta 1 dia de atraso (pode gerar multa) e entra no ledger com a data de amanhã.** | Confirmado (código) + inventário (teste) |
| 2 | `components/wallet/payablesDomain.ts:10,20` | Padrão de "hoje" para status OVERDUE e total vencido | Conta que vence hoje aparece **atrasada** após 20h | **Confirmado (teste)** |
| 3 | `utils/dateHelpers.ts:173 getDaysDiff` | Base de "dias de atraso" de todas as modalidades | Resultado depende do fuso do aparelho/servidor | **Confirmado (teste)** em São Paulo e em UTC |
| 4 | `domain/finance/riskAnalysis.ts:24`, `utils/loanFilterResolver.ts:17`, `features/portal/mappers/portalDebtRules.ts:62`, `components/cards/components/InstallmentGrid.tsx:172` | Validade da oferta de pagamento (`paymentOfferValidUntil >= hoje`) | Oferta válida até hoje **expira às 20h** no app e no portal do cliente | Confirmado (código) |
| 5 | `components/cards/hooks/useLoanCardComputed.ts:15` | "Hoje" do cartão de contrato | Classificação do cartão muda às 20h | Confirmado (código) |
| 6 | `supabase/functions/ai-assistant/index.ts` (`summarizeCapitalFlowMetrics`, `buildBriefing`) | Atraso nas respostas e alertas do Flux | Flux informa parcela atrasada que não está | Confirmado (código) |
| 7 | `ai/tools/read/tools.ts:107,141` | Data de referência padrão das ferramentas de IA | Mesmo efeito para skills/MCP | Confirmado (código) |
| 8 | `supabase/functions/capitalflow-n8n-tools/index.ts:618` | `p_reference_date` da cobrança automática | Cobrança/notificação por atraso pode disparar um dia antes | Hipótese (depende do horário de execução) |
| 9 | SQL: 44 migrations usam `current_date`; 12 usam `America/Manaus` | Ex.: status `ATRASADO` em `20260916013905…:616` | `current_date` segue o fuso da sessão do banco (Supabase usa UTC por padrão) | Hipótese — confirmar com `show timezone` no banco real, só leitura |

## R2. Dias de atraso

- **Implementações:** cerca de 20 pontos chamam `getDaysDiff` com regras diferentes. Alguns passam
  `referenceDate`, outros usam o relógio do momento (`domain/finance/calculations.ts:129`,
  `modalities/dailyFixed/dailyFixed.renewal.ts:15`, `modality/diarioA.calculations.ts:11`). Alguns
  limitam com `Math.max(0, …)`, outros não.
- **Duas funções com o mesmo nome:** `utils/dateHelpers.ts getDaysDiff` usa `Math.round`;
  `services/financialLogic.ts getDaysDiff` usa `Math.ceil` e não aceita data de referência.
- **Status:** Confirmado (código). Ainda falta medir se `round` × `ceil` diverge em algum caso real
  (troca de horário de verão em fusos do aparelho).

## R3. Saldo em aberto da parcela (principal + juros restantes)

Recalculado separadamente em `services/payments/paymentPersistence.ts`, `asaas-webhook`,
`infinitepay-webhook`, `mp-webhook` e `ai-assistant`. **Status:** Hipótese de divergência. As
fórmulas precisam ser comparadas linha a linha. Mexe em pagamento: exige autorização explícita
antes de qualquer alteração.

## R4. Regras por modalidade de contrato

Há duas árvores paralelas: `domain/finance/modality/` (diarioA, diarioB, giro), consumida por
`features/payments/modality/index.ts`, e `domain/finance/modalities/` (daily30, dailyFixed,
dailyFree, dailyFixedTerm, installmentFixed, monthly). **Status:** Confirmado (código) que as
duas existem e estão em uso. Falta descobrir se cobrem modalidades diferentes ou se calculam a
mesma modalidade de dois jeitos.

## Ainda não inventariado

Quitação, acordo (substituição de parcelas), recebimento, estorno, saldo de conta da Carteira e
limite/fatura de cartão. Próximas etapas deste documento.

## Próximos passos (cada um precisa de aprovação)

1. Corrigir R1 nos consumidores **sem RPC**, um arquivo por vez, usando `businessDateInManaus()`.
   O item 1 (pagamento de acordo) é o de maior impacto financeiro.
2. Conferir no banco real, só leitura, o fuso da sessão (`show timezone`) e quantos pagamentos
   de acordo têm `p_payment_date` maior que a data em Manaus do `created_at`.
3. Comparar as fórmulas de R3 e as duas árvores de R4.
