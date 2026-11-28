# Changelog

## 27/11/2026 — Fluidez da interface e taxas fracionárias

**Melhoria:** tokens de movimento compartilhados para botões, seletores e modais, com desaceleração e suporte a movimento reduzido. Cabeçalho e auditoria do contrato passam a usar os SVGs próprios. **Correção:** digitação decimal explícita de taxas (25,5%, 2,75%, 0,5%) sem máscara de centavos; quantias monetárias preservam o comportamento anterior. Colagem e expressões continuam disponíveis. Sem mudanças no Supabase, rotas, dependências ou contratos existentes.
- Integração dos candidatos `3193699` e `f696a8f` solicitada expressamente pelo proprietário. Testes isolados registrados nas etapas anteriores; suíte integrada e revisão independente não executadas antes da integração por limitação do ambiente. CI e publicação devem ser conferidos separadamente.

## 27/11/2026 — Contas com maior saldo primeiro

**Melhoria (só interface).** `components/wallet/AccountCardStack.tsx`: "Suas contas" passa a listar a conta com mais saldo primeiro (comparação em centavos; empate em ordem alfabética). Novo teste `tests/wallet/account-card-stack-order.test.tsx` incluído em `test:wallet-visual-next`.

## 27/11/2026 — Fundo dos botões de movimentar conta

**Melhoria (só interface, registro retroativo do commit e47e683).** `components/wallet/AccountActivityPanel.tsx`: Receita, Receber, Despesa, Pagar e Transferir deixam o fundo quase preto com borda forte por placas levemente elevadas (`bg-slate-800/45` com contorno sutil), realce azul do padrão da Carteira na opção aberta e animação do ícone ao tocar. Conferido no app local; não validado em celular físico.

## 27/11/2026 — Editar conta reconhece o cartão já cadastrado

**Correção (só interface).** `components/wallet/AccountDetailsPage.tsx`: quando a conta já tem cartão (vinculado à conta ou do mesmo banco sem conta definida), a edição não pergunta mais "Possui cartão de crédito"; mostra o cartão vinculado com o limite real dele e explica que o limite usado nas contas é o do cartão. O "Limite de crédito informado" da conta era só anotação (não entrava em cálculo) e deixa de ser salvo nesse caso, evitando dois limites diferentes.
- **Testes:** conferido no app local com conta e cartão do mesmo banco; `test:quality` e build. Não validado em celular físico.

- **Melhoria (27/11/2026):** em Movimentar conta, Despesa inclui a opção Pago todo mês para cadastrar despesas fixas e dívidas recorrentes no mesmo formulário.

- **Melhoria (27/11/2026):** o atalho Receita abre direto no formulário. A opção Recebo todo mês muda o cadastro para receita fixa na mesma tela.

- **Melhoria (27/11/2026):** categorias com seletor por ícones em movimentações, despesas e compromissos. Despesas fixas usam a janela compartilhada, e os atalhos distinguem Receita avulsa de Receita fixa.

- **Melhoria (27/11/2026):** os atalhos de movimentação da conta ocupam três colunas e são mais compactos no celular.

## 27/11/2026 — Formulários com campos curtos lado a lado (Carteira, Empréstimos, Simulador, Perfil e Lembretes)

**Melhoria (só interface).** Campos naturalmente curtos que antes empilhavam em largura total passaram a ficar lado a lado em 21 formulários do app:
- **Carteira:** `BankAccountDetailsFields.tsx` (`Agência + Dígito`, `Número da conta + Dígito + Operação`, cheque especial), `AccountDetailsPage.tsx` (`Apelido + Banco`, `Tipo de conta + Tipo da chave PIX`, além da correção do texto cortado no seletor de logotipo/imagem), `QuickExpenseModal.tsx` (`Data + Conta de Origem` lado a lado no modo Conta/PIX), `CreateAccountModal.tsx` (`Tipo de Conta + Saldo Inicial`, `Fechamento + Vencimento`, `Bandeira + Final`), `WalletCardsPage.tsx` (`Final + Limite total`, `Fechamento + Vencimento`, `Validade mês + ano`), `CardInitialBalancesModal.tsx`, `CardOpeningFields.tsx`, `AccountMovementModal.tsx`, `AccountPendingOperations.tsx`, `RecurringIncomePanel.tsx`, `RecurringObligationsPanel.tsx`, `WalletPayablesPanel.tsx`, `InvoiceOverrideModal.tsx`, `QuickIncomeModal.tsx`, `QuickWalletActionsModal.tsx` e `WalletPayablesPage.tsx`.
- **Empréstimos, Pagamentos e Simulador:** `LoanFormFinancialSection.tsx` (`Principal + Juros`, `Data Empréstimo + Vencimento (1º)`, `Multa + Mora`, `Data + Valor cobrado`, parcelas), `SimulatorPanel.tsx`, `PaymentRegistrationForm.tsx` e `PaymentOfferModal.tsx`.
- **Perfil, Cobrança e Lembretes:** `ProfilePage.tsx` (`Juros + Multa + Mora` e `Meta de Capital + Meta de Lucro`), `CollectionAutomation.tsx`, `ScopedCollectionAutomation.tsx` e `ReminderFormModal.tsx`.

## 27/11/2026 — Editor de posição direto na barra superior (Web) e limpeza de menus no Perfil

**Melhoria (só interface).** `layout/HeaderBar.tsx`, `layout/AppShell.tsx`, `layout/navigationPreferences.ts`, `App.tsx`, `pages/ProfilePage.tsx`: removida a lista manual "Personalizar Menus" (`Barra Superior (Fixo)` / `Menu Lateral`) de **Perfil → Preferências & Menus** em Web e Mobile; adicionado editor inline de posição por arraste direto na barra superior desktop (botão grade `⋮⋮` → arrastar abas → `Concluir`/`Cancelar`), alinhado ao editor já existente na barra inferior mobile e reutilizando `saveNavConfig` com persistência local + sincronização.

## 27/11/2026 — Cidade e Estado (UF) lado a lado no Perfil

