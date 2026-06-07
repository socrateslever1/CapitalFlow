# Implementacoes - RECEBIMENTOS COMPROVANTES

## 2026-06-04
- **Objetivo:** Corrigir consistencia do recebimento normal, evitar travamento no envio de comprovante e restaurar indicadores/IA do dashboard.
- **Arquivos Alterados:**
    - `/services/payments.service.ts`: Adicionada revalidacao do saldo aberto do contrato apos o RPC de pagamento; a renovacao de vencimento/juros do proximo ciclo passa a ocorrer somente se ainda houver saldo real no banco; o tipo final do pagamento passa a ser definido pelo saldo revalidado, evitando residuo em quitacao total.
    - `/components/modals/ReceiptModal.tsx`: O botao principal de WhatsApp passou a enviar texto direto, sem gerar canvas/imagem antes; PNG e PDF permanecem como acoes separadas.
    - `/domain/dashboard/stats.ts`: Contratos com nome contendo "teste" voltaram a entrar nos indicadores do dashboard.
    - `/pages/DashboardPage.tsx`: Inserido `AIBalanceInsight` no painel de indicadores, acessivel no mobile pela aba Balanco.
- **Arquivos Criados:** Nenhum.
- **Riscos/Observacoes:** A IA no dashboard depende da configuracao da API usada por `geminiService`. A correcao de quitacao normal depende da RPC `process_payment_v3_selective` manter saldos de parcelas atualizados no banco.
- **Validacao:** `npm run build` executado com sucesso.
- **Escopo:** Alteracoes limitadas a recebimento normal, comprovante, indicadores e exibicao da IA no dashboard. Nada fora do escopo foi alterado.

## 2026-05-01 (Parte 6)
- **Objetivo:** Corrigir vencimento efetivo exibido no portal do cliente.
- **Arquivos Alterados:**
    - `/services/adapters/loanAdapter.ts`: Alterada a prioridade de mapeamento da data de vencimento da parcela para usar `data_vencimento` antes de `due_date`, evitando que o portal use data antiga quando o banco ja possui vencimento atualizado.
    - `/supabase/migrations/20260501_fix_portal_paid_reconciliation.sql`: Criada e aplicada no banco remoto migracao de reconciliacao de parcelas quitadas por status, saldo zerado e pagamentos confirmados.
- **Arquivos Novos:**
    - `/supabase/migrations/20260501_fix_portal_paid_reconciliation.sql`: Necessario para corrigir dados inconsistentes de parcelas pagas no banco.
- **Observacoes:** A consulta remota confirmou que o contrato de Leonidas possui `data_vencimento = 2026-05-31` e `due_date = 2026-02-14`; o portal estava usando `due_date`, causando exibicao indevida de atraso. O contrato localizado nao esta quitado no banco: possui `paid_total = 2150` e `principal_remaining = 3450`.
- **Escopo:** Apenas regra funcional de mapeamento de vencimento e reconciliacao de banco foram alteradas.

## 2026-05-01 (Parte 9)
- **Objetivo:** Iniciar modelo hibrido offline-first no Portal do Cliente com disponibilidade sem internet e sincronizacao posterior.
- **Arquivos Alterados:**
    - `/service-worker.js`: Refeito cache do app shell e fallback de navegacao offline (`/index.html`), com cache de assets same-origin.
    - `/main.tsx`: Adicionado registro do Service Worker no carregamento da aplicacao.
    - `/services/portal.service.ts`: Adicionadas operacoes de snapshot offline, outbox de intencao de pagamento e rotina de flush da fila ao voltar online.
    - `/features/portal/hooks/useClientPortalLogic.ts`: Integrada hidratacao por snapshot local em falha de rede, persistencia de snapshot apos carga online e disparo de sincronizacao da outbox.
    - `/services/offline/portalOfflineStore.ts`: Novo armazenamento IndexedDB nativo para snapshot do portal e fila offline (`portal_outbox`).
- **Arquivos Novos:**
    - `/services/offline/portalOfflineStore.ts`: Necessario para persistencia local real (IndexedDB) e sincronizacao posterior das intencoes de pagamento.
- **Riscos/Observacoes:** Fluxo juridico de assinatura continua exigindo backend online (nao foi alterado). Para pagamento online Mercado Pago, a Edge Function `mp-create-preference` precisa estar publicada no ambiente remoto.
- **Escopo:** Apenas funcionalidade offline-first do Portal do Cliente e infraestrutura minima de cache/sincronizacao; sem alteracao de layout ou aparencia.

## 2026-05-01 (Parte 12)
- **Objetivo:** Fechar o ciclo operacional da sincronizacao offline com recarga automatica dos dados apos sync efetivo.
- **Arquivos Alterados:**
    - `/services/portal.service.ts`: Adicionado `syncPortalOfflineQueue()` (flush + stats) e tratamento explicito para erro de Edge Function nao publicada (`mp-create-preference`).
    - `/features/portal/hooks/useClientPortalLogic.ts`: `runSync` atualizado para recarregar os dados do portal automaticamente quando houver itens sincronizados.
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** Persistencia e sincronizacao offline concluidas no frontend; pagamento online Mercado Pago permanece dependente de deploy remoto da funcao `mp-create-preference`.
- **Escopo:** Ajustes apenas na camada funcional de sincronizacao/offline do portal; sem mudancas visuais.

## 2026-05-01 (Parte 13)
- **Objetivo:** Concluir operacao pendente de producao para remover falha de Edge Function no portal.
- **Arquivos Alterados:**
    - Nenhum arquivo de codigo local.
- **Alteracao de Infraestrutura Executada:**
    - Deploy remoto da Edge Function `mp-create-preference` no projeto Supabase `hzchchbxkhryextaymkn` via CLI.
    - Validacao pos-deploy: endpoint deixou de retornar `404 NOT_FOUND` e passou a responder `401 UNAUTHORIZED_INVALID_JWT_FORMAT` no teste com token invalido (comportamento esperado para funcao publicada).
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** A publicacao da funcao elimina a indisponibilidade por ausencia de deploy; validacao funcional final de pagamento depende de chamada real com token/portal validos.
- **Escopo:** Somente conclusao de infraestrutura remota da Edge Function exigida pelo fluxo do portal.

