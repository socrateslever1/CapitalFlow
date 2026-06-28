# Implementacoes - PORTAL OFFLINE

## 2026-06-28 - Reforco Offline do App
- **Objetivo:** Corrigir o manifesto PWA e restaurar o comportamento offline robusto do app principal, nao apenas do portal.
- **Arquivos Alterados:**
    - `/public/service-worker.js`: Cache atualizado para `capitalflow-v5`; instalacao passou a cachear o app shell e tambem os assets gerados pelo Vite encontrados no `index.html`, deixando o app utilizavel offline apos a primeira carga online. A mensagem padrao de push foi corrigida para portugues com acentos.
    - `/public/manifest.json`: Corrigidos textos com acentuacao quebrada e mantidos icones locais para funcionamento offline.
    - `/manifest.json`: Alinhado ao manifesto publico, com textos em portugues e icones locais.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-offline-build --emptyOutDir` executado com sucesso. Teste pratico em Chrome headless confirmou service worker ativo, cache `capitalflow-v5`, `index.html`, `manifest.json`, 4 assets do build cacheados e rota `/clientes` abrindo sem rede.
- **Riscos/Observacoes:** O modo offline depende de uma primeira carga online em producao para instalar o service worker e preencher cache/dados locais. No ambiente de desenvolvimento, o app remove service workers por seguranca contra cache antigo.
- **Escopo:** Ajuste limitado a PWA/offline e manifesto; sem alteracao de regra financeira, UI de telas ou sincronizacao de negocio.

## 2026-06-07
- **Objetivo:** Verificar o Portal do Cliente apos as mudancas de renegociacao/Somente Capital e ajustar quadros excessivamente arredondados.
- **Arquivos Alterados:**
    - `/containers/ClientPortal/ClientPortalView.tsx`: Reduzidos os arredondamentos dos quadros principais, cards, modal juridico, aviso, area financeira e botoes grandes para `rounded-lg`, mantendo apenas indicadores circulares/pilulas quando fazem sentido.
    - `/containers/ClientPortal/ClientPortalView.tsx`: Corrigido texto quebrado no aviso de acesso invalido.
- **Verificacao Funcional:**
    - O portal ativo e importado por `/components/AppGate.tsx` a partir de `/containers/ClientPortal/ClientPortalView.tsx`.
    - O calculo do portal usa `/features/portal/mappers/portalDebtRules.ts`, que chama `/domain/finance/calculations.ts`. A regra de `Somente Capital` ja esta centralizada em `calculateTotalDue`, retornando principal e zerando juros/multa.
    - Contratos com renegociacao ativa continuam exibindo parcelas do acordo ativo via `loan.activeAgreement.installments`.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ajuste visual e verificacao de integracao do portal; sem alteracao de regra financeira.

## 2026-05-01 (Parte 3)
- **Objetivo:** Resolver erros crÃ­ticos de banco de dados, portal e aportes.
- **Arquivos Alterados:**
    - `/supabase/migrations/20260501_fix_system_errors.sql`: Criada migraÃ§Ã£o consolidada para corrigir colunas de cobranÃ§a, mismatch de `profile_id`/`owner_id` e atualizar RPCs do portal e aportes.
- **Problemas Resolvidos:**
    1.  **BotÃ£o Cobrar**: Agora persiste `last_billed_at` e `billing_count` corretamente no banco.
    2.  **Novo Aporte**: Corrigida a falha de "Acesso Negado" na RPC `apply_new_aporte_atomic` ao usar `owner_id`.
    3.  **Portal do Cliente**: Eliminado o erro `column "profile_id" does not exist` na tabela `payment_intents` e garantida a atualizaÃ§Ã£o dos dados.
- **ObservaÃ§Ãµes:** O sistema estÃ¡ com conectividade ativa confirmada via terminal. Recomenda-se aplicar a migraÃ§Ã£o SQL via dashboard do Supabase para garantir a sincronizaÃ§Ã£o imediata.

## 2026-05-01 (Parte 4)
- **Objetivo:** Corrigir persistÃªncia visual do botÃ£o "Cobrar" e planejar sistema hÃ­brido.
- **Arquivos Alterados:**
    - `/components/cards/LoanCardComposition/Header.tsx`: Corrigida a inicializaÃ§Ã£o do estado `isLocked`. Agora o estado Ã© calculado imediatamente no render a partir de `loan.last_billed_at`, evitando que o botÃ£o volte para "Cobrar" momentaneamente apÃ³s um refresh.
- **Arquivos Novos:**
    - `hybrid_offline_plan.md` (Artifact): Plano detalhado para arquitetura Offline-First usando IndexedDB e Service Workers.
- **Problemas Resolvidos:**
    1.  **Reset Visual do BotÃ£o**: O estado de bloqueio de 24h agora Ã© persistente e sincronizado instantaneamente com os dados do banco.
- **ObservaÃ§Ãµes:** A lÃ³gica de sincronizaÃ§Ã£o de dados via `onRefresh` no `DashboardContainer` garante que, apÃ³s a marcaÃ§Ã£o no banco, o componente receba a data atualizada e mantenha o botÃ£o como "Cobrado".

## 2026-05-01 (Parte 5)
- **Objetivo:** Corrigir classificaÃ§Ã£o de parcelas quitadas no portal do cliente.
- **Arquivos Alterados:**
    - `/features/portal/mappers/portalDebtRules.ts`: Centralizada a regra de parcela quitada no portal.
    - `/containers/ClientPortal/ClientPortalView.tsx`, `/features/portal/ClientPortalView.tsx`: Aplicada a regra central.
- **ObservaÃ§Ãµes:** A correÃ§Ã£o Ã© funcional e garante que parcelas pagas com saldo zerado nÃ£o apareÃ§am como pendentes/atrasadas.

## 2026-05-01 (Parte 7)
- **Objetivo:** Eliminar atraso indevido do contrato de Leonidas no portal.
- **Arquivos Alterados:**
    - `/supabase` (banco remoto, via `supabase db query --linked`): Atualizado `parcelas.due_date` para refletir `parcelas.data_vencimento` no contrato `7d240f90-6652-40e8-8a94-7c100f1b6a16`.
- **Arquivos Novos:**
    - Nenhum.
- **Observacoes:** Confirmado no banco apos execucao: `due_date = 2026-05-31`, `data_vencimento = 2026-05-31`, `status = PARTIAL`, `interest_remaining = 0`, `late_fee_accrued = 0`.
- **Escopo:** Ajuste pontual de consistencia de data para remover classificacao indevida de atraso no portal.

## 2026-05-01 (Parte 10)
- **Objetivo:** Tornar a sincronizacao da outbox do portal resiliente (retry/backoff/limite de tentativas).
- **Arquivos Alterados:**
    - `/services/offline/portalOfflineStore.ts`: Incluidos campos de controle (`maxAttempts`, `nextRetryAt`, `lastAttemptAt`) e estados `FAILED/DEAD` com backoff exponencial e teto de 5 minutos.
    - `/services/portal.service.ts`: Atualizado `flushPortalOutbox()` para marcar tentativas, respeitar itens prontos para retry e mover falhas recorrentes para estado final.
    - `/features/portal/hooks/useClientPortalLogic.ts`: Adicionado ciclo periodico de flush (a cada 30s) e sincronizacao no evento `online`.
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** O deploy remoto da Edge Function `mp-create-preference` continua pendente fora deste ambiente por falta de autenticacao CLI local.
- **Escopo:** Somente robustez da fila offline do portal; sem alteracao visual e sem mudanca de regra de negocio financeira.

## 2026-05-01 (Parte 11)
- **Objetivo:** Avancar em lote nas proximas etapas tecnicas do modelo hibrido, reforcando confiabilidade operacional do offline-first no portal.
- **Etapas Implementadas:**
    1. Deduplicacao de enqueue na outbox para evitar eventos duplicados equivalentes.
    2. Expansao de estados de fila com estado final `DEAD`.
    3. Controle de `maxAttempts` por item de fila.
    4. Agendamento de retentativa por `nextRetryAt`.
    5. Registro de `lastAttemptAt` para auditoria local de tentativa.
    6. Requeue manual de itens `DEAD` (`retryDeadOutbox` / `requeueDeadOutboxItems`).
    7. Exposicao de metricas agregadas da outbox (`getOfflineSyncStats` / `getOutboxStats`).
    8. Trava de concorrencia no flush para evitar execucoes paralelas de sincronizacao.
    9. Gatilho adicional de sync ao voltar visibilidade da aba e ciclo periodico mantido.
    10. Atualizacao controlada do Service Worker via mensagem `SKIP_WAITING`.
- **Arquivos Alterados:**
    - `/services/offline/portalOfflineStore.ts`: Deduplicacao, estado `DEAD`, metricas, requeue manual, schemaVersion do snapshot e TTL de snapshot antigo.
    - `/services/portal.service.ts`: Mutex de flush, retorno consolidado de processamento, metodos de stats/requeue, integracao com novos controles da store.
    - `/features/portal/hooks/useClientPortalLogic.ts`: Trigger de sync por `visibilitychange` e manutencao do ciclo periodico de 30s.
    - `/service-worker.js`: Listener de `message` para `SKIP_WAITING`.
    - `/main.tsx`: Registro do SW com acao imediata de `skip waiting` em update.
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** Build TypeScript completo continua bloqueado por arquivos preexistentes fora do escopo (`scratch/check_mp.ts`, `scratch/check_owner.ts`).
- **Escopo:** Mudancas restritas a resiliencia offline/sync do portal e lifecycle de SW; sem alteracao de UI/aparencia.

## 2026-05-01 (Parte 14)
- **Objetivo:** Criar documentacao completa da implementacao offline-first em pasta dedicada.
- **Arquivos Alterados:**
    - `/IMPLEMENTACAO_RESUMO.md`: Registro da criacao da documentacao tecnica dedicada.
- **Arquivos Novos:**
    - `/documentacao/offline-first/README.md`: Indice da documentacao e mapeamento de arquivos de codigo relacionados.
    - `/documentacao/offline-first/ARQUITETURA.md`: Arquitetura implementada, fluxos de leitura/escrita e modelo de outbox.
    - `/documentacao/offline-first/OPERACAO_E_SUPORTE.md`: Guia operacional, diagnostico e suporte.
    - `/documentacao/offline-first/CHECKLIST_PRODUCAO.md`: Checklist objetivo de validacao em producao.
- **Riscos/Observacoes:** Documentacao reflete o estado implementado atual sem alterar regras de negocio ou UI.
- **Escopo:** Somente criacao de documentacao tecnica em pasta dedicada.

## 2026-05-08 (Parte 7)
- **Objetivo:** Garantir que o estado `Cobrado` persista apos atualizar a pagina.
- **Arquivos Alterados:**
    - `/services/contracts.service.ts`: `markAsBilled` passou a atualizar o Dexie local e gravar imediatamente `last_billed_at`/`billing_count` no Supabase; se a gravacao remota falhar, a operacao e enfileirada para sincronizacao.
    - `/services/sync.service.ts`: Operacoes `UPDATE` da fila passaram a usar `update(...).eq('id', targetId)` em vez de `upsert`, evitando falha com payload parcial sem `owner_id`.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` executado com sucesso.
