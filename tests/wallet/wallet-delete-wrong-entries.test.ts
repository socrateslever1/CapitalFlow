import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Dados fictícios. Funções reais da migration.
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const card = '40000000-0000-4000-8000-000000000001';
const account = '60000000-0000-4000-8000-000000000001';
const purchase = '70000000-0000-4000-8000-000000000001';
const paid = '70000000-0000-4000-8000-000000000002';
const MIGRATION = readFileSync('supabase/migrations/20261127120000_wallet_delete_wrong_entries.sql', 'utf8');
const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const op = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const count = async (table: string, where = 'true') => Number((await one<{ n: string }>(`select count(*) n from ${table} where ${where}`)).n);
const balance = async () => Number((await one<{ b: string }>(`select balance b from public.personal_wallet_accounts where id='${account}'`)).b);
const delExpense = (id: string, req: number) => db.query<{ r: Record<string, unknown> }>(`select public.personal_wallet_delete_wrong_expense('${id}','${uuid(req)}') as r`);
const delOp = (id: string, req: number) => db.query<{ r: Record<string, unknown> }>(`select public.personal_wallet_delete_wrong_operation('${id}','${uuid(req)}') as r`);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${user}'), ('${other}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.can_access_personal_wallet() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table public.personal_wallet_accounts(id uuid primary key, owner_user_id uuid, balance numeric(14,2), updated_at timestamptz, archived_at timestamptz);
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid);
    create table public.personal_wallet_expenses(id uuid primary key, owner_user_id uuid, card_id uuid, entry_type text default 'PURCHASE', status text default 'PENDING', mutation_requests jsonb not null default '{}');
    create table public.personal_wallet_expense_installments(id uuid primary key default gen_random_uuid(), expense_id uuid references public.personal_wallet_expenses(id),
      status text default 'PENDING', paid_amount numeric(14,2) default 0);
    create table public.personal_wallet_statement_rows(id uuid primary key default gen_random_uuid(), owner_user_id uuid, expense_id uuid references public.personal_wallet_expenses(id));
    create table public.loan_card_wallet_charges(expense_id uuid references public.personal_wallet_expenses(id));
    create table public.personal_wallet_payable_payments(expense_id uuid references public.personal_wallet_expenses(id));
    create table public.personal_wallet_payable_payment_sources(expense_id uuid references public.personal_wallet_expenses(id));
    create function private.wallet_recalculate_card_position(p_owner uuid, p_card uuid) returns jsonb language sql as $$ select jsonb_build_object('card_id', p_card) $$;
    create table public.personal_wallet_account_operations(id uuid primary key, owner_user_id uuid, operation_type text,
      from_account_id uuid, to_account_id uuid, amount numeric(14,2), category text default 'Outros',
      contract_id uuid, installment_id uuid, charge_id uuid, voided_at timestamptz,
      voids_operation_id uuid references public.personal_wallet_account_operations(id));
    create table public.personal_wallet_manual_operation_revisions(operation_id uuid references public.personal_wallet_account_operations(id));
    create table public.personal_wallet_recurring_receipts(operation_id uuid references public.personal_wallet_account_operations(id));
    create table public.personal_wallet_card_funding_reconciliations(original_wallet_operation_id uuid, reversal_wallet_operation_id uuid);
    create table public.capital_source_wallet_transfers(wallet_operation_id uuid);
    create table public.personal_wallet_pending_operations(owner_user_id uuid, mutation_requests jsonb default '{}');
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`select set_config('test.user', '', false);
    delete from public.personal_wallet_deletion_receipts; delete from public.personal_wallet_pending_operations;
    delete from public.personal_wallet_recurring_receipts; delete from public.personal_wallet_manual_operation_revisions;
    update public.personal_wallet_account_operations set voids_operation_id = null; delete from public.personal_wallet_account_operations;
    delete from public.loan_card_wallet_charges; delete from public.personal_wallet_statement_rows;
    delete from public.personal_wallet_expense_installments; delete from public.personal_wallet_expenses;
    delete from public.personal_wallet_cards; delete from public.personal_wallet_accounts;
    insert into public.personal_wallet_accounts values ('${account}', '${user}', 500, now(), null);
    insert into public.personal_wallet_cards values ('${card}', '${user}');
    insert into public.personal_wallet_expenses(id, owner_user_id, card_id) values ('${purchase}', '${user}', '${card}'), ('${paid}', '${user}', '${card}');
    insert into public.personal_wallet_expense_installments(expense_id) values ('${purchase}'), ('${purchase}');
    insert into public.personal_wallet_expense_installments(expense_id, status, paid_amount) values ('${paid}', 'PAID', 10);
    insert into public.personal_wallet_statement_rows(owner_user_id, expense_id) values ('${user}', '${purchase}');
    select set_config('test.user', '${user}', false);`);
});

test('compra errada some do banco com parcelas e marcação de importação; repetir responde já apagado', async () => {
  const result = (await delExpense(purchase, 1)).rows[0].r;
  assert.equal(result.deleted, true);
  assert.equal(await count('public.personal_wallet_expenses', `id='${purchase}'`), 0);
  assert.equal(await count('public.personal_wallet_expense_installments', `expense_id='${purchase}'`), 0);
  assert.equal(await count('public.personal_wallet_statement_rows'), 0);
  assert.equal((await delExpense(purchase, 1)).rows[0].r.replayed, true);
  await assert.rejects(delExpense(paid, 1), /outro lancamento/);
});

