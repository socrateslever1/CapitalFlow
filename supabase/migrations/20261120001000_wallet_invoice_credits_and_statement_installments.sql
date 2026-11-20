-- Suporte completo e 100% aditivo a:
-- 1) Créditos / estornos / ajustes negativos na fatura (is_invoice_credit = true),
--    abatendo o valor da fatura sem congelar compras futuras e mantendo amount > 0.
-- 2) Geração automática de parcelas futuras (n/m) na importação de PDF/OFX do cartão.

ALTER TABLE public.personal_wallet_expenses
  ADD COLUMN IF NOT EXISTS is_invoice_credit boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.wallet_effective_cycle_amount(
  p_owner_id uuid,
  p_card_id uuid,
  p_due_month date
)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  with invoice as (
    select id, is_opening_summary
    from public.personal_wallet_expenses
    where owner_user_id = p_owner_id
      and card_id = p_card_id
      and entry_type = 'INVOICE_OVERRIDE'
      and status <> 'CANCELED'
      and invoice_due_month = date_trunc('month', p_due_month)::date
    limit 1
  )
  select greatest(
    0,
    coalesce(
      round(
        sum(
          case
            when coalesce(e.is_invoice_credit, false) then -greatest(0, i.amount - coalesce(i.paid_amount, 0))
            else greatest(0, i.amount - coalesce(i.paid_amount, 0))
          end
        ),
        2
      ),
      0
    )
  )
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.owner_user_id = p_owner_id
    and e.card_id = p_card_id
    and e.status <> 'CANCELED'
    and i.status <> 'CANCELED'
    and i.due_month = date_trunc('month', p_due_month)::date
    and (
      e.id = (select id from invoice)
      or (
        e.entry_type = 'PURCHASE'
        and i.status = 'PENDING'
        and (
          not exists(select 1 from invoice)
          or (
            exists(select 1 from invoice where is_opening_summary)
            and i.opening_invoice_id is distinct from (select id from invoice)
          )
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.personal_wallet_pay_invoice_partial(
  p_card_id uuid,
  p_due_month date,
  p_account_id uuid,
  p_amount numeric,
  p_request_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_month date:=date_trunc('month',p_due_month)::date;
  v_existing public.personal_wallet_invoice_payments%rowtype;
  v_override_id uuid;
  v_remaining numeric(14,2);
  v_allocate numeric(14,2);
  v_applied numeric(14,2);
  v_balance numeric(14,2);
  v_card_name text;
  v_row record;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Informe um pagamento valido com ate duas casas decimais.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':invoice-payment:'||p_card_id::text,0));
  select nickname into v_card_name from public.personal_wallet_cards
  where id=p_card_id and owner_user_id=v_user and status='ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;
  select * into v_existing from public.personal_wallet_invoice_payments
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.card_id<>p_card_id or v_existing.due_month<>v_month
      or v_existing.account_id is distinct from p_account_id or v_existing.amount<>p_amount
    then raise exception 'Chave de pagamento ja utilizada com dados diferentes.'; end if;
    return v_existing.amount;
  end if;
  if p_account_id is not null then
    select balance into v_balance from public.personal_wallet_accounts
    where id=p_account_id and owner_user_id=v_user for update;
    if not found then raise exception 'Conta de pagamento nao encontrada.'; end if;
    if v_balance<p_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;
  end if;
  select id into v_override_id from public.personal_wallet_expenses
  where owner_user_id=v_user and card_id=p_card_id and entry_type='INVOICE_OVERRIDE'
    and invoice_due_month=v_month and status<>'CANCELED' limit 1;
  v_remaining:=private.wallet_effective_cycle_amount(v_user,p_card_id,v_month);
  if v_remaining<=0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  if p_amount>v_remaining then raise exception 'Pagamento excede o saldo restante da fatura.'; end if;
  v_allocate:=p_amount;
  for v_row in
    select i.id,i.amount,i.paid_amount
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.owner_user_id=v_user and e.card_id=p_card_id and i.owner_user_id=v_user
      and i.due_month=v_month and i.status='PENDING'
      and not coalesce(e.is_invoice_credit, false)
      and ((v_override_id is not null and e.id=v_override_id)
        or (v_override_id is null and e.entry_type='PURCHASE')
        or (e.entry_type='PURCHASE' and i.opening_invoice_id is distinct from v_override_id
          and exists(select 1 from public.personal_wallet_expenses o where o.id=v_override_id and o.is_opening_summary)))
    order by (e.id=v_override_id) desc,i.installment_number,i.id for update of i
  loop
    exit when v_allocate=0;
    v_applied:=least(v_allocate,v_row.amount-v_row.paid_amount);
    update public.personal_wallet_expense_installments
    set paid_amount=paid_amount+v_applied,
        status=case when paid_amount+v_applied>=amount then 'PAID' else 'PENDING' end
    where id=v_row.id;
    v_allocate:=v_allocate-v_applied;
  end loop;
  if v_allocate<>0 then raise exception 'Inconsistencia na alocacao do pagamento.'; end if;
  if private.wallet_effective_cycle_amount(v_user,p_card_id,v_month) = 0 then
    update public.personal_wallet_expense_installments i
    set paid_amount = i.amount, status = 'PAID'
    from public.personal_wallet_expenses e
    where e.id = i.expense_id
      and e.owner_user_id = v_user and e.card_id = p_card_id and i.owner_user_id = v_user
      and i.due_month = v_month and i.status = 'PENDING'
      and e.status <> 'CANCELED'
      and ((v_override_id is not null and e.id=v_override_id)
        or (v_override_id is null and e.entry_type='PURCHASE')
        or (e.entry_type='PURCHASE' and i.opening_invoice_id is distinct from v_override_id
          and exists(select 1 from public.personal_wallet_expenses o where o.id=v_override_id and o.is_opening_summary)));
  end if;
  if p_account_id is not null then
    update public.personal_wallet_accounts set balance=round(balance-p_amount,2),updated_at=now()
    where id=p_account_id and owner_user_id=v_user;
  end if;
  insert into public.personal_wallet_invoice_payments(owner_user_id,card_id,due_month,account_id,amount,request_id,source)
  values(v_user,p_card_id,v_month,p_account_id,p_amount,p_request_id,
    case when p_account_id is null then 'MANUAL' else 'ACCOUNT' end);
  if p_account_id is not null then
    insert into public.personal_wallet_account_operations(
      owner_user_id,request_id,operation_type,from_account_id,to_account_id,amount,
      description,category,operation_date,occurred_at
    ) values(v_user,p_request_id,'PAYMENT',p_account_id,null,p_amount,
      left('Pagamento de fatura - '||coalesce(v_card_name,'Cartao')||' - '||to_char(v_month,'MM/YYYY'),240),
      'Cartao de credito',(now() at time zone 'America/Manaus')::date,now());
  end if;
  update public.personal_wallet_expenses e set status='PAID',updated_at=now()
  where e.card_id=p_card_id and e.owner_user_id=v_user and e.status='PENDING'
    and not exists(select 1 from public.personal_wallet_expense_installments i where i.expense_id=e.id and i.status='PENDING');
  perform private.wallet_recalculate_card_position(v_user,p_card_id);
  return p_amount;
end;
$function$;

CREATE OR REPLACE FUNCTION public.personal_wallet_create_invoice_credit(
  p_card_id uuid,
  p_due_month date,
  p_amount numeric,
  p_description text,
  p_expense_date date,
  p_notes text,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_month date := date_trunc('month', p_due_month)::date;
  v_existing uuid;
  v_expense_id uuid;
  v_desc text := coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'Crédito / ajuste de fatura');
  v_date date := coalesce(p_expense_date, (now() AT TIME ZONE 'America/Manaus')::date);
BEGIN
  IF v_owner IS NULL OR NOT public.can_access_personal_wallet() THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_card_id IS NULL OR p_due_month IS NULL OR p_request_id IS NULL
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Informe cartão, mês e valor de crédito válidos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text || ':invoice-credit:' || p_card_id::text || ':' || p_request_id::text, 0));

  PERFORM 1 FROM public.personal_wallet_cards
  WHERE id = p_card_id AND owner_user_id = v_owner AND status = 'ACTIVE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão ativo não encontrado.';
  END IF;

  SELECT id INTO v_existing
  FROM public.personal_wallet_expenses
  WHERE owner_user_id = v_owner AND request_id = p_request_id
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.personal_wallet_expenses (
    owner_user_id, description, amount, category, expense_date, due_date,
    card_id, status, installment_count, notes, entry_type, is_invoice_credit, request_id
  ) VALUES (
    v_owner, v_desc, round(p_amount, 2), 'Ajuste de fatura', v_date, v_month,
    p_card_id, 'PENDING', 1, coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'Crédito / estorno abatido da fatura.'),
    'PURCHASE', true, p_request_id
  ) RETURNING id INTO v_expense_id;

  INSERT INTO public.personal_wallet_expense_installments (
    expense_id, owner_user_id, installment_number, due_month, amount, paid_amount, status
  ) VALUES (
    v_expense_id, v_owner, 1, v_month, round(p_amount, 2), 0, 'PENDING'
  );

  PERFORM private.wallet_recalculate_card_position(
    v_owner, p_card_id, coalesce((SELECT opening_invoice_month FROM public.personal_wallet_cards WHERE id = p_card_id), v_month)
  );
  RETURN v_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.personal_wallet_create_invoice_credit(uuid, date, numeric, text, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.personal_wallet_create_invoice_credit(uuid, date, numeric, text, date, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.personal_wallet_record_card_purchase_atomic(
  p_card_id uuid,
  p_document_hash text,
  p_row_key text,
  p_entry_date date,
  p_description text,
  p_amount numeric,
  p_category text,
  p_due_month date,
  p_included_in_opening boolean,
  p_allow_duplicates boolean,
  p_installment_number integer,
  p_installment_total integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
  v_existing public.personal_wallet_statement_rows%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_month date := date_trunc('month', p_due_month)::date;
  v_expense_id uuid;
  v_cur integer;
  v_tot integer;
  v_remaining integer;
  v_k integer;
BEGIN
  IF v_owner IS NULL OR NOT public.can_access_personal_wallet() THEN
    RAISE EXCEPTION 'Acesso não autorizado à importação.';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR p_amount <> round(p_amount, 2)
     OR p_due_month IS NULL OR p_due_month <> date_trunc('month', p_due_month)::date
     OR p_included_in_opening IS NULL THEN
    RAISE EXCEPTION 'Compra, centavos ou mês de vencimento inválido.';
  END IF;

  IF NOT coalesce(p_allow_duplicates, false) AND EXISTS (
    SELECT 1 FROM public.personal_wallet_statement_rows s
    WHERE s.owner_user_id = v_owner AND s.target_kind = 'CARD'
      AND s.target_id = p_card_id AND s.entry_date = p_entry_date
      AND s.amount = p_amount
      AND lower(btrim(s.description)) = lower(btrim(p_description))
      AND s.document_hash IS DISTINCT FROM p_document_hash
  ) THEN
    RAISE EXCEPTION 'Compra possivelmente duplicada. Revise o extrato antes de autorizar uma repetição.';
  END IF;

  v_row_id := public.personal_wallet_record_statement_row(
    'CARD', p_card_id, p_document_hash, p_row_key, p_entry_date, p_description, p_amount, p_category
  );

  SELECT * INTO v_existing
  FROM public.personal_wallet_statement_rows
  WHERE id = v_row_id AND owner_user_id = v_owner
  FOR UPDATE;

  IF NOT FOUND OR v_existing.amount <> p_amount
     OR v_existing.entry_date IS DISTINCT FROM p_entry_date
     OR v_existing.description IS DISTINCT FROM btrim(p_description)
     OR v_existing.category IS DISTINCT FROM coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Outros') THEN
    RAISE EXCEPTION 'O item deste documento foi alterado desde a importação anterior. Confira os valores originais.';
  END IF;

  IF v_existing.expense_id IS NOT NULL THEN
    RETURN v_existing.expense_id;
  END IF;

  -- Créditos / estornos de compras (valor negativo): abate da fatura sem travar futuras compras
  IF p_amount < 0 THEN
    v_expense_id := public.personal_wallet_create_invoice_credit(
      p_card_id,
      v_month,
      abs(p_amount),
      v_existing.description,
      v_existing.entry_date,
      'Crédito / estorno importado da fatura.',
      v_row_id
    );
    UPDATE public.personal_wallet_statement_rows
       SET expense_id = v_expense_id, opening_included = p_included_in_opening
     WHERE id = v_row_id;
    RETURN v_expense_id;
  END IF;

  -- Compras parceladas (n/m com parcelas restantes > 1) fora de abertura inicial:
  -- gera a parcela atual e todas as parcelas futuras automaticamente
  v_cur := coalesce(p_installment_number, 0);
  v_tot := coalesce(p_installment_total, 0);
  IF NOT p_included_in_opening AND v_cur >= 1 AND v_tot > v_cur AND v_tot <= 120 THEN
    v_remaining := v_tot - v_cur + 1;
    SELECT * INTO v_card
    FROM public.personal_wallet_cards
    WHERE id = p_card_id AND owner_user_id = v_owner AND status = 'ACTIVE'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cartão não encontrado.';
    END IF;

    INSERT INTO public.personal_wallet_expenses (
      owner_user_id, description, amount, category, expense_date, due_date,
      card_id, status, installment_count, notes, entry_type, is_invoice_credit, request_id
    ) VALUES (
      v_owner,
      v_existing.description,
      round(p_amount * v_remaining, 2),
      v_existing.category,
      v_existing.entry_date,
      v_month,
      v_card.id,
      'PENDING',
      v_tot,
      format('Importado do PDF (parcelas %s/%s até %s/%s).', v_cur, v_tot, v_tot, v_tot),
      'PURCHASE',
      false,
      v_row_id
    ) RETURNING id INTO v_expense_id;

    FOR v_k IN 0..(v_remaining - 1) LOOP
      INSERT INTO public.personal_wallet_expense_installments (
        expense_id, owner_user_id, installment_number, due_month, amount, paid_amount, status
      ) VALUES (
        v_expense_id,
        v_owner,
        v_cur + v_k,
        (v_month + make_interval(months => v_k))::date,
        round(p_amount, 2),
        0,
        'PENDING'
      );
    END LOOP;

    UPDATE public.personal_wallet_statement_rows
       SET expense_id = v_expense_id, opening_included = false
     WHERE id = v_row_id;

    PERFORM private.wallet_recalculate_card_position(
      v_owner, v_card.id, coalesce(v_card.opening_invoice_month, v_month)
    );
    RETURN v_expense_id;
  END IF;

  -- Compra à vista (ou última parcela n/n, ou detalhamento de abertura): usa fluxo canônico
  RETURN public.personal_wallet_import_card_statement_purchase(
    v_row_id, v_month, p_included_in_opening, v_row_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid, text, text, date, text, numeric, text, date, boolean, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid, text, text, date, text, numeric, text, date, boolean, boolean, integer, integer) TO authenticated;

-- Mantém sobrecarga legada de 10 argumentos delegando para a versão completa de 12 argumentos
CREATE OR REPLACE FUNCTION public.personal_wallet_record_card_purchase_atomic(
  p_card_id uuid,
  p_document_hash text,
  p_row_key text,
  p_entry_date date,
  p_description text,
  p_amount numeric,
  p_category text,
  p_due_month date,
  p_included_in_opening boolean,
  p_allow_duplicates boolean DEFAULT false
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.personal_wallet_record_card_purchase_atomic(
    p_card_id, p_document_hash, p_row_key, p_entry_date, p_description,
    p_amount, p_category, p_due_month, p_included_in_opening,
    coalesce(p_allow_duplicates, false), NULL::integer, NULL::integer
  );
$function$;