**Melhoria (só interface).** `pages/ProfilePage.tsx`: campos **Cidade** e **Estado (UF)** passam a ficar lado a lado também no celular (`grid-cols-[minmax(0,1fr)_5.5rem]`), preservando a grade `4 + 2` em telas maiores.

## 27/11/2026 — Animação dos ícones mais visível

**Melhoria (só interface).** `index.css`: ao ativar uma aba, o ícone inteiro dá um pulo (`cf-icon-pop`, 560 ms, até 122% com leve giro), além das partes internas, que agora têm amplitude maior e duram 680 ms. Ícone do cabeçalho entra de 60% com giro (620 ms). Ao passar o mouse, o ícone sobe e cresce 16%; ao tocar no celular, afunda para 82%. Movimento reduzido continua desligando tudo. Vale para barra inferior, abas da Carteira e cabeçalhos de página. **Correção:** o cabeçalho do Atendimento (`features/support/OperatorSupportChat.tsx`) usava um ícone genérico (lucide `MessageCircle` em círculo azul) e passou ao ícone próprio `assistant` no fundo escuro, igual às outras páginas e à aba Chat. Abas Ativos/Clientes (`ChatSidebar.tsx`) no padrão das abas da Carteira (ícones próprios `chat`/`clients`, texto normal, realce azul), "Gerenciar conversas" com ícone próprio `trash` e texto normal, e botões do topo (voltar, tema, fechar) no quadrado neutro `rounded-xl` da Central de Alertas. **Varredura dos outros botões:** novas classes compartilhadas `cf-seg`/`cf-seg-tab` (`index.css`, ativo por `data-active`) no padrão das abas da Carteira, aplicadas aos seletores Contratos/Balanço do Painel (`DashboardPage.tsx`, `DashboardLayout.tsx`), Mensal/Diário/Calculadora (`CalculatorModal.tsx`), Pagar diária/Amortizar (`FlexibleDailyScreen.tsx`), Pix direto/InfinitePay (`InstallmentPixModal.tsx`) e Documento/Assinaturas/Auditoria (`LegalDocumentModal.tsx`), com ícones próprios no lugar dos genéricos. Botões de ação em caixa alta com letra miúda passaram a texto normal `text-sm font-semibold` (`AgreementView`, `PaymentRegistrationForm`, `NotificacaoCobrancaView`, `MasterScreen`, `LegalContractPage`, `LegalPage`, `AIAssistantModal`); cores de significado (juros em laranja, quitação em verde) mantidas.
- **Testes:** animação conferida no app local (valores de transform durante a animação); `test:quality`, `test:wallet-visual-next` e build. Não validado em celular físico.

## 27/11/2026 — Fontes de Capital no padrão da lista de contas da Carteira

**Melhoria (só interface).** `components/cards/SourceCard.tsx`: logo do banco preenchendo o quadro de 48 px (prioridade sobre imagem enviada quando o nome é de banco conhecido), faixa lateral na cor da marca, nome em texto normal com `MarqueeText`, tipo e contratos em texto normal, ícones próprios por tipo quando não há logo e ações reduzidas a editar/excluir (os contratos abrem os detalhes). Removidos o ícone apagado no canto e a busca de logos externos (clearbit). `utils/bankLogoRegistry.ts`: apelido exato "nu" → Nubank.
- **Testes:** `test:quality`, `test:wallet-visual-next`, `test:wallet-statement-import` e build passaram; conferido no app local em 375 px. Não validado em celular físico.

- **Melhoria (27/11/2026):** os anéis de gastos preenchem até a participação da categoria ao entrar na área visível, e os ícones de navegação têm movimentos mais nítidos.

## 27/11/2026 — Animações dos ícones de navegação

**Melhoria.** Os ícones da barra inferior e da Carteira animam suas partes internas ao ativar uma aba. Os cabeçalhos ganham entrada e a Carteira usa um indicador deslizante na aba ativa. Os movimentos são únicos por ativação e respeitam a preferência de movimento reduzido.

## 27/11/2026 — Nome longo em botão pequeno rola sozinho

**Melhoria (só interface).** Novo `components/ui/MarqueeText.tsx`: quando o texto não cabe, desliza devagar até o fim e volta, com pausa nas pontas; quando cabe, fica parado; com "reduzir movimento" ligado, mostra reticências como antes (`@keyframes cf-marquee` em `index.css`). Aplicado na escolha de categoria (`CategoryIconPicker.tsx`), na faixa de categorias (`CategoryBreakdownPanel.tsx`) e nos rótulos da barra inferior (`layout/BottomNav.tsx`).
- **Testes:** type-check, `test:quality`, `test:wallet-visual-next` e build passaram. Não validado em celular físico.

## 27/11/2026 — Padronização dos ícones na Central de Alertas, Carteira e Painel

**Melhoria (só interface).** Adicionados os ícones próprios `bell` (com variante `onColor`) e `bulb` em `components/icons/AppIcons.tsx`:
- **Central de Alertas (`layout/HeaderBar.tsx` e `components/notifications/NotificationAvatar.tsx`):** cabeçalho com o ícone próprio `bell` sem moldura e título em texto normal; lixeira e fechar no mesmo botão neutro `h-9 w-9 rounded-xl`; sino na barra superior no tamanho padronizado (inclusive mobile); todos os avatares de notificação (foto, iniciais, logo do banco e ícone) no mesmo quadro `h-10 w-10 rounded-xl`, com o logo do banco preenchendo o quadro e reconhecimento do banco na mensagem (`C6 Bank`, etc.).
- **Barra de navegação inferior (`layout/BottomNav.tsx`):** no padrão da barra da Carteira — ícones de 27 px, botões maiores (`min-w-[76px]`, `min-h-[3.75rem]`), rótulo em texto normal (sem caixa alta) e realce do ativo igual ao da Carteira.
- **Carteira e Painel:** substituídos os ícones genéricos/pequenos de **Saúde financeira** (`WalletSpendingGuide.tsx`), **Contas** e **Cartões** (`WalletOverviewSummary.tsx`), **Compromissos** (`WalletOverviewPage.tsx`, `WalletPayablesPage.tsx`), **Visão do mês** (`WalletReportPage.tsx`), **Ações rápidas `+`** (`WalletExpenseFab.tsx`), **Balanço Mensal** (`MonthlyBalanceReport.tsx`) e indicadores do **Painel** (`DashboardPage.tsx`).
- **Lançamento rápido (`QuickExpenseModal.tsx`):** campos **Iniciar na parcela** e **De (Total de parcelas)** posicionados lado a lado (`grid-cols-2`) também no celular, e **Data da Compra** movida para dentro do bloco **Fatura do cartão** no modo cartão para ser configurada junto ao ciclo e às parcelas sem passar batida.

