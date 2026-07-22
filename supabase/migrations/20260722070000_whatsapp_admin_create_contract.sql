create or replace function public.whatsapp_admin_create_monthly_contract(
  p_profile_id uuid,
  p_admin_user_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_document text,
  p_principal numeric,
  p_days integer,
  p_source_id uuid,
  p_interest_rate numeric,
  p_fine_percent numeric,
  p_daily_interest_percent numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_client_id uuid := p_client_id;
  v_contract_id uuid := gen_random_uuid();
  v_installment_id uuid := gen_random_uuid();
  v_source_balance numeric;
  v_total numeric;
  v_start date := (now() at time zone 'America/Manaus')::date;
  v_due date;
  v_phone text := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
  v_document text := regexp_replace(coalesce(p_client_document, ''), '\D', '', 'g');
begin
  if not exists (
    select 1 from public.whatsapp_admin_users
    where id = p_admin_user_id and profile_id = p_profile_id and active
      and (role in ('OWNER', 'ADMIN') or 'CONTRACT_CREATE' = any(permissions))
  ) then raise exception 'Administrador sem permissao para criar contratos'; end if;

  if coalesce(trim(p_client_name), '') = '' then raise exception 'Nome do cliente obrigatorio'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'Valor principal invalido'; end if;
  if p_days is null or p_days < 1 or p_days > 3660 then raise exception 'Prazo invalido'; end if;
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > 1000 then raise exception 'Taxa invalida'; end if;

  if exists (select 1 from public.transacoes where profile_id = p_profile_id and idempotency_key = p_idempotency_key) then
    select loan_id into v_contract_id from public.transacoes
    where profile_id = p_profile_id and idempotency_key = p_idempotency_key limit 1;
    return jsonb_build_object('contract_id', v_contract_id, 'duplicate', true);
  end if;

  select balance into v_source_balance from public.fontes
  where id = p_source_id and profile_id = p_profile_id for update;
  if not found then raise exception 'Fonte de capital nao encontrada'; end if;
  if v_source_balance < p_principal then raise exception 'Saldo insuficiente na fonte de capital'; end if;

  if v_client_id is not null and not exists (
    select 1 from public.clientes where id = v_client_id and owner_id = p_profile_id
  ) then raise exception 'Cliente nao pertence a este perfil'; end if;

  if v_client_id is null and length(v_document) >= 11 then
    select id into v_client_id from public.clientes where owner_id = p_profile_id and document = v_document limit 1;
  end if;
  if v_client_id is null and length(v_phone) >= 10 then
    select id into v_client_id from public.clientes where owner_id = p_profile_id and phone = v_phone limit 1;
  end if;
  if v_client_id is null then
    insert into public.clientes(owner_id, name, phone, document, cpf, access_code, client_number, notes)
    values (
      p_profile_id, trim(p_client_name), nullif(v_phone, ''), nullif(v_document, ''),
      case when length(v_document) = 11 then v_document else null end,
      lpad((floor(random() * 10000))::integer::text, 4, '0'),
      (100000 + floor(random() * 900000))::integer::text,
      'Criado pelo administrador via WhatsApp'
    ) returning id into v_client_id;
  end if;

  v_due := v_start + p_days;
  v_total := round(p_principal * (1 + p_interest_rate / 100), 2);

  insert into public.contratos(
    id, owner_id, profile_id, client_id, source_id, status, debtor_name, debtor_phone,
    debtor_document, principal, interest_rate, fine_percent, daily_interest_percent,
    billing_cycle, amortization_type, start_date, next_due_date, total_to_receive,
    portal_token, portal_shortcode, notes, is_archived
  ) values (
    v_contract_id, p_profile_id, p_profile_id, v_client_id, p_source_id, 'ATIVO', trim(p_client_name),
    nullif(v_phone, ''), nullif(v_document, ''), p_principal, p_interest_rate,
    coalesce(p_fine_percent, 0), coalesce(p_daily_interest_percent, 0), 'MONTHLY', 'JUROS',
    v_start, v_due, v_total, gen_random_uuid(),
    (100000 + floor(random() * 900000))::integer::text,
    'Contrato criado e confirmado pelo administrador via WhatsApp', false
  );

  insert into public.parcelas(
    id, loan_id, profile_id, numero_parcela, start_date, due_date, data_vencimento,
    amount, valor_parcela, scheduled_principal, scheduled_interest,
    principal_remaining, interest_remaining, late_fee_accrued, paid_total, status
  ) values (
    v_installment_id, v_contract_id, p_profile_id, 1, v_start, v_due, v_due,
    v_total, v_total, p_principal, v_total - p_principal,
    p_principal, v_total - p_principal, 0, 0, 'PENDENTE'
  );

  update public.fontes set balance = balance - p_principal where id = p_source_id;
  insert into public.transacoes(
    profile_id, loan_id, source_id, date, type, amount, principal_delta,
    interest_delta, late_fee_delta, category, notes, idempotency_key
  ) values (
    p_profile_id, v_contract_id, p_source_id, now(), 'LOAN_INITIAL', p_principal,
    0, 0, 0, 'INVESTIMENTO', 'Emprestimo inicial criado via WhatsApp', p_idempotency_key
  );

  return jsonb_build_object(
    'client_id', v_client_id, 'contract_id', v_contract_id, 'installment_id', v_installment_id,
    'start_date', v_start, 'due_date', v_due, 'principal', p_principal, 'total', v_total
  );
end;
$$;

revoke all on function public.whatsapp_admin_create_monthly_contract(uuid,uuid,uuid,text,text,text,numeric,integer,uuid,numeric,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.whatsapp_admin_create_monthly_contract(uuid,uuid,uuid,text,text,text,numeric,integer,uuid,numeric,numeric,numeric,text) to service_role;
