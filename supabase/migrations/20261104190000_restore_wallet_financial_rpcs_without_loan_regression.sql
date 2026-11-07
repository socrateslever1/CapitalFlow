-- Fix the actual API/schema drift without replaying obsolete 2026-10-26 constraints.
-- The old phase-1 migration would remove LOAN_DISBURSEMENT and LOAN_REPAYMENT,
-- which are present in the current production ledger. Do not run it unchanged.
-- Preserve every historical account balance, payment, transaction, and contract.
DO $$
DECLARE v_types text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_types
  FROM pg_constraint c WHERE c.conrelid='public.personal_wallet_account_operations'::regclass
  AND c.conname='personal_wallet_account_operations_operation_type_check';
  IF v_types IS NULL
     OR position('EXTERNAL_TRANSFER' IN v_types)=0
     OR position('LOAN_DISBURSEMENT' IN v_types)=0
     OR position('LOAN_REPAYMENT' IN v_types)=0 THEN
    RAISE EXCEPTION 'Tipo de operações de empréstimo ou transferência divergente; abortando.';
  END IF;
  IF to_regprocedure('public.personal_wallet_record_external_transfer(uuid,numeric,timestamptz,text,text,text,text,uuid)') IS NOT NULL
    OR to_regprocedure('public.personal_wallet_create_charge(uuid,numeric,text,uuid)') IS NOT NULL
    OR to_regprocedure('public.personal_wallet_settle_charge(uuid,uuid,numeric,timestamptz,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'As RPCs já existem: revisar versões antes de aplicar correções.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_charges'
      AND policyname='payment_charges_wallet_select'
  ) THEN RAISE EXCEPTION 'Política de cobrança já existente: revisar antes de prosseguir.'; END IF;
END $$;

ALTER TABLE public.personal_wallet_account_operations
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS external_identifier text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- New metadata constraint is additive and does not redefine the loan types.
ALTER TABLE public.personal_wallet_account_operations
  ADD CONSTRAINT personal_wallet_external_transfer_metadata_check CHECK (
    (operation_type='EXTERNAL_TRANSFER'
      AND char_length(btrim(coalesce(recipient_name,''))) BETWEEN 1 AND 160
      AND occurred_at IS NOT NULL
      AND (nullif(btrim(coalesce(pix_key,'')),'') IS NOT NULL
        OR nullif(btrim(coalesce(external_identifier,'')),'') IS NOT NULL))
    OR
    (operation_type<>'EXTERNAL_TRANSFER'
      AND recipient_name IS NULL AND pix_key IS NULL AND external_identifier IS NULL)
  );

CREATE INDEX IF NOT EXISTS wallet_operations_occurred_at_idx
  ON public.personal_wallet_account_operations(owner_user_id,occurred_at DESC)
  WHERE occurred_at IS NOT NULL;

-- Existing gateway charges stay unchanged. Only STATIC_PIX requires new metadata.
ALTER TABLE public.payment_charges
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.personal_wallet_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS create_request_id uuid,
  ADD COLUMN IF NOT EXISTS settled_request_id uuid,
  ADD COLUMN IF NOT EXISTS settled_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS settlement_occurred_at timestamptz;

