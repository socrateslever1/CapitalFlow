# Implementacoes - UI NAVEGACAO MENUS

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

