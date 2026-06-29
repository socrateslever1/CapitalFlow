# Implementacoes - RECEBIMENTOS COMPROVANTES

## 2026-06-28 - Multa Recorrente e Juros Preservado
- **Objetivo:** Corrigir a regra de perdão para preservar o juros/lucro de 30% quando o operador perdoa apenas multa e/ou mora, e aplicar multa fixa recorrente de 2% a cada mês de atraso.
- **Arquivos Alterados:**
    - `/components/modals/payment/hooks/usePaymentManagerState.ts`: Corrigido o modo combinado de multa+mora para não zerar `interest`; somente `TOTAL_CHARGES` e `CAPITAL_ONLY` zeram juros.
    - `/components/modals/PaymentManagerModal.tsx` e `/pages/ContractDetails/PaymentRegistrationForm.tsx`: Botões passaram a usar modos explícitos `MORA_ONLY` e `FINE_AND_MORA`, evitando confusão entre mora e juros/lucro.
    - `/domain/finance/calculations.ts`, `/domain/loanEngine.ts`, `/hooks/controllers/usePaymentController.ts` e `/services/payments.service.ts`: Tipos e cálculo de perdão atualizados para aceitar os modos explícitos mantendo compatibilidade com nomes antigos.
    - `/domain/finance/lateFeePolicy.ts`: Novo helper central para calcular multa fixa recorrente por blocos de 30 dias de atraso.
    - `/domain/finance/modalities/monthly/monthly.calculations.ts`, `/domain/finance/modalities/daily30/daily30.calculations.ts`, `/domain/finance/modalities/dailyFixed/dailyFixed.calculations.ts`, `/domain/finance/modalities/dailyFixedTerm/calculations.ts`, `/domain/finance/modality/giro.calculations.ts` e `/domain/finance/modality/diarioB.calculations.ts`: Multa fixa passou a ser aplicada ao atrasar e reaplicada a cada 30 dias.
- **Arquivos Criados:**
    - `/domain/finance/lateFeePolicy.ts`
- **Validacao:** Teste lógico com `npx tsx -e` confirmou que multa+mora mantém o juros de 30% e que apenas `TOTAL_CHARGES` deixa somente capital; `npx tsc --noEmit --pretty false` e `npx vite build --outDir C:\tmp\capitalflow-payment-forgiveness-build --emptyOutDir` executados com sucesso.
- **Riscos/Observacoes:** A multa recorrente usa blocos de 30 dias: 1-30 dias = 1 multa, 31-60 = 2 multas, 61-90 = 3 multas. A mora diária continua separada.
- **Escopo:** Alteração limitada ao cálculo de multa/mora/juros no recebimento e às telas de seleção de perdão.

