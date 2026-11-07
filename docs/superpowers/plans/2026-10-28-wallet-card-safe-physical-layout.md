# Wallet Card Safe Physical Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurar o visual físico do cartão e reorganizar seus dados sem persistir ou expor número completo e CVC.

**Architecture:** Manter a pilha e os gestos em `BankStack`, reorganizando somente as faces. Centralizar o conteúdo copiável em `cardClipboard` e remover do cartão virtual legado a leitura de credenciais sensíveis em `notes`.

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-28-wallet-card-safe-physical-layout-design.md`

## Global Constraints

- Preservar navegação, giro, gesto e seleção da pilha.
- Não persistir nem copiar CVC.
- Não recuperar número completo ou CVC de `notes`.
- Não incluir valores financeiros no texto copiado.

## Review Focus

- Tela móvel estreita: número, titular e validade não podem se sobrepor.
- Cartão sem titular ou validade: exibir marcador neutro.
- Cartão com somente quatro últimos dígitos: manter máscara consistente.
- Clipboard indisponível: preservar mensagem de erro atual.
- Arrastar horizontalmente: não acionar giro acidental.

---

### Task 1: Contrato de apresentação e cópia

**Files:**
- Modify: `tests/wallet/wallet-card-safe-identification.test.ts`
- Modify: `utils/cardClipboard.ts`

**Interfaces:**
- Consumes: `PersonalWalletCard`.
- Produces: `formatCardSummaryForClipboard(card): string`.

- [ ] Escrever testes que rejeitem limite/fatura no clipboard e exijam número mascarado, titular e validade.
- [ ] Executar o teste e confirmar falha.
- [ ] Ajustar o formatador com os campos canônicos seguros.
- [ ] Executar o teste e confirmar aprovação.

### Task 2: Faces física e responsiva

**Files:**
- Modify: `tests/wallet/wallet-ui-architecture.test.ts`
- Modify: `components/wallet/BankStack.tsx`
- Modify: `components/wallet/VirtualCreditCard.tsx`

**Interfaces:**
- Consumes: `last_four`, `cardholder_name`, `expiry_month`, `expiry_year`.
- Produces: frente organizada, verso físico seguro e botão `Copiar dados do cartão`.

- [ ] Escrever testes estruturais para a linha própria do número, titular/validade e ausência de leitura sensível em `notes`.
- [ ] Executar os testes e confirmar falha.
- [ ] Reorganizar as duas faces preservando interação e pilha.
- [ ] Remover leitura de `card_number` e `cvv` em `notes` no componente legado.
- [ ] Executar testes de Carteira e `npm run build`.
