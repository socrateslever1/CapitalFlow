import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const otherUser = '10000000-0000-4000-8000-000000000002';
const profile = '20000000-0000-4000-8000-000000000001';
const source = '30000000-0000-4000-8000-000000000001';
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
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.is_platform_super_admin() returns boolean language sql stable as
      $$ select auth.uid() = '${user}'::uuid $$;
    create table public.perfis(id uuid primary key, user_id uuid);
    create table public.contratos(
      id uuid primary key, owner_id uuid, source_id uuid, principal numeric,
      funding_payment_method text, funding_total_payable numeric,
      funding_installments_count integer, debtor_name text, created_at timestamptz
    );
    create table public.fontes(id uuid primary key, profile_id uuid, type text,
      balance numeric, archived_at timestamptz);
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid,
      status text, credit_limit numeric, used_limit numeric, current_bill numeric);
    create table public.personal_wallet_expenses(id uuid primary key, owner_user_id uuid,
      request_id uuid, card_id uuid, amount numeric, installment_count integer);
    create table public.personal_wallet_expense_installments(expense_id uuid,
      installment_number integer, amount numeric);
    create table public.capital_source_wallet_references(source_id uuid,
      owner_user_id uuid, target_kind text, target_id uuid);
    create table public.transacoes(id uuid primary key, loan_id uuid, profile_id uuid,
      source_id uuid, date timestamptz, type text, amount numeric,
      principal_delta numeric, interest_delta numeric, late_fee_delta numeric,
      category text, notes text, idempotency_key uuid);

    create function public.personal_wallet_create_expense(
      p_description text, p_amount numeric, p_category text, p_expense_date date,
      p_due_date date, p_account_id uuid, p_card_id uuid, p_status text,
      p_installment_count integer, p_recurrence text, p_notes text, p_request_id uuid
    ) returns uuid language plpgsql as $$
    declare v_id uuid := gen_random_uuid(); v_base numeric(14,2); v_piece numeric(14,2); v_i integer;
    begin
      select id into v_id from public.personal_wallet_expenses where request_id=p_request_id;
      if found then return v_id; end if;
      v_id := gen_random_uuid();
      insert into public.personal_wallet_expenses values
        (v_id, auth.uid(), p_request_id, p_card_id, p_amount, p_installment_count);
      v_base := trunc((round(p_amount,2)*100)/p_installment_count)/100;
      for v_i in 1..p_installment_count loop
        v_piece := case when v_i=p_installment_count
          then round(p_amount,2)-v_base*(p_installment_count-1) else v_base end;
        insert into public.personal_wallet_expense_installments values(v_id,v_i,v_piece);
      end loop;
      update public.personal_wallet_cards set used_limit=used_limit+p_amount,
        current_bill=current_bill+v_base where id=p_card_id;
      return v_id;
    end $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261117041652_card_funded_loan_wallet_charge.sql', 'utf8'));
});
after(async () => db.close());

beforeEach(async () => {
  await db.exec(`
    truncate public.loan_card_wallet_charges, public.personal_wallet_expense_installments,
      public.personal_wallet_expenses, public.transacoes,
      public.capital_source_wallet_references, public.personal_wallet_cards,
      public.fontes, public.contratos, public.perfis, auth.users cascade;
    select set_config('test.user','${user}',false);
    insert into auth.users values('${user}'),('${otherUser}');
    insert into public.perfis values('${profile}','${user}');
    insert into public.fontes values('${source}','${profile}','CARD',1000,null);
    insert into public.personal_wallet_cards values('${card}','${user}','ACTIVE',1000,0,0);
    insert into public.capital_source_wallet_references values('${source}','${user}','CARD','${card}');
    insert into public.contratos values('${loan}','${profile}','${source}',700,
      'CREDIT_CARD',734.93,10,'Deyse','2026-11-17T04:03:44Z');
  `);
});

test('debita o principal uma vez e fatura o total com os centavos exatos', async () => {
  const first = await finalize();
  const second = await finalize();
  assert.equal(first.rows[0].expense_id, second.rows[0].expense_id);
  const state = (await rows(`select
    (select balance::numeric from fontes where id='${source}') as source_balance,
    (select used_limit::numeric from personal_wallet_cards where id='${card}') as used_limit,
    (select count(*)::integer from transacoes where loan_id='${loan}') as advances,
    (select count(*)::integer from personal_wallet_expenses where request_id='${loan}') as expenses,
    (select sum(i.amount)::numeric from personal_wallet_expense_installments i
      join personal_wallet_expenses e on e.id=i.expense_id where e.request_id='${loan}') as installments_total,
    (select amount::numeric from personal_wallet_expense_installments
      where expense_id='${first.rows[0].expense_id}' and installment_number=10) as final_installment`))[0];
  assert.deepEqual(state, {
    source_balance: '300.00', used_limit: '734.93', advances: 1,
    expenses: 1, installments_total: '734.93', final_installment: '73.52',
  });
});

test('reconcilia um emprestimo antigo sem repetir a saida de capital', async () => {
  await db.exec(`update fontes set balance=300 where id='${source}';
    insert into transacoes(id,loan_id,profile_id,source_id,date,type,amount)
      values(gen_random_uuid(),'${loan}','${profile}','${source}',now(),'LOAN_INITIAL',700)`);
  await finalize();
  assert.equal((await rows(`select balance::text from fontes where id='${source}'`))[0].balance, '300');
  assert.equal((await rows(`select count(*)::integer as n from transacoes where loan_id='${loan}'`))[0].n, 1);
});

test('bloqueia falta de vinculo e limite insuficiente sem movimentar valores', async () => {
  await db.exec('delete from capital_source_wallet_references');
  await assert.rejects(finalize(), /Vincule exatamente um cartao/);
  await db.exec(`insert into capital_source_wallet_references values('${source}','${user}','CARD','${card}');
    update personal_wallet_cards set credit_limit=700 where id='${card}'`);
  await assert.rejects(finalize(), /Limite disponivel/);
  assert.equal((await rows(`select balance::text from fontes where id='${source}'`))[0].balance, '1000');
  assert.equal((await rows('select count(*)::integer as n from personal_wallet_expenses'))[0].n, 0);
});

test('impede outro usuario de finalizar o contrato', async () => {
  await db.exec(`select set_config('test.user','${otherUser}',false)`);
  await assert.rejects(finalize(), /Somente o administrador principal/);
});
