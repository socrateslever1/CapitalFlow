## 25/11/2026 — Cartões no web (fileira, mouse, medidor) e data de compra de empréstimo por cartão

- **Pedido:** opções 1 + 3 + 4 para o cartão no modo web (cartões lado a lado, interação de mouse, medidor de limite) e correção da data da compra gerada por empréstimo financiado por cartão (já registrada como risco em 20/11: `finalize_card_funded_loan_v1` usava `created_at`).
- **Evidência (leitura):** empréstimo com data de início anterior, digitado dias depois, gerou compra no cartão com a data de digitação. Outros vínculos recentes já estavam com a data do empréstimo.
- **Correção de dados autorizada pelo usuário:** a compra desse empréstimo teve a data ajustada para a data do empréstimo via `personal_wallet_update_expense_idempotent` (compra 1x; mesma fatura, valor e parcela; `request_id` fixo). Nada mais foi alterado.
- **Código:** migration `20261125090000_card_funded_loan_uses_start_date.sql` (**não aplicada**; rollback = reaplicar a função de `20261122073000`). `BankStack` ganha modo web por `matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)')`, mantendo a pilha no celular; ações compartilhadas; medidor via `cardLimitUsagePercent`.
- **Verificação visual:** conferido no navegador do app em 1280×800 (fileira, seleção, verso) e 375×812 (pilha, medidor, conteúdo do cartão sem corte). Sem aparelho físico.
- **Pendências:** aplicar as migrations pendentes; editar a data de início do contrato ainda não altera a compra já gerada no cartão.

## 24/11/2026 — Ícones de categoria com anel medidor (branch `feat/wallet-category-icons`)

- **Pedido:** ícones nas categorias e um medidor gráfico nos ícones, nos cartões e nas contas, inspirado em apps de finanças pessoais. A cópia local de outro aplicativo indicada pelo usuário não contém o pacote de ícones de categoria (só favicons e código compilado), e esses desenhos são de terceiros; foram usados ícones `lucide-react` com cores próprias.
- **Decisão do usuário:** o anel mede a **fatia da categoria no total** do período (não orçamento), sem tabela nova no Supabase.
- **Implementação:** ver `CHANGELOG.md` 24/11/2026. Cartão: parcelas do ciclo selecionado; conta: operações `EXPENSE` do mês saídas da conta, sem anuladas/estornos. Percentuais por maior resto (somam 100).
- **Conflitos previstos:** `QuickExpenseModal.tsx` também é alterado por trabalho não commitado na `main` (categoria automática); a troca do seletor ocupa o mesmo trecho e precisará de ajuste simples ao integrar (`value={effectiveCategory}` e `setCategoryManuallySelected(true)` no `onChange`).
- **Reclassificação autorizada pelo usuário (24/11):** com o classificador ampliado, 14 lançamentos de cartão que estavam em "Outros" receberam a categoria sugerida por `UPDATE` restrito à coluna `category` (IDs explícitos, só se ainda em "Outros", fora cancelados e saldos de abertura). Não foi usada `personal_wallet_update_expense_idempotent` porque ela recria as parcelas (renumera e redivide valores), o que corromperia parcelados importados. Valores, datas, parcelas e saldos não foram tocados. Os demais lançamentos em "Outros" são pagamentos a pessoas ou intermediadores sem tipo de comércio identificável.
- **Visão geral (pedido do usuário):** ícones e anel também em "Despesas por categoria". Na conferência apareceu outra falha: o resumo de gastos ignorava as despesas pagas por conta (só lia `personal_wallet_expenses`), exibindo "Conta 0%" com despesas de conta existentes no mês. Corrigido em `walletSpendingInsights.ts`, `loadOverview` (consulta filtrada `operation_type = EXPENSE` desde o mês anterior) e derivação offline; testes de arquitetura da leitura rápida atualizados de 9 para 10 fontes, mantendo a exclusão das demais tabelas pesadas.
- **Correção da edição (autorizada pelo usuário):** migration `20261124150000_wallet_edit_expense_preserve_installments.sql` faz a RPC de edição preservar as parcelas em mudanças só de texto e manter a numeração original quando precisa recriá-las. **Não aplicada** no Supabase; aplicar após aprovação, conferindo com `pg_get_functiondef`. Rollback: reaplicar a definição de `20261030200500_wallet_cancel_invoice_consolidation.sql`.
- **Pendências:** validar em aparelho; aplicar a migration de edição; orçamento por categoria fica para depois, se desejado (exige migration).

## 24/11/2026 — Correção de ciclo de fatura, fatura atual, previsão e disponível (branch `fix/wallet-cycle-logic`)

- **Consolidação:** commit `4040a8a` reúne os commits `c43f352`, `4c071f2`, `cc3abc5`, `bb6a5cb`, `cb1a112` e a versão local `6cfdc3c`, além das alterações não commitadas da `main` preservadas em stash e dos reforços de revisão descritos abaixo. A versão remota anterior `ef9bb21` foi lida; as diferenças úteis já estão na versão local mais completa.
- **Origem:** estudo da lógica da Carteira e auditoria somente leitura de um cartão real (consultas `SELECT` e PDFs de fatura do próprio usuário). O app reproduzia fielmente o extrato em aberto importado; a diferença estrutural de limite vinha de uma compra parcelada antiga ausente desse extrato e presente apenas na fatura fechada.
- **Mudanças:** ver `CHANGELOG.md` 24/11/2026. Regra de roteamento: data da compra; fatura fechada recebe a compra só até o vencimento e sem pagamento; fechamento exclusivo; nunca antes da situação inicial. Tela de Cartões: fatura nomeada pelo vencimento, valor lançado em destaque, abertura na fatura a pagar, aviso só para diferença não explicada e rótulo "Disponível · banco dd/mm + lançamentos".
- **Riscos e rollback:** migration `20261124120000_wallet_purchase_date_invoice_routing.sql` **não aplicada**; aplicar só após aprovação do PR, verificando com `pg_get_functiondef`. Rollback: reaplicar a definição de `private.wallet_card_first_due_date` de `20261119205000_wallet_card_open_cycle_default.sql` e reverter os commits. Nenhum dado existente é reescrito pela migration.
- **Limitações conhecidas (revisão independente):** a prévia do `QuickExpenseModal` não conhece pagamentos registrados (a RPC corrige e, nesse caso, grava o dia 1º do mês, comportamento anterior); diferença SQL/TS pré-existente quando o dia de vencimento não existe no mês; `private.wallet_invoice_cycle_state` (sem chamadas atuais) ainda trata o fechamento como inclusivo; a herança de mês em `QuickExpenseModal` ainda usa a data efetiva antiga. As mudanças de apresentação posteriores não passaram por nova revisão independente.
- **Testes executados:** `npx tsc --noEmit` ok; `npm run test:quality` exit 0 (56 suítes, build incluída); `npm run test:wallet-visual-next` 62/62; `tests/wallet/*` com 1 falha **pré-existente na `main`** (`wallet-floating-dialogs.test.ts`, também falha sem estas mudanças); `test:app-updates` e `profile-changelog-sync` ok; `git diff --check` limpo. Uma execução intermediária falhou no precache PWA por duas builds simultâneas no mesmo `dist`; build isolada e reexecução passaram.
- **Teste guiado e reconciliação:** feitos com o usuário em servidor local da branch, comparando com a fatura fechada do emissor. Após ajustes de dados autorizados pelo usuário, executados pelas RPCs existentes da interface (`personal_wallet_update_card_metadata`, `personal_wallet_cancel_expense_idempotent`, `personal_wallet_update_expense_idempotent`, `personal_wallet_record_card_purchase_atomic`, com `request_id` fixos), a fatura do mês ficou igual à do emissor e o limite usado com diferença de centavos. Valores e identificadores financeiros não são registrados aqui por política do repositório. Sem aparelho físico.
- **Pendências:** aplicar a migration após aprovação; validar no aparelho; o emissor varia o dia de fechamento entre meses, então o cadastro do cartão precisa acompanhar.
- **Revisão independente da consolidação:** corrigido o aviso de data após fechamento quando `today < closingDate`; cálculo da diferença agora desconta pagamentos da mesma fatura registrados após `referenceUpdatedAt`; lojas Apple/Google são classificadas como compras, mantendo Google Play/iCloud como assinaturas. Migration de edição corrigida para importar apenas o número de parcelas restantes (11/18 → oito linhas, até 18/18), sem projetar parcelas 19–28. A trava da edição compara a posição antes/depois, permitindo redução válida acima do limite, e a migration de ciclo também limita `p_explicit_due_date` ao mês mínimo de abertura.
- **Verificação nesta consolidação:** `npm run test:quality` passou com build e todas as suítes, incluindo `test:wallet`; dentro dele, 404 testes TS/TSX + 34 MJS passaram e `test:wallet-visual-next` passou 62/62. Os testes financeiros direcionados passaram 44/44; `git diff --cached --check` limpo. A validação PostgreSQL real não foi possível: Supabase CLI, Docker e `psql` não estão instalados neste ambiente; nenhuma migration foi aplicada ao banco.

## 24/11/2026 — Extratos compactos e validações de UX no Lançamento Rápido (`FinancialCalculatorInput.tsx`, `QuickExpenseModal.tsx`, `minhasFinancasWalletTools.ts`)

- **Problemas observados nas capturas:**
  1. `FinancialCalculatorInput.tsx` aceitava letras (ex.: `"Google"`) no rascunho quando `formatMoneyExpressionOperand` retornava `null` e caía no fallback `setDraft(next?.value ?? raw)`.
  2. `QuickExpenseModal.tsx` mantinha `Categoria` fixa em `Alimentação` sem chamar `suggestWalletAccountCategory(description, categoryManuallySelected)`, e termos digitais comuns como `Google` não estavam mapeados em `classifyStatementDescription`.
  3. Ao selecionar fatura fechada/vencida/paga, exibia-se um parágrafo longo de 4 linhas mesmo com data compatível e permitia-se informar data posterior ao fechamento do ciclo.
  4. Nos extratos (`AccountActivityPanel.tsx` e `CardInvoiceStatement.tsx`), busca e resumo empilhavam no mobile.
  5. Clicar no botão `Carteira` (`MY_WALLET`) com um cartão aberto (`/carteira/cartoes?card=...`) caía no `Painel`: `handleSetActiveTab('MY_WALLET')` em `App.tsx` redirecionava para `'/'`, disparando o efeito de `previousPathname.startsWith('/carteira') && location.pathname === '/'` que chamava `goBackPage()`.
- **Refinamentos aplicados:**
  - `App.tsx` + `hooks/usePersistedTab.ts`: `handleSetActiveTab('MY_WALLET')` passa a direcionar para `/carteira/visao-geral` (mantendo o usuário na Visão geral da Carteira mesmo quando já está dentro de um cartão/conta), e `usePersistedTab` preserva rotas explícitas diferentes de `'/'` no carregamento inicial.
  - `liveBrazilianMoneyInput.ts` + `FinancialCalculatorInput.tsx`: guarda `isAllowedFinancialInputDraft` bloqueia letras e caracteres inválidos em tempo real (`onChange` e `onPaste`), aceitando apenas algarismos, separadores e operadores aritméticos válidos.
  - `QuickExpenseModal.tsx` + `utils/walletStatementPdf.ts`: conectada sugestão automática por `suggestWalletAccountCategory` (preservando escolha manual via `categoryManuallySelected`) e ampliado reconhecimento de serviços digitais (`Google`, `Apple`, `iCloud`, `Microsoft`, `OpenAI`, `ChatGPT`, etc. → `Serviços`).
  - `minhasFinancasWalletTools.ts` + `QuickExpenseModal.tsx`: `checkClosedOrPaidInvoiceWarning` agora expõe `closingDate`, `isDateAfterClosing` e `shortMessage`. Em fatura fechada/vencida/paga, o campo `Data da Compra` limita `max={closingDate}`, desabilita atalhos `Hoje`/`Ontem` posteriores ao fechamento, bloqueia o envio se `expenseDate > closingDate` e exibe aviso curto de 1 linha (`Data após o fechamento (DD/MM)...` em vermelho quando inválida, ou `Fatura fechada · aceita compras até DD/MM.` quando válida).
  - `AccountActivityPanel.tsx` + `CardInvoiceStatement.tsx`: busca e resumo em linha única (`grid-cols-[minmax(0,1fr)_auto]`) inclusive no celular, com valores alinhados ao topo e `Editar`/`Excluir` lado a lado.
- **Escopo e segurança:** frontend/UX e validações locais de formulário; zero alterações em cálculos de saldo, ledger ou RLS; há migrations na integração descritas acima e não aplicadas. Sem validação em aparelho celular físico.

## 22/11/2026 — apresentação estável dos limites nos cartões

- **Evidência:** Bradesco mostra primeiro R$ 3.386,87 como estimativa e depois R$ 2.683,51 como referência bancária, sem nenhuma alteração financeira entre as capturas.
- **Causa:** `WalletCardsPage` começa com `invoiceFacts=[]` e consulta as referências bancárias separadamente, mesmo quando `WalletSnapshot.cardInvoiceFacts` já as contém. `BankStack` então recai na estimativa durante a espera.
- **Concorrência (revisão independente):** tanto a busca automática quanto o refresh manual usam uma geração compartilhada. Uma consulta atrasada não sobrescreve estado mais novo nem deixa a interface em carregamento sem nova requisição.
- **Correção:** as referências do snapshot completo são usadas no primeiro render; a consulta individual posterior é associada à identidade do cartão e do snapshot, ignorando resultado assíncrono antigo. Um único cálculo de apresentação alimenta o cartão e o resumo, como na Visão geral. Ausência de referência é distinguida de leitura pendente ou falha de rede. A troca de cartão usa imediatamente sua referência já em memória.
- **Escopo:** frontend e testes somente; nenhum saldo, limite, fatura, ledger, contrato, migração, RPC ou política RLS alterados.
- **Validação requerida:** testes unitários, arquitetura, Quality Gates, revisão independente, Android debug e inspeção visual do aplicativo; não afirmar publicação antes de verificar release.

## 22/11/2026 — auditoria complementar dos atalhos e atualização de canal

- **Toque no corpo:** o clique antes abria o formulário de gasto mesmo com instrução "Escolha uma ação". Agora abre somente `/carteira/visao-geral` com ação nativa `wallet` autenticada, isolada dos botões de gasto e entrada.
- **Retorno ao Android:** a tela de Preferências consulta o estado no `focus`, `pageshow` e `visibilitychange` visível, descartando respostas atrasadas concorrentes ao alterar as preferências. Quando bloqueada pelo sistema, a indicação não diz indevidamente "Ativada".
- **Reinício:** sem receiver de `BOOT_COMPLETED` intencionalmente; o atalho não é recriado fora de sessão validada. Após autenticação o módulo nativo reaplica as preferências por perfil. Não usar foreground service artificial.
- **Invariantes:** sem mudanças de banco, cartões, lançamentos, contas, RLS, autenticação ou fluxo financeiro; notificação acionada por intent imutável, autorizada e consumida uma vez. Testes de arquitetura acrescidos; validação da versão assinada e teste no Samsung seguem obrigatórios.

## 22/11/2026 — melhoria do destaque da notificação no Android

- **Evidência:** captura no Samsung mostra o CapitalFlow abaixo de outras notificações. Não comprova isoladamente que o usuário ativou o modo destacado ou qual ordenação está selecionada.
- **Falha do código:** canal normal `IMPORTANCE_LOW`; canal opcional `IMPORTANCE_DEFAULT`; `setSilent(true)` em ambos forçava silenciamento também no destaque.
- **Implementação:** `setSilent(!prominent())` com canal de destaque padrão sem som e sem vibração, respeitando bloqueios do sistema. API nativa `openNotificationSettings` abre o canal efetivo em Configurações ou as informações do aplicativo como fallback. `getStatus` devolve a importância real do canal e o Perfil a apresenta.
- **Limite:** nenhuma API de aplicativo pode garantir primeira posição no painel. Ordenação por horário/prioridade é preferência do Samsung e prevalece sobre a solicitação de destaque.
- **Segurança e QA:** sem mudança de contratos, ledger, contas, banco, RLS, notificações financeiras ou privilégios especiais; preservar duas ações autenticadas. Exigir `npm run test:master-tools`, `npm run test:quality`, revisor independente e teste no dispositivo. Rollback por reversão do commit único.

## 22/11/2026 — apresentação de saldos entre Visão geral e Cartões; retorno por níveis

- **Diagnóstico validado:** o resumo usava `credit_limit - used_limit` enquanto o cartão selecionado mostrava a última referência de limite disponível no banco. Ex.: Bradesco com disponível estimado de R$ 3.386,87 e referência de banco R$ 2.683,51 (datada, não tempo real). Não alterar nenhum desses valores artificialmente.
- **Mudança de apresentação:** novo domínio puro `cardAvailablePresentation` seleciona a última referência válida, identifica origem e data e mantém estimativa calculada separada. `WalletOverviewSummary`, `WalletCardsPage`, `BankStack` e `WalletBalanceDock` adotam a mesma regra. O total misto indica banco + estimado; uso percentual é estimado.
- **Dados e cache:** a consulta rápida de resumo reaproveita a tabela de fatos de fatura já consultada para obter `available_limit` e `updated_at`. A derivação offline mantém os fatos do snapshot completo. Ao abrir a Visão geral há revalidação e aviso explícito para falhas de atualização.
- **Histórico:** `WalletModule` insere lista de Cartões/Contas antes de abrir detalhe oriundo da Visão geral. Back do Android, botão Voltar e fallback de links profundos retornam primeiro à lista, depois à Visão geral e ao Painel. Preservadas rotas reais do React Router e os seletores por ID.
- **Validação:** testes de resumo, origem monetária, página e roteamento. Nenhum SQL de escrita, mudança de RLS, saldos, contratos, tarifas ou faturas. Reverter commit em caso de regressão; verificar no Samsung após APK atualizado.

## 22/11/2026 — notificação Android de lançamento rápido

- Layout nativo compacto; dois atalhos com distinção visual e ícones Android diferentes. Símbolos nos nomes devido à ocultação de ícones dos botões no Android 7+.
- Destaque **opcional** no perfil, por canal secundário `IMPORTANCE_DEFAULT` silencioso; não usa heads-up/foreground e não pode forçar topo da central de notificações. A opção respeita canais bloqueados e é reversível.
- Mantidos perfil, intents, autorização, privacidade, confirmação manual e ausência de escrita financeira. Revisar CI e testar no Samsung antes de afirmar fidelidade visual. Reverter commit para rollback.

## 22/11/2026 — Perfil Android: configuração de atalho compacta

- Transferido `AndroidQuickAccessSettings` do topo da página para `Perfil → Preferências & Menus`.
- Resumo permanente reduzido a `Lançamento rápido`, estado ativado/desativado e botão reversível. Instruções técnicas extensas removidas da interface; detalhes do comportamento e permissões permanecem em `docs/MASTER_DIAGNOSTICS_ANDROID_SHORTCUT.md`. Avisos de permissão e falhas continuam visíveis quando relevantes.
- Não altera a implementação nativa, permissões, preferência por perfil, notificações, abertura dos formulários, backend ou lançamentos financeiros. Cenários testáveis: estado ativo/inativo, alternância, ausência no perfil web, erros e permissão negada. Verificação visual em aparelho físico permanece pendente até evidência.

## 22/11/2026 — reparo transacional de empréstimos financiados por cartão

- **Falha confirmada:** função `finalize_card_funded_loan_v1` ativa no Supabase estava na versão antiga, que reduzia `fontes.balance` indevidamente e usava `funding_installments_count` (parcelas do cliente) para dividir compra no cartão. A versão segura no repositório não estava aplicada à produção.
- **Reparo:** migração `20261122073000_card_funded_historical_reconciliation.sql` restabelece a finalização sem débito da fonte/conta, mantém `LOAN_INITIAL` com metadados `source_balance_effect=NONE`, vincula compra pelo `loan_id` idempotente e utiliza `cardPurchaseInstallmentsCount` da `policies_snapshot`, padrão 1x. Em caso antigo com transação inicial já debitada, registra correção auditável no caminho existente.
- **Modo compra bancária já realizada:** o formulário exige marcação explícita, data da cobrança, valor idêntico ao total financiado e identificação textual do extrato (8–160 caracteres). Somente o administrador principal pode finalizar; SQL valida data nos últimos 366 dias, valor e referência não utilizada em outro contrato no mesmo cartão. A checagem de limite é dispensada **somente nesse modo**, para contabilizar fato já ocorrido, sem autorizar novas operações. As verificações de vínculo e cartão ativo permanecem. Data efetiva do cartão será a data confirmada da compra.
- **Efeito esperado no exemplo:** empréstimo de R$ 400, compra de R$ 419,96 no PicPay (já debitada em 20/11) não consumirá novamente saldo da fonte. O limite contábil calculado poderá ser negativo em R$ 142,06; a diferença com a posição bancária não será ocultada ou reescrita. Não cadastrar o mesmo evento com novo contrato se houver lançamento anterior.
- **Segurança e auditoria:** nenhum dado histórico é excluído ou alterado pela migração; `loan_card_wallet_charges` e `personal_wallet_expenses.request_id` preservam idempotência. O modo histórico não pode ser utilizado por contas comuns e é rastreável em `transacoes.meta` e notas da despesa. Sem mudança RLS nem uso de service-role no cliente.
- **Testes:** `tests/financial/card-funded-loan-wallet-charge.test.ts` carrega a nova migração e cobre aprovação histórica, idempotência, preservação da fonte e rejeições; `tests/financial/loan-origin-and-card-defaults.test.ts` valida input e trava normal. Deployment Supabase deve ser aplicado somente depois da aprovação CI; verificar por `pg_get_functiondef` e consultas read-only. Rollback possível via função anterior do Git (somente código), sem manipulação de saldos.

## 22/11/2026 — Bradesco: limite bancário declarado e divergência com parcelas futuras

- **Evidência read-only:** cartão Bradesco final 4999, limite R$ 10.000,00, `used_limit` R$ 6.613,13, disponível contábil R$ 3.386,87. Referência manual salva em 19/11 com disponível R$ 2.683,51 e utilizado R$ 7.316,49. Usuário informou o disponível real atual de R$ 2.621,49. Cinco despesas novas (R$ 6,60 + R$ 6,30 + R$ 33,90 + R$ 5,50 + R$ 9,72 = R$ 62,02) explicam a diferença da referência antiga; a falta de conciliação estrutural residual no limite é R$ 765,38, **não atribuída automaticamente a compras inexistentes**.
- **Erro da mensagem de fatura:** `registeredInvoiceTotalCents` antes somava débitos e crédito positivo como se todos fossem compras. Com crédito Eucatur de R$ 86,00, o bruto R$ 3.164,90 gerava diferença falsa de R$ 234,02 com a referência R$ 2.930,88. O domínio canônico já calcula o líquido R$ 2.992,90, deixando diferença correta de R$ 62,02. A UI passou a reutilizá-lo.
- **UI bancária:** `BankStack` distingue o limite estimado dos lançamentos do valor bancário efetivamente declarado, com data abreviada; `WalletCardsPage` mostra a data da referência e oferece edição consciente do disponível via serviço autenticado `saveCardInvoiceFacts`, sem alterar compras ou `personal_wallet_cards.used_limit`. O valor real fornecido no chat **não foi gravado automaticamente**. Nenhuma alteração do ledger, da posição contábil, da fatura ou do banco nesta revisão de código.
- **Segurança:** o fluxo de atualização é uma ação explícita do usuário, com validação de centavos, limite, assinatura idempotente e proteção contra duplicação; só se habilita quando há lançamentos ativos no cartão, condição em que a RPC apenas atualiza a referência informativa. As referências PDF/OFX conservam a proveniência: a edição manual só é habilitada quando a referência existente é do tipo MANUAL. Para PDF/OFX, a renovação exige nova importação com conferência. Os saldos de uso de crédito operacionais permanecem sujeitos à reconciliação dos R$ 765,38.
- **QA:** verificar `tests/wallet/wallet-ui-architecture.test.ts`, `tests/wallet/wallet-credit-phase3-ui.test.ts`, `tests/wallet/invoice-credit-separation.test.ts`, Quality Gates, `npm run build`, UI mobile. Sem migrações. Rollback: revert do commit de UI.

## 20/11/2026 — extrato de cartões sem textos redundantes

- **Diagnóstico:** na tela PicPay, saldo da fatura repetido no resumo e na fatura; dois avisos sobre o mesmo saldo inicial não detalhado; mensagens extensas de consolidação e cabeçalho do extrato repetindo vencimento e status.
- **Mudança visual:** `WalletCardsPage` substitui o bloco de três linhas por um indicador horizontal compacto apenas de próximas faturas e disponível. A fatura atual continua exibida na linha da própria fatura. Referências bancárias ficam em `<details>` recolhido. Diferenças com o banco permanecem visíveis somente se não nulas. `CardInvoiceStatement` preserva os registros e operações, mas remove os parágrafos informativos duplicados. O saldo de abertura, movimentos posteriores, total pendente e a abertura fora do ciclo continuam acessíveis pelo botão `Detalhes`, inicialmente fechado. O fechamento é abreviado no cabeçalho. 
- **Preservação:** `PrivateMoney` em todas as quantias, sem mudanças de estado financeiro, banco, limites, pagamentos, ciclos, consultas, RLS ou lançamentos. Erros da fonte bancária permanecem acessíveis na área de valores do banco. A informação não detalhada é conservada.
- **Validação:** `tests/wallet/wallet-ui-architecture.test.ts`, `npm run build` e Quality Gates do CI. Inspeção visual do APK não realizada neste fluxo; rollback por revert, sem migrations.

## 20/11/2026 — fontes do contrato com marcas e fatura de abertura dinâmica

- **Escopo:** investigação read-only confirmou `INVOICE_OVERRIDE` inicial de R$ 1.007,87 em dezembro/2026, junto com sete compras posteriores que totalizavam R$ 1.695,53. O total do ciclo é R$ 2.703,40, não uma fatura congelada de R$ 1.007,87. Os sete lançamentos não estão ligados à abertura por `opening_invoice_id`.
- **Ajuste visual na fatura:** `getInvoiceOpeningBreakdown` usa os ciclos já calculados em `invoiceStatementDomain` para exibir abertura (histórico), movimentações adicionais líquidas e saldo pendente atual. `CardInvoiceStatement` destaca que o registro original é um snapshot, não a fatura atual. Consolidações comuns não são tratadas como saldo de abertura dinâmico.
- **Ícones de fonte de capital:** `LoanFormFinancialSection` resolve a identidade de fontes com vínculo único de cartão pelo registro autorizado em `capital_source_wallet_references` e dados já carregados de `personal_wallet_cards`. Fonte sem vínculo mostra logo do próprio nome ou imagem configurada, sem inventar vínculo. Contas em dinheiro usam `Wallet`. `SelectOptionList` mantém logotipo também na opção selecionada.
- **Risco da data do contrato:** a RPC atual `finalize_card_funded_loan_v1` toma `created_at` em vez de `start_date`. Em seis vínculos consultados, duas datas divergiam. Nenhum lançamento retroativo foi alterado: a correção financeira exige transação com verificação de pagamentos, fechamento de ciclo, idempotência, vínculos e auditoria. O cliente também edita `contratos.start_date` sem alterar a compra no cartão. Planejar mudança backend separada.
- **Não alterado:** saldo, RLS, RPC, contrato, datas históricas, ledger, compras, faturas, Supabase e limitações bancárias. Cobertura por `tests/wallet/invoice-credit-separation.test.ts` e `tests/wallet/wallet-ui-architecture.test.ts`, com validação de CI e revisão mobile necessárias.
- **Rollback:** reverter este commit de apresentação; não há migração ou reversão de dados.

## 20/11/2026 — correção do teclado Android na pesquisa de contratos

- **Sintoma:** durante a pesquisa por nome/CPF, Gboard aparece e os FABs fixos (novo contrato, lembretes, suporte) e a navegação inferior continuam cobrindo o formulário e os contratos; o mascote também ocupa a superfície de pesquisa.
- **Causa técnica verificada:** `DashboardControls` faz `autoFocus` no campo; `AppShell` mantém `.fab-action-container` e `BottomNav` fixos; `index.css` oculta esses elementos somente em modal/edição de navegação, não quando o teclado de busca está ativo.
- **Correção:** `index.css` oculta FAB, mascote e barra inferior na largura móvel quando a pesquisa de contratos tem foco, sem alterar navegação desktop. O campo recebe teclado de pesquisa e rótulo acessível. `DashboardControls` escuta mudanças de `visualViewport`, recoloca o campo na área visível, desregistra ouvintes no cleanup, libera o foco com Enter/Escape e quando o teclado é fechado via resize após abrir.
- **Preservado:** `searchTerm`, filtros, ordenação, permissões, contratos, API, banco, ledger e funções financeiras. Nenhuma alteração ao Android nativo nem ao Supabase.
- **Validação:** cobertura estática em `tests/architecture/navigation-persistence.test.mjs`, executada em `test:navigation-persistence` pelo Quality Gates. Validação de teclado Gboard em dispositivo físico ainda não realizada. Rollback por revert do commit; nenhum dado foi mutado.

## 20/11/2026 — busca monetária e textual ampliada em extratos

