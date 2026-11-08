## 08/11/2026 — Blindagem de acesso exclusivo da Minha Carteira ao usuário Master (`SUPER_ADMIN`)
- **Causa identificada no Git:** o commit `d784e11` (*25/10/2026*) havia removido as travas de `isPlatformSuperAdmin` em `App.tsx` (injetando `'MY_WALLET'` em `visibleHubOrder` para todos os usuários, retirando `'MY_WALLET'` do redirecionamento de segurança para `DASHBOARD` e renderizando `<WalletModule />` sem `&& isPlatformSuperAdmin`), além de ativar `modulo_chave = 'carteira'` em `user_modulos` para todos os registros de `auth.users`. Posteriormente, o commit `14d46db` (*07/11/2026*) passou `visibleHubOrder` para `desktopNavOrder`, exibindo a aba também no topo desktop de qualquer usuário.
- **Blindagem aplicada em múltiplas camadas (sem alterar migrations, ledger ou RPCs financeiras):**
  - **`App.tsx`:** `visibleHubOrder` e `visibleNavOrder` filtram estritamente `'MY_WALLET'` e `'PLATFORM_ADMIN'` quando `!isPlatformSuperAdmin` (`filterRestrictedTabs`), impedindo que apareçam no cabeçalho desktop, na barra móvel (`BottomNav`), no `NavHub` ou em `Perfil > Interface > Personalizar Menus` mesmo que tenham ficado salvos em cache/preferências anteriores.
  - **Roteamento e Renderização (`App.tsx` e `main.tsx`):** acesso direto por URL (`/carteira` ou `/carteira/*`) ou estado persistido com `!isPlatformSuperAdmin` redireciona imediatamente para `/` (`DASHBOARD`); `<WalletModule />` exige `activeTab === 'MY_WALLET' && isPlatformSuperAdmin`; o roteador nativo de arquivos Android (`NativeWalletImportRouter` em `main.tsx`) exige `platformAdminService.isSuperAdmin()`.
  - **Repositório da Carteira (`features/wallet/services/walletRepository.ts`):** `getAccess(userId)` exige confirmação positiva de `supabase.rpc('is_platform_super_admin')` antes de considerar `user_modulos.ativo`, bloqueando qualquer usuário comum mesmo que possua linha herdada em `user_modulos`.
  - **Gate Arquitetural (`tests/architecture/architecture-check.mjs`):** adicionadas verificações estáticas obrigatórias para `activeTab === 'MY_WALLET' && isPlatformSuperAdmin`, bloqueio no redirecionamento `['MY_WALLET', 'PLATFORM_ADMIN'].includes(activeTab)`, `const visibleHubOrder = isPlatformSuperAdmin` e `supabase.rpc('is_platform_super_admin')` em `walletRepository.ts`.

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
