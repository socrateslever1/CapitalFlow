# Implementações

## 2026-06-07
- **Objetivo:** Ajustar renegociacao/unificacao e criar estado operacional `Somente Capital` para recuperar apenas principal, sem juros e sem novo credito ao cliente marcado.
- **Arquivos Alterados:**
    - `/utils/capitalOnlyRecovery.ts`: Criado helper do marcador tecnico `[CAPITAL_ONLY_RECOVERY]`, usado para identificar contrato/cliente em recuperacao somente de capital.
    - `/features/agreements/components/RenegotiationModal.tsx`: O fluxo passa a permitir acordo parcelado, unificacao normal sem parcelamento ou marcacao `Somente Capital` em aberto, sem gerar cronograma de parcelas.
    - `/services/contracts.service.ts`: Adicionada persistencia para marcar/desmarcar `Somente Capital`, zerando juros/encargos das parcelas e registrando evento no extrato; adicionada validacao que bloqueia novo contrato para cliente marcado.
    - `/hooks/controllers/useLoanController.ts`: Novo contrato passa a ser bloqueado quando o cliente possui contrato `Somente Capital`; adicionada acao de marcar/desmarcar no card.
    - `/containers/DashboardContainer.tsx`: Bloqueado novo aporte para contrato marcado como `Somente Capital`.
    - `/components/cards/LoanCard.tsx`, `/components/cards/LoanCardComposition/Header.tsx`, `/components/cards/LoanCardComposition/Footer.tsx` e `/components/cards/LoanCardComposition/types.ts`: Card passa a exibir alerta `Somente Capital`, sinal de perigo e acao para marcar/desmarcar; novo aporte fica indisponivel quando marcado.
    - `/domain/finance/calculations.ts`: Contrato marcado como `Somente Capital` passa a calcular saldo apenas pelo principal aberto.
    - `/services/payments.service.ts`: Recebimentos em contrato marcado passam automaticamente a amortizar somente capital e manter encargos zerados.
    - `/domain/dashboard/loanGrouping.ts` e `/components/cards/ClientGroupCard.tsx`: Grupo do cliente passa a sinalizar `Somente Capital`.
    - `/containers/ClientsContainer.tsx`, `/pages/ClientsPage.tsx` e `/App.tsx`: Carteira de clientes passa a receber contratos e exibir cliente marcado em vermelho com alerta `Somente Capital`.
    - `/components/modals/PaymentManagerModal.tsx` e `/pages/ContractDetails/PaymentRegistrationForm.tsx`: Removida decisao avulsa de recebimento sem juros; o comportamento passa a depender do estado do contrato.
- **Arquivos Criados:**
    - `/utils/capitalOnlyRecovery.ts`: Necessario para centralizar o marcador tecnico e evitar divergencia entre card, carteira, calculo, pagamento e validacao.
- **Riscos/Observacoes:** A marcacao `Somente Capital` usa `contratos.notes` para evitar migration. A unificacao normal consolida o saldo aberto no contrato principal e marca os demais como legado renegociado.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Alteracoes limitadas a renegociacao/unificacao, marcacao de recuperacao somente capital, cards, carteira de clientes e bloqueios de novo credito para cliente marcado.

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

## 2026-05-31
- **Objetivo:** Ajustar confissao de divida, assinatura publica e envio de comprovante conforme solicitacao.
- **Arquivos Alterados:**
    - `/features/legal/components/ConfissaoDividaView.tsx`: Removido o bloco de configuracoes adicionais da confissao; a geracao passou a detectar automaticamente contrato normal, parcelado e renegociado; o valor confessado passou a ser calculado pelo saldo/parcelas reais do contrato ou acordo ativo.
    - `/features/legal/templates/ConfissaoDividaV2Template.ts`: Ajustado o texto gerado para explicitar composicao do valor confessado quando houver capital e encargos; contratos parcelados passam a declarar o compromisso de pagamento por ciclo.
    - `/features/legal/services/legalPublic.service.ts`: A assinatura publica passou a usar RPCs de leitura/gravacao de assinaturas, evitando insert direto sujeito a RLS/colunas divergentes.
    - `/components/modals/ReceiptModal.tsx`: O envio do comprovante passou a tentar compartilhar o PNG real via Web Share API; quando o navegador nao suporta arquivo, mantem o fallback de WhatsApp com texto.
