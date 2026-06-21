# Implementacoes - RENEGOCIACAO ACORDOS

## 2026-06-20
- **Objetivo:** Corrigir a renegociacao normal/parcelada para usar a divida total atualizada, com todos os meses vencidos e atrasos recalculados ate hoje, antes de dividir pelas parcelas definidas.
- **Arquivos Alterados:**
    - `/features/agreements/components/RenegotiationModal.tsx`: A base da renegociacao deixou de somar apenas `principalRemaining + interestRemaining + lateFeeAccrued` salvo na parcela e passou a usar `computeLoanRemainingBalance`, que recalcula cada parcela pelo motor financeiro (`calculateTotalDue`). A simulacao, a unificacao normal e os campos de auditoria do acordo agora usam principal, juros e multa/mora recalculados.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ajuste limitado a base de calculo da renegociacao/unificacao; sem alteracao no motor financeiro central.

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
    - `/utils/translationHelpers.ts`: Adicionadas traducoes para eventos tecnicos de extrato e tipos de documento juridico, evitando exibicao de chaves em ingles no frontend.
    - `/components/cards/components/LedgerList.tsx` e `/pages/ContractDetails/LedgerTimeline.tsx`: Extrato passa a exibir nomes traduzidos para eventos como `Somente Capital Ativado` e `Unificacao Normal Criada`.
    - `/features/legal/components/ConfissaoDivida/LegalDocumentHistory.tsx`: Historico juridico passa a exibir tipo de documento traduzido em portugues.
- **Ajuste Posterior no Mesmo Dia:**
    - `/features/agreements/components/RenegotiationModal.tsx`: Modal passou a exibir o contrato principal quando ha varios contratos selecionados, corrigiu textos visiveis em portugues e passou a trocar o aviso final conforme a operacao escolhida, evitando dizer que sera criado parcelamento quando a escolha for `Unificar Normal` ou `Somente Capital`.
- **Arquivos Criados:**
    - `/utils/capitalOnlyRecovery.ts`: Necessario para centralizar o marcador tecnico e evitar divergencia entre card, carteira, calculo, pagamento e validacao.
- **Riscos/Observacoes:** A marcacao `Somente Capital` usa `contratos.notes` para evitar migration. A unificacao normal consolida o saldo aberto no contrato principal e marca os demais como legado renegociado. A traducao do extrato altera apenas exibicao, sem mudar os tipos tecnicos gravados no banco.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Alteracoes limitadas a renegociacao/unificacao, marcacao de recuperacao somente capital, cards, carteira de clientes e bloqueios de novo credito para cliente marcado.

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
- **Objetivo:** Corrigir quebra de acordo para restaurar a dÃ­vida original sem recriar parcelas e sem violar a constraint `parcelas_unique_loan_numero`.
- **Arquivos Alterados:**
    - `/features/agreements/services/agreementService.ts`: Ajustada a quebra de acordo para reativar parcelas `RENEGOCIADO`, abater pagamentos feitos no acordo, restaurar status por saldo/vencimento (`PAID`, `ATRASADO`, `PENDENTE`) e atualizar o contrato para `PAID`, `ATRASADO` ou `ATIVO` com `acordo_ativo_id` limpo.
    - `/services/adapters/dbAdapters.ts`: Adicionado mapeamento de `numero_parcela` para `number` nas parcelas carregadas do banco.
    - `/services/contracts.service.ts`: Ajustado salvamento de parcelas para preservar `number`/`numero_parcela` e usar `index + 1` apenas como fallback.
- **Arquivos Criados:** Nenhum.
- **Riscos/ObservaÃ§Ãµes:** A correÃ§Ã£o nÃ£o cria novas parcelas normais na quebra do acordo; apenas restaura as parcelas originais. Isso evita duplicidade por `loan_id + numero_parcela`.
- **Escopo:** Apenas regra funcional de quebra de acordo, mapeamento de parcelas e persistÃªncia de nÃºmero de parcela foram alterados. Nenhuma UI foi modificada.

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
- **Objetivo:** Resolver falha silenciosa na exclusÃ£o de contratos (e clientes) originada por violaÃ§Ã£o de foreign key.
- **Arquivos Alterados:**
    - `/services/ledger/ledgerActions.ts`: IncluÃ­das as tabelas `ledger_entries`, `portal_tokens`, `portal_sessions`, `mensagens_suporte`, `acordo_documentos` e `sinalizacoes_pagamento` nas listas de `deletePromises` e `cascadeDeletes`.
- **Arquivos Novos:**
    - Nenhum.
- **ObservaÃ§Ãµes:** O Supabase bloqueava a exclusÃ£o final do contrato porque as novas tabelas (do portal, ledger e suporte) apontavam para o `loan_id` do contrato sem `ON DELETE CASCADE`. AdicionÃ¡-las Ã  exclusÃ£o manual em cascata elimina o impedimento.
- **Escopo:** Apenas backend/persistÃªncia, focado na correÃ§Ã£o funcional do botÃ£o Excluir, sem impacto visual ou mudanÃ§as estruturais na interface.

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
- **Validacao:** Teste sintÃ©tico confirmou contrato `PAGO` com parcela antiga pendente retornando saldo zero, status de motor `PAID`, grupo `PAID` e zero em `Capital na Rua`; `npm run lint` e `npm run build` executados com sucesso.
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
