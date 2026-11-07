-- Compatibilidade de schema para instalações que já possuíam arquivamento.
-- As ações de arquivar foram substituídas por exclusão segura em migration posterior.
alter table public.personal_wallet_accounts
  add column if not exists archived_at timestamptz;

create index if not exists personal_wallet_accounts_active_idx
  on public.personal_wallet_accounts(owner_user_id, created_at desc)
  where archived_at is null;