- **Arquivos Criados:**
    - `/supabase/migrations/20260531_public_signature_rpc_and_receipt_files.sql`: Necessario para criar colunas de assinatura digital, RPC publica de leitura de assinaturas e RPC publica segura para gravar assinatura por token.
- **Riscos/Observacoes:** A gravacao da assinatura depende da aplicacao da migration no Supabase. Compartilhamento de arquivo depende de suporte do navegador/dispositivo; fallback de texto permanece.
- **Validacao:** `npm run build` executado com sucesso. `git diff --check` executado sem erros, apenas avisos LF/CRLF do Windows.
- **Escopo:** Alteracoes limitadas a confissao de divida, assinatura publica, comprovante e migration necessaria. Nada fora do escopo foi alterado.

## 2026-05-27
- **Objetivo:** Corrigir quebra de acordo para restaurar a dívida original sem recriar parcelas e sem violar a constraint `parcelas_unique_loan_numero`.
- **Arquivos Alterados:**
    - `/features/agreements/services/agreementService.ts`: Ajustada a quebra de acordo para reativar parcelas `RENEGOCIADO`, abater pagamentos feitos no acordo, restaurar status por saldo/vencimento (`PAID`, `ATRASADO`, `PENDENTE`) e atualizar o contrato para `PAID`, `ATRASADO` ou `ATIVO` com `acordo_ativo_id` limpo.
    - `/services/adapters/dbAdapters.ts`: Adicionado mapeamento de `numero_parcela` para `number` nas parcelas carregadas do banco.
    - `/services/contracts.service.ts`: Ajustado salvamento de parcelas para preservar `number`/`numero_parcela` e usar `index + 1` apenas como fallback.
- **Arquivos Criados:** Nenhum.
- **Riscos/Observações:** A correção não cria novas parcelas normais na quebra do acordo; apenas restaura as parcelas originais. Isso evita duplicidade por `loan_id + numero_parcela`.
- **Escopo:** Apenas regra funcional de quebra de acordo, mapeamento de parcelas e persistência de número de parcela foram alterados. Nenhuma UI foi modificada.

## 2026-05-01 (Parte 1)
- **Objetivo:** Finalizar funcionalidade de cobrança, corrigir erro de coluna no banco e ajustar layout da busca e visual do modal de aporte.
- **Arquivos Alterados:**
    - `/features/calendar/hooks/useCalendar.ts`: Corrigido erro "column profile_id does not exist" alterando filtro de `profile_id=eq` para `owner_id=eq`.
    - `/components/cards/LoanCardComposition/Header.tsx`: Atualizado comportamento do botão "Cobrar" para refletir estado "Cobrado" (cor verde) imediatamente ao clicar.
    - `/components/dashboard/DashboardControls.tsx`: Removida transição absoluta do buscador para permitir fluxo no layout, evitando sobreposição com cards.
    - `/components/modals/NewAporteModal.tsx`: Melhorada construção visual do modal, aplicando cantos levemente arredondados (`rounded-xl` / `rounded-lg`) em vez de circulares (`rounded-full`) para um visual mais sóbrio e profissional.
- **Observações:** O SQL de migração para colunas de faturamento já havia sido criado previamente. A lógica de exibição de "O cliente foi cobrado X vezes" no `Body.tsx` já estava correta.

## 2026-05-01 (Parte 2)
- **Objetivo:** Implementar melhorias de usabilidade: persistência de estado do contrato selecionado.
- **Arquivos Alterados:**
    - `/hooks/useUiState.ts`: Implementada persistência de `selectedLoanId` no `localStorage` para manter o contrato selecionado após atualização da página.
- **Observações:** O estado persistente `cm_selected_loan_id` garante que a aplicação retorne ao contrato previamente visualizado.

## 2026-05-01 (Parte 3)
- **Objetivo:** Resolver erros críticos de banco de dados, portal e aportes.
- **Arquivos Alterados:**
    - `/supabase/migrations/20260501_fix_system_errors.sql`: Criada migração consolidada para corrigir colunas de cobrança, mismatch de `profile_id`/`owner_id` e atualizar RPCs do portal e aportes.
- **Problemas Resolvidos:**
    1.  **Botão Cobrar**: Agora persiste `last_billed_at` e `billing_count` corretamente no banco.
    2.  **Novo Aporte**: Corrigida a falha de "Acesso Negado" na RPC `apply_new_aporte_atomic` ao usar `owner_id`.
    3.  **Portal do Cliente**: Eliminado o erro `column "profile_id" does not exist` na tabela `payment_intents` e garantida a atualização dos dados.
