import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const otherUser = '10000000-0000-4000-8000-000000000002';
const profile = '20000000-0000-4000-8000-000000000001';
const source = '30000000-0000-4000-8000-000000000001';
const accountSource = '30000000-0000-4000-8000-000000000002';
const account = '60000000-0000-4000-8000-000000000001';
const cardAccount = '60000000-0000-4000-8000-000000000002';
const card = '40000000-0000-4000-8000-000000000001';
const loan = '50000000-0000-4000-8000-000000000001';
const rows = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[];
const finalize = async () => db.query<{ expense_id: string }>(
  `select public.finalize_card_funded_loan_v1('${loan}') as expense_id`,
);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.is_platform_super_admin() returns boolean language sql stable as
      $$ select auth.uid() = '${user}'::uuid $$;
    create function public.is_wallet_integration_enabled(p_user uuid) returns boolean language sql stable as
      $$ select p_user = '${user}'::uuid $$;
    create table public.perfis(id uuid primary key, user_id uuid);
    create table public.contratos(
      id uuid primary key, owner_id uuid, source_id uuid, principal numeric,
      funding_payment_method text, funding_total_payable numeric,
      funding_installments_count integer, debtor_name text, created_at timestamptz,
      policies_snapshot jsonb, start_date date
    );
    create table public.fontes(id uuid primary key, profile_id uuid, type text,
      balance numeric, archived_at timestamptz);
    create table public.personal_wallet_accounts(
      id uuid primary key, owner_user_id uuid, capital_source_id uuid,
      balance numeric(14,2), updated_at timestamptz default now()
    );
    create table public.personal_wallet_account_operations(
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid, request_id uuid, operation_type text,
      from_account_id uuid, to_account_id uuid, amount numeric(14,2),
      description text, category text, operation_date date,
      contract_id uuid, installment_id uuid, occurred_at timestamptz
    );
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid,
      status text, credit_limit numeric, used_limit numeric, current_bill numeric, updated_at timestamptz default now());
    create table public.personal_wallet_expenses(id uuid primary key, owner_user_id uuid,
      request_id uuid, card_id uuid, description text, amount numeric, installment_count integer,
      due_date date, expense_date date, notes text, status text default 'PENDING', updated_at timestamptz default now());
    create table public.personal_wallet_expense_installments(expense_id uuid,
      installment_number integer, due_month date, amount numeric, status text default 'PENDING', paid_amount numeric default 0);
    create table public.capital_source_wallet_references(source_id uuid,
      owner_user_id uuid, target_kind text, target_id uuid);
    create table public.transacoes(id uuid primary key, loan_id uuid, profile_id uuid,
      source_id uuid, installment_id uuid, date timestamptz, type text, amount numeric,
      principal_delta numeric, interest_delta numeric, late_fee_delta numeric,
      category text, notes text, idempotency_key text,
      reversed_of_transaction_id uuid, meta jsonb, created_at timestamptz default now());
    create table public.parcelas(id uuid primary key, numero_parcela integer);

    create function private.wallet_recalculate_card_position(
      p_owner_id uuid, p_card_id uuid, p_competence_month date
    ) returns jsonb language plpgsql as $$
    declare v_current numeric(14,2); v_total numeric(14,2);
    begin
      select coalesce(sum(i.amount), 0) into v_current
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = p_card_id and e.owner_user_id = p_owner_id and i.due_month = p_competence_month;

      select coalesce(sum(i.amount), 0) into v_total
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = p_card_id and e.owner_user_id = p_owner_id;

      update public.personal_wallet_cards
      set current_bill = v_current, used_limit = v_total, updated_at = now()
      where id = p_card_id and owner_user_id = p_owner_id;
      return jsonb_build_object('current_invoice', v_current, 'committed_limit', v_total);
    end $$;

    create function public.personal_wallet_create_expense(
      p_description text, p_amount numeric, p_category text, p_expense_date date,
      p_due_date date, p_account_id uuid, p_card_id uuid, p_status text,
      p_installment_count integer, p_recurrence text, p_notes text, p_request_id uuid
    ) returns uuid language plpgsql as $$
    declare v_id uuid := gen_random_uuid(); v_base numeric(14,2); v_piece numeric(14,2); v_i integer; v_due_month date;
    begin
      select id into v_id from public.personal_wallet_expenses where request_id=p_request_id;
      if found then return v_id; end if;
      v_id := gen_random_uuid();
      v_due_month := date_trunc('month', coalesce(p_due_date, p_expense_date) + interval '1 month')::date;
      insert into public.personal_wallet_expenses(
        id, owner_user_id, request_id, card_id, description, amount, installment_count, due_date, expense_date, notes
      ) values (
        v_id, auth.uid(), p_request_id, p_card_id, p_description, p_amount, p_installment_count,
        (v_due_month + interval '4 days')::date, p_expense_date, p_notes
      );
      v_base := trunc((round(p_amount,2)*100)/p_installment_count)/100;
      for v_i in 1..p_installment_count loop
        v_piece := case when v_i=p_installment_count
          then round(p_amount,2)-v_base*(p_installment_count-1) else v_base end;
        insert into public.personal_wallet_expense_installments(expense_id, installment_number, due_month, amount)
        values(v_id, v_i, (v_due_month + ((v_i - 1) || ' month')::interval)::date, v_piece);
      end loop;
      perform private.wallet_recalculate_card_position(auth.uid(), p_card_id, v_due_month);
      return v_id;
    end $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261117041652_card_funded_loan_wallet_charge.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261117150000_card_funded_loan_no_account_debit.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261122073000_card_funded_historical_reconciliation.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261125090000_card_funded_loan_uses_start_date.sql', 'utf8'));
  await db.exec(`
    create trigger trg_sync_transacao_to_wallet
      after insert on public.transacoes
      for each row execute function public.trg_sync_transacao_to_wallet();
  `);
});
after(async () => db.close());