ALTER TABLE public.payment_charges
  ADD CONSTRAINT payment_charges_wallet_static_pix_check CHECK (
    provider <> 'STATIC_PIX'
    OR (
      owner_user_id IS NOT NULL AND account_id IS NOT NULL
      AND create_request_id IS NOT NULL AND currency='BRL'
      AND amount>0 AND amount=round(amount,2)
      AND char_length(btrim(coalesce(description,''))) BETWEEN 1 AND 240
      AND status IN ('PENDING','PAID')
      AND (
        (status='PENDING' AND settled_request_id IS NULL AND settled_amount IS NULL
          AND settlement_occurred_at IS NULL AND paid_at IS NULL)
        OR
        (status='PAID' AND settled_request_id IS NOT NULL AND settled_amount=amount
          AND settlement_occurred_at IS NOT NULL AND paid_at IS NOT NULL)
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_charges_wallet_create_request_uidx
  ON public.payment_charges(owner_user_id,create_request_id)
  WHERE provider='STATIC_PIX';
CREATE UNIQUE INDEX IF NOT EXISTS payment_charges_wallet_settle_request_uidx
  ON public.payment_charges(owner_user_id,settled_request_id)
  WHERE provider='STATIC_PIX' AND settled_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_charges_wallet_account_idx
  ON public.payment_charges(owner_user_id,account_id,created_at DESC)
  WHERE provider='STATIC_PIX';

ALTER TABLE public.personal_wallet_account_operations
  ADD COLUMN IF NOT EXISTS charge_id uuid REFERENCES public.payment_charges(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_operations_charge_uidx
  ON public.personal_wallet_account_operations(owner_user_id,charge_id)
  WHERE charge_id IS NOT NULL;

-- Existing payment gateway RLS policy is preserved verbatim.
-- A second permissive SELECT policy exposes wallet charges only to their owner.
CREATE POLICY payment_charges_wallet_select ON public.payment_charges
FOR SELECT TO authenticated
USING (
  provider='STATIC_PIX' AND owner_user_id=(SELECT auth.uid())
  AND (SELECT public.is_platform_super_admin())
);

-- Prevent a manually settled wallet PIX charge from being credited to the
-- legacy contracts ledger as well as the personal wallet.
create or replace function private.wallet_prevent_static_charge_legacy_credit()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  if new.payment_charge_id is not null and exists (
    select 1 from public.payment_charges
    where id=new.payment_charge_id and provider='STATIC_PIX'
  ) then
    raise exception 'Cobrancas STATIC_PIX da Carteira nao podem ser lancadas no ledger legado.';
  end if;
  return new;
end;
$$;
revoke all on function private.wallet_prevent_static_charge_legacy_credit() from public,anon,authenticated,service_role;
drop trigger if exists wallet_prevent_static_charge_legacy_credit on public.transacoes;
create trigger wallet_prevent_static_charge_legacy_credit
before insert or update of payment_charge_id on public.transacoes
for each row execute function private.wallet_prevent_static_charge_legacy_credit();

-- Explicitly authorized, serialized, idempotent, single-transaction RPCs.
create or replace function public.personal_wallet_record_external_transfer(
  p_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_recipient_name text,
  p_pix_key text,
  p_external_identifier text,
  p_description text,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_recipient text := btrim(coalesce(p_recipient_name,''));
  v_pix_key text := nullif(btrim(coalesce(p_pix_key,'')),'');
  v_identifier text := nullif(btrim(coalesce(p_external_identifier,'')),'');
  v_description text := btrim(coalesce(p_description,''));
  v_balance numeric(14,2);
  v_existing public.personal_wallet_account_operations%rowtype;
  v_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_account_id is null or p_request_id is null or p_occurred_at is null then
    raise exception 'Faltam dados obrigatorios da transferencia externa.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  v_amount := p_amount;
  if char_length(v_recipient) not between 1 and 160 then raise exception 'Favorecido invalido.'; end if;
  if char_length(v_description) not between 1 and 240 then raise exception 'Descricao invalida.'; end if;
  if char_length(coalesce(v_pix_key,'')) > 255 or char_length(coalesce(v_identifier,'')) > 160 then
    raise exception 'Dados de rastreabilidade excedem o limite permitido.';
  end if;
  if v_pix_key is null and v_identifier is null then
    raise exception 'Informe a chave PIX ou o identificador externo.';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Data da transferencia nao pode estar no futuro.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing
  from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.operation_type<>'EXTERNAL_TRANSFER'
       or v_existing.from_account_id is distinct from p_account_id
       or v_existing.amount<>v_amount
       or v_existing.description<>v_description
       or v_existing.recipient_name<>v_recipient
       or v_existing.pix_key is distinct from v_pix_key
       or v_existing.external_identifier is distinct from v_identifier
       or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'Identificador de operacao reutilizado para valores diferentes.';
    end if;
    return v_existing.id;
  end if;

  select balance into v_balance
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
  if v_balance < v_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;

  update public.personal_wallet_accounts
  set balance=round(balance-v_amount,2),updated_at=now()
  where id=p_account_id and owner_user_id=v_user;

  insert into public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,recipient_name,pix_key,
    external_identifier,occurred_at
  ) values (
    v_user,p_request_id,'EXTERNAL_TRANSFER',p_account_id,null,
    v_amount,v_description,'Transferencia externa',
    (p_occurred_at at time zone 'America/Manaus')::date,
    v_recipient,v_pix_key,v_identifier,p_occurred_at
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.personal_wallet_record_external_transfer(uuid,numeric,timestamptz,text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_record_external_transfer(uuid,numeric,timestamptz,text,text,text,text,uuid) to authenticated;

create or replace function public.personal_wallet_create_charge(
  p_account_id uuid,
  p_amount numeric,
  p_description text,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_description text := btrim(coalesce(p_description,''));
  v_existing public.payment_charges%rowtype;
  v_charge_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_account_id is null or p_request_id is null then
    raise exception 'Conta e identificador da requisicao sao obrigatorios.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  if char_length(v_description) not between 1 and 240 then
    raise exception 'Descricao invalida.';
  end if;
  v_amount:=p_amount;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing
  from public.payment_charges
  where owner_user_id=v_user and create_request_id=p_request_id and provider='STATIC_PIX';
  if found then
    if v_existing.account_id is distinct from p_account_id
       or v_existing.amount<>v_amount
       or v_existing.description<>v_description then
      raise exception 'Identificador de criacao reutilizado para dados diferentes.';
    end if;
    return v_existing.id;
  end if;

  perform 1
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
    and nullif(btrim(coalesce(pix_key,'')),'') is not null
  for update;
  if not found then
    raise exception 'Conta com chave PIX nao encontrada ou nao autorizada.';
  end if;

  insert into public.payment_charges(
    provider,status,amount,currency,external_reference,provider_payload,
    owner_user_id,account_id,description,create_request_id
  ) values (
    'STATIC_PIX','PENDING',v_amount,'BRL',
    'wallet-static-pix:'||v_user::text||':'||p_request_id::text,
    jsonb_build_object('kind','STATIC_PIX','account_id',p_account_id),
    v_user,p_account_id,v_description,p_request_id
  ) returning id into v_charge_id;
  return v_charge_id;
end;
$$;
revoke all on function public.personal_wallet_create_charge(uuid,numeric,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_create_charge(uuid,numeric,text,uuid) to authenticated;

create or replace function public.personal_wallet_settle_charge(
  p_charge_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_charge public.payment_charges%rowtype;
  v_existing_operation public.personal_wallet_account_operations%rowtype;
  v_operation_id uuid;
  v_account_balance numeric(14,2);
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_charge_id is null or p_account_id is null or p_occurred_at is null or p_request_id is null then
    raise exception 'Faltam dados obrigatorios da liquidacao.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  if p_occurred_at>now()+interval '5 minutes' then
    raise exception 'Data do recebimento nao pode estar no futuro.';
  end if;
  v_amount:=p_amount;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_charge
  from public.payment_charges
  where id=p_charge_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Cobranca nao encontrada ou nao autorizada.'; end if;
  if v_charge.provider<>'STATIC_PIX' then
    raise exception 'Cobrancas de gateways externos nao podem ser baixadas pela Carteira.';
  end if;
  if v_charge.account_id is distinct from p_account_id then
    raise exception 'A conta informada nao corresponde a cobranca.';
  end if;
  if v_charge.amount<>v_amount then
    raise exception 'O valor deve corresponder exatamente ao valor original da cobranca.';
  end if;

  if v_charge.status='PAID' then
    if v_charge.settled_request_id is distinct from p_request_id
       or v_charge.settled_amount is distinct from v_amount
       or v_charge.settlement_occurred_at is distinct from p_occurred_at then
      raise exception 'Cobranca ja liquidada por outra requisicao.';
    end if;
    select id into v_operation_id
    from public.personal_wallet_account_operations
    where owner_user_id=v_user and charge_id=p_charge_id and request_id=p_request_id;
    if not found then raise exception 'Liquidacao inconsistente: operacao de conta ausente.'; end if;
    return v_operation_id;
  end if;
  if v_charge.status<>'PENDING' then
    raise exception 'Somente cobrancas pendentes podem ser liquidadas.';
  end if;

  select * into v_existing_operation
  from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
  if found then raise exception 'Identificador de liquidacao ja utilizado em outra operacao.'; end if;

  select balance into v_account_balance
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Conta de destino nao encontrada ou nao autorizada.'; end if;

  update public.payment_charges
  set status='PAID',paid_at=p_occurred_at,settled_request_id=p_request_id,
      settled_amount=v_amount,settlement_occurred_at=p_occurred_at,updated_at=now()
  where id=p_charge_id and owner_user_id=v_user;

  update public.personal_wallet_accounts
  set balance=round(balance+v_amount,2),updated_at=now()
  where id=p_account_id and owner_user_id=v_user;

  insert into public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,charge_id
  ) values (
    v_user,p_request_id,'RECEIPT',null,p_account_id,v_amount,
    left('Recebimento PIX - '||v_charge.description,240),'Cobranca PIX',
    (p_occurred_at at time zone 'America/Manaus')::date,p_occurred_at,p_charge_id
  ) returning id into v_operation_id;
  return v_operation_id;
end;
$$;
revoke all on function public.personal_wallet_settle_charge(uuid,uuid,numeric,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_settle_charge(uuid,uuid,numeric,timestamptz,uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