- **Observações:** O sistema está com conectividade ativa confirmada via terminal. Recomenda-se aplicar a migração SQL via dashboard do Supabase para garantir a sincronização imediata.

## 2026-05-01 (Parte 4)
- **Objetivo:** Corrigir persistência visual do botão "Cobrar" e planejar sistema híbrido.
- **Arquivos Alterados:**
    - `/components/cards/LoanCardComposition/Header.tsx`: Corrigida a inicialização do estado `isLocked`. Agora o estado é calculado imediatamente no render a partir de `loan.last_billed_at`, evitando que o botão volte para "Cobrar" momentaneamente após um refresh.
- **Arquivos Novos:**
    - `hybrid_offline_plan.md` (Artifact): Plano detalhado para arquitetura Offline-First usando IndexedDB e Service Workers.
- **Problemas Resolvidos:**
    1.  **Reset Visual do Botão**: O estado de bloqueio de 24h agora é persistente e sincronizado instantaneamente com os dados do banco.
- **Observações:** A lógica de sincronização de dados via `onRefresh` no `DashboardContainer` garante que, após a marcação no banco, o componente receba a data atualizada e mantenha o botão como "Cobrado".

## 2026-05-01 (Parte 5)
- **Objetivo:** Corrigir classificação de parcelas quitadas no portal do cliente.
- **Arquivos Alterados:**
    - `/features/portal/mappers/portalDebtRules.ts`: Centralizada a regra de parcela quitada no portal.
    - `/containers/ClientPortal/ClientPortalView.tsx`, `/features/portal/ClientPortalView.tsx`: Aplicada a regra central.
- **Observações:** A correção é funcional e garante que parcelas pagas com saldo zerado não apareçam como pendentes/atrasadas.

## 2026-05-01 (Parte 6)
- **Objetivo:** Corrigir vencimento efetivo exibido no portal do cliente.
- **Arquivos Alterados:**
    - `/services/adapters/loanAdapter.ts`: Alterada a prioridade de mapeamento da data de vencimento da parcela para usar `data_vencimento` antes de `due_date`, evitando que o portal use data antiga quando o banco ja possui vencimento atualizado.
    - `/supabase/migrations/20260501_fix_portal_paid_reconciliation.sql`: Criada e aplicada no banco remoto migracao de reconciliacao de parcelas quitadas por status, saldo zerado e pagamentos confirmados.
- **Arquivos Novos:**
    - `/supabase/migrations/20260501_fix_portal_paid_reconciliation.sql`: Necessario para corrigir dados inconsistentes de parcelas pagas no banco.
- **Observacoes:** A consulta remota confirmou que o contrato de Leonidas possui `data_vencimento = 2026-05-31` e `due_date = 2026-02-14`; o portal estava usando `due_date`, causando exibicao indevida de atraso. O contrato localizado nao esta quitado no banco: possui `paid_total = 2150` e `principal_remaining = 3450`.
- **Escopo:** Apenas regra funcional de mapeamento de vencimento e reconciliacao de banco foram alteradas.

## 2026-05-01 (Parte 7)
- **Objetivo:** Eliminar atraso indevido do contrato de Leonidas no portal.
- **Arquivos Alterados:**
    - `/supabase` (banco remoto, via `supabase db query --linked`): Atualizado `parcelas.due_date` para refletir `parcelas.data_vencimento` no contrato `7d240f90-6652-40e8-8a94-7c100f1b6a16`.
- **Arquivos Novos:**
    - Nenhum.
- **Observacoes:** Confirmado no banco apos execucao: `due_date = 2026-05-31`, `data_vencimento = 2026-05-31`, `status = PARTIAL`, `interest_remaining = 0`, `late_fee_accrued = 0`.
- **Escopo:** Ajuste pontual de consistencia de data para remover classificacao indevida de atraso no portal.

## 2026-05-01 (Parte 8)
- **Objetivo:** Corrigir falha de envio para Edge Function em cenarios com retentativa de rede.
- **Arquivos Alterados:**
    - `/utils/fetchWithRetry.ts`: Ajustada a chamada de `fetch` para clonar `Request` em cada tentativa (`input.clone()`), evitando reutilizacao de body consumido em retries.
- **Arquivos Novos:**
    - Nenhum.