beforeEach(async () => {
  await db.exec(`
    truncate public.loan_card_wallet_charges, public.personal_wallet_expense_installments,
      public.personal_wallet_expenses, public.personal_wallet_account_operations,
      public.personal_wallet_accounts, public.transacoes,
      public.capital_source_wallet_references, public.personal_wallet_cards,
      public.fontes, public.contratos, public.perfis, auth.users cascade;
    select set_config('test.user','${user}',false);
    insert into auth.users values('${user}'),('${otherUser}');
    insert into public.perfis values('${profile}','${user}');
    insert into public.fontes values('${source}','${profile}','CARD',1016.21,null);
    insert into public.fontes values('${accountSource}','${profile}','BANK',1000.00,null);
    insert into public.personal_wallet_accounts(id, owner_user_id, capital_source_id, balance)
      values('${cardAccount}','${user}','${source}',1016.21);
    insert into public.personal_wallet_accounts(id, owner_user_id, capital_source_id, balance)
      values('${account}','${user}','${accountSource}',1000.00);
    insert into public.personal_wallet_cards(id, owner_user_id, status, credit_limit, used_limit, current_bill)
      values('${card}','${user}','ACTIVE',1000,0,0);
    insert into public.capital_source_wallet_references values('${source}','${user}','CARD','${card}');
    insert into public.contratos values('${loan}','${profile}','${source}',700,
      'CREDIT_CARD',734.93,10,'Deyse de Andrade Vieira','2026-11-17T04:03:44Z', null);
  `);
});

test('cartao sem debito na conta vinculada, compra a vista 1x e descricao curta', async () => {
  const first = await finalize();
  const second = await finalize();
  assert.equal(first.rows[0].expense_id, second.rows[0].expense_id);

  const state = (await rows(`select
    (select balance::numeric(14,2) from fontes where id='${source}') as source_balance,
    (select balance::numeric(14,2) from personal_wallet_accounts where id='${cardAccount}') as linked_account_balance,
    (select count(*)::integer from personal_wallet_account_operations where contract_id='${loan}') as account_ops,
    (select used_limit::numeric(14,2) from personal_wallet_cards where id='${card}') as used_limit,
    (select current_bill::numeric(14,2) from personal_wallet_cards where id='${card}') as current_bill,
    (select description from personal_wallet_expenses where id='${first.rows[0].expense_id}') as description,
    (select installment_count from personal_wallet_expenses where id='${first.rows[0].expense_id}') as installment_count,
    (select count(*)::integer from personal_wallet_expense_installments where expense_id='${first.rows[0].expense_id}') as installment_rows,
    (select amount::numeric(14,2) from personal_wallet_expense_installments where expense_id='${first.rows[0].expense_id}') as installment_amount,
    (select source_balance_effect from loan_card_wallet_charges where loan_id='${loan}') as source_balance_effect`))[0];

  assert.deepEqual(state, {
    source_balance: '1016.21',
    linked_account_balance: '1016.21',
    account_ops: 0,
    used_limit: '734.93',
    current_bill: '734.93',
    description: 'Empréstimo Deyse',
    installment_count: 1,
    installment_rows: 1,
    installment_amount: '734.93',
    source_balance_effect: 'NONE',
  });
});

