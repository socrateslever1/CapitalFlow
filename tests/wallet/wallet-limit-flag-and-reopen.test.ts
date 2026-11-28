import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getCardCreditPosition } from '../../components/wallet/invoiceStatementDomain';

const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const card = '40000000-0000-4000-8000-000000000001';
const account = '60000000-0000-4000-8000-000000000001';
const purchase = '70000000-0000-4000-8000-000000000001';
const extra = '70000000-0000-4000-8000-000000000002';
const M = 'supabase/migrations/';
const MIGRATION = readFileSync(M + '20261126180000_wallet_limit_flag_and_reopen_invoice.sql', 'utf8');

const extract = (sql: string, name: string) => {
  const text = sql.replace(/\r\n/g, '\n');
  const start = text.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+${name.replace('.', '\\.')}\\s*\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tag = /\$[a-z_]*\$/i.exec(text.slice(start))!;
  const bodyStart = start + tag.index + tag[0].length;
  return text.slice(start, text.indexOf(tag[0], bodyStart) + tag[0].length) + ';';
};
const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const invoice = async (month: string) => Number((await one<{ v: string }>(
  `select private.wallet_effective_cycle_amount('${user}','${card}','${month}') as v`)).v);
const position = async () => (await one<{ p: Record<string, number> }>(
  `select private.wallet_recalculate_card_position('${user}','${card}','2027-01-01') as p`)).p;

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.can_access_personal_wallet() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table public.personal_wallet_accounts(id uuid primary key, owner_user_id uuid, balance numeric(14,2), updated_at timestamptz default now());
    create table public.personal_wallet_account_operations(id uuid primary key default gen_random_uuid(), owner_user_id uuid,
      request_id uuid, operation_type text, from_account_id uuid, to_account_id uuid, amount numeric(14,2), description text,
      category text, operation_date date, occurred_at timestamptz, voided_at timestamptz, voids_operation_id uuid);
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid, nickname text, status text default 'ACTIVE',
      credit_limit numeric(14,2), used_limit numeric(14,2) default 0, current_bill numeric(14,2) default 0,
      initial_future_installments_balance numeric(14,2) default 0, opening_unallocated_amount numeric(14,2) default 0,
      updated_at timestamptz default now());
    create table public.personal_wallet_expenses(id uuid primary key, owner_user_id uuid, card_id uuid, description text,
      amount numeric(14,2), status text default 'PENDING', entry_type text default 'PURCHASE', invoice_due_month date,
      is_opening_summary boolean default false, is_invoice_credit boolean default false,
      mutation_requests jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
    create table public.personal_wallet_expense_installments(id uuid primary key default gen_random_uuid(), expense_id uuid,
      owner_user_id uuid, installment_number integer, due_month date, amount numeric(14,2), paid_amount numeric(14,2) default 0,
      status text default 'PENDING', opening_invoice_id uuid);
    create table public.personal_wallet_invoice_payments(id uuid primary key default gen_random_uuid(), owner_user_id uuid,
      card_id uuid, due_month date, account_id uuid, amount numeric(14,2), request_id uuid, source text,
      created_at timestamptz default now());
  `);
  const base = readFileSync(M + '20261120001000_wallet_invoice_credits_and_statement_installments.sql', 'utf8');
  await db.exec(extract(base, 'private.wallet_effective_cycle_amount'));
  await db.exec(extract(base, 'public.personal_wallet_pay_invoice_partial'));
  // Só as partes da migration que não dependem do restante do esquema de ciclo.
  const header = MIGRATION.slice(MIGRATION.indexOf('alter table public.personal_wallet_expenses'),
    MIGRATION.indexOf('-- Posição do cartão'));
  await db.exec(header);
  await db.exec(extract(MIGRATION, 'private.wallet_recalculate_card_position'));
  await db.exec(`create function private.wallet_recalculate_card_position(p_owner_id uuid, p_card_id uuid) returns jsonb
    language sql as $$ select private.wallet_recalculate_card_position(p_owner_id, p_card_id, '2027-01-01'::date) $$;`);
  await db.exec(extract(MIGRATION, 'public.personal_wallet_set_expense_affects_limit'));
  await db.exec(extract(MIGRATION, 'public.personal_wallet_reopen_invoice'));
  // pay_invoice_partial original não filtra pagamentos estornados: igual à produção.
  await db.exec(`create or replace function public.is_platform_super_admin() returns boolean language sql stable as $$ select true $$;`);
});

beforeEach(async () => {
  await db.exec(`select set_config('test.user', '', false)`);
  await db.exec(`delete from public.personal_wallet_invoice_payments; delete from public.personal_wallet_account_operations;
    delete from public.personal_wallet_expense_installments; delete from public.personal_wallet_expenses;
    delete from public.personal_wallet_cards; delete from public.personal_wallet_accounts;
    insert into public.personal_wallet_accounts values ('${account}', '${user}', 1000);
    insert into public.personal_wallet_cards(id, owner_user_id, nickname, credit_limit) values ('${card}', '${user}', 'Cartão teste', 5000);
    insert into public.personal_wallet_expenses(id, owner_user_id, card_id, description, amount) values
      ('${purchase}', '${user}', '${card}', 'Compra teste', 300), ('${extra}', '${user}', '${card}', 'Assinatura teste', 50);
    insert into public.personal_wallet_expense_installments(expense_id, owner_user_id, installment_number, due_month, amount) values
      ('${purchase}', '${user}', 1, '2027-01-01', 100), ('${purchase}', '${user}', 2, '2027-02-01', 100),
      ('${purchase}', '${user}', 3, '2027-03-01', 100), ('${extra}', '${user}', 1, '2027-01-01', 50);`);
  await db.exec(`select set_config('test.user', '${user}', false)`);
});

test('fora do limite: continua na fatura, sai do limite comprometido; padrão não muda nada', async () => {
  assert.equal(Number((await position()).committed_limit), 350);
  await db.query(`select public.personal_wallet_set_expense_affects_limit('${extra}', false)`);
  const after = await position();
  assert.equal(Number(after.committed_limit), 300);
  assert.equal(Number(after.current_invoice), 150, 'a fatura continua somando o lançamento');
  assert.equal(await invoice('2027-01-01'), 150);
  await db.query(`select public.personal_wallet_set_expense_affects_limit('${extra}', true)`);
  assert.equal(Number((await position()).committed_limit), 350);
});

test('fora do limite: tela e banco dão o mesmo limite comprometido', async () => {
  await db.query(`select public.personal_wallet_set_expense_affects_limit('${extra}', false)`);
  const expenses = (await db.query(`select *, amount::float as amount from public.personal_wallet_expenses`)).rows as never[];
  const installments = (await db.query(`select *, amount::float as amount, paid_amount::float as paid_amount,
    to_char(due_month,'YYYY-MM-DD') as due_month from public.personal_wallet_expense_installments`)).rows as never[];
  const ts = getCardCreditPosition({ id: card, credit_limit: 5000, initial_future_installments_balance: 0 }, expenses, installments, '2026-12-20');
  assert.equal(ts.committedLimit, Number((await position()).committed_limit));
});

test('reabrir fatura estorna o pagamento para a conta, sem apagar, e volta as parcelas a pendente', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',150,'${uuid(1)}')`);
  assert.equal(await invoice('2027-01-01'), 0);
  const call = `select public.personal_wallet_reopen_invoice('${card}','2027-01-01','${uuid(2)}') as r`;
  const result = (await one<{ r: Record<string, unknown> }>(call)).r;
  assert.equal(Number(result.reversed_amount), 150);
  assert.equal(await invoice('2027-01-01'), 150);
  const balance = await one<{ balance: string }>(`select balance from public.personal_wallet_accounts where id='${account}'`);
  assert.equal(Number(balance.balance), 1000, 'o valor volta para a conta de origem');
  const payments = (await db.query<{ reversed: boolean }>(`select reversed_at is not null as reversed from public.personal_wallet_invoice_payments`)).rows;
  assert.deepEqual(payments.map(p => p.reversed), [true], 'o pagamento fica registrado como estornado');
  const ops = (await db.query<{ operation_type: string; voided: boolean }>(`select operation_type, voided_at is not null as voided
    from public.personal_wallet_account_operations order by operation_type`)).rows;
  assert.deepEqual(ops.map(o => `${o.operation_type}:${o.voided}`), ['INCOME:true', 'PAYMENT:true']);
  // Repetir não estorna de novo.
  assert.equal(((await one<{ r: Record<string, unknown> }>(call)).r).replayed, true);
  assert.equal(Number((await one<{ balance: string }>(`select balance from public.personal_wallet_accounts where id='${account}'`)).balance), 1000);
});

test('reabrir: sem pagamento, restante levado a outra fatura e outro usuário são recusados', async () => {
  await assert.rejects(db.query(`select public.personal_wallet_reopen_invoice('${card}','2027-02-01','${uuid(3)}')`), /nao tem pagamento/);
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',100,'${uuid(4)}')`);
  await db.exec(`update public.personal_wallet_expenses set mutation_requests = jsonb_build_object('${uuid(5)}',
    jsonb_build_object('operation','ROLL_INVOICE_REMAINDER','due_month','2027-01-01')) where id='${extra}'`);
  await assert.rejects(db.query(`select public.personal_wallet_reopen_invoice('${card}','2027-01-01','${uuid(6)}')`), /levado para outra fatura/);
  await db.exec(`select set_config('test.user', '${other}', false)`);
  await assert.rejects(db.query(`select public.personal_wallet_reopen_invoice('${card}','2027-01-01','${uuid(7)}')`), /Cartao nao encontrado/);
});

test('a migration não altera dados existentes', () => {
  const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /\b(update|delete|insert)\b\s/i);
});
