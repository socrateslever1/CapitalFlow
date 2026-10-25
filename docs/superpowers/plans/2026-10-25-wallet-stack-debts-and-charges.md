# Wallet Stack, Debts and Charges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar a carteira por banco, vincular cartões opcionalmente a contas, registrar dívidas a pagar e gerar cobrança PIX com link e QR Code.

**Architecture:** Preservar tabelas atuais, adicionar relacionamento e entidade de obrigações por migração aditiva, e extrair regras visuais/serialização para funções puras testáveis. A página continua sendo o orquestrador da carteira.

**Tech Stack:** React 19, TypeScript, Vite, Supabase/Postgres, qrcode.react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-25-wallet-stack-debts-and-charges-design.md`

## Global Constraints
- Migração aditiva e compatível com cartões existentes.
- Nenhuma imagem ou chamada externa para identidade bancária.
- O link não pode prometer confirmação automática de pagamento.

## Review Focus
- Banco desconhecido recebe identidade estável e legível.
- Cartão independente não desaparece do agrupamento.
- Payload PIX continua válido sem cidade digitada pelo usuário.
- Valores inválidos de dívida são recusados.
- Link compartilhável preserva chave, recebedor e valor sem expor dados de cartão.

---

### Task 1: Regras puras da carteira
**Files:** Create `components/wallet/walletPresentation.ts`; Test `tests/wallet/wallet-presentation.test.ts`

- [ ] Escrever testes para identidade bancária, agrupamento e link de cobrança.
- [ ] Executar os testes e confirmar falha por módulo ausente.
- [ ] Implementar funções puras mínimas.
- [ ] Executar os testes e confirmar sucesso.

### Task 2: Persistência de vínculos e dívidas
**Files:** Create `supabase/migrations/20261025160000_wallet_card_accounts_and_payables.sql`; Modify `services/personalWallet.service.ts`

- [ ] Adicionar `account_id` opcional aos cartões e tabela RLS de dívidas.
- [ ] Expor tipos, carregamento, criação e quitação no serviço.
- [ ] Verificar com TypeScript.

### Task 3: Experiência da carteira
**Files:** Modify `pages/PersonalWalletPage.tsx`; Modify `components/wallet/WalletPixCharge.tsx`; Modify `components/wallet/AccountDetailsPage.tsx`; Modify `App.tsx`

- [ ] Passar o nome/cidade do perfil para a carteira e cobrança.
- [ ] Adicionar pilha expansível por banco e vínculo no cadastro do cartão.
- [ ] Adicionar aba e formulário de dívidas a pagar.
- [ ] Modernizar resultado da cobrança com link, compartilhamento e QR Code.
- [ ] Executar build e testes de regressão.