- **Riscos/Observacoes:** Mudanca localizada no transporte HTTP compartilhado; nao altera regras de negocio, layout ou contratos de API. Impacto esperado: reduzir erro "Failed to send a request to the Edge Function" em chamadas com corpo JSON.
- **Escopo:** Somente correcao funcional de envio/retry para Edge Functions.

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

## 2026-05-08
- **Objetivo:** Corrigir falha de RLS ao criar acordo/unificacao em `acordos_inadimplencia`.
- **Arquivos Alterados:**
    - `/supabase/migrations/20260508_fix_acordos_inadimplencia_rls.sql`: Criada migration com policies RLS para `acordos_inadimplencia` e `acordo_parcelas`, permitindo acesso ao perfil autenticado quando `profile_id` corresponde a `perfis.id`, `perfis.user_id`, `perfis.email` ou `perfis.usuario_email`.
    - `/dist`: Build de producao atualizado para incluir a persistencia corrigida no bundle servido em modo production/static.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Alteracao de Banco Executada:**
    - SQL aplicado no projeto Supabase remoto `hzchchbxkhryextaymkn` via `supabase db query --linked --file`.
    - Validacao no catalogo `pg_policies` confirmou as policies `Gerenciar acordos pelo perfil autenticado` e `Gerenciar parcelas de acordo pelo perfil autenticado`.
- **Arquivos Novos:**
    - `/supabase/migrations/20260508_fix_acordos_inadimplencia_rls.sql`: Necessario para versionar a correcao RLS aplicada no banco.
- **Riscos/Observacoes:** `supabase db push --dry-run` indicou migrations antigas pendentes no historico remoto; por isso a correcao foi aplicada diretamente com `db query` para evitar reaplicar migrations fora do escopo.
- **Escopo:** Apenas RLS das tabelas do fluxo de acordo/unificacao; sem alteracao de UI, frontend, rotas ou layout.

## 2026-05-08 (Parte 2)
- **Objetivo:** Corrigir falha de chave estrangeira ao criar acordo/unificacao quando o contrato principal ainda nao existe no Supabase remoto.
- **Arquivos Alterados:**
    - `/features/agreements/components/RenegotiationModal.tsx`: Corrigido o caminho do Dexie usado para recuperar o contrato local antes de criar o acordo; adicionada validacao do erro da consulta em `contratos`; removidos dados aninhados antes do insert do contrato base; o fluxo agora interrompe a criacao do acordo se o contrato pai nao puder ser garantido no banco.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** A correcao evita inserir acordo sem contrato pai e elimina a violacao da FK `acordos_inadimplencia_loan_id_fkey` para contratos recuperaveis do cache local. Se o contrato nao existir nem no Supabase nem no Dexie, o fluxo passa a falhar antes do insert do acordo com mensagem tecnica mais correta.