test('compra já cancelada também pode ser apagada; com parcela paga ou vínculo é recusada', async () => {
  await db.exec(`update public.personal_wallet_expenses set status = 'CANCELED' where id = '${purchase}'`);
  await delExpense(purchase, 2);
  assert.equal(await count('public.personal_wallet_expenses', `id='${purchase}'`), 0);
  await assert.rejects(delExpense(paid, 3), /parcela paga/);
  await db.exec(`insert into public.personal_wallet_expenses(id, owner_user_id, card_id) values ('${uuid(50)}', '${user}', '${card}');
    insert into public.loan_card_wallet_charges values ('${uuid(50)}');`);
  await assert.rejects(delExpense(uuid(50), 4), /emprestimo/);
  await db.exec(`select set_config('test.user', '${other}', false)`);
  await assert.rejects(delExpense(paid, 5), /nao encontrado/);
});

test('saída errada na conta: apaga e devolve o saldo; entrada errada: retira do saldo', async () => {
  await db.exec(`update public.personal_wallet_accounts set balance = 400 where id = '${account}';
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, from_account_id, amount)
      values ('${op(1)}', '${user}', 'EXPENSE', '${account}', 100);
    insert into public.personal_wallet_manual_operation_revisions values ('${op(1)}');`);
  await delOp(op(1), 10);
  assert.equal(await balance(), 500);
  assert.equal(await count('public.personal_wallet_account_operations'), 0);
  assert.equal(await count('public.personal_wallet_manual_operation_revisions'), 0);
  await db.exec(`insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount)
      values ('${op(2)}', '${user}', 'INCOME', '${account}', 50);`);
  await delOp(op(2), 11);
  assert.equal(await balance(), 450);
  assert.equal((await delOp(op(2), 11)).rows[0].r.replayed, true);
  assert.equal(await balance(), 450, 'repetir não mexe no saldo de novo');
});

test('par já anulado é apagado inteiro sem mexer no saldo', async () => {
  await db.exec(`insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, from_account_id, amount, voided_at)
      values ('${op(3)}', '${user}', 'EXPENSE', '${account}', 70, now());
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount, category, voided_at, voids_operation_id)
      values ('${op(4)}', '${user}', 'INCOME', '${account}', 70, 'Estorno de lançamento', now(), '${op(3)}');`);
  await delOp(op(4), 12);
  assert.equal(await count('public.personal_wallet_account_operations'), 0);
  assert.equal(await balance(), 500);
});

test('recusa: entrada já gasta, pagamento de fatura, transferência, saldo inicial e vínculos', async () => {
  await db.exec(`insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount)
      values ('${op(5)}', '${user}', 'INCOME', '${account}', 900);`);
  await assert.rejects(delOp(op(5), 20), /Saldo insuficiente/);
  await db.exec(`insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, from_account_id, amount)
      values ('${op(6)}', '${user}', 'PAYMENT', '${account}', 10);
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount, category)
      values ('${op(7)}', '${user}', 'INCOME', '${account}', 10, 'Saldo inicial');
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount)
      values ('${op(8)}', '${user}', 'INCOME', '${account}', 10);
    insert into public.personal_wallet_recurring_receipts values ('${op(8)}');
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount)
      values ('${op(9)}', '${user}', 'INCOME', '${account}', 10);
    insert into public.personal_wallet_pending_operations values ('${user}', jsonb_build_object('x', jsonb_build_object('operation_id', '${op(9)}')));`);
  await assert.rejects(delOp(op(6), 21), /procedimento proprio/);
  await assert.rejects(delOp(op(7), 22), /procedimento proprio/);
  await assert.rejects(delOp(op(8), 23), /receita fixa/);
  await assert.rejects(delOp(op(9), 24), /pendente/);
  assert.equal(await balance(), 500);
});

test('recusa compra gerada por levar o restante ou antecipação com desconto', async () => {
  await db.exec(`update public.personal_wallet_expenses set mutation_requests = jsonb_build_object('r', jsonb_build_object('operation', 'ROLL_INVOICE_REMAINDER')) where id = '${purchase}'`);
  await assert.rejects(delExpense(purchase, 30), /levar o restante/);
  await db.exec(`update public.personal_wallet_expenses set mutation_requests = jsonb_build_object('a', jsonb_build_object('operation', 'ADVANCE_INSTALLMENTS', 'discount', 5)) where id = '${purchase}'`);
  await assert.rejects(delExpense(purchase, 31), /antecipacao/);
  await db.exec(`update public.personal_wallet_expenses set mutation_requests = jsonb_build_object('a', jsonb_build_object('operation', 'ADVANCE_INSTALLMENTS', 'discount', 0)) where id = '${purchase}'`);
  await delExpense(purchase, 32);
  assert.equal(await count('public.personal_wallet_expenses', `id='${purchase}'`), 0);
});

test('recusa estorno de pagamento de fatura, anulado sem par e conta arquivada', async () => {
  await db.exec(`insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, to_account_id, amount, category, voided_at)
      values ('${op(30)}', '${user}', 'INCOME', '${account}', 30, 'Estorno de lançamento', now());
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, from_account_id, amount, voided_at)
      values ('${op(31)}', '${user}', 'EXPENSE', '${account}', 30, now());
    insert into public.personal_wallet_account_operations(id, owner_user_id, operation_type, from_account_id, amount)
      values ('${op(32)}', '${user}', 'EXPENSE', '${account}', 30);`);
  await assert.rejects(delOp(op(30), 33), /procedimento proprio/);
  await assert.rejects(delOp(op(31), 34), /sem compensacao/);
  await db.exec(`update public.personal_wallet_accounts set archived_at = now() where id = '${account}'`);
  await assert.rejects(delOp(op(32), 35), /arquivada/);
  assert.equal(await balance(), 500);
});

test('a migration não altera dados existentes', () => {
  const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /^\s*(update\s|delete\s+from|insert\s+into)/im);
});
