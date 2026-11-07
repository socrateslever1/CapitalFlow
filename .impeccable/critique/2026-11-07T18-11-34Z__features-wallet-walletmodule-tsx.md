---
target: Minha Carteira (features/wallet/WalletModule.tsx)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\LEVER\\Documents\\Github\\CapitalFlow\\features\\wallet\\WalletModule.tsx"
target_fingerprint: "sha256:2055aa43724c9b565330a11b3fbd5d58a1fa51191ca74f38e91991275d5c5058"
target_path: "C:\\Users\\LEVER\\Documents\\Github\\CapitalFlow\\features\\wallet\\WalletModule.tsx"
timestamp: 2026-11-07T18-11-34Z
slug: features-wallet-walletmodule-tsx
---
Method: dual-agent (A: 5c9fdbdb-1579-4772-aa92-378e915c8905 · B: 27c0230b-b758-4034-8859-3bbbe5ddfda8)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Sincronização em segundo plano sem ação de atualizar explícita na aba Geral (`WalletOverviewPage.tsx:209-216`), embora skeletons e barras de progresso sejam sólidos |
| 2 | Match System / Real World | 3 | Modelo bancário brasileiro forte, mas vaza nomes internos de TypeScript (`Auditoria dos fatos do balanço (WalletBalanceFacts):`) e enums crus em `WalletOverviewPage.tsx:303-319` |
| 3 | User Control and Freedom | 3 | `QuickExpenseModal.tsx:277-286` e `CardDetailModal.tsx:105` criam `<div role="dialog">` próprios sem fechar no `Escape` nem restaurar foco |
| 4 | Consistency and Standards | 2 | Três padrões concorrentes de modal/formulário (`Modal.tsx` vs dialogs manuais com `z-[2400]` e emojis em abas), formulário inline órfão `newExpense` em `WalletCardsPage.tsx:979-1031` e divergência de cor do Mercado Pago entre `BankStack.tsx:73` e `walletPresentation.ts:8` |
| 5 | Error Prevention | 4 | Excelente: chaves de idempotência (`requestIdRef`, `CardRegistrationAttempt`), alerta de fatura fechada, aviso de cheque especial e botão "Igualar saldo" ao vincular Fonte de Capital |
| 6 | Recognition Rather Than Recall | 3 | `WalletBalanceDock` e saldos embutidos nos `<option>` ajudam a memória de trabalho, mas a coluna direita de `WalletCardsPage.tsx:650-769` empilha 6 zonas antes do extrato |
| 7 | Flexibility and Efficiency | 3 | Ótimos aceleradores: calculadora `fx` inline (`FinancialCalculatorInput`), modo em lote "Salvar e continuar", início em parcela intermediária ("Iniciar na parcela X de Y") e scanner por câmera |
| 8 | Aesthetic and Minimalist Design | 2 | Redundância no topo da aba Geral (`WalletBalanceDock` repete exatamente os totais de `WalletOverviewSummary` logo abaixo) e microtipografia de `7px–9px` nos cartões (`BankStack.tsx`, `VirtualCreditCard.tsx`) |
| 9 | Error Recovery | 3 | Recuperação parcial em lote preserva itens que falharam (`WalletCardsPage.tsx:174-179`), mas `WalletCardsPage.tsx:636` passa `error={error || notice}` para `WalletPageFrame`, exibindo avisos de sucesso em banner vermelho de erro (`AlertTriangle`) |
| 10 | Help and Documentation | 3 | Explicações claras de domínio financeiro nas telas de gastos e receitas, embora por vezes se repitam como avisos defensivos em múltiplos cartões |
| **Total** | | **29/40** | **Good (72.5%)** |

#### Design Specificity Verdict

**LLM assessment**: A Minha Carteira é fortemente ancorada no domínio bancário e de crédito brasileiro do CapitalFlow — separa com rigor liquidez efetiva em conta (`Saldo Efetivo`), limite de crédito (`Limite disponível`), ciclos de fatura e orientação assistiva somente leitura (`WalletSpendingGuide`), além de conectar recebimentos diretamente ao motor canônico de empréstimos (`QuickIncomeModal.tsx:99-169`). Onde perde especificidade é na repetição de caixas planas `rounded-xl border border-slate-800 bg-slate-900` com o mesmo peso visual na visão geral e no vazamento de rótulos técnicos de depuração (`WalletBalanceFacts`).

