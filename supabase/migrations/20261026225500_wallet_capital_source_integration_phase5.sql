-- CapitalFlow Phase 5: Bidirectional Integration between Capital Sources (Loans/Repayments) and Personal Wallet
-- Additive only: legacy accounts, loans and contracts operate seamlessly.

-- 1. Vincular opcionalmente Conta Bancaria da Carteira a Fonte de Capital
alter table public.personal_wallet_accounts
  add column if not exists capital_source_id uuid references public.fontes(id) on delete set null;

create index if not exists personal_wallet_accounts_capital_source_idx
  on public.personal_wallet_accounts(capital_source_id)
  where capital_source_id is not null;

create unique index if not exists personal_wallet_accounts_owner_capital_source_uidx
  on public.personal_wallet_accounts(owner_user_id, capital_source_id)
  where capital_source_id is not null;

-- 2. Atualizar ledger de operacoes para suportar desembolsos e liquidacoes de parcelas
alter table public.personal_wallet_account_operations
  add column if not exists contract_id uuid references public.contratos(id) on delete set null,
  add column if not exists installment_id uuid references public.parcelas(id) on delete set null,
  add column if not exists occurred_at timestamptz;

update public.personal_wallet_account_operations
set occurred_at = coalesce(occurred_at, operation_date::timestamptz, created_at)
where occurred_at is null;

alter table public.personal_wallet_account_operations
  alter column occurred_at set default now();

alter table public.personal_wallet_account_operations
  drop constraint if exists personal_wallet_account_operations_operation_type_check,
  drop constraint if exists personal_wallet_operation_accounts_match;

alter table public.personal_wallet_account_operations
  add constraint personal_wallet_account_operations_operation_type_check
    check (operation_type in (
      'INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER','EXTERNAL_TRANSFER',
      'LOAN_DISBURSEMENT','LOAN_REPAYMENT'
    )),
  add constraint personal_wallet_operation_accounts_match check (
    (operation_type in ('INCOME','RECEIPT','LOAN_REPAYMENT') and from_account_id is null and to_account_id is not null)
    or (operation_type in ('EXPENSE','PAYMENT','EXTERNAL_TRANSFER','LOAN_DISBURSEMENT') and from_account_id is not null and to_account_id is null)
    or (operation_type = 'TRANSFER' and from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)
  );

create index if not exists wallet_operations_contract_idx
  on public.personal_wallet_account_operations(owner_user_id, contract_id)
  where contract_id is not null;

create index if not exists wallet_operations_installment_idx
  on public.personal_wallet_account_operations(owner_user_id, installment_id)
  where installment_id is not null;

-- 3. Funcao de seguranca e isolamento estrito de usuarios
create or replace function public.is_wallet_integration_enabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    exists (
      select 1 from public.platform_admins
      where user_id = p_user_id and role = 'SUPER_ADMIN'
    )
    or exists (
      select 1 from public.user_modulos
      where user_id = p_user_id and modulo_chave = 'carteira' and ativo = true
    )
  );
$$;

revoke all on function public.is_wallet_integration_enabled(uuid) from public, anon;
grant execute on function public.is_wallet_integration_enabled(uuid) to authenticated;

