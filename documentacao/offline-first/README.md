# CapitalFlow - Documentacao Offline-First (Portal do Cliente)

Esta pasta centraliza a documentacao tecnica da implementacao offline-first aplicada no Portal do Cliente.

## Escopo documentado

- Cache offline da aplicacao via Service Worker.
- Persistencia local de dados do portal via IndexedDB.
- Fila local (outbox) para intencoes de pagamento.
- Sincronizacao em segundo plano com retry e backoff.
- Tratamento de estado final de falha (`DEAD`) e requeue manual.
- Dependencias de infraestrutura (Edge Function publicada no Supabase).

## Indice

- [ARQUITETURA.md](./ARQUITETURA.md)
- [OPERACAO_E_SUPORTE.md](./OPERACAO_E_SUPORTE.md)
- [CHECKLIST_PRODUCAO.md](./CHECKLIST_PRODUCAO.md)

## Arquivos de codigo relacionados

- `/service-worker.js`
- `/main.tsx`
- `/services/offline/portalOfflineStore.ts`
- `/services/portal.service.ts`
- `/features/portal/hooks/useClientPortalLogic.ts`

