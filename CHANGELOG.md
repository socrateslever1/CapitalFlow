# Changelog

Registro das alterações entregues ao CapitalFlow. A data identifica a integração no código; a publicação web e a release Android são verificadas separadamente. Novos commits não implicam automaticamente incremento da versão numerada.

## 22/11/2026 — Cartões, empréstimos e lançamento rápido Android

**Status de código:** integrado na `main`; versão exibida no Perfil `3.5.0`. Os commits não representam, isoladamente, novo APK assinado.

| Entrega | Código |
| --- | --- |
| Empréstimo financiado pelo cartão pode conciliar compra já cobrada, com data, valor, identificação e controle de idempotência; a finalização não debita novamente o capital da fonte. A migração foi aplicada e verificada no Supabase em 22/11. | [`3665703`](https://github.com/socrateslever1/CapitalFlow/commit/366570372e82cba3950515ae7d27f3327465cc63), [`b781da5`](https://github.com/socrateslever1/CapitalFlow/commit/b781da59539c29afb329d006f3f2c8df5599377c), [`7f0246a`](https://github.com/socrateslever1/CapitalFlow/commit/7f0246acebf7ddfa468ac81d62c2ebc8e5305e78). |
| Cartões: diferenças de faturas calculadas descontando créditos/estornos, limite do banco apresentado separadamente do estimado, atualização manual da referência datada e formatação da data em Manaus. | [`48d92e8`](https://github.com/socrateslever1/CapitalFlow/commit/48d92e8902b7509c85ded5a2deb813a1be502724), [`e7628bb`](https://github.com/socrateslever1/CapitalFlow/commit/e7628bb208a2822db1cac15e58aea9a42fdaa524), [`cfc98cf`](https://github.com/socrateslever1/CapitalFlow/commit/cfc98cf27c2ee843cb93ef31c487dc1e9227a65d). |
| Configuração de lançamento rápido movida do topo do Perfil para Preferências & Menus, com menos texto e mesma ação. | [`19c304f`](https://github.com/socrateslever1/CapitalFlow/commit/19c304f273763f921412c9fe9018316aa4d8b2f0). |
| Notificação Android mais compacta, distinção visual dos atalhos e opção explícita de destaque sem som/vibração, respeitando canais bloqueados. O Android controla a posição final. | [`3c29710`](https://github.com/socrateslever1/CapitalFlow/commit/3c297100200e947a3580405779a53ce9d4714b02). |

**Evidência de integração:** para `3c29710`, os checks `agent-execution-contract`, `build-finance-architecture`, `wallet-functional-regression`, `load-smoke`, `ai-routing`, `android-debug` e Cloudflare Pages concluíram com sucesso. **Limitação:** `android-debug` não comprova APK release assinado ou validação visual em aparelho. Divergências bancárias preexistentes continuam pendentes de conciliação; nenhum acerto artificial de saldos é descrito como realizado.

## 21/11/2026 — Busca, faturas e experiência mobile

**Status de código:** integrado na `main`, sem confirmação de incremento da versão numerada.

| Entrega | Commits |
| --- | --- |
| Buscas no extrato por valores, datas e demais campos; pesquisa de contratos sem ficar coberta pelo teclado e ações flutuantes do Android. | `e27d168`, `cc42057` |
| Faturas com informações principais mais compactas; detalhes recolhíveis, logotipos bancários e abertura de fatura detalhável; vencimento exato do emissor preservado. | `dba2d78`, `f1eedb5`, `dc33e2f`, `82eaa15`, `02c592f`, `dd4cd9b` |
| Logotipos de instituição nos lançamentos e seletores; contexto de origem e saldo projetado em transferências. | `95d4174`, `75c8f33`, `603c4f0`, `156f611` |
| Registro manual de despesa mais resiliente a esperas e categorias sugeridas conforme descrição. | `452a334` |

**Validação:** registro retrospectivo baseado nos commits listados; os resultados individuais dos pipelines de 21/11 não foram revalidados nesta regularização. Sem alegação de teste visual em aparelho.

## 20/11/2026 — Operações e conciliação da Carteira

**Status de código:** integrado na `main`, sem confirmação de incremento da versão numerada.

| Entrega | Commits |
| --- | --- |
| Expansão dos componentes modulares de Carteira, gestão de clientes/grupos e composições de empréstimos. | `e6ff510`, `e256a37`, `011e5a2` |
| Navegação para contas, edição auditável e descrições financeiras; separação de desembolsos financiados em cartão dos extratos de contas bancárias. | `a9cb6bf`, `015d688`, `98e1730`, `4910da1` |
| Mecanismos de conciliação de débitos duplicados vinculados a empréstimos no cartão, com estorno auditável. | `66972c2` |
| Ajustes de testes de regressão da fatura para Quality Gates e compilação Android. | `b2e74ce` |

**Validação:** resumo de alterações rastreadas no repositório; a existência dessas correções não significa que todas as operações históricas estejam conciliadas.

## 19/11/2026 — Vínculo cartão/contrato (PicPay) e sincronização entre páginas

**Código:** integrado na `main` pelo commit `18d91d1`. Sem alteração de migrations, RPCs, ledger, RLS ou dados históricos.

| Mudança | Onde foi alterado |
| --- | --- |
| Elimina alerta falso de saldo/carteira negativa quando o contrato usa fonte `CARD` (ou `MISTO` com `CREDIT_CARD`) e bloqueia a combinação inválida `CARD + Débito em conta`. | `features/loans/domain/cardFundingSource.ts`, `features/loans/hooks/useLoanForm.ts`, `features/loans/domain/loanForm.validators.ts`, `components/forms/LoanFormFinancialSection.tsx`. |
| Pré-validação do vínculo `capital_source_wallet_references` → `personal_wallet_cards` (cartão ativo e limite disponível em centavos) antes de gravar novo contrato no cartão. | `services/contracts.service.ts`, `features/loans/domain/contractSaveError.ts`. |
| Barramento central de sincronização entre páginas e funções (`wallet-updated`, `sync-requested`, `source-origins-updated`) conectado em emissão de contrato, aporte, transferência Capital ↔ Carteira, vínculos e modais da Carteira. | `utils/appSyncEvents.ts`, `hooks/controllers/useLoanController.ts`, `components/modals/NewAporteModal.tsx`, `components/sources/SourceWalletReferencePanel.tsx`, `features/wallet/components/CapitalSourceTransferModal.tsx`, `components/wallet/QuickExpenseModal.tsx`, `features/wallet/components/QuickIncomeModal.tsx`, `components/wallet/AccountActivityPanel.tsx`, `components/wallet/AccountMovementModal.tsx`, `components/wallet/CardEditModal.tsx`. |
| Testes de contrato/cartão e conexões de sincronização entre páginas. | `tests/architecture/app-sync-connections.test.ts`, `tests/financial/loan-origin-and-card-defaults.test.ts`, `tests/wallet/loan-financial-calculator.test.ts`. |

**Validação:** `tests/architecture/app-sync-connections.test.ts` (2/2), `npm run test:quality` completo (`exit code 0`, incluindo `tsc -b && vite build`, testes financeiros, arquiteturais, i18n, UI copy e Carteira) e `git diff --check`. Sem validação visual em aparelho físico.

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