- **Riscos/Observacoes:** A causa provavel era o `upsert` da fila offline tentando persistir payload parcial de contrato; ao atualizar a pagina, o sync remoto trazia o valor antigo e o botao voltava para `Cobrar`.
- **Escopo:** Apenas persistencia funcional do estado de cobranca; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-09 (Parte 4 - Bimodal ContÃ­nuo)
- **Objetivo:** Implementar bimodalidade contÃ­nua ("Eternamente Logado") para que o sistema funcione offline sem interrupÃ§Ãµes quando o JWT expirar.
- **Arquivos Alterados:**
    - `/services/sync.service.ts`: Exportada a funÃ§Ã£o auxiliar `isAuthSyncError` para identificaÃ§Ã£o unificada de expiraÃ§Ã£o de token.
    - `/hooks/useAppState.ts`: Atualizado para engolir erros de expiraÃ§Ã£o no background caso jÃ¡ existam dados carregados, e forÃ§ar o estado local de `SESSAO_EXPIRADA` em vez de falha genÃ©rica de rede, permitindo uso 100% offline.
    - `/components/AppGate.tsx`: Removido o bloqueio restritivo (full-screen backdrop) para erro de sessÃ£o. O aviso de re-autenticaÃ§Ã£o passou a ser um banner/card fixado no topo, que nÃ£o trava o uso da aplicaÃ§Ã£o em background.
- **Arquivos Novos:**
    - Nenhum.
- **ObservaÃ§Ãµes:** Agora, quando o token expira por ociosidade (ou troca de rede falha), o operador continua trabalhando com o banco Dexie normalmente. O banner superior avisa da pausa na sincronizaÃ§Ã£o e permite digitar a senha para reconectar Ã  nuvem sob demanda.

