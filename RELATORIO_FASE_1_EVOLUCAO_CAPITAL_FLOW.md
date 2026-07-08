# Relatorio Fase 1 - Evolucao Capital Flow

Data: 2026-07-07

## Escopo desta fase

Mapeamento inicial do sistema existente para orientar as proximas fases do plano de evolucao. Esta fase nao altera regras de negocio, banco, telas ou funcoes. O objetivo e registrar o que ja existe, o que falta e quais arquivos devem ser considerados antes de qualquer implementacao.

## 1. Supabase - tabelas e estruturas conhecidas

Fonte analisada: `supabase_types.ts` e migrations em `supabase/migrations`.

### Tabelas centrais ja existentes

- `perfis`: perfis/operadores do sistema.
- `clientes`: cadastro principal de clientes.
- `contratos`: contratos/emprestimos principais.
- `parcelas`: parcelas vinculadas aos contratos.
- `transacoes`: lancamentos financeiros dos contratos.
- `fontes`: fontes de capital.
- `contas_caixa`: contas/caixas internos.
- `documentos_juridicos`: documentos juridicos gerados.
- `assinaturas_documento`: assinaturas dos documentos.
- `testemunhas`: testemunhas juridicas.

### Recebimentos, cobrancas e auditoria

- `payment_charges`: rastreio de cobrancas criadas em provedores externos.
- `payment_events`: eventos de pagamento.
- `payment_idempotency`: controle de idempotencia.
- `payment_intents`: sinais/intencoes de pagamento pelo portal.
- `payment_transactions`: auditoria de recebimentos processados.
- `payment_reversals`: auditoria de estornos.
- `pagamentos`: tabela legada/auxiliar de pagamentos.
- `sinalizacoes_pagamento`: sinalizacoes legadas/auxiliares.

### Portal e acesso publico

- `portal_tokens`
- `portal_sessions`
- `portal_doc_tokens`
- `portal_client_links`
- `logs_acesso_cliente`
- RPCs de portal em migrations como `20260706_fix_client_portal_access_statuses.sql`.

### WhatsApp e notificacoes

- `whatsapp_configs`: credenciais e templates do WhatsApp.
- `whatsapp_queue`: fila de envio de mensagens WhatsApp.
- `notificacoes`: notificacoes internas.
- `push_subscriptions`: inscricoes push.

### Renegociacao/acordos

- `acordos_inadimplencia`
- `acordo_parcelas`
- `acordo_pagamentos`
- `acordo_documentos`
- `acordo_assinaturas`

### Outras areas existentes

- Captacao/campanhas: `campaigns`, `campaign_leads`, `campaign_messages`.
- Suporte: `mensagens_suporte`, `support_calls`, `support_presence`, `support_signals`, `support_tickets`.
- Equipe: `teams`, `team_members`, `team_invites`, `equipes`.
- Financeiro pessoal: `pf_accounts`, `pf_transactions`.
- Views financeiras e de risco: `vw_aging_inadimplencia`, `vw_inadimplencia_atual`, `vw_fluxo_projetado_mensal`, `vw_saldo_contabil`, `vw_health_score`, `vw_roi_profile`, entre outras.

## 2. Supabase Edge Functions existentes

Diretorio analisado: `supabase/functions`.

- `mp-create-pix`: cria pagamento PIX no Mercado Pago.
- `mp-create-preference`: cria preferencia/link de pagamento Mercado Pago.
- `mp-webhook`: recebe retorno do Mercado Pago e processa baixa.
- `asaas-create-payment`: cria cobranca Asaas.
- `asaas-webhook`: recebe retorno Asaas e processa baixa.
- `whatsapp-send`: envia WhatsApp via Meta, Evolution API ou Z-API.
- `ai-assistant`: suporte de IA.
- `ensure_auth_user`: apoio de autenticacao/perfil.
- `_shared`: utilitarios compartilhados.

## 3. Fluxo atual de WhatsApp

Arquivos principais:

- `features/profile/components/WhatsAppConfig.tsx`
- `services/whatsappConfig.service.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/migrations/20260614_create_whatsapp_config.sql`
- `supabase/migrations/20260614_whatsapp_triggers.sql`
- `supabase/migrations/20260706_whatsapp_default_message_templates.sql`