-- 4. RPC para associar / desassociar Fonte de Capital a Conta da Carteira com trava pessimista
create or replace function public.personal_wallet_link_capital_source(
  p_account_id uuid,
  p_capital_source_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_source_exists boolean;
begin
  if v_user is null or not public.is_wallet_integration_enabled(v_user) then
    raise exception 'Acesso nao autorizado ao modulo Carteira.';
  end if;

  if p_account_id is null then
    raise exception 'Conta obrigatoria para vinculacao.';
  end if;

  -- Se foi informada uma fonte de capital, verifica se ela existe e pertence ao perfil acessivel
  if p_capital_source_id is not null then
    select exists (
      select 1 from public.fontes f
      where f.id = p_capital_source_id
        and exists (
          select 1
          from public.perfis owner_profile
          where owner_profile.id = f.profile_id
            and (owner_profile.user_id = v_user or owner_profile.id = v_user)
        )
        and f.archived_at is null
    ) into v_source_exists;

    if not v_source_exists then
      raise exception 'Fonte de capital informada nao encontrada.';
    end if;

    -- Garante que nenhuma outra conta do usuario ja use esta fonte
    if exists (
      select 1 from public.personal_wallet_accounts a
      where a.owner_user_id = v_user
        and a.capital_source_id = p_capital_source_id
        and a.id <> p_account_id
    ) then
      raise exception 'Esta fonte de capital ja esta vinculada a outra conta da sua Carteira.';
    end if;
  end if;

  -- Trava pessimista na conta
  update public.personal_wallet_accounts
  set capital_source_id = p_capital_source_id,
      updated_at = now()
  where id = p_account_id and owner_user_id = v_user;

  if not found then
    raise exception 'Conta nao encontrada ou nao autorizada.';
  end if;

  return true;
end;
$$;

revoke all on function public.personal_wallet_link_capital_source(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_link_capital_source(uuid, uuid) to authenticated;

-- 5. Trigger bidirecional: sincroniza desembolso e liquidacao de contratos automaticamente para a Carteira
create or replace function public.trg_sync_transacao_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_account_id uuid;
  v_balance numeric(14,2);
  v_request_id uuid;
  v_debtor_name text;
  v_parcela_num integer;
  v_desc text;
  v_op_date date;
begin
  -- Apenas opera se houver fonte e valor positivo
  if new.source_id is null or new.amount is null or new.amount <= 0 then
    return new;
  end if;

  -- Somente tipos financeiros pertinentes da operacao
  if new.type not in ('LOAN_INITIAL', 'PAYMENT_RECEIVED') then
    return new;
  end if;

  -- Resolve o owner_user_id atraves do profile_id da transacao
  select coalesce(p.user_id, p.id) into v_owner_user_id
  from public.perfis p
  where p.id = new.profile_id;

  if v_owner_user_id is null then
    return new;
  end if;

  -- Isolamento estrito: se o usuario nao tiver permissao/feature flag da Carteira, nao faz nada
  if not public.is_wallet_integration_enabled(v_owner_user_id) then
    return new;
  end if;

  -- Serializa a operacao pelo usuario para evitar concorrencia
  perform pg_advisory_xact_lock(hashtextextended(v_owner_user_id::text, 19283));

  -- Verifica se a fonte de capital da transacao esta vinculada a uma conta da Carteira (trava pessimista FOR UPDATE)
  select a.id, a.balance into v_account_id, v_balance
  from public.personal_wallet_accounts a
  where a.owner_user_id = v_owner_user_id
    and a.capital_source_id = new.source_id
  for update;

  -- Se a fonte nao estiver vinculada a nenhuma conta da Carteira, sai normalmente
  if v_account_id is null then
    return new;
  end if;

  -- Idempotencia deterministica via hash unico da transacao
  v_request_id := md5('wallet_sync_tx:' || new.id::text)::uuid;
  if exists (
    select 1 from public.personal_wallet_account_operations
    where owner_user_id = v_owner_user_id and request_id = v_request_id
  ) then
    return new;
  end if;

  v_op_date := coalesce((new.date at time zone 'America/Manaus')::date, current_date);

  -- 2. Concessao de Emprestimo (LOAN_INITIAL): debito na conta da Carteira
  if new.type = 'LOAN_INITIAL' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente')
    into v_debtor_name
    from public.contratos c
    where c.id = new.loan_id;

    v_desc := 'Empréstimo concedido · ' || coalesce(v_debtor_name, 'Contrato');
    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    if coalesce(v_balance, 0) < new.amount then
      raise exception 'Saldo insuficiente na conta da Carteira para liberar este empréstimo.';
    end if;

    -- Atualiza o saldo bancario na Carteira
    update public.personal_wallet_accounts
    set balance = round(balance - new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    -- Registra saida no ledger
    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_DISBURSEMENT', v_account_id, null,
      round(new.amount, 2), v_desc, 'Empréstimo concedido', v_op_date, new.loan_id, coalesce(new.created_at, now())
    );

  -- 3. Liquidacao de Parcela / Recebimento (PAYMENT_RECEIVED): credito na conta da Carteira
  elsif new.type = 'PAYMENT_RECEIVED' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente'), p.numero_parcela
    into v_debtor_name, v_parcela_num
    from public.contratos c
    left join public.parcelas p on p.id = new.installment_id
    where c.id = new.loan_id;

    if v_parcela_num is not null then
      v_desc := 'Parcela ' || v_parcela_num::text || ' recebida · ' || coalesce(v_debtor_name, 'Cliente');
    else
      v_desc := 'Recebimento de contrato · ' || coalesce(v_debtor_name, 'Cliente');
    end if;

    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    -- Atualiza o saldo bancario na Carteira
    update public.personal_wallet_accounts
    set balance = round(balance + new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    -- Registra entrada no ledger
    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, installment_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_REPAYMENT', null, v_account_id,
      round(new.amount, 2), v_desc, 'Parcela recebida', v_op_date, new.loan_id, new.installment_id, coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$$;

revoke all on function public.trg_sync_transacao_to_wallet() from public, anon;
grant execute on function public.trg_sync_transacao_to_wallet() to authenticated, service_role;

drop trigger if exists trg_sync_transacao_to_wallet on public.transacoes;
create trigger trg_sync_transacao_to_wallet
  after insert on public.transacoes
  for each row execute function public.trg_sync_transacao_to_wallet();