- **Diagnóstico:** busca no extrato da fatura consultava apenas o valor restante da parcela formatado em texto; não encontrava valores originais da compra, parcela paga nem variantes BRL consistentemente. Extratos individuais e gerais de contas e o extrato financeiro não filtravam valores. Na tela financeira a busca não era aplicada à relação de recebíveis.
- **Implementação:** função local compartilhada em \`features/wallet/utils/financialSearch.ts\` combina termos sem acento, valores em centavos, sinais (+/-), formatos R$ 700, 700,00, 700.00, 1.700,00 e datas BR/ISO. Ligada a \`CardInvoiceStatement\`, \`AccountActivityPanel\`, \`WalletAccountsPage\` e \`FinancialStatementPage\`. Fatura inclui valor original, parcela, pago, remanescente, descrição, categoria, observações, data e indicador de parcela; o relatório financeiro também filtra recebíveis por nome, identificador e valor.
- **Preservação:** busca somente nos dados já carregados/autorizados, mantendo a fatura corrente e períodos ativos; não agrega registros de outros cartões/meses, não remove RLS, não cria escrituras financeiras ou altera banco.
- **Testes:** \`tests/wallet/wallet-financial-search.test.ts\` anexado a \`test:wallet-visual-next\` com cenários de BRL, centavos, acentos, data, sinais e compra parcelada. Verificação por GitHub Actions; teste visual em dispositivo físico não executado. Rollback por revert do commit; sem migration.

## 20/11/2026 — logotipo do cartão ativo no lançamento rápido

- **Causa:** apesar de `selectedCard` estar no estado, o modal utilizava `Receipt` no cabeçalho e `CreditCard` em todos os itens do seletor.
- **Correção:** `QuickExpenseModal` agora utiliza `BankLogo` com a instituição do cartão (ou da conta vinculada) em seu cabeçalho, lista de cartões e modo bloqueado; quando o cartão é alterado, o ícone acompanha o `selectedCardId`. Para contas, a seleção mostra o logotipo, imagem cadastrada da conta ou ícone de dinheiro para `CASH`.
- **Privacidade:** não inserir fotos do próprio cartão (`card.image_url`) nos campos de ícone; preservar o padrão de logotipo da carteira.
- **Escopo:** somente interface, teste de arquitetura e registro de continuidade. Inalterados RPCs, dados, saldos, limite, fatura e lançamento. Nenhuma despesa registrada.
- **Validação/rollback:** `test:wallet-visual-next` e `test:quality` pelo CI; revisão visual em APK físico pendente. Reverter commit caso o CI falhe.

## 20/11/2026 — destravar registro de movimentações e sugerir categorias

- **Diagnóstico:** `AccountActivityPanel.submit` aguardava `personalWalletService.recordAccountOperation` e depois `onSaved`, enquanto `notifyFinancialDataChanged({wallet:true})` já disparava o refresh da carteira. O modal permanecia em `Registrando...` até terminar a atualização integral, com consultas redundantes. Consulta read-only ao Supabase não encontrou um lançamento manual de R$ 156,88 descrito como Alimentação no intervalo consultado; isso não comprova o resultado de uma requisição ainda pendente.
- **Solução:** após confirmação da RPC, o modal libera os controles, limpa o formulário e usa exclusivamente o evento `wallet-updated` para recarregar a tela. A chamada financeira tem prazo de espera de 18 s; se a resposta for inconclusiva, busca o mesmo `request_id` sob RLS por até 6 s. Sem comprovação de gravação, preserva o formulário e o mesmo ID para repetição idempotente, alerta sobre incerteza e dispara refresh de leitura, sem criar outra escrita.
- **Categorias:** sugestões locais reaproveitam `classifyStatementDescription` do extrato OFX/PDF; textos reconhecidos atualizam a categoria exibida, mas escolhas manuais permanecem soberanas. Termos ambíguos não geram sugestão e nenhuma categorização grava transação por si só.
- **Preservado:** tabelas, saldo, RLS, RPC, ledger, parâmetros de valores, contratos, faturas e dados históricos; não houve gravações financeiras de teste. `personalWallet.service.ts` ganhou somente consulta de existência por `request_id` autenticado.
- **Testes:** contrato de sugestão em `tests/wallet/account-category-selection.test.ts`, prazo de espera em `tests/wallet/operation-confirmation.test.ts` e `test:wallet-visual-next`. Verificar CI/build e APK separadamente. Timeout não prova falha da operação: o usuário deve conferir o extrato antes de tentar novamente.
- **Rollback:** reverter apenas este commit, sem migração ou alteração de dados.

## 20/11/2026 — contexto unificado em despesa, pagamento, receita, recebimento e transferência

- **Problema:** os diálogos para Despesa, Pagamento, Receita e Recebimento não tinham logotipo ou saldo visível, embora Transferência tivesse cartão de saldo distinto.
- **Implementação:** o diálogo comum `AccountActivityPanel` usa `Modal.icon` com `AccountOptionIcon` (logo bancária/imagem personalizada e fallback) e mostra saldo contábil no CapitalFlow em todas as cinco modalidades. Todas passam a mostrar saldo projetado em centavos após o lançamento, respeitando `PrivateMoney` e edição monetária por calculadora.
- **Segurança:** pré-validação para `EXPENSE`, `PAYMENT` e `TRANSFER` impede saldo insuficiente na UI. A RPC existente continua validando autenticação, proprietário, valor, saldo com lock e idempotência. Receitas e recebimentos exibem somente a projeção, sem registrar novas entradas por esta alteração.
- **Escopo preservado:** sem SQL, sem alterações no Supabase, sem reclassificação de contas, sem alteração no mecanismo de lançamento e sem duplicar saldo. Regras especiais de faturas e PIX preservadas.
- **Testes:** `tests/wallet/account-transfer-preview.test.ts` cobre débito/crédito/precisão e `tests/wallet/wallet-ui-architecture.test.ts` cobre a interface unificada; execução de CI e validação em dispositivo devem ser verificadas separadamente. Rollback mediante revert deste commit, sem migração de dados.

## 20/11/2026 — ícones de contas na transferência interna

- **Diagnóstico:** o seletor compartilhado `SelectOptionList` já suporta `options[].icon` no menu e na opção selecionada, porém `AccountActivityPanel` fornecia somente nome e saldo.
- **Mudança de interface:** `AccountActivityPanel` passa a usar `BankLogo` da própria Carteira (com `bank_name`/`institution_key`, `nickname`, imagem personalizada `image_url` e fallback interno) na conta de origem e em cada destino. Contas do tipo `CASH` usam o ícone Wallet existente. Ícones reaparecem também quando a conta de destino já está selecionada.
- **Escopo preservado:** seletor genérico, contratos, operações, saldos, RPC, RLS, dados e Supabase não foram alterados; nenhuma operação financeira foi executada.
- **Teste:** contrato de UI adicionado a `tests/wallet/wallet-ui-architecture.test.ts`, executado pelo gate `test:wallet-visual-next`. Verificar visualmente em mobile quando o APK estiver disponível; os testes estáticos não substituem validação em dispositivo físico.
- **Rollback:** reverter somente este commit de interface se for identificada regressão de renderização.

## 20/11/2026 — saldo contextual no modal de transferência entre contas

- **Escopo:** `AccountActivityPanel`, entrada monetária compartilhada, prévia pura em centavos e testes. A conta de origem é a mesma exibida em `AccountDetailsPage`, alimentada por `personal_wallet_accounts.balance`.
- **Interface:** mostra saldo registrado do CapitalFlow no topo da transferência, saldo projetado após digitação/confirmar expressão, aviso de saldo insuficiente; respeita `PrivateMoney` na privacidade global; substitui categoria manual por `Transferência interna` neste tipo de operação e preenche descrição inicial editável.
- **Segurança:** não consulta diretamente o banco Nubank e não altera saldo por cálculo local. A pré-validação usa o valor carregado, sujeito a desatualização por mudanças concorrentes; a RPC `personal_wallet_record_account_operation` continua validando proprietário, saldo sob lock, centavos, idempotência e duas contas diferentes.
- **Banco:** inspecionados campos, RLS e definição da RPC no Supabase de produção. Nenhuma migration, alteração de política ou lançamento financeiro nesta tarefa.
- **Testes adicionados:** `tests/wallet/account-transfer-preview.test.ts` ligado a `test:wallet-visual-next`; cobre centavos, transferência integral, insuficiência e valores inválidos. Execução de testes e validação em dispositivo dependem dos checks verificáveis do GitHub Actions; não foi realizado teste em aparelho físico neste atendimento.
- **Rollback:** reverter o commit desta alteração em `main` caso o CI identifique incompatibilidade de UI. Não há rollback de dados, pois nenhum dado é modificado por esta correção.

## 20/11/2026 — conciliação financeira REAL de empréstimos pagos no cartão (Nubank)

**Causa-raiz identificada no Supabase de produção:** o gatilho \`trg_sync_transacao_to_wallet()\` efetivamente instalado era uma versão anterior ao código versionado e debitava \`personal_wallet_accounts.balance\` ao inserir qualquer \`LOAN_INITIAL\`, mesmo em contratos \`funding_payment_method=CREDIT_CARD\` com fonte do tipo \`CARD\`. Havia três desembolsos para o mesmo cliente: R$ 700,00, R$ 200,00 e R$ 200,00; todos tinham compras financeiras correspondentes em \`loan_card_wallet_charges\` e \`personal_wallet_expenses\` (respectivamente R$ 734,93, R$ 209,98 e R$ 209,98; \`account_id\` nulo nas despesas). O primeiro já tinha ajuste e estorno auditável de R$ 700,00; os dois últimos não.

**Correção executada diretamente no banco:** migração \`20261120232000_reconcile_card_funded_wallet_debits.sql\`. Protege o gatilho de novos débitos de empréstimos financiados por cartão ANTES de sincronizar saldo, verificando metadados e modalidade do contrato/fonte, sem depender da compra do cartão já ter sido criada. Mantém integralmente a sincronização normal de desembolsos em dinheiro e recebimentos.

A correção histórica aplicou **dois estornos de R$ 200,00**, cada um com \`request_id\` determinístico, operação de auditoria na Carteira, transação \`ADJUSTMENT\` no ledger com \`reversed_of_transaction_id\`, metadados de correção e referência na nova tabela \`personal_wallet_card_funding_reconciliations\` (chave única de contrato). Os registros originais permanecem intactos, e os lançamentos auditáveis são excluídos somente da **apresentação normal** via filtragem que verifica vínculos reais de cartão. O gatilho existente de espelhamento sincronizou a fonte Nu com a conta Nubank, registrando dois ajustes de R$ 200,00 em \`financial_balance_audit\`.

**Resultado verificado em produção:**
- Conta Nubank: R$ 1.316,21 → **R$ 1.716,21**
- Fonte Nu sincronizada: R$ 1.316,21 → **R$ 1.716,21**
- Soma contábil das oito movimentações da conta após compensação: **R$ 1.716,21**
- \`personal_wallet_card_funding_reconciliations\`: 2 registros, R$ 400,00, duas operações e dois ajustes no ledger.
- \`loan_card_wallet_charges\` dos 3 contratos: \`source_balance_effect='REVERSED'\`, com referência de correção; o contrato de R$ 700,00 não recebeu segundo estorno.
- Proteção ativa no gatilho comprovada por consulta à definição da função no banco.
- **Não foram alterados:** valores dos contratos, clientes, despesas nem faturas do cartão. Apenas a conta e sua fonte espelhada foram creditadas com o valor que havia sido debitado indevidamente.
- Em ambientes vazios, reaplicação do script não cria valores artificiais; há verificação de exatamente dois débitos de R$ 200,00 não compensados antes de qualquer ajuste. \`tests/wallet/wallet-card-funding-reconciliation.test.ts\` protege a regra e a igualdade do saldo com o resultado das movimentações.
- **Limite:** esse saldo é o valor contábil conciliado no sistema; não significa confirmação externa do extrato real do banco Nubank. Testes CI e APK devem ser verificados no commit correspondente.


## 20/11/2026 — Extrato da conta: separar empréstimos financiados por cartão
- **Diagnóstico em produção:** Nubank mostrou `LOAN_DISBURSEMENT` de R$ 700,00 + R$ 200,00 + R$ 200,00, todos vinculados a contratos com `funding_payment_method=CREDIT_CARD` e com linhas efetivas em `loan_card_wallet_charges`. Há estorno de auditoria de R$ 700,00 para o primeiro contrato. Esses lançamentos são registros contábeis do empréstimo e não movimentações bancárias diretamente iniciadas pelo usuário.
- **Correção visual segura:** `services/personalWallet.service.ts` lê `loan_id` apenas de `loan_card_wallet_charges`, protegido por RLS de proprietário. `accountStatementDomain.ts` filtra do **extrato operacional da conta** somente os desembolsos cujo `contract_id` consta nessa lista e seus estornos de auditoria associados. Empréstimos realmente desembolsados com recursos da conta continuam exibidos. `WalletAccountsPage`, `AccountDetailsPage` e `AccountActivityPanel` recebem a mesma lista para manter totais de extrato coerentes com suas linhas. Ao substituir rótulo `Desembolso do contrato`, a categoria legível dos empréstimos em dinheiro passa a `Valor emprestado`.
- **NÃO exclui dados:** histórico original, contratos, transações, faturas, cartão, fontes de capital, saldos e auditoria do Supabase permanecem fisicamente inalterados. Não há estorno nem crédito implícito no saldo; **os débitos históricos de R$ 200,00 + R$ 200,00 que parecem não ter compensação precisam de reconciliação específica** antes de alterar valores financeiros. O resultado das movimentações visíveis não é sinônimo de saldo bancário.
- **Teste:** `tests/wallet/wallet-card-funded-account-statement.test.ts`: filtra apenas contratos com comprovante de financiamento via cartão, inclui contrapartida de auditoria, preserva empréstimos de conta, mantém imutabilidade dos dados. A execução foi solicitada diretamente no `main`, sujeita a validação CI e publicação Android.

## 20/11/2026 — Voltar da conta, CRUD seguro dos lançamentos e descrições em português

**Diagnóstico baseado no código do main e no esquema real de produção:**
- \`features/wallet/pages/WalletAccountsPage.tsx\`: \`closeAccount\` chamava \`navigate(-1)\`, que podia voltar ao Painel e perder a aba Contas. Passa a remover apenas \`?conta=\` com \`replace: true\`, preservando a rota atual, os filtros e a aba ativa. O evento \`capitalflow:back\` continua fechando o detalhe.
- \`components/wallet/AccountActivityPanel.tsx\` e \`components/wallet/accountStatementDomain.ts\`: o extrato misturava o resultado líquido das movimentações com a noção de saldo real. O rótulo passa a \`Resultado das movimentações\`, mantendo sinais positivos/negativos conforme a direção da operação. A ação **Editar** passa a acompanhar **Excluir** apenas para receitas/despesas manuais elegíveis; transferência, desembolso, parcela de contrato, fatura, cobrança, ajuste de saldo e estorno não são diretamente editáveis ou excluíveis neste painel.
- \`services/personalWallet.service.ts\`: integração de \`personal_wallet_edit_manual_operation\` com validação do resultado. \`supabase/migrations/20261120215500_wallet_manual_edit_description_cleanup.sql\`: RPC transacional, valida \`auth.uid()\`, \`can_access_personal_wallet()\`, RLS da conta, valores em centavos, categoria, descrição, data, vínculo e idempotência. Bloqueia edição de registros de contratos, faturas, cobranças, transferência e outros módulos. Serializa por titular, trava a operação e a conta, atualiza **somente a diferença do valor** no saldo e registra antes/depois em \`personal_wallet_manual_operation_revisions\`. Rejeita saldo negativo; não apaga registros físicos. \`DELETE\` de operação manual continua usando a RPC de estorno pré-existente \`personal_wallet_void_manual_operation\`.
- **Codificação de texto:** três operações de \`LOAN_DISBURSEMENT\` em 17/11/2026 estavam salvas como \`EmprÃ©stimo concedido Â· ...\`. A migração normaliza exclusivamente \`description\` e \`category\` dessas operações da Carteira, preserva valores e \`contract_id\`, e instala trigger para novas descrições. A apresentação também tem normalização defensiva e diferencia o tipo de movimentação de sua categoria sem repetir a mesma frase.
- **Importante: achado financeiro independente:** os três desembolsos em 17/11/2026 estão associados a contratos com \`funding_payment_method=CREDIT_CARD\` e têm débitos no extrato de conta. Foi detectado estorno de R$ 700,00, mas não compensações de R$ 200,00 + R$ 200,00. **Não aplicar correção monetária automática sem conferir o contrato, idempotência da migração anterior e a reconciliação atual.** Não ocultar linhas para falsificar o saldo e não alterar \`contratos\`, fontes ou ledger.
- **Validação:** migração aplicada no Supabase de produção, RPC testada sob papel \`authenticated\` com variação de R$ 0,01 e aferição de saldo e auditoria; \`ROLLBACK\` garantiu que esse teste não alterasse os lançamentos reais. Os novos testes \`tests/wallet/wallet-account-edit-navigation-text.test.ts\` cobrem retorno, formatação e barreiras de edição. Gates do GitHub Actions e APK devem ser verificados para o commit correspondente. Não alegar publicação web/Cloudflare sem confirmação.


## 20/11/2026 — Correção dos gates da Carteira e renderização de importação

- `WalletStatementImport` agora usa portal em `document.body` no navegador e retorna o diálogo diretamente quando não existe DOM. Isso evita `ReferenceError` nos ambientes de teste sem navegador sem mudar o comportamento na interface.
- Atualizados testes de contrato que ainda apontavam para os controles antigos de ajuste de fatura, layout offline, posição/cor do cartão e rótulo do FAB. O teste do cadastro do cartão agora confirma explicitamente que o CVC não é solicitado nem armazenado. Ao salvar vínculos de origem, a alocação manual antiga é zerada (`null`), conforme a regra documentada: a disponibilidade usa o saldo integral atual da conta ou cartão.
- Evidências: `npm run test:wallet` (335/335), `npm run test:wallet-statement-import` (69/69), testes focados de contratos/UI (24/24), `npm run test:wallet-visual` (2/2), `npm run test:wallet-overview-localization` (2/2), `npm run test:quality` passou e `git diff --check` passou. Build dentro do gate concluiu com avisos de chunk/importações dinâmicas. Sem alteração em RPC, migration ou regras financeiras.

## 20/11/2026 — Idioma da interface limitado a Português (Brasil)

- A seleção de inglês/espanhol foi removida do perfil e da tela de login porque a tradução cobria apenas autenticação e navegação, enquanto o restante da interface permanecia em português. O perfil agora mostra Português (Brasil) como idioma disponível; o login exibe a mesma informação sem controle interativo. O tipo de idioma selecionável foi separado dos locales legados aceitos pelas funções de tradução, para impedir chamadas tipadas a `setLanguage('en'/'es')`.
- Preferências antigas `en`/`es` (ou códigos inválidos) em `capitalflow:language` são normalizadas para `pt-BR` ao inicializar. O contrato de idioma e os dicionários legados permanecem para compatibilidade interna, mas não há mais caminho de seleção para eles.
- Critérios observados: um único idioma aparece nos pontos de seleção, idioma antigo volta para pt-BR, `html lang` permanece `pt-BR`. `node scripts/i18n/englishUiText.mjs` encontrou zero texto inglês rastreável; essa varredura não mede a cobertura das traduções EN/ES. `npm run build` concluiu com avisos existentes de chunks/importações dinâmicas. `git diff --check` passou. Testes automatizados não foram executados.

## 20/11/2026 — Remoção do acesso duplicado à conferência da fatura

- Removido o botão superior “Definir/Corrigir vencimento e valores” e seu modal independente em `WalletCardsPage`. O resumo de valores bancários permanece visível; “Ajustar fatura”, abaixo, preserva o fluxo para corrigir a fatura e abrir a conferência dos valores do banco.
- Revisão independente confirmou que `InvoiceOverrideModal` já salva os valores bancários pelo mesmo callback, sem criar compra ou pagamento; não foi identificada perda de funcionalidade única nem estado sem uso.
- `npm run build` concluiu e `git diff --check` passou. Sem testes automatizados ou validação visual no navegador nesta alteração.
## 20/11/2026 — Correção da posição dos diálogos da Carteira

- Causa do PIX no rodapé: `WalletPixCharge` renderizava o overlay fixo dentro da página de detalhes. Ancestrais com transformação/rolagem podiam virar o bloco de referência do `position: fixed`. O diálogo agora usa portal em `document.body`, preservando a versão incorporada da página de Cobrança e o drawer mobile. No desktop, o painel também fica limitado a 90dvh/960px e largura máxima de 6xl, com rolagem interna.
- A varredura de overlays próprios da Carteira encontrou o mesmo risco em pagamento de fatura, edição de despesa, ações rápidas, formulário de conta, detalhes/scanner do cartão, importação/leitura de extrato, inbox de arquivo, recorrências e pagamento de dívida. Todos foram portados para `document.body`; os que já usavam o `Modal` compartilhado/portal não precisaram de mudança.
- A busca global deixou três diálogos próprios fora da Carteira sem portal (`TermsAcceptanceModal`, `PlatformAdminPage` e `ExitConfirmDialog`); não há relato ou evidência de que reproduzam o sintoma nesta execução, ficam como candidatos para validação específica. Drawers e estados fixos não modais não foram alterados.
- Evidências: `npm run build` concluiu, `git diff --check` passou e revisão independente não encontrou problemas nos wrappers/handlers. Sem testes automatizados; navegador indisponível para validação visual. Build manteve avisos existentes de divisão de chunks/importações dinâmicas.
## 20/11/2026 — Revisão final do ícone e do cartão Bradesco

- O ícone nas três representações passou a ter 36px, marca centralizada em tile marinho com contorno branco e sem placa branca. O cartão Bradesco usa o gradiente vinho escuro da referência (`#9f1239` → `#4c0519`), com aro fino e luz discreta no canto superior.
- `npm run build` concluiu; `git diff --check` passou. Sem testes automatizados ou validação visual no navegador, cujo host estava indisponível.## 20/11/2026 — Refinamento do vermelho e das logos dos cartões

- Após feedback visual, escurecido o gradiente do Bradesco para vinho, preservando a cor personalizada quando cadastrada; retomados os brilhos e os aros sutis dos cartões. Logos voltaram ao bloco escuro original, sem a moldura branca aplicada na revisão anterior.
- `npm run build` concluiu e `git diff --check` passou. Não foram executados testes automatizados nem validação visual no navegador/aparelho; o host do navegador estava indisponível. Avisos de chunk/importação dinâmica permanecem no build.
- Risco/rollback: alteração somente visual, reversível nos componentes e helper de apresentação do cartão.## 20/11/2026 — Padronização visual dos cartões da carteira

- `BankStack`, cartões compactos do resumo e `VirtualCreditCard` agora usam a mesma paleta por emissor, incluindo a cor personalizada do cartão. As logos usam o mesmo componente com superfície branca, proporção e espaçamento consistentes; removido o quadrado branco duplicado nas miniaturas.
- Preservadas as cores distintas por instituição (por exemplo, Bradesco, Nu e PicPay), os dados, os handlers e os cálculos. Nenhuma regra financeira ou persistência foi alterada.
- Evidências: `npm run build` concluiu; `git diff --check` passou; revisão independente dos componentes não encontrou regressões. Não foram executados testes automatizados nem validação visual no navegador/aparelho nesta alteração. Avisos de chunk e importações dinâmicas apareceram no build.
- Risco/rollback: mudança restrita à apresentação e reversível revertendo os cinco componentes/helpers de UI alterados.## 20/11/2026 — Ajuste de tamanho e distribuição dos botões do contrato

- Em `components/cards/LoanCardComposition/Footer.tsx`, as ações principais agora se reorganizam por largura disponível: mantêm largura equilibrada, quebram em linhas e centralizam itens restantes. Aumentados altura mínima, ícones, texto e espaçamento; o bloco Arquivar/Restaurar permanece separado visualmente e também ganhou alvo de toque maior.
- Mantidos ordem, handlers, condições, cores semânticas e estados. Nenhuma regra financeira foi alterada.
- Verificação: detector Impeccable `detect --scope layout` sem ocorrências; `git diff --check` passou; `npm run build` passou (com avisos de chunk/importação dinâmica preexistentes); revisão independente sem achados. O navegador abriu a página do app, mas o cartão dos screenshots não estava aberto no estado necessário para validar esse render.
## 20/11/2026 — Reorganização dos botões no cartão de grupo

- Em `components/cards/ClientGroupCard.tsx`, a grade dos sete botões passou a usar `auto-fit` por largura real disponível, com largura mínima por ação, espaçamento maior, alvo de pelo menos 48px, ícones e rótulos ampliados. “Venc.”/“Arq.” foram substituídos por “Vencidas”/“Arquivar”; “Unir” virou “Unificar”.
- A ordem, os handlers, os filtros e os estados desabilitados foram preservados. Nenhuma lógica ou dado financeiro foi alterado.
- Verificação: detector Impeccable `detect --scope layout` sem ocorrências; `git diff --check` passou. Revisão independente não encontrou problemas no escopo. Não rodei testes; validação visual no navegador ficou indisponível porque o host de navegador estava fora do ar.
## 20/11/2026 — Remoção do bloco explicativo do cartão de parcela

- A pedido do usuário, removido de `components/cards/components/InstallmentCard.tsx` o bloco azul “Saldo registrado após o último recebimento” e seus parágrafos. Permanecem inalterados o valor exibido da parcela, vencimento, status, ofertas, encargos e ações de pagamento; nenhuma regra ou gravação financeira foi alterada.
- Atualizado `tests/financial/partial-payment-display.test.ts` para impedir que o bloco removido volte a aparecer.
- Verificação: `npx tsx --test tests/financial/partial-payment-display.test.ts` passou (6/6); `git diff --check` passou. A suíte geral mostrou falha existente em `tests/audit/business-date-consistency.test.ts:94` (inventário de chamadas a `new Date().toISOString().slice(0, 10)` em outros arquivos). A revisão visual no navegador não foi possível porque o host de navegador estava indisponível.
## 20/11/2026 — Reimportação real da fatura Bradesco 4999

- A pedido do usuário, substituída a importação anterior pela leitura atual do PDF `BradescoCartoes2026-11-19.165820.pdf` (`SHA-256 632dc00d98d02570188d6c669c16d212a4c1dfb10aaf9ad2e59db2a2f81033e1`), preservando idempotência e cancelando/recriando somente compras pendentes e não pagas pela RPC autorizada.
- Conferência no Supabase `hzchchbxkhryextaymkn`: 90 linhas vinculadas ao cartão Bradesco 4999; 89 compras e 1 crédito de `PAG EUCATUR*Eucat` por -R$ 86,00; total assinado importado **R$ 2.930,88**. O pagamento da fatura anterior de R$ 2.517,55 não foi importado como compra.
- `private.wallet_effective_cycle_amount` confirmou **R$ 2.930,88** para dezembro/2026. Parcelas futuras pendentes: jan/2027 R$ 695,85; fev R$ 633,57; mar R$ 561,08; abr, mai e jun R$ 495,67 cada; jul R$ 242,72.
- Migrations remotas confirmadas: `20261120033624_wallet_safe_reimport_invoice_credits` e `20261120034838_wallet_preserve_statement_source_on_reimport`. Revisão independente confirmou o caso de reimportação vinculada; permanece a limitação de que uma linha órfã sem despesa vinculada, se encontrada em outro PDF, pode ser atualizada no lugar em vez de preservada como fonte histórica.
- Testes após as alterações locais: `npm run test:wallet-statement-import` (69/69), `npm run test:wallet-import-contract` (4/4) e `git diff --check` passaram. `npm run test:quality` falhou em 1 teste: `tests/wallet/wallet-global-privacy.test.tsx:89` espera encontrar `hideFinancialValues ? 'Situação protegida' : label` em `WalletCardsPage`; o gate geral não está aprovado. Sem validação visual no navegador/aparelho nesta execução.
## 20/11/2026 — Créditos/estornos na fatura, ajuste fino para baixo e geração automática de parcelas futuras (n/m) na importação

- **Migration aplicada no Supabase (`hzchchbxkhryextaymkn`) e versionada em `supabase/migrations/20261120001000_wallet_invoice_credits_and_statement_installments.sql`:**
  - Adicionada coluna aditiva `is_invoice_credit boolean NOT NULL DEFAULT false` em `public.personal_wallet_expenses` (preservando todas as check constraints `amount > 0` e `entry_type`).
  - Atualizada `private.wallet_effective_cycle_amount` para abater lançamentos com `is_invoice_credit = true` do total efetivo do ciclo (limitado a `>= 0`).
  - Atualizada `public.personal_wallet_pay_invoice_partial` para ignorar créditos na alocação de pagamento e encerrar o ciclo quando o saldo efetivo chega a zero.
  - Criada RPC `public.personal_wallet_create_invoice_credit` para lançar créditos/estornos/ajustes negativos na fatura com idempotência por `request_id`.
  - Criada sobrecarga de 12 argumentos de `public.personal_wallet_record_card_purchase_atomic` (mantendo a sobrecarga legada de 10 argumentos delegando para ela):
    - Valores negativos (`p_amount < 0`, exceto pagamentos de fatura anterior filtrados na UI) são gravados como crédito (`is_invoice_credit = true`), abatendo da fatura sem congelar compras futuras.
    - Compras parceladas (`p_installment_number >= 1` e `p_installment_total > p_installment_number`, fora de detalhamento inicial) geram automaticamente a parcela atual e todas as parcelas restantes nos meses futuros (`p_due_month + 0..(remaining - 1)`), preenchendo **Faturas posteriores** e **Disponível estimado**.
- **Frontend e serviços (`services/personalWallet.service.ts`, `components/wallet/invoiceStatementDomain.ts`, `components/wallet/CardInvoiceStatement.tsx`, `components/wallet/FlatSmartStatementReader.tsx`, `components/wallet/WalletStatementImport.tsx`, `components/wallet/InvoiceOverrideModal.tsx`, `features/wallet/pages/WalletCardsPage.tsx`):**
  - Importação de fatura agora seleciona automaticamente compras positivas e créditos/estornos (ex.: `PAG EUCATUR*Eucat -86,00`), mantendo desmarcado apenas pagamento da fatura anterior (`PAGTO ANTECIPADO PIX`), e envia `installmentNumber`/`installmentTotal` para gerar parcelas futuras.
  - `CardInvoiceStatement` exibe créditos em verde (`− R$ X`) com selo `Crédito / Estorno` e abate corretamente no subtotal da busca.
  - `InvoiceOverrideModal` ("Ajustar fatura" → `Reajustar por diferença`) agora permite tanto ajustar para cima (`Despesa de ajuste`) quanto para baixo (`Crédito de ajuste`), sem congelar compras futuras.
- **Testes executados (sem commit ainda, branch `codex/wallet-invoice-purpose-ux-20261119`):**
  - `npm run lint`: 0 erros.
  - `npm run test:wallet-statement-import`: 66/66 passaram (incluindo novo teste de crédito + parcelas futuras).
  - `npm run test:wallet-import-contract`: 4/4 passaram.
  - `npm run test:wallet-visual-next`: 39/39 passaram.
  - `npm run test:quality`: falhou em 2 testes pré-existentes da branch (`tests/audit/business-date-consistency.test.ts:94` e `tests/wallet/wallet-global-privacy.test.tsx:77`), não introduzidos por esta alteração.
- **Limitações:** sem validação visual em aparelho celular físico. Compras parceladas importadas *antes* desta atualização precisam ser excluídas e reimportadas (ou a fatura não paga excluída e reimportada) para que o banco gere as parcelas futuras dos próximos meses.

## 17/11/2026 — Atualização por gesto no aplicativo

- Adicionado o gesto de puxar para atualizar no contêiner principal autenticado, com indicador discreto para os estados de puxar, soltar e atualizar. O gesto só inicia no topo, com um toque, e é bloqueado em campos editáveis, áreas marcadas, modais, suporte aberto e regiões internas já roladas.
- A atualização reutiliza `fetchFullData`; na Carteira também força a leitura canônica pelo `walletRepository` e emite `capitalflow:wallet-updated`. Sem conexão ou falha, exibe mensagem compreensível e não altera dados financeiros diretamente.
- Arquivos: `App.tsx`, `layout/AppShell.tsx`, `components/system/PullToRefreshIndicator.tsx`, `hooks/usePullToRefresh.ts`, `utils/pullToRefreshGuard.ts` e `tests/architecture/pull-to-refresh.test.ts`.
- Verificação automatizada: teste direcionado do gesto, build TypeScript/Vite e suítes de qualidade executados no mesmo working tree. A interação tátil, o rubber-banding e a convivência com o navegador ainda precisam de validação em aparelho Android físico; não foi gerado nem publicado novo APK nesta etapa.

## 17/11/2026 — Separação estrita de origem (Conta, Cartão e Composição), compra à vista no cartão, encoding UTF-8 e correção do contrato da Deyse

- **Causa raiz:**
  - `finalize_card_funded_loan_v1` usava `funding_installments_count` (parcelas do contrato com o cliente) para parcelar a compra no cartão e gravava descrição longa (`"Emprestimo a ..."`), enquanto `useLoanForm.ts` / `LoanFormFinancialSection.tsx` iniciavam `fundingInstallmentsCount` com `'10'`.
  - Empréstimos fora de `INSTALLMENT_FIXED` em fontes `CARD` podiam cair no caminho de débito de conta, e `trg_sync_transacao_to_wallet()` debitava `personal_wallet_accounts` em qualquer `LOAN_INITIAL` sem verificar `funding_origin = 'CREDIT_CARD'` / `source_balance_effect = 'NONE'`.
  - Composição explícita entre múltiplas fontes (`MULTI_SOURCE_CREATION_ENABLED`) estava desativada na UI e sem RPC atômica/idempotente no backend.
  - Textos com mojibake UTF-8/Latin-1 em `services/personalWallet.service.ts`, `MessageHubModal.tsx`, `automation/n8n/*.json` e `trg_sync_transacao_to_wallet()`, além de `tests/architecture/runtime-text-encoding.test.mjs` depender de `rg` (inexistente no Windows).
- **Arquivos alterados:**
  - `types.ts`, `features/loans/hooks/useLoanForm.ts`, `features/loans/domain/loanForm.mapper.ts`, `components/forms/LoanFormFinancialSection.tsx`, `services/contracts.service.ts`.
  - `supabase/migrations/20261117150000_card_funded_loan_no_account_debit.sql`.
  - `services/personalWallet.service.ts`, `components/modals/MessageHubModal.tsx`, `automation/n8n/capitalflow-whatsapp.json`, `automation/n8n/workflows/capitalflow-whatsapp.json`, `automation/n8n/workflows/capitalflow-manual-collections.json`.
  - `tests/financial/card-funded-loan-wallet-charge.test.ts`, `tests/financial/loan-origin-and-card-defaults.test.ts`, `tests/architecture/runtime-text-encoding.test.mjs`.
- **Correção verificada em produção (Deyse · contrato `2ac454ac-04f0-4c60-bd04-1fbb069857a4`):**
  - Estorno auditável de `R$ 700,00` na conta Nubank (`7ab23316-51c9-4f55-8156-02276a1ae53d`) e fonte espelhada (`5a34b718-47f9-4bfe-a175-6bfeeabe3ef6`), ambos confirmados em `R$ 1.716,21`.
  - Despesa do cartão Nu `4736` (`9f2a023e-bb85-415e-b42d-b955e4c1623b`) atualizada para `"Empréstimo Deyse"`, `installment_count = 1`, `R$ 734,93` em `2026-12-01` (`current_bill = R$ 3.804,15`, `used_limit = R$ 6.519,17`, `available_limit = R$ 472,13`).
- **Limitações:**
  - A aplicação de DDL via `supabase_mcp:apply_migration` foi cancelada automaticamente pelo cliente MCP; a correção dos dados da Deyse foi aplicada e verificada em transação DML no Supabase, e o arquivo `supabase/migrations/20261117150000_card_funded_loan_no_account_debit.sql` aguarda `supabase db push` no ambiente remoto para atualizar as funções `trg_sync_transacao_to_wallet`, `finalize_card_funded_loan_v1` e `finalize_loan_funding_allocations_v1`.
  - Sem validação visual em dispositivo Android físico nesta etapa.

## 13/11/2026 — transferência contábil Capital → Minha Carteira e legibilidade

- **Layout:** `LoanFundingCostFields.tsx` reflow responsivo por largura real, rótulos com altura coerente e inputs financeiros inteiros; sem alteração em juros, fórmula de custo nem principal.
- **Saldo disponível:** Fontes e Contas exibem o total operacional elegível (saldo positivo, excluindo cartão e conta espelho); não confundir com dinheiro bancário nem com lucro realizado/Caixa Livre.
- **Movimentação:** RPC `capital_source_transfer_to_wallet` cria débito na fonte e crédito na conta com auditoria e chave idempotente; novo tipo `CAPITAL_TRANSFER` aparece no extrato, mas não como receita nova. Usuário precisa escolher origem/conta/valor e confirmar. **Não é PIX/TED**.
- **Autorizações:** usa `is_platform_super_admin` no Supabase, valida vínculo ao perfil, conta própria e marco de reinício; fonte de crédito ou espelho bloqueada. Conta com fonte espelhada diferente sincroniza pelo trigger existente após validar igualdade prévia. Nenhuma movimentação histórica executada.
- **UX:** ação disponível nos cartões das Fontes e na tela Contas, sem duplicação do botão Criar carteira física, cuja opção continua em Nova conta.
- **Testes:** `tests/wallet/capital-source-transfer.test.ts` e `tests/architecture/capital-source-wallet-transfer.test.mjs`; a execução do CI e a aplicação da migration devem ser verificadas separadamente. Não há teste real em celular ou transação bancária.

## 11/11/2026 — Revisão de recebimentos, histórico jurídico e clareza do balanço

- Diagnóstico do Jurídico: o perfil principal possuía 53 registros gerados, incluindo 14 cancelados, 33 pendentes, 5 em assinatura e 1 assinado. Vários documentos tinham versões/duplicatas por contrato. Esses documentos não foram excluídos automaticamente.
- O botão Excluir chamava o cliente anônimo do portal, repetia o mesmo DELETE e não verificava o retorno do banco. O fluxo agora exige sessão autenticada, titularidade, ausência de assinaturas e vínculos protegidos, e confirma a linha removida. Documentos assinados, parciais, cancelados ou protegidos podem ser arquivados visualmente pelo titular, nunca destruídos. Os arquivados continuam acessíveis e restauráveis. RLS do arquivo é restrita a auth.uid() e ao perfil proprietário.
- O balanço da Carteira conserva os mesmos cálculos e passa a mostrar a fórmula de projeção abertamente, distinguindo saldo presente de receitas futuras. O bloco redundante de auditoria foi removido.
- A regra de centavos está coberta pelo teste sequencial 0,41 → 4,10 → 41,01 → 410,10 → 4.101,00, sem mudar o motor financeiro.
- Recebimentos examinados: em 11/11/2026 houve registro de acordo de R$ 350,00, sem destino roteado; o motor V4 do perfil não apresentava recebimentos posteriores a 07/11/2026. Nenhum registro financeiro foi modificado por esta auditoria.
- Limitação: sem teste em dispositivo real. Assinaturas e recibos jurídicos não devem ser apagados sem preservar prova e trilha histórica; os registros legados continuam intactos até decisão explícita do titular.

## 10/11/2026 — Bloco 03 e Bloco 04 (UX Offline, Fallback de Imagens, Padronização Manaus e Correção de Testes Legados)
- **Bloqueio preventivo offline em runtime ([`walletOfflineGuard.ts`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/services/walletOfflineGuard.ts), [`services/personalWallet.service.ts`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/services/personalWallet.service.ts)):**
  - Todas as mutações de `personalWalletService` fora de `READ_ONLY_WALLET_METHODS` executam `guardWalletWrites` / `assertWalletOnlineForWrite()` antes de tocar o Supabase, bloqueando escritas offline com mensagem clara em português sem impedir leitura.
- **Fallback visual para imagens assinadas expiradas offline:**
  - [`BankLogo.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/components/wallet/BankLogo.tsx) faz fallback da URL assinada (`customImage`) para o logotipo local da instituição antes das iniciais/ícone padrão.
  - [`CardDetailModal.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/components/wallet/CardDetailModal.tsx) exibe aviso legível quando a foto anexada do cartão falha ou expira no modo offline.
