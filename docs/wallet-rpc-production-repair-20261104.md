# Reparo comprovável das RPCs financeiras da Carteira — 04/11/2026

## Diagnóstico anterior
No projeto Supabase de produção, o frontend chamava três RPCs inexistentes:
`personal_wallet_record_external_transfer`, `personal_wallet_create_charge` e
`personal_wallet_settle_charge`. Existiam arquivos de migração em `20261026` no GitHub, mas não
estavam aplicados no banco.

O banco **já possuía** os tipos de operação `LOAN_DISBURSEMENT` e `LOAN_REPAYMENT`.
Por isso, repetir a migration antiga de operações de conta substituiria CHECKs atuais e
quebraria a Carteira de empréstimos. A correção nova é restrita aos campos faltantes,
não redefine o CHECK existente e preserva toda a operação de empréstimos.

## Correção
- Transferência externa contábil, com destinatário e comprovante/PIX, transação única,
  bloqueio de saldo, proprietário autenticado, replay idempotente e rejeição de saldo insuficiente.
- Criação de cobrança PIX estática, vinculada a uma conta com chave PIX do titular,
  idempotente por request_id. Criar a cobrança **não credita nem confirma recebimento**.
- Liquidação **manual** de cobrança estática: valida status, valor exato, conta e identificador,
  trava linhas, credita a conta e grava uma única operação RECEIPT na mesma transação.
  A liquidação jamais significa confirmação automática pelo banco.
- Bloqueio de crédito dessas cobranças no ledger legado, impedindo contagem dupla.
- A política SELECT existente dos gateways não é alterada; cria-se uma política
  adicional exclusiva para cobranças próprias da Carteira.
- Rotinas antigas de faturas, empréstimos, estornos e contratos não são redefinidas.

## Prova
- GitHub CI: `npm run test:wallet-rpc-deployment`, Quality Gates e Android.
- Banco: `tests/db/wallet-rpc-live-verification.sql` devolve contagens verificáveis.
- Ensaio de negócio: repetir transferências e cobranças sob transação revertida
  (`BEGIN; ... ROLLBACK;`) para não modificar contas ou saldos reais.
- Registrar resultados concretos somente depois de executados.

**Limite:** não é a implementação de Open Finance, liquidação PIX por webhook,
nem a homologação integral de descontos, estornos e adiantamentos. Essas áreas exigem
ensaios de seus fluxos próprios e reconciliação com extratos externos.

## Homologação efetivamente executada em 04/11/2026

- Merge: commit `41c378de70c7a9a234f7d66e6625523dbb0b8ce7` (PR #116).
- Migração Supabase aplicada: `20261104234554` (`restore_wallet_financial_rpcs_preserve_loans_20261104`).
- Consultas no catálogo de produção: **3/3** RPCs existem e são executáveis apenas por `authenticated`
  (não por `anon`). **5/5** campos novos em operações, **7/7** campos novos em cobranças.
- Foram confirmados **dois** filtros RLS de leitura específicos (gateway e Carteira) e
  **um** trigger bloqueando crédito duplicado no ledger legado.
- Restrição atual de operações preserva expressamente `LOAN_DISBURSEMENT` e `LOAN_REPAYMENT`.
- Teste transacional em `tests/db/wallet-rpc-rollback-integration.sql`: executado sem erro,
  cobrindo saldo insuficiente, idempotência, divergência de parâmetros, valor de
  cobrança, crédito único, isolamento por titular e ausência de lançamento no ledger legado.
- Controle antes e depois do teste revertido: **4 contas, R$ 5.678,44 agregados, 4 operações e
  54 cobranças**, sem nenhuma nova cobrança estática nem transferência externa persistida.

O Supabase Advisor detectou que as duas FKs criadas por esta integração precisavam de
índice com `account_id` e `charge_id` como coluna inicial. A migration adicional
`20261104191000_wallet_charge_fk_indexes.sql` cobre exatamente essas duas colunas.
Essa melhoria de desempenho não altera o histórico financeiro.
