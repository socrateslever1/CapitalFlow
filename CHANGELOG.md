# Changelog

## 25/11/2026 — Migrations da Carteira aplicadas no Supabase de produção

**Banco de produção atualizado; sem mudança de código.** Aplicadas, nesta ordem, as migrations que estavam pendentes, cada uma em transação e registrada em `supabase_migrations.schema_migrations` com a versão do arquivo:
- `20261124120000_wallet_purchase_date_invoice_routing` — fatura escolhida pela data da compra, com fechamento exclusivo (`private.wallet_card_first_due_date`, `wallet_card_due_in_month`, `wallet_card_cycle_due_for_date`).
- `20261124150000_wallet_edit_expense_preserve_installments` — edição só de texto preserva as parcelas; a recriação mantém a numeração original.
- `20261125090000_card_funded_loan_uses_start_date` — compra no cartão de empréstimo financiado usa `start_date` (limitada a hoje).

**Verificação antes de aplicar:** as versões remotas de `wallet_card_first_due_date` (19/11) e `finalize_card_funded_loan_v1` (22/11, conferida pelo tamanho idêntico do corpo) eram as bases das novas migrations; a coluna `contratos.start_date` existe. **Verificação depois de aplicar:** as três versões estão registradas; as funções `private.*` não são executáveis por `anon` nem por `authenticated`; as RPCs públicas são executáveis só por `authenticated`; o teste do ciclo com um cartão fictício (fecha dia 24, vence dia 5) dá 23/11 → vencimento em 05/12 e 24/11 → vencimento em 05/01. Nenhum dado existente foi alterado. Aplicado pelo SQL Editor do painel, porque o conector do Supabase não estava disponível na sessão. Migrations locais antigas que não aparecem no histórico remoto (17/11 e 19/11) não foram tocadas.

## 25/11/2026 — Cartões no modo web e data da compra de empréstimo financiado por cartão

**Código na main (produção); migration ainda não aplicada no Supabase.**
- **Cartões no computador (mouse e tela a partir de 1024 px):** todos os cartões aparecem lado a lado; clicar seleciona, setas do teclado trocam, o cartão inclina seguindo o cursor e o verso abre pelo botão "Ver verso". Copiar final, titular e validade e "Detalhes" ficam abaixo da fileira. A área de cartões ocupa a largura toda e a fatura fica logo abaixo. No celular continua a pilha com deslizar e tocar para virar (`components/wallet/BankStack.tsx`, `features/wallet/pages/WalletCardsPage.tsx`).
- **Cartão mais claro:** a legenda "Disponível · banco dd/mm" sai do cartão e dá lugar a "Limite disponível" (a origem do valor fica no texto ao passar o mouse). Cada cartão ganha o medidor "Gasto R$ X · N% do limite" com barra, âmbar a partir de 85%, calculado a partir do disponível exibido; o cartão mantém a proporção real (1,586:1). A frente ficou só com o que informa: selo discreto do banco (nova variante `emblem` em `BankLogo`), bandeira quando cadastrada (sem o texto genérico "CRÉDITO"), limite, número e medidor; titular e validade passam ao verso, com botões de copiar, e o símbolo de aproximação foi retirado.
- **Correção visual no celular:** o rótulo do disponível passa a ocupar uma linha e o espaçamento interno foi reduzido, para que titular e validade não fiquem cortados no cartão estreito.
- **Correção — data da compra de empréstimo financiado por cartão** (migration `20261125090000_card_funded_loan_uses_start_date.sql`, **não aplicada**): `finalize_card_funded_loan_v1` usava a data de criação do contrato no sistema; agora usa a data do empréstimo (`start_date`), limitada a hoje. O modo "cobrança bancária já realizada" segue usando a data informada da cobrança. Testes em Postgres de memória (`tests/financial/card-funded-loan-wallet-charge.test.ts`).

## 24/11/2026 — Ícones de categoria com medidor nos cartões, contas e relatório

**Código em revisão (branch `feat/wallet-category-icons`).** Categorias de despesa ganham ícone e cor próprios (`features/wallet/domain/walletCategoryVisual.ts`, ícones `lucide-react`, licença ISC; nenhum arquivo de outro aplicativo é usado) e um anel medidor com a fatia da categoria no total do período (`components/wallet/CategoryGaugeIcon.tsx`).

