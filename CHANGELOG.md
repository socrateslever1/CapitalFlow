# Changelog

Registro das alterações entregues ao CapitalFlow. A data identifica a integração no código; a publicação web e a release Android são verificadas separadamente.

## 19/11/2026 — Carteira: seletores, lançamentos e apresentação

**Código:** [PR #138](https://github.com/socrateslever1/CapitalFlow/pull/138), integrado na `main` pelo commit `aa7bad8`. O commit seguinte `7a193ec` apenas disparou uma nova tentativa de publicação. Nenhum dos dois contém imagens de `.codex-attachments/` na árvore final.

| Mudança | Onde foi alterado |
| --- | --- |
| Lista de opções compartilhada para formulários, com fechamento por Escape/clique fora e ocultação de valores quando a privacidade está ativa. | `components/ui/SelectOptionList.tsx`; uso em `components/forms/LoanFormFinancialSection.tsx`, `components/wallet/AccountActivityPanel.tsx` e outros formulários da Carteira. |
| Registro rápido de despesa e receita com seleção de conta, cartão, origem e categoria mais clara. Categorias personalizadas ficam isoladas por perfil; o campo de nova categoria continua editável mesmo ao coincidir com uma opção existente. | `components/wallet/QuickExpenseModal.tsx`, `features/wallet/components/QuickIncomeModal.tsx`, `features/wallet/utils/walletCustomCategories.ts`, `components/wallet/accountCategorySelection.ts`, `components/wallet/AccountActivityPanel.tsx`. |
| Seleção de destino de recebimento simplificada, com ação de limpar; ajustes nas telas de movimentação, fatura e cartão. | `components/wallet/ReceiptDestinationSelector.tsx`, `components/wallet/AccountMovementModal.tsx`, `components/wallet/PayInvoiceModal.tsx`, `components/wallet/CardEditModal.tsx`, `features/wallet/components/CapitalSourceTransferModal.tsx`. |
| Descrições mais curtas no extrato e explicação de compras parceladas pelo valor original, sem apresentá-las como parcelas vencidas. | `components/wallet/accountStatementDomain.ts`, `features/wallet/components/WalletSpendingGuide.tsx`, `features/wallet/domain/walletSpendingInsights.ts`. |
| Exibição de `%` no campo de taxa e ajuste do espaço inferior da Carteira no celular. | `components/forms/FinancialCalculatorInput.tsx`, `layout/AppShell.tsx`. |
| Testes de isolamento, privacidade, categoria personalizada, operações e recibos. | `tests/wallet/`, `tests/architecture/quick-receipt-destination-ui.test.mjs`, `package.json`. |

**Validação:** os sete checks do PR passaram, incluindo Cloudflare Pages no preview e Android debug. O `test:quality` completo passou na `main` no commit `7a193ec`. A [release Android assinada](https://github.com/socrateslever1/CapitalFlow/releases/tag/android-signed-beta) foi publicada a partir desse commit: pacote `com.socrateslever.capitalflow`, `versionCode 100586`, com APK e SHA-256.

**Pendente:** o check do Cloudflare Pages para a publicação de produção falhou imediatamente nos commits `aa7bad8` e `7a193ec`; o preview do PR passou. O erro detalhado exige consulta aos logs da [publicação no Cloudflare](https://dash.cloudflare.com/?to=/0d878b1f166abfbb2f7c17538d6509b8/pages/view/capflow/41aa312d-e850-4a6f-a45f-3eb07c9ab56d). Não houve validação em aparelho físico.
