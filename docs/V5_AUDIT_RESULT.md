# Auditoria V5 — leitura de produção

Data local: 24/10/2026 (resultado UTC 2026-10-25T03:57:45.400624+00:00).
Projeto: `hzchchbxkhryextaymkn`.
Comando estritamente de leitura: `select private.financial_integrity_report() as report;`.

## Resultado da função financeira

**hard_errors: TODOS ZERO**
- negative_installment_balances: 0
- agreement_overpaid_installments: 0
- installment_component_mismatches: 0
- active_agreement_contract_mismatches: 0
- ledger_missing_loan_with_installment: 0
- atomic_agreement_component_mismatches: 0
- unmarked_componentless_selective_rows: 0

**legacy_review (não alterar automaticamente):**
- duplicate_payment_candidates: 1
- paid_agreement_installments_without_audit_row: 2

A saída representa verificações específicas, não validação integral do motor, concorrência ou integrações externas. Investigar esses casos sem apagar histórico.

## Condições de passagem
- Não aplicar migrações nem DML de produção durante a auditoria.
- Executar quality gates e testes transacionais exclusivamente em staging.
- Não promover mudanças de IA, UI ou Android que alterem o motor financeiro.
- Registrar testes e resultados antes de considerar a V5 homologada.
- O guard de arquivos é uma proteção de escopo desta branch de auditoria, não substitui revisão humana nem testes do backend.