## 27/11/2026 — Auditor IA, gráfico Evolução, compromissos da Carteira e risco de clientes

**Correção.**
- `domain/dashboard/stats.ts`: `LOAN_INITIAL`/`LOAN_CREATED`/`APORTE` passam a contar como saída no gráfico **Evolução** (a série Saídas ficava zerada); estatísticas expõem `lateCount`, `exposureShare`, `topDebtorsShare` e `topLateLoans`. Cores da rosca alinhadas aos ícones dos filtros (em dia verde, atrasado âmbar, quitado índigo, renegociado roxo; vermelho fica para atraso crítico).
- `features/dashboard/AIBalanceInsight.tsx` + `services/internalAI.service.ts`: o **Veredito do Auditor IA** usa os mesmos números do Balanço/Saúde da Carteira (`buildDashboardStats`) e os Recebimentos do mês (`buildMonthlyBalances`), sem cálculo paralelo; acusa concentração crítica quando a exposição ao risco passa de 50% do capital ou os 3 maiores devedores passam de 40%.
- `components/wallet/walletBalanceDomain.ts` + `WalletOverviewPage.tsx`: **Compromissos (próx. 30 dias)** — faturas, contas a pagar e pendentes que vencem nos próximos 30 dias (mais os vencidos) entram no previsto; antes só o mês corrente, e uma fatura vencendo no início do mês seguinte mostrava R$ 0.
- `pages/ClientsPage.tsx`: risco do cliente considera só contratos não arquivados com saldo em aberto; sem contrato aberto mostra "Sem histórico". Rótulo "CRÍTICO" com acento.
- `layout/AppShell.tsx`: espaço inferior maior no conteúdo para os botões flutuantes não cobrirem o fim da página.
- Inclui no código os botões do topo de Clientes e ícones `portal`/`userPlus` (Antigravity), já descritos na entrada "Botões e ícones do cabeçalho de Clientes".
- **Testes:** novo `tests/financial/dashboard-auditor-consistency.test.ts` (3/3) e teste de horizonte de 30 dias (4/4 no arquivo). `test:quality`, `test:wallet-visual-next` (62), `test:wallet-statement-import` (78), `test:wallet-invoice-cycle` (10), `test:financial`, testes de arquitetura da fatura, `npm audit --omit=dev --audit-level=high` e build passaram. Sem migração nem alteração de RPC. Não verificado em celular físico.

## 27/11/2026 — Botões e ícones do cabeçalho de Clientes

**Melhoria (só interface).** `pages/ClientsPage.tsx` e `components/icons/AppIcons.tsx`: botões **Novo Link de Inscrição**, **Excluir Vários** e **Novo Cliente** padronizados em altura única (`h-9`, `whitespace-nowrap`, sem quebra em duas linhas) e atualizados com os ícones próprios (`portal`, `trash` e `userPlus`, com variante clara `onColor` sobre botões coloridos).

## 27/11/2026 — Perfil → Atualizações com uma entrada por dia

- `src/constants/changelog.ts`: as 14 entradas de 27/11 e as 7 de 26/11 foram reunidas em uma entrada por dia (todos os itens mantidos, sem repetição, novidades primeiro). Lista: 36 → 17 entradas.

## 27/11/2026 — Ícones na conta: movimentar, categorias e extrato

**Melhoria (só interface).** `components/wallet/AccountActivityPanel.tsx`: botões Receita, Receber, Despesa, Pagar e Transferir com ícones próprios; lista de categorias com o ícone colorido de cada categoria; linhas do extrato com o ícone da categoria (borda verde para entrada, vermelha para saída) no lugar da seta genérica.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira e build passaram; conferido no app local em 411 px.

## 27/11/2026 — Contraste dos ícones próprios e remoção de botão redundante de atualizar

**Melhoria (só interface).** `AppIcon` (`components/icons/AppIcons.tsx`) recebeu a variante clara `onColor` (cores claras/brancas no próprio SVG, sem moldura extra) para os ícones sobre botões coloridos ativos nas abas **Contratos/Balanço** (`pages/DashboardPage.tsx`), nos filtros do painel (**Todos**, **Pagos**, **Arquivados**, etc. em `components/dashboard/DashboardControls.tsx`) e nas abas ativas do cabeçalho (`layout/HeaderBar.tsx`). Removido também o botão redundante de atualizar do cabeçalho do **Extrato Financeiro** (`pages/FinancialStatementPage.tsx`), já coberto pelo gesto de puxar para atualizar.

## 27/11/2026 — Ícones próprios: menus, contrato, painel, jurídico, simulador e atendimento

**Melhoria (só interface).** O conjunto `components/icons/AppIcons.tsx` ganhou os ícones que faltavam e `components/icons/brandIcons.tsx` expõe os mesmos nomes dos ícones genéricos desenhando a versão própria (trocar o import aplica o padrão).
- Aplicado em: menu principal (`NavHub`), abas do topo no computador (`HeaderBar`), ações do contrato (Editar, WhatsApp, Portal, Promissória, Anexar, Notas), ícone de situação do contrato, ações da parcela (Pix, Condição, Receber, Detalhes), indicadores e gráficos do painel, veredito da IA, protocolos do Jurídico, simulador, atendimento e cartões de lucro.
- Ícones de controle (setas, carregando, fechar, lixeira) continuam de traço.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira e build passaram.

## 27/11/2026 — Ícones próprios no app todo

