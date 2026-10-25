# CapitalFlow V5 — Linha de base de proteção

Data: 2026-10-24
Branch de trabalho: `audit/v5-non-invasive-baseline`
Base: `main`

## Regra de não regressão

Esta etapa é exclusivamente documental e de leitura. Não modificar schemas, migrations, registros de produção, saldos, contratos existentes, Motor Financeiro V4, RPCs de recebimento, estorno, juros, multa, mora ou cálculos de vencimento. Não liberar Skills de escrita financeira.

### Proteção obrigatória para mudanças futuras
1. Abrir PR isolado; não efetuar commit diretamente em `main` durante a auditoria.
2. Identificar arquivos, tabelas, RPCs e Edge Functions impactados antes de editar.
3. Não alterar sem testes de regressão de pagamento, estorno, idempotência e reconciliação.
4. Nunca executar testes que escrevam em produção; criar staging isolado e dados sintéticos.
5. Não executar migrations nem comandos DML em produção sem plano específico e validação prévia.
6. Não considerar um commit ou deploy como prova de funcionamento; registrar testes e seus resultados.

## Verificações iniciais (somente metadados)
- Projeto Supabase: `hzchchbxkhryextaymkn`.
- Migrations visíveis no Supabase no momento da consulta: 123.
- Frontend React/TypeScript/Vite e Supabase; motores financeiros existentes preservados.
- Escopo inicial: inspeção de integridade financeira, sem reparações automáticas.

## Portões da V5
A. Inventariar e identificar divergências sem alterações.
B. Executar quality gates locais/CI, de maneira não destrutiva.
C. Testar cenários sintéticos em staging.
D. Submeter qualquer reparo financeiro a PR separado com plano de rollback e testes.
E. Somente então prosseguir com IA, rentabilidade e Android.
