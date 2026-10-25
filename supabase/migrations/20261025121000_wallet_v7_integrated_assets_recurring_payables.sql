-- CapitalFlow V7 - extensão da carteira (não altera o motor de empréstimos V4)
-- Os nomes físicos são personal_wallet_*. Não criar cópias de contas, cartões ou dívidas.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45000ms';

CREATE TABLE IF NOT EXISTS public.personal_wallet_institutions (
 institution_key text PRIMARY KEY,
 display_name text NOT NULL,
 primary_color text NOT NULL DEFAULT '#334155',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_wallet_institutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_institutions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.personal_wallet_institutions TO authenticated;
DROP POLICY IF EXISTS wallet_institutions_read ON public.personal_wallet_institutions;
CREATE POLICY wallet_institutions_read ON public.personal_wallet_institutions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
INSERT INTO public.personal_wallet_institutions(institution_key,display_name,primary_color) VALUES
 ('nubank','Nubank','#820AD1'),('mercadopago','Mercado Pago','#1F2229'),
 ('bradesco','Bradesco','#CC092F'),('inter','Inter','#FF7A00'),
 ('picpay','PicPay','#11C76F'),('recargapay','RecargaPay','#6657D9'),
 ('bb','Banco do Brasil','#F9DD16'),('itau','Itaú','#EC7000'),
 ('caixa','Caixa','#1479BD'),('santander','Santander','#EC0000'),
 ('c6','C6 Bank','#242424'),('sicredi','Sicredi','#267B44'),('sicoob','Sicoob','#087A43')
ON CONFLICT(institution_key) DO NOTHING;

-- Relacionamento normalizado e opcional: bancos desconhecidos preservam institution_key,
-- sem quebrar cartões legados ou impedir cadastros de instituições novas.
ALTER TABLE public.personal_wallet_accounts ADD COLUMN IF NOT EXISTS institution_ref text
 REFERENCES public.personal_wallet_institutions(institution_key) ON DELETE SET NULL;
ALTER TABLE public.personal_wallet_cards ADD COLUMN IF NOT EXISTS institution_ref text
 REFERENCES public.personal_wallet_institutions(institution_key) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.wallet_assign_institution_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bank_key text;
BEGIN
 IF TG_TABLE_NAME='personal_wallet_accounts' THEN
  bank_key:=public.personal_wallet_canonical_institution(NEW.bank_name);
 ELSE
  bank_key:=public.personal_wallet_canonical_institution(NEW.issuer);
 END IF;
 IF bank_key IS NULL THEN bank_key:=NEW.institution_key; END IF;
 NEW.institution_ref:=(
  SELECT institution_key FROM public.personal_wallet_institutions WHERE institution_key=bank_key
 );
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS wallet_account_institution_ref ON public.personal_wallet_accounts;
CREATE TRIGGER wallet_account_institution_ref BEFORE INSERT OR UPDATE OF bank_name,institution_key
 ON public.personal_wallet_accounts FOR EACH ROW EXECUTE FUNCTION private.wallet_assign_institution_reference();
DROP TRIGGER IF EXISTS wallet_card_institution_ref ON public.personal_wallet_cards;
CREATE TRIGGER wallet_card_institution_ref BEFORE INSERT OR UPDATE OF issuer,institution_key
 ON public.personal_wallet_cards FOR EACH ROW EXECUTE FUNCTION private.wallet_assign_institution_reference();

-- Cartão já possui account_id UUID NULL ON DELETE SET NULL e instituição canônica.
-- Coluna derivada não pode divergir dos lançamentos financeiros.
ALTER TABLE public.personal_wallet_cards ADD COLUMN IF NOT EXISTS available_limit numeric(14,2)
 GENERATED ALWAYS AS (greatest(0,credit_limit-used_limit)) STORED;
ALTER TABLE public.personal_wallet_cards ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE public.personal_wallet_cards ADD CONSTRAINT wallet_card_primary_color_format
 CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$');
CREATE INDEX IF NOT EXISTS wallet_cards_owner_account_idx ON public.personal_wallet_cards(owner_user_id,account_id);
-- Identidade Nubank: usar o mesmo chave de instituição sem juntar cartões e contas distintos.
UPDATE public.personal_wallet_accounts SET institution_key='nubank'
 WHERE institution_key IN ('nu','nupagamentos') AND institution_key IS DISTINCT FROM 'nubank';
UPDATE public.personal_wallet_cards SET institution_key='nubank'
 WHERE institution_key IN ('nu','nupagamentos') AND institution_key IS DISTINCT FROM 'nubank';

UPDATE public.personal_wallet_accounts a SET institution_ref = a.institution_key
 WHERE EXISTS (SELECT 1 FROM public.personal_wallet_institutions i WHERE i.institution_key=a.institution_key)
 AND a.institution_ref IS DISTINCT FROM a.institution_key;
UPDATE public.personal_wallet_cards c SET institution_ref = c.institution_key
 WHERE EXISTS (SELECT 1 FROM public.personal_wallet_institutions i WHERE i.institution_key=c.institution_key)
 AND c.institution_ref IS DISTINCT FROM c.institution_key;

ALTER TABLE public.personal_wallet_payables
 ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Outros',
 ADD COLUMN IF NOT EXISTS origin_type text,
 ADD COLUMN IF NOT EXISTS origin_account_id uuid REFERENCES public.personal_wallet_accounts(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS origin_card_id uuid REFERENCES public.personal_wallet_cards(id) ON DELETE SET NULL;
ALTER TABLE public.personal_wallet_payables
 ADD CONSTRAINT wallet_payable_origin_valid CHECK (
  (origin_type IS NULL AND origin_account_id IS NULL AND origin_card_id IS NULL)
  OR (origin_type='ACCOUNT' AND origin_account_id IS NOT NULL AND origin_card_id IS NULL)
  OR (origin_type='CARD' AND origin_card_id IS NOT NULL AND origin_account_id IS NULL)
  OR (origin_type='CASH' AND origin_card_id IS NULL AND origin_account_id IS NULL)
 );
ALTER TABLE public.personal_wallet_payable_payments
 ADD COLUMN IF NOT EXISTS card_id uuid REFERENCES public.personal_wallet_cards(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.personal_wallet_expenses(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_payable_request_unique ON public.personal_wallet_payable_payments(owner_user_id,request_id);

-- Receitas recorrentes são projeções até o usuário registrar o recebimento.
CREATE TABLE IF NOT EXISTS public.personal_wallet_recurring_incomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 240),
 category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 receipt_day integer NOT NULL CHECK (receipt_day BETWEEN 1 AND 31),
 destination_account_id uuid NOT NULL REFERENCES public.personal_wallet_accounts(id) ON DELETE RESTRICT,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_income_owner_idx ON public.personal_wallet_recurring_incomes(user_id,active,receipt_day);
ALTER TABLE public.personal_wallet_recurring_incomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_recurring_incomes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.personal_wallet_recurring_incomes TO authenticated;
DROP POLICY IF EXISTS recurring_income_owner_all ON public.personal_wallet_recurring_incomes;
CREATE POLICY recurring_income_owner_all ON public.personal_wallet_recurring_incomes FOR ALL TO authenticated
 USING (user_id=(select auth.uid()) AND (select public.is_platform_super_admin()))
 WITH CHECK (user_id=(select auth.uid()) AND (select public.is_platform_super_admin()));

CREATE OR REPLACE FUNCTION private.wallet_recurring_income_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM auth.uid() OR NOT public.is_platform_super_admin() THEN
  RAISE EXCEPTION 'Receita não autorizada';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.personal_wallet_accounts a
                WHERE a.id=NEW.destination_account_id AND a.owner_user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'Conta de destino não pertence ao usuário';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS wallet_recurring_income_guard ON public.personal_wallet_recurring_incomes;
CREATE TRIGGER wallet_recurring_income_guard BEFORE INSERT OR UPDATE ON public.personal_wallet_recurring_incomes
 FOR EACH ROW EXECUTE FUNCTION private.wallet_recurring_income_guard();

CREATE TABLE IF NOT EXISTS public.personal_wallet_recurring_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 income_id uuid NOT NULL REFERENCES public.personal_wallet_recurring_incomes(id) ON DELETE RESTRICT,
 reference_month date NOT NULL,
 operation_id uuid NOT NULL REFERENCES public.personal_wallet_account_operations(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,income_id,reference_month)
);
ALTER TABLE public.personal_wallet_recurring_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_recurring_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.personal_wallet_recurring_receipts TO authenticated;
DROP POLICY IF EXISTS recurring_receipts_owner_read ON public.personal_wallet_recurring_receipts;
CREATE POLICY recurring_receipts_owner_read ON public.personal_wallet_recurring_receipts FOR SELECT TO authenticated
 USING (user_id=(select auth.uid()) AND (select public.is_platform_super_admin()));

CREATE OR REPLACE FUNCTION public.personal_wallet_post_recurring_income(
 p_income_id uuid,p_month date,p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_income public.personal_wallet_recurring_incomes%rowtype;
 v_existing uuid; v_operation uuid;
BEGIN
 IF v_user IS NULL OR NOT public.is_platform_super_admin() OR p_request_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_month IS NULL OR p_month <> date_trunc('month',p_month)::date
    OR p_month > date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Mês inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||p_income_id::text||p_month::text,86112));
 SELECT operation_id INTO v_existing FROM public.personal_wallet_recurring_receipts
 WHERE user_id=v_user AND income_id=p_income_id AND reference_month=p_month;
 IF FOUND THEN RETURN v_existing; END IF;
 SELECT * INTO v_income FROM public.personal_wallet_recurring_incomes
 WHERE id=p_income_id AND user_id=v_user AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receita inativa ou inexistente'; END IF;
 v_operation:=public.personal_wallet_record_account_operation(
 'INCOME',null,v_income.destination_account_id,v_income.amount,v_income.description,
 v_income.category,current_date,p_request_id);
 INSERT INTO public.personal_wallet_recurring_receipts(user_id,income_id,reference_month,operation_id)
 VALUES (v_user,p_income_id,p_month,v_operation);
 RETURN v_operation;
END;$$;
REVOKE ALL ON FUNCTION public.personal_wallet_post_recurring_income(uuid,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_post_recurring_income(uuid,date,uuid) TO authenticated;

-- Criar conta e cartão em uma única transação, sem expor operações de saldo a clientes.
CREATE OR REPLACE FUNCTION public.personal_wallet_create_linked_assets(
 p_account jsonb,p_card jsonb,p_existing_account_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_account_id uuid:=p_existing_account_id; v_card_id uuid;
 v_name text; v_bank text; v_amount numeric; v_limit numeric;
BEGIN
 IF v_user IS NULL OR NOT public.is_platform_super_admin() THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_account IS NULL AND p_card IS NULL THEN RAISE EXCEPTION 'Informe uma conta ou cartão'; END IF;
 IF p_account IS NOT NULL AND p_existing_account_id IS NOT NULL THEN RAISE EXCEPTION 'Não é permitido criar e vincular outra conta na mesma requisição'; END IF;
 IF p_account IS NOT NULL THEN
  v_name:=btrim(coalesce(p_account->>'nickname',''));
  v_bank:=btrim(coalesce(p_account->>'bank_name',''));
  v_amount:=(p_account->>'balance')::numeric;
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR char_length(v_bank) NOT BETWEEN 1 AND 120
     OR v_amount IS NULL OR v_amount<0 OR round(v_amount,2)<>v_amount THEN RAISE EXCEPTION 'Dados da conta inválidos'; END IF;
  IF coalesce(p_account->>'account_type','CHECKING') NOT IN ('CHECKING','SAVINGS','CASH','INVESTMENT') THEN RAISE EXCEPTION 'Tipo da conta inválido'; END IF;
  IF nullif(p_account->>'pix_key_type','') IS NOT NULL AND coalesce(p_account->>'pix_key_type','') NOT IN ('CPF','EMAIL','PHONE','RANDOM') THEN RAISE EXCEPTION 'Tipo PIX inválido'; END IF;
  IF char_length(coalesce(p_account->>'pix_key',''))>255 THEN RAISE EXCEPTION 'Chave PIX inválida'; END IF;
  INSERT INTO public.personal_wallet_accounts(owner_user_id,nickname,bank_name,account_type,balance,pix_key,pix_key_type,institution_key)
  VALUES(v_user,v_name,v_bank,coalesce(p_account->>'account_type','CHECKING'),v_amount,
         nullif(p_account->>'pix_key',''),nullif(p_account->>'pix_key_type',''),
         coalesce(public.personal_wallet_canonical_institution(v_bank),lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))))
  RETURNING id INTO v_account_id;
 END IF;
 IF p_existing_account_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.personal_wallet_accounts WHERE owner_user_id=v_user AND id=p_existing_account_id
 ) THEN RAISE EXCEPTION 'Conta vinculada não encontrada'; END IF;
 IF p_card IS NOT NULL THEN
  v_name:=btrim(coalesce(p_card->>'nickname',''));
  v_bank:=btrim(coalesce(p_card->>'issuer',''));
  v_limit:=(p_card->>'credit_limit')::numeric;
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR char_length(v_bank) NOT BETWEEN 1 AND 120
     OR v_limit IS NULL OR v_limit<0 OR round(v_limit,2)<>v_limit THEN RAISE EXCEPTION 'Dados do cartão inválidos'; END IF;
  IF nullif(p_card->>'last_four','') IS NOT NULL AND (p_card->>'last_four') !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Final do cartão inválido'; END IF;
  IF nullif(p_card->>'closing_day','') IS NOT NULL AND (p_card->>'closing_day')::integer NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Fechamento inválido'; END IF;
  IF nullif(p_card->>'due_day','') IS NOT NULL AND (p_card->>'due_day')::integer NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Vencimento inválido'; END IF;
  INSERT INTO public.personal_wallet_cards(owner_user_id,nickname,issuer,brand,last_four,credit_limit,closing_day,due_day,account_id,institution_key,primary_color)
  VALUES(v_user,v_name,v_bank,nullif(p_card->>'brand',''),nullif(p_card->>'last_four',''),
         v_limit,nullif(p_card->>'closing_day','')::int,nullif(p_card->>'due_day','')::int,v_account_id,
         coalesce(public.personal_wallet_canonical_institution(v_bank),lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))),nullif(p_card->>'primary_color',''))
  RETURNING id INTO v_card_id;
 END IF;
 RETURN jsonb_build_object('account_id',v_account_id,'card_id',v_card_id);
