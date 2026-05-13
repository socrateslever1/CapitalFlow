# Checklist de Producao - Portal Offline-First

## Infraestrutura

- [ ] Edge Function `mp-create-preference` publicada no projeto correto.
- [ ] Variaveis de ambiente da funcao conferidas (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN` quando aplicavel).
- [ ] CORS da funcao validado para origem da aplicacao.

## Aplicacao Web

- [ ] Service Worker registrado no navegador.
- [ ] App shell cacheado (`/`, `/index.html`, `/index.css`).
- [ ] Navegacao offline retorna fallback de `index.html`.

## Dados locais

- [ ] IndexedDB `capitalflow_offline` criado.
- [ ] Store `portal_snapshots` populada apos carga online.
- [ ] Store `portal_outbox` recebendo mutacoes em offline/falha.

## Sincronizacao

- [ ] Flush automatico rodando (startup, online, visibilitychange, intervalo).
- [ ] Retry/backoff funcionando para itens `FAILED`.
- [ ] Itens `DEAD` aparecendo apenas apos exceder tentativas.
- [ ] Requeue manual de `DEAD` validado.

## Teste funcional minimo

1. Abrir portal online e confirmar carregamento.
2. Desligar internet e recarregar pagina.
3. Confirmar abertura do portal via cache/snapshot.
4. Realizar acao que enfileira intencao.
5. Reativar internet.
6. Confirmar sincronizacao e recarga de dados.

## Aceite final

- [ ] Nenhum erro `NOT_FOUND` para `mp-create-preference`.
- [ ] Fluxo offline->online concluindo sem perda de evento.
- [ ] Portal consistente apos recarga automatica pos-sync.