- **Cartões:** faixa "Gastos da fatura por categoria" com as parcelas do ciclo selecionado; créditos/estornos e saldo consolidado de abertura ficam fora.
- **Contas:** lista "Despesas do mês por categoria" no detalhe da conta, com gasto médio por dia; transferências, pagamentos de fatura, receitas e lançamentos anulados ficam fora.
- **Nova despesa:** escolha de categoria por grade de ícones (`CategoryIconPicker`), mantendo "+ Nova" para categorias próprias.
- **Relatório:** rosca de participação por categoria e ícones na lista.
- **Visão geral:** "Despesas por categoria" com ícone e anel por categoria e barras na cor da categoria.
- **Correção — gastos pagos pela conta:** o resumo de despesas do mês (Visão geral e Relatório) só lia compras de cartão e mostrava "Conta 0%". Agora inclui operações `EXPENSE` saídas de conta, sem transferências, pagamentos de fatura e lançamentos anulados (`getWalletSpendingOverview`). A leitura rápida da Visão geral passa a trazer só essas despesas desde o mês anterior, com 8 colunas; o modo offline deriva do snapshot completo.
- **Classificação automática ampliada** (`classifyStatementDescription`): IOF, encargos, juros e rotativo → "Juros e encargos"; parcelamento da fatura → "Parcelamento de fatura"; Detran/IPVA/IPTU → "Impostos e taxas"; serviços digitais (Google, YouTube, iCloud etc.) → "Assinaturas"; abreviações de delivery/restaurante/hipermercado → "Alimentação". Pagamentos a pessoas e intermediadores continuam em "Outros".
- **Edição sem destruir parcelas** (migration `20261124150000_wallet_edit_expense_preserve_installments.sql`, **não aplicada**): `personal_wallet_update_expense_idempotent` deixa de apagar e recriar parcelas quando só descrição, categoria ou observação mudam; quando valor, data ou mês da fatura mudam, recria mantendo a numeração original (11/18 continua 11/18). Mesma assinatura, permissões, idempotência e trava de limite. Teste: `tests/wallet/wallet-edit-expense-preserve-installments.test.ts`.
- Cálculo em centavos com percentuais que somam 100 (`walletCategoryBreakdown.ts`). Somente leitura: sem orçamento, sem mudança de dados, RPC, migration ou RLS. Testes em `tests/wallet/wallet-category-visuals.test.ts`. Sem validação em aparelho físico.

## 24/11/2026 — Corrigir ciclo de fatura, fatura atual, previsão e disponível dos cartões

**Código em revisão (branch `fix/wallet-cycle-logic`; migration ainda não aplicada no Supabase).** Correções de lógica da Carteira encontradas em auditoria somente leitura de um cartão real:

