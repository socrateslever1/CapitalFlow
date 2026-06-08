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

