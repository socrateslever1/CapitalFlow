-- A card-funded loan has two different obligations: capital advanced to the
-- borrower and the amount owed to the card issuer. Finalize both once, in one
-- database transaction, while preserving already posted legacy advances.
create table public.loan_card_wallet_charges (
  loan_id uuid primary key references public.contratos(id),
  owner_user_id uuid not null references auth.users(id),
  card_id uuid not null references public.personal_wallet_cards(id),
  expense_id uuid not null unique references public.personal_wallet_expenses(id),
  created_at timestamptz not null default now()
);

alter table public.loan_card_wallet_charges enable row level security;
revoke all on public.loan_card_wallet_charges from public, anon, authenticated;
grant select on public.loan_card_wallet_charges to authenticated;
create policy loan_card_wallet_charges_owner_read
  on public.loan_card_wallet_charges for select to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

create or replace function public.finalize_card_funded_loan_v1(p_loan_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_loan public.contratos%rowtype;
  v_source public.fontes%rowtype;
  v_card_id uuid;
  v_card public.personal_wallet_cards%rowtype;
  v_expense public.personal_wallet_expenses%rowtype;
  v_expense_id uuid;
  v_reference_count integer;
  v_advance_count integer;
  v_advance_amount numeric;
  v_advance_source uuid;
  v_total numeric(14,2);
  v_count integer;
  v_date date;
begin
  if v_user is null or not public.is_platform_super_admin() or p_loan_id is null then
    raise exception 'Somente o administrador principal pode finalizar o emprestimo no cartao.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('card-funded-loan:' || p_loan_id::text, 0));

  select * into v_loan from public.contratos where id = p_loan_id for update;
  if not found or not exists (
    select 1 from public.perfis p where p.id = v_loan.owner_id and p.user_id = v_user
  ) then raise exception 'Emprestimo nao encontrado para este titular.'; end if;

  select expense_id into v_expense_id from public.loan_card_wallet_charges
    where loan_id = p_loan_id and owner_user_id = v_user;
  if v_expense_id is not null then return v_expense_id; end if;

  if v_loan.funding_payment_method is distinct from 'CREDIT_CARD' then
    raise exception 'O emprestimo nao foi financiado por cartao.';
  end if;
  v_total := round(v_loan.funding_total_payable, 2);
  v_count := coalesce(v_loan.funding_installments_count, 1);
  if v_total is null or v_total <= 0 or v_total < v_loan.principal
     or v_total <> v_loan.funding_total_payable or v_count not between 1 and 120 then
    raise exception 'Total ou quantidade de parcelas do cartao invalido.';
  end if;

  select * into v_source from public.fontes
    where id = v_loan.source_id and profile_id = v_loan.owner_id and archived_at is null
    for update;
  if not found or v_source.type not in ('CARD', 'MISTO') then
    raise exception 'Fonte de cartao indisponivel para este emprestimo.';
  end if;

  select count(*), (max(target_id::text) filter (where target_kind = 'CARD'))::uuid
    into v_reference_count, v_card_id
    from public.capital_source_wallet_references
    where source_id = v_source.id and owner_user_id = v_user;
  if v_reference_count <> 1 or v_card_id is null then
    raise exception 'Vincule exatamente um cartao da Carteira a esta fonte antes de finalizar.';
  end if;
  select * into v_card from public.personal_wallet_cards
    where id = v_card_id and owner_user_id = v_user and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartao vinculado indisponivel.'; end if;

  select * into v_expense from public.personal_wallet_expenses
    where owner_user_id = v_user and request_id = p_loan_id for update;
  if found and (v_expense.card_id is distinct from v_card_id
    or v_expense.amount is distinct from v_total
    or v_expense.installment_count is distinct from v_count) then
    raise exception 'Ja existe um lancamento divergente para este emprestimo.';
  end if;
  if not found and round(v_card.credit_limit - v_card.used_limit, 2) < v_total then
    raise exception 'Limite disponivel do cartao insuficiente para o total financiado.';
  end if;

  select count(*), max(amount), max(source_id::text)::uuid
    into v_advance_count, v_advance_amount, v_advance_source
    from public.transacoes where loan_id = p_loan_id and type = 'LOAN_INITIAL';
  if v_advance_count > 1 or (v_advance_count = 1 and
      (v_advance_amount is distinct from v_loan.principal
       or v_advance_source is distinct from v_loan.source_id)) then
    raise exception 'Saida inicial do capital divergente; revise antes de finalizar.';
  end if;
  if v_advance_count = 0 then
    update public.fontes set balance = round(balance - v_loan.principal, 2)
      where id = v_source.id;
    insert into public.transacoes
      (id, loan_id, profile_id, source_id, date, type, amount,
       principal_delta, interest_delta, late_fee_delta, category, notes,
       idempotency_key)
    values (gen_random_uuid(), p_loan_id, v_loan.owner_id, v_source.id, now(),
      'LOAN_INITIAL', v_loan.principal, 0, 0, 0, 'INVESTIMENTO',
      'Emprestimo inicial financiado no cartao', p_loan_id);
  end if;

  v_date := coalesce((v_loan.created_at at time zone 'America/Manaus')::date,
                     (now() at time zone 'America/Manaus')::date);
  v_expense_id := public.personal_wallet_create_expense(
    'Emprestimo a ' || coalesce(nullif(trim(v_loan.debtor_name), ''), 'cliente'),
    v_total, 'Emprestimos', v_date, null, null, v_card_id,
    'PENDING', v_count, null,
    'Custo de captacao do contrato ' || p_loan_id::text,
    p_loan_id
  );
  insert into public.loan_card_wallet_charges
    (loan_id, owner_user_id, card_id, expense_id)
  values (p_loan_id, v_user, v_card_id, v_expense_id);
  return v_expense_id;
end;
$$;

revoke all on function public.finalize_card_funded_loan_v1(uuid) from public, anon, authenticated;
grant execute on function public.finalize_card_funded_loan_v1(uuid) to authenticated;