### O que ja existe

- Tela no perfil para configurar tipo de API: Meta, Evolution API ou Z-API.
- Templates padrao para lembrete, cobranca no vencimento, atraso e confirmacao.
- Service de frontend para salvar configuracao e enviar teste.
- Edge Function `whatsapp-send` que busca configuracao e envia a mensagem.
- Fila `whatsapp_queue`.
- Trigger em `parcelas` para enfileirar mensagem quando parcela muda para `PAID`.
- Uso manual de WhatsApp Web em varios pontos pelo helper `buildWhatsAppLink`.

### Lacunas identificadas

- Nao foi localizado worker/cron automatico que consuma `whatsapp_queue` continuamente.
- A regua D-3, D0, D+1, D+3, D+7 e D+15 ainda nao aparece como fluxo unico consolidado.
- Categorias formais de mensagem ainda precisam ser modeladas: aviso, cobranca, confirmacao, atendimento e juridico.
- Aprovacao humana para mensagens juridicas/sensiveis ainda nao esta consolidada.
- O diretorio `waha/docker-compose.yaml` citado na IDE nao existe no workspace atual; nao foi possivel analisar WAHA local.

## 4. Telas e fluxos relevantes

### Perfil/configuracoes

- `pages/ProfilePage.tsx`
- `features/profile/components/WhatsAppConfig.tsx`
- `features/profile/components/MercadoPagoConfig.tsx`
- `features/profile/components/AsaasConfig.tsx`
- `services/paymentConfig.service.ts`
- `services/whatsappConfig.service.ts`

### Recebimentos e pagamentos

- `components/modals/PaymentManagerModal.tsx`
- `components/cards/components/InstallmentGrid.tsx`
- `pages/ContractDetailsPage.tsx`
- `pages/ContractDetails/PaymentRegistrationForm.tsx`
- `services/payments.service.ts`
- `features/payments/modality/*`
- RPC principal: `process_payment_v3_selective`.

### Comprovantes

- `components/modals/ReceiptModal.tsx`
- `components/cards/components/LedgerList.tsx`
- `pages/ContractDetails/LedgerTimeline.tsx`
- Migration relacionada: `20260529_payment_receipts_and_partial_agreements.sql`.

### Clientes e contratos

- `pages/ClientsPage.tsx`
- `containers/ClientsContainer.tsx`
- `components/cards/ClientGroupCard.tsx`
- `components/cards/LoanCard.tsx`
- `components/forms/LoanFormClientSection.tsx`
- `services/contracts.service.ts`
- `services/clientAvatar.service.ts`

### Portal do cliente

- `features/portal/ClientPortalView.tsx`
- `features/portal/components/PortalPaymentModal.tsx`
- `features/portal/components/payment/PaymentViews.tsx`
- `features/portal/hooks/useClientPortalLogic.ts`
- `services/portal.service.ts`
- `services/offline/portalOfflineStore.ts`

## 5. O que ja existe por fase do plano

### Fase 2 - Recebimentos e cobrancas

Ja existe:
- criacao de cobrancas por Mercado Pago e Asaas;
- webhooks dos dois provedores;
- tabela `payment_charges`;
- baixa automatica via `process_payment_v3_selective`;
- comprovante visual/texto/PDF/Imagem em `ReceiptModal`;
- intencao de pagamento pelo portal com upload de comprovante.

Falta consolidar:
- modelo unico de cobranca interna independente do provedor;
- status padronizado e visivel para cobrancas;
- relacao formal entre cobranca, contrato, parcela, servico e cliente;
- envio automatico confiavel de confirmacao por WhatsApp apos baixa.

### Fase 3 - Regua de cobranca

Ja existe:
- templates basicos de WhatsApp;
- fila `whatsapp_queue`;
- envio via `whatsapp-send`;
- mensagens manuais em varias telas.

Falta:
- motor de eventos D-3, D0, D+1, D+3, D+7, D+15;
- logs formais de mensagem;
- categorias e aprovacao humana para juridico/sensivel;
- worker/cron de processamento da fila.

### Fase 4 - Portal do cliente