- **Escopo:** Apenas preparacao funcional do contrato pai no fluxo de acordo/unificacao; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-08 (Parte 3)
- **Objetivo:** Adicionar barreira definitiva no service contra criacao de acordo com `loan_id` inexistente.
- **Arquivos Alterados:**
    - `/features/agreements/services/agreementService.ts`: Validado `loanId` como UUID antes do insert; adicionada consulta previa em `contratos` para confirmar existencia do contrato pai; o insert em `acordos_inadimplencia` passou a usar o UUID validado.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a barreira adicional no service.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` executado com sucesso.
- **Riscos/Observacoes:** Se o contrato nao existir no Supabase, o erro agora ocorre antes do insert do acordo com mensagem objetiva, evitando violacao direta da FK `acordos_inadimplencia_loan_id_fkey`.
- **Escopo:** Apenas validacao funcional no service de acordos; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-08 (Parte 4)
- **Objetivo:** Garantir contrato pai antes de criar acordo mesmo quando o contrato nao existe no Supabase nem no Dexie.
- **Arquivos Alterados:**
    - `/features/agreements/components/RenegotiationModal.tsx`: Adicionado fallback para reconstruir o registro base de `contratos` a partir do `Loan` em memoria antes de criar o acordo, preenchendo `owner_id`, `profile_id` e demais campos persistidos necessarios.
    - `/dist`: Build de producao atualizado para incluir a correcao no bundle servido quando o app roda em modo production/static.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao e a atualizacao do build.
- **Arquivos Novos:**
    - Nenhum arquivo fonte novo.
- **Validacao:** `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** A reconstrucao do contrato base usa apenas dados ja presentes no `Loan` selecionado e IDs validados. Se o insert do contrato base falhar por regra de banco, o acordo nao e criado.
- **Escopo:** Apenas persistencia funcional do contrato pai no fluxo de acordo/unificacao e atualizacao do build compilado; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-08 (Parte 5)
- **Objetivo:** Corrigir exibicao de contratos parcelados/renegociados para usar o bloco de acordo com scroll e evitar cronograma normal de parcelas.
- **Arquivos Alterados:**
    - `/components/cards/hooks/useLoanCardComputed.ts`: `hasActiveAgreement` passou a usar a existencia real de acordo ativo, evitando que acordo atrasado caia no cronograma comum.
    - `/utils/loanFilterResolver.ts`: Contratos com `activeAgreement`, `EM_ACORDO` ou `RENEGOCIADO` passam a ser classificados como `RENEGOCIADO` para o filtro visual.
    - `/domain/filters/loanFilters.ts`: Contratos filhos de unificacao passam a ser ocultados da lista principal por todos os filtros, reconhecendo os marcadores atuais e legados.
    - `/components/cards/LoanCardComposition/Body.tsx`: Agrupamento de contratos unificados passou a reconhecer os marcadores atuais e legados.
    - `/services/adapters/loanAdapter.ts`: Status `EM_ACORDO` e `RENEGOCIADO` passam a ser preservados no adapter.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** Consulta remota confirmou que Gracileide possui um contrato principal `f6c25b1c-6900-43df-9144-8aa9f6c2fbd8` em `EM_ACORDO` e 80 registros em `acordo_parcelas`, nao 80 contratos separados. Tambem foram encontrados dois acordos ativos para o mesmo contrato; nenhum dado foi apagado ou alterado no banco nesta etapa.
- **Escopo:** Apenas reconhecimento funcional de acordo/renegociacao, filtro e agrupamento; sem alteracao visual, layout, rotas ou componentes globais.

## 2026-05-08 (Parte 6)
- **Objetivo:** Garantir que o botao `Cobrar` vire `Cobrado` e permaneça travado por 24h apos o clique.
- **Arquivos Alterados:**
    - `/components/cards/LoanCardComposition/Header.tsx`: Adicionado estado local `localLastBilledAt` para usar a hora do clique como referencia imediata da trava de 24h, evitando que refresh/sync com props antigas reverta o botao para `Cobrar`.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - Nenhum.
- **Validacao:** `npm run lint` executado com sucesso.
- **Riscos/Observacoes:** A persistencia remota continua sendo feita por `contractsService.markAsBilled`, que atualiza `last_billed_at` e `billing_count`; a mudanca apenas garante consistencia visual local durante a janela de sync.
- **Escopo:** Apenas comportamento funcional do botao de cobranca no card; sem alteracao visual, layout, rotas ou componentes globais.

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

## 2026-05-08 (Parte 8)
- **Objetivo:** Consolidar a sincronizacao online/offline e corrigir causas de erro `JWT expired` e acordos ativos duplicados.
- **Arquivos Alterados:**
    - `/lib/supabase.ts`: `getSynchronizedSession` passou a renovar a sessao quando o JWT esta perto de expirar ou quando o chamador exige refresh, preservando o lock contra chamadas concorrentes.
    - `/services/sync.service.ts`: `syncFullData` e `processQueue` passaram a garantir sessao fresca antes das chamadas ao Supabase; erros de autenticacao tentam refresh e repetem a operacao uma vez antes de marcar falha. A fila offline deixa de processar quando nao ha sessao valida, mantendo os itens locais para nova tentativa.
    - `/hooks/useAppState.ts`: Resolucao de perfil passou a persistir perfil no Dexie e usar cache local quando a consulta online falha, reduzindo queda na tela `Ops! Algo deu errado na sincronizacao` durante instabilidade ou sessao expirada.
    - `/features/agreements/services/agreementService.ts`: Criacao/reativacao de acordo cancela outros acordos ativos do mesmo contrato antes de ativar o novo acordo.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a consolidacao aplicada.
- **Arquivos Novos:**
    - `/supabase/migrations/20260508_consolidate_agreement_single_active.sql`: Migration aplicada no Supabase remoto para cancelar duplicados ativos existentes, criar trigger de garantia e indice unico parcial por `loan_id`.
