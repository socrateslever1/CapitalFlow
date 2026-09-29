-- Remove redundant database objects and keep service-only tables off the public API.

revoke all on table public.audit_perfis_sensiveis from anon, authenticated;
revoke all on table public.campaign_messages from anon, authenticated;
revoke all on table public.documentos_juridicos_versoes from anon, authenticated;
revoke all on table public.financial_balance_audit from anon, authenticated;
revoke all on table public.financial_operations from anon, authenticated;
revoke all on table public.logs_acesso_cliente from anon, authenticated;
revoke all on table public.logs_sistema from anon, authenticated;
revoke all on table public.n8n_automation_integrations from anon, authenticated;
revoke all on table public.n8n_client_sessions from anon, authenticated;
revoke all on table public.n8n_handoffs from anon, authenticated;
revoke all on table public.n8n_loan_leads from anon, authenticated;
revoke all on table public.n8n_message_events from anon, authenticated;
revoke all on table public.n8n_payment_promises from anon, authenticated;
revoke all on table public.n8n_short_links from anon, authenticated;
revoke all on table public.portal_doc_tokens from anon, authenticated;
revoke all on table public.whatsapp_admin_commands from anon, authenticated;

revoke execute on function public.campaign_belongs_to_current_owner(uuid) from anon;
revoke execute on function public.campaign_owner_id(uuid) from anon;
revoke execute on function public.ensure_client_portal_access(uuid) from anon;
revoke execute on function public.portal_assert_session(uuid) from anon;
revoke execute on function public.sync_client_data_to_contracts() from anon;
revoke execute on function public.sync_mutuo_pre_desembolso_signature_status() from anon;

alter table public.assinaturas_documento
  drop constraint if exists unique_documento_papel;

drop index if exists public.clientes_portal_token_ux;
drop index if exists public.contratos_portal_token_unique;
drop index if exists public.idx_contratos_portal_token;
drop index if exists public.idx_contratos_portal_token_unique;
drop index if exists public.idx_docs_loan;
drop index if exists public.idx_documentos_juridicos_profile_id;

alter table public.payment_charges
  drop constraint if exists ux_payment_charges_external_reference;

drop index if exists public.idx_sinalizacoes_loan_id;
drop index if exists public.idx_sinalizacoes_profile_id;
drop index if exists public.idx_sinalizacoes_status;
drop index if exists public.idx_support_tickets_loan_non_unique;

notify pgrst, 'reload schema';
;
