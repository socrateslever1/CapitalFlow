# Implementacoes - BANCO RPC SYNC

## 2026-05-01 (Parte 1)
- **Objetivo:** Finalizar funcionalidade de cobranÃ§a, corrigir erro de coluna no banco e ajustar layout da busca e visual do modal de aporte.
- **Arquivos Alterados:**
    - `/features/calendar/hooks/useCalendar.ts`: Corrigido erro "column profile_id does not exist" alterando filtro de `profile_id=eq` para `owner_id=eq`.
    - `/components/cards/LoanCardComposition/Header.tsx`: Atualizado comportamento do botÃ£o "Cobrar" para refletir estado "Cobrado" (cor verde) imediatamente ao clicar.
    - `/components/dashboard/DashboardControls.tsx`: Removida transiÃ§Ã£o absoluta do buscador para permitir fluxo no layout, evitando sobreposiÃ§Ã£o com cards.
    - `/components/modals/NewAporteModal.tsx`: Melhorada construÃ§Ã£o visual do modal, aplicando cantos levemente arredondados (`rounded-xl` / `rounded-lg`) em vez de circulares (`rounded-full`) para um visual mais sÃ³brio e profissional.
- **ObservaÃ§Ãµes:** O SQL de migraÃ§Ã£o para colunas de faturamento jÃ¡ havia sido criado previamente. A lÃ³gica de exibiÃ§Ã£o de "O cliente foi cobrado X vezes" no `Body.tsx` jÃ¡ estava correta.

## 2026-05-08 (Parte 6)
- **Objetivo:** Garantir que o botao `Cobrar` vire `Cobrado` e permaneÃ§a travado por 24h apos o clique.
- **Arquivos Alterados:**
    - `/components/cards/LoanCardComposition/Header.tsx`: Adicionado estado local `localLastBilledAt` para usar a hora do clique como referencia imediata da trava de 24h, evitando que refresh/sync com props antigas reverta o botao para `Cobrar`.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` executado com sucesso.
- **Riscos/Observacoes:** A persistencia remota continua sendo feita por `contractsService.markAsBilled`, que atualiza `last_billed_at` e `billing_count`; a mudanca apenas garante consistencia visual local durante a janela de sync.
- **Escopo:** Apenas comportamento funcional do botao de cobranca no card; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-09 (Parte 2)
- **Objetivo:** Remover a exibicao de `Leads` dos menus e da configuracao de interface do perfil.
- **Arquivos Alterados:**
    - `/hooks/useAppState.ts`: `LEADS` removido do menu padrao e filtrado ao carregar perfil/cache e ao salvar configuracao de navegacao.
    - `/hooks/useNavigationStack.ts`: `LEADS` removido da lista de abas consideradas como hub.
    - `/hooks/usePersistedTab.ts`: Aba `LEADS` persistida no navegador passa a ser descartada e redirecionada para `DASHBOARD`.
    - `/layout/NavHub.tsx`: `LEADS` filtrado da lista exibida no menu lateral.
    - `/layout/HeaderBar.tsx`: `LEADS` filtrado da barra superior.
    - `/pages/ProfilePage.tsx`: `LEADS` filtrado da personalizacao de menus em Perfil.
    - `/App.tsx`: Removida renderizacao direta da tela `LEADS` a partir da aba principal.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a remocao.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run lint` executado com sucesso.
- **Escopo:** Apenas remocao de exibicao/navegacao de `Leads`; sem alterar banco, layout geral ou modulos internos de captacao/publico.

## 2026-05-09 (Parte 3)
- **Objetivo:** Garantir que a personalizacao de menus permaneÃ§a apos atualizar a pagina.
- **Arquivos Alterados:**
    - `/hooks/useAppState.ts`: O cache local `cm_cache_*` agora e atualizado quando os dados sao carregados e tambem imediatamente ao salvar `ui_nav_order`/`ui_hub_order`; o salvamento no Supabase passou a renovar a sessao antes do update e verificar `error`, evitando falha silenciosa.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** A causa provavel era o cache local recente restaurando uma configuracao antiga e impedindo nova busca no banco por ate 30s; em caso de falha real no Supabase, agora o sistema registra erro em vez de parecer salvo.