- **Alteracao de Banco Executada:**
    - SQL aplicado no projeto Supabase remoto `hzchchbxkhryextaymkn` via `supabase db query --linked --file`.
    - Validacao SQL confirmou zero contratos com mais de um acordo ativo, trigger `trg_single_active_agreement` habilitada e indice `uq_acordos_inadimplencia_one_active_per_loan` criado.
- **Validacao:** Consultas SQL de integridade confirmaram zero registros orfaos em `parcelas`, `transacoes`, `acordos_inadimplencia`, `acordo_parcelas`, `clientes` e `contratos`; `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** O advisor do Supabase ainda aponta riscos estruturais legados em views `SECURITY DEFINER`, funcoes sem `search_path` fixo, policies permissivas duplicadas e RLS desativado em `clientes_old`/`teams`. Esses achados nao foram alterados nesta etapa por terem alto potencial de impacto fora do fluxo de sync/acordos.
- **Escopo:** Consolidacao funcional de sessao, sync offline/online e integridade de acordo ativo; sem alteracao visual, layout ou fluxo de navegacao.

## 2026-05-09 (Parte 1)
- **Objetivo:** Corrigir erro ao aplicar novo aporte causado por overload ambiguo da RPC `apply_new_aporte_atomic`.
- **Arquivos Alterados:**
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - `/supabase/migrations/20260509_fix_apply_new_aporte_atomic_overload.sql`: Recria a RPC `apply_new_aporte_atomic` com uma unica assinatura compativel com o frontend, usando `owner_id` para validar o contrato, atualizando fonte, contrato, parcela alvo e ledger de forma atomica; remove a assinatura duplicada que causava ambiguidade no PostgREST.
- **Alteracao de Banco Executada:**
    - SQL aplicado no projeto Supabase remoto `hzchchbxkhryextaymkn` via `supabase db query --linked --file`.
    - Validacao no catalogo `pg_proc` confirmou apenas a assinatura `apply_new_aporte_atomic(uuid, uuid, numeric, uuid, uuid, text, uuid)`.
- **Validacao:** Chamada SQL com o contrato `2c0031fe-d2c5-4298-9231-964b195c407e` executada dentro de `BEGIN/ROLLBACK` com sucesso; consulta posterior confirmou que o teste nao persistiu transacao.
- **Riscos/Observacoes:** A correcao remove a ambiguidade entre assinaturas e preserva a logica financeira completa da versao funcional da RPC.
- **Escopo:** Apenas banco/RPC de novo aporte; sem alteracao visual ou componentes React.

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
- **Objetivo:** Garantir que a personalizacao de menus permaneça apos atualizar a pagina.
- **Arquivos Alterados:**
    - `/hooks/useAppState.ts`: O cache local `cm_cache_*` agora e atualizado quando os dados sao carregados e tambem imediatamente ao salvar `ui_nav_order`/`ui_hub_order`; o salvamento no Supabase passou a renovar a sessao antes do update e verificar `error`, evitando falha silenciosa.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** A causa provavel era o cache local recente restaurando uma configuracao antiga e impedindo nova busca no banco por ate 30s; em caso de falha real no Supabase, agora o sistema registra erro em vez de parecer salvo.
- **Escopo:** Apenas persistencia das preferencias de menu; sem alteracao visual.

## 2026-05-09 (Parte 4)
- **Objetivo:** Corrigir exclusao de contrato que informava sucesso mas mantinha o contrato no painel.
- **Arquivos Alterados:**
    - `/services/ledger/ledgerActions.ts`: Exclusao de contrato passou a chamar a RPC atomica `delete_contract_atomic`; o reembolso de capital para exclusao deixou de ser feito no frontend para evitar duplicidade e agora fica centralizado no banco.
    - `/services/sync.service.ts`: Sincronizacao completa agora remove do Dexie contratos locais que nao existem mais no Supabase, preservando apenas contratos com escrita pendente na fila offline.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - `/supabase/migrations/20260509_delete_contract_atomic.sql`: RPC atomica para excluir contrato, limpar dependencias, cancelar referencias circulares de acordos/documentos e devolver opcionalmente o principal em aberto para a fonte do contrato.
- **Alteracao de Banco Executada:**
    - SQL aplicado no projeto Supabase remoto `hzchchbxkhryextaymkn` via `supabase db query --linked --file`.
- **Validacao:** Teste SQL com contrato temporario dentro de `BEGIN/ROLLBACK` confirmou que a RPC remove o contrato e suas parcelas sem persistir dados de teste; `npm run lint` e `npm run build` executados com sucesso.
- **Riscos/Observacoes:** A causa principal era o modo offline-first: apos a exclusao remota, o Dexie mantinha o contrato local porque o full sync fazia apenas `bulkPut` e nunca apagava registros ausentes no remoto. A exclusao antiga tambem ignorava falhas parciais de dependencias e nao confirmava se o contrato realmente foi removido.
- **Escopo:** Persistencia funcional da exclusao e devolucao de principal em aberto para a fonte correta; sem alteracao visual.

## 2026-05-09 (Parte 3)
- **Objetivo:** Resolver falha silenciosa na exclusão de contratos (e clientes) originada por violação de foreign key.
- **Arquivos Alterados:**
    - `/services/ledger/ledgerActions.ts`: Incluídas as tabelas `ledger_entries`, `portal_tokens`, `portal_sessions`, `mensagens_suporte`, `acordo_documentos` e `sinalizacoes_pagamento` nas listas de `deletePromises` e `cascadeDeletes`.
- **Arquivos Novos:**
    - Nenhum.
- **Observações:** O Supabase bloqueava a exclusão final do contrato porque as novas tabelas (do portal, ledger e suporte) apontavam para o `loan_id` do contrato sem `ON DELETE CASCADE`. Adicioná-las à exclusão manual em cascata elimina o impedimento.
- **Escopo:** Apenas backend/persistência, focado na correção funcional do botão Excluir, sem impacto visual ou mudanças estruturais na interface.

## 2026-05-09 (Parte 4 - Bimodal Contínuo)
- **Objetivo:** Implementar bimodalidade contínua ("Eternamente Logado") para que o sistema funcione offline sem interrupções quando o JWT expirar.
- **Arquivos Alterados:**
    - `/services/sync.service.ts`: Exportada a função auxiliar `isAuthSyncError` para identificação unificada de expiração de token.
    - `/hooks/useAppState.ts`: Atualizado para engolir erros de expiração no background caso já existam dados carregados, e forçar o estado local de `SESSAO_EXPIRADA` em vez de falha genérica de rede, permitindo uso 100% offline.
    - `/components/AppGate.tsx`: Removido o bloqueio restritivo (full-screen backdrop) para erro de sessão. O aviso de re-autenticação passou a ser um banner/card fixado no topo, que não trava o uso da aplicação em background.
- **Arquivos Novos:**
    - Nenhum.
- **Observações:** Agora, quando o token expira por ociosidade (ou troca de rede falha), o operador continua trabalhando com o banco Dexie normalmente. O banner superior avisa da pausa na sincronização e permite digitar a senha para reconectar à nuvem sob demanda.
## 2026-05-09 (Parte 5 - Experiência de Navegação de Cards)
- **Objetivo:** Transformar a expansão dos cartões de contrato (`LoanCard` e `ClientGroupCard`) em modelo Acordeão, auto-foco (scroll) e garantir persistência ao navegar entre páginas.
- **Arquivos Alterados:**
    - `/components/cards/LoanCard.tsx`: Modificado o estado de expansão para depender do `selectedLoanId` global. Adicionada referência de elemento e `useEffect` com `scrollIntoView` para centralizar a tela no cartão assim que ele é expandido.
    - `/components/cards/ClientGroupCard.tsx`: Modificado para expandir automaticamente se um dos contratos agrupados for o selecionado. Adicionado `scrollIntoView` suave para quando o usuário expande o grupo manualmente.
- **Arquivos Novos:** Nenhum.
- **Observações:** A persistência da abertura ("ao fechar o contrato, voltar para o contrato aberto") é garantida porque o `selectedLoanId` é sincronizado no `localStorage` via `useUiState`.
- **Escopo:** UI/UX dos cartões do Dashboard e LegalPage.

## 2026-05-10 (Auditoria de Quitacao e Somas)
- **Objetivo:** Corrigir divergencia em que contrato com status pago/finalizado entrava no filtro de pagos, mas ainda aparecia com saldo/parcelas em aberto e podia entrar em somas operacionais.
- **Arquivos Alterados:**
    - `/domain/finance/calculations.ts`: O motor de saldo agora zera `totalRemaining`, principal, juros e multa quando o contrato esta `PAID`/`PAGO`/`QUITADO`/`FINALIZADO` ou quando o acordo ativo esta finalizado. Isso impede que parcelas antigas pendentes gerem saldo em contratos quitados.
    - `/domain/dashboard/loanGrouping.ts`: Agrupamento de clientes agora usa a classificacao central do contrato para status do grupo, evitando grupo `Regular/Em aberto` para contrato quitado por status.
    - `/components/cards/components/InstallmentGrid.logic.ts`: Parcelas exibidas dentro de contrato totalmente finalizado passam a usar divida visual zerada, evitando valor em aberto dentro de card quitado.
    - `/services/dataService.ts`: Exportacao/auditoria CSV passou a usar a classificacao central para `Quitado` em vez de contar somente status individual das parcelas.
    - `/supabase/migrations/20260510_fix_payment_finalization_and_audit.sql`: Recria a RPC `process_payment_v3_selective` para finalizar contrato com base em saldo real restante, aceitar variantes de status quitado nas parcelas e usar a mesma chave de idempotencia nos lancamentos de capital/lucro.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Alteracao de Banco Executada:** SQL aplicado no Supabase remoto via `npx supabase db query --linked --file`; consulta no catalogo confirmou a assinatura ativa da RPC `process_payment_v3_selective`.
- **Validacao:** Teste sintético confirmou contrato `PAGO` com parcela antiga pendente retornando saldo zero, status de motor `PAID`, grupo `PAID` e zero em `Capital na Rua`; `npm run lint` e `npm run build` executados com sucesso.
- **Escopo:** Apenas motor financeiro, agrupamento/auditoria de status e RPC de pagamento; sem alteracao visual estrutural.

## 2026-06-04 (Parte 2 - Acordos, Cards e Navegacao)
- **Objetivo:** Corrigir edicao de acordo renegociado, clique de abertura em cards e retorno visual sempre pelo topo.
- **Arquivos Alterados:**
    - `/features/agreements/services/agreementService.ts`: Adicionado `updateAgreementSchedule`, que atualiza periodicidade e recalcula vencimentos apenas das parcelas abertas do acordo, preservando parcelas pagas/historico.
    - `/features/agreements/components/AgreementView.tsx`: Adicionado controle de edicao do calendario do acordo ativo com frequencia semanal/quinzenal/mensal e primeira parcela aberta.
    - `/services/adapters/loanAdapter.ts` e `/services/adapters/dbAdapters.ts`: Periodicidade do banco (`SEMANAL`, `QUINZENAL`, `MENSAL`) agora e normalizada para o frontend (`WEEKLY`, `BIWEEKLY`, `MONTHLY`), evitando acordo semanal aparecer/processar como outra frequencia.
    - `/layout/AppShell.tsx`: Conteudo principal passa a rolar para o topo ao mudar de tela/contrato.
    - `/components/cards/LoanCard.tsx`: Removido auto-scroll antigo do card e clique em area neutra de card expandido agora abre o contrato.
    - `/components/cards/ClientGroupCard.tsx`: Removido auto-scroll antigo do grupo e cabecalho/nome do cliente em grupo passa a abrir o cadastro do cliente.
    - `/pages/DashboardPage.tsx`, `/containers/DashboardContainer.tsx` e `/App.tsx`: Propagado callback para abrir cliente a partir do grupo no Dashboard.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run build` executado com sucesso. Permanecem apenas avisos antigos de chunk/import dinamico do Vite.
- **Riscos/Observacoes:** A edicao de acordo altera somente calendario das parcelas em aberto; nao altera valores pagos nem recibos. Para emprestimo parcelado normal, o clique neutro agora leva ao contrato, onde o fluxo de recebimento total/outro valor ja existe.
- **Escopo:** Funcionalidade de acordo ativo, comportamento de navegacao e clique de cards; sem alteracao visual estrutural.

## 2026-06-04 (Parte 3 - Reset Global de Scroll)
- **Objetivo:** Impedir que contrato e demais telas abram no fim da pagina ao navegar/clicar em abrir.
- **Arquivos Alterados:**
    - `/layout/AppShell.tsx`: Scroll principal agora e resetado em `useLayoutEffect`, tambem apos o paint da rota, e o navegador fica com `history.scrollRestoration = manual` durante o uso do shell.
    - `/IMPLEMENTACAO_RESUMO.md`: Registrado o ajuste aplicado.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npm run build` executado com sucesso. Permanecem apenas avisos antigos de chunk/import dinamico do Vite.
- **Escopo:** Apenas comportamento funcional de scroll/navegacao; sem alteracao visual.