## 2026-06-28 - Perdao Combinado de Encargos
- **Objetivo:** Permitir selecionar perdão de multa e mora juntos, sem confundir essa combinação com o perdão total de encargos.
- **Arquivos Alterados:**
    - `/domain/finance/calculations.ts`: Adicionado o modo `TOTAL_CHARGES`. O modo `BOTH` passou a representar apenas multa + mora, enquanto `TOTAL_CHARGES` zera multa, mora e juros remuneratórios/práxis.
    - `/domain/loanEngine.ts`: Atualizada a assinatura do motor para aceitar `TOTAL_CHARGES`.
    - `/components/modals/payment/hooks/usePaymentManagerState.ts`: Ajustado o cálculo visual para separar multa+mora de perdão total dos encargos.
    - `/components/modals/PaymentManagerModal.tsx`: Botões de `Perdoar Multa` e `Perdoar Mora` agora combinam entre si; o botão verde passou a ser `Perdoar 100% dos Encargos`.
    - `/pages/ContractDetails/PaymentRegistrationForm.tsx`: Aplicada a mesma regra de combinação no formulário de recebimento da página de detalhes.
    - `/hooks/controllers/usePaymentController.ts` e `/services/payments.service.ts`: Atualizado o fluxo de persistência para aceitar `TOTAL_CHARGES`, não realocar encargos perdoados e zerar juros/multa/mora no banco quando o perdão total for usado.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx tsc --noEmit --pretty false`, teste lógico com `npx tsx -e` e `npx vite build --outDir C:\tmp\capitalflow-payment-build --emptyOutDir` executados com sucesso.
- **Riscos/Observacoes:** Recebimento com `Perdoar 100% dos Encargos` exige internet, pois precisa zerar juros e encargos diretamente no banco com segurança. Perdão parcial de multa/mora segue disponível no fluxo normal.
- **Escopo:** Alteração limitada à regra de perdão de encargos no recebimento e às telas onde essa escolha aparece.

### Ajuste Posterior - Juros/Práxis Preservado
- **Problema Corrigido:** A combinação de `Perdoar Multa` + `Perdoar Mora` ainda estava zerando visualmente o juros/lucro do ciclo por causa do modo interno ambíguo `BOTH`.
- **Correção:** Criados modos explícitos `MORA_ONLY` e `FINE_AND_MORA`; `FINE_AND_MORA` perdoa somente multa e mora, mantendo o juros de 30%/práxis. Apenas `TOTAL_CHARGES` ou `CAPITAL_ONLY` zera também o juros e recebe só o capital.
- **Validacao:** Teste lógico com contrato de R$ 1.000 a 30% confirmou: `FINE_AND_MORA` mantém total em R$ 1.300, enquanto `TOTAL_CHARGES` reduz para R$ 1.000; `npx tsc --noEmit --pretty false` e build Vite executados com sucesso.

### Ajuste Posterior - Valor Sugerido no Recebimento
- **Problema Corrigido:** O campo `Registrar Pagamento` abria vazio, exigindo que o operador digitasse manualmente o valor total calculado.
- **Correção:** O campo agora abre preenchido com o total a receber e atualiza automaticamente quando o operador muda os botões de perdão. O valor permanece editável para pagamento parcial ou ajuste manual.
- **Validacao:** `npx tsc --noEmit --pretty false` executado com sucesso.

## 2026-06-27 - Normalizacao do Comprovante
- **Objetivo:** Remover a duplicidade de opcoes de PDF no modal de comprovante e normalizar o fluxo em tres acoes claras: texto, imagem e PDF.
- **Arquivos Alterados:**
    - `/components/modals/ReceiptModal.tsx`: O seletor do comprovante passou a exibir apenas `Texto`, `Imagem` e `PDF`, com um unico botao principal. O envio por texto abre o WhatsApp com a mensagem pronta. A imagem tenta usar o compartilhamento nativo do aparelho; quando o navegador nao permite compartilhar imagem, o sistema gera PDF automaticamente. O PDF e compartilhado quando o navegador suporta arquivo ou baixado localmente; se a geracao falhar, a impressao abre como fallback para salvar em PDF. Textos e acentos visiveis do comprovante foram revisados em portugues.
- **Arquivos Criados:** Nenhum.
- **Validacao:** `npx tsc --noEmit --pretty false` executado com sucesso.
- **Riscos/Observacoes:** Navegadores desktop geralmente nao permitem anexar automaticamente arquivo em conversa do WhatsApp por link. Por isso, arquivos sao compartilhados via Web Share API quando disponivel ou baixados para anexo manual.
- **Escopo:** Alteracao limitada ao modal de comprovante e ao resumo da categoria de recebimentos/comprovantes.

## 2026-06-14 - Quitacao com Perdao Total de Encargos
- **Objetivo:** Corrigir pagamento em atraso com perdao total de juros/encargos para que, ao receber o capital aberto, a parcela/contrato nao fique com saldo residual indevido.
- **Arquivos Alterados:**
    - `/components/modals/payment/hooks/usePaymentManagerState.ts`: O modo `BOTH` passou a zerar tambem o juros remuneratorio no total exibido, fazendo o valor sugerido/validado representar somente o capital quando o usuario escolhe perdoar todos os encargos.
    - `/services/payments.service.ts`: Quando `BOTH` cobre o capital da parcela, a alocacao passa a registrar o recebimento como principal, zerar juros/multa/mora depois da RPC e marcar a parcela/contrato como pago quando o saldo revalidado do contrato fica zerado.
- **Arquivos Criados:** Nenhum.
- **Validacao:** Simulacao local com `npx tsx -e` reproduziu o saldo residual antigo de R$ 100 e confirmou saldo zero apos a regra nova; `npx vite build` executado com sucesso.
- **Riscos/Observacoes:** A correcao atua apenas quando o pagamento com `Perdoar Total` cobre o capital aberto da parcela. Pagamentos parciais continuam seguindo a alocacao normal. Esse recebimento exige internet para garantir que os encargos sejam zerados no banco com seguranca.
- **Escopo:** Alteracao limitada ao calculo visual e persistencia do recebimento com perdao total.

## 2026-06-08
- **Objetivo:** Tornar o comprovante estavel e melhor formatado, aceitando o fluxo de impressao/salvar como PDF no lugar da geracao instavel de imagem.
- **Arquivos Alterados:**
    - `/components/modals/ReceiptModal.tsx`: Removidas as rotinas de PNG/jsPDF/canvas que travavam o sistema. O comprovante agora abre uma janela propria de impressao com layout em HTML/CSS, pronto para imprimir ou salvar como PDF pelo navegador. O modal mantem a opcao de enviar texto pelo WhatsApp, sem tentar anexar arquivo automaticamente.
- **Arquivos Criados:** Nenhum.
- **Riscos/Observacoes:** A geracao de imagem foi retirada do fluxo principal por instabilidade. Para PDF, o caminho recomendado e usar a janela de impressao do navegador e escolher "Salvar como PDF".
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso; `git diff --check` sem erros, apenas aviso normal de LF/CRLF no Windows.
- **Escopo:** Ajuste limitado ao modal de comprovante e ao resumo da categoria de recebimentos/comprovantes.

## 2026-06-07
- **Objetivo:** Simplificar o envio de comprovante pelo WhatsApp e evitar travamento por geracao antecipada de PNG/PDF.
- **Arquivos Alterados:**
    - `/components/modals/ReceiptModal.tsx`: O fluxo passou a ter selecao de formato (`Texto`, `PNG` ou `PDF`) e um unico botao `Enviar no WhatsApp`. PNG/PDF agora sao gerados somente no clique de envio, com escala menor no canvas; quando o navegador suporta compartilhamento de arquivo, envia o arquivo pelo compartilhamento nativo, e quando nao suporta baixa o arquivo e abre a conversa do WhatsApp com a mensagem pronta. Textos visiveis do comprovante foram corrigidos para portugues.
- **Ajuste Posterior no Mesmo Dia:**
    - `/components/modals/ReceiptModal.tsx`: Restaurada a opcao `Imprimir`, que era o caminho funcional anterior. PNG e PDF voltaram a ter botoes diretos de download, e o envio pelo WhatsApp agora abre a conversa com texto pronto; quando o formato escolhido for PNG/PDF, o arquivo e gerado/baixado antes e a conversa e aberta para anexo manual.
- **Arquivos Criados:** Nenhum.
- **Riscos/Observacoes:** Navegadores de desktop nao permitem anexar automaticamente um arquivo local/blob em uma conversa do WhatsApp por link `wa.me`; nesses casos o sistema baixa o comprovante e abre a conversa para anexo manual. Em navegadores com Web Share API compativel, o arquivo e entregue ao compartilhamento nativo.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Alteracao limitada ao modal de comprovante e ao resumo da categoria de recebimentos/comprovantes.

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