- **Escopo:** Apenas persistencia das preferencias de menu; sem alteracao visual.

## 2026-06-29 (Aporte visivel e classificacao operacional)
- **Objetivo:** Fazer o aporte registrado pela RPC `apply_new_aporte_atomic` aparecer corretamente no contrato e nos calculos operacionais.
- **Arquivos Alterados:**
    - `/pages/ContractDetailsPage.tsx`: A tela do contrato agora mostra `Capital Atual` quando existe aporte, detalhando `Capital Inicial + Aportes`; o resumo financeiro ganhou cards de `Capital Inicial` e `Aportes`.
    - `/domain/dashboard/stats.ts`: O grafico mensal passou a tratar `NOVO_APORTE` como saida de capital.
    - `/domain/finance/dre.calculations.ts`: DRE/classificacao operacional passou a considerar `NOVO_APORTE` como `APORTE`.
    - `/components/modals/AIAssistantModal.tsx`: Contexto financeiro da IA passou a considerar `NOVO_APORTE` nas saidas do mes.
    - `/features/team/components/MemberCard.tsx` e `/features/profile/components/ProfileAuditLog.tsx`: Historicos visuais passam a exibir `NOVO_APORTE` como saida, com sinal negativo.
    - `/utils/printHelpers.ts`: Relatorio impresso/PDF passa a exibir `NOVO_APORTE` como aporte/saida.
- **Validacao:** `npx tsc --noEmit --pretty false`, `git diff --check` e `npx vite build --outDir C:\tmp\capitalflow-aporte-build --emptyOutDir` executados com sucesso. O build manteve apenas avisos antigos de chunks grandes/import dinamico.
- **Escopo:** Exibicao e classificacao de aportes. Sem alterar a RPC, banco ou regra de gravacao do aporte.

## 2026-06-29 (Saldo real acima do status PAID)
- **Objetivo:** Evitar que parcelas/contratos marcados como `PAID` por erro escondam saldo real de principal, juros ou mora.
- **Arquivos Alterados:**
    - `/domain/finance/calculations.ts` e `/domain/loanEngine.ts`: Calculo central de saldo e status agora considera o saldo real antes de aceitar `PAID/PAGO/QUITADO` como quitado.
    - `/services/payments.service.ts` e `/hooks/controllers/usePaymentController.ts`: Registro de pagamento deixa de bloquear parcela marcada como `PAID` se ainda houver saldo aberto.
    - `/supabase/migrations/2026062901_fix_paid_status_with_open_balance.sql`: Nova versao da RPC `process_payment_v3_selective` permite regularizar parcela com status pago indevido, desde que exista saldo real; contrato volta para `ATIVO` se ainda houver saldo.
    - `/components/modals/NewAporteModal.tsx`, `/features/agreements/components/RenegotiationModal.tsx`, `/components/cards/ClientGroupCard.tsx`, `/domain/dashboard/loanGrouping.ts`, `/components/cards/hooks/useLoanCardComputed.ts`: Selecao de parcelas abertas passa a usar saldo real.
    - `/components/modals/AIAssistantModal.tsx`, `/features/dashboard/AIBalanceInsight.tsx`: IA e insight de carteira passam a usar saldo real pelo motor financeiro.
    - `/features/portal/ClientPortalView.tsx`, `/features/portal/mappers/portalDebtRules.ts`, `/features/portal/components/PortalPaymentModal.tsx`: Portal do cliente passa a tratar parcela/contrato como quitado apenas quando o saldo real estiver zerado.
- **Validacao:** `npx tsc --noEmit --pretty false`, `git diff --check` e `npx vite build --outDir C:\tmp\capitalflow-balance-status-build --emptyOutDir` executados com sucesso. O build manteve apenas avisos antigos de chunks grandes/import dinamico.
- **Escopo:** Correcao operacional de consistencia saldo/status. Sem alterar layout visual amplo.

