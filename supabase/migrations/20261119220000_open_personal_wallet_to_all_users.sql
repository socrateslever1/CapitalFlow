-- Libera a Minha Carteira para todos os usuários autenticados,
-- preservando o isolamento estrito por owner_user_id / user_id = auth.uid()
-- e mantendo platform_admin_*, ai_assistant_requests e reconciliação histórica restritos a is_platform_super_admin().

CREATE OR REPLACE FUNCTION public.can_access_personal_wallet()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_modulos um
      WHERE um.user_id = auth.uid()
        AND um.modulo_chave = 'carteira'
        AND um.ativo = false
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_personal_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_personal_wallet() TO authenticated;

INSERT INTO public.user_modulos (user_id, modulo_chave, ativo, configuracoes)
SELECT u.id, 'carteira', true, '{}'::jsonb
FROM auth.users u
ON CONFLICT (user_id, modulo_chave) DO NOTHING;

INSERT INTO public.capital_source_wallet_origin_access (owner_user_id)
SELECT u.id
FROM auth.users u
ON CONFLICT (owner_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.personal_wallet_ensure_default_cash_account()
RETURNS personal_wallet_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid := auth.uid();
  v_account public.personal_wallet_accounts%rowtype;
  v_initialized boolean := false;
begin
  if v_owner is null or not public.can_access_personal_wallet() then
    raise exception 'Sessão não encontrada.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('personal_wallet_cash:' || v_owner::text, 0));

  insert into public.user_modulos (user_id, modulo_chave, ativo, configuracoes)
  values (v_owner, 'carteira', true, '{}'::jsonb)
  on conflict (user_id, modulo_chave) do nothing;

  insert into public.capital_source_wallet_origin_access (owner_user_id)
  values (v_owner)
  on conflict (owner_user_id) do nothing;

  select coalesce((configuracoes->>'wallet_cash_initialized')::boolean, false)
    into v_initialized
    from public.user_modulos
   where user_id = v_owner and modulo_chave = 'carteira';

  select * into v_account
    from public.personal_wallet_accounts
   where owner_user_id = v_owner and account_type = 'CASH'
   order by created_at asc
   limit 1
   for update;

  if found then
    update public.user_modulos
       set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
           atualizado_em = now()
     where user_id = v_owner and modulo_chave = 'carteira';
    return v_account;
  end if;

  if v_initialized then return null; end if;

  insert into public.personal_wallet_accounts(owner_user_id, nickname, bank_name, account_type, balance)
  values (v_owner, 'Carteira física', null, 'CASH', 0)
  returning * into v_account;

  update public.user_modulos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
         atualizado_em = now()
   where user_id = v_owner and modulo_chave = 'carteira';
  return v_account;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_capital_source_wallet_origins()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null
    and public.can_access_personal_wallet()
$function$;

-- Atualiza as policies RLS das tabelas da Minha Carteira para permitir qualquer usuário autenticado em seus próprios registros
ALTER POLICY "loan_card_wallet_charges_owner_read" ON public.loan_card_wallet_charges
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "payment_charges_wallet_select" ON public.payment_charges
  USING ((provider = 'STATIC_PIX'::text) AND (owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_operations_owner_read" ON public.personal_wallet_account_operations
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "personal_wallet_accounts_owner_all" ON public.personal_wallet_accounts
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_invoice_facts_insert_owner" ON public.personal_wallet_card_invoice_facts
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()) AND (EXISTS (
    SELECT 1 FROM public.personal_wallet_cards card
    WHERE card.id = personal_wallet_card_invoice_facts.card_id AND card.owner_user_id = (SELECT auth.uid() AS uid)
  )));

ALTER POLICY "wallet_invoice_facts_read_owner" ON public.personal_wallet_card_invoice_facts
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()) AND (EXISTS (
    SELECT 1 FROM public.personal_wallet_cards card
    WHERE card.id = personal_wallet_card_invoice_facts.card_id AND card.owner_user_id = (SELECT auth.uid() AS uid)
  )));

ALTER POLICY "wallet_invoice_facts_update_owner" ON public.personal_wallet_card_invoice_facts
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()) AND (EXISTS (
    SELECT 1 FROM public.personal_wallet_cards card
    WHERE card.id = personal_wallet_card_invoice_facts.card_id AND card.owner_user_id = (SELECT auth.uid() AS uid)
  )))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()) AND (EXISTS (
    SELECT 1 FROM public.personal_wallet_cards card
    WHERE card.id = personal_wallet_card_invoice_facts.card_id AND card.owner_user_id = (SELECT auth.uid() AS uid)
  )));

ALTER POLICY "wallet_card_vault_owner" ON public.personal_wallet_card_vault
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "personal_wallet_cards_owner_all" ON public.personal_wallet_cards
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "personal_wallet_installments_owner_all" ON public.personal_wallet_expense_installments
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "personal_wallet_expenses_owner_all" ON public.personal_wallet_expenses
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_invoice_payments_owner_read" ON public.personal_wallet_invoice_payments
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_pin_profile_owner" ON public.personal_wallet_pin_profiles
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "recurring_income_owner_all" ON public.personal_wallet_recurring_incomes
  USING ((user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_recurring_issue_owner" ON public.personal_wallet_recurring_obligation_issues
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_recurring_obligation_owner" ON public.personal_wallet_recurring_obligations
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "recurring_receipts_owner_read" ON public.personal_wallet_recurring_receipts
  USING ((user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

ALTER POLICY "wallet_statement_rows_owner_read" ON public.personal_wallet_statement_rows
  USING ((owner_user_id = (SELECT auth.uid() AS uid)) AND (SELECT public.can_access_personal_wallet()));

-- Atualiza as funções da Carteira para validar can_access_personal_wallet() mantendo isolamento por auth.uid()
DO $$
DECLARE
  v_rec record;
  v_def text;
BEGIN
  FOR v_rec IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND p.prosrc ILIKE '%is_platform_super_admin%'
      AND p.proname NOT LIKE 'platform_admin_%'
      AND p.proname NOT IN (
        'personal_wallet_list_historical_receipts',
        'personal_wallet_reconcile_historical_receipt'
      )
  LOOP
    v_def := pg_get_functiondef(v_rec.oid);
    v_def := regexp_replace(v_def, 'public\.is_platform_super_admin\(\)', 'public.can_access_personal_wallet()', 'gi');
    v_def := regexp_replace(v_def, 'is_platform_super_admin\(\)', 'public.can_access_personal_wallet()', 'gi');
    EXECUTE v_def;
  END LOOP;
END;
$$;