**Melhoria (só interface).** `components/icons/AppIcons.tsx`: conjunto de ícones desenhados, coloridos por área, no lugar dos ícones genéricos de traço. Aplicado na barra inferior (Painel, Carteira, Capital, Clientes, Extrato, Simulador, Jurídico, Assistente), nos cabeçalhos das páginas (ícone em quadro escuro), nas abas Contratos/Balanço, nos filtros de contratos (Todos, Atrasados, Críticos, Renegociados, Em dia, Pagos, Arquivados) e nas abas do Perfil.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira e build passaram; conferido no app local em 411 px. A proteção de codificação aponta `accountStatementDomain.ts` (falha antiga, não alterada aqui).

## 27/11/2026 — Ajustes do Antigravity integrados (cartões e conta)

**Melhorias (só interface), feitas localmente no Antigravity em 26/11 e integradas após testes.**
- **Frente do cartão** (`components/wallet/BankStack.tsx`): Limite, Gasto e Restante lado a lado, com tamanho que se ajusta à largura do cartão; sem o desenho do chip. Sem resposta do banco o Restante mostra "—", nunca a estimativa provisória; a origem (banco ou estimado) fica no título do campo.
- **Editor de cartão** (`components/wallet/CardEditModal.tsx`): 12 cores prontas além da cor personalizada (mesmo campo `primary_color`); removido o bloco amarelo de aviso.
- **Página de cartões** (`features/wallet/pages/WalletCardsPage.tsx`): removido o aviso repetido de fatura vazia.
- **Conta** (`components/wallet/AccountDetailsPage.tsx`): no celular, atalho "Despesa" curto e opções no botão de três pontos.
- Testes de arquitetura ajustados ao novo formato (`wallet-pages`, `wallet-card-web-layout`, `wallet-ui-architecture`). Os registros originais estavam espalhados entre entradas antigas; consolidados aqui.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira, importação, ciclo e proteções da fatura passaram. Sem aparelho físico.

## 27/11/2026 — Ícones próprios na Carteira e aviso no celular por cartão

- **Ícones das abas** (`components/wallet/WalletNavIcons.tsx`): Geral, Cartões, Contas e Pagar ganham desenhos próprios e coloridos no lugar dos ícones genéricos.
- **Aviso no celular por cartão:** em Editar cartão, "Avisar no celular quando a fatura for fechar ou vencer". Migration `20261127200000_wallet_card_push_reminders_toggle.sql` (aplicada e registrada; só `authenticated`).
- **Testes:** visual, proteções da fatura e build passaram; conferido no app local em 411 px.

## 27/11/2026 — Notificação push de fatura (Fase 2.4B)

**Novidade.** Migrations `20261127180000_wallet_invoice_push_reminders.sql` e `20261127190000_wallet_push_reminders_cron_auth.sql` (aplicadas e registradas em produção) e Edge Function `wallet-invoice-reminders` (publicada pelo painel).
- O banco lista, pela regra de ciclo de cada cartão, a fatura que fecha ou vence em até 3 dias (vencimento só com valor a pagar); cada aviso é enviado uma única vez (`personal_wallet_push_reminders_sent`). Coluna `push_reminders` por cartão (padrão ligado; botão na tela ainda não feito).
- Rotina diária `pg_cron` às 08:00 (Manaus) chama a função via `pg_net`. A função mantém a verificação de JWT (chave pública do app guardada no Vault) e exige o segredo próprio da rotina, também no Vault. Texto sem valores. Inscrições expiradas são removidas.
- **Verificado em produção:** chamada de teste respondeu 200 (`1` aviso, enviado a `8` aparelhos inscritos).

## 27/11/2026 — Unificação de contratos com juros normais

**Novidade (decisão do proprietário).** Migration `20261127160000_unify_contracts_keep_interest.sql` (aplicada e registrada em produção antes do código): `unify_contracts_keep_interest` soma o principal de contratos **mensais** do mesmo cliente no contrato principal; juros e mora em aberto (que já incluem os juros do mês de cada contrato) ficam na 1ª parcela com o novo vencimento; taxa, multa e mora do contrato principal continuam valendo nos ciclos seguintes. Uma transação, idempotente por `request_id`; recusa acordo ativo, outro cliente, contrato não mensal e contrato principal sem taxa. Atualiza `next_due_date`. Registro próprio no extrato ("Contratos somados (juros normais)"), sem o "Desfazer" da unificação congelada.
- Tela: opção "Somar contratos e manter os juros" com primeiro vencimento e resumo curto.
- **Revisão independente:** aprovada com ressalvas; corrigidos juros do mês em dobro, contratos não mensais, taxa zerada, próximo vencimento e tipo próprio no extrato. Mantido (regra geral do sistema): multa e mora de atraso incidem sobre principal + encargos da parcela.
- **Testes:** `tests/agreements/unify-contracts-keep-interest.test.ts` 4/4 (agora em `test:financial`), passos de teste do CI, visual e build. Produção: versão registrada, função só para `authenticated`.

## 27/11/2026 — Regra do cartão em toda a Carteira e textos mais limpos

**Fase 1 concluída (só interface).** Importação de fatura (`FlatSmartStatementReader`, mês e vencimento sugeridos), linha do tempo (`walletTimeline`), aviso de fatura fechada/paga e ferramentas de antecipar/levar restante (`minhasFinancasWalletTools`) passam a usar a regra de ciclo de cada cartão (fechamento dinâmico, dia útil, fechamento do mês). Para cartões em dia fixo, nada muda.

**Textos:** removido "auditável" das telas (termo técnico) e o texto explicativo do saldo inicial; o "Saldo inicial" virou um botão ao lado de "Importar PDF".

- **Testes:** `test:wallet-statement-import`, `test:wallet-invoice-cycle`, proteções da fatura, `test:wallet-visual-next`, Carteira e build passaram. `test:quality` local falha só em `wallet-expense-sheet-navigation` ("Registrar despesa"), por alteração local da barra de ações da conta que **não** faz parte deste commit.

## 27/11/2026 — Logos dos bancos preenchendo o quadro