- **Relatório em cache ([`WalletReportPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletReportPage.tsx)):** hidratação instantânea via `peekCachedOverview()` preservando dados em cache durante eventos offline.
- **Bloco 04 — Padronização comercial (`America/Manaus`) e testes legados:**
  - [`QuickIncomeModal.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/components/QuickIncomeModal.tsx), [`QuickWalletActionsModal.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/components/QuickWalletActionsModal.tsx), [`CardOpeningFields.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/components/CardOpeningFields.tsx), [`WalletBankNotificationsPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletBankNotificationsPage.tsx), [`WalletCardsPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletCardsPage.tsx) e [`minhasFinancasWalletTools.ts`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/utils/minhasFinancasWalletTools.ts) passaram a usar `businessDateInManaus()` para datas/meses padrão.
  - Atualizados [`tests/wallet/wallet-access-lifecycle.test.mjs`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/tests/wallet/wallet-access-lifecycle.test.mjs) (mock completo de `useRef`/`useCallback`) e [`tests/architecture/master-ai-assistant.test.mjs`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/tests/architecture/master-ai-assistant.test.mjs) (alinhado à autorização `isMasterAssistantEnabled` / `!authorized`).
- Nenhuma RPC, migration, ledger ou regra RLS alterada nos Blocos 03 e 04.

## 10/11/2026 — Publicação em produção (Bloco 01 + Destino de Recebimento + Flux) e Bloco 02 (Consistência UI, Manaus e Rascunho por Usuário)
- **Publicação realizada:**
  - Commit/push na `main`: `6b1f332` (`feat(wallet,payments): offline invoice facts cache and optional capital source receipt routing`).
  - Edge Function `ai-assistant` publicada no projeto Supabase `hzchchbxkhryextaymkn`.
  - Migration `20261110220000_optional_payment_capital_destination_routing.sql` aplicada no banco remoto (`account_id` anulável e `destination_source_id` ativo em `wallet_receipt_destinations` e `financial_operations`).
- **Bloco 02 — Consistência de saldos, fuso de Manaus e rascunhos isolados (somente frontend/UI):**
  - [`WalletAccountsPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletAccountsPage.tsx): `importedBalance` passa a somar apenas `statementRows` com `row.target_kind === 'ACCOUNT'` de contas ativas, evitando misturar extratos de cartão no resumo de Contas e PIX.
  - [`WalletIncomePage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletIncomePage.tsx), [`WalletPayablesPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletPayablesPage.tsx), [`WalletOverviewPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletOverviewPage.tsx) e [`WalletReportPage.tsx`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/pages/WalletReportPage.tsx) passam a usar `businessDateInManaus()` (`America/Manaus`) em vez do relógio/fuso local do navegador.
  - [`useWalletDraft.ts`](file:///c:/Users/LeverDell/Documents/GitHub/CapitalFlow1/features/wallet/hooks/useWalletDraft.ts) passa a isolar a chave de `localStorage` pelo `scopeId` do usuário (`activeUser?.id` em `WalletPayablesPage.tsx`), recarregando o estado ao trocar de sessão.
- **Pendências:** validar visualmente no celular/navegador; decidir se avançamos para o **Bloco 03** (bloqueio preventivo offline em formulários de mutação da Carteira e renovação de imagens assinadas) e commit do Bloco 02.

## 10/11/2026 — Bloco 01 (Minha Carteira Offline Hardening) e Destino de Recebimento em Fonte de Capital (Capital + Lucro)
- **Bloco 01 — Minha Carteira offline (`services/personalWallet.service.ts`, `features/wallet/services/walletOfflineStore.ts`, `features/wallet/services/walletRepository.ts`, `features/wallet/pages/WalletCardsPage.tsx`, `App.tsx`, `tests/wallet/wallet-offline-cache.test.ts`):**
  - `personalWalletService.load()` passou a carregar `personal_wallet_card_invoice_facts` (`cardInvoiceFacts`) no snapshot completo para que a troca de cartões na aba Cartões funcione totalmente offline.
  - `deriveOverviewFromSnapshot` / `saveWalletOfflineFull` derivam `cardInvoiceDates` diretamente de `cardInvoiceFacts` quando disponíveis; `walletRepository.loadCardInvoiceFacts(cardId)` consulta o servidor quando online (atualizando o cache local) e lê do IndexedDB/snapshot quando offline ou em falha de rede, substituindo a chamada direta em `WalletCardsPage.tsx`.
  - `walletRepository.prefetchAccess()` é disparado no pré-aquecimento pós-login do perfil Master em `App.tsx` (junto de `loadOverview()`), gravando `wallet_access` em IndexedDB antes mesmo do primeiro clique na aba.
- **Destino de recebimento para reinvestimento — todos os usuários escolhem Fonte de Capital (Capital + Lucro) e Master também escolhe Conta da Carteira:**
  - **Migration aditiva (`supabase/migrations/20261110220000_optional_payment_capital_destination_routing.sql`):**
    - Torna `wallet_receipt_destinations.account_id` anulável e adiciona `destination_source_id` (`fontes.id`) em `wallet_receipt_destinations` e `financial_operations`.
    - Estende `personal_wallet_set_receipt_destination(uuid, uuid, uuid DEFAULT NULL, uuid DEFAULT NULL)` (removendo a sobrecarga de 3 argumentos para evitar ambiguidade): qualquer operador autorizado no perfil (`financial_actor_can_access`) pode informar `p_destination_source_id`; apenas Master (`is_platform_super_admin()`) pode informar `p_account_id`, validando ausência de conflito entre conta espelho/referenciada e fonte escolhida.
    - Atualiza `wallet_route_receipt_internal`, `wallet_apply_receipt_destination` e `reverse_wallet_financial_operation_v4` para creditar `Principal + Lucro/Encargos` juntos na fonte de destino para reinvestimento (sem duplicar quando coincide com a fonte original do contrato ou com espelho `capital_source_id`), mantendo o padrão exato quando nenhum destino é selecionado e preservando estorno atômico para usuários comuns e Master.
  - **Frontend e Serviços (`PaymentManagerModal.tsx`, `InstallmentGrid.tsx`, `InstallmentReceiptModel.ts`, `DashboardContainer.tsx`, `usePaymentController.ts`, `services/payments.service.ts`, `services/payments/paymentEngineV4.ts`):**
    - Adicionado seletor opcional `"Fonte de destino para recebimento (opcional)"` (`Padrão · retorno às fontes originais` por padrão) visível para todos os usuários tanto no modal completo quanto no recebimento rápido do card, com validação de compatibilidade quando Master também seleciona conta da Carteira.
- **Pendências operacionais:** a migration `20261110220000_optional_payment_capital_destination_routing.sql` e a Edge Function `ai-assistant` alterada anteriormente aguardam confirmação para publicação no Supabase remoto (`supabase db push` / `supabase functions deploy`), assim como `git commit` / `push` na `main`. Nenhuma validação visual em celular físico foi realizada.

## 10/11/2026 — Quality Gate: correção de compilação e validação completa
- **Falha reproduzida no Quality Gates remoto:** a execução `42835105184`, no SHA `4f223ec`, falhava em `containers/DashboardContainer.tsx:136` com `TS2339` porque `InstallmentPaymentOptions` não declarava `receiptDestinationAccountId`.
- **Correção já incorporada em `c1d49ff`:** o campo opcional foi adicionado ao contrato local, encaminhado ao serviço canônico de pagamentos e acompanhado da invalidação da Carteira após um recebimento roteado. Nenhuma RPC, migration, ledger, regra de pagamento, estorno ou RLS foi alterada nesta correção.
- **Validação:** `npm run test:quality` executado localmente no `HEAD` `3ab57d2` com código de saída `0`; a execução remota `42904607748` para o mesmo SHA também terminou com sucesso. Não houve validação visual em aparelho físico nesta conferência.

## 10/11/2026 — Flux (economia de Supabase/tokens, varredura + recomendações) e Minha Carteira com cache offline completo
- **Flux (`services/aiAssistant.service.ts`, `supabase/functions/ai-assistant/core.ts`, `supabase/functions/ai-assistant/index.ts`):**
  - Cache de 5 min em `isMasterAssistantEnabled()` (memória + `sessionStorage`) e na Edge Function (`masterAdminCache` após validação do JWT) para reduzir RPCs `is_platform_super_admin`.
  - Removida a segunda chamada duplicada do frontend em respostas `unavailable`; `loadContext` reaproveita o cache de `'geral'` por 60s para subáreas e não consulta o banco em falhas de diálogo comum sem área financeira.
  - `contratos` inclui `debtor_name` para identificar maiores atrasos; `summarizeCapitalFlowMetrics` e `buildImprovementRecommendations` calculam lucro previsto em aberto, taxa de inadimplência, comprometimento de limite, contas zeradas e ações práticas de melhoria, enviando contexto compacto à LLM.
  - Suporte ampliado de failover (`GEMINI_API_KEY`..`4`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`) removendo o obsoleto `gemini-1.5-flash` do fallback `429`.
- **Minha Carteira offline e carregamento instantâneo (`features/wallet/services/walletOfflineStore.ts`, `walletSnapshotCache.ts`, `walletRepository.ts`, `useWalletAccess.ts`, `useWalletSnapshot.ts`, `WalletOverviewPage.tsx`, `WalletModule.tsx`):**
  - Cache persistente por usuário em IndexedDB (`capitalflow_wallet_offline`, lojas `wallet_snapshots` e `wallet_access`), sem `localStorage` nem mistura entre contas.
  - Hidratação instantânea na abertura (`peekCachedOverview`/`peekCachedFull`) + pré-carregamento único em segundo plano de todas as 14 tabelas (`prefetchFull`) e dos chunks lazy das subpáginas ao ativar a Carteira.
  - Suporte offline completo para leitura (incluindo verificação de acesso por sessão local + `wallet_access` salvo quando sem rede) e aviso claro `"Modo offline — exibindo dados salvos neste aparelho (somente consulta)."`.
  - Nenhuma RPC, migration, ledger ou política RLS foi alterada.
- **Testes executados após a edição final:** `npm run test:flux-agent` (26/26), `npm run test:ai-security` (19/19), `npm run test:wallet-loading` (5/5), `npm run test:wallet-fast-path` (4/4), `npm run test:wallet-pages` (9/9), `tests/wallet/wallet-offline-cache.test.ts` (3/3), `npm run test:i18n` (9/9), `npm run test:wallet-visual-next` (38/38), `npm run test:architecture`, `npx tsc --noEmit` (0 erros), `npm run build` e `tests/architecture/wallet-pwa-legal.test.mjs` (5/5).
- **Falhas pré-existentes / limitações e pendências:** `tests/wallet/wallet-access-lifecycle.test.mjs` falha com `react_1.useRef is not a function` (mock incompleto do próprio teste); `tests/architecture/master-ai-assistant.test.mjs` está desatualizado em relação ao `MasterMascot.tsx` atual; `npm run test:quality` completo não foi executado. A Edge Function `ai-assistant` alterada ainda **não foi publicada** no Supabase, e os Secrets de produção possuem apenas `GEMINI_API_KEY` (faltando cadastrar chaves extras como Groq/OpenRouter para failover real entre provedores). Nenhuma validação visual em navegador ou aparelho físico foi realizada; nenhum commit/push feito.

## 10/11/2026 — Auditoria da Carteira de Clientes e transição do recebimento
- **Correções de entrada e mobile:** o valor do pré-contrato em `pages/ClientsPage.tsx` agora usa `parseCurrency` e `inputMode="decimal"`/texto, aceitando `1.200,00` sem converter vírgula brasileira em `NaN`. Cards de clientes deixaram a altura fixa, ganharam operação por teclado, foco visível, alvos de toque maiores e ações reorganizadas para 320–430px. A minuta passou a limitar a altura e rolar internamente no celular.
- **Modal de recebimento:** `components/ui/Modal.tsx` recebeu saída opcional de 200ms usando somente `opacity`/`transform`, curva `cubic-bezier(0.23, 1, 0.32, 1)` e fechamento imediato com `prefers-reduced-motion`. `PaymentManagerModal` habilita a transição e passou a chamar `useModal()` em ordem estável, eliminando o retorno antecipado que podia violar as Rules of Hooks. O detalhamento agora rotula e exibe o `Total após ajustes`, alinhado ao valor com perdão de encargos. A prévia, idempotência, foco, Escape, safe-area e fluxo de pagamento foram preservados.
- **Auditoria financeira:** a rota opcional para a Minha Carteira foi conferida na migration `20261110210000_optional_wallet_receipt_withdrawal_routing.sql`: o destino é aplicado pelo trigger na mesma transação do recebimento V4/V3, com composição de capital/juros/multa conciliada, auditoria por chave idempotente e estorno integrado. Nenhuma RPC, migration, ledger, regra de pagamento, estorno ou RLS foi alterada nesta entrega.
- **Proteções:** `tests/architecture/architecture-check.mjs` passou a proteger parsing brasileiro, ausência de altura fixa e teclado na Carteira de Clientes; `tests/wallet/wallet-quick-receipts.test.ts` protege a transição e a ordem estável do hook.
- **Testes:** `npx tsc -b --noEmit` passou; `npm run test:architecture` passou; `npm run test:wallet-receipts` passou (18/18); `npm run test:wallet-visual-next` passou (38/38). `npm run test:quality` ficou **vermelho antes dos testes desta entrega** em `tests/architecture/cloud-collections-server.test.ts`, por regex que espera LF enquanto `automation/server/Caddyfile` foi lido com CRLF; os 9 testes de i18n anteriores passaram. O build completo não foi alcançado pelo encadeamento interrompido, embora o TypeScript tenha passado.
- **Limitações:** não houve validação em celular físico; não declarar responsividade física homologada. Não há commit desta entrada enquanto as alterações permanecem no working tree.

## 09/11/2026 — Botão de idioma na tela de login e login 100% traduzido (pt-BR/en/es)
- **Pedido do dono:** escolher o idioma já na tela inicial de login.
- **Novo:** `components/settings/LoginLanguageSwitcher.tsx` (globo + sigla PT/EN/ES, `<select>` nativo acessível) no canto superior esquerdo do painel de login; a escolha vale para o aparelho e já se aplica ao sistema após entrar.
- **Traduzido por completo:** `features/auth/AuthScreen.tsx` (login, criar conta, recuperar senha, convite de equipe, ajuda/suporte) e as mensagens de `features/auth/useAuth.ts` (erros de login, boas-vindas, sessão). ~70 chaves `auth.*` em `i18n/locales`. Erros desconhecidos do login passam por `translateServerMessage`. Corrigidos acentos que faltavam ("sessao", "nao", "faca", "ativacao") e adicionado `aria-label` no botão de remover perfil salvo.
- **Trava por área:** `TRANSLATED_FILES` em `scripts/i18n/englishUiText.mjs` + teste "áreas já traduzidas não têm texto fixo" — qualquer texto visível escrito direto nesses arquivos (inclusive em português) reprova `npm run test:i18n`.
- **Testes:** `npm run test:i18n` 9/9; `tsc` sem erros nos arquivos alterados; `npm run build` concluído.
- **Pendências:** demais telas seguem só em português (≈3.700 textos); próxima área sugerida: portal do cliente e assinatura pública. Sem validação visual em navegador ou celular físico.

## 09/11/2026 — Pacote do servidor de cobrança 24h (n8n + WAHA + Redis + Caddy)
- **Decisões do dono:** cobrança em servidor na nuvem; Flux continua com IA gratuita e sem ações, restrito ao perfil master (já estava: `isMasterAssistantEnabled` no app e `is_platform_super_admin` na Edge Function `ai-assistant`; nada alterado).
- **Novo:** `automation/server/` (`docker-compose.yml`, `Caddyfile`, `.env.example`) e guia leigo `docs/SERVIDOR_NUVEM_COBRANCA.md`. Só o Caddy (80/443) é público; WAHA em `127.0.0.1:3000` (QR Code via túnel SSH); Redis com senha e sem porta; painel do n8n com `basic_auth`; único caminho público é `/webhook/capitalflow-manual-collections-trigger`. Versões fixas (n8n 1.50.0, Redis 7.2.5, Caddy 2.8.4; WAHA = mesma imagem do computador).
- **Achado:** `services/n8nManualCollectionTrigger.service.ts` chamava `http://localhost:5678`, então no APK e em outros aparelhos o "Cobrar agora" nunca chegava ao n8n (a fila era recuperada pelo agendamento de 5 min). Agora aceita `VITE_N8N_MANUAL_TRIGGER_URL` (somente HTTPS fora do localhost); sem a variável, comportamento idêntico ao anterior.
- **Segurança:** `.gitignore` passou a ignorar `automation/server/.env` e `**/.env` (antes um `.env` nessa pasta seria versionado).
- **Testes:** `npm run test:cloud-server` (6/6) incluído em `test:quality`; `npm run test:i18n` (7/7); `docker compose config` válido com valores fictícios; `tsc` sem erros no serviço alterado.
- **Limitações:** `Caddyfile` não validado (download da imagem Caddy falhou por timeout de rede); nada foi subido em servidor real; endpoint WAHA `/api/capitalflow/lids` sugere imagem WAHA possivelmente customizada — conferir no passo 4 do guia. Nenhuma RPC, migration, ledger ou regra financeira alterada.

## 09/11/2026 — Interface sem inglês, gatilho permanente e sistema de idiomas (pt-BR/en/es)
- **Varredura completa do frontend** (`App.tsx`, `components`, `containers`, `contexts`, `features`, `layout`, `pages`, `hooks`, `utils`) com o detector `scripts/i18n/englishUiText.mjs` (compilador TypeScript; lê texto JSX, atributos visíveis, rótulos em objetos, toasts/alertas e `new Error`).
- **Corrigido:** títulos de iframe "Legal View"/"Contrato View", "Nome de Acesso (Username)", "Error" na calculadora, abreviação "Just." do editor, acento em "Limpar formatação", explicação em português ao lado de "Client ID"/"Client Secret" (nomes oficiais do Mercado Pago, mantidos). Menus (topo, barra móvel e Perfil) deixaram de exibir o código interno da aba (ex.: "SUPPORT") quando não havia nome cadastrado.
- **Gatilho:** `npm run test:i18n` (`tests/i18n/no-english-ui.test.ts`) agora é o primeiro passo de `npm run test:quality`. Reprova texto inglês na interface, valores ingleses no dicionário pt-BR, chaves faltando em en/es e menus exibindo código interno. Exceções só via `PROPER_NAMES` (com justificativa) ou comentário `i18n-ignore`. `npm run i18n:scan` lista os achados.
- **Sistema de idiomas:** `i18n/` (dicionários `locales/pt-BR.ts`, `en.ts`, `es.ts`; `translate`, `navLabel`, `translateServerMessage`, hook `useI18n`). Seletor em **Perfil > Interface > Idioma**, salvo por aparelho (`localStorage capitalflow:language`) e refletido em `<html lang>`. Moeda e datas continuam no padrão brasileiro em qualquer idioma.
- **Erros técnicos:** `hooks/useToast.ts` passa mensagens de erro/aviso por `translateServerMessage` (rede, login, sessão, RLS/permissão, duplicidade, tempo esgotado, chave estrangeira, dado inválido, limite de tentativas, servidor). Mensagens já em português passam intactas.
- **Mudança visível:** a aba `SOURCES` aparece como "Capital" também em Perfil > Personalizar Menus (antes "Fundos"), igual ao menu superior.
- **Testes executados:** `npm run test:i18n` (7/7), testes de navegação (8/8), `tsc` sem erros nos arquivos alterados, `npm run build` concluído. `tsx --test` trava neste Windows; o script usa `tsx` direto.
- **Limitações/pendências:** só menus, seletor de idioma e mensagens de erro estão traduzidos para en/es; as demais telas permanecem em português e serão migradas para chaves aos poucos. Cerca de 145 pontos exibem `erro.message` direto em textos de tela (fora de toast) e ainda não passam pelo tradutor. Sem validação visual em navegador nem em celular físico. Nenhuma RPC, migration, ledger ou regra financeira foi alterada.

## 08/11/2026 — Blindagem de acesso exclusivo da Minha Carteira ao usuário Master (`SUPER_ADMIN`)
- **Causa identificada no Git:**
  1. **Modal de Recebimento de Contrato (`PaymentManagerModal.tsx`, commit `ae331da` de 05/11/2026):** a regra que exige selecionar `Destino na Carteira` (recebendo `capital + juros` em uma conta da Carteira sem vínculo direto de Capital, enquanto a auditoria/ledger do CapitalFlow divide o que é capital e o que é lucro/juros) foi implementada na RPC `personal_wallet_set_receipt_destination` restrita a `is_platform_super_admin()`, mas o frontend em `PaymentManagerModal.tsx` não verificava `platformAdminService.isSuperAdmin()`. Como resultado, todos os usuários comuns viam o seletor `Destino na Carteira` vazio e eram bloqueados no recebimento com o erro `"Escolha uma conta da Carteira sem vínculo de Capital para receber capital + juros."`.
  2. **Navegação e Módulo da Carteira (`App.tsx` e `walletRepository.ts`, commits `d784e11` de 25/10/2026 e `14d46db` de 07/11/2026):** `App.tsx` injetava `'MY_WALLET'` em `visibleHubOrder` para todos os usuários, havia removido `'MY_WALLET'` do redirecionamento de segurança para `DASHBOARD` e renderizava `<WalletModule />` sem `&& isPlatformSuperAdmin`, além de a migration `20261025173000` ter ativado `modulo_chave = 'carteira'` em `user_modulos` para todos os registros de `auth.users`.
- **Blindagem aplicada em múltiplas camadas (sem alterar migrations, ledger ou RPCs financeiras):**
  - **`components/modals/PaymentManagerModal.tsx`:** verifica `platformAdminService.isSuperAdmin()` antes de consultar `personalWalletService.loadOverview()`. Apenas quando `isWalletReceiptAdmin === true` (Master Admin) o seletor `Destino na Carteira` é exibido e exigido, mantendo a regra de enviar `capital + juros` para a Carteira e separar capital/lucro na auditoria do CapitalFlow. Para todos os demais usuários, o campo não aparece, nenhuma consulta à Carteira é disparada e o recebimento segue o fluxo padrão com `receiptDestinationAccountId = null`.
  - **`App.tsx`:** `visibleHubOrder` e `visibleNavOrder` filtram estritamente `'MY_WALLET'` e `'PLATFORM_ADMIN'` quando `!isPlatformSuperAdmin` (`filterRestrictedTabs`), impedindo que apareçam no cabeçalho desktop, na barra móvel (`BottomNav`), no `NavHub` ou em `Perfil > Interface > Personalizar Menus` mesmo que tenham ficado salvos em cache/preferências anteriores.
  - **Roteamento e Renderização (`App.tsx` e `main.tsx`):** acesso direto por URL (`/carteira` ou `/carteira/*`) ou estado persistido com `!isPlatformSuperAdmin` redireciona imediatamente para `/` (`DASHBOARD`); `<WalletModule />` exige `activeTab === 'MY_WALLET' && isPlatformSuperAdmin`; o roteador nativo de arquivos Android (`NativeWalletImportRouter` em `main.tsx`) exige `platformAdminService.isSuperAdmin()`.
  - **Repositório da Carteira (`features/wallet/services/walletRepository.ts`):** `getAccess(userId)` exige confirmação positiva de `supabase.rpc('is_platform_super_admin')` antes de considerar `user_modulos.ativo`, bloqueando qualquer usuário comum mesmo que possua linha herdada em `user_modulos`.
  - **Gate Arquitetural (`tests/architecture/architecture-check.mjs` e `tests/wallet/wallet-quick-receipts.test.ts`):** adicionadas verificações obrigatórias para `isWalletReceiptAdmin` / `platformAdminService.isSuperAdmin()` em `PaymentManagerModal.tsx`, `activeTab === 'MY_WALLET' && isPlatformSuperAdmin`, bloqueio no redirecionamento `['MY_WALLET', 'PLATFORM_ADMIN'].includes(activeTab)`, `const visibleHubOrder = isPlatformSuperAdmin` e `supabase.rpc('is_platform_super_admin')` em `walletRepository.ts`.

## 08/11/2026 — Avaliação Impeccable completa (Critique + Audit), tipografia, acessibilidade, suavidade de navegação e sincronização imediata de recebimentos
- **Origem:** avaliação completa com o detector oficial do Impeccable (`impeccable context`, `signals`, `detect --json features/wallet components/wallet`) e subagentes isolados de `critique` (29/40 — Good) e `audit` (14,5/20 — Good), seguida de refinamentos visuais e de fluidez (`animate`, `emil-design-eng`).
- **Melhorias na Minha Carteira (`features/wallet/**`, `components/wallet/**`, `DESIGN.md`):**
  - Documentado o token `caption-compact` (`11px`, peso 600, altura de linha 1.35) em `DESIGN.md` e eliminadas as micro-fontes de `7px–9px` e `7rem` fora da escala tipográfica, reduzindo os alertas do detector de 115 para apenas os 9 avisos intencionais de marca/chip EMV e visor da câmera.
  - Contraste elevado de `text-slate-500` para `text-slate-400` e de `text-white/55` para `text-white/80` sobre superfícies escuras (`BankStack`, `VirtualCreditCard`, `WalletBalanceDock`, `WalletCardsPage`, `CardDetailModal`, `CardInvoiceStatement`, `AccountDetailsPage`, `WalletPayablesPanel`).
  - Acessibilidade por teclado e toque: `VirtualCreditCard` recebeu `role="button"`, `tabIndex={0}`, `aria-pressed` e suporte a `Enter`/`Space`; modais customizados (`CardDetailModal`, `CardCameraScannerModal`, `QuickExpenseModal`, `WalletPayablesPanel`) passaram a fechar com `Escape`; alvos de toque ampliados nos botões de carrossel (`min-h-11 min-w-11`), copiar dados e ações de extrato.
  - `WalletBalanceDock` ocultado na aba `visao-geral` para evitar duplicação visual com o resumo principal, permanecendo ativo nas demais subpáginas; `WalletPageFrame` passou a distinguir avisos positivos (`noticeTone="info"`, esmeralda) de alertas de erro; removido código morto `newExpense` em `WalletCardsPage`.
- **Melhorias no Painel, Cabeçalho e Navegação (`pages/DashboardPage.tsx`, `components/dashboard/DashboardControls.tsx`, `layout/HeaderBar.tsx`, `layout/BottomNav.tsx`, `index.css`, `App.tsx`, `features/reports/components/MonthlyBalanceReport.tsx`):**
  - Removido o banner amarelo persistente de saldo crítico (`DashboardAlerts`) do topo do Painel e tornado o alerta correspondente no sino descartável (`isPersistent: false` em `hooks/useAppNotifications.ts`).
  - Cabeçalho do Balanço Financeiro no Painel estruturado como card alinhado à primeira linha do grid (`data-dashboard-indicator-heading`), eliminando o vão visual acima de Capital na Rua.
  - Em mobile, os utilitários de Busca, Ordenação e Exportação foram agrupados em um botão expansível (`SlidersHorizontal`) na mesma linha dos filtros horizontais.
  - Atualização imediata do card `Recebimentos do mês` (`MonthlyBalanceReport`) ao registrar pagamentos, via evento `capitalflow:payment-recorded` disparado em `DashboardContainer` e `usePaymentController`.
  - Suavidade de transições: substituído `display: none !important` em `.bottom-nav-mobile` e `.fab-action-container` por transições de GPU (`transform` + `opacity` com `cubic-bezier(0.23, 1, 0.32, 1)`); popover de notificações ajustado para `h-fit` e largura ancorada à direita (`ml-auto w-[min(21rem,calc(100vw-1.5rem))]`); transições de páginas em `App.tsx` e sub-rotas da Carteira atualizadas para `220ms` com curva `[0.23, 1, 0.32, 1]`; auto-centralização suave da aba ativa em `BottomNav.tsx`.
- **Sem alteração de domínio financeiro:** nenhuma RPC, migration, regra de fatura, liquidação, estorno ou RLS foi modificada.
- **Testes verificados:** `npx tsc -b --noEmit` (0 erros), `npm run test:wallet-overview`, `npm run test:wallet-pages`, `npm run test:tablet-layout`, `npm run test:ui-copy`, `tests/architecture/notification-bell-portal.test.mjs`, `tests/architecture/android-native-update.test.mjs`, `tests/architecture/navigation-persistence.test.mjs`.
- **Limitações:** validação visual realizada no ambiente de desenvolvimento web local (porta 3005); não houve validação em celular físico Android nesta sessão.

## 07/11/2026 — Crítica Impeccable da Carteira: idioma, datas e privacidade
- **Origem:** crítica de UX (`impeccable critique`) da Minha Carteira sobre o código da `main` após o merge `d6c1d2c`. Execução degradada: avaliação em contexto único, sem detector automático (motor do Impeccable não baixou por falta de rede) e sem navegador; análise feita somente pelo código-fonte.
- **Já resolvido antes desta revisão (confirmado no código):** a Carteira não remonta mais a página a cada evento realtime (`WalletModule` apenas dispara `capitalflow:wallet-updated`); a projeção do mês considera somente faturas com vencimento no mês corrente.
- **Corrigido:**
  - `WalletOverviewPage`: o bloco de origem do balanço exibia códigos internos (`EFFECTIVE · CANONICAL`) e o identificador técnico `(WalletBalanceFacts)`. Agora usa `describeWalletBalanceFact` (ex.: `Efetivo · Registro financeiro`), igual às páginas de Contas e Detalhe da conta.
  - `WalletPayablesPanel`: `Total` da dívida e `Falta distribuir` não respeitavam o modo privacidade; passam por `PrivateMoney`. O vencimento aparecia em ISO (`2026-11-10`) e agora aparece em `dd/mm/aaaa`.
  - `RecurringObligationsPanel`: total mensal e valor de cada recorrência passam por `PrivateMoney`.
- **Sem alteração de domínio:** nenhuma RPC, migration, ledger, cálculo de fatura, pagamento, estorno ou RLS foi tocado. Apenas apresentação.
- **Teste:** `tests/wallet/wallet-critique-regressions.test.ts`, incluído em `test:wallet-privacy`.
- **Pendências observadas e não corrigidas:** cerca de 90 textos de 7–10px em `components/wallet`, alguns em `text-slate-500` (contraste abaixo de 4.5:1 em fundo `slate-950`); poucos estados `focus-visible` em `components/wallet` (6 ocorrências para ~140 `onClick`); exclusões de lançamentos usam `window.confirm`. Nenhuma validação visual em navegador ou celular físico foi feita.

## 05/11/2026 — Reinicialização reversível exclusiva da Minha Carteira
- **Autorização:** usuário solicitou iniciar **somente sua Minha Carteira** do zero, sem modificar dados do núcleo CapitalFlow (fontes, contratos, empréstimos, parcelas, cobranças). Nenhuma exclusão física ou regravação dos saldos históricos.
- **Escopo:** contas, cartões, despesas, parcelas de despesas, operações de conta, faturas, pagamentos, contas a pagar, importações, rendimentos/receitas recorrentes e obrigações recorrentes anteriores são ocultados da **carteira ativa**, preservados integralmente no banco.
- **Mecanismo:** migração `20261105203000_personal_wallet_restart_archive.sql` cria `personal_wallet_reset_archives` (RLS por `owner_user_id`) e RPCs `personal_wallet_archive_for_restart()` e `personal_wallet_restore_restart()`; autorização restrita à identidade preexistente em `capital_source_wallet_origin_access` e `is_platform_super_admin()`. Arquivo guarda IDs históricos por coleção, data de corte, não dados financeiros duplicados; operação é transacional e idempotência segura (impede dois cortes ativos). A restauração retira o filtro sem recriar/deletar lançamentos.
- **UI:** `personalWalletService.load()` e `loadOverview()` aplicam `filterCurrentWalletRows` antes do cálculo de saldos, limite, compromissos e faturamento. Novos cadastros de contas e cartões começam com IDs não arquivados e são visualizados normalmente. `fontes` continua fora do filtro e intacta.
- **Invariantes:** não executar `DELETE`, `TRUNCATE`, `UPDATE` em `fontes`, `contratos`, `parcelas`, `personal_wallet_accounts`, `personal_wallet_cards` ou qualquer lançamento financeiro antigo. Não limpar o PIN/proteção do cofre ou instituições compartilhadas. Os dados antigos ainda existem para recuperação e integridade referencial.
- **Verificações:** teste de snapshot dentro de transação `ROLLBACK` executado com o papel `authenticated` da identidade autorizada; `RLS` ativa, leitura somente pelo proprietário, sem `INSERT` direto, RPC restrita. Testes em `tests/wallet/wallet-restart-archive.test.ts`. **Pendente:** confirmação da publicação Android/web no mesmo commit e teste visual no aparelho. Risco residual: rotinas externas que consultem diretamente tabelas antigas devem ser auditadas antes de operações automáticas pós-reinício.

# Carteira — estado de continuidade e proteção contra regressões
Atualizado: 05/11/2026. Documento versionado junto às alterações da Carteira.

## 05/11/2026 — calculadora nos lançamentos e anulação segura de lançamento manual
- **Extrato da conta → Movimentar conta:** campos de valor e saldo inicial usam o componente de calculadora monetária compartilhado (`FinancialCalculatorInput`), aceitando soma, subtração, divisão, multiplicação, parênteses e percentuais; apenas o valor resultante validado é enviado ao serviço financeiro. A semântica de campos vazios e centavos permanece consistente com os demais componentes.
- **Erro identificado pelo usuário:** despesa manual `Impressão` de **R$ 8,00** lançada por engano. A consulta de produção localizou um registro correspondente; o lançamento **não foi modificado diretamente pelo assistente**. A interface passa a oferecer `Excluir` nessa linha, mediante confirmação.
- **Sem exclusão física:** migração `20261105190500_wallet_void_manual_operation.sql` adiciona `voided_at` e `voids_operation_id` à tabela `personal_wallet_account_operations`. A RPC `personal_wallet_void_manual_operation(uuid)` valida `auth.uid()`, `SUPER_ADMIN`, titularidade, operação manual elegível e ausência de vínculo com contrato, cobrança ou parcela. Reverte o efeito do lançamento no saldo da conta **dentro da mesma transação**, criando operação compensatória e marcando o registro original e seu estorno. Ambos permanecem auditáveis no banco, mas não aparecem no extrato operacional comum. Transferências, pagamentos de faturas, operações de contratos, saldos iniciais e ajustes de saldo exigem processos próprios, não este atalho.
- O bloqueio de saldo insuficiente permanece válido ao anular uma receita que já foi utilizada. Duplicidade de anulação é rejeitada. Sem `DELETE` nem concessão de escrita direta a usuários, preservando a RLS e o histórico anterior.
- O extrato e a soma filtram as operações `voided_at`, sem ocultar lançamentos não relacionados. UI usa `window.confirm`, atualiza os dados somente após RPC confirmar e mantém mensagens em português brasileiro.
- Validação: `tests/wallet/wallet-account-manual-void.test.ts`; o RPC foi testado no Supabase de produção com `BEGIN/ROLLBACK` sobre o registro de R$ 8,00, **sem conservar alterações**. É necessário teste final em Android e publicação do commit correspondente.

## 05/11/2026 — calculadora no Novo Contrato e correção do saldo operacional real
- **Novo Contrato:** os campos financeiros de principal, juros %, multa %, mora %, taxa/custo/total do cartão, margem do cliente, valor de parcela, valor previsto dos juros e valores do parcelamento passam a usar `components/forms/FinancialCalculatorInput.tsx`. A expressão é editada localmente; somente o resultado numérico validado é enviado a `formData` ao sair do campo/confirmar, preservando as fórmulas contratuais anteriores. `ƒx` oferece operadores no celular. Não se aplicam cálculos financeiros a datas ou contagens de parcelas.
- **Sem execução dinâmica:** o parser em `features/wallet/utils/parseWalletMoney.ts` continua usando aritmética fixa BigInt, sem `eval`; `parseWalletRate` suporta até 6 decimais para taxas, mantendo valores monetários em centavos e operações `700+4,99%`, `700+200`, `×`, `÷` e parênteses. Erro aritmético não atualiza o contrato e ativa validação do campo, prevenindo salvar um valor anterior por engano.
- **Fontes Nu / Nubank:** em produção foram confirmadas fontes distintas: `Nu` tipo `CARD` com saldo operacional 0, outra `Nu` tipo `BANK` com saldo 500, e `Nubank` tipo `BANK` com saldo 1000. A fonte `Nu` tipo cartão possui duas associações explícitas (conta e cartão); vínculo não transforma limite de crédito em saldo operacional.
- **Correção manual de saldo real:** o editor de `Fontes de Capital` recebe a mesma calculadora, incluindo valores negativos permitidos para inventário existente (`parseWalletSignedMoney`). O fluxo `handleUpdateSourceBalance` preserva a atualização autorizada já existente, mas passa a exigir retorno exato da linha atualizada pelo Supabase; a UI não confirma sucesso caso RLS impeça a gravação. É correção da posição real informada pelo usuário, não reconstrução fictícia do histórico. Não eliminar auditorias já existentes nem alterar contratos retroativamente.
- **Validação:** `tests/wallet/loan-financial-calculator.test.ts` cobre parser, campos financeiros, bloqueio de cálculos inválidos e confirmação do saldo. Compilar, testar em Android físico, verificar assinatura e deploy Cloudflare antes de marcar homologado.

## 05/11/2026 — correção do salvamento da origem e remoção do valor manual
- Erro de UX: o modal de edição tinha **dois botões separados** (`Salvar origens` e `Salvar alterações`). Salvar a edição não persistia a seleção das contas e cartões; parecia que a associação sumia após sair.
- Correção: **um único botão `Salvar alterações`** grava primeiro a lista de origens via RPC e relê as referências daquela fonte, validando os IDs persistidos. Se a leitura confirmar, atualiza a listagem e fecha o modal; se ocorrer erro, mantém o modal aberto e mostra o motivo. Mudanças no saldo operacional ou logo seguem o procedimento existente, sem regravar o saldo quando apenas o vínculo foi alterado.
- Removido `Informar valor` do seletor. A associação utiliza **sempre o saldo integral da conta ou limite de crédito disponível do cartão** no momento da leitura. Ao salvar, `allocated_amount` é `null`, inclusive para desfazer montantes manuais de vínculos anteriores.
- Verificação com transação `BEGIN/ROLLBACK` no Supabase de produção (sem conservar registros): RPC `capital_source_replace_wallet_origins` gravou uma associação e a consulta sob o papel `authenticated` conseguiu lê-la. A tabela de produção antes dos testes apresentava zero vínculos; o teste deixou zero registros.
- `tests/wallet/source-wallet-save.test.ts` e `source-wallet-multiple.test.ts` protegem o botão único, a confirmação de leitura e a ausência de input manual. O vínculo permanece exclusivo ao usuário autorizado e não movimenta ledger, limites ou saldos.
- Pendente: confirmar fluxo efetivo em dispositivo Android após APK publicado para o commit correspondente; Cloudflare Pages exige verificação independente.

## 05/11/2026 — exibição dos valores associados nos cartões das fontes
- **Problema confirmado:** `SourceCard.tsx` exibia exclusivamente `fontes.balance`, mesmo com origens escolhidas no modal. A associação não era consultada na página de fontes; o usuário via R$ 0,00 mesmo ao selecionar um cartão com crédito disponível.
- **Correção:** `pages/SourcesPage.tsx` consulta, somente após verificação de acesso do proprietário pelo RPC `can_manage_capital_source_wallet_origins`, a tabela `capital_source_wallet_references` e o snapshot de contas/cartões da Minha Carteira. A leitura é somente informativa. `domain/sources/sourceReferenceDisplay.ts` calcula o valor de referência por origem (valor manual associado, quando informado; caso contrário, saldo da conta ou limite disponível do cartão). `SourceCard` mostra **Valor associado na Minha Carteira** e linhas individuais de conta/cartão, com **Saldo operacional** separado. Não confundir os dois indicadores nem usar referência como dinheiro em caixa.
- O botão **Salvar origens** dispara o evento `capitalflow:source-origins-updated` após RPC bem-sucedida, atualizando os cartões sem recarregar a página. `capitalflow:wallet-updated` também recarrega os valores quando a Carteira notifica mudança.
- **Verificação importante:** durante a investigação o Supabase de produção tinha **zero registros** em `capital_source_wallet_references`. A seleção visual no editor, sem concluir **Salvar origens**, não é um vínculo persistido. O painel não deve simular associação sem banco; `null` ou origem indisponível não são R$ 0,00.
- O módulo continua restrito à identidade já autorizada (não basta ocultar na UI); não alterar `fontes.balance`, contratos, faturas, limites, ledger, saldo de contas ou outros usuários. Teste `tests/wallet/source-reference-display.test.ts` protege a separação dos valores e a atualização visual.
- Pendente: validar visualmente a atualização em dispositivo real e confirmar o deploy Cloudflare do commit correspondente.

## 05/11/2026 — Fontes de Capital: várias origens opcionais, restritas ao usuário principal
**Pedido:** no modal \`Fontes de Capital → Editar carteira\`, poder selecionar e salvar **uma ou mais origens simultaneamente**, inclusive **conta e cartão** da Minha Carteira, ou nenhuma (fonte independente). O seletor anterior permitia apenas uma referência por fonte e exigia um salvamento separado; não reintroduzir essa limitação.

**Interface e dados:**
- \`components/sources/SourceWalletReferencePanel.tsx\`: lista compacta de contas e cartões elegíveis, caixas de seleção múltipla, opção de **valor associado individual** (R$) por recurso, indicação do saldo da conta ou crédito disponível do cartão e ação explícita **Salvar origens**. O componente permanece **dentro do modal Editar carteira** da fonte específica, não em seção duplicada no rodapé da página.
- \`domain/sources/sourceWalletReference.ts\`: \`WalletReference.allocated_amount\` opcional, sem substituir \`fontes.balance\`.
- A tabela já existente \`capital_source_wallet_references\` conserva os vínculos anteriores; a chave passa a \`(source_id,target_kind,target_id)\`, com \`allocated_amount numeric(14,2)\` opcional. Uma mesma fonte pode selecionar várias contas e/ou cartões; cada recurso permanece exclusivo a uma fonte pelo índice único já existente. **Não criar tabelas paralelas de contas, cartões ou fontes.**
- \`capital_source_replace_wallet_origins(uuid,jsonb)\` substitui **a lista inteira em uma transação atômica**; valida todos os itens, propriedade da fonte, conta/cartão, duplicatas, status e ausência de integração bancária automática conflitante. Qualquer erro reverte a operação completa. O RPC individual antigo permanece como adaptador para compatibilidade, mas seu uso por versões antigas substitui a lista por uma única origem. Atualizar o APK antes de editar origens em versões anteriores.

**Acesso exclusivo e isolamento:**
- **Disponível somente ao usuário principal originalmente autorizado**, não a operadores nem usuários comuns. Em 05/11/2026 havia um único \`SUPER_ADMIN\` no Supabase CapitalFlow \`hzchchbxkhryextaymkn\`.
- A migração \`20261105141000_capital_source_wallet_multi_origins.sql\` criou \`capital_source_wallet_origin_access\`, com permissão inserida **somente para esse usuário existente**, e o RPC \`can_manage_capital_source_wallet_origins()\`. Novos \`SUPER_ADMIN\` não recebem acesso por simples concessão do papel.
- O frontend verifica o RPC de autorização antes de exibir; o servidor exige o mesmo controle mais \`auth.uid()\`, titularidade das fontes e de cada recurso. RLS ativa; sem \`INSERT\`/\`UPDATE\` direto para \`authenticated\`; gravação somente pela RPC autorizada. Não utilizar nome/email, texto da interface ou dados controlados pelo cliente para conceder acesso.

**Sem movimentação automática:** o vínculo e os valores informados são **metadados de referência**, não disponibilidade bancária em tempo real. Não alteram saldo operacional de fonte, saldo de conta, limite do cartão, fatura, empréstimos, contratos, ledger, pagamento ou estorno. A consulta de crédito disponível não é transferência de dinheiro. Fontes continuam autônomas e não recebem sincronização ou reconciliação implícita.

**Validação:** migração aplicada ao Supabase de produção; RLS ativa; apenas uma identidade na lista de acesso; RPC executável apenas por autenticados; gravação direta sem privilégios; nenhuma origem criada automaticamente. Regressões: \`tests/wallet/source-wallet-multiple.test.ts\` e \`tests/wallet/source-wallet-reference.test.ts\`, além dos gates gerais de qualidade/Android. **Pendente:** comprovação visual de edição múltipla em aparelho Android, CI e publicação correspondentes ao commit desta alteração; verificar Cloudflare separadamente. Não alegar execução financeira ou conciliação automática.


## 04/11/2026 — fatos de saldo sem ambiguidade de zero
- `components/wallet/walletBalanceDomain.ts` agora expõe `WalletBalanceFacts` com estados e origens explícitos para saldo efetivo, inicial, projetado, reconciliado, importado e pendente.
- `null`, `undefined`, `NaN` e infinito permanecem `UNKNOWN`; `0` continua sendo um valor financeiro real quando informado.
- `calculateWalletBalance` preserva os campos existentes e passa a retornar `facts`, sem alterar RPCs, ledger, tabelas, RLS ou o layout da Carteira.
- Regressão coberta por `tests/wallet/wallet-balance-facts.test.ts`, incluindo zero real, valor desconhecido e valor pendente negativo normalizado para zero.
- Limitação: componentes de apresentação ainda precisam migrar gradualmente de cálculos locais para esses fatos; não declarar a consolidação completa do domínio até essa migração.

## 04/11/2026 — linha do tempo enxuta da Carteira
- Criado `features/wallet/domain/walletTimeline.ts` para organizar, em uma camada somente leitura, operações, transferências, parcelas pendentes, contas a pagar e pagamentos de fatura.
- Transferências internas são marcadas como `NEUTRAL`, evitando contabilizá-las como receita ou despesa no resumo da Carteira.
- Parcelas exibem somente o saldo restante (`amount - paid_amount`); parcelas pagas, canceladas e totalmente quitadas ficam fora da timeline.
- Eventos são ordenados por data e pagamentos de fatura já representados por uma operação com o mesmo `request_id` não são duplicados.
- Teste: `tests/wallet/wallet-timeline-domain.test.ts`. A camada ainda não substitui a seção visual de compromissos; a integração na UI deve reutilizar o layout atual, sem criar uma tela paralela.

## Intenção de produto
Interface compacta, visual, semelhante a um banco digital, com cartões e contas reais cadastrados pelo usuário; assistência de gastos baseada apenas nos registros existentes. Mobile, tablet, desktop e APK usam o mesmo SaaS híbrido.

## Escopo preservado
- Nenhuma mudança de ledger, RPC de pagamento, estorno ou saldo, tabelas `personal_wallet_*` ou políticas RLS neste trabalho.
- `WalletOverviewSummary` mantém links para detalhes do cartão e valores calculados pelo domínio existente.
- `WalletSpendingGuide` é somente leitura. A projeção não é saldo bancário garantido.
- No importador, revisão e confirmação explícitas são obrigatórias antes do registro via `personalWalletService.recordStatementRow`. A baixa financeira utiliza os métodos canônicos existentes.

## Importação de extratos e faturas
- OFX/QFX: processado localmente, suporta SGML/XML, datas válidas, Windows-1252 e valores com vírgula/ponto. Compras em cartão são positivas; estornos/pagamentos são negativos e **não selecionados**. FITID fornece chave estável da transação.
- PDF com texto selecionável: processamento local via pdfjs. Suporta valores brasileiros, datas DD/MM, datas com mês abreviado (por exemplo 10 out) e data/valor em linhas consecutivas. Resultados começam desmarcados para conferência.
- PDF digitalizado/imagem: texto pode estar ausente. O botão “Ler PDF com IA” só envia o PDF ao Google Gemini após uma confirmação explícita do usuário e configuração de API, com possível cobrança da API.
- Não inventar lançamentos ausentes, nem usar valor total da fatura como uma compra.
- PDFs bancários possuem layouts variados: sem faturas reais de cada instituição, não é correto afirmar reconhecimento universal. Alguns extratos ainda precisam de correção manual.
- Sem envio automático de documentos bancários para serviços externos.

## Verificações de regressão
- `npm run test:wallet-statement-import`: OFX comprado/estornado, charset e datas, PDF de tabela/parcelas e opt-in para IA.
- `npm run test:quality`: build, gates gerais e importador.
- Testar visualmente no APK: espaço reduzido, campos de edição, listas longas, correção de sinais e seleção/desmarcação.
- Antes de publicar, inspecionar diff e não tocar em serviços financeiros sem autorização específica.

## Pendências
- Teste com PDFs/OFX reais e anonimizados de bancos variados, incluindo faturas digitalizadas.
- Conferência visual em aparelho Android e tablet físicos.
- Revisão de segurança do cofre de cartão, especialmente armazenamento de CVV/CVC (fora do escopo e não alterado).
- Quality Gate geral de dependências tem apresentado falhas independentes do build Android; acompanhar e não declarar aprovação global sem verificar.

## Entrega visual seguinte — 30/10/2026
- **Contas**: `AccountCardStack` mantém a lista compacta da visão geral e usa grade de instituições na página Contas, com logo e saldo por banco. Sem simular saldo de conta como limite de crédito.
- **Balanço do mês**: trilho compacto Recursos / Compromissos / Projeção e detalhe sob demanda. Reutiliza somente `calculateWalletBalance`; não altera as fontes ou as regras.
- **Ajuda com gastos**: `WalletSpendingGuide` agora contém barras de categorias calculadas por `getWalletSpendingOverview`, pontos de atenção determinísticos, estado vazio e informação explícita sobre compras parceladas.
- **Conceito dos valores**: gráfico de categorias soma as despesas originárias cadastradas pela data da compra e valor total; não representa faturas pagas, liquidez nem despesas efetivamente baixadas no mês. Exclui abertura de cartão, invoice override, cancelamentos e valores negativos. A consulta pode estar sujeita à paginação do backend.
- **Testes novos**: `npm run test:wallet-visual-next` cobre categorias, dezembro/janeiro, centavos, cancelamentos, zero dados, UI sem writes e integração com components existentes. Incluído em `test:quality`.
- **Skill própria**: `.agents/skills/capitalflow-wallet-ux/SKILL.md` junto a `AGENTS.md` fornecem continuidade sem depender da memória do chat.
- **Pendente**: validar capturas reais em smartphone, tablet e PC; testes de carga por instituição e priorização de categorias, validação com despesas parceladas reais.
- **Restrições**: não tocar em DB, ledger, RPC ou tabelas `personal_wallet_*` nesta entrega.

## Ajuste de importação e ocupação do espaço — 30/10/2026
- Verificação **somente de metadados** na instância Supabase `hzchchbxkhryextaymkn`: existem `public.personal_wallet_statement_rows` (RLS ativo), índice de idempotência, `personal_wallet_record_statement_row` e `personal_wallet_import_card_statement_purchase`. As funções de gravação têm privilégio de execução para usuários autenticados, e checam permissão de administrador. Nenhuma alteração no banco.
- Problema encontrado: o cliente enviava `p_installment_number` e `p_installment_total` na chamada RPC, mas a função implantada aceita **exatamente oito parâmetros**, até `p_category`. Isto impede o registro (incompatibilidade de assinatura). O cliente passou a enviar somente os oito aceitos.
- Parcelas extraídas podem ser mostradas para conferência, mas **o banco atual NÃO registra metadados da parcela na linha importada**; um lançamento importado continua sendo lançado individualmente no ciclo escolhido. Não declarar importação integral do plano de parcelas.
- Extração PDF: reconhece disposição fornecedor-data-valor, pontos nas datas, e data/descrição/valor em até três linhas; mascara datas antes de buscar valores para evitar falsos centavos. Faturas digitalizadas ainda exigem leitura opcional por IA com confirmação. Não há garantia de reconhecer qualquer fatura de qualquer instituição sem amostras.
- Interface: navegação interna mais compacta, cabeçalho com ação de atualizar ao lado, importação acessível pelo botão na pilha de cartões, com rolagem para o leitor. FAB global não se sobrepõe à tela Cartões; ações locais permanecem.
- Testes: `test:wallet-statement-import` ampliado, `test:wallet-import-contract` incluído em `test:quality`. Não afirmar validação de arquivo bancário específico sem arquivo fornecido.
- Atenção: chave Gemini via `VITE_*` no frontend é exposta ao cliente; não colocar chaves secretas no bundle. Migração para proxy protegido da IA requer plano e revisão de segurança separados.

## Refinamento de interface solicitado — 30/10/2026 (aba Geral)
**Motivação:** captura real no APK mostrando excesso de área vazia sob o cabeçalho, indicador verde de sincronização, faixa de navegação desproporcional e duplicação das ações de despesa/atualização.

**Decisões preservadas**
- A indicação `Sincronizado/Conectando` sai **somente da apresentação**; `useWalletRealtime` continua ativo e dispara `capitalflow:wallet-updated`. Não desativar Realtime, cache ou carregamento automático.
- As cinco rotas internas (Geral, Cartões, Contas, Dívidas, Receitas) continuam acessíveis. A faixa grande com aba azul preenchida vira navegação compacta por sublinhado azul, sem rolagem lateral no celular. Não eliminar a navegação.
- A cor de ação é `blue-600`, conforme `DESIGN.md`; o ícone do cabeçalho deixa o gradiente fúcsia específico.
- A aba Geral **não exibe botão Lançar despesa nem Atualizar indicadores**. O FAB compartilhado continua sendo a entrada de despesa; o aviso de erro continua oferecendo `Tentar novamente`. Não criar outro lançador.
- O painel de liquidez permanece com total consolidado e navegação para contas, mas sem o card interno redundante e sem repetir "Saldo disponível" a cada linha compacta. A tela Contas mantém os rótulos completos.
- Preservados: carrossel bancário dos cartões, saldo real e limites separados, `getCreditSummary`, `calculateWalletBalance`, lista de compromissos e todas as RPCs existentes.
- Nenhuma tabela Supabase, função financeira, migração, importador ou API foram alterados nesta entrega. As alterações são React/Tailwind e documentação/testes.

**Regressão protegida**
- `npm run test:wallet-visual-simplification` verifica ausência de controles redundantes e preservação da sincronização, rotas, acesso via FAB, resumo das contas e ausência de `supabase.rpc/from` na apresentação.
- O teste existente `tests/wallet/wallet-ui-architecture.test.ts` foi atualizado para a densidade compacta `px-2.5 py-2.5` mantendo a proteção da renderização institucional e demais asserções.
- `npm run test:quality` inclui a verificação; sempre consultar resultado efetivo do workflow Android e do Quality Gates separadamente.
- Captura do usuário é referência visual real. **Não confundir mockup de imagem gerada com implementação**; esta entrega modifica componentes do GitHub, sem gerar imagens.
- **Pendente de validação física:** render em 320/360/390px, tablet e desktop, especialmente quebra de palavras, safe area e FAB acima da navegação. Uma compilação aprovada não prova responsividade visual.

## Desempenho e limpeza do primeiro painel — 30/10/2026

**Pedido:** remover "Panorama financeiro" e o subtítulo redundante na aba Geral; reduzir tempo para abrir e trocar telas da Carteira sem sacrificar atualização de saldo, segurança nem FAB.

**Causa identificada no código:** `personalWalletService.load()` faz 13 consultas ao banco em paralelo e depois aguardava uma URL assinada **por imagem**. A tela inicial e o FAB montado solicitavam snapshot; o `walletRepository` só compartilhava requisições simultâneas, descartando o resultado após concluídas. Em cada remount/navegação surgia novo carregamento completo.

**Mudanças feitas:**
- Cabeçalho duplicado removido em `WalletOverviewPage`. As abas já ficam sob `Minha Carteira`; a visão Geral começa diretamente nos dados.
- `walletSnapshotCache` usa cache **somente em memória por usuário, TTL de 25 segundos** e deduplicação de requisições. `getSession()` valida a identidade antes de devolver dados; uma mudança de conta invalida o cache. Não persistir snapshots em `localStorage` nem compartilhar sessões.
- Qualquer `capitalflow:wallet-updated` invalida imediatamente o cache. A atualização explícita ou disparada por evento usa `load({ force: true })`, prevenindo saldo antigo após gravação. Requisições anteriores à invalidação não contaminam o cache.
- `WalletExpenseFab` aparece imediatamente sem aguardar um snapshot completo; contas/cartões para o formulário são buscados **apenas quando o usuário toca Adicionar despesa**. Mantém as quatro ações e o fluxo canônico `QuickExpenseModal`.
- URLs de imagens personalizadas em cartão/conta usam `createSignedUrls` em lotes até 50, em paralelo entre os dois buckets. Falha de imagem opcional não impede carregar valores financeiros. Não mudamos dados nem operações do banco.
- `npm run test:wallet-loading`: isolamento entre usuários, cache/forçar atualização, invalidação durante requisição, lotes de assinatura de imagens, FAB e ausência do título redundante. Integrado ao gate `test:quality`.

**Limites conhecidos:** o primeiro acesso ainda precisa consultar as 13 fontes porque a Carteira tem muitos recursos que dependem do snapshot. Não foi medida latência real no aparelho/rede, logo não declarar velocidade em segundos nem "instantâneo". Uma otimização futura de carregamento progressivo por rota exige revisar com cuidado dados de faturas, parcelas e RLS, sem truncar conjuntos ou alterar saldos.

**Regra contra regressão:** não reintroduzir o cabeçalho duplicado, carga eagerly pelo FAB, cache global sem identidade do usuário, ou atualizar saldo a partir de snapshot com TTL sem invalidar alterações. Não substituir RPCs e não alterar semântica financeira.

## Evolução bancária: carregamento por necessidade e orientação financeira (30/10/2026)

### Motivo e diagnóstico
O cache anterior reduzia consultas repetidas, mas a primeira visita à aba Geral continuava solicitando o mesmo `personalWalletService.load()` de 13 fontes, seguido de tratamento e assinaturas de imagens. A navegação carregava estaticamente os seis componentes de tela, incluindo editores e importadores não utilizados no primeiro acesso. Não foram fornecidos tempos reais de rede, portanto não se afirma redução percentual ou tempo específico.

### Implementação
- **`personalWalletService.loadOverview()`**: oito fontes necessárias para a visão Geral: contas, cartões, despesas, parcelas, pagamentos de faturas, contas a pagar, receitas recorrentes e seus recebimentos. Mantém compras/parcelas completas para calcular ciclos de fatura por `getCardCreditPosition`; preserva RLS e não muda RPCs financeiros. Não consulta linhas de extrato, movimentações, pagamentos de contas a pagar, obrigações recorrentes nem fontes de capital nessa tela. Não solicita links de imagem assinados porque a visão Geral utiliza os logos locais.
- **`walletRepository.loadOverview`**: cache TTL 25 s **separado por usuário** para esse subconjunto, reutilização de requests simultâneos e invalidação pelo evento `capitalflow:wallet-updated`. `load()` permanece para páginas completas que requerem todas as informações. Atualização explícita e realtime usam `force:true`.
- **`WalletOverviewPage`**: recebe `WalletOverviewSnapshot` com o domínio financeiro existente. Não troca fórmula de saldo, limite, parcela, fatura, dívida ou projeção.
- **`routes.tsx`**: React.lazy + Suspense, com código de Cartões, Contas, Dívidas, Receitas e Cobrança baixado quando a área é aberta. O primeiro acesso baixa o código da visão Geral sem incluir necessariamente todos os editores da Carteira. Isso não garante redução de rede sob cache de browser e não substitui análise do bundle.
- **`WalletSpendingGuide`**: orientação individual READ_ONLY: saldo projetado, uso de limite, quantidade real de compromissos vencidos e próximos 7 dias, receitas recorrentes registradas como previstas ainda não recebidas, categorias e comparação com mês anterior. Recomenda somente conferir compromissos/receitas existentes; não inventa potencial de ganhos. Para mês anterior com total zero, não calcula variação percentual.
- **Prioridade visual**: alertas vêm antes dos gráficos no mobile, com identidade de marca e superfícies discretas. Não há novo FAB, botão de atualizar ou painel desnecessário.

### Testes e salvaguardas
- `npm run test:wallet-fast-path` cobre estrutura do recorte das oito consultas, uso do domínio canônico de crédito, carregamento dinâmico das telas, textos de risco/receitas e ausência de indicadores sem dados.
- Testes existentes `wallet-overview` e `wallet-loading` foram alinhados ao novo método `loadOverview`, sem eliminar verificações anteriores.
- `npm run test:quality` inclui o novo teste. Resultado do Android e do Quality Gates deve ser conferido no commit exato.
- **Não foi alterado nenhum banco de dados, RLS, RPC, pagamento, ledger, saldo, contrato ou fluxo de estorno.**
- **Pendências**: medir cold start/tempo de primeira informação no Android e desktop com rede real; paginar histórico por seção sem truncar valores contábeis; revisar bundle via analyzer; alertas de push e orçamento por categoria exigem modelagem funcional e permissões de notificação; segurança do cofre/CVV continua pendente.

## Correção FAB + cadastro coerente com Supabase — 30/10/2026

**Problemas confirmados em produção**
1. `WalletModule.tsx` tinha `route !== 'cartoes' && <WalletExpenseFab />`: suprimia o FAB na aba Cartões. Correção: mesmo FAB canônico montado em todas as cinco abas; margem inferior ajustada em Cartões para reduzir colisão com a barra inferior. Não duplicar outro FAB nessa aba.
2. `personal_wallet_accounts` não tinha a coluna `bank_details`, enquanto `createAccount()` e `updateAccount()` a enviavam. Isso causava erro PostgREST PGRST204. A migração Supabase `wallet_accounts_optional_bank_details_jsonb` **versão 20261030130657** foi aplicada no projeto `hzchchbxkhryextaymkn` e verificada em `information_schema.columns`: `jsonb NOT NULL DEFAULT '{}'`. Fonte versionada em `supabase/migrations/20261030130657_wallet_accounts_optional_bank_details_jsonb.sql`. RLS existente, saldos, IDs e RPCs preservados; reload do schema solicitado.
3. `CreateAccountModal` interpretava `1.234,56` com `Number()`, reduzindo saldo inicial inválido silenciosamente a zero. Agora usa `parseWalletMoney` e comunica erro; a aplicação de saldo inicial permanece exclusivamente via RPC `personal_wallet_initialize_account_opening`.

**Cadastro pré-preenchido**
- Usar `activeUser.fullName/name` no cartão e nos campos `bank_details.holder_name` das contas próprias; documento de `activeUser.document` somente quando formato aparente CPF/CNPJ, editável.
- Se nome não estiver disponível no contexto, buscar de `public.profiles.full_name` do usuário autenticado com `getUser()` e `RLS` própria. Não buscar perfis de outros usuários.
- Opções explícitas `Cartão de outra pessoa` e `Conta de outra pessoa` removem a sugestão do perfil e exigem nome do titular próprio. Nunca usar dados do proprietário em contas de terceiros. Nenhum campo de banco, agência, número do cartão ou chave PIX é adivinhado ou sincronizado com bancos externos.
- Coluna `personal_wallet_cards.cardholder_name` já existe; coluna `personal_wallet_accounts.bank_details` agora armazena metadados de agência, conta, nome e documento de titular, produtos opcionais. Não representam saldo ou limite de crédito oficial.
- `CreateAccountModal` aceita fontes de capital fornecidas, inclusive lista vazia, sem nova carga integral desnecessária.
- Testes `test:wallet-onboarding-schema` cobrem idempotência da migração PGlite, preservação dos registros, FAB em Cartões, preenchimento do titular e conta de terceiros; incluídos em `test:quality`.

**Regra de arquitetura:** antes de criar/enviar qualquer nova propriedade no payload Supabase, consultar `information_schema` no projeto real e verificar RPCs, RLS e tipos. Manter o esquema versionado e proteger o contrato com teste. A identidade do proprietário autenticado não é autorização para operar contas de terceiros; tudo continua limitado ao titular autenticado autorizado pelas políticas.

**Pendências de validação:** testar a interface em smartphone físico, cadastro real de conta e cartão com usuário autorizado, vinculação PIX sem inferir chaves, e regressões de navegação. Compilação aprovada não prova funcionalidade em aparelho. Verificar Quality Gates e release do commit exato.

## Correção 30/10/2026 — importação nativa de faturas + falha de rede + seletor Android

**Evidências:** prints enviados pelo usuário mostram (a) `TypeError: Failed to fetch` bloqueando a Carteira, (b) popup nativo de autocomplete/datalist de bancos sobreposto a múltiplos inputs do modal e ao teclado do Samsung, (c) Gmail Android com anexo OFX sem CapitalFlow na opção "Abrir com".

**Implementações:**
- Substituir `<datalist>` do cadastro de instituições por `<select>` de banco com `Outro banco ou instituição` e input dedicado. Nada de sobreposições nativas dentro do WebView. Mantém nickname, saldo inicial auditado e campos de titular/terceiro.
- `useWalletAccess` preserva estado ativo já confirmado **somente** durante falha de rede de revalidação; acesso desconhecido/negado continua bloqueado. Usuário vê mensagem legível e botão `Tentar novamente`, recuperação em `online`/focus e auth callback; nenhum bypass de `user_modulos` ou RLS.
- Projeto Android gerado pelo CI recebe `WalletFileInboxPlugin.java` e novos filtros `ACTION_VIEW`/`ACTION_SEND` para PDF, OFX, QFX, octet-stream. MIME genérico somente após ação explícita do usuário e com validação de extensão suportada. Ler com `ContentResolver.openInputStream`, máximo 10 MB, sem permissão genérica de storage ou upload automático. Registrar plugin antes de `BridgeActivity.onCreate`; tratar `onNewIntent` e app aberto/cold launch.
- `main.tsx` detecta documentos recebidos e abre `/carteira/cartoes`. `NativeWalletFileInbox` recebe o conteúdo mediante ponte Capacitor. Antes de gravar, faz escolha do tipo (fatura cartão ou extrato conta) e do destino, com sugestão estrita baseada no tipo OFX, banco e identificador de conta/cartão, exigindo unicidade. Instituições ambíguas **não são atribuídas automaticamente**. PDFs sem metadados identificáveis requerem escolha manual.
- Reutilizar `FlatSmartStatementReader` com `initialFile`, mesmo parser OFX/PDF e RPCs canônicas já existentes. **Nenhum lançamento automático apenas por abrir o documento**: exigir revisão e confirmação do usuário. Nunca tratar pagamento/estorno de cartão como compra. Leitura local por padrão; IA opcional mediante consentimento expresso.
- `tests/wallet/wallet-native-file-inbox.test.ts` protege fluxos e ambiguidade de bancos. Integrar `test:wallet-native-inbox` ao `test:quality`.
- Sem modificações nas tabelas e políticas financeiras de Supabase. Problema `Failed to fetch` é de comunicação/controle de estado, não comprovadamente banco desativado; não tratar sucesso de CI como prova da estabilidade da rede real.

**Riscos e limites ainda exigindo teste em aparelho físico:** Android Gmail pode declarar MIME inconsistente e aplicativos diferentes usam provedores URI diferentes; validar filtro com anexo OFX da instituição específica e comando `adb shell am start`, cold start e app já aberto. O PDF digitalizado continua dependente de IA opcional; identificar destino por PDF sem metadados confiáveis não é seguro. A associação é **sugestão + confirmação** antes de qualquer escrita. Keyboard resize no Samsung deve ser observado após remoção do datalist.

## 30/10/2026 — FAB Receber valor, baixas de clientes e visão de receitas

### Motivação e regra de domínio
O usuário apontou a ausência de `Receber valor` no FAB, quer registrar entrada comum ou selecionar cliente/contrato/parcela usando as **opções originais de pagamento do CapitalFlow**, abatendo contrato sem duplicar saldo. Acompanhar a melhoria visual com propostas concretas. A tela enviada mostra um FAB com quatro opções em coluna, ocupando muito espaço.

**Regra inegociável: não gravar duas entradas para um mesmo pagamento.** A Carteira não processa autonomamente contratos nem cria liquidações de empréstimo via `personal_wallet_record_account_operation`. Os pagamentos de clientes devem passar por `PaymentManagerModal` -> `paymentCtrl.handlePayment` -> Payment Engine canônico e espelhamento existente da fonte de Capital quando vinculado. Sem vínculo, não inventar associação ao saldo de uma conta bancária.

### Implementação
- `features/wallet/components/WalletExpenseFab.tsx`: quinta ação **Receber valor**, importação lazy do modal, preservadas as quatro ações anteriores e o FAB nas cinco abas; menu organizado em painel compacto com uma ação principal e quatro ações em grade de duas colunas, safe-area, acessível por teclado.
- `features/wallet/components/QuickIncomeModal.tsx`: modos **Entrada comum** e **Cliente CapitalFlow**.
  - Entrada comum: usuário escolhe conta, valor BRL, data, categoria e descrição; código usa `prepareManualIncome`, valida conta da lista acessível, centavos, valor positivo, data válida não futura, descrição e UUID; grava exclusivamente por `personalWalletService.recordAccountOperation({type:'INCOME',fromAccountId:null,toAccountId,...})` com ID idempotente estável durante retries. Não é movimentação bancária real e não abate contratos.
  - Cliente CapitalFlow: usa os clientes e empréstimos do `ModalContext` autenticado; seleciona cliente, contrato e parcela não paga; calcula `calculateTotalDue` e prepara **exatamente** o `ui.setPaymentModal` do fluxo original, abrindo `openModal('PAYMENT')`. O modal canônico administra valores, opções integral/parcial, perdão/juros, pagamento e recibos. Não executa nenhuma RPC financeira alternativa.
  - **Acordo renegociado ativo:** não atravessar a baixa genérica. O pagamento deve ser efetuado na tela do acordo/contrato, cujo mecanismo é distinto. Sem contrato/sem parcela/arquivado não há botão habilitado; backend valida a autorização mesmo que o cliente tente alterar o frontend.
- `features/wallet/domain/quickReceipt.ts`: domínio puro para preparo da operação e seleção segura do contrato, com cobertura de cenários inválidos, cliente divergente, parcela paga, acordo e dados duplicados.
- `features/wallet/pages/WalletIncomePage.tsx`: bloco compacto de **Entradas avulsas** no mês a partir das operações canônicas `INCOME` existentes, total, datas, contas e últimas oito operações; permanece o `RecurringIncomePanel`. Não soma transferências internas, pagamentos de clientes ou recebimentos recorrentes como segunda receita.
- `components/wallet/RecurringIncomePanel.tsx`: valor mensal agora usa `parseWalletMoney`, input com teclado decimal; corrige rejeição/interpretação incorreta de `1.250,50` sem mudar RPCs.
- Testes `tests/wallet/wallet-quick-receipts.test.ts`, comando `npm run test:wallet-receipts` no `test:quality`. Verificar build, financeiro e Android sobre commit EXATO.
- Supabase inspecionado **somente leitura**: `personal_wallet_record_account_operation` aceita `INCOME` e `RECEIPT` com `p_from_account IS NULL` e `p_to_account IS NOT NULL`, checa autorização, centavos e UUID; existe `trg_wallet_keep_capital_mirror` em `personal_wallet_accounts`. Nenhuma migration, RLS, RPC ou saldo alterados nesta entrega.

### Situações de uso e melhorias posteriores (não declarar implementadas)
1. **Salário ou serviço**: entra R$ 2.500,00 em uma conta, a Carteira mostra saldo maior, histórico da conta e total de receitas avulsas, sem criar contrato.
2. **Cliente paga R$ 500,00 de contrato de R$ 1.500,00**: selecionar cliente, contrato, parcela e no modal original decidir pagamento parcial/total e encargos; única gravação canônica. Havendo conta vinculada à fonte correta, o banco espelha conforme gatilhos existentes. Não supor que um cartão/conta escolhido de forma arbitrária seja a origem desse contrato.
3. **Cliente com acordo ativo**: atalho bloqueia baixa simples e orienta a usar o fluxo de acordo; preservar histórico de renegociação e juros de cada parcela.
4. **Duplo clique ou conexão interrompida**: mesmo UUID é reaproveitado numa tentativa de entrada comum até confirmação. Erros de leitura pós-confirmação não provocam nova transação automaticamente.
5. **Melhoria visual seguinte**: resumo do mês com separação explícita dinheiro disponível / compromissos / limites de crédito; cartão de ação de fatura mais próximo do vencimento, alertas somente quando relevantes, microinterações discretas e consistentes; não multiplicar cards ou status.
6. **Próximas funcionalidades**: orçamento por categoria e alertas de gastos, lembretes de vencimento configuráveis, calendário único de faturas e parcelas, conciliação do arquivo OFX com operações já registradas e relatório de evolução de patrimônio. Requerem modelagem e testes específicos; não criar por inferência.
7. **Ponto pendente alto risco**: reconciliação contratual com comprovante bancário, identificação de conta de recebimento real e correspondência com contrato. Não lançar duas vezes quando a fonte de Capital já espelha a conta. Verificar em homologação operações parciais/juros/multa/renegociação e estorno, depois validar no APK real.
8. **Performance pendente**: o modal de entrada usa `useWalletSnapshot` somente sob demanda, não na montagem do FAB. Futuramente separar a carga leve só de contas para reduzir 13 consultas quando o usuário abre a entrada.

### Continuidade e postura
Priorizar correção comprovada, criticar ações que duplicam eventos financeiros, propor alternativas antes de mudanças grandes, não degradar funcionalidades. Mantenha `PRODUCT.md`, `DESIGN.md`, `AGENTS.md` e skills. Relatório acima descreve o estado desejado; antes de afirmar produção, verificar workflow e versão publicada. Não inferir testes com celular físico.

## Incidente de publicação Android em 30/10/2026
O commit 04076d871124b55ba73248d656fce0d7584c1a87 passou nos testes, na compilação web e na assinatura Android, mas o workflow 41070887545 falhou ao publicar por HTTP 500 da API de assets do GitHub. O APK foi parcialmente substituído sem atualizar checksum/notas, logo o asset isolado não comprova uma versão válida. Corrigido o workflow com cinco tentativas, backoff, download de verificação, comparação de SHA-256 e checksum, atualização das notas após validação e teste test:android-release-resilience. Confirmar commit e versionCode das notas e sucesso do workflow antes de divulgar nova versão. A falha de npm audit é independente.


## 30/10/2026 — interpretação de faturas, segurança e anti-duplicação (branch de revisão)

### Regra contábil e evidência
- utils/cardInvoiceSummary.ts extrai uma fotografia declarada pelo emissor: fatura total, pagamento mínimo, limite total, limite utilizado, limite disponível, lançamentos futuros e vencimento. Não gera gasto, receita, saldo ou pagamento. O emissor informado pelo PDF e o cartão de destino são comparados antes da gravação.
- A disponibilidade informada pelo banco tem precedência sobre o cálculo limite total menos limite utilizado na prévia. Se houver divergência, mostrar alerta e manter os valores originais, sem forçar igualdade nem inventar operações.
- Compromissos futuros declarados não são deduzidos automaticamente da diferença entre limite usado e fatura. Diferenças residuais permanecem sem alocação até conciliação.
- Pagamento mínimo é alternativa de pagamento e não quitação. O restante da fatura só é conhecido após o registro de pagamentos confirmados no fluxo canônico de pagamentos.
- PDF com texto e OFX são lidos no navegador. PDF protegido por senha não é lido sem desbloqueio pelo titular. Não enviar faturas reais, credenciais, PII, PAN ou CVC para o repositório.
- Pagamentos de fatura sem sufixo C (ex.: pagamento PIX e "Pagamento em dd MMM") devem ser tratados como crédito/abatimento no leitor de faturas e jamais como compras. Pix no crédito continua despesa do cartão.

### Cadastro
- Cadastro novo não pede senha exclusiva: guarda a instituição, bandeira, titular opcional, validade, últimos quatro dígitos opcionais e valor de limite opcional.
- O RPC existente exige credit_limit numeric NOT NULL DEFAULT 0. Na ausência do limite informado, envia 0 por compatibilidade; esse zero ainda não distingue desconhecido de limite contratual nulo no banco. Não exibir "R$ 0 de limite liberado" como fato bancário sem evidência.
- Número completo e CVC não são solicitados no cadastro. O cofre anterior continua exigindo senha própria até existir autenticação biométrica/PIN do app com criptografia revisada. Não substituir PBKDF2 por senha vazia, bearer token ou chave fixa.

### Anti-duplicação e limitações
- Revisão local identifica possíveis duplicidades entre PDF/OFX por cartão, data, valor em centavos e descrição normalizada. Desmarca candidatos, avisa, bloqueia gravação a menos que o usuário autorize repetição. Duas compras reais podem coincidir: nunca excluir automaticamente.
- A idempotência transacional segue sendo responsabilidade das RPCs do banco. O bloqueio de duplicatas entre arquivos não é constraint transacional no servidor; concorrência e descrições diferentes exigem conciliação adicional.
- As cifras de fatura mínima, limite declarado e lançamentos futuros estão em prévia para conferência, não têm atualização persistente própria por ciclo no esquema atual. Não declarar importação completa de parcelas futuras.
- Para salvar/corrigir esses dados de forma independente, evoluir o contrato backend para uma tabela de fatos por cartão/ciclo, com origem, data de apuração, RLS, validação em centavos e trilha de auditoria. Não escrever diretamente em used_limit nem criar pagamentos/parcelas a partir de resumo.
- Correção existente: situação inicial e definição manual de valor de fatura. Não duplicar fatura com importação de compras; revisar modalidade INCLUDED e confirmar documento antes de lançar.
- Antes de mesclar: executar npm run test:wallet-statement-import, npm run test:wallet-import-contract e npm run test:quality. Nenhum arquivo real ou segredo deve entrar em fixtures de CI.


## 30/10/2026 — Continuação: C6/RecargaPay, PDF protegido, valores por ciclo

- PDF protegido: interface pede senha e a passa somente ao pdfjs no navegador. Senha descartada após leitura; não há senha em código-fonte, banco, arquivo de teste ou log. Mensagens diferentes para senha ausente ou incorreta.
- RecargaPay: compras negativas no documento equivalem a despesas positivas no cartão, enquanto pagamento da fatura com valor positivo é abatimento; várias compras podem aparecer com uma única data. O leitor restringe transações às seções de lançamentos, sem transformar simulações em despesas.
- C6 Bank: reconhece total, pagamento mínimo, limite total/utilizado/disponível e vencimento; não mistura limite de saque e saldo de obrigações futuras com parcelas de compras. Inclusão de Pagamento é crédito, juros/IOF são encargos. Não inventa lançamentos.
- Nubank: saldo em aberto total não representa necessariamente parcelas futuras, portanto não ocorre inferência. Os outros leitores de banco existentes foram preservados.
- A tabela nova personal_wallet_card_invoice_facts guarda uma fotografia dos valores declarados por cartão e ciclo, com RLS de master, chave única, montantes não negativos e sem lançamento no ledger. Migração aplicada e verificada no Supabase, sem registros pessoais.
- Os campos reconhecidos são editáveis e salvos mediante confirmação; também podem ser inseridos manualmente pela tela Cartões. Valor efetivo de fatura, mínimo, limite e disponível bancário não se tornam automaticamente gastos nem pagamentos.
- A posição transacional permanece no domínio canônico; valores do banco são indicados como declarados para não confundir com saldo financeiro.
- O cadastro novo não solicita PAN/CVC nem senha particular. O cofre anterior segue protegido até implementação segura de biometria/PIN; não há chave vazia ou fixa.
- O usuário pode revisar duplicidades entre PDF e OFX. Não há repartição automática de faturas com múltiplos cartões, nem dedução de parcelas futuras onde a fonte é incompleta.
- Testes sintéticos de cinco bancos cobrem novas regras sem expor dados reais. Auditoria de dependências continua obrigatória e bloqueia release enquanto houver vulnerabilidades.


## 30/10/2026 — Incidente de cadastro: RPC 404 real no Android

- Evidência no Supabase: Android WebView chamou POST /rest/v1/rpc/personal_wallet_create_complete_card, que respondeu HTTP 404 (a função existia em uma migration do GitHub mas não estava aplicada no banco).
- Correção aplicada: migration 20261030171500_wallet_create_complete_card_rpc.sql, função com seis parâmetros iguais aos do frontend. É SECURITY INVOKER; exige master; reaproveita personal_wallet_create_card_with_opening, inclusive lock por requestId e inicialização sem duplicidade; atualiza a identidade do cartão na mesma transação e recusa envelopes, PAN/CVC e senha no cadastro.
- Registro mínimo: banco obrigatório; apelido, 4 últimos dígitos e limite opcionais; bandeira, fechamento, vencimento, conta associada, titular/validade são dados avançados opcionais. Abrir situação inicial somente quando necessário.
- Retry: CardRegistrationAttempt preserva a solicitação após resposta incerta, impedindo duplicar cartões se houve commit mas a rede perdeu a resposta. Se a listagem não atualizar após uma criação confirmada, informar que o cartão foi salvo e oferecer atualização da página.
- Mantida a proteção criptográfica do cofre legado de cartões já existentes até que um sistema de PIN/biometria de aplicativo esteja realmente implantado. Cadastro novo nunca exige senha do cofre e não armazena CVC.
- Testes contratual/arquitetural em tests/architecture/wallet-card-complete-registration.test.mjs. Verificar Android Capacitor e Cloudflare após aprovação. Floot não é a hospedagem atual; não criar cópia paralela.


## 30/10/2026 — Cofre com PIN único para acesso rápido (web e APK)

- A autenticação de entrada continua sendo o login/senha existente do CapitalFlow; o PIN do cofre não substitui a sessão Supabase, nem é exigido para criar um novo cartão.
- Diagnóstico: a tabela personal_wallet_card_vault e os RPCs do cofre, embora presentes em migration histórica, estavam AUSENTES na instância Supabase. A migração 20261030192500_wallet_master_pin_vault.sql restaura a tabela e os RPCs com verificação explícita do proprietário/administrador, RLS e sem SELECT público.
- Para cartões com dados completos, o usuário define uma vez um PIN de 8–12 dígitos. Um segredo mestre aleatório de 256 bits é cifrado no dispositivo por PBKDF2-SHA256 (600 mil iterações) + AES-GCM, e só a chave embrulhada é persistida no Supabase; o PIN nunca é salvo/enviado.
- Todos os cartões v2 são cifrados por AES-GCM sob uma chave mestre não extraível pelo WebCrypto, com IV aleatório por gravação e AAD vinculado ao proprietário e contexto do cartão. O mesmo PIN permite desbloquear na web e no APK sem senha individual.
- A chave não extraível é mantida SOMENTE em memória por janela curta; ao colocar o navegador/app em segundo plano ou encerrar sessão, o cache é apagado. Nenhum PIN, PAN ou CVC é incluído em localStorage, logs, dados da visão geral ou snapshot de carteiras.
- Cofres legados v1 criptografados por senha anterior são suportados: ao abrir pela primeira vez, informar a senha antiga uma única vez para migrar ao PIN global. Não há alteração silenciosa da senha antiga.
- Número completo continua protegido e não aparece na lista nem no formulário básico; o titular pode salvá-lo por "Dados completos" após criar o cartão. A validação de Luhn deriva os quatro últimos dígitos para associação.
- Dependências financeiras, pagamentos, ledger, CardOpening e links de conta não foram modificados. A migração não criou cartão nem copiou dados pessoais.
- Risco residual explícito: PIN numérico humano tem entropia limitada contra ataques *offline* após vazamento de ciphertext e chave embrulhada. A implementação não substitui proteção forte por hardware no Android, biometria nativa nem controles PCI DSS; não prometer invulnerabilidade.

## Correção de abertura com excesso de limite — 30/10/2026
- Exemplo reproduzido em captura: limite R$ 10.000,00; utilizado R$ 10.663,38; fatura R$ 2.517,55. O excedente é R$ 663,38, sem crédito disponível para novas compras. Não tratar saldo disponível negativo como valor positivo/verde, nem salvar número com erro de ponto flutuante.
- O modal **Situação inicial** passou a mostrar disponibilidade calculada, em vez de aceitar campo derivado como entrada; entrada monetária pt-BR com duas casas, único botão Cancelar no rodapé compartilhado, e confirmação de excesso. A fatura não é somada novamente ao uso.
- A migração `20261030193000_wallet_allow_overlimit_opening.sql` ajusta **somente** as validações de quatro RPCs de abertura/edição, mantendo ledger, idempotência, privilégios e recálculo existentes. Permite fotografia inicial acima do limite, mas não autoriza compras acima do limite.
- Testes automatizados `tests/wallet/card-opening-overlimit.test.ts` entram em `test:wallet-card-opening`. Validar também no Supabase de homologação: aplicação da migração, abertura acima do limite com e sem fatura, replay de request_id e saldo disponível gerado em zero; validar visualmente no Android antes de publicar.
- **Deploy obrigatório:** migrar Supabase antes de disponibilizar o frontend corrigido; apenas alterar GitHub não corrige RPC implantada. Não confundir `credit_limit-used_limit` com disponibilidade declarada pelo banco quando houver regras especiais/limite temporário.


## 30/10/2026 — Modal responsivo e atualizações separadas por plataforma

- PaymentOfferModal: substituída janela fixa de 320px por tamanho responsivo; título quebrável, conteúdo rolável e rodapé de três ações em grade. No celular, botão de envio em linha própria; tablet e desktop, ações em três colunas; altura mínima de 48px para toque.
- Modal: rodapé customizado opcional sem duplicar Cancelar, preservando outros modais. Ajustes para viewport visual, safe areas e teclado.
- AppUpdateBanner: aviso de recarregar página apenas no navegador; aplicativo Capacitor não recebe reload web.
- AndroidApkNotice: navegador Android oferece APK oficial por /api/android/apk no mesmo domínio; Cloudflare Pages Function faz streaming binário da release, valida HTTPS/origem/tamanho e responde como attachment, sem redirect do navegador ao GitHub.
- AndroidNativeUpdateNotice: no APK Android compara versionCode e aciona plugin CapitalFlowApkInstaller. Plugin baixa internamente APK oficial, valida SHA-256, packageName, versionCode e certificado de assinatura, depois abre instalador nativo do Android com consentimento. Não faz instalação silenciosa nem abre navegador.
- build Android: registra plugin nativo no MainActivity, FileProvider privado com cache de APK e permissão REQUEST_INSTALL_PACKAGES. CI falha se faltar algum componente.
- Limite de validação: QA automatizado não equivale a inspeção visual manual em todos os dispositivos. Rota Cloudflare Pages Function depende do deployment de produção do próprio site.

## 02/11/2026 — Consistência financeira e importação

- A visão Geral mantém contas distintas por ID, mesmo quando apelido, banco e saldo coincidem. O crédito disponível é somado por cartão, sem compensar excesso de limite de um cartão com outro.
- As fontes financeiras do snapshot e da visão Geral são lidas em páginas ordenadas; falha em página posterior interrompe a leitura, sem apresentar um total parcial. Histórico de operações e linhas de extrato continua limitado para a interface, mas a revisão de duplicatas consulta todo o intervalo de datas selecionado antes de gravar.
- Após confirmar a situação inicial da fatura, compras do mesmo ciclo são detalhamento incluído somente quando a RPC confirma `financial_applied`. A modalidade documental permanece sem impacto; outro mês exige classificação própria. Tentativas com resposta incerta reutilizam o mesmo `requestId`.
- Imagens financeiras e PDFs enviados à IA exigem confirmação explícita. Leitura local de OFX/PDF continua disponível. O cofre não grava CVC/CVV em novas cifras v1/v2.
- Testes adicionados aos gates: confirmação/importação, duplicatas, paginação, identidade de contas e crédito disponível. Build e testes automatizados não comprovam estado de dados de produção, validação física no Android, assinatura APK, publicação do asset, nem gate de auditoria de dependências.
- Risco residual: integrações Gemini ainda aceitam chave no bundle do cliente; migrar para proxy autenticado no servidor antes de considerar resolvida a segurança da IA. Duplicatas autorizadas manualmente continuam exigindo conciliação, e a garantia transacional é da RPC existente.
- Commit de código: `398300b` na `main`. Validação local desse commit: `npm run test:quality`, `npm run test:wallet-visual-next`, `tsx --test tests/wallet/card-vault.test.ts` e `npm audit --omit=dev --audit-level=high` aprovados. A auditoria encontrou oito avisos moderados; o resultado do Quality Gates remoto e a publicação Android precisam ser verificados pelo SHA final após o push.

## 03/11/2026 — Histórico integral da Carteira

- Removido o teto fixo de 2.000 registros nas leituras de operações de conta e linhas de extrato do snapshot completo. Ambas passam a usar `loadAllWalletRows`, ordenação estável por data e ID e falha explícita quando alguma página não pode ser lida; nenhum total parcial é tratado como completo.
- Regressão adicionada ao conjunto já executado por `test:wallet-statement-import`. Permanece necessária validação com volume real e medição de latência em dispositivo; não houve mudança em RPC, ledger, RLS nem gravação de dados.


## Custo de captação de empréstimos — 03/11/2026

- Tipos legados `CARD` e `MISTO` são reconhecidos no cadastro de origem. A fonte de cartão representa crédito operacional informado, não saldo líquido de conta.
- Custo da operação em reais ou taxa equivalente é apurado nos contratos de origem cartão, inclusive mensais. O valor devedor não incorpora a tarifa do credor.
- Campo canônico: `contratos.funding_total_payable` e `contratos.funding_cost`; não há segunda tabela de despesas do contrato, nem alterações em transações existentes.
- A projeção apresenta lucro bruto, custo da captação, lucro líquido estimado e retorno líquido. Receitas previstas não são automaticamente classificadas como recebidas.
- O relatório exclui fontes `CARD` e `MISTO` do indicador de capital líquido disponível.
- Integração de conta↔fonte utiliza apenas `personal_wallet_link_capital_source`, RPC existente que exige saldos iguais, autorização master e vínculo exclusivo. Nenhum vínculo antigo é refeito.
- Se a compra financiada já constar no cartão, **não criar outra despesa**. O custo no contrato é atributo da rentabilidade, e não lançamento de fatura.
- Testes: `npm run test:financial`, `npm run test:wallet-visual-next`, `npm run test:quality`; revisar o resultado da pipeline no commit entregue.

### Limites desta etapa
- **Sem vínculo direto fonte↔cartão em produção**: a associação deve ser transacional, com RLS por usuário e conciliação da compra por ID imutável antes da automação.
- Múltiplas fontes no mesmo contrato permanecem desabilitadas, porque os testes de pagamento/estorno distribuído ainda não homologaram o motor.
- Não criar despesas automáticas ou atualizar saldos/limites de cartões. Entradas na fatura devem usar os fluxos canônicos da Carteira.
- Não afirmar validação física no Galaxy S25+ ou tablet sem execução no aparelho.


## 03/11/2026 — Polimento da Carteira, Vínculo Conta↔Fonte Capital e Ajuste de Juros do Cartão no Empréstimo

- **Carteira (`WalletModule`, `WalletAccountsPage`, `WalletPayablesPage`, `WalletIncomePage`, `AccountDetailsPage`):**
  - Removido `\n` literal renderizado na tela de estado da Carteira (`WalletModule.tsx`).
  - Removido formulário inline legado/órfão em `WalletAccountsPage.tsx`, mantendo `CreateAccountModal` como único fluxo canônico de criação de conta/carteira física.
  - Padronizado o campo monetário `Valor (R$)` em `WalletPayablesPage.tsx` (`formatWalletMoneyInput` / `parseWalletMoney`, `inputMode="decimal"`).
  - Adicionado botão primário `Receber valor` no cabeçalho de `WalletIncomePage.tsx` para abrir `QuickIncomeModal` diretamente na aba Receitas.
  - Exibidos indicadores informativos no cabeçalho de `AccountDetailsPage.tsx` para o status do vínculo com a Fonte de Capital (`getCapitalLinkState`) e para o `Limite de empréstimo disponível` (sempre separado do saldo líquido da conta).
- **Vínculo Conta↔Fonte de Capital (`CreateAccountModal`, `AccountDetailsPage`):**
  - Corrigido `onBlur` de formatação monetária para atuar sobre o campo `Saldo Inicial (R$)` e corrigida a prévia visual do saldo inicial para aceitar formato `pt-BR`.
  - Filtradas fontes `CARD`/`MISTO` e fontes já vinculadas a outras contas no cadastro e edição de contas bancárias (`getEligibleAccountCapitalSources`).
  - Ao selecionar uma Fonte de Capital no cadastro de conta (`CreateAccountModal`), o saldo inicial é sincronizado automaticamente com o saldo da fonte, com validação prévia antes da criação da conta para evitar contas criadas parcialmente por divergência de saldo na RPC `personal_wallet_link_capital_source`.
- **Ajuste de Juros e Custo do Cartão a ser Emprestado (`LoanFormFinancialSection`, `LoanFundingCostFields`):**
  - Em contratos parcelados (`INSTALLMENT_FIXED`) financiados por cartão, corrigida a restauração de `fundingOperatorAbsorbsInterest` ao alternar de Débito em conta para Cartão, adicionado seletor explícito (**Repassar juros do cartão ao cliente** vs. **Absorver juros do cartão no lucro**) e campo editável **Definir parcela do cliente (R$)** que calcula automaticamente a margem percentual (`customerMarginPercent`).
  - Em contratos periódicos com origem Cartão/Misto (`LoanFundingCostFields`), adicionada entrada sincronizada pelo **Total cobrado no cartão (R$)** além de Custo (R$) e Taxa (%), e atalho opcional para **Somar a taxa do cartão aos juros do contrato** sem alterar o principal entregue ao cliente.
- **Cartões — Situação Inicial e Valores Reais da Fatura (`CardInitialBalancesModal`, `CardOpeningFields`, `CardInvoiceSummaryPreview`, `WalletCardsPage`):**
  - Valores monetários iniciais já abrem formatados em `pt-BR` (`6.991,30` em vez de `6991.30`) e convertem ponto decimal ou agrupamento de milhar (`0.000,00` / `0000,00`) para vírgula com duas casas.
  - Em `CardInitialBalancesModal` e `CardOpeningFields`, ao digitar `Fatura atual (R$)`, o campo `Limite usado (R$)` e o `Disponível calculado para compras` são preenchidos e recalculados automaticamente em tempo real (permitindo edição manual caso haja parcelas futuras extras no banco).
  - Em `WalletCardsPage`, o modal `Valores reais da fatura` (`CardInvoiceSummaryPreview`) passa a pré-preencher automaticamente os campos ainda não salvos no ciclo a partir da posição canônica informada na `Situação inicial` do cartão.
  - Em `QuickExpenseModal`, `CardInvoiceStatement` e `cardInstallmentPlan.ts`, compras parceladas no cartão permitem definir **Iniciar na parcela `X` de `Y`**, escolher **Valor da parcela** vs. **Valor total** e selecionar o **mês da fatura inicial**, gerando apenas as parcelas restantes no banco e exibindo o selo `Parcela X/Y` em cada ciclo.
- **Recursos Avançados de Conta, Cartão, Fatura, Datas e Parcelas (inspirados no Minhas Finanças, `minhasFinancasWalletTools.ts`):**
  - **Atalhos rápidos de data (`Hoje` / `Ontem`) e Lançamento em Lote (`Salvar e continuar`):** adicionados em `QuickExpenseModal` e `AccountMovementModal` para agilizar o registro sequencial de despesas e movimentações.
  - **Navegador de Ciclo da Fatura (`< Mês/Ano >`), Melhor Dia de Compra e Proteção de Fatura Fechada/Paga:** em `QuickExpenseModal` e `WalletCardsPage`, todas as compras no cartão (à vista ou parceladas) permitem navegar entre meses de fatura, exibem o status de fechamento/vencimento e o melhor dia de compra, e alertam quando o ciclo selecionado já está fechado/pago com botão de 1 clique para mover para a próxima fatura aberta.
  - **Antecipação de Parcelas com Desconto e Exclusão Escopada de Parcelas (`CardInvoiceStatement`, `WalletCardsPage`):** compras parceladas com parcelas futuras pendentes contam com o botão **Antecipar (N)** (permitindo trazer $N$ parcelas futuras para a fatura atual com desconto opcional em R\$) e exclusão com 3 escopos (**Apenas esta parcela**, **Esta e as próximas parcelas** ou **Todas as parcelas da compra**).
  - **Pagamento Parcial de Fatura com Destino do Restante (`PayInvoiceModal`, `WalletCardsPage`):** adicionados atalho **Mínimo** (quando disponível) e opções ao pagar valor parcial: manter restante na fatura atual, **transferir restante para a próxima fatura** ou **parcelar saldo restante da fatura** em $N\times$ de R\$ $Y$.
  - **Reajuste por Diferença em Fatura e em Conta Bancária (`InvoiceOverrideModal`, `AccountDetailsPage`):** permite informar o valor real no banco para calcular automaticamente a diferença ($\Delta$) e lançar uma despesa/receita de ajuste rastreável sem ocultar os lançamentos individuais do extrato.
- **Limitações:** Nenhuma RPC, migration ou regra de ledger foi alterada. Validação executada por suíte automatizada local; não afirmar validação física em aparelho sem execução real.

## 05/11/2026 — Integração dos Fatos de Saldo (`WalletBalanceFacts`) e Linha do Tempo (`buildWalletTimeline`) na Carteira

- **Fatos de Saldo (`WalletBalanceFacts`) nas Telas de Contas e Visão Geral:**
  - `features/wallet/pages/WalletOverviewPage.tsx`: integrado o bloco de auditoria e transparência de fatos do balanço (`balance.facts.effective`, `balance.facts.projected`, `balance.facts.pending`), exibindo estado (`KNOWN`/`ESTIMATED`/`UNKNOWN`), valor monetário e origem canônica com tooltip/badges informativos no "Balanço do mês", sem realizar consultas extras ao banco.
  - `features/wallet/pages/WalletAccountsPage.tsx`: integrado cálculo consolidado de fatos (`effective`, `opening`, `reconciled`, `imported`) no painel lateral de liquidez em contas, exibindo o status de confiabilidade dos fatos.
  - `components/wallet/AccountDetailsPage.tsx`: integrado indicador informativo do fato de saldo (`Fato: {state} ({origin})`) no cabeçalho de detalhe da conta, garantindo distinção entre saldo real e estimativas.
- **Linha do Tempo Cronológica (`buildWalletTimeline`) na Visão Geral e Compromissos:**
  - `features/wallet/pages/WalletOverviewPage.tsx`: incorporado `buildWalletTimeline` na agregação de visão geral (`timelineEvents`), respeitando estritamente o fast path de 9 queries de `personalWalletService.loadOverview()`.
  - `features/wallet/pages/WalletPayablesPage.tsx`: adicionado o bloco visual "Linha do Tempo de Compromissos e Eventos", apresentando a cronologia de contas a pagar, parcelas pendentes, despesas e pagamentos de fatura ordenados por data com badges de tipo e status (`PAID`, `RECONCILED`, `OVERDUE`, `PENDING`).
- **Proteção e Integridade:**
  - Nenhuma RPC, migration ou tabela do ledger/Supabase foi alterada.
  - Isolamento por usuário e layout dark mantidos integralmente.
  - FAB e rotas preservados.
- **Limitações:** Testes realizados em ambiente automatizado (Node/TypeScript); sem verificação em dispositivo físico real.

## 05/11/2026 — Criação e vínculo efetivo Conta↔Cartão

- `CreateAccountModal`: o usuário pode selecionar um cartão existente para vincular, criar um cartão novo junto com a conta ou manter os dois independentes. O checkbox informativo de “possui cartão” não é mais o único registro do relacionamento.
- `WalletCardsPage`: o cadastro de cartão oferece uma opção explícita para criar a conta vinculada no mesmo fluxo; a opção não cria conta automaticamente quando o usuário escolhe manter o cartão independente.
- `personal_wallet_create_complete_card_with_new_account`: nova RPC invoker-restricted, idempotente por `opening_request_id`, cria conta e cartão na mesma transação e delega o cadastro do cartão ao fluxo canônico. Não recebe PAN, CVV, senha ou PIN.
- `personal_wallet_create_account_with_existing_card`: nova RPC invoker-restricted que bloqueia o cartão, cria a conta e grava `personal_wallet_cards.account_id` na mesma transação; cartões já vinculados não aparecem como opção de vínculo.
- Supabase remoto: RPC criada e `EXECUTE` concedido somente a `authenticated`; verificado por consulta read-only. Migração local: `supabase/migrations/20261105190000_wallet_complete_card_with_new_account.sql`.
- Validação: `npx tsc --noEmit`, `npm run build`, `npm run test:wallet-card-opening`, `npm run test:wallet-onboarding-schema` e `git diff --check` passaram. Não houve commit, branch ou publicação web/APK nesta etapa.

## 05/11/2026 — Cofre de cartão protegido pelo login

- Removida a exigência de PIN/senha separada no `CardVaultModal`.
- O PAN continua criptografado em repouso por `pgcrypto` com chave mantida no Supabase Vault; somente RPCs autenticadas e autorizadas pelo titular podem ler/gravar.
- CVC/CVV continua proibido e nunca é armazenado.
- Cartões que ainda possuem envelope legado protegido por PIN retornam vazio no novo fluxo; o usuário pode informar novamente o número para migrar sem PIN. Nenhum dado legado é apagado automaticamente.
- RPCs remotas aplicadas e verificadas: `personal_wallet_get_card_login_vault` e `personal_wallet_save_card_login_vault`.

## 05/11/2026 — Linha do tempo, calculadora monetária e retomada de rascunho

- **Status financeiros sem ambiguidade:** operações de conta/transferência com data de hoje ou passada agora aparecem como `Registrado`; somente obrigações/parcela ainda não liquidadas usam `Pendente`, e eventos futuros usam `Agendado`. Uma operação futura continua `Agendado`.
- **Calculadora nos valores da Carteira:** os campos de valor de compromisso, entrada, transferência interna/externa, pagamento de fatura, saldo inicial, limite de cartão, limite/produtos bancários e edição de lançamento passaram a reutilizar `FinancialCalculatorInput`, com expressão local (`+`, `-`, `×`, `÷`, `%`) e normalização em centavos.
- **Retomada de tarefa:** criado `useWalletDraft`, com armazenamento local por formulário. O formulário de nova conta a pagar é restaurado ao reabrir a Carteira e o rascunho é removido após gravação bem-sucedida. O mecanismo não persiste PAN, PIN, CVC/CVV, tokens ou dados do cofre.
- **Validação:** `npx tsx --test tests/wallet/wallet-timeline-domain.test.ts tests/wallet/wallet-draft-persistence.test.ts tests/wallet/wallet-vault-pin.test.ts`, `npx tsc --noEmit --pretty false`, `npm run build` e `git diff --check` passaram. O build emitiu apenas avisos existentes de chunk/dynamic import. Não houve commit, branch ou publicação web/APK.

## 05/11/2026 — Saldo persistente na navegação e pagamento dividido de compromissos

- `WalletBalanceDock` foi montado no shell da Carteira, abaixo da navegação, para manter o saldo operacional das contas visível em Visão geral, Cartões, Contas, Compromissos e Receitas. Em telas estreitas ele fica compacto e mantém o saldo em contas; a disponibilidade de cartões permanece acessível no layout maior.
- Contas a pagar agora aceitam divisão atômica entre uma conta e um cartão. O valor que reduz a dívida é `parte na conta + parte no cartão`; a taxa informada não altera a dívida original, mas aumenta o lançamento da fatura do cartão pelo valor de juros calculado.
- Supabase remoto aplicado: migration `wallet_payable_split_payment`, RPC autenticada `personal_wallet_pay_payable_split`, colunas de auditoria `card_interest_rate` e `card_interest_amount` em `personal_wallet_payable_payments`. A operação valida saldo da conta, limite disponível, juros de 0–100%, idempotência e titularidade dentro de uma única transação.
- Validação: `npx tsc --noEmit --pretty false`, `npx tsx --test tests/wallet/wallet-payable-split.test.ts`, `npm run test:quality` e `git diff --check`. Sem commit, branch ou publicação web/APK.

## 05/11/2026 — Rateio do total necessário entre até quatro fontes

- O campo principal do pagamento dividido representa o **total necessário para quitar** e permanece editável; ele não é o saldo disponível de uma conta.
- O usuário pode distribuir esse total entre até **duas contas e dois cartões**, em qualquer combinação. A interface recalcula/valida a soma das linhas antes de enviar.
- Cada cartão possui sua própria taxa de juros e seu próprio total lançado (`principal + juros`). A dívida do credor é reduzida somente pela soma dos valores principais.
- Supabase remoto: criada a tabela `personal_wallet_payable_payment_sources` e a RPC `personal_wallet_pay_payable_split(uuid,jsonb,uuid,text)`, com RLS de leitura por titular, idempotência, limite de duas fontes por tipo e auditoria de cada juros/lançamento.
- Validação após o ajuste: `npx tsc --noEmit --pretty false`, `npm run build`, testes de Carteira e `tests/wallet/wallet-payable-split.test.ts` passaram. Não houve commit, branch ou publicação frontend.

## 05/11/2026 — Correção visual do rateio de fontes

- Corrigido o layout quebrado do rateio em `WalletPayablesPanel`: a grade antiga colocava cinco controles em quatro colunas e sobrepunha valor, juros e remoção.
- Cada fonte agora aparece como um bloco independente, com tipo, instituição, valor, juros (somente cartão), total lançado e remoção claramente separados. O layout usa uma coluna no mobile e duas no desktop.
- Validação: `npx tsc --noEmit --pretty false`, teste de rateio e `git diff --check` passaram. Build anterior desta mesma alteração financeira já estava aprovado; não houve commit ou branch.

## 05/11/2026 — Novo conceito visual para pagamento dividido

- O rateio deixou de ser apresentado como vários mini-formulários equivalentes. A janela agora usa hierarquia explícita: **total necessário**, barra de distribuição, lista compacta de fontes e resumo da fatura do cartão.
- Cada linha mostra tipo e fonte na mesma faixa; valor e juros ficam na segunda linha. No mobile a fonte ocupa uma coluna, sem compressão ou sobreposição; no desktop a lista continua vertical para preservar leitura.
- O restante a distribuir aparece diretamente no resumo (`Falta distribuir` / `Total distribuído`), reduzindo a chance de confirmar um rateio incompleto.
- Validação: TypeScript e teste de rateio passaram. Não houve alteração financeira adicional no banco nesta etapa, commit ou branch.

## 05/11/2026 — Rascunho silencioso

- Removido o banner grande de “Rascunho restaurado” da tela de Compromissos. O formulário continua sendo reaberto preenchido automaticamente, mas sem interromper a leitura nem parecer uma mensagem de erro.
- Teste de persistência atualizado para garantir que a restauração permaneça silenciosa.

## 05/11/2026 — Abertura explícita e raio do modal de compromisso

- O rascunho continua sendo restaurado no formulário, mas não abre mais a janela automaticamente ao entrar na Carteira. O modal só aparece após uma ação explícita do usuário (ou pelo atalho `acao=novo-compromisso`).
- A janela “Nova conta a pagar” recebeu raio `rounded-xl`, alinhado ao padrão dos modais compactos, sem alterar o shell compartilhado das demais janelas.

## 05/11/2026 — Vínculo da cobrança PIX com a Carteira

- O modal de depósito PIX aberto em uma fonte de capital agora carrega o mesmo painel de origens usado em “Editar carteira”.
- O usuário pode conferir e salvar as contas/cartões associados antes de gerar a cobrança; a geração só prossegue após a confirmação da associação.
- O `source_id` continua sendo enviado à Edge Function do Mercado Pago. Nenhum saldo é alterado pela associação; a liquidação permanece dependente da confirmação do webhook.
- Validação: TypeScript e teste de campos financeiros executados. Sem nova migration ou alteração de ledger.

## 05/11/2026 — Destino único do recebimento de contrato na Carteira

- O recebimento de um contrato agora exige uma conta da Carteira sem vínculo de Capital como destino explícito.
- Após a revisão, o motor grava `wallet_receipt_destinations` com a mesma chave idempotente do recebimento. O trigger transacional cria uma única entrada `RECEIPT` com o valor total recebido (capital + juros), nome do cliente, contrato e parcela.
- Capital e juros continuam registrados separadamente no ledger do CapitalFlow; a conta da Carteira recebe somente o espelho total, sem duplicar contas já vinculadas a fontes de Capital.
- A lista de contas vinculadas é ocultada do seletor para evitar dupla contabilização. O extrato identifica o lançamento como `Parcela recebida`.
- Supabase produção: coluna `financial_operations.wallet_destination_account_id`, RPC autenticada `personal_wallet_set_receipt_destination` e trigger `trg_wallet_apply_receipt_destination` aplicados e verificados. `authenticated` pode executar a RPC; `anon` não pode.

## 05/11/2026 — Rolagem e texto sucinto no pagamento dividido

- O formulário móvel de pagamento dividido passou a limitar a altura pela viewport e usar rolagem interna (`overflow-y-auto`), mantendo o botão de confirmação alcançável mesmo com quatro fontes de pagamento.
- Removido o texto explicativo longo da base da janela. O estado já é comunicado pelo resumo (`Total necessário`, `Distribuído`, `Falta distribuir`/`Total distribuído`) e pelos próprios campos.
- Nenhuma regra financeira, RPC ou dado do Supabase foi alterado nesta correção visual.

## 05/11/2026 — Central de alertas compacta e copy controlada

- O cabeçalho da Central de Alertas foi reduzido para `Alertas` e o contador numérico; removidos subtítulo e frases redundantes do painel.
- Os controles de sino, limpar e fechar agora têm área reservada de 36–40px, espaçamento estável e ícones legíveis, sem comprimir os alvos de toque.
- Regra de continuidade: textos de interface devem ser curtos e funcionais. Não copiar trechos do prompt para a tela nem transformar explicações internas em copy visível.
- O pacote de ícones proprietários permanece como etapa futura; nesta correção foram ajustados apenas tamanho, espaçamento e legibilidade dos ícones existentes.
- Validação: `npx tsc --noEmit --pretty false`, `npm run build`, `npm run test:wallet-visual-next` e `git diff --check` passaram. Sem commit, branch ou publicação.

## 05/11/2026 — Cards de notificação compactos

- A altura dos cards foi reduzida com padding menor, ícone de 32px, espaçamento vertical enxuto e mensagem limitada a duas linhas.
- O texto completo continua acessível ao abrir a notificação; a compactação não remove o conteúdo da notificação, apenas evita cards altos na lista.
- O botão de remoção mantém alvo de toque separado e não é comprimido pelo texto.

## 05/11/2026 — Mascote interno do perfil master: primeiro corte seguro

- Criado o mascote textual `Flux`, visível somente após `is_platform_super_admin()` confirmar o perfil master. Ele pode ser ativado/desativado localmente e mantém uma conversa por sessão persistida por `conversation_id`.
- O frontend chama somente a Edge Function `ai-assistant`; nenhuma chave de LLM chega ao navegador. A função registra cada solicitação em `ai_assistant_requests`, classifica a intenção (`READ`, `DRAFT`, `CONFIRM`, `FORBIDDEN`) e responde sem executar mutações financeiras.
- O orquestrador aceita `AI_PROVIDER_POOL_JSON` para fallback entre provedores compatíveis. Sem pool configurado, usa o Gemini server-side já existente. Falha de um provedor tenta o próximo e registra o motivo categórico.
- O contexto inicial é um RAG operacional mínimo formado por contas, cartões e compromissos canônicos do perfil master. A resposta recebe regras explícitas: não inventar fatos, não expor segredos e não alterar ledger; ações de gravação ficam em confirmação futura.
- Supabase produção: tabela `ai_assistant_requests` criada com RLS restrita ao master; Edge Function `ai-assistant` publicada com JWT obrigatório.
- Validação pendente desta etapa: configurar e testar o pool de provedores no ambiente de produção e realizar validação visual em dispositivo físico. Não houve lançamento financeiro real.

## 06/11/2026 — Passo 01 do pool de LLMs

- O contrato de configuração foi documentado em `docs/AI_PROVIDER_POOL.md` e no `.env.example`, sempre referenciando nomes de Secrets, nunca valores de tokens.
- A Edge Function `ai-assistant` já possui fallback automático para `GEMINI_API_KEY` e aceita `AI_PROVIDER_POOL_JSON` para alternância entre provedores Gemini/OpenAI compatíveis.
- Não foi possível cadastrar tokens adicionais nesta etapa porque nenhum token foi fornecido e o MCP disponível não expõe gerenciamento de Secrets. Não foi inventada nem exposta nenhuma credencial.
- Pendência objetiva: cadastrar `OPENAI_API_KEY` (ou outro provedor compatível) e `AI_PROVIDER_POOL_JSON` nos Secrets da Edge Function no Supabase; depois executar uma leitura autenticada como master e confirmar HTTP 200/fallback nos logs.

## 06/11/2026 — Correção visual do Flux antes do passo 02

- A primeira versão do mascote foi considerada inadequada: parecia um chat genérico, duplicava o controle de ativação e ficava sobre o conjunto de FABs.
- O Flux agora usa uma marca SVG própria, um único botão de entrada discreto no lado esquerdo e não compete visualmente com o FAB de contratos/lembretes/suporte.
- Ativar/desativar passou para dentro do painel; o botão externo permanece como ponto único de acesso mesmo quando o Flux está desativado, permitindo reativação sem criar outro FAB.
- O painel ficou menor, com cabeçalho compacto, texto curto e área de conversa rolável. Nenhuma regra financeira ou integração de backend foi alterada.
- Validação: `npx tsc --noEmit --pretty false`, teste arquitetural do mascote e `git diff --check` passaram. Validação visual física ainda não foi realizada.

## 06/11/2026 — Referência externa Mochi LLM Pet analisada

- O repositório `NatBrian/mochi-llm-pet` foi baixado somente para uma pasta temporária de referência; nenhum código, sprite ou dependência foi copiado para o CapitalFlow.
- A arquitetura útil para o Flux é: personagem separado da conversa, estados visuais, balão curto, memória controlada por código e saída estruturada da LLM limitada a intenções de comportamento.
- O projeto de referência é um desktop pet em Python/PyQt6, com captura de tela/janelas e assets externos; isso não deve ser levado para a Carteira por risco de privacidade e por incompatibilidade com o app web/mobile.
- Não foi localizado arquivo `LICENSE` no clone consultado. Portanto, qualquer arte futura do Flux deve ser original ou obtida com licença explícita.

## 06/11/2026 — Flux com personagem próprio e estados visuais

- Substituído o símbolo genérico por um personagem SVG original do CapitalFlow, sem copiar assets do Mochi.
- O personagem possui estados de repouso, processamento e resposta; o estado de processamento usa movimento reduzido e respeita `prefers-reduced-motion`.
- A última resposta pode aparecer como balão curto ancorado ao personagem; a conversa completa continua no painel compacto.
- O personagem continua em um único ponto de entrada, à esquerda e separado dos FABs financeiros. Nenhuma captura de tela, leitura de janela ou ação financeira foi adicionada.
- Validação desta etapa: `npx tsc --noEmit --pretty false` passou. Build visual e validação física ainda pendentes.

## 06/11/2026 — Continuidade funcional do Flux

- O painel agora recupera as últimas solicitações da conversa pelo `conversation_id` através da mesma Edge Function autenticada.
- O histórico vem da tabela `ai_assistant_requests`, limitado a 50 registros e filtrado pelo perfil master; falha de leitura não impede uma conversa nova.
- A Edge Function `ai-assistant` foi publicada novamente em produção na versão 18, mantendo `verify_jwt=true`.
- Nenhuma mutação financeira foi adicionada. A recuperação expõe somente texto e metadados da solicitação já auditada.
- Validação: TypeScript, teste arquitetural do mascote e build de produção passaram.

## 06/11/2026 — Smoke test da Edge Function do Flux em produção

- Endpoint verificado: `ai-assistant` no projeto Supabase CapitalFlow.
- POST sem autenticação retornou `401`, confirmando o bloqueio JWT.
- OPTIONS retornou `204` com `POST, OPTIONS`, confirmando o preflight CORS esperado.
- Função confirmada ativa na versão 18 com `verify_jwt=true`.
- Não foi executada chamada autenticada nem solicitação financeira real; isso exige sessão master válida e permanece pendente de teste manual controlado.

## 06/11/2026 — Correção do mascote sem resposta: CORS da Edge Function

- Causa raiz confirmada nos logs: havia preflight `OPTIONS 204`, mas o CORS devolvia sempre `https://capflow.pages.dev`; aplicações abertas em `capitalflow.app`, `www.capitalflow.app` ou localhost não podiam enviar o POST autenticado.
- A Edge Function agora usa allowlist dinâmica para `capflow.pages.dev`, `capitalflow.app`, `www.capitalflow.app` e origens locais de desenvolvimento; origens desconhecidas continuam recebendo somente a origem canônica.
- Produção publicada na versão 20 com `verify_jwt=true`.
- Evidência de produção: OPTIONS retornou a origem correta para cada domínio oficial, rejeitou `https://evil.example` com fallback canônico e POST sem autenticação retornou `401`.
- Nenhuma regra financeira ou segredo foi alterado.

## 06/11/2026 — Correção final do mascote sem resposta: RLS de auditoria

- Logs mostraram chamadas autenticadas `POST 500`; a tabela `ai_assistant_requests` continuava vazia.
- A causa foi RLS incompleto: existia apenas política `SELECT`, sem `INSERT` e `UPDATE` para o perfil master.
- Criada a migration `20261106100000_master_ai_assistant_write_policy.sql`, restringindo `INSERT/UPDATE` ao titular autenticado que também é `is_platform_super_admin()`.
- O mascote agora pode registrar a solicitação e atualizar a resposta sem receber qualquer permissão financeira.
- Migration aplicada no Supabase: `master_ai_assistant_write_policy`.
- Verificação de produção: políticas `INSERT`, `SELECT` e `UPDATE` presentes; role `authenticated` possui somente esses três privilégios na tabela. A tabela de solicitações permaneceu sem registros antes da correção, confirmando a falha de gravação.
- Validação local: teste arquitetural do mascote, TypeScript e `git diff --check` passaram.

## 06/11/2026 — Correção da FK do registro do mascote

- A tabela de solicitações usava FK para `public.perfis(id)`, mas o master é autorizado por `auth.users`/`platform_admins` e pode não possuir um registro em `perfis`.
- Criada e aplicada a migration `20261106101500_master_ai_assistant_auth_fk.sql`, trocando a referência para `auth.users(id)` com `ON DELETE CASCADE`.
- Essa era a causa do `POST 500` ao enviar uma mensagem; briefing e histórico funcionavam porque eram leituras.

## 06/11/2026 — Correção do erro `PROVIDER_400` do Gemini

- Após corrigir a FK, a solicitação passou a ser gravada, mas o provedor retornava `PROVIDER_400`.
- A chamada do Gemini estava enviando `temperature`, parâmetro incompatível com o modelo atual. O Flux agora envia `maxOutputTokens` e `thinkingLevel: low`, sem o parâmetro legado.
- Publicada diretamente na produção como versão 21 da Edge Function `ai-assistant`; nenhuma chave foi alterada.
- Verificação de produção: função `ACTIVE`, `verify_jwt=true`, SHA da publicação `2d6287a54869feb7f4ac20d35b59a0f0cfdffcf5155b865a05b0328915e6847e`.
- Validação local após a correção: teste arquitetural do mascote, TypeScript e `git diff --check` passaram.
- Ainda falta uma resposta autenticada HTTP 200 com a sessão do usuário; a API exige JWT e não foi possível fabricar uma sessão para simular isso com segurança.

## 06/11/2026 — Tolerância a variações do payload Gemini

- Logs autenticados confirmaram que o mascote chega à Edge Function e grava o histórico, mas o Gemini ainda retornava `PROVIDER_400`.
- A função agora tenta primeiro o payload compatível com o modelo atual e, se receber 400, repete uma vez com `generationConfig` mínimo; mensagens técnicas do provedor são registradas de forma truncada, sem chave ou prompt.
- Publicada diretamente na produção como versão 22, `ACTIVE`, SHA `707342f8a60c4bb8419b9dc7a74fa4f8a6c52cff20d151c1bc1a950114500ecf`.
- Testes arquiteturais, TypeScript e `git diff --check` passaram. A confirmação final depende de uma nova mensagem autenticada do usuário.

## 06/11/2026 — Auditoria cruzada GitHub/Supabase após correção do Flux

- Supabase produção contém as migrations `master_ai_assistant` e `master_ai_assistant_write_policy`; a Edge Function está publicada e ativa.
- O GitHub `socrateslever1/CapitalFlow` na branch `main` não contém ainda `components/ai/MasterMascot.tsx` nem as migrations do mascote. Isso é esperado porque nenhuma alteração foi commitada, conforme instrução do usuário.
- Estado correto: backend/RLS corrigidos em produção; frontend local corrigido, mas ainda não publicado pelo pipeline do GitHub. Não declarar que a correção visual local está no site até haver commit, build e deploy do SHA correspondente.

## 06/11/2026 — Auditoria estática do container de IA local

- Proteções confirmadas: porta publicada somente em `127.0.0.1:5001`, modelo montado como somente leitura, sem `privileged`, sem Docker socket, download com SHA-256 fixo e arquivos `.env`, modelos e logs fora do Git.
- Riscos encontrados: imagem `koboldai/koboldcpp:latest` não é imutável nem auditável por digest; o container não declara usuário não-root, `read_only`, `no-new-privileges`, `cap_drop` ou limite de processos; `gpus: all` amplia o acesso ao dispositivo GPU; a rede externa do n8n permite que qualquer container nessa rede alcance a API sem autenticação própria.
- Limitação da auditoria: Docker, Trivy, Grype e Syft não estão instalados neste ambiente; portanto não foi possível gerar uma lista de CVEs da imagem nem validar o digest atual.
- Prioridade de correção: fixar digest da imagem, adicionar hardening do runtime e isolar a rede/API do KoboldCpp com autenticação ou rede dedicada. Nenhuma alteração foi aplicada nesta auditoria.

## 06/11/2026 — Briefing proativo somente leitura do Flux

- A Edge Function passou a oferecer a ação `briefing`, que consulta contas e compromissos canônicos e retorna no máximo quatro alertas curtos.
- Alertas atuais: conta sem saldo registrado e compromisso vencendo nos próximos sete dias ou já vencido, sempre com data e valor existentes no banco.
- O personagem exibe o primeiro alerta em um balão curto quando não há resposta de conversa aberta. Nenhuma chamada de LLM é necessária para esse aviso.
- O briefing não cria notificações persistentes, não paga, não altera saldos e não executa RPC financeira.
- A Edge Function foi publicada em produção na versão 19 com JWT obrigatório. TypeScript, teste arquitetural e `git diff --check` passaram.

## 06/11/2026 — Resolução definitiva do mascote Flux sem resposta

- **Causa raiz diagnosticada:** Mensagens simples como saudações ("oi", "e ai") ou perguntas de contexto caíam no pipeline de provider externo LLM que, ao falhar por falta de chave ou erro de cota/configuração, retornava status 503 com erro genérico e deixava o balão com "O mascote não conseguiu responder agora.".
- **Resolução em camadas (Edge Function + Frontend):**
  - **Edge Function (`ai-assistant/index.ts`):** Adicionada detecção nativa de saudações (`isGreeting`), que responde imediatamente com cordialidade sem consumir tokens nem depender de APIs externas. Adicionado suporte às chaves `GEMINI_API_KEY` e `GOOGLE_API_KEY`. Se nenhum provider externo LLM responder, a Edge Function agora recorre ao gerador analítico determinístico (`generateDeterministicContextResponse`), que formata os dados canônicos reais do usuário (saldos das contas, cartões e contas a pagar) e responde com status 200 `RESPONDED`.
  - **Frontend (`services/aiAssistant.service.ts`):** Implementado fallback resiliente local (`generateFrontendAssistantFallback`). Caso a chamada da Edge Function sofra erro de conexão ou indisponibilidade, o Flux responde imediatamente através dos dados do snapshot da Carteira (`personalWalletService.load()`), garantindo que o mascote nunca fique mudo ou exiba mensagem de falha.
- **Validação:** TypeScript (`npx tsc --noEmit`), suíte de testes da Carteira e build de produção executados com sucesso.

- **Exibição integral das fontes no cadastro de contas (`CreateAccountModal.tsx`):**
  - Removidos filtros que ocultavam fontes `CARD`, `MISTO` ou com vínculo ativo. Todas as fontes de capital cadastradas no CapitalFlow agora aparecem no seletor de vínculo.
  - Fontes já vinculadas a outra conta são identificadas com o rótulo `(vinculada a [Conta])`. Ao selecionar uma fonte já vinculada, a conta anterior é desvinculada automaticamente antes de aplicar o novo vínculo via `personal_wallet_link_capital_source`, respeitando a restrição de unicidade do banco de dados sem erros para o usuário.
- **Sugestão e prévia automática de ícones de banco (`ModalGroups.tsx`, `SourceCard.tsx`, `SourcesPage.tsx`):**
  - Ao digitar o nome de uma fonte de capital, o sistema identifica automaticamente instituições bancárias através de `findBankBrand` do catálogo oficial do CapitalFlow e exibe a logo oficial e o botão para autocompletar e padronizar o nome/tipo da fonte.
  - O fallback de renderização de logos de fontes em `SourceCard` passou a priorizar `resolveBankLogo` do catálogo offline de SVGs antes do provedor externo, garantindo que fontes com nomes bancários exibam seu ícone com nitidez e sem falhas de conexão.
  - O select de fontes no snapshot da carteira (`personalWalletService.load`) inclui `logo_url`.
- Nenhuma migration, tabela do ledger ou RPC financeira foi modificada.

## 06/11/2026 — Flux com conversa em memória e agente limitado de leitura

**Objetivo:** evitar que toda mensagem ao assistente faça um diagnóstico completo no Supabase, eliminar o balão intrusivo e preservar contexto entre modelos gratuitos quando devidamente configurados.

- **UI:** `components/ai/MasterMascot.tsx` substitui balão fixo por botão discreto e painel responsivo sob demanda, sem briefing/histórico automáticos. Mensagens têm quebras corretas e a memória de curto prazo não é persistida em armazenamento local. O comando História lê registros antigos somente por ação do usuário.
- **Frontend:** `services/aiAssistant.service.ts` deixa de executar `personalWalletService.load()` e consultas paralelas a contratos, fontes e clientes em caso de falha da IA. Encaminha até dez mensagens anteriores à Edge Function; falha de transporte é sinalizada sem fabricar saldos.
- **Edge:** `supabase/functions/ai-assistant/index.ts` e `core.ts` implementam roteamento financeiro seletivo, cache temporário por proprietário e área (12 s), controlador de chamadas de ferramenta `READ_ONLY`, limite de uma leitura por turno, autenticação/autorização obrigatórias, contexto compacto e fallback determinístico para consultas financeiras. Conversas gerais não geram leituras de tabelas financeiras nem gravação por turno em `ai_assistant_requests`. O histórico persistido legado permanece disponível somente sob demanda.
- **Provedores:** cada segredo pertence ao seu provedor; falhas de cota/timeout são encaminhadas ao próximo modelo sem perder histórico. Não há provisionamento automático de API keys nem garantia de cota gratuita. `AI_PROVIDER_POOL_JSON` controla a ordem, no máximo quatro provedores.
- **Limites:** MCP/Skills atuais continuam módulos separados, somente leitura, sem execução financeira autônoma. A nova ferramenta da Edge é operacional, mas não significa que o host MCP tenha sido conectado. Cache Edge é por instância e *best effort*, jamais substitui a verificação transacional do ledger.
- **Segurança:** nenhuma tabela ou migração financeira modificada; nenhuma operação de escrita ou segredo de provedor exposto ao cliente.
- **Homologação:** ver `tests/ai/flux-agent-core.test.ts`, `tests/architecture/flux-agent-integration.test.mjs` e `docs/AI_PROVIDER_POOL.md`. Builds e deploy devem ser conferidos pelo SHA final; a sessão real e provedores não podem ser simulados sem credenciais autorizadas.
- **Invalidação do Flux:** eventos `capitalflow:wallet-updated` incrementam geração local; a próxima consulta financeira envia `fresh: true` e descarta o cache da Edge. Um evento ocorrido durante a consulta não é confundido com dados já atualizados. A consulta manual de alertas sempre força atualização.

## 06/11/2026 — Regressões corrigidas: Flux e ocultar valores

- **Falha do Flux no APK:** CORS de `ai-assistant` aceita explicitamente origens WebView Capacitor (`https://localhost`, `capacitor://localhost`) e previews do projeto Cloudflare. Mantém whitelist e autenticação JWT; não há acesso anônimo ao contexto financeiro.
- **Alternância efetiva de LLM:** `parseProviders` agora identifica somente segredos existentes no ambiente Edge e encadeia até quatro opções: Groq, OpenRouter gratuito, Gemini Flash e Gemini Flash Lite. Se `AI_PROVIDER_POOL_JSON` existir, tem prioridade e só inclui provedores com credencial. Falhas de taxa/timeout acionam cooldown e passagem ao próximo; histórico recente e contexto já consultado são reutilizados. Uso gratuito depende das cotas, e ausência de credenciais resulta em mensagem clara, sem afirmar sucesso.
- **Dados:** nenhuma alteração de saldos nem tabelas. Em perguntas financeiras, apenas as fontes necessárias são consultadas com cache de 12 s e controle de invalidação; os dados contábeis são sempre autoritativos no banco.
- **Olho de privacidade:** `FinancialPrivacyProvider` recebe o estado já existente do cabeçalho e `PrivateMoney` substitui valores monetários visíveis pelos marcadores `R$ ••••` nas principais telas e extratos da Carteira, sem modificar cálculos ou entradas editáveis. Testes de SSR garantem ausência do valor real no HTML em modo oculto. Atenção: ocultação visual não substitui proteção de banco ou autenticação, e módulos legados ainda devem ser auditados para cobertura total.
- **Qualidade:** `test:flux-agent` inclui validações para privacidade, origens Android, fallback de provedores e preservação do isolamento da sessão. O deploy da Edge Function deve incluir `index.ts` e `core.ts`, com `verify_jwt: true`; verificar o SHA web e o APK separadamente.

## 06/11/2026 — refinamento pontual da Minha Carteira

Escopo estrito: preservar a aparência atual, manter ações de lançamento exclusivamente no FAB, não alterar valores, contratos, dados bancários, funções RPC, RLS ou tabelas.

1. **Integração com Capital:** o seletor exibe todas as fontes *ativas* que a Carteira recebeu. Fontes de cartão/mistas, com saldo diferente ou já vinculadas a outra conta aparecem identificadas, porém desabilitadas para novo vínculo. Fontes atualmente vinculadas continuam visíveis para permitir desvinculação. A função de elegibilidade financeira e a validação de vínculo são preservadas.
2. **Português brasileiro:** os metadados de saldo `EFFECTIVE`/`CANONICAL` e demais estados têm rótulos de interface em português, sem alterar os códigos canônicos armazenados.
3. **Relatório da Carteira:** atalho discreto na seção Saúde financeira, apontando para `/carteira/relatorio` (fora das cinco abas). A nova página de leitura usa `walletRepository.loadOverview()` e `deriveOverview()` já existentes, com resumo de contas, receitas previstas, faturas, outros compromissos, projeção, categorias e vencimentos próximos. Não há novas consultas por cartão/indicador e não há gravação financeira.
4. **Flux mobile:** o avatar compacto diminui para 44 px com desenho interno de 24 px, preservando área tátil e o painel de conversa existente. Não adiciona animações invasivas ou um segundo FAB.

Testes: `tests/wallet/wallet-capital-sources-display.test.ts` e `tests/architecture/wallet-report-access.test.mjs`; homologação visual em aparelho físico continua necessária.

## 06/11/2026 — Flux: memória local cifrada e balões controlados por eventos

- **Memória:** contexto recente de cada conversa salvo em IndexedDB com AES-256-GCM e chave não exportável por usuário/conversa, retendo no máximo 32 mensagens de até 1.500 caracteres por 30 dias. A chave permanece no armazenamento local, não no código nem em localStorage. Ao reabrir o mesmo aparelho com o mesmo perfil master, o contexto pode ser recuperado sem consultar Supabase; ao iniciar nova conversa, a memória da conversa anterior é apagada. Não há sincronização entre dispositivos nem armazenamento durável no banco. Se IndexedDB/WebCrypto falhar, Flux funciona apenas com memória da sessão. Uma origem comprometida continua podendo ler dados usando APIs do navegador: criptografia local não substitui isolamento do dispositivo.
- **Segurança:** autorização master continua verificada no servidor. Dados financeiros do histórico não são tratados como verdades atuais; saldos exigem consultas de leitura autenticadas, cache curto por área e invalidação após movimentação. PIN, CVV, chaves e operações de escrita continuam proibidos.
- **Balões:** conectados exclusivamente às notificações internas já recebidas no AppShell, sem polling, chamada de IA ou consulta nova ao banco. São emitidos apenas para títulos financeiros reconhecidos; nunca exibem nomes ou valores da notificação. Ignoram alertas antigos no início da sessão, não aparecem com privacidade de valores ativada, enquanto há editor/modal ou app em segundo plano. Quota de até dois por dia, espaçamento mínimo de duas horas, desaparecimento após oito segundos, opção para desabilitar.
- **Android externo:** o app já produz alertas internos e push web, mas **não possui NotificationListenerService/permission BIND_NOTIFICATION_LISTENER_SERVICE** para ler notificações emitidas por apps de bancos. Importar extrato compartilhado e receber push não equivalem a interceptar notificações. O uso futuro dessa capacidade requer módulo nativo separado, solicitação explícita de acesso nas configurações Android, whitelist de aplicativos, consentimento e revisão de privacidade; nada foi habilitado silenciosamente.
- **Validação:** testes `tests/ai/flux-cue-memory.test.ts` e `tests/architecture/flux-memory-integration.test.mjs`, CI `test:flux-agent`. Ainda são necessários testes reais em dispositivo para comportamento do IndexedDB cifrado e alertas do Android.

## 06/11/2026 — Importador nativo de notificações Android

A leitura de compras notificadas foi adicionada via NotificationListenerService, somente após opt-in e autorização manual do Android, com lista de bancos permitidos. O leitor gera sugestões locais cifradas e passa por revisão do formulário existente; não lança sozinho, não lê mensagens de autenticação, não consulta IA/Supabase para capturar e não altera o ledger. Android registrado em `scripts/android/apply-native-shell.py`, que injeta manifesto e três classes Java no build CI. Entrada: **Carteira > FAB > Notificações bancárias**, fora das cinco abas principais. Ver `docs/ANDROID_BANK_NOTIFICATIONS.md`. Recursos do APK só funcionam depois de compilação/reinstalação nativa assinada e aprovação nas configurações do Android. Homologação real e cobertura de formatos bancários ainda pendentes.

## 06/11/2026 — Quitação de obrigação e fatura do cartão (caso PicPay)

A linha do tempo confundia a chave `due_month=YYYY-MM-01` de uma parcela com a data efetiva de vencimento. O pagamento dividido de uma obrigação podia criar despesa de cartão com `p_due_date=current_date`, anulando o cálculo automático do ciclo. Correções:

- `private.wallet_card_first_due_date`: calcula o ciclo pelo dia de fechamento/vencimento, aceitando data explícita do usuário quando fornecida. Funções `personal_wallet_pay_payable_split` passam `NULL` no parâmetro de vencimento da despesa financiada para acionar esse cálculo, sem alterar a idempotência da quitação ou os lançamentos de conta. Migration `20261106170000_wallet_card_financed_payment_due_date.sql`.
- Para a parcela de R$ 102,04 (capital R$ 97,19 + juros R$ 4,85), no PicPay de fechamento dia 26 e vencimento dia 5, a compra de 05/11/2026 pertence ao ciclo de vencimento **05/12/2026**, não 01/11/2026. A correção de dados existentes deve ser pontual, transacional, validada pelo vínculo em `personal_wallet_payable_payment_sources` e não deve alterar a obrigação liquidada de R$ 1.264,23, o lançamento bancário de R$ 1.167,04, limite financeiro ou qualquer outro cartão.
- A linha do tempo agrupa parcelas por **fatura real** quando há metadados do cartão, usando a data de vencimento calculada ou registrada pelo emissor. A fatura aparece como obrigação com o banco, não uma nova dívida com a credora. Sem metadados suficientes a parcela não pode ser classificada como atrasada apenas pelo dia 1 do mês.
- Contas a pagar: lista padrão só mostra obrigações abertas. Registros quitados/cancelados ficam na seção **Histórico**, preservando comprovantes e auditoria. O banco já registra a obrigação citada como `PAID`, saldo `0,00`; sem alteração destrutiva.
- Receitas: saldo inicial, estornos, ajustes e transferências com contraparte identificável não são receitas. Entradas avulsas concluídas ficam acessíveis apenas no **Histórico de entradas** (não são receitas a receber nem saldo disponível). O extrato preserva todos os lançamentos.
- Avisos: distingue quantidade de **contas a pagar vencidas** de **faturas com vencimento anterior sem quitação registrada**; esta última não comprova inadimplência externa. Nada é automaticamente quitado sem evidência.
- Testes `test:wallet-settlement` e `test:quality`; validar data de fatura em produção e comportamento em APK físico. Nenhuma exclusão ou recriação de registros prevista.

### Ajuste complementar: pagamento integral com cartão

A função `personal_wallet_pay_payable_from_card` também fornecia `current_date` como vencimento explícito. Foi corrigida via `20261106174500_wallet_card_payable_direct_due_date.sql` para deixar o cálculo automático do ciclo bancário atuar. As duas migrações do Supabase foram aplicadas. O evento específico de R$ 102,04 foi conciliado por vínculo de pagamento: principal R$ 97,19, juros R$ 4,85, despesa cartão R$ 102,04, compra em 05/11 e vencimento da fatura em 05/12/2026; a obrigação original manteve `PAID`, saldo zero. Somente `due_date` da despesa e `due_month` da parcela foram atualizados no registro comprovado. Nenhum saldo, lançamento ou pagamento foi excluído.

### Rótulo da cobrança financiada

As três rotinas de pagamento por cartão deixaram de escrever a descrição `Dívida: [credor]` para uma obrigação já quitada. Agora criam a despesa de cartão como `Pagamento com cartão: [credor]`, distinguindo o fato de pagar o credor da obrigação de quitar a fatura. Migration `20261106182000_wallet_card_paid_creditor_description.sql` aplicada ao Supabase. O lançamento histórico confirmado no PicPay de R$ 102,04 foi retitulado com a nova descrição, preservando identificadores, principal, juros, status, datas e auditoria. A movimentação bancária não foi repetida.

### 06/11/2026 — Fontes de quitação exibidas como um só pagamento
O pagamento da credora Marlucia em 05/11/2026 foi registrado na base com um pagamento de R$ 1.264,23 e duas origens: R$ 1.167,04 de **conta RecargaPay** e R$ 97,19 de **cartão PicPay**, com R$ 4,85 de juros incorporados à fatura PicPay de R$ 102,04. O usuário reporta duas origens de cartão; ainda **não existe comprovação contábil** de que a origem RecargaPay tenha debitado um cartão, portanto a implementação não altera a origem registrada, o histórico, nem os valores. A transferência avulsa `Pagar contas` de R$ 162,06 foi identificada como **Nubank → RecargaPay**, transferência interna, não outro pagamento à credora.

A página Compromissos carrega as fontes já protegidas por RLS somente no snapshot detalhado, agrupadas pelo `payment_id` e filtradas pelo período da Carteira. Na linha do tempo, cada pagamento a credor aparece como **Quitação: [credor]**, com discriminação das origens e dos juros na fatura (sem dupla contagem no principal). A operação bancária gerada pela mesma quitação é suprimida da linha do tempo somente com correspondência verificável de valor, conta, data e credora. Transferências internas aparecem com instituição de origem e destino, mantendo direção neutra. Alertas e saldos não são recalculados por essa apresentação. O histórico financeiro e a distinção entre conta/cartão permanecem autoritativos.

## 06/11/2026 — Persistência de menus e barra móvel

A barra inferior móvel era uma sequência fixa em `layout/BottomNav.tsx`, ignorando as preferências do usuário. Agora permite modo **Organizar** (ícone discreto), arrastar botões com toque/ponteiro, concluir/cancelar, preservar a rolagem horizontal e salvar a ordem por perfil no `localStorage` e em `perfis.ui_mobile_nav_order`. Nenhum menu desaparece ao reordenar. A mudança é enviada ao banco uma única vez no botão Concluir, com reenvio na autenticação quando houver sincronização pendente.

A tela **Perfil > Interface > Personalizar Menus** tinha salvamento silencioso sem checagem de linha atualizada; agora valida o retorno, informa falhas, mantém uma cópia local específica do perfil e impede clique concorrente enquanto salva. Havia ainda erro de ligação: `App.tsx` passava `visibleHubOrder` para a barra superior do `AppShell`; agora passa `navOrder`, enquanto a ordem lateral continua independente. A coluna nova usa RLS da tabela `perfis`. Consulte `docs/MOBILE_NAVIGATION_CUSTOMIZATION.md` e os testes de navegação.

### 06/11/2026 — Resumo compacto e sem valores repetidos (Visão Geral da Carteira)
A captura apontava uma conta RecargaPay com o mesmo saldo em "Liquidez imediata" e na linha da conta, e um cartão PicPay com o limite disponível tanto no bloco superior quanto no próprio cartão. A interface usa agora o princípio de divulgação progressiva: **uma conta** apresenta apenas uma linha e o saldo individual; **várias contas** apresentam também um pequeno total consolidado; **um cartão** exibe limite disponível apenas no cartão; **vários cartões** mostram um somatório e progresso agregados em tamanho compacto. Faturas com vencimento no mês permanecem em linha única. O cartão visual foi reduzido a 132px de altura (142px em telas maiores); as abas, links e o controle de privacidade continuam funcionais. Não altera cálculo, leitura de banco, importação ou nenhuma operação financeira. Testes de renderização verificam valores não duplicados para uma origem e agregados para múltiplas origens.

## 06/11/2026 — Privacidade total dos indicadores e competência das faturas

O ícone do olho já acionava o `FinancialPrivacyProvider`, mas os elementos abaixo ignoravam o contexto e revelavam dados: `WalletSpendingGuide` expunha R$ 108,34, R$ 102,04, R$ 6,30, percentuais, estado de atenção e gráficos; o balanço expunha a classe visual e os textos Superávit/Déficit. Correção: quando a privacidade está ativa os indicadores dinâmicos de gastos não são renderizados, incluindo acessibilidade das barras, o painel de balanço exibe status neutro, esconde a composição/auditoria e oculta a lista de próximos vencimentos. O relatório usa substituição visual protegida e o resumo dos cartões oculta percentuais, barras, finais dos cartões e números agregados. `WalletBalanceOverview` e `AccountCardStack` respeitam a mesma política. O Flux já desliga balões, chat e consultas quando a privacidade está ativa.

**Contabilização por competência:** compra de R$ 102,04 em 05/11/2026 entra no histórico de compras efetuadas em novembro, sem constituir compromisso financeiro de novembro, pois a parcela pertence ao ciclo da fatura de dezembro, vencimento 05/12/2026. A compra NÃO é somada ao balanço mensal como uma segunda obrigação. Só faturas com vencimento no mês e contas a pagar com saldo realmente aberto entram no passivo do mês. Os testes `wallet-purchase-invoice-distinction` e `wallet-global-privacy` documentam essa invariância. Não houve mutação de dados, ledger, rotinas financeiras ou Supabase.

## 07/11/2026 — Flux: diagnóstico real de falha de transporte
- **Problema:** o painel do Flux exibia sempre "O Flux está temporariamente indisponível" quando a chamada à Edge Function `ai-assistant` falhava, escondendo a causa (função não publicada, sessão expirada, perfil sem acesso, erro 5xx, CORS/rede). O mesmo ocorria em Histórico e Alertas, que tentavam ler `data.error` quando o supabase-js retorna `data = null` em erro.
- **Mudança (somente cliente):** `services/ai/fluxTransport.ts` traduz status HTTP + `{ error }` do servidor em mensagens específicas (`UNREACHABLE`, `NOT_DEPLOYED`, `SESSION`, `FORBIDDEN`, `BAD_REQUEST`, `SERVER`, `EMPTY_REPLY`). Corpos não confiáveis (HTML, stack trace, texto longo) nunca são exibidos. `askMasterAssistant` devolve `transportStatus`/`transportCode` e registra `[flux] transport_failure` no console. Nenhum fallback lê dados financeiros nem apresenta valores.
- **Não alterado:** Edge Function, RPCs, migrations, RLS, ledger.
- **Testes:** `tests/ai/flux-transport.test.ts` (novo, em `test:flux-agent`), `tests/architecture/flux-agent-integration.test.mjs` ampliado; `npm run test:quality` aprovado localmente (inclui `test:wallet-visual-next`).
- **Pendências:** publicar e verificar a Edge Function `ai-assistant` no projeto remoto (`supabase functions deploy ai-assistant`, migrations `20261105235900_master_ai_assistant*.sql`, segredos de provedores); validar a mensagem no navegador/Android — não houve validação em aparelho físico. Próximas etapas planejadas: pool de provedores via `AI_PROVIDER_POOL_JSON`, ferramentas de leitura menores e RAG com pgvector (dependem de autorização explícita para migrations).
- **Complemento (07/11/2026):** Edge Function `ai-assistant` publicada pelo usuário no projeto `hzchchbxkhryextaymkn`; só `GEMINI_API_KEY` configurada. Quando o modelo Gemini configurado responde 404, a função agora consulta `ListModels` com a mesma chave (cache 6h), escolhe um modelo `flash` com `generateContent` e tenta uma vez. Erros `deno check` (TS2345 em `createClient`) são preexistentes. Requer novo `functions deploy ai-assistant`.
- **Complemento 2 (08/11/2026):** Flux no navegador local retornava `UNREACHABLE` por CORS: `server.ts` usa portas 3000–3010 quando a 3000 está ocupada e só `:3000` estava liberada. `ai-assistant` agora aceita `localhost`/`127.0.0.1` em qualquer porta (JWT continua obrigatório). Requer novo deploy da função.
- **Complemento 3 (08/11/2026):** conexão confirmada; Gemini falhou ("provedores indisponíveis"). Resposta agora inclui `Diagnóstico: <provedor>: <código>` (somente códigos sanitizados, endpoint já restrito ao master). Modelo reserva do Gemini só recebe `thinkingLevel` quando for `gemini-3*`.
- **Complemento 4 (08/11/2026):** diagnóstico mostrou `gemini-flash: PROVIDER_400; gemini-lite: PROVIDER_400`. Erros agora carregam o motivo enumerado do provedor (`PROVIDER_400_API_KEY_INVALID`, etc.; só `[A-Z_]`). Em 400 que não seja chave/permissão/cobrança, o Gemini é chamado mais uma vez sem `thinkingConfig` e sem ferramentas.

## 08/11/2026 — Remoção de alerta de saldo crítico no sino, navegação nativa nas notificações e detecção de APK em background
- **Remoção de notificação de falta de recurso (`hooks/useAppNotifications.ts`):** removida a geração automática de `"Carteira com saldo crítico"` (`item_type: 'carteira'`) e adicionado filtro em `isStaleLoadedNotification` para suprimir registros legados de saldo crítico vindos do banco (`notificacoes`).
- **Botão Voltar com notificações expandidas no APK (`layout/HeaderBar.tsx`):** quando o popover de notificações (`showNotifications`) está aberto, registra `registerDialogBack(() => setShowNotifications(false))` e intercepta `capitalflow:back` / `Escape`, fechando apenas o painel de alertas sem navegar a tela de fundo.
- **Notificação de nova versão do APK no sino (`components/system/AndroidNativeUpdateNotice.tsx`, `layout/HeaderBar.tsx`):** `useAndroidNativeUpdateAvailable` verifica o release assinado (`android-signed-beta`) em segundo plano mesmo com o sino fechado (na inicialização, retorno do app `resume`, reconexão `online` e a cada 60s), somando a atualização pendente ao badge do sino (`alertBadgeCount`) e disponibilizando o card de instalação imediatamente ao abrir o sino.

## 09/11/2026 — Correção definitiva do Flux (IA Assistente)
- **Causa raiz do erro `PROVIDER_400` no Gemini (`supabase/functions/ai-assistant/index.ts`):**
  1. Os modelos padrão apontavam para IDs inexistentes (`gemini-3.8-flash` e `gemini-3.5-flash-lite`) e enviavam `thinkingConfig: { thinkingLevel: 'low' }`, que é rejeitado com HTTP `400 INVALID_ARGUMENT` antes da validação de `404` do modelo; no retry de `400`, a chamada repetia o mesmo endpoint inexistente sem acionar a descoberta `listGeminiModels`.
  2. Quando o histórico da conversa (`turns`) começava com turno `model` (após corte de 10/12 mensagens) ou continha dois turnos `user` seguidos (após falha anterior), a API `generateContent` do Gemini retornava `400 INVALID_ARGUMENT` em todas as mensagens seguintes.
- **Correções aplicadas (`supabase/functions/ai-assistant/index.ts`, `supabase/functions/ai-assistant/core.ts`, `components/ai/MasterMascot.tsx`):**
  - Modelos padrão atualizados para `gemini-2.5-flash` e `gemini-2.0-flash`, com `listGeminiModels` garantindo lista válida de fallback.
  - Adicionado `buildGeminiContents(turns)` para garantir que `contents` sempre inicie com `role: 'user'` e alterne estritamente `user`/`model` (mesclando turnos consecutivos do mesmo papel).
  - No erro `400` ou `404`, o retry sem `tools`/`thinkingConfig` também faz fallback automático para o modelo descoberto em `listGeminiModels(apiKey)`.
  - Em `MasterMascot.tsx`, respostas de falha (`transport-fallback` / `unavailable` ou diagnósticos antigos salvos no IndexedDB) são marcadas com `:error` e filtradas de `turns`.
  - Se todos os provedores externos estiverem indisponíveis ou sem cota, o Flux responde saudações naturalmente (`conversational-fallback`) e responde consultas com os dados reais autenticados do usuário (`generateDeterministicContextResponse` sobre o contexto `geral` ou específico).

## 10/11/2026 — Correção do resumo financeiro zerado no Flux
- **Causa:** `supabase/functions/ai-assistant/index.ts` usava `auth.user.id` diretamente nas consultas de `contratos`, `clientes` e demais dados financeiros. Esse UUID é o usuário do Auth, enquanto as tabelas de crédito usam o `perfis.id`/owner; o RLS permitia a consulta, mas o filtro não encontrava registros.
- **Correção:** a função resolve o perfil por `perfis.user_id`, usa `supervisor_id` quando aplicável e reutiliza esse owner no contexto financeiro, briefing e histórico. Há fallback conservador ao UUID do Auth para compatibilidade com instalações antigas.
- **Validação:** `npm run test:flux-agent`, `npm run build` e `git diff --check` passaram. O build mantém apenas avisos preexistentes de chunking/importação dinâmica.
- **Limitação:** não foi executada uma consulta contra o projeto Supabase remoto nem validada a tela em navegador/dispositivo; a Edge Function precisa ser publicada novamente para a correção aparecer em produção.

## 12/11/2026 — Auditoria de integridade: regra "hoje" (somente diagnóstico)
- **Sem alteração de produção.** Novos arquivos: `docs/auditoria/REGRAS_CANONICAS.md` (inventário) e `tests/audit/business-date-consistency.test.ts` (`npm run test:audit`).
- **Confirmado por teste:** `payablesDomain.derivePayableStatus` marca como OVERDUE uma conta que vence hoje após 20h em Manaus; `utils/dateHelpers.getDaysDiff` depende do fuso do aparelho/servidor. Os testes estão marcados `todo` e não quebram o CI.
- **Confirmado por leitura:** `agreementService.ts:108` envia `p_payment_date` em UTC; a RPC `process_agreement_payment_atomic` usa essa data para dias de atraso e para a data do ledger. Pagamento de acordo após 20h conta 1 dia de atraso.
- **Pendências:** correções exigem aprovação, uma por vez; conferir `show timezone` e os pagamentos afetados no banco real, só leitura; inventariar quitação, estorno, saldo da Carteira e faturas.

## 12/11/2026 — Acordos: data civil de Manaus (autorizado pelo usuário)
- **Novo:** `features/agreements/services/agreementDates.ts`, com a data do pagamento, o primeiro vencimento padrão, a normalização de datas e a regra de atraso, todas por `businessDateInManaus()`.
- **`agreementService.ts`:** `p_payment_date` da RPC `process_agreement_payment_atomic` passa a usar o dia civil de Manaus. Antes, depois das 20h ia a data do dia seguinte, gerando 1 dia de atraso e data errada no ledger. RPC e banco não foram alterados.
- **`agreementService.legacy.ts`:** o atraso ao restaurar parcelas usa Manaus; o primeiro vencimento padrão passa a ser amanhã em Manaus (antes, "agora + 24h" em UTC pulava 2 dias à noite); data em texto `YYYY-MM-DD` é mantida literalmente. Objetos `Date` mantêm a conversão anterior. Instantes (`paid_at`, `date`, `updated_at`) não mudaram.
- **Testes:** `tests/financial/agreement-dates.test.ts` (em `test:financial`); os `todo` dos acordos em `test:audit` viraram bloqueio de regressão; `test:audit` foi incluído no `test:quality`. `npm run test:quality` aprovado localmente.
- **Pendências:** conferir no banco real, só leitura, os pagamentos de acordo já gravados com data do dia seguinte. Não foi validado em aparelho nem em produção.

## 12/11/2026 — Carteira: contas a pagar e datas padrão no dia de Manaus (autorizado)
- **`components/wallet/payablesDomain.ts`:** o padrão de "hoje" em `derivePayableStatus` e `summarizePayables` passa a ser `businessDateInManaus()`. Antes, uma conta que vence hoje aparecia OVERDUE e somava no "vencido" após 20h. Regra mantida: parcial vencido continua PARTIAL, como o teste existente exige.
- **`pages/PersonalWalletPage.tsx`:** `today()` (data padrão de nova despesa e do vencimento de nova conta a pagar, e `currentMonth`) passa a usar Manaus. Antes, uma despesa lançada à noite recebia a data de amanhã e podia cair no ciclo de fatura seguinte.
- **Testes:** novo caso em `tests/wallet/payables-domain.test.ts` (agora executado por `test:audit`, que está no `test:quality`); `todo` da Carteira removido em `test:audit`. `npm run test:quality` aprovado.
- **Pré-existente, não alterado:** `tests/wallet/*.test.ts` tem 3 falhas também sem esta mudança (#108 salvar alterações/vínculo RPC, #146 três magnitudes de crédito, #213 FAB com quatro ações); esse conjunto não está no `test:quality`.
- **Não validado** no navegador nem em aparelho.

## 11/11/2026 — Consistência dos caminhos de IA (em andamento)

- Criado `services/ai/assistantContract.ts` como contrato comum para a resposta estruturada da IA: parsing tolerante a JSON cercado por Markdown, campos obrigatórios, limites de tamanho e normalização de sugestões/score.
- `services/geminiService.ts` passou a usar prompt estruturado e `responseSchema`, mantendo o proxy autenticado e o fallback interno existentes.
- Alinhados os módulos que chamavam o modelo legado `gemini-3.8-flash` para `gemini-2.5-flash`; o proxy continua aceitando os identificadores antigos para compatibilidade.
- `normalizeAssistantTurns` agora filtra turnos inválidos antes de limitar a memória, preservando contexto válido em payloads multi-turno com entradas malformadas.
- O Flux agora exige resposta financeira com resposta direta, evidências e próximos passos; respostas financeiras genéricas ou curtas são descartadas antes da entrega.
- Consultas que combinam áreas passam a usar contexto geral; a data de referência usa `America/Manaus`; o lucro previsto em aberto usa juros remanescentes das parcelas, sem subtrair principal original de saldo remanescente.
- O contrato legado preserva `data` em respostas remotas de cadastro/recebimento, mantendo a revisão manual antes de qualquer gravação.
- O leitor de documentos com IA agora falha fechado quando `rows` não existe, descarta datas impossíveis/valores inválidos, informa linhas ignoradas e alinha o limite de arquivo ao proxy (5 MB); linhas válidas continuam sempre desmarcadas para revisão.
- Teste arquitetural `no-browser-ai-secrets.test.mjs` passou (4/4) e `git diff --check` passou. Os testes TypeScript ainda não foram executados porque o checkout não possui `node_modules`/`tsx`; nenhuma conexão, RPC, migration, ledger, pagamento ou RLS foi alterada.
- Pendências: executar uma validação autenticada do proxy/Edge Function no ambiente remoto e validação visual em navegador/aparelho físico antes de publicar. Não houve validação visual em celular físico.
- Nesta rodada, `test:flux-agent` passou (21/21 + arquitetura Flux 15/15), `test:wallet-statement-import` passou (55/55), `test:ai-security` passou (19/19), `build` passou e a sequência completa equivalente a `test:quality` passou. O comando literal do quality gate não foi usado porque o runtime disponível não expõe `npm` como subprocesso recursivo; nenhum gate individual ficou vermelho.
## 12/11/2026 — reconciliação de recebimentos anteriores ao destino da Carteira

- Lacuna identificada: o roteamento por conta/fonte existente só era executado no momento do `INSERT` do recebimento; pagamentos anteriores permaneciam nas fontes originais e não tinham fluxo para reclassificação.
- Implementada a migração `20261112120000_historical_wallet_receipt_reconciliation.sql`: consulta somente recebimentos concluídos, não estornados, originais e sem destino; a RPC administrativa trava a operação, valida perfil/destino, preserva centavos e composição capital + lucro/encargos, chama o motor canônico de roteamento e grava auditoria idempotente. Não há `DELETE` nem alteração do valor, parcela ou contrato.
- A Carteira exibe o painel apenas para `SUPER_ADMIN`, com prévia, destino explícito (conta ou fonte), motivo obrigatório e confirmação. O backend continua sendo a autoridade e bloqueia usuário sem autorização, destino inválido, duplicidade ou divergência contábil.
- Serviço: `listHistoricalReceiptCandidates`, `listHistoricalReceiptDestinations` e `reconcileHistoricalReceipt`. Testes: `tests/financial/historical-receipt-reconciliation.test.mjs` e `tests/architecture/historical-receipt-reconciliation.test.mjs`.
- Limitação: nenhuma reclassificação real foi executada automaticamente e não houve teste em celular físico. É necessário aplicar a migration no Supabase de produção e revisar a prévia dos recebimentos antes de confirmar cada destino.
## 12/11/2026 — Replica local híbrida: paginação e convergência na reconexão

- O armazenamento local existente continua sendo o IndexedDB/Dexie `CapitalFlowDB` para o perfil autenticado; não foi introduzido MySQL no aparelho. O Supabase permanece a fonte autoritativa.
- `services/offline/hybridSync.ts` adiciona paginação explícita de 500 registros por página e reconciliação de IDs ausentes, evitando truncamento silencioso no limite do Data API.
- `services/sync.service.ts` usa paginação nas coleções sincronizadas e remove clientes locais que desapareceram do escopo remoto, preservando registros com escrita pendente.
- Ao reconectar, a fila de escrita é processada e o `useAppState` dispara uma nova leitura paginada para convergir a réplica local (`capitalflow:sync-requested`).
- Teste adicionado em `tests/offline/hybrid-sync.test.ts`. A execução automatizada ficou pendente nesta máquina porque Node/npm não estão instalados no PATH; `git diff --check` encontrou apenas espaços finais em alterações anteriores não relacionadas.
- Limitação mantida: esta etapa não transforma o sistema em réplica de todas as tabelas do Supabase nem habilita operações financeiras críticas offline. Não houve alteração de RPC, migration, ledger, pagamento, estorno ou RLS.

## 12/11/2026 — Verificacao da replica hibrida

- `npm run test:quality`: passou com exit code 0.
- `npm run build`: passou com exit code 0; o bundler manteve apenas avisos de chunks grandes e imports mistos.
- `tsx --test tests/offline/hybrid-sync.test.ts`: 3/3 passou.
- `git diff --check` dos arquivos desta implementacao: passou.
- Nao houve commit, deploy web ou alteracao no Supabase nesta etapa.

## 12/11/2026 — Correcao das limitacoes de sincronizacao offline da Carteira

- A reconexao agora faz prefetch forcado da Carteira, exigindo dados frescos da rede antes de marcar a replica como atualizada; cache antigo nao mascara falha de reconexao.
- O prefetch passou a retornar sucesso/falha e a interface mostra estado de atualizacao, aviso de falha e retry manual, mantendo a consulta offline disponivel.
- A deduplicacao de prefetch permanece ativa; uma atualizacao forcada aguardando outra execucao inicia nova leitura somente depois que a anterior termina.
- Validacao: teste especifico da Carteira 4/4, `npm run build` exit 0 e `npm run test:quality` exit 0. Avisos restantes sao somente chunking/imports mistos do Vite.
- Nao houve commit, deploy, alteracao de Supabase, RPC, migration, ledger, pagamento, estorno ou RLS. Validacao em celular fisico continua pendente.

## 12/11/2026 — Flux AI completo e Consistência Financeira 360°

- **Flux AI (`ai-assistant`):** adicionados RAG/embeddings com fallback local (`supabase/functions/ai-assistant/rag.ts`), guardrails de entrada/saída e grounding (`guardrails.ts`), telemetria/tracing (`telemetry.ts`), loop de agente `READ_ONLY` com tool calling, streaming SSE, cache de prompts e histórico cifrado em `services/aiAssistant.service.ts` + `components/ai/MasterMascot.tsx`. Teste dedicado em `tests/ai/flux-full-architecture.test.ts`.
- **Consistência Financeira 360°:** padronização de data comercial em `America/Manaus` (`utils/businessDate.ts`, `supabase/functions/_shared/businessDate.ts`, modais da Carteira e Edge Functions de pagamento/webhook), conservação exata em centavos nas renovações e no `rebuildLoanStateFromLedger`, exposição uniforme de `finePart`/`moraPart` nas modalidades, inclusão de estornos/aportes no DRE, consistência de `invoice_due_month` em `invoiceStatementDomain.ts` e correção de sinal em `parseStatementLines` (`utils/walletStatementPdf.ts`). Teste dedicado em `tests/financial/consistency-360.test.ts` (5/5).
- **Validação executada:** `npx tsx --test tests/financial/consistency-360.test.ts` (5/5), `npx tsx --test tests/offline/hybrid-sync.test.ts` (3/3), `npm run test:quality` (exit code 0) e `npm run build` (`tsc -b && vite build`, exit code 0).
- **Pendências e limitações:** não houve commit nesta etapa; as 6 Edge Functions alteradas em `supabase/functions/` (`ai-assistant`, `asaas-create-payment`, `asaas-webhook`, `infinitepay-create-checkout`, `infinitepay-webhook`, `mp-webhook`) ainda dependem de `supabase functions deploy` no ambiente remoto; nenhuma RPC SQL foi alterada; não houve validação em celular físico.

## 12/11/2026 — Polimento de UX na Carteira, Clientes, Cadastro Público e Perfil

- **Carteira (`WalletSpendingGuide`, `WalletOverviewPage`, `WalletBalanceDock`, `WalletExpenseFab`):** limpeza de cópia duplicada no guia financeiro, alinhamento do selo de status e botão de relatório (`h-7`), remoção de sobreposição do `sticky` na barra de saldo e ajuste de posicionamento do FAB no desktop (`sm:right-6 sm:bottom-6`).
- **Clientes e Cadastro Público (`ClientsPage`, `ClientRegistrationPage`):** botões de ação compactos e exibição completa de nomes sem truncamento indevido; correção de overflow nos campos de upload com `min-w-0 overflow-hidden` e `truncate`.
- **Perfil (`ProfilePage`):** remoção de ações redundantes no topo, reorganização das 6 seções essenciais de configuração em layout responsivo com cabeçalho horizontal compacto e botão `Sair` alinhado à direita em telas `< lg` (`hidden lg:flex` no rodapé desktop).
- **Limitações:** alterações exclusivamente de interface (sem alteração de RPCs, migrations, ledger, pagamento, estorno ou RLS); não houve validação visual em celular físico nesta etapa.

## 13/11/2026 - Fila offline fora do caminho crítico

- **Causa corrigida:** a leitura autoritativa esperava a fila de operações offline terminar. Uma operação antiga, sem rede ou aguardando autenticação podia fazer o sistema parecer travado e impedir novos pedidos.
- **Comportamento atual:** `syncFullData` atualiza a leitura sem esperar a fila; a fila continua em segundo plano, com autenticação, conflitos, tentativas e estado `DEAD` preservados. Um mutex impede processamentos concorrentes.
- **Reconexão:** o evento online solicita a nova leitura e dispara o processamento da fila em segundo plano, sem bloquear a interface.
- **Escopo de segurança:** não houve alteração de Supabase, RPC, migration, ledger, pagamento, estorno ou RLS; nenhuma operação pendente foi apagada.
- **Validação:** `npm run build` passou; `git diff --check` passou. O teste isolado de sincronização não iniciou nesta máquina por `uv_os_get_passwd ENOMEM` (memória insuficiente do sistema).

## 13/11/2026 - Unificação do destino dos recebimentos

- A conciliação de recebimentos anteriores agora usa o mesmo `personal_wallet_set_receipt_destination` e o mesmo `wallet_route_receipt_internal` do recebimento atual.
- O valor integral continua entrando na conta/fonte escolhida; capital, juros e encargos permanecem separados na operação financeira e na auditoria.
- O recebimento original, contrato, parcela e idempotência continuam preservados. Não foi criado crédito duplicado nem um segundo lançamento financeiro.
- A interface e seus campos/botões não foram redesenhados nesta etapa.

## 13/11/2026 - Refinamento visual do Perfil e exclusão de transações de teste na contabilidade do painel

- **Perfil (`ProfilePage`, `LanguageSelector`, `ProfileExportReports`, `ProfileAuditLog`, `ProfileDangerZone`):** reorganização dos campos em blocos equilibrados, padronização de altura (`h-10`), prefixos/sufixos numéricos (`%`, `R$`), rótulos nos botões de dados/backup e controles de ordenação de menus sempre visíveis.
- **Exclusão de fontes de teste (`domain/dashboard/stats.ts`, `utils/profitBalance.ts`):** transações individuais (`ledger.sourceId`) vinculadas a fontes de teste (`isTestSource`) agora também são ignoradas no cálculo de `Lucro Realizado`, no acumulado mensal e no gráfico de evolução, mesmo quando pertencem a um contrato de fonte operacional; `isProfitSource` também ignora fontes de teste.
- **Escopo:** sem alteração de RPCs, migrations, `App.tsx`, `sync.service.ts` ou RLS.
- **Aplicação remota verificada:** a migration foi aplicada no projeto Supabase `hzchchbxkhryextaymkn` como `20261113193409_unify_receipt_destination_flow`; a RPC remota agora usa o preparador de destino e o roteador canônicos, sem inserir diretamente na tabela de destinos nem apagar operações financeiras.
- **Prévia remota:** existem 107 recebimentos concluídos, 106 elegíveis para revisão histórica e 0 já roteados; nenhum recebimento foi movido automaticamente. A conciliação individual continua pendente de escolha explícita de destino.

## 13/11/2026 - Visibilidade interna do custo de captação

- O Extrato passou a mostrar o **Custo de captação previsto** do período, derivado de `funding_cost`/`funding_total_payable` dos contratos, separado da dívida e dos documentos do cliente.
- O resumo é somente leitura: não altera principal, juros do cliente, saldos, faturas, limites, ledger ou recebimentos, e não cria uma segunda despesa no cartão.
- Testes adicionados em `tests/financial/funding-cost-report.test.ts`; `npm run test:financial`, `npm run test:wallet-visual-next`, `npm run test:architecture` e `npm run build` passaram.
- Limitação explícita: esta etapa ainda não concilia automaticamente o custo previsto com uma compra já existente na fatura. A integração de lançamento/conciliação exige uma etapa própria com cartão, contrato, ciclo da fatura e idempotência confirmados.

## 13/11/2026 - Ajuste da tela Fontes e score no card do cliente

- A tela `SourcesPage` deixou de apresentar o valor de transferência interna como se fosse o total consolidado das fontes; agora usa uma linha compacta com a composição de recursos transferíveis, saldos de contas associados e limites de cartões associados, sem somar caixa com crédito.
- Os cards de fontes passaram a ocupar altura uniforme por linha e exibem separadamente o saldo operacional da fonte e o valor associado à Minha Carteira, sem substituir um pelo outro.
- `ClientsPage` passou a mostrar o score de risco no card do cliente, consolidando o pior score entre contratos ativos ou históricos vinculados exclusivamente por `client_id`. O score não foi colocado no card de contrato.
- Validação: TypeScript, arquitetura, `test:wallet-visual-next`, `test:wallet-pages`, build de produção e `git diff --check` passaram. Não houve alteração em Supabase, RPC, migration, ledger, pagamento, estorno ou RLS.
- O score foi remodelado como uma faixa visível no card do cliente (`Risco X/100 · nível`) e passou a considerar também contratos históricos vinculados por `client_id`; nenhum vínculo por nome/documento foi criado.

## 14/11/2026 - Separação entre fontes, contas e documentos jurídicos

- O vínculo de integração com o Capital deixou de aparecer na página geral de Contas; a configuração permanece na edição da Fonte de Capital, onde a relação fonte → conta/cartão é definida.
- Os rótulos da edição foram corrigidos de “Editar carteira” para “Editar fonte de capital”.
- O Jurídico agora separa documentos válidos (assinados ou arquivo assinado enviado), minutas/pendências e arquivados; registros pendentes não são apresentados como documentos existentes e nenhum histórico foi apagado.
- Validação: testes do Jurídico, referências da Carteira, TypeScript e `git diff --check` passaram. Não houve alteração em RPC, migration, ledger, pagamento, estorno ou RLS.

## 13/11/2026 - Vitrine comercial rolável na tela de login e merge da auditoria de datas (`main`)

- **Auth (`features/auth/AuthScreen.tsx`, `features/auth/AuthCommercialSection.tsx`, `i18n/locales/*.ts`):** adicionada seção comercial rolável abaixo da dobra (`100dvh`) com apresentação em 3 passos, vantagens reais da operação (incluindo Fontes e Carteira integradas, sem prometer gestão de equipe ainda incompleta), comparativo Free/Pro e retorno suave ao topo.
- **Merge da branch de auditoria (`claude/jolly-heisenberg-s9ob7a` / `f330607`):** incorporadas na `main` as correções de data civil em `America/Manaus` para acordos (`agreementDates.ts`), contas a pagar (`payablesDomain.ts`, `PersonalWalletPage.tsx`), `services/paymentOffers.service.test.ts` e a suíte `test:audit` no `package.json`.
- **Limitações:** alterações de interface, datas de negócio e testes; sem alteração de RPCs, migrations, ledger ou RLS neste commit. Sem validação em aparelho físico.

## 14/11/2026 - Lançamentos fixos embutidos no detalhe da conta

- Receitas fixas (salário, pensão, aluguel recebido e similares) agora aparecem dentro do detalhe da conta de destino, com cadastro, confirmação mensal idempotente e desativação.
- Despesas/pagamentos fixos agora aparecem dentro do detalhe da conta de origem, com cadastro, geração idempotente dos próximos vencimentos e pausa/reativação.
- A página separada `Receitas` deixou de aparecer na navegação; links antigos para `/carteira/receitas` são direcionados para `Contas`, sem apagar os serviços, registros ou histórico existentes.
- O extrato, o FAB, os lançamentos avulsos e os fluxos de pagamentos de contratos permanecem inalterados. Nenhuma migration, RPC, ledger, pagamento, estorno ou RLS foi alterado.
- Validação executada após a implementação: TypeScript, arquitetura da Carteira, visão geral, páginas, testes visuais da Carteira e recebimentos. Sem validação em aparelho físico.

## 15/11/2026 — Foco da Carteira: linha de base atual e acompanhamento futuro

- Prioridade de produto: acompanhar saldos existentes, gastos atuais e contratos ainda vigentes, registrando movimentos daqui em diante para medir sua evolução.
- O fluxo de conciliação de recebimentos históricos foi retirado da interface da Carteira e do serviço frontend. Valores passados que não representam recursos disponíveis não serão reclassificados como saldo atual.
- As migrations e tabelas históricas permanecem preservadas no banco/código para não apagar auditoria nem alterar dados existentes; nenhuma migração reversa ou operação remota foi executada.
- Próximos passos recomendados: validar a linha de base atual de contas/fontes/cartões, despesas correntes e contratos ativos; melhorar estados vazios e relatórios futuros sobre essa base.
- Correções de testes após a remoção do fluxo histórico:
  - Restaurado UTF-8 e removido `useEffect` não utilizado em `features/wallet/pages/WalletIncomePage.tsx` (a quebra de encoding fazia `tests/wallet/wallet-quick-receipts.test.ts` falhar na verificação de `'Histórico de entradas avulsas'`).
  - Atualizado `tests/architecture/historical-receipt-reconciliation.test.mjs` para garantir que `HistoricalReceiptReconciliationPanel.tsx`, os métodos de reconciliação histórica em `services/personalWallet.service.ts` e o gatilho na tela de Receitas permaneçam ausentes, preservando os fluxos de receitas atuais e recorrentes e mantendo intacto `tests/financial/historical-receipt-reconciliation.test.mjs` sobre a migration histórica preservada.
  - Restaurada a codificação UTF-8 preservada de `docs/CARTEIRA_CONTINUIDADE.md` sem perder o histórico anterior.
- Validação executada nesta etapa: `npm run lint` (passou), `npm run build` (passou), `npm run test:wallet-visual-next` (39/39), `npm run test:wallet-receipts` (21 + 5 + 5 = 31/31), `npm run test:wallet-pages` (9/9), `npm run test:i18n` (9/9) e `npm run test:quality` (exit code 0). Sem alteração em RPCs, migrations, ledger, regras de pagamento/estorno ou RLS. Sem validação em aparelho físico.
## 15/11/2026 — Refatoração do App, foco operacional e release Android

- `App.tsx` teve responsabilidades de acesso administrativo, sincronização de rede/notificações e pré-carregamento da Carteira extraídas para `hooks/usePlatformAccess.ts`, `hooks/useNetworkSync.ts` e `hooks/useWalletPreload.ts`. Os efeitos preservam as dependências e condições de autorização existentes; o hook de pré-carga continua restrito ao superadmin e a telas privadas autenticadas.
- O teste de contrato do FAB foi alinhado às classes responsivas por rota (`bottom-28` em Cartões e `bottom-20` nas demais), sem mudar o comportamento visual implementado.
- **Direção confirmada pelo titular:** medir daqui para frente usando saldos atuais, gastos correntes e contratos vigentes. O painel e os métodos frontend de reconciliação de recebimentos históricos foram removidos. Migrations e auditoria histórica permanecem preservadas; não houve operação remota nem reclassificação dos recebimentos antigos.
- **Commits na `main`:** `105a484` remove o fluxo histórico da Carteira; `7be9c31` extrai hooks do `App.tsx` e ajusta o teste do FAB. Árvore de trabalho limpa no fechamento.
- **Validação no commit `7be9c31`:** `npm run test:quality` local aprovado; Quality Gates remoto aprovado (`43744506493`); workflow Android APK aprovado (`43744506560`). Os testes `test:wallet-visual-next`, `test:wallet-receipts`, `test:wallet-pages`, `test:wallet-pwa-legal`, `test:wallet-import-contract` e os testes Android locais passaram durante esta sequência. `git diff --check` passou.
- **APK:** workflow publicou `CapitalFlow-Android.apk` na release assinada `android-signed-beta`, para o commit `7be9c31`. SHA-256 do APK: `96b14533f4be1837d66f6e7503f89a141082058bc1fa35d5105f4adcf341f366`. Não houve validação em aparelho físico nem publicação na Play Store.
- **Próximos passos:** priorizar linha de base de contas/fontes/cartões, gastos atuais e contratos ativos; onboarding/estados vazios, acessibilidade e métricas de carregamento. Reconciliação histórica não é pendência de produto da Carteira.

## 15/11/2026 — Diagnóstico local do master e notificação Android de lançamento

- Implementadas as frentes 01 e 02 autorizadas pelo titular; lançamentos em lote (03) continuam fora do escopo.
- Admin: painel **Diagnóstico do sistema**, com cópia do relatório, seleção manual e limpeza. Captura global JS/promises, console, React, toasts do hook compartilhado e erros dos formulários rápidos. Somente sessão master confirmada pela autorização existente no servidor; histórico local separado por perfil, até 100 grupos/7 dias. Não coleta aparelhos de outros usuários nem crash nativo.
- Privacidade: não persiste mensagens livres, payloads, URLs ou stacks completos. Guarda classificação indicativa, origem, tela, build, horários, contagem e referência limitada do bundle. O registro legado `cm_last_boot_error` foi removido e é limpo ao iniciar. Erros anteriores à autorização e falhas tratadas silenciosamente em outros componentes não são cobertos.
- Android: plugin controlado `WalletQuickAccessPlugin`, permissão `POST_NOTIFICATIONS` e controle opcional no Perfil. Notificação silenciosa com **Lançar gasto / Registrar entrada**, oculta na tela bloqueada, sem sobreposição ou interceptação de links. Apenas abre os formulários existentes, sem confirmar lançamentos. Preferência por perfil, cancelamento no logout e descarte de intents de outro perfil.
- Revisão: `usePlatformAccess` vincula o resultado ao perfil verificado. A sessão nativa não depende da identidade de `navigate`; uma revisão independente identificou e confirmou a correção desse risco. Nenhum problema importante adicional encontrado na segunda revisão.
- Agentes: lidos AGENTS.md, skills aplicáveis, definições Impeccable e hooks locais; amostrados autorização/registro de tools e roteamento de intents em `ai/`. As suítes de AI/skills/tools/evals passaram; isso não constitui auditoria completa dos agentes ou do ambiente remoto. O diagnóstico não usa IA nem executa correções automáticas.
- Documentação: `docs/MASTER_DIAGNOSTICS_ANDROID_SHORTCUT.md` e plano em `docs/superpowers/plans/2026-11-15-diagnostics-android-shortcut.md`.
- Testes dedicados: `test:master-tools` (8/8) e teste Python do gerador Android (1/1), incluindo aplicação idempotente do manifest/plugin. TypeScript, build e o quality completo passaram durante a implementação; `test:wallet-visual-next` passou (39/39). Quality contém 10 TODOs preexistentes de inventário de datas de negócio; não foram corrigidos neste escopo. Avisos existentes de bundle/imports mistos permanecem.
- Layout: painel visto no Chrome desktop em prévia isolada com dados fictícios e CSS de produção. Não é validação autenticada, mobile ou em aparelho físico. Testes Java são estáticos; sem JDK/projeto Gradle local, compilação nativa e cold/warm launch, permissões e troca de perfil no dispositivo permanecem pendentes.
- Estado: trabalho local sobre `7be9c31`, sem novo commit, merge, deploy ou publicação de APK. A alteração preexistente deste documento foi preservada. Nenhuma RPC, migration, ledger, regra financeira ou RLS foi alterada.
- Limitação Android: notificações contínuas podem ser dispensadas no Android 14+; sem serviço de primeiro plano e sem inicialização no boot, abrir/autenticar o app restaura a opção habilitada. Antes da release, verificar pacote, assinatura, versão monotônica, commit exato, asset e comportamento no dispositivo.

## 15/11/2026 — Navegação da conta e ações compactas no celular

- O toque em conta da Visão geral agora navega para `contas?conta=<id>` e abre diretamente o detalhe selecionado. A seleção da lista de Contas também usa URL, permitindo voltar à etapa anterior pelo botão nativo ou pelo botão visível. Link direto sem histórico retorna à lista de Contas.
- No detalhe, o retorno mobile foi reduzido a “Voltar”. Registrar despesa e Movimentar permanecem visíveis; Reajustar saldo, Editar, Arquivar e Excluir ficam em “Mais opções” no celular. No desktop, as ações permanecem à vista. Nenhuma operação financeira foi alterada.
- O cartão já usava `cartoes?card=<id>` para focar o cartão escolhido; foi acrescentado retorno visível no contexto de cartão focado, com saída segura para a lista quando não há histórico.
- Testes: `tests/architecture/wallet-detail-navigation.test.mjs` (3/3), navegação nativa e foco do cartão (9/9), `test:wallet-visual-next` (39/39), TypeScript e quality completo. Sem validação em aparelho físico. O layout foi ajustado com base nas capturas fornecidas; não houve inspeção autenticada da nova tela no celular nesta etapa.

## 15/11/2026 — Lançamento rápido: educação, detalhe e expressão monetária

- Incluída a categoria **Educação** no seletor de despesas rápidas. O campo opcional “Observações” passou a “Detalhe da despesa” com exemplo concreto; continua usando o campo `notes` existente, sem migração ou alteração financeira.
- O input da calculadora agora formata cada operando da expressão em pt-BR, mantendo milhar e centavos no segundo, terceiro e demais valores. Colagem de `R$` funciona em quantia simples e expressão. O parser financeiro canônico permanece responsável pelo resultado e pelas rejeições de valores inválidos.
- Testes direcionados: `tests/wallet/wallet-money-input.test.ts` (22/22), incluindo expressão com três valores e colagem de reais. `test:wallet-visual-next` (39/39). Quality completo executado no estado final. Sem validação visual em aparelho físico.

## 15/11/2026 — Correção da digitação por centavos em expressões

- Cada operando digitado no `FinancialCalculatorInput` com `centsEntry` agora desloca os algarismos da direita para a esquerda: `15,00 + 1 → 15,00 + 0,01`, `+10 → +0,10`, `+1015 → +10,15`. O mesmo vale para operadores seguintes e parênteses; a colagem de `R$` continua representando o valor declarado.
- Backspace no final da expressão remove um algarismo do último operando, inclusive pelo teclado Android sem `keydown`. Campos configurados para digitação em reais preservam o modo anterior. O parser financeiro, saldos, faturas, RPCs e dados persistidos não foram alterados.
- Testes: `npm run test:wallet-money-apk` (29/29), `npm run test:wallet-visual-next` (39/39) e `npm run test:quality` concluídos sem falhas. Commit: correção registrada neste commit da `main`. Não houve validação em celular físico nem build release do APK.

## 15/11/2026 — Operadores inseridos dentro de valores monetários

- No `FinancialCalculatorInput` compartilhado, digitar ou tocar um operador dentro de `15,00` após o primeiro algarismo produz `1,00+5,00`. Cada lado do sinal é normalizado como quantia completa, inclusive quando há separador de milhar. O operador no fim preserva a quantia anterior; selecionar o valor inteiro e tocar no operador acrescenta o sinal em vez de apagar o valor.
- A mudança cobre os campos monetários que usam o componente compartilhado. Expressões coladas também exibem cada quantia completa (`1+5,00 → 1,00+5,00`); a digitação por centavos após o sinal, o parser financeiro e a persistência preservam seus contratos.
- Testes: `test:wallet-money-apk` (30/30), `loan-financial-calculator.test.ts` (5/5), `test:wallet-visual-next` (39/39) e `test:quality` concluídos sem falhas. Commit: este registro da `main`. Sem teste em aparelho físico ou novo APK release.

## 15/11/2026 — Janelas suspensas na Carteira (Contas e Cartões)

- Adicionada a variante `variant="wallet"` em `components/ui/Modal.tsx`, mantendo os demais modais do sistema com a aparência padrão intacta. No celular, a janela suspensa mantém margem visível (`p-3`), respeita safe-areas (`env(safe-area-inset-top/bottom/left/right)`), acompanha o teclado via `window.visualViewport`, rola internamente (`data-dialog-body`), mantém cabeçalho e rodapé acessíveis e intercepta primeiro o botão Voltar do Android via `registerDialogBack`.
- Em `components/wallet/AccountActivityPanel.tsx`: as ações **Receita**, **Receber**, **Despesa**, **Pagar**, **Transferir** e **Saldo inicial** passaram a abrir em `Modal variant="wallet"`, preservando rascunhos, validações, prevenção de envio duplicado e `requestId` idempotentes (`transactionRef` e `openingRef`). A confirmação nativa `window.confirm` para exclusão de lançamento manual foi substituída por confirmação em `Modal variant="wallet"`.
- Em `components/wallet/AccountDetailsPage.tsx`: **Editar conta**, **Arquivar conta**, **Excluir conta** e **Reajustar saldo** passaram a usar `Modal variant="wallet"`, mantendo visíveis os botões de navegação, cópia de PIX, cobrança e ações diretas sem ocultar o resumo da conta.
- Em `features/wallet/pages/WalletCardsPage.tsx`: preservados os fluxos que já usam janelas e movida a importação de extrato/fatura (`FlatSmartStatementReader`) para `Modal variant="wallet"`, mantendo navegação, seleção de fatura, cópia e exportação com ação direta.
- Testes executados após a implementação: `npx tsx --test components/ui/Modal.test.tsx tests/wallet/wallet-floating-dialogs.test.ts tests/wallet/wallet-account-manual-void.test.ts utils/dialogNavigation.test.ts tests/wallet/wallet-asset-deletion.test.ts` (16/16), `npm run test:wallet-visual-next` (39/39), `npm run test:financial`, `npm run test:wallet-import-contract` (3/3) e `npm run test:quality` (exit code 0, incluindo `build` e `test:wallet-pages`). Nenhuma RPC, migration, ledger ou RLS foi alterada.
- Limitações: sem validação visual/tátil em aparelho físico e sem compilação/publicação de APK release nesta etapa.

## 16/11/2026 — Cabeçalho compacto da Carteira e conta

- A navegação da Carteira passou a usar quatro opções compactas com toque mínimo de 44 px; o saldo rápido entrou no mesmo bloco, ocupando uma linha própria em telas estreitas e o espaço lateral no desktop. O valor continua vindo do snapshot canônico e respeita a ocultação financeira.
- Em Contas e PIX, o botão Atualizar foi preservado, a descrição redundante foi removida e o detalhe deixou de mostrar o botão Voltar. A URL da conta e o retorno pelo histórico/nativo permanecem ativos, inclusive após arquivar ou excluir.
- Testes direcionados de arquitetura e navegação (28/28), saldo rápido (2/2), `test:wallet-visual-next` (39/39), `test:quality` completo sem falhas e detector de layout Impeccable sem achados. O teste antigo de posição sticky foi atualizado para a nova posição dentro da navegação. Sem validação visual/tátil em aparelho físico ou novo APK release. Commit: este registro da `main`.

## 16/11/2026 — Contas mais próximas da navegação

- O saldo rápido ocupa a área lateral das quatro opções da Carteira no celular; na Visão geral, as quatro opções continuam distribuídas pela largura toda. O saldo segue o snapshot existente e respeita a ocultação financeira.
- Em Contas, removidos o título “Contas e PIX”, o painel de liquidez e capital transferível e o total consolidado repetido no rodapé da lista. A lista de instituições aparece logo após a navegação. Atualizar foi colocado junto das ações da lista; movimentação, transferência do Capital e cobrança PIX permanecem abaixo das contas, com as mesmas condições de acesso e habilitação.
- Em Cartões, removidos o título “Cartões e faturas” e a descrição introdutória. O botão Atualizar permanece disponível.
- Escopo restrito à apresentação: sem alteração de RPCs, migrations, ledger, regras de fatura, pagamento, estorno ou RLS. Base local: `8e219a9`; mudanças ainda sem commit ou merge. Sem validação em aparelho físico ou publicação de APK nesta etapa.
- Validação: TypeScript, `test:wallet-pages` (9/9), `test:wallet-visual-next` (39/39), `test:architecture`, `test:quality` completo e detector de layout Impeccable sem achados. As duas primeiras tentativas do quality apontaram contratos de teste que ainda exigiam o painel removido; as verificações foram atualizadas e a execução final terminou sem falhas.

## 16/11/2026 — Correção de corte horizontal, barra de saldo abaixo da navegação e compactação de ações

- Corrigido o estouro horizontal na barra da Carteira: `WalletModule.tsx` voltou a usar `grid-cols-4` exclusivamente para as 4 abas e moveu `<WalletBalanceDock />` para logo abaixo do `<nav>` (fora da Visão geral), evitando o corte do valor e dos botões à direita no celular.
- Removido o botão de atualizar (`RefreshCw`) do cabeçalho das páginas em `WalletPageFrame.tsx` e do cabeçalho da lista em `WalletAccountsPage.tsx`, eliminando a faixa vazia acima dos cartões e contas.
- Em `AccountCardStack.tsx` ("Suas contas"): o subtítulo agora inicia recolhido e abre/fecha ao tocar no título `Suas contas`. Os botões **Registrar despesa** e **Nova conta** saíram do cabeçalho de `Suas contas` e foram para o painel de ações abaixo da lista em `WalletAccountsPage.tsx`.
- Em `AccountDetailsPage.tsx`: compactados os botões superiores (**Registrar despesa**, **Movimentar**, **Mais opções** e ações secundárias) e protegido o bloco **SALDO** contra corte horizontal (`shrink-0`).
- Em `BankStack.tsx`: compactados os botões **Importar fatura** e **+ Cartão** para não estourarem no celular e removido o rótulo recortado do cartão de trás na pilha.
- Testes executados: `npm run test:wallet-pages` (9/9), `npm run test:wallet-visual-simplification` (11/11), `tests/wallet/wallet-floating-dialogs.test.ts` + `tests/wallet/wallet-payable-split.test.ts` (6/6) e `npm run test:quality` completo (`exit code 0`). Sem alteração de RPCs, migrations, ledger ou RLS. Sem validação em aparelho físico ou publicação de APK nesta etapa.

## 16/11/2026 — Quality Gate completo, compactação da Carteira, Extrato geral e medição de carregamento

- **Cartões, Contas e Visão geral:**
  - Removidos `"Cartões e faturas"` e o subtítulo introdutório em `WalletCardsPage.tsx`; `"Cartões de crédito"` em `BankStack.tsx` passou a abrir/fechar o subtítulo ao toque. Compactados barra de navegação (`WalletModule.tsx`), faixa de saldo (`WalletBalanceDock.tsx`), controles do cartão (`BankStack.tsx`) e espaçamento do extrato.
  - Em `CardInvoiceStatement.tsx`, `INVOICE_OVERRIDE` agora exibe um único rótulo (`Fatura consolidada`) em destaque âmbar separado das compras comuns.
  - Em `WalletAccountsPage.tsx`, removidos os 5 atalhos externos abaixo da lista (mantendo o FAB e botão de criação apenas no estado vazio), movidos `Transferir do Capital` e `Nova conta` para **Mais opções** em `AccountDetailsPage.tsx`, e adicionado o **Extrato geral das contas** (busca, privacidade e navegação para a conta ao tocar).
  - Em `WalletOverviewPage.tsx`, removida a frase `"Até 8 obrigações..."`, compactada a lista de **Compromissos próximos** e removido o `pb-28` duplicado em `WalletModule.tsx`.
- **Recebimentos (destino opcional):** `PaymentManagerModal.tsx` e `InstallmentGrid.tsx` passaram a usar `components/wallet/ReceiptDestinationSelector.tsx` (lista selecionável compacta com ícones, sem parágrafos longos).
- **Medição de carregamento:** criado `features/wallet/services/walletLoadingMetrics.ts` (amostragem em memória limitada a 30 leituras, latência média/pico e taxa de cache `memory`/`offline`), instrumentado em `walletRepository.ts` (`load` e `loadOverview`) e exibido em `AdminDiagnostics.tsx`.
- **Validação final:** `npm run test:wallet-money-apk` (30/30), `npm run test:wallet-loading` (6/6), `npm run test:wallet-visual-next` (39/39), `npm run test:wallet-pages` (9/9), `npm run test:wallet-receipts` (31/31), `npm run test:wallet-settlement` (20/20), `npm run build`, `npm run lint` e `npm run test:quality` completo aprovados (`exit code 0`). Sem alteração em RPCs, migrations, ledger ou RLS. Sem validação em aparelho físico ou publicação de APK nesta etapa.

## 17/11/2026 — Empréstimo financiado por cartão na fatura da Carteira

- **Causa:** `saveLoan` debitava apenas o principal na fonte de capital e gravava `funding_total_payable` no contrato; o vínculo com o cartão da Carteira não criava despesa nem parcelas de fatura.
- **Correção:** commit `a8e23d5` na `main`. A RPC `finalize_card_funded_loan_v1` usa o vínculo exclusivo fonte → cartão, autenticação do master, bloqueio transacional e chave do contrato para criar uma única despesa. A saída do principal e o lançamento no cartão são atômicos; repetição não duplica nenhum dos dois. A Carteira mantém RLS de leitura do novo vínculo contrato → despesa. Há índices nas FKs novas. Contratos com financiamento em débito bancário continuam fora desse fluxo.
- **Caso Deyse:** contrato `2ac454ac-04f0-4c60-bd04-1fbb069857a4` reconciliado no Supabase em 17/11. Saída inicial de R$ 700,00 já existente, sem novo débito na fonte. Cartão Nubank final 4736 recebeu despesa `9f2a023e-bb85-415e-b42d-b955e4c1623b` de R$ 734,93. Limite usado passou de R$ 5.784,24 para R$ 6.519,17; disponível passou de R$ 1.207,06 para R$ 472,13. A fatura de dezembro começa com R$ 73,49; são nove parcelas de R$ 73,49 e a última de R$ 73,52, totalizando R$ 734,93. A fonte permaneceu em R$ 1.016,21.
- **Testes:** `npm run test:quality`, `npm run test:wallet-visual-next`, `npm run test:financial`, `npm run lint` e teste PGlite novo aprovados. A RPC foi ensaiada em transação revertida antes da reconciliação; consulta posterior confirmou valor, parcelas, fatura, limite e ausência de segundo adiantamento. Advisor de saúde sem alertas; advisor de segurança sinaliza o `SECURITY DEFINER` autenticado intencional, com verificação de super admin e titularidade dentro da função. Os índices de FK foram adicionados após o advisor de desempenho.
- **Limitações e pendências:** contrato e parcelas do cliente ainda são criados antes da RPC finalizadora; se a finalização falhar, o contrato fica sem saída de capital e sem cobrança do cartão, e uma nova tentativa com o mesmo ID completa o fluxo. Confirmar a execução do CI no commit publicado e a release Android assinada separadamente; não houve validação em celular físico.

## 18/11/2026 — Padronização de seletores, extrato e apresentação da Carteira e recebimentos

- **Escopo:** criado componente compartilhado `components/ui/SelectOptionList.tsx` para substituir `<select>` nativos por lista expansível padronizada em `LoanFormFinancialSection.tsx` (Fonte de capital) e `AccountActivityPanel.tsx` (Conta de destino e Categoria, mantendo opção personalizada); `accountStatementDomain.ts` padroniza a apresentação curta no extrato para recebimentos de contrato (`Recebimento de {cliente}`), concessões (`Empréstimo · {cliente}`) e transferências de capital (`Capital · {fonte}`), sem alterar registros persistidos; `FinancialCalculatorInput.tsx` exibe `%` em campos de taxa; `ReceiptDestinationSelector.tsx` remove opções “Padrão” e usa botão “Limpar”; `AppShell.tsx` ajusta o espaço inferior mobile da Carteira para `pb-28 md:pb-12` (preservando folga acima da barra inferior e do FAB).
- **Branch e commit:** alterações inicialmente registradas em `codex/wallet-ui-feedback-20261118` (`48cd006`), ainda fora da `main` nessa etapa; sem alteração em RPCs, migrations, ledger, liquidação, saldo histórico ou RLS.
- **Limitações e rollback:** sem validação visual em aparelho físico Android; alterações restritas à camada de apresentação e reversíveis por arquivo.

## 19/11/2026 — Revisão antes da integração da interface da Carteira

- **Pedido:** registrar na produção os arquivos pendentes, excluindo as imagens de `.codex-attachments/`, e identificar trabalho importante em outras branches.
- **Correções da revisão independente:** os valores monetários dos novos seletores respeitam o olho de privacidade; categorias personalizadas são salvas por perfil e não são carregadas sem perfil ativo; Escape e clique fora fecham a lista de opções; o guia de gastos identifica compras parceladas pelo valor original, sem tratá-las como parcela vencida.
- **Imagens:** o commit inicial `48cd006` incluiu seis anexos por engano. A remoção desses arquivos do índice e do diretório local foi preparada para um commit corretivo. A cópia no histórico do commit já publicado continua acessível até uma limpeza de histórico autorizada separadamente; esta etapa não usa `force push`.
- **Contratos afetados:** apenas apresentação e armazenamento local de nomes de categorias. Não houve alteração em RPCs, migrations, ledger, RLS, liquidação ou saldos históricos. O armazenamento legado de categorias sem perfil não é carregado pela nova versão.
- **Rollback:** reverter o commit de interface restaura os seletores anteriores; reverter o commit corretivo restaura as imagens e desfaz as proteções de privacidade, portanto exige revisão do conjunto antes de qualquer reversão. Sem validação em aparelho físico ou APK release nesta etapa.
- **Evidências:** `npm run test:quality` concluído com exit code 0 antes da revisão do PR (inclui build, testes financeiros, arquitetura, Carteira e o novo teste de isolamento/privacidade); `npm run test:wallet-receipts` passou; teste dedicado de categorias e máscara 2/2; `git diff --check` sem erros. Revisor independente em contexto separado identificou os vazamentos e confirmou as correções em leitura de diff; não executou teste visual nem revisão humana no GitHub.
- **Revisão do PR #138:** comentário automático identificou que o campo de categoria personalizada desaparecia ao digitar um prefixo igual a uma categoria existente. A seleção agora usa estado explícito de edição, com teste de sequência `Com → Compras → Compras online`; `test:wallet-visual-next` passou 40/40, TypeScript passou e o revisor independente não encontrou outra regressão concreta. A repetição local de `test:quality` parou por falta de memória virtual do Windows durante o build (esbuild, errno 1455), após os testes anteriores passarem. O quality completo havia passado antes desta correção; o CI do commit final deve validar o conjunto antes da integração. Sem teste em aparelho físico.

## 19/11/2026 — Resultado da integração e publicação

- **Changelog:** `CHANGELOG.md` registra as mudanças da atualização e os caminhos afetados. PR #138 integrado por squash em `aa7bad8`; commit posterior `7a193ec` disparou nova tentativa de deploy sem alterar a árvore de arquivos.
- **Verificação:** os sete checks do PR passaram; `test:quality` completo passou no CI da `main` em `7a193ec`. A árvore da `main` não contém `.codex-attachments/`. O revisor independente examinou as correções da Carteira antes do merge; esta documentação não recebeu validação visual em aparelho físico.
- **Android:** workflow `44464279303` passou no commit `7a193ec` e publicou APK release assinado e SHA-256 em `android-signed-beta` e `android-preview`; pacote `com.socrateslever.capitalflow`, `versionCode 100586`. A workflow verificou assinatura permanente, pacote, versão monotônica e bytes do asset publicado.
- **Web pendente:** Cloudflare Pages passou no preview do PR, mas falhou imediatamente na publicação de produção tanto em `aa7bad8` quanto em `7a193ec`. O site anterior ainda respondeu HTTP 200; isso não comprova a versão nova em produção. É necessário consultar os logs do deploy no painel Cloudflare para diagnosticar a causa. O rollback do código é o revert do squash `aa7bad8` após revisão do diff; a release Android já publicada exige nova versão monotônica para correção, não substituição por APK de assinatura diferente.

## 19/11/2026 — Alerta incorreto de saldo no contrato financiado pelo cartão PicPay

- **Pedido e causa:** investigar o aviso de carteira negativa ao emitir contrato de R$ 500,00 pela fonte PicPay vinculada a cartão. Consulta somente leitura confirmou fonte `CARD` com saldo operacional R$ 0, cartão ativo e crédito disponível R$ 2.062,73 no momento da consulta. O formulário comparava o principal com `fontes.balance` mesmo quando a finalização usa cartão; a RPC existente lança o total financiado no cartão sem debitar o saldo da fonte.
- **Correção local, sem commit:** a condição do aviso de caixa usa a mesma classificação de fonte única financiada por cartão empregada no salvamento. Fonte `CARD`, ou `MISTO` com `CREDIT_CARD`, deixa de exibir aviso de caixa negativo; fontes bancárias continuam com aviso. A RPC mantém a validação de vínculo, cartão ativo e limite suficiente. Sem alteração de dados, migrations, RPCs, ledger ou RLS.
- **Evidências da primeira etapa:** teste direcionado de classificação 5/5; teste PGlite do empréstimo no cartão 6/6; `test:wallet-visual-next` 40/40; `test:quality` completo aprovado (exit code 0, inclui build, testes financeiros e de arquitetura). Revisão independente sem achado bloqueante. Os testes ampliados e a revisão posterior estão registrados abaixo. Sem teste visual em aparelho físico.
- **Rollback e limite da primeira etapa:** reverter os arquivos do formulário, serviço e helper restaura o aviso anterior. Esta etapa inicial atendia ao contrato financiado por uma única fonte de cartão; a interface de múltiplas fontes foi ajustada na revisão abaixo.

## 19/11/2026 — Revisão do vínculo fonte PicPay → cartão no contrato

- **Inspeção somente leitura:** PicPay permanece com uma fonte `CARD` de saldo operacional R$ 0 e exatamente um cartão ativo vinculado, com crédito disponível R$ 2.062,73 na consulta. Para o exemplo da tela (total financiado R$ 524,95), o crédito consultado é suficiente; a RPC é a autoridade final e confere vínculo, status e limite sob bloqueio transacional.
- **Erros corrigidos localmente, sem commit:** o formulário não oferece débito em conta para fonte exclusivamente `CARD`, corrige o texto que dizia que o cartão não consumiria limite, distingue falta de vínculo, múltiplos vínculos e indisponibilidade do crédito, e deixa de somar vínculos múltiplos como crédito utilizável. O serviço confere vínculo e limite antes de inserir novo contrato de fonte única financiada por cartão; contratos já gravados preservam a tentativa idempotente da RPC. A interface deixa de oferecer composição por várias fontes, que o serviço já bloqueava antes de gravar; a validação do formulário informa isso antes da confirmação de caixa.
- **Proteção financeira:** nenhuma escrita no PicPay, em saldos ou contratos históricos. Sem alteração em RPCs, migrations, ledger, RLS, pagamentos ou estornos. A RPC continua rejeitando mudança concorrente de limite após a consulta inicial.
- **Rollback:** reverter as mudanças desta branch no formulário, validações, serviço, helper e testes restaura a interface anterior. A composição por várias fontes permanece indisponível no serviço independentemente deste ajuste de apresentação.
- **Evidências:** teste direcionado de contrato e vínculo 8/8; revisão independente combinada dos testes direcionados 13/13; `test:financial` aprovado; `test:wallet-visual-next` 40/40; teste de calculadora e apresentação 5/5; TypeScript aprovado; `test:quality` completo aprovado (exit code 0, incluindo build, testes financeiros, Carteira e arquitetura). Revisão independente final sem regressão concreta no fluxo ativo e `git diff --check` aprovado. Sem validação visual em aparelho físico.

## 19/11/2026 — Publicação na `main` (`18d91d1`) e sincronização entre páginas/funções

- **Commit publicado em `origin/main`:** `18d91d12f10470f5add1d0287bf5a0d0e2fdefdc` (`18d91d1`), integrando as correções de vínculo/validação prévia do cartão (PicPay) e o barramento central de sincronização `utils/appSyncEvents.ts`.
- **Conexões adicionadas:** `useLoanController.ts` (emissão de contrato), `NewAporteModal.tsx` (aporte), `CapitalSourceTransferModal.tsx` (transferência Capital ↔ Carteira), `SourceWalletReferencePanel.tsx` (vínculo de origens) e os modais da Carteira (`QuickExpenseModal`, `QuickIncomeModal`, `AccountActivityPanel`, `AccountMovementModal`, `CardEditModal`) agora propagam `capitalflow:wallet-updated`, `capitalflow:sync-requested` e `capitalflow:source-origins-updated` de forma consistente; `LoanFormFinancialSection.tsx` também ajusta `fundingPaymentMethod` ao alternar entre fonte `CARD` e conta bancária.
- **Testes e limpeza:** `tests/architecture/app-sync-connections.test.ts` (2/2), `npm run test:quality` completo (`exit code 0`) e `git diff --check`; `.codex-attachments/` e `.impeccable/config.json` excluídos do commit e limpos do working tree. `CHANGELOG.md` atualizado com a entrada correspondente. Sem validação visual em aparelho físico; migration `20261117150000_card_funded_loan_no_account_debit.sql` permanece pendente de `supabase db push` no ambiente remoto.

## 19/11/2026 — Clareza sobre conferência e lançamentos antigos de fatura

- **Causa esclarecida:** a conferência de valores do emissor grava uma referência em `personal_wallet_card_invoice_facts`; isso não cria compra nem altera o total da lista. Em cartões com histórico, para corrigir o total consolidado da fatura, o fluxo é **Ajustar fatura**. O mês selecionado e a data de vencimento agora são validados no formulário para impedir gravação com meses incompatíveis. A UI distingue uma referência salva de uma posição inicial realmente aplicada.
- **Lançamentos antigos e cartão escolhido:** ao lançar pela pilha ou pela fatura do cartão selecionado, o cartão fica fixo no formulário; o lançamento global ainda permite escolher o cartão. A mensagem de ciclo fechado/vencido não recomenda a próxima fatura quando a data antiga da compra pertence ao ciclo selecionado. A ação explícita foi renomeada para “Selecionar próxima fatura”.
- **Apresentação:** textos de contexto deixam de repetir o ano ao lado de campos de data; a conferência explica sua finalidade e limites.
- **Validação:** `npm run test:quality` terminou com exit code 0, incluindo `npm run build`; `npm run test:wallet-visual-next` (39/39), `npm run test:wallet-money-apk` (30/30), `npm run test:wallet-pages` (11/11), testes direcionados de ciclo/conferência (36/36), e `tests/architecture/wallet-expense-sheet-navigation.test.mjs` (4/4). `git diff --check` sem erros. Revisão independente pendente; diff revisado localmente.
- **Limites e rollback:** sem consultas ou escritas de dados no Supabase nesta etapa; nenhuma RPC, migration, ledger, liquidação, pagamento, estorno ou RLS foi alterada. Sem teste visual em navegador/aparelho físico ou publicação. Mudanças ainda não commitadas, na branch `codex/wallet-invoice-purpose-ux-20261119`; rollback é reversível por revert dos arquivos de UI/testes, sem migração de dados. Alterações preexistentes em `package-lock.json` e `CardEditModal.tsx` foram preservadas e não fazem parte deste escopo.

## 19/11/2026 — Destino padrão de novos lançamentos de cartão e parcelamentos com data antiga

- **Causa confirmada no fluxo:**
  1. `getCardCreditPosition` usa o primeiro ciclo com saldo como ciclo ativo para preservar o saldo em aberto, e `WalletCardsPage` reutilizava esse mês antigo como fatura selecionada e destino inicial do formulário.
  2. Em `QuickExpenseModal.tsx`, `resolveFirstInstallmentMonthLabel` calculava `getPurchaseInvoiceMonth(expenseDate, ...)` usando a data histórica da compra (`expenseDate`, ex.: `2026-03-29`) sempre que o modal era aberto sem `initialDueMonth` (como pelo botão flutuante `+`), quando `initialDueMonth` herdado era antigo, ou quando faltava `closing_day`/`due_day`, fazendo compras/parcelamentos antigos caírem em faturas passadas (ex.: maio/agosto) em vez da fatura aberta atual.
  3. Em `minhasFinancasWalletTools.ts`, `checkClosedOrPaidInvoiceWarning` havia recebido uma exceção que ocultava o alerta quando `purchaseDate < today` coincidia com a fatura antiga da data da compra, e `stepInvoiceMonth(normalizedMonth, 1)` sugeria apenas `mês + 1` (ainda no passado) em vez da fatura aberta atual.
- **Correção:**
  - `QuickExpenseModal.tsx` e `QuickWalletActionsModal.tsx` agora ancoram o cálculo padrão da fatura na **fatura aberta atual** (`effectiveCycleDate = expenseDate > today ? expenseDate : today` via `getPurchaseInvoiceMonth`), preservando a `Data da Compra` histórica no registro mas iniciando o lançamento/parcelas na fatura aberta vigente para o fechamento/vencimento daquele cartão (ex.: aberta em novembro com vencimento em dezembro para `fechamento 24 / vencimento 03`), bloqueando herança automática de `initialDueMonth` anterior à fatura aberta atual.
  - `checkClosedOrPaidInvoiceWarning` volta a alertar qualquer fatura fechada/vencida/paga mesmo para compras com data antiga e direciona o botão `"Selecionar próxima fatura"` diretamente para a fatura aberta atual (`currentOpenDueMonth`).
  - `resolveInvoiceMonthSelection` prioriza o ciclo da fatura aberta atual ou próximo ciclo ativo (`>= anchorMonth`) antes de recuar para faturas vencidas antigas.
  - `CardEditModal.tsx`: corrigido o alinhamento horizontal da linha `Limite total` / `Fechamento (dia)` / `Vencimento (dia)` e foco visual dos campos.
  - `cardInvoiceSummary.ts` e `FlatSmartStatementReader.tsx`: incluídos `Bradesco`, `PicPay`, `Santander`, `Banco do Brasil`, `Inter` e `Caixa` no detector de faturas, priorizando linhas de cabeçalho sobre linhas de transações (`DD/MM`) para impedir falsos positivos quando houver compras em `"Mercado Pago"` ou `"RecargaPay"` dentro da fatura, e diferenciada a mensagem de divergência de banco vs. final de 4 dígitos.
  - Removidos todos os diálogos nativos do navegador (`window.confirm`) na Carteira (`FlatSmartStatementReader.tsx`, `WalletStatementImport.tsx`, `WalletCapitalLinks.tsx` e `CapitalSourceTransferModal.tsx`), substituídos por cartões de confirmação internos (`role="alertdialog"`) na própria interface.
  - `index.css` e `index.html`: aplicado `color-scheme: dark` e contraste claro (`filter: brightness(0) invert(1)`) em `::-webkit-calendar-picker-indicator` para todos os campos nativos de data/mês/hora (`date`, `month`, `datetime-local`, `time`).
  - `hooks/useAppNotifications.ts`: removido o gatilho Realtime de `UPDATE` em `public.parcelas` que disparava `"Ação jurídica pendente"` usando o estado antigo em memória no momento da baixa/pagamento da parcela, e adicionada revogação automática de alertas vinculados a contratos já quitados/arquivados (`PAID`/`QUITADO`/`ENCERRADO`). As notificações residuais de `"Ação jurídica pendente"` de contratos quitados (como Erlivane da Silva Correa) foram marcadas como lidas no Supabase (`public.notificacoes`).
- **Validação:** `npm run build` (exit 0); `npm run test:wallet-visual-next` (39/39); `npm run test:wallet-pages` (11/11); testes de ciclo/conferência e parcelamento; teste de navegação do formulário; `git diff --check` sem erros.
- **Aplicação e verificação no Supabase (`hzchchbxkhryextaymkn`):**
  - Atualizada a função `private.wallet_card_first_due_date(uuid, date, date)` diretamente no banco remoto (e versionada em `supabase/migrations/20261119205000_wallet_card_open_cycle_default.sql`) para calcular a fatura aberta atual (`v_reference_date := greatest(p_expense_date, (now() AT TIME ZONE 'America/Manaus')::date)`) conforme `closing_day` e `due_day` do cartão, impedindo que lançamentos com data de compra no passado recuem para faturas anteriores à fatura aberta vigente.
  - Atualizado `opening_invoice_month = '2026-12-01'` no cartão Bradesco (`210b85f8-359e-477e-b988-0a21f4cb7735`, `closing_day = 24, due_day = 3`) e validada a função no banco com datas históricas (`2025-12-31`, `2026-03-29`), confirmando retorno `2026-12-01`.
- **Limites:** sem validação visual em aparelho físico nesta etapa. Rollback reversível pela restauração da função `private.wallet_card_first_due_date` e revert dos arquivos de UI/teste.

## 19/11/2026 — Importação de fatura Bradesco

- **Pedido:** buscar lançamentos na tela de importação e interpretar a estrutura tabular do PDF, mantendo o parcelamento como metadado separado do nome da dívida.
- **Análise/correção:** o PDF informa data, histórico, moeda de origem, conversão e total em colunas distintas. O parser Bradesco agrupa linhas por posição das colunas, recupera histórico quebrado em mais de uma linha, retira valores de conversão do nome e separa `n/m` em metadados de parcela. Ano ausente nas datas é inferido pela data de referência do extrato e pela sequência dos lançamentos; por exemplo, a compra Shopfacil de 31/12 foi lida como 31/12/2025, R$ 242,72, parcela 11/18.
- **Interface:** campo de busca filtra por descrição, data, valor, categoria ou parcela; nome e badge de parcelamento permanecem separados.
- **Validação:** `npm run build`, `npm run test:quality`, `npm run test:wallet-visual-next` (39/39), 14 testes de parser/leitor, 3 testes de contrato de importação e 5 testes de arquitetura da tela aprovados. `git diff --check` sem erros.
- **Limites/rollback:** nenhuma RPC, migration ou dado do Supabase foi alterado nesta tarefa. Alterações locais reversíveis nos arquivos de parser, tela e testes. Não houve publicação nem validação visual no navegador/aparelho.

## 19/11/2026 — Liberação geral da Minha Carteira e remoção da leitura de faturas por IA

- **Pedido:** liberar a Minha Carteira para todos os usuários autenticados do sistema e remover a leitura de faturas/imagens via IA (mantendo leitura 100% local de OFX e PDF com texto).
- **Supabase (`hzchchbxkhryextaymkn`, migration `20261119220000_open_personal_wallet_to_all_users.sql`):**
  - Criada a função `public.can_access_personal_wallet()` (valida `auth.uid() IS NOT NULL` e ausência de bloqueio explícito `ativo = false` em `user_modulos` para `modulo_chave = 'carteira'`).
  - Atualizadas as 18 policies RLS das tabelas `personal_wallet_*`, `loan_card_wallet_charges` e `payment_charges` (wallet) e as 55 funções/RPCs da Carteira para usar `public.can_access_personal_wallet()`, preservando integralmente o isolamento por `owner_user_id = auth.uid()` / `user_id = auth.uid()`.
  - `personal_wallet_ensure_default_cash_account()` passou a garantir o registro inicial em `user_modulos` e `capital_source_wallet_origin_access` para novos usuários.
  - `platform_admin_*`, `ai_assistant_requests`, `feature_registry`, `platform_support_sessions`, `profile_feature_access` e as funções históricas de reconciliação permanecem estritamente restritas a `public.is_platform_super_admin()`.
- **Frontend:**
  - `App.tsx`, `hooks/useWalletPreload.ts` e `features/wallet/services/walletRepository.ts`: `MY_WALLET` liberada na navegação, rota `/carteira` e pré-carregamento para todos os usuários autenticados; `PLATFORM_ADMIN` permanece restrita a `isPlatformSuperAdmin`.
  - `PaymentManagerModal.tsx`, `InstallmentGrid.tsx`, `ModalGroups.tsx`, `CapitalSourceTransferModal.tsx`, `WalletAccountsPage.tsx` e `SourcesPage.tsx`: roteamento opcional de recebimentos/saques e transferência de Capital para contas da Carteira liberados para todos os titulares autenticados, mantendo seleção opcional para não bloquear quem ainda não cadastrou conta.
  - `FlatSmartStatementReader.tsx`, `WalletStatementImport.tsx` e `utils/statementSmartReader.ts`: removidos os botões e o envio de PDF/imagens para Google Gemini; o leitor opera 100% localmente para OFX e PDF com texto (com suporte a senha local).
  - `pages/ProfilePage.tsx`, `features/profile/components/ProfileChangelog.tsx`, `src/constants/changelog.ts` e `src/constants/version.ts`: adicionada a seção **Atualizações** no Perfil com histórico estruturado por versão (`v3.5.0`, `v3.4.0`, `v3.3.0`) e filtros por tipo (`Todas`, `Novidades`, `Melhorias`, `Correções`).
  - `services/localDiagnostics.ts` e `components/system/AdminDiagnostics.tsx`: ampliada a captura segura de frames internos (também no ambiente local de desenvolvimento, removendo query strings e rejeitando domínios externos), adicionados `errorType` por allowlist segura e categorias `Renderização` / `Servidor de dados`, além de redesenho do painel com cards de resumo, filtros por origem e botão **Baixar JSON**.
- **Limites/rollback:** sem validação visual em aparelho físico nesta etapa. Rollback reversível restaurando a verificação `is_platform_super_admin()` na migration/frontend se necessário.

## 19/11/2026 — Comparação do total apurado na importação de fatura

- **Problema:** a tela mostrava apenas a soma dos itens selecionados. O total da fatura Bradesco aparecia como não identificado quando o PDF separava `Total da Fatura em Real` e o valor por vários elementos da tabela.
- **Correção:** a importação agora soma compras positivas de todas as linhas lidas, sem depender de busca ou seleção, mostra o valor declarado no PDF e a diferença `fatura − apurado`. O rodapé mantém separado o total selecionado para importar. Valores inválidos suspendem a comparação até serem corrigidos. O resumo Bradesco busca o valor após o rótulo tabular e `PAGTO ANTECIPADO PIX` é reconhecido como pagamento, não compra.
- **PDF verificado:** 91 linhas extraídas; 90 compras apuradas totalizam R$ 3.102,88; o documento informa R$ 2.930,88; diferença de −R$ 172,00 (a fatura está R$ 172,00 abaixo da soma apurada). A divergência é exibida para conferência, sem correção automática de valores.
- **Validação:** `npm run test:quality` (exit 0, incluindo build), `npm run test:wallet-visual-next` (39/39), testes direcionados do parser/resumo (23/23) e arquitetura da tela (6/6). Revisor independente não encontrou bloqueadores; a sugestão sobre valores não finitos foi tratada. `git diff --check` sem erros.
- **Limites/rollback:** sem alteração em RPC, migration, RLS, dados ou total contábil no Supabase. Mudança local na apresentação e leitura do documento; não publicada. Sem validação visual em navegador ou aparelho físico.

## 19/11/2026 — Sugestão de limite cadastrado na conferência de fatura

- **Problema:** o limite total informado no cadastro do cartão aparecia no cartão, mas a conferência da fatura importada mostrava “Não informado” quando o PDF não continha esse dado.
- **Correção:** os fluxos de importação passam o limite do cartão para a conferência. Se o PDF não declarar limite, o campo recebe o valor cadastrado como sugestão, sem mensagem adicional na interface; um limite explícito do PDF prevalece. O valor só é persistido pela ação existente de salvar a conferência.
- **Validação:** `npx tsx --test tests/wallet/card-invoice-summary.test.ts` (12/12); `npm run build` (exit 0); `git diff --check` sem erros. `npm run test:quality` permanece com falha em contratos de consentimento/leitura de IA (`tests/wallet/wallet-statement-import-regression.test.ts` e `tests/architecture/wallet-import-contract.test.mjs`), fora da propagação do limite; não declarar o gate completo aprovado.
- **Limites/rollback:** nenhuma alteração em Supabase, migration, RPC ou dado financeiro. Alteração local reversível nos componentes/utilitários de conferência e testes; não publicada. Sem validação visual em aparelho físico.

## 19/11/2026 — Disponível estimado na conferência da fatura

- **Pedido e aceite:** calcular o crédito restante usando o limite cadastrado menos a fatura atual e as parcelas futuras já registradas na Carteira. O valor aparece como estimativa própria, nunca como campo declarado pelo emissor nem como dado a salvar na conferência.
- **Implementação:** os leitores de PDF recebem a posição de crédito canônica (`getCardCreditPosition`). A prévia verifica em centavos que `limite − comprometido = disponível` e mostra limite utilizado estimado, parcelas futuras registradas e disponível, mesmo se o PDF não trouxer data de vencimento. Linhas do PDF ainda não importadas são excluídas e indicadas.
- **Interpretação do PDF Bradesco:** o documento informa o total da fatura e o número/valor da parcela atual, mas não declara um total explícito de todas as parcelas restantes. Por isso a estimativa usa os compromissos já cadastrados no cartão, sem multiplicar valores mensais do PDF e arriscar incluir juros ou arredondamentos incorretos.
- **Exemplo validado:** limite de R$ 10.000,00 e compromissos de R$ 7.316,49 resultam em disponível estimado de R$ 2.683,51. O limite utilizado e o disponível estimado não são gravados como valores informados pelo banco.
- **Validação:** posição financeira em centavos (teste específico: R$ 7.316,49 / R$ 2.683,51); testes direcionados (17/17); contrato de importação (4/4); `npm run test:wallet-visual-next` (39/39); `npm run build` concluído com exit 0. Na última execução, `npm run test:quality` parou no `test:ui-copy` por texto técnico já presente em `components/system/AdminDiagnostics.tsx:37` (“Banco ou RPC”), fora do escopo desta mudança. `git diff --check` nos arquivos desta mudança sem erros; a verificação global reporta espaços finais preexistentes em `src/constants/version.ts`, fora do escopo. Hook Impeccable sem problemas determinísticos. Sem validação visual em navegador ou aparelho físico.
- **Limites/rollback:** alteração reversível apenas de apresentação e passagem de dados; sem Supabase, migrations, RPCs ou mutações de faturas. Não publicada. A estimativa não inclui itens que estejam somente no PDF e ainda não tenham sido importados.

## 19/11/2026 - Classificação local de comerciantes na importação de extratos

- **Pedido:** identificar automaticamente descrições de transporte (Uber, 99, combustível/postos, Eucatur e Transamazônica), alimentação (iFood, 99Food, lanches, churrascarias e restaurantes) e outras categorias conhecidas.
- **Implementação:** `classifyStatementDescription` tornou-se a regra única para PDF, OFX e normalização de linhas lidas por IA. Regras locais dão precedência quando reconhecem o comerciante; uma categoria já oferecida pelo leitor é mantida somente quando a descrição não é reconhecida. Incluídos também os aliases de saúde, contas da casa, lazer, educação, serviços e compras.
- **Ambiguidade e privacidade:** ?Mercado Pago? e ?RecargaPay? sem ramo reconhecível ficam em ?Outros?; `Posto de Saúde` permanece em Saúde. Nenhuma descrição ou valor é consultado/enviado pela internet: desconhecidos continuam para revisão manual, e nenhuma categoria cria ou confirma lançamento financeiro.
- **Validação:** `npm run test:wallet-statement-import` (64/64); `npm run test:quality` (exit 0, incluindo `npm run build` e `npm run test:wallet-visual-next`); `git diff --check` nos arquivos desta tarefa sem erros. Revisão independente sem bloqueadores.
- **Limites/rollback:** regras determinísticas baseadas no texto impresso pelo emissor podem deixar novos descritores em ?Outros? ou confundir descritores ambíguos. Correção reversível nos leitores e testes, sem alteração de Supabase, migrations, RPC, ledger ou dados. Sem publicação ou validação visual em aparelho físico.

## 19/11/2026 - Seletor de categoria compacto na importação

- **Pedido e decisão visual:** reduzir o seletor de categoria dos itens importados, que ocupava a largura inteira do cartão. A aplicação de Impeccable para a superfície Operate favoreceu densidade e hierarquia estáveis: o lançamento permanece principal e a categoria um controle secundário.
- **Implementação:** `WalletStatementImport` e `FlatSmartStatementReader` limitam o seletor a 16rem a partir do breakpoint sm; em telas estreitas ele conserva a largura flexível disponível.
- **Validação:** Impeccable layout detect sem achados e `git diff --check` sem erros nos dois componentes. Não foi aberto um navegador/aparelho para validar a renderização; sem testes de comportamento, Supabase ou publicação nesta alteração visual.
- **Rollback:** reversãvel restaurando as classes anteriores dos dois seletores.

## 19/11/2026 - Resposta imediata ao excluir item do extrato importado

- **Problema:** a confirmação de exclusão mantinha o modal bloqueado durante `refresh()`, que consulta e reconcilia o snapshot completo da Carteira após o RPC já ter concluído a operação.
- **Ajuste:** depois da confirmação do servidor, as linhas removidas são ocultadas no estado local e o modal fecha sem aguardar a atualização completa. A atualização continua em segundo plano; falhas mantêm os itens selecionados no modal e exibem a mensagem para nova tentativa. Se a sincronização posterior falhar, a UI informa que a lista pode estar desatualizada.
- **Validação:** revisão estática do fluxo e `git diff --check`. Não executei testes automatizados nem medi o tempo do RPC real nesta etapa; nenhuma RPC, migration, ledger ou dado foi alterado.
- **Limite/rollback:** a espera ainda depende do tempo de resposta do RPC de exclusão/cancelamento; o ganho remove a leitura adicional do caminho bloqueante. Reversível no fluxo da página de cartões.

## 19/11/2026 - Reimportação de compra de cartão já existente

- **Pedido e aceite:** itens apagados não devem continuar bloqueando a leitura/importação; se houver uma compra exata ativa, a nova importação deve substituir o registro para o ciclo escolhido, sem duplicar lançamentos. Compras repetidas em linhas diferentes do mesmo arquivo continuam distintas.
- **Implementação:** leitores e conferência atual ignoram linhas de extrato ligadas a despesas canceladas. No servidor, a origem exata de outro arquivo é reapontada para o novo documento. Compra única, pendente, não paga e fora de posição inicial é cancelada com histórico preservado e recriada no ciclo selecionado; a linha já importada do mesmo documento permanece idempotente. Mais de uma parcela, pagamento ou posição inicial interrompe a substituição. Linhas idênticas separadas do arquivo consomem origens distintas.
- **Supabase:** schema/RLS de `personal_wallet_statement_rows`, `personal_wallet_expenses` e cartão foram conferidos; advisories de health/performance sem achados nessas tabelas. Migrations aplicadas em `hzchchbxkhryextaymkn`: `20261120000927_wallet_reuse_exact_statement_imports`, `20261120001530_wallet_reimport_card_purchase_in_selected_cycle`, `20261120001804_wallet_reimport_purchase_fresh_request_id` e `20261120002010_wallet_reimport_only_pending_purchase`. RPC final confirmado como executável por `authenticated`, com chave nova para a despesa substituta e guarda de status pendente.
- **Validação:** `git diff --check` sem erros nos arquivos desta alteração; migrations executadas e assinatura/grants conferidos no Supabase. Testes automatizados não executados nesta etapa; nenhuma validação visual ou publicação do frontend. A revisão independente encontrou e motivou correções para compras repetidas, ciclo pela data de vencimento, unicidade do `request_id` e estado pendente; parecer final sem bloqueadores.
- **Riscos/limites:** o advisor de segurança do Supabase sinaliza a RPC como `SECURITY DEFINER`; ela valida sessão, acesso à Carteira e propriedade do cartão, e as consultas/mutações são sempre escopadas pelo usuário autenticado. A substituição gera cancelamento histórico e nova compra somente no ciclo selecionado; itens pagos/parcelados/iniciais exigem ajuste manual. As migrations locais anteriores de 19/11 permanecem pendentes no projeto remoto e não foram aplicadas neste escopo.

## 19/11/2026 - Total do banco na fatura do cartão

- **Problema:** o cabeçalho da fatura mostrava apenas a soma das compras registradas, mesmo havendo um total da fatura confirmado pelo banco.
- **Ajuste:** quando existe uma conferência salva para o mesmo cartão e ciclo, o total do banco passa a aparecer como total principal da fatura; a soma integral das parcelas não canceladas e a diferença em centavos também são exibidas. Consolidações não contam como compras. Sem conferência salva, continua aparecendo o saldo em aberto e a ação existente para informar os valores do emissor. Nenhum fato do banco é somado às compras nem altera saldo/limite.
- **Validação:** `git diff --check` e revisão estática do caminho de seleção por cartão/ciclo; testes automatizados não executados nesta etapa. Sem deploy ou validação visual em navegador/dispositivo.
- **Limite/rollback:** diferença entre fatura bancária e compras continua sendo apenas uma comparação de leitura; importação ou liquidação não é criada automaticamente. Reversível restaurando o valor do ciclo no cabeçalho.

## 19/11/2026 - Remover repetição do extrato importado

- **Problema:** a página repetia cada compra já vinculada, apesar de elas aparecerem no extrato da fatura; excluir pela cópia também cancelava a compra.
- **Ajuste:** a seção agora mantém somente o resumo do PDF e a contagem/total importado. A lista detalhada aparece apenas para linhas sem compra vinculada, que podem ser excluídas como referências sem alterar a fatura. Compras vinculadas são geridas no extrato principal, em um único lugar.
- **Validação:** revisão estática do fluxo e isolamento de exclusão às linhas sem vínculo; `git diff --check` sem erros. Testes automatizados e validação visual não executados.
- **Limite/rollback:** a estrutura de referências de importação é preservada; reversível restaurando a listagem completa.

## 19/11/2026 - Centralizar janela de ajuste de fatura no celular

- **Problema:** o modal de ajuste da fatura ficava alinhado ao rodapé em telas estreitas, obrigando o usuário a rolar a tela para chegar aos campos.
- **Ajuste:** o painel agora é centralizado em todas as larguras, respeita as safe areas e limita a altura; quando o formulário excede o espaço disponível, a rolagem acontece dentro do modal.
- **Validação:** revisão estática das classes de posicionamento e `git diff --check`; testes automatizados e validação visual em navegador/aparelho não executados. O navegador conectado não permitiu identificar a URL para reprodução.
- **Limite/rollback:** mudança somente de apresentação; reversível restaurando as classes anteriores em `InvoiceOverrideModal.tsx`.

## 19/11/2026 - Corrigir deslocamento do modal de ajuste de fatura

- **Evidência e causa:** no vídeo enviado, a janela aparece centralizada e depois desce junto com a rolagem da Carteira. As classes de centralização atuavam dentro do contêiner transformado/rolável da página, em vez de usar o viewport.
- **Ajuste:** renderizar o diálogo em um portal diretamente em `document.body`. O painel continua centralizado e com rolagem interna, mas deixa de herdar o contexto de posicionamento do cartão/página.
- **Aceite:** ao rolar a Carteira com o modal aberto, o modal permanece no centro visível da tela; conteúdo alto continua rolável dentro do painel.
- **Validação:** inspeção da gravação antes da correção e revisão estática do ponto de renderização; sem renderização pós-correção nem testes automatizados nesta etapa.
- **Revisao independente:** parecer favoravel ao portal para o problema de posicionamento, sem bloqueios. Acessibilidade de foco e contencao da rolagem do fundo permanecem limitacoes preexistentes fora deste reparo.
- **Limite/rollback:** mudança apenas de renderização, reversível retornando a renderização inline em `InvoiceOverrideModal.tsx`.

## 19/11/2026 - Recursos de conferencia bancaria no ajuste da fatura

- **Pedido/aceite:** a janela Ajustar fatura precisava oferecer os mesmos dados do banco disponiveis em Conferir fatura do banco, sem duplicar valor da fatura e vencimento nem misturar referencia do emissor com operacao financeira.
- **Ajuste:** incluido no mesmo modal o formulario existente de conferencia: limite total/utilizado, pagamento minimo, disponivel informado e parcelas futuras. Valor da fatura e vencimento sao controles unicos compartilhados com o ajuste. A disponibilidade calculada aparece como `limite total - limite utilizado`, mantendo separada a disponibilidade informada pelo banco.
- **Gravacao:** Salvar valores do banco usa `saveCardInvoiceFacts` e preserva o comportamento de referencia; Salvar correcao mantem os fluxos existentes de ajuste/ledger. Nao houve alteracao em RPC, migration, liquidacao ou regras de fatura.
- **Revisao independente:** sem bloqueios; confirmou formularios separados, campos compartilhados e chamada explicita a `saveCardInvoiceFacts`. As ressalvas de ciclo vazio e modo durante salvamento foram tratadas desabilitando a acao/campos correspondentes.
- **Validacao:** revisao estatica de formularios independentes, ciclo passado ao salvamento e sincronizacao dos dois campos compartilhados; `git diff --check` sem erros nos arquivos alterados. Testes automatizados e renderizacao visual nao executados nesta etapa.
- **Risco/rollback:** os dois salvamentos sao explicitos e separados para evitar gravar referencia como compra/pagamento. Reversivel removendo a secao de conferencia do modal e as propriedades compartilhadas.

## 23/11/2026 — hierarquia do cabeçalho de composição de empréstimo

- **Alteração:** em `components/cards/LoanCardComposition/Header.tsx`, identificador e resumo do empréstimo ficam numa faixa; o valor em destaque fica alinhado em coluna própria; ao expandir, Capital, Encargos e Original aparecem em blocos legíveis.
- **Invariantes:** somente apresentação. Não altera fórmulas, parcelas, juros, persistência ou dados financeiros.
- **Validação:** revisão do diff, `git diff --check` e gates do projeto após combinar com a correção do PWA; teste visual manual em dispositivo não realizado.
- **Rollback:** reverter o commit de apresentação e seus registros de changelog.

## 23/11/2026 — PWA: falha de cache não deve bloquear páginas

- **Sintoma investigado:** erro genérico ao carregar determinadas páginas, incluindo Administração, compatível com falha de importação dinâmica de chunk.
- **Causa no código:** a estratégia `immutable-assets` do service worker propagava erros de `CacheStorage.match`, `open` e `put`. Se o armazenamento local falhasse (por exemplo, quota), uma resposta de rede válida não chegava ao navegador.
- **Correção:** falhas ao consultar ou gravar cache são tratadas como falha de otimização; o service worker tenta a rede e devolve a resposta sem exigir que o cache funcione. Escopo restrito aos assets estáticos imutáveis.
- **Cobertura e evidência:** teste de regressão reproduz quota excedida ao gravar o chunk da Administração e erro ao ler CacheStorage. `npm run test:wallet-pwa-legal` (7/7), `npm run build`, `npm run test:quality`, `npm run test:wallet-visual-next` (62/62), inspeção local dos 73 assets JS/CSS (200), revisão independente e `git diff --check` passaram.
- **Limitações:** não houve inspeção do PWA instalado, diagnóstico de sessão real do usuário nem teste visual em aparelho. A correção elimina o bloqueio causado por falha do CacheStorage, mas não confirma por si só que esse foi o evento observado em produção. Build reportou avisos preexistentes de imports e chunks grandes.
- **Escopo/rollback:** frontend e teste; sem mudanças de navegação, API, dados, Supabase ou domínio financeiro. Reversão localizada em `public/service-worker.js` e no teste de arquitetura.

## 25/11/2026 — Aplicação das migrations da Carteira no Supabase

- **Aplicadas em produção** (pelo SQL Editor, em transação, com registro em `supabase_migrations.schema_migrations`): `20261124120000_wallet_purchase_date_invoice_routing`, `20261124150000_wallet_edit_expense_preserve_installments` e `20261125090000_card_funded_loan_uses_start_date`.
- **Pré-condições conferidas:** a base remota de `wallet_card_first_due_date` era a versão de 19/11 (com `opening_invoice_state`); `finalize_card_funded_loan_v1` remoto tinha o mesmo tamanho de corpo da versão de 22/11, que é a base da nova; `contratos.start_date` existe.
- **Pós-condições conferidas:** as três versões estão registradas; `private.*` sem execução para `anon`/`authenticated`; RPCs públicas só para `authenticated`; teste do ciclo com cartão fictício confirma o fechamento exclusivo. Nenhum dado alterado.
- **Pendências:** migrations locais de 17/11 (`card_funded_loan_no_account_debit`) e 19/11 (`open_personal_wallet_to_all_users`, `wallet_allow_same_document_repeated_rows`) não constam no histórico remoto com essas versões; não foram aplicadas nem avaliadas aqui. A troca de `start_date` em um contrato já finalizado não move a compra já criada no cartão.

## 26/11/2026 — Plano de correções e paridade de ciclo; skills alinhadas

- **Plano:** `docs/PLANO_CARTEIRA_PARIDADE.md`, em três fases (erros, ciclo do cartão, ferramentas), com aceite, testes, autorização e ordem de cada item. Nada foi implementado.
- **Erros encontrados na comparação (sem correção ainda):** o restante da fatura levado à próxima e a antecipação de parcelas são compostos no cliente por várias chamadas separadas (`WalletCardsPage.tsx`); uma falha no meio deixa o dado pela metade.
- **Skills/agentes alinhados:** `capitalflow-execution-safety` (commit direto na main como padrão do proprietário, atomicidade, procedimento de migration, repositório público), `capitalflow-wallet-ux` (invariantes de fatura e limite; gastos por categoria incluem operações de conta, o que a skill antiga negava), `AGENTS.md` e `docs/AGENT_EXECUTION_CONTRACT.md` (mesmas regras).
- **Evidência:** somente documentação; `npm run test:quality` executado antes do commit.

## 26/11/2026 — Fase 0 do plano: operações de cartão atômicas

- **Pedido:** executar a Fase 0 de `docs/PLANO_CARTEIRA_PARIDADE.md` (autorizado pelo proprietário).
- **0.3 varredura:** fluxos com várias escritas encadeadas no cliente encontrados só em `WalletCardsPage.tsx`: restante da fatura, antecipação e exclusão parcial de parcelas. `QuickWalletActionsModal`, `QuickExpenseModal` e `AccountMovementModal` fazem uma escrita por ação. Ajuste de fatura (`InvoiceOverrideModal`) também faz uma escrita por ação.
- **0.1/0.2 e exclusão parcial:** migration `20261126120000_wallet_atomic_card_operations.sql` com `personal_wallet_roll_invoice_remainder`, `personal_wallet_advance_installments` e `personal_wallet_cancel_installments`; tela e serviço passam a chamar uma RPC por ação. O restante da fatura nunca funcionava antes (request_id `uuid:roll-clear` inválido).
- **Revisão independente (agente com contexto separado):** aprovado com ressalvas, sem bloqueantes. Corrigidos: antecipação para competência passada recusada (tirava valor do limite comprometido); antecipação para fatura consolidada por valor fechado recusada (o valor sumia); ordem de travas em `cancel_installments` igual à do pagamento (evita deadlock); repetição do restante confere os dados; posição do cartão recalculada depois do restante; prévia da antecipação com a mesma regra do servidor (ignora parcela futura parcialmente paga); chave de exclusão separada por parcela e escopo.
- **Limitações registradas:** o pagamento parcial e o tratamento do restante continuam sendo duas RPCs (se a segunda falhar, o restante fica na fatura atual, estado consistente, e a ação pode ser refeita pela fatura). Editar valor ou mês de uma compra antecipada ou com parcela excluída reconstrói as parcelas em meses seguidos (comportamento anterior de `personal_wallet_update_expense_idempotent`); o crédito de desconto da antecipação continua como lançamento próprio.
- **0.4 migrations sem registro:** `20261119220000_open_personal_wallet_to_all_users` está no banco com conteúdo idêntico (falta só o registro da versão); `20261119233000_wallet_allow_same_document_repeated_rows` foi substituída por versões posteriores; `20261117150000_card_funded_loan_no_account_debit` teve a maior parte substituída, mas `finalize_loan_funding_allocations_v1` **não existe em produção**, e `services/contracts.service.ts` a chama ao criar contrato com mais de uma fonte. Correção pendente de autorização.
- **Testes:** `tests/wallet/wallet-atomic-card-operations.test.ts` 14/14 (PGlite com as funções reais); testes TS da Carteira 407/407; `npm run test:quality` exit 0; `npm run test:wallet-visual-next` 62/62. Teste de arquitetura `runtime-text-encoding` falha também na main antes desta mudança (texto com codificação corrompida em `accountStatementDomain.ts`), fora do escopo.
- **Sem validação visual em aparelho físico.**

## 26/11/2026 — 0.4: função de composição entre fontes restaurada

- `20261126140000_restore_loan_funding_allocations.sql` aplicada e registrada (autorizada pelo proprietário). Só cria `finalize_loan_funding_allocations_v1`, igual à de 17/11 exceto pela data da compra no cartão (`start_date`). Conferido antes: `loan_card_wallet_charges` tem chave primária em `loan_id` (o `on conflict` funciona). Conferido depois: função existe, só `authenticated` executa, versão registrada.
- `20261119220000_open_personal_wallet_to_all_users`: conteúdo idêntico já em produção; o registro da versão no histórico **não foi feito** (bloqueado pela proteção automática da sessão) e fica pendente de autorização.
- **Pendente:** contratos com várias fontes criados antes desta correção podem estar sem a saída das fontes; não foram alterados. Conferir caso a caso, com autorização, antes de qualquer ajuste.

## 26/11/2026 — Fase 1 do plano: ciclo do cartão

- **Entregue:** itens 1.0 a 1.4 de `docs/PLANO_CARTEIRA_PARIDADE.md` (detalhes em `CHANGELOG.md`). Migration `20261126160000_wallet_card_cycle_rules.sql` aplicada antes do código (o `load()` lê a tabela nova).
- **Verificação em produção (sem valores):** versão registrada; 3 cartões e 3 regras iniciais; 0 divergências entre o roteamento novo e a fórmula anterior de dia fixo em 41 datas por cartão; `personal_wallet_set_card_cycle_rules` executável só por `authenticated`.
- **Revisão independente:** reprovada na 1ª versão; bloqueios e itens importantes corrigidos (ver CHANGELOG). Não houve segunda rodada de revisão.
- **Pendências:** ciclo pelo dia fixo ainda nas telas de importação e linha do tempo; salvar cartão + regra em duas chamadas; feriados locais fora; validação visual em aparelho não realizada.

## 26/11/2026 — Fase 2 do plano: ferramentas

- **Entregue:** 2.1 (considerar no limite), 2.2 (reabrir fatura), 2.4A (lembrete de fechamento no app). 2.3A (saldo previsto) já existia no balanço da Visão geral. Detalhes, revisão e limitações em `CHANGELOG.md`.
- **Pendente do plano:** 2.3B (pendente/efetivado nas contas) e 2.4B (notificação push), que exigem autorização própria; Open Finance fora do escopo.
- **Sem validação visual em aparelho físico.**

## 26/11/2026 — Correções de tela no contrato

- Modal no celular em largura total, extrato recente sem rolagem interna, notas de auditoria sem texto em inglês e quadro Capital/Encargos/Original em três colunas. Detalhes em `CHANGELOG.md`.
- **Sem validação em aparelho físico.**

## 26/11/2026 — Conta e cartão no mesmo cadastro, visíveis

- O vínculo de 05/11 existia, mas ficava escondido em seções recolhidas. Agora é uma escolha visível nos dois cadastros; o cartão criado junto com a conta recebe fechamento, vencimento e bandeira. Sem mudança de RPC ou banco. Detalhes em `CHANGELOG.md`.
- **Sem validação em aparelho físico.**

## 26/11/2026 — Importação CSV/XLSX, senha de PDF e unificação

- CSV e XLSX entram na importação (leitura local); PDF com senha já funcionava e o pedido de senha ficou em destaque; texto da unificação "normal" corrigido (ela congela o saldo, não cobra juros). Detalhes em `CHANGELOG.md`.
- **Pendente:** unificação que soma contratos e mantém juros normais exige nova RPC, com autorização do proprietário.
- **Sem validação em aparelho físico.**

## 27/11/2026 — Fase 2 finalizada

- Entregue: 2.3A saldo previsto por conta, 2.3B pendente/efetivado (migration 20261127090000 aplicada e registrada antes do código), 2.4A lembretes no sino. Detalhes em `CHANGELOG.md`.
- **Pendente:** 2.4B notificação push (Edge Function + agendamento + VAPID). Unificação de contratos com juros normais (nova RPC).
- **Sem validação em aparelho físico.**

## 27/11/2026 — CI vermelho e APK não gerado (corrigido)

- De `7792f44` a `2690812` o Quality Gates falhou num teste de arquitetura desatualizado e o APK não foi gerado. Teste ajustado; nenhuma mudança de produção. Antes de declarar gates aprovados, rodar também os passos do CI fora do `test:quality` (`test:wallet-statement-import`, `test:wallet-invoice-cycle`, `wallet-invoice-editor-regression`, `wallet-issuer-invoice-atomic`, `npm audit`).

## 27/11/2026 — Limpeza de dados autorizada pelo proprietário

- A pedido expresso do proprietário, as compras de um cartão importadas de uma fatura errada (já canceladas pelo app), suas parcelas e as marcações de importação foram apagadas definitivamente em produção, numa única transação com checagem prévia (todas canceladas, sem vínculo com empréstimo, conta a pagar ou pagamento de fatura). Cartão, regra de ciclo e conta vinculada mantidos. Verificado depois: 0 compras, 0 marcações e 0 parcelas órfãs nesse cartão; demais cartões intactos. Sem código alterado.

## 27/11/2026 — Exclusão definitiva de lançamento errado

- Regra do proprietário: excluir apaga do banco o que foi inserido por engano; efeito financeiro realizado segue com estorno. Migration 20261127120000 aplicada antes do código. Detalhes em `CHANGELOG.md`.
- Registros cancelados antigos apagados com autorização expressa do proprietário (27/11/2026), numa transação com conferência prévia (sem pagamento, vínculo ou efeito em saldo): 16 lançamentos cancelados, 32 parcelas e 1 par anulado que se compensava. Depois: 0 cancelados, 0 parcelas órfãs, 0 anulados; soma dos saldos das contas inalterada; 125 compras ativas preservadas.

## 27/11/2026 — Exclusão em lote, notificações e aviso repetido

- Exclusão em lote (migration 20261127140000, aplicada antes do código), notificações com foto/logo/cor e correção do aviso de fatura duplicado (UUID estável + checagem no banco). Detalhes em `CHANGELOG.md`.
- Registro anterior com contagem de testes errada (10/10 e 17/17) corrigido para 8/8 e 16/16; a mensagem do commit 5562cbb mantém o número antigo.
- **Sem validação em aparelho físico.**

## 27/11/2026 — Fase 1 concluída e textos

- Pontas da Fase 1 fechadas: importação de fatura, linha do tempo e ferramentas de fatura usam a regra de ciclo de cada cartão. "Auditável" removido das telas. Detalhes em `CHANGELOG.md`.

## 27/11/2026 — Unificação com juros normais

- Migration 20261127160000 aplicada antes do código; regra e revisão em `CHANGELOG.md`.

## 27/11/2026 — Fase 2.4B concluída (push de fatura)

- Migrations 20261127180000 e 20261127190000 aplicadas; função `wallet-invoice-reminders` publicada; rotina diária ativa. Desligar a verificação de JWT da função foi recusado pela política de segurança; a rotina envia a chave pública do app guardada no Vault. Fases 0, 1 e 2 concluídas; pendente só o botão por cartão para desligar o push e o item opcional 0.5.