END;$$;
REVOKE ALL ON FUNCTION public.personal_wallet_create_linked_assets(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_create_linked_assets(jsonb,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.personal_wallet_pay_payable_from_card(
 p_payable_id uuid,p_card_id uuid,p_amount numeric,p_request_id uuid,p_proof_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_payable public.personal_wallet_payables%rowtype;
 v_card public.personal_wallet_cards%rowtype; v_old public.personal_wallet_payable_payments%rowtype;
 v_expense uuid; v_balance numeric;
BEGIN
 IF v_user IS NULL OR NOT public.is_platform_super_admin() OR p_request_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR round(p_amount,2)<>p_amount THEN RAISE EXCEPTION 'Valor inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||p_payable_id::text,51032));
 SELECT * INTO v_old FROM public.personal_wallet_payable_payments WHERE owner_user_id=v_user AND request_id=p_request_id;
 IF FOUND THEN
  IF v_old.payable_id<>p_payable_id OR v_old.card_id IS DISTINCT FROM p_card_id OR v_old.amount<>p_amount
  THEN RAISE EXCEPTION 'Identificador já usado para outro pagamento'; END IF;
  SELECT outstanding_balance INTO v_balance FROM public.personal_wallet_payables WHERE id=p_payable_id AND owner_user_id=v_user;
  RETURN jsonb_build_object('outstanding_balance',v_balance,'idempotent',true);
 END IF;
 SELECT * INTO v_payable FROM public.personal_wallet_payables
 WHERE id=p_payable_id AND owner_user_id=v_user FOR UPDATE;
 IF NOT FOUND OR v_payable.status IN ('PAID','CANCELED') OR p_amount>v_payable.outstanding_balance THEN
  RAISE EXCEPTION 'Dívida indisponível ou valor maior que o saldo'; END IF;
 SELECT * INTO v_card FROM public.personal_wallet_cards WHERE id=p_card_id AND owner_user_id=v_user AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR v_card.credit_limit-v_card.used_limit<p_amount THEN RAISE EXCEPTION 'Cartão indisponível ou limite insuficiente'; END IF;
 v_expense:=public.personal_wallet_create_expense(
  'Dívida: '||v_payable.creditor_name,p_amount,coalesce(v_payable.category,'Contas a pagar'),
  current_date,current_date,null,p_card_id,'PENDING',1,null,'Pagamento da dívida '||p_payable_id::text
 );
 v_balance:=v_payable.outstanding_balance-p_amount;
 UPDATE public.personal_wallet_payables SET outstanding_balance=v_balance,
  status=CASE WHEN v_balance=0 THEN 'PAID' ELSE 'PARTIAL' END,
  paid_at=CASE WHEN v_balance=0 THEN now() ELSE NULL END,updated_at=now()
  WHERE id=p_payable_id AND owner_user_id=v_user;
 INSERT INTO public.personal_wallet_payable_payments(owner_user_id,payable_id,account_id,card_id,expense_id,amount,request_id,proof_path)
 VALUES(v_user,p_payable_id,null,p_card_id,v_expense,p_amount,p_request_id,p_proof_path);
 RETURN jsonb_build_object('outstanding_balance',v_balance,'idempotent',false,'expense_id',v_expense);
END;$$;
REVOKE ALL ON FUNCTION public.personal_wallet_pay_payable_from_card(uuid,uuid,numeric,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_pay_payable_from_card(uuid,uuid,numeric,uuid,text) TO authenticated;

-- Additional optional color support uses the pre-existing nine-argument validated RPC.
CREATE OR REPLACE FUNCTION public.personal_wallet_update_card_metadata(
 p_card_id uuid,p_nickname text,p_issuer text,p_brand text,p_account_id uuid,
 p_limit numeric,p_closing_day integer,p_due_day integer,p_status text,p_primary_color text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_primary_color IS NOT NULL AND p_primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN
  RAISE EXCEPTION 'Cor inválida'; END IF;
 PERFORM public.personal_wallet_update_card_metadata(
  p_card_id,p_nickname,p_issuer,p_brand,p_account_id,p_limit,p_closing_day,p_due_day,p_status
 );
 UPDATE public.personal_wallet_cards SET primary_color=p_primary_color,updated_at=now()
 WHERE id=p_card_id AND owner_user_id=auth.uid();
END;$$;
REVOKE ALL ON FUNCTION public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text,text) TO authenticated;

COMMIT;