**Melhoria (só interface).** Os SVGs dos bancos traziam margem interna (logos em bloco ocupavam ~65% do arquivo) e alguns são só o símbolo, escuro e sem fundo (C6, Nubank), que sumiam no tema escuro. A lista de contas ainda punha um quadro dentro de outro.
- `assets/bankLogoBounds.ts`: área desenhada de cada um dos 22 logos, medida renderizando os SVGs; `resolveBankLogoDisplay` (`utils/bankLogoRegistry.ts`) recorta o viewBox: logo em bloco preenche o quadro; logo só com símbolo fica centralizado sobre fundo claro.
- Logos com cantos transparentes (círculo do Bradesco; cantos arredondados de Itaú, Inter, PicPay, PagBank, InfinitePay e Jota) recebem no fundo a cor da própria borda, ficando todos no mesmo quadrado arredondado.
- `components/wallet/BankLogo.tsx` usa o recorte (inclusive no cartão); `components/wallet/AccountCardStack.tsx` sem o quadro duplo e com ícone próprio para carteira física.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira, passos de teste do CI e build passaram; conferido no app local em 411 px (Visão geral e Cartões).

## 27/11/2026 — Excluir vários de uma vez e notificações com identidade

**Novidade: excluir vários lançamentos da fatura.** Migration `20261127140000_wallet_delete_wrong_expenses_batch.sql` (aplicada e registrada antes do código): `personal_wallet_delete_wrong_expenses(uuid[], uuid)` apaga a lista numa única transação, reaproveitando a exclusão individual (mesmas travas e recusas); se um não puder ser apagado, nada é apagado e o motivo aparece. Ordem estável por cartão; até 200 por vez; repetição responde pelos recibos. Tela: "Selecionar" no extrato da fatura, caixas de seleção, "Selecionar todos" (sem parcelas pagas) e confirmação. A seleção é limpa ao trocar de mês ou de cartão.

**Melhoria: notificações.** `components/notifications/NotificationAvatar.tsx` + `layout/HeaderBar.tsx`: foto do cliente (ou iniciais), logo do banco do cartão ou ícone do tipo, com cor por significado (vai vencer, vence hoje, vencida, fatura, pagamento, cadastro) na faixa lateral e no indicador. Os avisos de cobrança guardam nome e foto do cliente nos metadados (RLS de `notificacoes` restringe ao perfil e equipe).

**Correção: aviso de fatura repetido.** O identificador do aviso não era UUID e era gravado vazio, quebrando a deduplicação e o "lido". Agora usa UUID estável por cartão e data (`stableReminderUuid`) e confere no banco se já avisou (`notificationCenterService.existsForItem`) antes de criar. Avisos de fatura dispensados antes desta versão podem aparecer uma última vez.

- **Revisão independente:** aprovado com ressalvas; corrigidos seleção ao trocar de mês, ordem por cartão e "selecionar todos" com parcela paga.
- **Correção de registro:** a entrada anterior ("Lançamento errado é apagado do registro") informava contagens de testes erradas; corrigidas para 8/8 e 16/16.
- **Testes:** `wallet-delete-wrong-entries` 9/9 (lote tudo ou nada e repetição), Carteira 466/466, `test:quality`, `test:wallet-visual-next`, passos de teste do CI, `npm audit` e build passaram. Sem aparelho físico.

## 27/11/2026 — Tela da conta mais limpa

**Melhoria (só interface).** `components/wallet/AccountDetailsPage.tsx`, `components/wallet/AccountPendingOperations.tsx`.
- Botão **"Pendente"** nas ações da conta, ao lado de "Movimentar", abre o lançamento pendente numa janela. O bloco "Pendentes" sem o texto explicativo e só aparece quando há pendências (com Efetivar e Cancelar).
- Titular, CPF/CNPJ e dados bancários saíram da tela principal da conta; continuam em **Editar conta**.
- **Testes:** `test:quality`, `test:wallet-visual-next`, Carteira, passos de teste do CI e build passaram; conferido no app local em 411 px sem salvar dados.

## 27/11/2026 — Lançamento errado é apagado do registro

**Mudança de regra (decisão do proprietário):** "Excluir" passa a apagar do banco o que foi inserido por engano, para não restar registro cancelado que gere dúvida em auditorias. Migration `20261127120000_wallet_delete_wrong_entries.sql`, aplicada e registrada em produção antes do código. `PRODUCT.md` e a skill da Carteira atualizados.
- `personal_wallet_delete_wrong_expense`: compra do cartão sai com parcelas e marcação de importação; posição do cartão recalculada. Travas na ordem do pagamento de fatura (cartão → parcelas → compra). Recusa parcela paga, vínculo com empréstimo/conta a pagar e compra gerada por "levar o restante" ou antecipação com desconto.
- `personal_wallet_delete_wrong_operation`: movimentação manual da conta sai e o saldo é devolvido na mesma transação; par já anulado sai inteiro sem mexer no saldo. Recusa pagamento de fatura, transferência, saldo inicial/ajuste, estorno, anulado sem par, conta arquivada, entrada já gasta e vínculo com receita fixa, capital, cartão ou pendente efetivado.
- `personal_wallet_cancel_installments` (só esta / esta e as seguintes) apaga as parcelas em vez de cancelar; sem parcelas restantes, a compra inteira sai.
- Repetição da mesma requisição responde "já apagado" por `personal_wallet_deletion_receipts` (só identificadores, sem valor nem descrição).
- Fatura consolidada mantém a exclusão própria (`removeCardEntry` → `cancelExpense`). Pagamentos, empréstimos e faturas pagas continuam corrigidos por estorno rastreável.
- **Revisão independente:** reprovada na 1ª rodada (corrida com pagamento de fatura, estorno de reabertura apagável, compras de "levar o restante"/antecipação, fatura consolidada); corrigido e aprovado com ressalvas na 2ª. Ressalvas aceitas: repetição da exclusão por parcela não confere a opção; compra em mês consolidado por valor fechado não reduz esse mês.
- **Testes:** `wallet-delete-wrong-entries` 8/8 e `wallet-atomic-card-operations` 16/16 (corrigido em 27/11: o registro anterior dizia 10/10 e 17/17) (Postgres em memória, funções reais); Carteira 464/464; `test:quality`, `test:wallet-visual-next`, `test:wallet-statement-import`, `test:wallet-invoice-cycle`, proteções da fatura, `npm audit` e build passaram. Produção: versão registrada, 3 funções só para `authenticated`. Registros cancelados antigos (16 compras e 1 par anulado) **não foram apagados**: dependem de autorização própria.