**Deterministic scan**: `impeccable detect --json features/wallet components/wallet` retornou 115 achados (3 warnings, 112 advisories):
- `border-accent-on-rounded` (2 warnings em `CardCameraScannerModal.tsx:173,183`): **falso positivo** (são cantoneiras em L da mira da câmera OCR, não cartões com borda lateral).
- `ai-color-palette` (1 warning em `VirtualCreditCard.tsx:27`): **falso positivo** (tema roxo/rosa exclusivo da identidade real do cartão Nubank/Ultravioleta).
- `design-system-font-size` (104 advisories): **82 ocorrências de `text-[11px]`** não registradas no frontmatter de `DESIGN.md`, **21 ocorrências de `7px–9px`** em rótulos/botões de cartão (`BankStack.tsx`, `VirtualCreditCard.tsx`, `CardDetailModal.tsx`, `AccountActivityPanel.tsx`, `CardInvoiceStatement.tsx`) e 1 falso positivo (`7rem` marca d'água decorativa `aria-hidden` em `BankStack.tsx:144`).
- `design-system-color` (7 advisories): 6 falsos positivos em paradas de gradiente metálico do chip EMV e tema de marca (`VirtualCreditCard.tsx:203,226`, `walletPresentation.ts:64`) e **1 desvio real** (`#f59e0b` literal em `AccountCardStack.tsx:55`).
- `bounce-easing` (1 advisory em `CardCameraScannerModal.tsx:179`): **genuíno** (`animate-bounce` na linha de laser do scanner sem `motion-reduce`).

**Visual overlays**: Nenhuma ferramenta MCP de automação de navegador está exposta nesta sessão; utilizado o sinal de fallback (scanner estático CLI + verificação de código-fonte).

#### Overall Impression

A engenharia financeira e a proteção contra erros da Minha Carteira são exemplares (idempotência, privacidade profunda e inteligência de parcelas), mas a experiência visual sofre com redundância de saldos na aba Geral, excesso de campos simultâneos no cadastro de conta, avisos de sucesso renderizados como erro em Cartões e microtipografia/alvos de toque abaixo de 24px nos cartões físicos.

#### What's Working

1. **Inteligência de Parcelas Intermediárias e Ciclos (`components/wallet/QuickExpenseModal.tsx:543-715`)**: Permite alternar entre valor da parcela e valor total, iniciar na parcela `X de Y`, navegar entre faturas (`< Mês/Ano >`) e ver o resumo em português claro antes de gravar.
2. **Salvaguardas Financeiras Idempotentes (`features/wallet/pages/WalletCardsPage.tsx:564-583`, `components/wallet/CreateAccountModal.tsx:235-269, 512-525`)**: `CardRegistrationAttempt` e `createdAccountRef` impedem duplicação em conexões móveis instáveis, e o botão `"Igualar saldo"` evita divergência ao vincular uma Fonte de Capital.
3. **Modo de Privacidade Profundo (`features/wallet/components/WalletSpendingGuide.tsx:21-38`, `components/wallet/WalletOverviewSummary.tsx:92`)**: Oculta não apenas strings em R$, mas também barras de progresso (`aria-valuenow`), percentuais, categorias e cores de déficit/superávit.

#### Priority Issues

- **[P1] Avisos de sucesso renderizados como erro vermelho em `WalletCardsPage` + formulário inline `newExpense` órfão**
  - **Why it matters**: `WalletCardsPage.tsx:636` passa `error={error || notice}` para `WalletPageFrame.tsx:22-24`, exibindo mensagens positivas como `"Cartão ... reconhecido com sucesso!"` (`line 1121`) dentro de um alerta vermelho `AlertTriangle`. Além disso, `newExpense` (`lines 66, 979-1031`) é código morto duplicado ao lado de `QuickExpenseModal`.
  - **Fix**: Separar as props `error` e `notice` em `WalletPageFrame.tsx` (renderizando `notice` com estilo informativo azul/esmeralda e `role="status"`) e remover o estado/formulário morto `newExpense` em `WalletCardsPage.tsx`.
  - **Suggested command**: `$impeccable harden`

- **[P1] Redundância do `WalletBalanceDock` na aba Geral e exposição de tokens técnicos (`WalletBalanceFacts`) na interface**
  - **Why it matters**: Na rota `visao-geral`, `WalletBalanceDock.tsx:13-16` exibe exatamente os mesmos totais de contas e cartões que `WalletOverviewSummary.tsx:33-100` mostra imediatamente abaixo, além de disparar busca duplicada de snapshot. No rodapé do balanço (`WalletOverviewPage.tsx:303-319`), a UI exibe `"Auditoria dos fatos do balanço (WalletBalanceFacts):"` com enums crus (`{state} · {origin}`).
  - **Fix**: Ocultar `WalletBalanceDock` quando `route === 'visao-geral'` em `WalletModule.tsx:63` e substituir os códigos crus em `WalletOverviewPage.tsx:302-324` por descrições legíveis via `describeWalletBalanceFact()`.
  - **Suggested command**: `$impeccable clarify`

- **[P1] Alvos de toque abaixo de 24px e microtipografia (`7px–9px`) com baixo contraste nos cartões (`BankStack.tsx` e `VirtualCreditCard.tsx`)**
  - **Why it matters**: Botões interativos de copiar e ações no verso do cartão (`BankStack.tsx:99, 160-161, 185-187, 196` e `VirtualCreditCard.tsx:234-243`) têm entre 20px e 27px de altura com texto de `7px–9px` e `text-white/50`, violando WCAG 2.2 SC 2.5.8 (mínimo 24x24px, recomendado 44x44px) e provocando toques acidentais que viram o cartão 3D. Além disso, `BankStack.tsx:132` aninha `<button>` dentro de `<div role="button">`, e `VirtualCreditCard.tsx:153` não possui suporte a teclado.
  - **Fix**: Elevar textos mínimos de ação para `text-[10px]`/`text-xs`, aumentar alvos de toque dos botões do carrossel e ações do cartão para `min-h-11` (ou movê-los para uma barra externa abaixo do cartão) e corrigir a semântica ARIA/teclado de `BankStack.tsx` e `VirtualCreditCard.tsx`.
  - **Suggested command**: `$impeccable adapt`

- **[P2] Sobrecarga cognitiva em `CreateAccountModal` com 10+ campos simultâneos e seletor de tipo duplicado**
  - **Why it matters**: `components/wallet/CreateAccountModal.tsx:341-429` apresenta um seletor de 2 botões (`Conta Bancária` vs `Carteira Física`) seguido imediatamente por um `<select>` de `"Tipo de Conta"` que inclui `"Carteira Física (Dinheiro)"` novamente, além de exibir PIX, Fonte de Capital, conta de terceiros, dados de agência/conta e criação de cartão todos abertos de uma só vez.
  - **Fix**: Remover a opção duplicada de carteira física do `<select>` quando conta bancária estiver ativa e agrupar os campos opcionais (PIX, dados bancários, vínculo com Fonte de Capital e cartão vinculado) em disclosure progressivo (`<details>`).
  - **Suggested command**: `$impeccable distill`

- **[P2] Modais manuais (`QuickExpenseModal`, `CardDetailModal`, `CardCameraScannerModal`, `WalletPayablesPanel`) fora do padrão `<Modal>` compartilhado**
  - **Why it matters**: Esses componentes usam `<div role="dialog">` próprio sem trap de foco, sem fechar na tecla `Escape`, sem restaurar foco ao elemento de origem e com `z-index` e estilos divergentes (`z-[2400]` e emojis `💳`/`🏦` em `QuickExpenseModal.tsx:277,336,353`).
  - **Fix**: Padronizar com o componente compartilhado `components/ui/Modal.tsx` (ou aplicar hook compartilhado de `Escape` + focus trap) e unificar o import de `CreateAccountModal` entre `WalletOverviewPage.tsx:22` e `WalletAccountsPage.tsx:13`.
  - **Suggested command**: `$impeccable polish`

#### Persona Red Flags

**Alex (Power User)**: Pressionar `Esc` em `QuickExpenseModal.tsx:277` ou no menu `"Mais opções"` de `WalletCardsPage.tsx:745-767` não fecha o overlay; `"Histórico de entradas"` em `WalletIncomePage.tsx:21` inicia sempre recolhido mesmo quando não há receitas recorrentes.

**Sam (Accessibility-Dependent User)**: `BankStack.tsx:132` aninha `<button>` dentro de `<div role="button">`; `VirtualCreditCard.tsx:153` usa `<div onClick>` sem `tabIndex`/`onKeyDown`; checkboxes de importação PDF em `WalletCardsPage.tsx:824` não têm `aria-label`; `<input type="month" className="opacity-0">` em `QuickExpenseModal.tsx:558` recebe foco invisível sem `focus-within:ring-2` no `<label>` pai; textos `text-slate-500` sobre `bg-slate-900` (~3.6:1) e `7px–9px` falham WCAG AA.

**Casey (Distracted Mobile User)**: Botões de copiar e trocar cartão em `BankStack.tsx:99,160-187,196` têm 20–27px e disparam flip acidental com o polegar; barra de 5 abas no topo (`WalletModule.tsx:43-62`) espreme rótulos em ~60px em telas de 320px sem `truncate`; `QuickExpenseModal` não persiste rascunho (`useWalletDraft`) se o usuário alternar para o app do banco no meio do preenchimento.

#### Minor Observations

- `WalletOverviewPage.tsx:172-176, 385-411`: estado `quickModal` (`CASH_WALLET` e `CARD_OPENING`) nunca é acionado (`setQuickModal` não tem chamadas).
- `AccountActivityPanel.tsx:108`: usa `window.confirm` nativo bloqueante para anular lançamento manual em vez de modal de confirmação do sistema.
- `BankStack.tsx:73` vs `walletPresentation.ts:8`: cor do Mercado Pago diverge entre `#1F2229` na pilha de cartões e `#00a9e0` no resumo da visão geral.
- `DESIGN.md`: `text-[11px]` aparece 82 vezes na Carteira sem estar documentado nos tokens tipográficos do frontmatter.

#### Questions to Consider

- E se a aba `Geral` respondesse primeiro a uma única pergunta — *"Quanto posso gastar com segurança hoje?"* — sem repetir os saldos de contas e cartões no `WalletBalanceDock` e no `WalletOverviewSummary` simultaneamente?
- Por que criar uma conta bancária (`CreateAccountModal`) exige percorrer mais de 10 controles abertos, enquanto criar um cartão (`WalletCardsPage`) destaca *"Apenas o banco é obrigatório"* com disclosure progressivo?
- Os microbotões de `7px–8px` dentro do cartão 3D (`BankStack`) realmente ajudam no celular, ou uma faixa de ações rápidas com 44px de altura logo abaixo do cartão seria mais rápida, legível e livre de cliques acidentais?
