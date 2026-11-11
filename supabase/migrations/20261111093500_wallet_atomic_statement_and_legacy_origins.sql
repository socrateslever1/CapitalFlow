-- Preserva vínculos preexistentes de recursos arquivados, sem permitir criar novos vínculos inválidos.
CREATE OR REPLACE FUNCTION public.capital_source_replace_wallet_origins(p_source_id uuid, p_origins jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_origin jsonb;
  v_kind text;
  v_target uuid;
  v_amount numeric(14,2);
  v_raw_amount text;
  v_count integer := 0;
  v_prior_keys text[];
begin
  if v_uid is null or not public.can_manage_capital_source_wallet_origins() then
    raise exception 'Somente o administrador principal pode configurar as origens.';
  end if;
  if p_source_id is null or p_origins is null or jsonb_typeof(p_origins)<>'array'
      or jsonb_array_length(p_origins)>32 then
    raise exception 'Informe uma lista válida de até 32 origens.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,39247));
  perform 1 from public.fontes f join public.perfis p on p.id=f.profile_id
    where f.id=p_source_id and f.archived_at is null
      and (p.user_id=v_uid or p.id=v_uid)
    for update of f;
  if not found then raise exception 'Fonte indisponível ou não autorizada.'; end if;

  -- Referências legadas podem continuar vinculadas mesmo se o recurso foi
  -- arquivado/bloqueado. Novas referências continuam sujeitas a todas as validações.
  select coalesce(array_agg(r.target_kind||':'||r.target_id::text),array[]::text[])
    into v_prior_keys from public.capital_source_wallet_references r
    where r.source_id=p_source_id and r.owner_user_id=v_uid;

  -- A exclusão é transacional; qualquer falha de validação desfaz tudo.
  delete from public.capital_source_wallet_references
    where source_id=p_source_id and owner_user_id=v_uid;

  for v_origin in select value from jsonb_array_elements(p_origins) loop
    if jsonb_typeof(v_origin)<>'object' then
      raise exception 'Formato de origem inválido.';
    end if;
    v_kind := v_origin->>'target_kind';
    if v_kind is null or v_kind not in ('ACCOUNT','CARD') then
      raise exception 'Tipo de recurso inválido.';
    end if;
    if coalesce(v_origin->>'target_id','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Identificador de recurso inválido.';
    end if;
    v_target := (v_origin->>'target_id')::uuid;
    v_raw_amount := nullif(v_origin->>'allocated_amount','');
    v_amount := null;
    if v_raw_amount is not null then
      if v_raw_amount !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
        raise exception 'Valor de referência inválido. Use até duas casas decimais.';
      end if;
      v_amount := v_raw_amount::numeric(14,2);
    end if;

    if v_kind='ACCOUNT' then
      perform 1 from public.personal_wallet_accounts a
        where a.id=v_target and a.owner_user_id=v_uid
          and a.archived_at is null and a.capital_source_id is null for share;
      if not found and not (v_kind||':'||v_target::text = any(v_prior_keys)) then
        raise exception 'Conta indisponível ou com sincronização de saldos existente.';
      end if;
    else
      perform 1 from public.personal_wallet_cards c
        where c.id=v_target and c.owner_user_id=v_uid and c.status='ACTIVE' for share;
      if not found and not (v_kind||':'||v_target::text = any(v_prior_keys)) then raise exception 'Cartão indisponível ou não autorizado.'; end if;
    end if;

    insert into public.capital_source_wallet_references
      (source_id,owner_user_id,target_kind,target_id,allocated_amount)
    values(p_source_id,v_uid,v_kind,v_target,v_amount);
    v_count := v_count+1;
  end loop;
  return true;
exception when unique_violation then
  raise exception 'Origem repetida ou selecionada por outra fonte.';
end $function$
;
-- Uma única transação para o item de extrato e sua compra financeira:
-- qualquer erro reverte ambas, inclusive atualizações de limite e parcelas.
CREATE OR REPLACE FUNCTION public.personal_wallet_record_card_purchase_atomic(
  p_card_id uuid, p_document_hash text, p_row_key text, p_entry_date date,
  p_description text, p_amount numeric, p_category text, p_due_month date,
  p_included_in_opening boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $atomic$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
  v_existing public.personal_wallet_statement_rows%rowtype;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso não autorizado à importação.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2)
     OR p_due_month IS NULL OR p_due_month <> date_trunc('month',p_due_month)::date
     OR p_included_in_opening IS NULL THEN
    RAISE EXCEPTION 'Compra, centavos ou mês de vencimento inválido.';
  END IF;
  v_row_id := public.personal_wallet_record_statement_row(
    'CARD',p_card_id,p_document_hash,p_row_key,p_entry_date,p_description,p_amount,p_category
  );
  SELECT * INTO v_existing FROM public.personal_wallet_statement_rows
    WHERE id=v_row_id AND owner_user_id=v_owner FOR UPDATE;
  IF NOT FOUND OR v_existing.amount <> p_amount
     OR v_existing.entry_date IS DISTINCT FROM p_entry_date
     OR v_existing.description IS DISTINCT FROM btrim(p_description)
     OR v_existing.category IS DISTINCT FROM coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros') THEN
    RAISE EXCEPTION 'O item deste documento foi alterado desde a importação anterior. Confira os valores originais.';
  END IF;
  RETURN public.personal_wallet_import_card_statement_purchase(
    v_row_id,p_due_month,p_included_in_opening,v_row_id
  );
END;
$atomic$;
REVOKE ALL ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean) TO authenticated;
