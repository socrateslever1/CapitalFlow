# Arquitetura Offline-First do Portal

## Objetivo

Permitir que o Portal do Cliente abra e opere com resiliencia mesmo sem internet, sincronizando mutacoes quando a conectividade voltar.

## Componentes implementados

## 1) Service Worker

- Arquivo: `/service-worker.js`
- Funcao:
  - cache do app shell (`/`, `/index.html`, `/index.css`);
  - fallback de navegacao para `/index.html` em offline;
  - cache de assets same-origin;
  - atualizacao controlada com `SKIP_WAITING`.

## 2) Registro do Service Worker

- Arquivo: `/main.tsx`
- Funcao:
  - registra SW no `window.load`;
  - trata `updatefound` para ativacao imediata da nova versao.

## 3) Persistencia local (IndexedDB)

- Arquivo: `/services/offline/portalOfflineStore.ts`
- Banco: `capitalflow_offline`
- Stores:
  - `portal_snapshots`: snapshot de leitura do portal por chave `token::code`;
  - `portal_outbox`: fila de mutacoes pendentes.

## 4) Camada de servico do portal

- Arquivo: `/services/portal.service.ts`
- Funcao:
  - grava e le snapshot offline;
  - enfileira intencao de pagamento quando offline ou falha de sync;
  - executa flush da outbox em lote;
  - expoe stats e retry de itens `DEAD`.

## 5) Orquestracao no hook do portal

- Arquivo: `/features/portal/hooks/useClientPortalLogic.ts`
- Funcao:
  - carrega remoto e salva snapshot;
  - em erro de rede, cai para snapshot local;
  - roda sincronizacao no startup, `online`, `visibilitychange` e intervalo (30s);
  - recarrega dados apos sincronizacao com sucesso.

## Fluxo de leitura

1. Tenta carregar portal no backend (RPCs).
2. Se sucesso:
   - hidrata estado;
   - salva snapshot local.
3. Se falha:
   - tenta snapshot local;
   - se existir, renderiza dados locais;
   - se nao existir, retorna erro para UI.

## Fluxo de escrita (intencao de pagamento)

1. Usuario envia intencao.
2. Se offline:
   - evento vai para outbox (`PENDING`).
3. Se online e RPC falhar:
   - evento tambem vai para outbox (`PENDING`).
4. Sync worker (no app):
   - tenta enviar;
   - sucesso: remove da outbox;
   - falha: marca `FAILED` com backoff;
   - excedeu tentativas: `DEAD`.

## Modelo da outbox

Campos principais:

- `status`: `PENDING | FAILED | DEAD`
- `attempts`
- `maxAttempts`
- `nextRetryAt`
- `lastAttemptAt`
- `lastError`

Regras:

- deduplicacao de evento equivalente (token/code/tipo/comprovante);
- backoff exponencial com teto de 5 minutos;
- limite padrao de tentativas: 7;
- itens `DEAD` podem ser reencaminhados manualmente.

## Dependencia externa obrigatoria

Pagamento online por Mercado Pago depende da Edge Function:

- `mp-create-preference` (publicada no projeto Supabase)

Sem ela publicada, o portal nao gera link de pagamento online.

