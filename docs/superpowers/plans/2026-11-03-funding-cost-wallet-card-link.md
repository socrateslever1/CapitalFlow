# Custos de captação e vínculo opcional de cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Exibir rentabilidade líquida correta e permitir fonte de capital independente ou vinculada a cartão da própria Carteira.

**Architecture:** Reutilizar campos existentes para custos contratuais; módulo puro de cálculo em centavos; fonte/cartão associados por tabela isolada com RLS. Não criar lançamentos no cartão por meio do vínculo.

**Tech Stack:** React, TypeScript, Supabase/Postgres, Node test, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-03-funding-cost-wallet-card-link-design.md

## Global Constraints
Isolamento por proprietário; nenhuma atualização retroativa de contratos, saldo, fatura ou transações; interface pt-BR; manter múltiplas fontes desativadas; operações existentes intactas.

## Review Focus
1. Taxa nula, negativas, `NaN`, casas decimais e valor menor que principal: rejeitar dados inválidos.
2. Compra já importada na fatura: vínculo não pode criar despesa.
3. Cartão de outro usuário e fonte de colaborador: impedir criação e leitura de vínculo.
4. Alterar principal após inserir custo: atualizar o total sem perder a taxa/custo informado.
5. Contrato parcelado e mensal, com ou sem cartão: preservar cálculo contratual e evitar dupla dedução.

## Etapa 1: domínio e regressões
- [ ] Criar `domain/finance/fundingCost.ts` com `calculateFundingSummary`.
- [ ] Criar `tests/financial/funding-cost.test.ts` com caso R$ 200 + R$ 9,98 → R$ 50,02, bordas e retrocompatibilidade.
- [ ] Rodar testes e registrar falhas antes da implementação; finalizar testes verdes.

## Etapa 2: contrato e apresentação
- [ ] Reconhecer tipos `CARD` e `MISTO` no formulário e tipos.
- [ ] Permitir custo em reais para cartão no contrato mensal, quinzenal, semanal, diário e parcelado.
- [ ] Persistir custo já nos campos canônicos e validar valores incoerentes.
- [ ] Apresentar lucro bruto, custo e lucro líquido previsto, sem alterar juros do cliente.

## Etapa 3: carteira e fonte
- [ ] Criar tabela opcional fonte→cartão com RLS por titular e restrição de integridade.
- [ ] Integrar seletor em `WalletCapitalLinks` usando cartões existentes.
- [ ] Não criar despesas, não alterar limite, não vincular fontes antigas automaticamente.
- [ ] Verificar RLS, concessões e segurança pós-migração.

## Etapa 4: homologação
- [ ] Executar test:financial, test:wallet, typecheck/build e Quality Gates.
- [ ] Integrar em commit de merge único se todos os testes passarem.
- [ ] Verificar produção e certificado Android; tratar publicação separadamente se bloqueada.