## 27/11/2026 — CI: Quality Gates e APK voltam a rodar

- **Causa:** desde o commit `7792f44` (Fase 1), `tests/architecture/wallet-invoice-editor-regression.test.mjs` exigia a chamada exata `getInvoiceCycleDates(statementMonth, …, savedInvoiceFacts?.due_date)`, sem o cartão que a Fase 1 passou a enviar. O teste falhava só no CI (fica fora de `npm run test:quality`), deixando o Quality Gates vermelho; o workflow do APK exige o Quality Gates do commit exato aprovado, então **nenhum APK foi gerado de `7792f44` a `2690812`**. Os registros anteriores afirmaram gates locais aprovados, mas não incluíam esse teste.
- **Correção:** a proteção aceita o parâmetro opcional do cartão; a precedência do vencimento exato continua exigida. Nenhum código de produção mudou.
- **Verificado localmente:** `test:wallet-statement-import`, `test:wallet-invoice-cycle`, `wallet-invoice-editor-regression`, `wallet-issuer-invoice-atomic`, `agent-pr-gate`, `npm audit --omit=dev --audit-level=high`, `npm run test:quality` e `npm run build` passaram. `test:load` (precisa do preview) não foi rodado localmente.

## 27/11/2026 — Fase 2 finalizada: pendente/efetivado, saldo previsto por conta e lembretes no sino

**Novidade: lançamento pendente na conta (2.3B)** — migration `20261127090000_wallet_pending_account_operations.sql`, aplicada e registrada em produção **antes** do código.
- Tabela `personal_wallet_pending_operations` (RLS: dono + `can_access_personal_wallet`) e RPCs `personal_wallet_create_pending_operation`, `personal_wallet_post_pending_operation` (total ou parcial; cria a operação normal da conta e atualiza o saldo na mesma transação, mesma trava por dono das operações de conta, idempotente por `request_id`) e `personal_wallet_cancel_pending_operation` (cancela só o restante).
- Pendente não altera saldo nem extrato. A anulação manual (`personal_wallet_void_manual_operation`) passa a recusar movimentações criadas ao efetivar um pendente (trava acrescentada à definição em produção, preservando o acesso `can_access_personal_wallet`).
- Tela da conta: bloco "Pendentes" com "+ Lançamento pendente", "Efetivar" (valor e data, parcial permitido) e "Cancelar" (`components/wallet/AccountPendingOperations.tsx`).

**Novidade: saldo previsto por conta (2.3A)** — `calculateAccountProjections` em `components/wallet/walletBalanceDomain.ts`: saldo atual + receitas fixas a receber + entradas pendentes − saídas pendentes − contas a pagar − faturas até o fim do mês, por conta; itens sem conta vão para "Sem conta definida" e a soma bate com a "Sobra prevista". Visão geral → Balanço do mês → "Saldo previsto por conta". O total do balanço passa a incluir os pendentes.

**Novidade: lembretes de fatura no sino (2.4A)** — `features/wallet/utils/invoiceReminders.ts` (regra compartilhada com a Visão geral): fatura que fecha ou vence em até 3 dias, sem valores no texto, uma vez por cartão e data. Na Visão geral, o aviso de vencimento só aparece se a fatura ainda tem valor.

- **Revisão independente:** aprovado com ressalvas. Corrigidos: ordem de publicação (migration antes do código), soma por conta com contas ocultas por reinício, anulação de parte efetivada, categoria na repetição da chave, envio duplo simultâneo, lembrete de vencimento sem valor na Visão geral e leitura de lembretes sem internet. Limitações aceitas: pendente de entrada pode duplicar uma receita fixa se o usuário cadastrar os dois (aviso na tela); no sino o aviso de vencimento não confere se a fatura já foi paga.
- **2.4B (notificação push) não entregue:** exige nova Edge Function e agendamento diário no Supabase com chaves VAPID; não há acesso de publicação de funções nesta sessão.
- **Testes:** `wallet-pending-operations` 8/8 (Postgres em memória com funções reais), `wallet-account-projection-and-reminders` 3/3, Carteira 455/455, `npm run test:quality` exit 0, `npm run test:wallet-visual-next` 62/62. Produção: versão registrada, RLS ativo, 0 linhas, 3 funções só para `authenticated`, trava de anulação presente. App local: soma por conta = total; bloco Pendentes exibido; nenhum dado criado. Sem aparelho físico.

## 26/11/2026 — Importação por CSV/XLSX, senha de PDF e texto correto da unificação

**Novidade: CSV e XLSX na importação de extrato e fatura** (`utils/statementSpreadsheet.ts`, ligado em `parseSmartFinancialDocument`).
- Leitura 100% local. Detecta o cabeçalho (data, descrição, valor; ou crédito/débito separados; parcela), separador `;` `,` ou tab, aspas, UTF-8 ou Windows-1252, datas dd/mm/aaaa, ISO, Date e número do Excel, valores "R$ 1.234,56", "1,234.56", "(25,00)" e "25,90 D".
- Cartão segue a regra do OFX: compra positiva, pagamento/estorno/crédito negativo e desmarcado; faturas que exportam compras negativas são invertidas pela maioria. Linhas de saldo/total são ignoradas. `.xls` antigo pede conversão para `.xlsx` ou `.csv`.
- Campo de arquivo dos dois importadores aceita `.csv` e `.xlsx`; textos atualizados.

**Melhoria: PDF com senha.** A leitura com senha já funcionava (verificado com PDF de teste criptografado: pede senha, recusa a errada, lê com a certa), mas o pedido aparecia como erro vermelho acima de um campo fácil de não ver. Agora o aviso vermelho dá lugar ao campo de senha em destaque, com o cursor já nele.

**Correção: texto da unificação de contratos** (`features/agreements/components/RenegotiationModal.tsx`). A opção "Unificar contratos sem novo parcelamento" dizia manter "a cobrança normal dos juros", mas a RPC `normal_unify_contracts` zera taxa, multa e mora e congela o saldo (`normalUnificationFrozen`). Renomeada para "Somar contratos com saldo congelado" e textos corrigidos; regra e banco não mudaram. Unificação com juros normais continuando **não existe** e depende de nova RPC (aguarda autorização).

