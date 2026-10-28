# Wallet Card Flip and Invoice Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o painel de uso do crédito por um cartão giratório com dados copiáveis, aplicar sua linguagem compacta às contas e isolar toda a apresentação pelo ciclo de fatura selecionado.

**Architecture:** `BankStack` continuará responsável pela seleção e pelo gesto horizontal, mas manterá o estado de face e renderizará frente e verso no mesmo espaço 3D. O domínio de faturas ganhará uma consulta explícita por ciclo para separar posição global de crédito e apresentação mensal. `AccountCardStack` adotará linhas compactas identificadas pela instituição, sem novo modal.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-28-wallet-card-flip-and-cycle-design.md`

## Global Constraints

- Não armazenar, inventar ou apresentar número completo, validade ou CVV.
- Preservar setas, arraste, ações financeiras, teclado, toque e preferência de redução de movimento.
- Não alterar persistência ou cálculo contábil; somente derivar a apresentação do ciclo escolhido.
- Interface integralmente em português do Brasil.

## Review Focus

- Um arraste acima do limiar troca o cartão e nunca gira a face.
- Um toque curto gira; trocar o cartão sempre retorna para a frente.
- Cartão sem final, emissor ou dias configurados apresenta fallback seguro e copiável somente quando houver valor.
- Ciclo sem lançamentos mostra zero e estado próprio, sem herdar resumo ou aviso do ciclo anterior.
- Redução de movimento remove a rotação animada sem esconder nenhuma face ou ação.

---

### Task 1: Posição visual da fatura selecionada

**Files:**
- Modify: `components/wallet/invoiceStatementDomain.ts`
- Modify: `features/wallet/pages/WalletCardsPage.tsx`
- Test: `tests/wallet/invoice-credit-separation.test.ts`
- Test: `tests/wallet/invoice-statement-balance.test.ts`

**Interfaces:**
- Produces: `getSelectedInvoiceCycle(cardId: string, dueMonth: string | null | undefined, expenses: PersonalWalletExpense[], installments: PersonalWalletExpenseInstallment[]): EffectiveInvoiceCycle`
- Consumes: `getEffectiveInvoiceCycles` e `getCardInvoiceEntries` existentes.

- [ ] **Step 1: Escrever testes que exigem valor e override somente do mês solicitado e ciclo vazio com valor zero.**
- [ ] **Step 2: Executar `npx tsx --test tests/wallet/invoice-credit-separation.test.ts tests/wallet/invoice-statement-balance.test.ts` e confirmar falha pela função ausente.**
- [ ] **Step 3: Implementar `getSelectedInvoiceCycle` como derivação pura e normalizada para o primeiro dia do mês.**
- [ ] **Step 4: Em `WalletCardsPage`, usar o ciclo selecionado no resumo visível, estado, modal de pagamento e aviso de carga inicial; exibir o saldo inicial não alocado apenas no ciclo inicial correspondente.**
- [ ] **Step 5: Reexecutar os testes e confirmar aprovação.**

### Task 2: Cartão giratório e cópia segura

**Files:**
- Modify: `components/wallet/BankStack.tsx`
- Delete: `components/wallet/WalletCardsSheet.tsx`
- Modify: `utils/cardClipboard.ts`
- Modify: `tests/wallet/statement-smart-reader.test.ts`
- Modify: `tests/wallet/wallet-ui-architecture.test.ts`
- Modify: `tests/architecture/architecture-check.mjs`

**Interfaces:**
- Produces: `copyCardFieldToClipboard(label: string, value: string): Promise<CopyResult>` e mantém `copyCardDataToClipboard`.
- Consumes: cartão ativo, identidade visual da instituição e gesto por Pointer Events.

- [ ] **Step 1: Escrever testes para cópia de campo vazio/válido e testes arquiteturais que proíbem `WalletCardsSheet` e exigem estrutura 3D acessível.**
- [ ] **Step 2: Executar os testes direcionados e confirmar falha pelos contratos novos.**
- [ ] **Step 3: Implementar o utilitário de cópia mantendo as mensagens internas em português.**
- [ ] **Step 4: Remover o painel e implementar `isFlipped`, reset por cartão, frente/verso com `backface-visibility`, teclado e redução de movimento em `BankStack`.**
- [ ] **Step 5: Manter o gesto horizontal com limiar atual e bloquear o giro após arraste.**
- [ ] **Step 6: Exibir retorno interno de cópia e ações para final, datas, limites e resumo, sem dados sensíveis inexistentes.**
- [ ] **Step 7: Reexecutar os testes direcionados e confirmar aprovação.**

### Task 3: Contas com linguagem visual compacta

**Files:**
- Modify: `components/wallet/AccountCardStack.tsx`
- Modify: `tests/architecture/wallet-overview-localization.test.mjs`
- Modify: `tests/wallet/wallet-ui-architecture.test.ts`

**Interfaces:**
- Consumes: `getBankVisual`, `BankLogo`, `walletAccountTypeLabel`, `formatMoney`.
- Produces: lista compacta clicável de contas, com identidade da instituição, tipo e saldo.

- [ ] **Step 1: Atualizar os testes estáticos para exigir identidade por instituição, linha compacta, saldo e tipo localizado.**
- [ ] **Step 2: Executar os testes e confirmar falha contra a marcação atual.**
- [ ] **Step 3: Ajustar somente a apresentação de `AccountCardStack`, preservando `onOpen`, total e estado vazio.**
- [ ] **Step 4: Reexecutar os testes e confirmar aprovação.**

### Task 4: Verificação integrada

**Files:**
- Verify only.

**Interfaces:**
- Consumes: entregas das Tasks 1 a 3.
- Produces: evidência de integração sem regressão conhecida.

- [ ] **Step 1: Executar `npm run lint`.**
- [ ] **Step 2: Executar os testes de carteira e arquitetura afetados.**
- [ ] **Step 3: Executar `npm run build`.**
- [ ] **Step 4: Executar `git diff --check` e revisar o diff somente dos arquivos do escopo.**
- [ ] **Step 5: Validar visualmente mouse, toque simulado, teclado e troca de ciclo; se não houver navegador disponível, registrar explicitamente a limitação.**
