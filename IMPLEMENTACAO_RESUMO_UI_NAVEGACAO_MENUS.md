# Implementacoes - UI NAVEGACAO MENUS

## 2026-06-07
- **Objetivo:** Corrigir sobreposicao de badges nos cards mobile e adicionar acoes uteis no container agrupado de cliente.
- **Arquivos Alterados:**
    - `/components/cards/LoanCardComposition/Header.tsx`: Badges de risco/status agora ficam abaixo do nome do cliente e antes da modalidade/codigo do contrato, evitando sobreposicao com o nome e com botoes no mobile.
    - `/components/cards/ClientGroupCard.tsx`: Card agrupado refeito mantendo o resumo do cliente, corrigindo textos em portugues e adicionando acoes abaixo dos contratos: cobrar todos, cobrar vencidos, cobrar vencendo, unificar e arquivar com escolha entre todos ou contrato individual.
    - `/components/cards/LoanCardComposition/Body.tsx`: Corrigidos textos internos do card expandido para portugues correto.
- **Ajuste Posterior - Acoes compactas do grupo:**
    - `/components/cards/ClientGroupCard.tsx`: As acoes do container agrupado foram compactadas para caber mais funcoes uteis. Incluido botao `Portal` para copiar o link do cliente/contrato, mantendo opcoes por contrato quando houver mais de um. Tambem foram reduzidos arredondamentos do card e dos botoes internos para um visual levemente arredondado.
- **Ajuste Posterior no Mesmo Dia:**
    - `/components/cards/ClientGroupCard.tsx`: A cobranca do grupo deixou de marcar varios contratos enquanto abre apenas uma conversa; agora `Cobrar`, `Vencidos` e `Vencendo` exibem uma lista e a cobranca e feita contrato por contrato. `Unificar` tambem passou a abrir escolha entre unificar todos ou renegociar um contrato individual.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Alteracao limitada a composicao visual e acoes do card/lista do painel.

## 2026-06-08
- **Objetivo:** Iniciar padronizacao visual do sistema com cantos levemente arredondados, textos tecnicos traduzidos e componentes de contrato mais consistentes.
- **Arquivos Alterados:**
    - `/utils/translationHelpers.ts`: Refeito o mapa de traducoes de tipos de transacao, status, filtros e documentos para remover textos tecnicos/ingles visiveis no frontend, mantendo as mesmas funcoes publicas.
    - `/components/ui/Card.tsx`, `/components/ui/Modal.tsx`, `/components/ui/Tooltip.tsx`, `/components/ui/LoadingScreen.tsx`: Padronizados quadros e botoes de base para `rounded-lg`, sem alterar fluxo ou estrutura.
    - `/components/StatCard.tsx`: Padronizado arredondamento dos cards estatisticos e blocos internos.
    - `/components/cards/LoanCard.tsx`, `/components/cards/LoanCardComposition/Header.tsx`, `/components/cards/LoanCardComposition/QuickActions.tsx`, `/components/cards/LoanCardComposition/Footer.tsx`, `/components/cards/LoanCardComposition/Body.tsx`, `/components/cards/LoanCardComposition/Ledger.tsx`: Padronizados card de contrato, acoes, rodape, agrupamento de contratos unificados e extrato recente para cantos leves e rotulos em portugues.
    - `/components/cards/components/InstallmentCard.tsx`, `/components/cards/components/LedgerList.tsx`: Ajustados card de parcela e datas/titulos do extrato recente.
    - `/pages/ContractDetails/LedgerTimeline.tsx`: Removidos icones emoji do extrato detalhado e substituidos por marcadores compactos/textuais, mantendo tamanho consistente.
    - `/features/finance/extrato/components/ExtratoOperationsList.tsx`: Padronizado arredondamento do quadro e data em `pt-BR`.
    - `/features/agreements/components/RenegotiationModal.tsx`: Padronizados botoes, inputs e paineis do modal de renegociacao para cantos leves.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Observacoes:** Permanecem apenas avisos antigos do Vite sobre chunks/imports dinamicos; sem erro de build.
- **Escopo:** Primeira passada focada em componentes e telas de maior impacto visual/operacional. Sem alteracao de regras financeiras, banco ou rotas.