- **Testes:** `tests/wallet/statement-spreadsheet.test.ts` 8/8; `npm run test:wallet-statement-import` 78/78; `npm run test:quality` exit 0; `npm run test:wallet-visual-next` 62/62; `wallet-import-contract` 4/4. No app local: CSV fictício lido (2 itens, 1 compra) sem salvar; PDF fictício com senha desbloqueado. Sem aparelho físico.

## 26/11/2026 — Conta e cartão no mesmo cadastro, visíveis

**Melhoria (somente interface; usa as RPCs já existentes `personal_wallet_create_complete_card_with_new_account` e `personal_wallet_create_account_with_existing_card`, de 05/11).**
- **Novo cartão:** a escolha "Conta do banco deste cartão" saiu de "Mais informações" e virou três opções visíveis — Sem conta, Conta que já tenho, Criar conta junto. O nome da nova conta é sugerido pelo banco do cartão. Dia do fechamento e do vencimento também ficam visíveis. Arquivo: `features/wallet/pages/WalletCardsPage.tsx`.
- **Nova conta:** "Cartão de crédito desta conta" saiu de "Mais opções bancárias" e virou três opções visíveis — Sem cartão, Cartão que já tenho, Criar cartão junto. O cartão criado junto agora aceita dia do fechamento, dia do vencimento e bandeira (antes só nome, limite e final). Arquivo: `components/wallet/CreateAccountModal.tsx`.
- Cada opção explica o que fica para depois: saldo, Pix e dados bancários em Contas; fatura atual e compras parceladas na tela Cartões; regra de fechamento em Editar cartão.
- **Testes:** `npm run test:quality` exit 0; `npm run test:wallet-visual-next` 62/62; `npm run test:wallet-card-opening` 8 + 13 passaram; conferido no app local em 411 px sem salvar dados. Sem validação em aparelho físico.

## 26/11/2026 — Correções de tela no contrato (celular)

**Correções (somente interface, sem mudança de regra ou banco).**
- **Janela de recebimento deslocada:** `components/ui/Modal.tsx` — no celular o painel padrão agora ocupa a largura toda (largura máxima só a partir de `sm`); antes ficava preso em `max-w-sm`/`max-w-md` encostado à esquerda em telas maiores que 384 px. A variante da Carteira mantém o tamanho flutuante.
- **Extrato recente travando a rolagem:** `components/cards/components/LedgerList.tsx` — removida a rolagem interna (`max-h` + `overscroll-contain`) que prendia o toque dentro do card; mostra os 5 lançamentos mais recentes e um botão "Ver extrato completo".
- **Texto técnico em inglês no extrato:** `utils/auditHelpers.ts` (`humanizeAuditText`) — remove "pelo Payment Engine V4" das notas gravadas, corrige "Unificacao" e formata valores como "R$ 1.300,00". O texto gravado no banco não foi alterado.
- **Quadro Capital/Encargos/Original desalinhado:** `components/cards/LoanCardComposition/Header.tsx` — três colunas fixas em uma linha ("Valor original" à direita) em vez de 2+1 no celular.
- **Testes:** `npm run test:quality` exit 0; `npm run test:wallet-visual-next` exit 0; conferido no app local em 411 px (modal ocupa 0–411 px, extrato sem rolagem interna e sem texto em inglês). Sem validação em aparelho físico.

## 26/11/2026 — Fase 2: considerar no limite, reabrir fatura e lembrete de fechamento

**Novidades (migration `20261126180000_wallet_limit_flag_and_reopen_invoice.sql`, aplicada e registrada em produção antes do código).**
- **"Considerar no limite do cartão?"** (`affects_limit`, padrão sim): botão "No limite / Fora do limite" em cada compra da fatura (`personal_wallet_set_expense_affects_limit`). Fora do limite, a compra continua somando na fatura, mas sai do limite comprometido (`private.wallet_recalculate_card_position` e `getCardCreditPosition`). Meses consolidados por valor fechado e compras absorvidas por consolidação de abertura não são subtraídos.
- **Reabrir fatura paga** (`personal_wallet_reopen_invoice`): estorna os pagamentos da fatura sem apagar nada — devolve o valor às contas de origem com lançamento de estorno (par compensado com o pagamento, fora do extrato, como no estorno manual), marca o pagamento como estornado (`reversed_at`) e volta as parcelas do mês a pendente. Recusa fatura sem pagamento, fatura cujo restante foi levado para outra fatura e outro usuário. Pagamentos estornados deixam de aparecer nas telas e não contam como fatura paga no roteamento e na antecipação.
- **Lembrete de fechamento** na Visão geral: cartões cuja fatura fecha em até 3 dias, pela regra de ciclo de cada cartão. Vencimentos próximos já apareciam no guia da Visão geral. Saldo previsto do mês (item 2.3A do plano) já existia no balanço da Visão geral; nada foi duplicado.
- **Revisão independente:** aprovado com ressalvas, sem bloqueantes. Corrigidos: subtração do limite em mês consolidado, conta inexistente no estorno, estorno de pagamento antigo sem operação de conta, repetição da chave em outra fatura, botão de limite em consolidação e texto do aviso.
- **Limitações registradas:** fluxos antigos de consolidar, corrigir vencimento e confirmar fatura do banco continuam tratando como "paga" uma fatura com pagamento estornado (só bloqueiam mais); com fatura vencida em aberto, o limite comprometido da tela (que soma vencidas) e o do banco (que começa no mês atual) já divergiam antes e o recurso novo segue cada base.
- **Testes:** `tests/wallet/wallet-limit-flag-and-reopen.test.ts` 5/5 (Postgres em memória com funções reais); testes TS da Carteira 422/422; `npm run test:quality` exit 0; `npm run test:wallet-visual-next` 62/62. Verificado em produção: coluna e funções criadas, só `authenticated` executa, nenhum lançamento fora do limite e nenhum pagamento estornado (nada mudou para quem não usa).