test('somente modo explicito gera parcelamento da compra no cartao', async () => {
  await db.exec(`update public.contratos set policies_snapshot = '{"cardPurchaseInstallmentsCount": 4}'::jsonb where id='${loan}'`);
  const res = await finalize();
  const exp = (await rows(`select installment_count, (select count(*)::integer from personal_wallet_expense_installments where expense_id=e.id) as n from personal_wallet_expenses e where id='${res.rows[0].expense_id}'`))[0];
  assert.deepEqual(exp, { installment_count: 4, n: 4 });
});

test('composicao explicita entre conta e cartao debita apenas cada alocacao de forma atomica e idempotente', async () => {
  await db.exec(`update public.contratos set source_id='${accountSource}' where id='${loan}'`);
  const payload = JSON.stringify([
    { source_id: accountSource, amount: 300 },
    { source_id: source, amount: 400 },
  ]);
  await db.query(`select public.finalize_loan_funding_allocations_v1('${loan}', '${payload}'::jsonb)`);
  await db.query(`select public.finalize_loan_funding_allocations_v1('${loan}', '${payload}'::jsonb)`);

  const state = (await rows(`select
    (select balance::numeric(14,2) from fontes where id='${accountSource}') as acc_source_balance,
    (select balance::numeric(14,2) from personal_wallet_accounts where id='${account}') as acc_wallet_balance,
    (select balance::numeric(14,2) from fontes where id='${source}') as card_source_balance,
    (select balance::numeric(14,2) from personal_wallet_accounts where id='${cardAccount}') as card_wallet_balance,
    (select used_limit::numeric(14,2) from personal_wallet_cards where id='${card}') as card_used_limit,
    (select count(*)::integer from transacoes where loan_id='${loan}' and type='LOAN_INITIAL') as initial_txs,
    (select count(*)::integer from personal_wallet_expenses where owner_user_id='${user}') as card_expenses`))[0];

  assert.deepEqual(state, {
    acc_source_balance: '700.00',
    acc_wallet_balance: '700.00',
    card_source_balance: '1016.21',
    card_wallet_balance: '1016.21',
    card_used_limit: '434.93',
    initial_txs: 2,
    card_expenses: 1,
  });
});

test('restaura saldo debitado por emprestimo antigo sem duplicar fatura', async () => {
  await db.exec(`update fontes set balance=316.21 where id='${source}';
    insert into transacoes(id,loan_id,profile_id,source_id,date,type,amount)
      values(gen_random_uuid(),'${loan}','${profile}','${source}',now(),'LOAN_INITIAL',700)`);
  await finalize();
  assert.equal((await rows(`select balance::numeric(14,2) as balance from fontes where id='${source}'`))[0].balance, '1016.21');
  assert.equal((await rows(`select count(*)::integer as n from personal_wallet_expenses where request_id='${loan}'`))[0].n, 1);
  assert.equal((await rows(`select source_balance_effect from loan_card_wallet_charges where loan_id='${loan}'`))[0].source_balance_effect, 'REVERSED');
  assert.equal((await rows(`select count(*)::integer as n from transacoes where loan_id='${loan}' and type='ADJUSTMENT' and reversed_of_transaction_id is not null`))[0].n, 1);
});

test('bloqueia falta de vinculo e limite insuficiente sem movimentar valores', async () => {
  await db.exec('delete from capital_source_wallet_references');
  await assert.rejects(finalize(), /Vincule exatamente um cartão/);
  await db.exec(`insert into capital_source_wallet_references values('${source}','${user}','CARD','${card}');
    update personal_wallet_cards set credit_limit=700 where id='${card}'`);
  await assert.rejects(finalize(), /Limite disponível/);
  assert.equal((await rows(`select balance::numeric(14,2)::text as b from fontes where id='${source}'`))[0].b, '1016.21');
  assert.equal((await rows('select count(*)::integer as n from personal_wallet_expenses'))[0].n, 0);
});

test('impede outro usuario de finalizar o contrato', async () => {
  await db.exec(`select set_config('test.user','${otherUser}',false)`);
  await assert.rejects(finalize(), /Somente o administrador principal/);
});