Ja existe:
- portal por token/shortcode;
- listagem de contratos/parcelas;
- intencao de pagamento;
- upload de comprovante;
- documentos juridicos e assinatura publica.

Falta revisar:
- expiracao/revogacao por configuracao;
- exibicao consolidada de cobrancas abertas;
- comprovantes historicos de forma centralizada;
- versionamento/documento aceito com logs completos.

### Fase 5 - Link temporario / queima digital

Ja existe parcialmente:
- `portal_tokens`, `portal_doc_tokens`, `portal_sessions`, `portal_client_links`;
- logs de acesso de cliente.

Falta:
- politica clara de acesso unico/prazo;
- marca d'agua dinamica;
- revogacao automatica conforme aceite/expiracao/fechamento.

### Fase 6 - Acesso de terceiros

Ja existe parcialmente:
- rotas publicas de campanha/captacao;
- login/autenticacao;
- portal publico.

Falta:
- site institucional completo;
- separacao formal entre site publico comercial e app privado;
- planos e rotas comerciais.

### Fase 7 - Planos Free e Full

Nao foi encontrado fluxo consolidado de planos Free/Full.

Falta:
- tabela de planos;
- limites por plano;
- bloqueios elegantes;
- tela de upgrade.

### Fase 8 - Seguranca

Ja existe:
- RLS em varias tabelas;
- funcoes de perfil/owner;
- Edge Functions usando service role;
- ajustes recentes de RLS em pagamentos e WhatsApp.

Falta revisar:
- consistencia das policies antigas que usam `profile_id = auth.uid()`;
- separacao dono/admin/operador/visualizador em todos os fluxos;
- validacao de usuario em todas as Edge Functions;
- exposicao de tokens no frontend e configs locais.

### Fase 9 - Redesign gradual

Nao iniciado nesta fase. Conforme regra do projeto, qualquer redesign deve ser feito depois das prioridades funcionais e com autorizacao expressa.

## 6. Arquivos provaveis para proximas fases

### Para Fase 2

- `supabase/migrations/*payment*`
- `supabase/functions/mp-create-pix/index.ts`
- `supabase/functions/mp-create-preference/index.ts`
- `supabase/functions/mp-webhook/index.ts`
- `supabase/functions/asaas-create-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `services/payments.service.ts`
- `services/paymentConfig.service.ts`
- `services/pix.service.ts`
- `components/modals/PaymentManagerModal.tsx`
- `components/modals/ReceiptModal.tsx`
- `features/portal/components/PortalPaymentModal.tsx`

### Para Fase 3

- `services/whatsappConfig.service.ts`
- `features/profile/components/WhatsAppConfig.tsx`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/migrations/20260614_create_whatsapp_config.sql`
- `supabase/migrations/20260614_whatsapp_triggers.sql`
- `supabase/migrations/20260706_whatsapp_default_message_templates.sql`
- possivel nova migration para regua/logs/categorias
- possivel nova Edge Function ou cron para processar fila

### Para Fase 4 e 5

- `features/portal/ClientPortalView.tsx`
- `features/portal/components/PortalPaymentModal.tsx`
- `features/portal/components/payment/PaymentViews.tsx`
- `features/portal/hooks/useClientPortalLogic.ts`
- `services/portal.service.ts`
- `services/offline/portalOfflineStore.ts`
- `supabase/migrations/*portal*`
- `features/legal/*`

### Para Fase 8

- todas as migrations com RLS;
- `supabase/functions/*`;
- `lib/supabase.ts`;
- services que acessam tabelas por `profile_id`.

## 7. Recomendacao de proximo passo

Antes de implementar novas telas ou redesign, o proximo passo seguro e a Fase 2 em modo cirurgico:

1. revisar o modelo atual de `payment_charges`, `payment_intents`, `payment_transactions` e `parcelas`;
2. definir se `payment_charges` sera a tabela unica de cobrancas ou se sera criada uma tabela `cobrancas`;
3. padronizar status e relacionamentos;
4. garantir baixa automatica idempotente;
5. garantir comprovante e WhatsApp de confirmacao no mesmo fluxo.

Essa decisao impacta banco, webhooks, portal e recebimento. Por isso, nao deve ser feita sem uma analise especifica desses arquivos antes da implementacao.
