# Wallet Production Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar pilha real, bottom sheet, passivos completos e cobrança PIX/link com persistência segura.

**Architecture:** Regras financeiras e de apresentação ficam em módulos puros; componentes React são pequenos e recebem callbacks. O Supabase evolui por uma migração aditiva com RPC transacional e RLS.

**Tech Stack:** React 19, TypeScript estrito, Tailwind CSS, Framer Motion, Supabase/Postgres, qrcode.react.

**Spec:** `docs/superpowers/specs/2026-10-25-wallet-production-redesign-design.md`

## Global Constraints
- Sem URLs externas para logos ou identidade visual.
- Sem acordeões na página principal.
- Cartão sem conta continua válido.
- PIX estático não promete confirmação automática.
- Nenhum dado de outro proprietário pode ser lido ou alterado.

## Review Focus
- Aliases “Nu”, “Nu Pagamentos” e “Nubank” produzem um único grupo.
- Limite zero não causa divisão por zero nem barra inválida.
- Pagamento parcial nunca ultrapassa o saldo e é idempotente.
- Passivo vencido, parcial e liquidado recebe status correto.
- QR/link não inclui PAN, CVV ou outros dados de cartão.

---

### Task 1: Domínio e testes
**Files:** Modify `components/wallet/walletPresentation.ts`; Create `components/wallet/pixPayload.ts`; Create `components/wallet/payablesDomain.ts`; Test `tests/wallet/*.test.ts`

- [ ] Escrever testes que falham para aliases, agregados, status, projeção e BR Code.
- [ ] Implementar funções puras mínimas e confirmar testes verdes.

### Task 2: Persistência de passivos
**Files:** Create `supabase/migrations/*_wallet_payables_v2.sql`; Modify `services/personalWallet.service.ts`

- [ ] Criar migração via CLI e implementar colunas, histórico, RPC, bucket, índices, grants e RLS.
- [ ] Aplicar no Supabase CapitalFlow e validar schema, política e advisors.

### Task 3: Pilha e bottom sheet
**Files:** Replace `components/wallet/BankStack.tsx`; Create `components/wallet/WalletCardsSheet.tsx`; Modify `pages/PersonalWalletPage.tsx`

- [ ] Renderizar deck sobreposto compacto sem expansão inline.
- [ ] Implementar drawer animado, progresso e cartões vetoriais.
- [ ] Remover duplicidade da aba/lista de cartões na página.

### Task 4: Passivos e cobrança
**Files:** Create `components/wallet/WalletPayablesPanel.tsx`; Replace `components/wallet/WalletPixCharge.tsx`; Modify `components/wallet/AccountDetailsPage.tsx`; Modify `pages/PersonalWalletPage.tsx`

- [ ] Implementar criação completa, pagamento parcial e comprovante.
- [ ] Implementar cobrança com valor, descrição e conta de recebimento.
- [ ] Integrar projeção e estados vazios/erro/sucesso.

### Task 5: Verificação e integração
**Files:** All modified files

- [ ] Executar testes de domínio e suíte relevante.
- [ ] Executar build de produção e `git diff --check`.
- [ ] Executar QA visual móvel e desktop.
- [ ] Commitar e enviar ao GitHub somente após todas as verificações.