- **Compra lançada com atraso:** `private.wallet_card_first_due_date` (migration `20261124120000_wallet_purchase_date_invoice_routing.sql`) deixa de usar `greatest(data_compra, hoje)`. A compra vai para a fatura da data da compra; se essa fatura já fechou, só a recebe enquanto não venceu e não tem pagamento registrado/parcela quitada. Fatura vencida ou paga não é reaberta (vai para a aberta), preservando o cadastro de parcelados antigos. O limite da situação inicial do cartão continua respeitado. Espelho no frontend: `resolvePurchaseInvoiceMonth` e `getSettledInvoiceMonths` (`components/wallet/invoiceStatementDomain.ts`), usados por `QuickExpenseModal` e `QuickWalletActionsModal`.
- **Trava de data no lançamento rápido alinhada:** em fatura fechada, a data máxima passa a ser a véspera do fechamento (`lastPurchaseDate`) e a compra no próprio dia do fechamento é tratada como da fatura seguinte, coerente com o roteamento.
- **Fechamento exclusivo:** compra feita no dia do fechamento entra na fatura seguinte; no dia do fechamento a fatura aparece como fechada (`getPurchaseInvoiceMonth`, `resolveInvoiceCycleState`, `checkClosedOrPaidInvoiceWarning` e a nova função SQL).
- **Fatura atual:** `getCardCreditPosition` usa a primeira fatura com saldo ainda não vencida; sobras de faturas vencidas aparecem em `overdueInvoices`. O total comprometido do limite não muda.
- **Previsão do mês:** faturas e contas a pagar vencidas e não pagas passam a entrar na projeção (Visão geral, `walletBalanceDomain`, `PersonalWalletPage`).
- **Disponível do banco:** a referência bancária salva é reduzida pelas compras registradas depois dela com data posterior ao dia da referência e identificada como "Banco · dd/mm + lançamentos". Pagamentos não são somados para não superestimar o disponível.
- **Tela da fatura (Cartões):** o valor principal passa a ser o saldo lançado no app; o total informado pelo banco aparece como "banco informou". A fatura é nomeada pelo mês de vencimento ("Fatura dez/2026", com "Fecha 24/11 · vence 03/12/2026") e a tela abre na fatura a pagar (fechada e ainda não vencida), não na próxima. O disponível passa a ser rotulado "Disponível · banco dd/mm + lançamentos". O aviso de diferença da fatura desconta as compras lançadas depois da referência do banco e só aparece quando sobra diferença não explicada, sugerindo conferir compra repetida ou ajuste do banco.
- **Revisão de integração:** o cálculo da diferença também desconta pagamentos registrados após a referência bancária; um pagamento parcial reduz a diferença pelo valor pago. A trava de compra posterior ao fechamento funciona mesmo antes de a data de fechamento chegar no calendário atual. Na edição de compra importada (ex.: 11/18), recria apenas as parcelas restantes até 18/18. Edições que reduzem uma posição acima do limite são permitidas, e vencimentos explícitos não contornam o mês mínimo de abertura do cartão.
- **Não alterado:** lançamentos, saldos, pagamentos, ledger, RLS, contratos e dados existentes. A migration só substitui a função de roteamento e cria duas funções auxiliares privadas.
- **Testes:** testes de ciclo, referência bancária/pagamentos, parcelas importadas, classificação e fechamento executados; veja resultados completos em `docs/CARTEIRA_CONTINUIDADE.md`. Sem validação em aparelho físico.

## 24/11/2026 — Apresentação bancária do extrato, lançamento rápido e navegação da Carteira

**Código em revisão.** Refinados a barra de busca/resumo em linha única (inclusive no celular) em `AccountActivityPanel.tsx` e `CardInvoiceStatement.tsx`, as validações do `QuickExpenseModal.tsx` / `FinancialCalculatorInput.tsx` e o atalho principal `MY_WALLET` em `App.tsx`:
- **Navegação da Carteira:** clicar em **Carteira** na barra inferior ou no topo enquanto um cartão, conta ou subpágina (`/carteira/*`) está aberto agora leva diretamente para `/carteira/visao-geral` sem navegar para `/` nem acionar o retorno involuntário ao Painel (`goBackPage()`).
- **Extratos:** busca e resumo lado a lado em `grid-cols-[minmax(0,1fr)_auto]`, valores monetários com `tabular-nums`, espaçamento de sinal (`+ R$` / `− R$`), proteção `PrivateMoney`, ícone direcional e ações `Editar` / `Excluir` na mesma linha sem pílula redundante `Movimentação` em despesas.
- **Lançamento rápido:** campo monetário passa a bloquear letras na digitação e na colagem (`isAllowedFinancialInputDraft`), a categoria acompanha automaticamente a descrição reconhecida (ex.: `Google` → `Serviços`, sem sobrescrever escolha manual), e faturas fechadas/vencidas/pagas limitam a data da compra ao dia do fechamento (`max`), exibindo alerta curto de uma linha e impedindo gravar compra posterior ao fechamento naquele ciclo. Nenhuma alteração em cálculos contábeis, saldos, RPCs, migrações ou RLS.

## 23/11/2026 — Melhorar a leitura do cabeçalho de empréstimos

**Código em revisão.** O resumo de capital, encargos e valor original foi reorganizado em blocos próprios quando o cartão está expandido; identificador e valor principal permanecem em áreas separadas. Alteração de apresentação no componente `LoanCardComposition/Header.tsx`; sem mudança de cálculo ou persistência.

## 23/11/2026 — Corrigir carregamento de telas no PWA

**Código em revisão.** Falhas no CacheStorage ao procurar ou gravar um chunk JavaScript não bloqueiam mais a resposta da rede. Isso evita que quota cheia ou erro local de cache impeça a abertura de páginas carregadas sob demanda, incluindo Administração. Cobertura de regressão adicionada para falhas de leitura e gravação. `npm run test:wallet-pwa-legal`, `npm run build` e `npm run test:quality` passaram; revisão independente sem bloqueios. Não houve validação no PWA instalado ou em dispositivo. Sem alterações financeiras, Supabase, dados ou rotas.

