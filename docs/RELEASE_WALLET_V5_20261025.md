# Release de produção — Carteira CapitalFlow V5 (25/10/2026)

Entrega consolidada já incluída na branch main pelo commit 455c1f514269f5200f7e0a52c67da09af0452912.

Banco Supabase: migration 20261025073621_personal_wallet_account_ledger_and_statements aplicada.
Funcionalidades: receitas, recebimentos, despesas, pagamentos, transferências contábeis, extrato e CSV, PDF de contas e cartões com revisão explícita antes do registro.
As importações de PDF não alteram o saldo, contratos, pagamentos ou limite do cartão.
Transferências internas representam movimentações contábeis entre contas cadastradas; não enviam PIX.

Esta alteração documental única registra a release e solicita a execução de CI e do deploy da branch main. Não reintroduzir o PR #41 divergente.
Motor Financeiro V4 de empréstimos, acordos, juros, estornos e recebimentos não foi modificado nesta entrega.

Critérios de aceitação: CI verde, deployment Cloudflare production concluído e teste autenticado da Carteira. Um commit ou deploy por si só não confirma a funcionalidade real.