### Complemento - Modalidades em portugues
- **Objetivo:** Corrigir vazamento de codigos tecnicos de modalidade, especialmente `INSTALLMENT_FIXED`, no frontend.
- **Arquivos Alterados:**
    - `/utils/translationHelpers.ts`: Adicionado `translateBillingCycle()` para traduzir modalidades como `INSTALLMENT_FIXED`, `DAILY_FREE`, `DAILY_FIXED_TERM` e `MONTHLY`.
    - `/components/cards/LoanCardComposition/Header.tsx`: Badge de modalidade do card passou a usar traducao central.
    - `/components/cards/SourceCard.tsx`: Lista de contratos vinculados a uma fonte passou a exibir modalidade traduzida.
    - `/containers/ClientPortal/ClientPortalView.tsx`, `/containers/ClientPortal/components/PortalContractItem.tsx`, `/features/portal/ClientPortalView.tsx`: Portal passou a exibir a modalidade real traduzida, em vez de cair genericamente em "Credito Mensal".
    - `/features/loans/domain/loanForm.validators.ts`: Mensagem de erro de modalidade invalida passou a usar traducao amigavel.
    - `/utils/auditHelpers.ts`: Historico/auditoria passou a traduzir alteracoes de modalidade.
    - `/pages/LegalDocumentEditorPage.tsx`: Texto juridico antigo passou a usar modalidade traduzida.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Apenas apresentacao/traducao de modalidades; sem alteracao de calculo, persistencia ou regras de negocio.

### Complemento - Auth, equipe e portal de pagamento
- **Objetivo:** Avancar a padronizacao visual e textual em telas auxiliares, removendo textos corrompidos e cantos excessivamente arredondados.
- **Arquivos Alterados:**
    - `/features/auth/AuthScreen.tsx`: Corrigidos textos visiveis de login, convite, recuperacao e suporte; inputs, botoes e painel principal foram ajustados para cantos leves.
    - `/pages/TeamPage.tsx`: Corrigidos textos de gestao de equipe e padronizados seletor, banners, botoes e quadro de membros.
    - `/features/team/components/TeamEditorModal.tsx`, `/features/team/components/MemberEditorModal.tsx`, `/features/team/components/InviteModal.tsx`, `/features/team/components/MemberCard.tsx`, `/features/team/components/TeamAIInsight.tsx`: Corrigidos textos quebrados e padronizados cards, botoes e inputs para `rounded-lg`.
    - `/features/portal/components/PortalPaymentModal.tsx`, `/features/portal/components/payment/PaymentViews.tsx`, `/features/portal/components/AsaasCheckoutModal.tsx`, `/features/portal/components/PortalChatDrawer.tsx`: Corrigidos textos de pagamento/cartao/chat e reduzido arredondamento dos modais, inputs, alertas e botoes.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ajuste visual/textual. Sem alteracao de calculo financeiro, regras de pagamento, banco ou rotas.

### Complemento - Simulador, formulario e juridico/publico
- **Objetivo:** Avancar a proxima fase de padronizacao visual em telas operacionais amplas, mantendo cantos leves e corrigindo textos corrompidos em areas de uso frequente.
- **Arquivos Alterados:**
    - `/features/simulator/SimulatorPanel.tsx`: Corrigidos textos visiveis de parametros, calculo, captacao, resumo e finalizacao; paineis, botoes, inputs e listas foram padronizados para cantos leves.
    - `/components/forms/LoanFormFinancialSection.tsx`, `/components/forms/LoanFormClientSection.tsx`, `/components/forms/LoanFormDocumentsSection.tsx`, `/components/forms/LoanFormActions.tsx`: Corrigidos textos de condicoes, diaria, garantia e financiamento; inputs, botoes, blocos de custo e documentos foram ajustados para `rounded-lg`.
    - `/pages/LegalDocumentEditorPage.tsx`: Editor juridico principal padronizado em botoes, quadro de documento e painel auxiliar.
    - `/features/legal/components/*`: Componentes juridicos de confissao, assinatura, visualizacao, relatorio, testemunhas, notificacao, nota promissoria e termo de quitacao foram padronizados para cantos leves.
    - `/pages/Public/PublicSignaturePage.tsx`, `/features/legal/components/PublicLegalSignPage.tsx`: Fluxos publicos de assinatura padronizados em cards, botoes, inputs e termos.
    - `/pages/Public/CampaignLandingPage.tsx`, `/pages/Public/PublicCampaignPage.tsx`, `/pages/Campanha/CampanhaLanding.tsx`: Paginas de campanha padronizadas em formularios, botoes, cards, chat e seletores de valor.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso. `git diff --check` sem erros; apenas avisos de LF/CRLF do Git no Windows.
- **Escopo:** Ajuste visual/textual. Sem alteracao de regra financeira, assinatura juridica, banco, rotas ou integracoes externas.

