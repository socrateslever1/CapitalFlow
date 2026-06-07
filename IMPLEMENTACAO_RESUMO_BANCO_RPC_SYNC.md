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