Registro das alterações entregues ao CapitalFlow. A data identifica a integração no código; a publicação web e a release Android são verificadas separadamente. Novos commits não implicam automaticamente incremento da versão numerada.

## 22/11/2026 — Evitar oscilação entre limite estimado e referência bancária

**Código em revisão.** A tela Cartões usa imediatamente as referências existentes no snapshot da Carteira e não apresenta uma estimativa provisória enquanto a leitura específica do cartão estiver pendente. Resultados atrasados são isolados por cartão e geração do snapshot; cartão e resumo compartilham a seleção de referência da Visão geral. Estados de ausência, consulta e falha são distintos. Nenhum dado, limite, fatura, pagamento, contrato, RLS ou migração foi modificado. Testes e revisão independente são necessários antes do merge.

## 22/11/2026 — Fluxo dos atalhos e estado do canal Android

**Implementação em revisão:** o toque no corpo da notificação abre a Visão geral, enquanto os botões exclusivos continuam abrindo, respectivamente, gastos e entradas. O estado do canal é reconsultado ao retornar das configurações do Android, com proteção contra respostas atrasadas; bloqueio do sistema não aparece falsamente como "Ativada". O reinício não publica ações antes da autenticação. Sem serviços permanentes ou mudanças em Supabase, saldos, RLS ou contratos. Teste no aparelho, revisão independente e publicação assinada requerem evidência separada.

## 22/11/2026 — Ajuste do destaque de notificações Android

**Código em revisão (não implica APK publicado).** A notificação do lançamento rápido em modo destacado deixa de aplicar `setSilent(true)` incondicional; o modo normal continua de baixa importância e silencioso. Preservados o canal secundário de importância padrão, a ausência de som e vibração, a permissão e os canais bloqueados pelo usuário. O Perfil passa a exibir a importância efetiva do canal e abrir as configurações nativas para ajuste de prioridade. O Android/One UI decide a ordem final. Sem alterações financeiras, backend, RLS ou de permissão adicional. Testes automatizados e revisão independente pendentes de comprovação pelo CI.

## 22/11/2026 — Coerência dos valores e retorno hierárquico na Carteira

**Código:** nova correção na `main`, sem incremento de versão numerada nem alterações de dados financeiros.

- **Valores:** Visão geral, lista de cartões e detalhes reutilizam a mesma referência bancária mais recente, datada, ou o valor estimado quando não há observação válida. Totais mistos são identificados como tal; não substituem reconciliação financeira.
- **Origem dos dados:** a consulta rápida de Visão geral aproveita a busca já existente de fatos bancários para trazer a referência datada. Ao abrir, revalida o resumo e informa falha se os dados não puderem ser sincronizados. Cache e modo offline preservados.
- **Navegação:** acesso direto ao cartão ou conta passa por lista de Cartões/Contas no histórico. Voltar no Android e no detalhe retorna à seção, depois à Visão geral, depois ao Painel; deep links sem histórico usam fallback local seguro.
- **Arquivos:** `features/wallet/domain/cardAvailablePresentation.ts`, `services/personalWallet.service.ts`, `features/wallet/services/walletOfflineStore.ts`, `features/wallet/pages/WalletOverviewPage.tsx`, `features/wallet/components/WalletOverviewSummary.tsx`, `features/wallet/pages/WalletCardsPage.tsx`, `features/wallet/pages/WalletAccountsPage.tsx`, `features/wallet/WalletModule.tsx`, `components/wallet/BankStack.tsx`, `features/wallet/components/WalletBalanceDock.tsx`.
- **Testes:** `tests/wallet/card-available-presentation.test.ts`, `tests/wallet/wallet-summary-render.test.tsx`, `tests/architecture/wallet-detail-navigation.test.mjs` e regressões de cache/cálculo; execução de CI pendente antes da aprovação.

**Limites:** observação bancária não é consulta em tempo real. Divergências entre o banco e o ledger continuam explicitamente identificadas. Sem alterações de saldos, contratos, parcelas, RLS ou migrações. Teste visual no aparelho ainda pendente.

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