### Complemento - Capital, agenda, suporte e modais operacionais
- **Objetivo:** Completar a rodada de acabamento em telas auxiliares ainda fora do padrao visual, com foco em capital/fontes, agenda, suporte/chat, extrato financeiro e modais operacionais.
- **Arquivos Alterados:**
    - `/pages/SourcesPage.tsx`: Corrigidos textos visiveis de gestao, inventario e correcao de saldo; botao, alerta, input e logo foram padronizados com cantos leves.
    - `/features/calendar/CalendarView.tsx`, `/features/calendar/components/EventModal.tsx`, `/features/calendar/components/SmartSidebar.tsx`: Corrigidos textos visiveis da agenda e padronizados filtros, cards, busca, acoes e modal de evento.
    - `/features/support/ChatContainer.tsx`, `/features/support/OperatorSupportChat.tsx`, `/features/support/components/*`: Corrigidos textos de chamada/video e padronizados chat, anexos, mensagens, audio, sidebar e input.
    - `/features/finance/extrato/components/ExtratoAIPanel.tsx`, `/features/finance/extrato/components/ExtratoCompositionSection.tsx`, `/features/finance/extrato/components/ExtratoPeriodSelector.tsx`, `/features/finance/extrato/components/ExtratoCards.tsx`: Ajustados paineis e cards do extrato para cantos leves.
    - `/components/modals/CalculatorModal.tsx`, `/components/modals/ModalWrappers.tsx`, `/components/modals/ModalGroups.tsx`, `/components/modals/MessageHubModal.tsx`, `/components/modals/PaymentManagerModal.tsx`, `/components/modals/ReceiptModal.tsx`, `/components/modals/NewAporteModal.tsx`, `/components/modals/AIAssistantModal.tsx`, `/components/modals/wrappers/SystemModalsWrapper.tsx`: Padronizados modais operacionais e corrigidos textos visiveis no recebimento.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso. `git diff --check` sem erros; apenas avisos de LF/CRLF do Git no Windows.
- **Escopo:** Ajuste visual/textual. Sem alteracao de regra financeira, recebimento, calendario, suporte, banco, rotas ou integracoes externas.

### Complemento - Finalizacao global de arredondamento
- **Objetivo:** Encerrar a padronizacao visual global, removendo sobras de `rounded-xl`, `rounded-2xl`, `rounded-3xl` e arredondamentos arbitrarios grandes em telas restantes.
- **Arquivos Alterados:** Ajuste mecanico global em arquivos `.ts` e `.tsx` do projeto, preservando `rounded-full` e estados direcionais como `rounded-tr-none`/`rounded-tl-none`.
- **Validacao:**
    - `rg "rounded-\\[[^\\]]+\\]|rounded-3xl|rounded-2xl|rounded-xl"` sem ocorrencias no codigo fonte.
    - `git diff --check` executado sem erros.
    - `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ajuste visual global. Sem alteracao intencional de regras de negocio, banco, rotas ou integracoes externas.

## 2026-05-01 (Parte 2)
- **Objetivo:** Implementar melhorias de usabilidade: persistÃªncia de estado do contrato selecionado.
- **Arquivos Alterados:**
    - `/hooks/useUiState.ts`: Implementada persistÃªncia de `selectedLoanId` no `localStorage` para manter o contrato selecionado apÃ³s atualizaÃ§Ã£o da pÃ¡gina.
- **ObservaÃ§Ãµes:** O estado persistente `cm_selected_loan_id` garante que a aplicaÃ§Ã£o retorne ao contrato previamente visualizado.

## 2026-05-01 (Parte 8)
- **Objetivo:** Corrigir falha de envio para Edge Function em cenarios com retentativa de rede.
- **Arquivos Alterados:**
    - `/utils/fetchWithRetry.ts`: Ajustada a chamada de `fetch` para clonar `Request` em cada tentativa (`input.clone()`), evitando reutilizacao de body consumido em retries.
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** Mudanca localizada no transporte HTTP compartilhado; nao altera regras de negocio, layout ou contratos de API. Impacto esperado: reduzir erro "Failed to send a request to the Edge Function" em chamadas com corpo JSON.
- **Escopo:** Somente correcao funcional de envio/retry para Edge Functions.

## 2026-06-04 (Parte 3 - Reset Global de Scroll)
- **Objetivo:** Impedir que contrato e demais telas abram no fim da pagina ao navegar/clicar em abrir.
- **Arquivos Alterados:**
    - `/layout/AppShell.tsx`: Scroll principal agora e resetado em `useLayoutEffect`, tambem apos o paint da rota, e o navegador fica com `history.scrollRestoration = manual` durante o uso do shell.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrado o ajuste aplicado.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run build` executado com sucesso. Permanecem apenas avisos antigos de chunk/import dinamico do Vite.
- **Escopo:** Apenas comportamento funcional de scroll/navegacao; sem alteracao visual.