## 26/11/2026 — Fase 1: ciclo do cartão (fechamento dinâmico, dia útil, fechamento do mês, regra por mês)

**Novidades (migration `20261126160000_wallet_card_cycle_rules.sql`, aplicada e registrada em produção).**
- **Resolvedor único** `private.wallet_card_cycle_dates` (SQL) e `resolveCardCycleDates` (`components/wallet/invoiceStatementDomain.ts`): precedência fechamento/vencimento informados para o mês → regra vigente no mês → modo → dia útil. O roteamento de compras (`private.wallet_card_first_due_date`) passa a usá-lo, por mês de vencimento.
- **Fechamento dinâmico:** modo "alguns dias antes do vencimento" (1 a 20 dias), além do dia fixo.
- **Vencimento em dia útil:** opção por cartão; sábado, domingo e feriados nacionais (fixos, Carnaval, Sexta-feira Santa e Corpus Christi) passam para o próximo dia útil. Feriados estaduais e municipais não entram (aviso na tela).
- **Fechamento deste mês:** ação na fatura para informar a data real em que o banco fechou; vale só para aquele mês (`personal_wallet_set_invoice_closing_date`, coluna `closing_date` em `personal_wallet_card_invoice_facts`).
- **Regra vale do mês em diante:** tabela `personal_wallet_card_cycle_settings` (RLS: só leitura do dono). Mudar fechamento, vencimento, modo ou dia útil grava uma regra nova a partir da fatura aberta pela regra anterior; faturas anteriores mantêm a regra antiga. Carga inicial: a regra atual de cada cartão vale para todo o histórico.
- **Tela do cartão** (`CardEditModal.tsx`): escolha do modo de fechamento, dias antes do vencimento e vencimento em dia útil (`personal_wallet_set_card_cycle_rules`).
- **Comportamento alterado de propósito:** o vencimento informado pelo banco para um mês passa a valer também no roteamento (uma compra numa fatura fechada, feita entre o vencimento nominal e o vencimento real informado, continua nessa fatura). Cartões com dia fixo mantêm exatamente o mês de fatura de antes — conferido em produção: 0 divergências em 41 datas por cartão. Cartão sem dia de fechamento ou vencimento mantém o ciclo pelo mês civil.
- **Revisão independente:** reprovada na primeira versão (funções novas restritas ao administrador apesar da Carteira aberta a todos; código dependente da migration). Corrigido: `can_access_personal_wallet()`, migration aplicada antes do código, regra nova começando na fatura aberta, valor em edição com precedência sobre o vencimento salvo, cartões sem dias preservados, validação do fechamento contra o vencimento informado.
- **Testes:** `tests/wallet/wallet-card-cycle-rules.test.ts` 10/10 (mesmos casos no Postgres em memória e no TS: 6 regras × 8 meses × 8 datas de compra, feriados, fechamento do mês, histórico, gatilho); testes TS da Carteira 416/416 após ajuste das guardas de consulta; `npm run test:quality` exit 0; `npm run test:wallet-visual-next` 62/62.
- **Limitações:** telas de importação (`FlatSmartStatementReader`, `walletTimeline`, ferramentas de `minhasFinancasWalletTools`) ainda calculam o ciclo pelo dia fixo; salvar o cartão grava os dados gerais e a regra do ciclo em duas chamadas (se a segunda falhar, a mensagem aparece e a regra pode ser salva de novo).

## 26/11/2026 — Contrato com mais de uma fonte volta a funcionar

**Correção (migration `20261126140000_restore_loan_funding_allocations.sql`, aplicada e registrada em produção).** `finalize_loan_funding_allocations_v1`, chamada por `services/contracts.service.ts` ao criar contrato com mais de uma fonte de capital, não existia no banco: a migration de 17/11 que a criava nunca foi aplicada inteira. O contrato era gravado, mas a saída das fontes falhava. A função foi restaurada a partir daquele arquivo, com a compra no cartão usando a data do empréstimo (`start_date`). Verificado no banco: função criada, executável só por `authenticated`, versão registrada. A migration `20261119220000_open_personal_wallet_to_all_users` tem conteúdo idêntico ao do banco, mas a versão **não foi registrada** no histórico (registro pendente de autorização). Testes: `tests/financial/card-funded-loan-wallet-charge.test.ts` 11/11. Contratos criados antes desta correção com várias fontes não foram alterados.

## 26/11/2026 — Fase 0: operações de cartão em uma única transação

**Correções (migration `20261126120000_wallet_atomic_card_operations.sql`).** Três operações que a tela montava com várias chamadas separadas passam a ser uma única RPC transacional e idempotente:
- **Restante da fatura** (`personal_wallet_roll_invoice_remainder`): levar o restante para a próxima fatura ou parcelá-lo quita o restante e lança o valor no destino na mesma transação. Antes, a segunda etapa recebia um `request_id` inválido (`uuid:roll-clear`) e sempre falhava; o pagamento principal ficava registrado e o restante permanecia na fatura atual. O servidor confere o saldo restante enviado pela tela e recusa se mudou; o parcelamento usa a categoria "Parcelamento de fatura".
- **Antecipação de parcelas** (`personal_wallet_advance_installments`): move as próximas parcelas para a fatura escolhida, preservando a compra e a numeração (5/10 continua 5/10); o desconto vira crédito na mesma fatura. Antes, a compra era cancelada e recriada em até três lançamentos, sem proteção contra repetição. Fatura já paga não é reaberta.
- **Excluir parcelas** (`personal_wallet_cancel_installments`): "só esta" ou "esta e as seguintes" cancela as parcelas escolhidas e mantém as demais, inclusive as pagas; o total da compra passa a ser o das parcelas restantes. Antes, a compra era cancelada e recriada.
- **Tela** (`features/wallet/pages/WalletCardsPage.tsx`, `services/personalWallet.service.ts`): cada ação chama só a RPC correspondente.
- **Testes:** `tests/wallet/wallet-atomic-card-operations.test.ts` (Postgres em memória com as funções reais das migrations: valores, repetição, falha sem efeito parcial, outro usuário, guarda contra chamadas encadeadas na tela).

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