test('registro histórico já cobrado permite conciliação com limite contábil insuficiente sem debitar novamente a fonte', async () => {
  await db.exec(`
    update personal_wallet_cards set used_limit=800,credit_limit=1000 where id='${card}';
    update contratos set principal=400,funding_total_payable=419.96,
      policies_snapshot=jsonb_build_object(
        'cardPurchaseAlreadyCharged',true,
        'cardPurchaseChargeDate',to_char(current_date-1,'YYYY-MM-DD'),
        'cardPurchaseChargedAmount','419.96',
        'cardPurchaseBankReference','RecargaPay compra 23:28 419.96'
      )
    where id='${loan}';
  `);
  const first=await finalize();
  const retry=await finalize();
  assert.equal(first.rows[0].expense_id,retry.rows[0].expense_id);
  const state=(await rows(`select
    (select balance::numeric(14,2)::text from fontes where id='${source}') source_balance,
    (select balance::numeric(14,2)::text from personal_wallet_accounts where id='${cardAccount}') account_balance,
    (select count(*)::integer from transacoes where loan_id='${loan}' and type='LOAN_INITIAL') count_advance,
    (select meta->>'source_balance_effect' from transacoes where loan_id='${loan}' and type='LOAN_INITIAL') balance_effect,
    (select meta->>'card_purchase_already_charged' from transacoes where loan_id='${loan}' and type='LOAN_INITIAL') bank_charged,
    (select amount::numeric(14,2)::text from personal_wallet_expenses where request_id='${loan}') charge,
    (select expense_date::text from personal_wallet_expenses where request_id='${loan}') card_date,
    (select to_char(current_date-1,'YYYY-MM-DD')) expected_date,
    (select count(*)::integer from loan_card_wallet_charges where loan_id='${loan}') linked
  `))[0];
  assert.deepEqual(state,{
    source_balance:'1016.21',account_balance:'1016.21',
    count_advance:1,balance_effect:'NONE',bank_charged:'true',
    charge:'419.96',card_date:state.expected_date,expected_date:state.expected_date,linked:1,
  });
});

test('marcador histórico sem valor correto é rejeitado sem gerar movimentação',async()=>{
  await db.exec(`update personal_wallet_cards set credit_limit=100,used_limit=100 where id='${card}';
    update contratos set policies_snapshot=jsonb_build_object(
      'cardPurchaseAlreadyCharged',true,
      'cardPurchaseChargeDate',to_char(current_date-1,'YYYY-MM-DD'),
      'cardPurchaseChargedAmount','999.99',
      'cardPurchaseBankReference','RecargaPay 20/11 23:28'
    ) where id='${loan}';`);
  await assert.rejects(finalize(),/Valor da cobrança bancária diferente/);
  assert.equal((await rows('select count(*)::integer n from loan_card_wallet_charges'))[0].n,0);
  assert.equal((await rows('select count(*)::integer n from transacoes'))[0].n,0);
});

test('marcador histórico sem referência ou no futuro não supera bloqueio do banco',async()=>{
  await db.exec(`update personal_wallet_cards set credit_limit=100,used_limit=100 where id='${card}';
    update contratos set policies_snapshot=jsonb_build_object(
      'cardPurchaseAlreadyCharged',true,
      'cardPurchaseChargeDate',to_char(current_date+1,'YYYY-MM-DD'),
      'cardPurchaseChargedAmount','734.93',
      'cardPurchaseBankReference','RecargaPay no futuro'
    ) where id='${loan}';`);
  await assert.rejects(finalize(),/Data da cobrança bancária fora/);
  await db.exec(`update contratos set policies_snapshot = jsonb_set(policies_snapshot,
    '{cardPurchaseChargeDate}',to_jsonb(to_char(current_date-1,'YYYY-MM-DD'))) where id='${loan}';
    update contratos set policies_snapshot = jsonb_set(policies_snapshot,
    '{cardPurchaseBankReference}',to_jsonb('PIX'::text)) where id='${loan}';`);
  await assert.rejects(finalize(),/Informe data, valor e identificação/);
  assert.equal((await rows('select count(*)::integer n from personal_wallet_expenses'))[0].n,0);
});

test('compra no cartão usa a data do empréstimo, não a data de digitação, e nunca uma data futura', async () => {
  await db.query(`update public.contratos set created_at='2026-11-25T03:26:13Z', start_date='2026-11-20' where id='${loan}'`);
  const first = await finalize();
  const date = (await rows(`select expense_date::text as d from personal_wallet_expenses where id='${first.rows[0].expense_id}'`))[0].d;
  assert.equal(date, '2026-11-20');
});

test('empréstimo com data futura gera compra com a data de hoje', async () => {
  await db.query(`update public.contratos set start_date=((now() at time zone 'America/Manaus')::date + 10) where id='${loan}'`);
  const first = await finalize();
  const check = (await rows(`select (expense_date = (now() at time zone 'America/Manaus')::date) as today from personal_wallet_expenses where id='${first.rows[0].expense_id}'`))[0];
  assert.equal(check.today, true);
});
