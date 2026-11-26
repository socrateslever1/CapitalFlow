import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Integração real em Postgres de memória: carrega as funções de produção dos
// arquivos de migration (sem cópia manual) e exercita as três RPCs atômicas.
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const otherUser = '10000000-0000-4000-8000-000000000002';
const card = '40000000-0000-4000-8000-000000000001';
const account = '60000000-0000-4000-8000-000000000001';
const purchase = '70000000-0000-4000-8000-000000000001';
const MIGRATIONS = 'supabase/migrations/';

/** Extrai uma função completa (até o delimitador do corpo) de um arquivo de migration. */
const extractFunction = (file: string, name: string) => {
  const sql = readFileSync(MIGRATIONS + file, 'utf8').replace(/\r\n/g, '\n');
  const start = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+${name.replace('.', '\\.')}\\s*\\(`, 'i'));
  assert.ok(start >= 0, `${name} não encontrada em ${file}`);
  const tag = /\$[a-z_]*\$/i.exec(sql.slice(start))!;
  const bodyStart = start + tag.index + tag[0].length;
  const end = sql.indexOf(tag[0], bodyStart) + tag[0].length;
  return `${sql.slice(start, end)};`;
};

const as = async (id: string) => db.exec(`select set_config('test.user', '${id}', false)`);
const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fails = async (sql: string, pattern: RegExp) => {
  await assert.rejects(db.query(sql), (error: Error) => pattern.test(error.message));
};
const invoice = async (month: string) => Number((await one<{ v: string }>(
  `select private.wallet_effective_cycle_amount('${user}','${card}','${month}') as v`)).v);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.is_platform_super_admin() returns boolean language sql stable as
      $$ select auth.uid() is not null $$;
    create function public.can_access_personal_wallet() returns boolean language sql stable as
      $$ select auth.uid() is not null $$;
    create table public.personal_wallet_accounts(id uuid primary key, owner_user_id uuid,
      balance numeric(14,2), updated_at timestamptz default now());
    create table public.personal_wallet_account_operations(id uuid primary key default gen_random_uuid(),
      owner_user_id uuid, request_id uuid, operation_type text, from_account_id uuid, to_account_id uuid,
      amount numeric(14,2), description text, category text, operation_date date, occurred_at timestamptz);
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid, nickname text,
      status text default 'ACTIVE', credit_limit numeric(14,2), used_limit numeric(14,2) default 0,
      current_bill numeric(14,2) default 0, closing_day smallint, due_day smallint,
      opening_invoice_month date, opening_invoice_state text,
      initial_future_installments_balance numeric(14,2) default 0,
      opening_unallocated_amount numeric(14,2) default 0, updated_at timestamptz default now());
    create table public.personal_wallet_expenses(id uuid primary key default gen_random_uuid(),
      owner_user_id uuid, request_id uuid, description text, amount numeric(14,2), category text,
      expense_date date, due_date date, account_id uuid, card_id uuid, status text default 'PENDING',
      installment_count integer, recurrence text, notes text, entry_type text not null default 'PURCHASE',
      invoice_due_month date, is_opening_summary boolean not null default false,
      is_invoice_credit boolean not null default false,
      mutation_requests jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
    create table public.personal_wallet_expense_installments(id uuid primary key default gen_random_uuid(),
      expense_id uuid references public.personal_wallet_expenses(id), owner_user_id uuid,
      installment_number integer not null, due_month date not null, amount numeric(14,2) not null check (amount > 0),
      paid_amount numeric(14,2) not null default 0, status text not null default 'PENDING'
        check (status in ('PENDING','PAID','CANCELED')),
      opening_invoice_id uuid, unique (expense_id, installment_number));
    create table public.personal_wallet_invoice_payments(id uuid primary key default gen_random_uuid(),
      owner_user_id uuid, card_id uuid, due_month date, account_id uuid, amount numeric(14,2),
      request_id uuid, source text);
  `);
  for (const [file, name] of [
    ['20261120001000_wallet_invoice_credits_and_statement_installments.sql', 'private.wallet_effective_cycle_amount'],
    ['20261028014452_wallet_fix_generated_available_limit.sql', 'private.wallet_recalculate_card_position'],
    ['20261124120000_wallet_purchase_date_invoice_routing.sql', 'private.wallet_card_due_in_month'],
    ['20261124120000_wallet_purchase_date_invoice_routing.sql', 'private.wallet_card_cycle_due_for_date'],
    ['20261124120000_wallet_purchase_date_invoice_routing.sql', 'private.wallet_card_first_due_date'],
    ['20261027080000_wallet_invoice_cycle_state_and_routing.sql', 'public.personal_wallet_create_expense'],
    ['20261027040100_wallet_expense_request_id_overload.sql', 'public.personal_wallet_create_expense'],
    ['20261120001000_wallet_invoice_credits_and_statement_installments.sql', 'public.personal_wallet_pay_invoice_partial'],
    ['20261120001000_wallet_invoice_credits_and_statement_installments.sql', 'public.personal_wallet_create_invoice_credit'],
  ] as const) await db.exec(extractFunction(file, name));
  // Mesmo atalho de produção: posição pela competência de hoje.
  await db.exec(`create function private.wallet_recalculate_card_position(p_owner_id uuid, p_card_id uuid)
    returns jsonb language sql as $$ select private.wallet_recalculate_card_position(p_owner_id, p_card_id, date_trunc('month', current_date)::date) $$;`);
  const migration = readFileSync(MIGRATIONS + '20261126120000_wallet_atomic_card_operations.sql', 'utf8');
  await db.exec(migration.replace(/^\s*notify pgrst[^\n]*\n/m, ''));
});

beforeEach(async () => {
  await as('');
  await db.exec(`
    truncate public.personal_wallet_invoice_payments, public.personal_wallet_account_operations;
    delete from public.personal_wallet_expense_installments; delete from public.personal_wallet_expenses;
    delete from public.personal_wallet_cards; delete from public.personal_wallet_accounts;
    insert into public.personal_wallet_accounts values ('${account}', '${user}', 5000);
    -- Cartão fictício: fecha dia 24, vence dia 5, limite 10.000.
    insert into public.personal_wallet_cards(id, owner_user_id, nickname, credit_limit, closing_day, due_day)
      values ('${card}', '${user}', 'Cartão teste', 10000, 24, 5);
    -- Compra fictícia de 1.000 em 10x de 100, parcelas 1..10 de jan a out/2027.
    insert into public.personal_wallet_expenses(id, owner_user_id, description, amount, category,
      expense_date, due_date, card_id, installment_count)
      values ('${purchase}', '${user}', 'Compra teste', 1000, 'Compras', '2026-12-10', '2027-01-01', '${card}', 10);
    insert into public.personal_wallet_expense_installments(expense_id, owner_user_id, installment_number, due_month, amount)
      select '${purchase}', '${user}', n, ('2027-01-01'::date + make_interval(months => n - 1))::date, 100
      from generate_series(1, 10) n;
  `);
  await as(user);
});

test('restante da fatura vai para a próxima numa só transação e repetir não duplica', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',40,'${uuid(1)}')`);
  assert.equal(await invoice('2027-01-01'), 60);
  const call = `select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-02-01',60,1,60,'${uuid(2)}') as r`;
  const first = (await one<{ r: Record<string, unknown> }>(call)).r;
  assert.equal(first.replayed, false);
  assert.equal(await invoice('2027-01-01'), 0);
  assert.equal(await invoice('2027-02-01'), 160, 'parcela de fevereiro (100) + restante (60)');
  const again = (await one<{ r: Record<string, unknown> }>(call)).r;
  assert.equal(again.replayed, true);
  assert.equal(again.expense_id, first.expense_id);
  assert.equal(await invoice('2027-02-01'), 160, 'repetição não lança de novo');
  const account_ = await one<{ balance: string }>(`select balance from public.personal_wallet_accounts where id='${account}'`);
  assert.equal(Number(account_.balance), 4960, 'só o pagamento real sai da conta');
});

test('parcelar o restante cria o plano na categoria certa', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',40,'${uuid(3)}')`);
  await db.query(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','INSTALLMENT_PLAN','2027-02-01',60,3,66,'${uuid(4)}')`);
  const plan = await one<{ category: string; amount: string; n: string }>(`select e.category, e.amount,
    (select count(*) from public.personal_wallet_expense_installments i where i.expense_id = e.id) as n
    from public.personal_wallet_expenses e where e.request_id = '${uuid(4)}'`);
  assert.equal(plan.category, 'Parcelamento de fatura');
  assert.equal(Number(plan.amount), 66);
  assert.equal(Number(plan.n), 3);
  assert.equal(await invoice('2027-01-01'), 0);
});

test('restante: falha no meio não deixa nada pela metade', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',40,'${uuid(5)}')`);
  // Saldo informado diferente do real: nada pode mudar.
  await fails(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-02-01',59,1,59,'${uuid(6)}')`, /saldo da fatura mudou/);
  // Plano menor que o restante: recusado antes de quitar.
  await fails(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','INSTALLMENT_PLAN','2027-02-01',60,3,50,'${uuid(7)}')`, /nao pode ser menor/);
  // Destino inválido.
  await fails(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-01-01',60,1,60,'${uuid(8)}')`, /posterior/);
  assert.equal(await invoice('2027-01-01'), 60, 'o restante continua na fatura atual');
  assert.equal(await invoice('2027-02-01'), 100);
  const payments = await rows(`select 1 from public.personal_wallet_invoice_payments`);
  assert.equal(payments.length, 1, 'nenhuma quitação parcial ficou gravada');
});

test('restante: outro usuário não mexe no cartão', async () => {
  await as(otherUser);
  await fails(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-02-01',100,1,100,'${uuid(9)}')`, /Cartao ativo nao encontrado/);
});

test('antecipação move as próximas parcelas, preserva a numeração e registra o desconto', async () => {
  const call = `select public.personal_wallet_advance_installments('${purchase}','2027-01-01',3,15,'${uuid(10)}') as r`;
  const first = (await one<{ r: Record<string, unknown> }>(call)).r;
  assert.equal(first.advanced_count, 3);
  const months = await rows<{ installment_number: number; due_month: string }>(`select installment_number,
    to_char(due_month,'YYYY-MM') as due_month from public.personal_wallet_expense_installments
    where expense_id='${purchase}' order by installment_number`);
  assert.deepEqual(months.map(r => r.due_month), ['2027-01', '2027-01', '2027-01', '2027-01',
    '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10']);
  assert.deepEqual(months.map(r => r.installment_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(await invoice('2027-01-01'), 385, '4 parcelas (400) menos desconto (15)');
  assert.equal(await invoice('2027-02-01'), 0);
  const status = await one<{ status: string; amount: string }>(`select status, amount from public.personal_wallet_expenses where id='${purchase}'`);
  assert.equal(status.status, 'PENDING', 'a compra não é cancelada nem recriada');
  assert.equal(Number(status.amount), 1000);
  const again = (await one<{ r: Record<string, unknown> }>(call)).r;
  assert.equal(again.replayed, true);
  assert.equal(await invoice('2027-01-01'), 385, 'repetição não move nem desconta de novo');
});

test('antecipação: recusa desconto inválido, quantidade maior e reuso da chave com outros dados', async () => {
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',2,200,'${uuid(11)}')`, /desconto precisa ser menor/);
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',12,0,'${uuid(12)}')`, /apenas 9 parcelas/);
  await db.query(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',1,0,'${uuid(13)}')`);
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',2,0,'${uuid(13)}')`, /reutilizada/);
  assert.equal(await invoice('2027-01-01'), 200, 'só a primeira antecipação valeu');
});

test('antecipação não reabre fatura já paga', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',100,'${uuid(14)}')`);
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',1,0,'${uuid(15)}')`, /ja foi paga/);
});

test('excluir só a parcela atual mantém as outras e a numeração', async () => {
  const target = await one<{ id: string }>(`select id from public.personal_wallet_expense_installments where expense_id='${purchase}' and installment_number=3`);
  const call = `select public.personal_wallet_cancel_installments('${purchase}','${target.id}','ONLY_CURRENT','${uuid(16)}') as r`;
  await db.query(call);
  const state = await rows<{ installment_number: number; status: string }>(`select installment_number, status
    from public.personal_wallet_expense_installments where expense_id='${purchase}' order by installment_number`);
  assert.deepEqual(state.filter(r => r.status === 'CANCELED').map(r => r.installment_number), [3]);
  const expense = await one<{ amount: string; status: string }>(`select amount, status from public.personal_wallet_expenses where id='${purchase}'`);
  assert.equal(Number(expense.amount), 900);
  assert.equal(expense.status, 'PENDING');
  assert.equal(await invoice('2027-03-01'), 0);
  assert.equal(await invoice('2027-04-01'), 100);
  assert.equal(((await one<{ r: Record<string, unknown> }>(call)).r).replayed, true);
});

test('excluir a atual e as seguintes preserva as anteriores, inclusive pagas', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',100,'${uuid(17)}')`);
  const target = await one<{ id: string }>(`select id from public.personal_wallet_expense_installments where expense_id='${purchase}' and installment_number=4`);
  await db.query(`select public.personal_wallet_cancel_installments('${purchase}','${target.id}','CURRENT_AND_NEXT','${uuid(18)}')`);
  const active = await rows<{ installment_number: number; status: string }>(`select installment_number, status
    from public.personal_wallet_expense_installments where expense_id='${purchase}' and status <> 'CANCELED' order by 1`);
  assert.deepEqual(active.map(r => `${r.installment_number}:${r.status}`), ['1:PAID', '2:PENDING', '3:PENDING']);
  const expense = await one<{ amount: string }>(`select amount from public.personal_wallet_expenses where id='${purchase}'`);
  assert.equal(Number(expense.amount), 300);
  // A parcela paga não pode ser excluída.
  const paid = await one<{ id: string }>(`select id from public.personal_wallet_expense_installments where expense_id='${purchase}' and installment_number=1`);
  await fails(`select public.personal_wallet_cancel_installments('${purchase}','${paid.id}','ONLY_CURRENT','${uuid(19)}')`, /parcela paga/);
});

test('restante: repetir a chave com outros dados é recusado; com crédito na fatura o valor bate', async () => {
  await db.query(`select public.personal_wallet_create_invoice_credit('${card}','2027-01-01',30,'Estorno teste',null,null,'${uuid(20)}')`);
  assert.equal(await invoice('2027-01-01'), 70, 'parcela 100 menos crédito 30');
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',20,'${uuid(21)}')`);
  assert.equal(await invoice('2027-01-01'), 50);
  await db.query(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-02-01',50,1,50,'${uuid(22)}')`);
  assert.equal(await invoice('2027-01-01'), 0);
  assert.equal(await invoice('2027-02-01'), 150);
  await fails(`select public.personal_wallet_roll_invoice_remainder('${card}','2027-01-01','ROLL_TO_NEXT','2027-03-01',50,1,50,'${uuid(22)}')`, /reutilizada/);
});

test('antecipação recusa fatura passada e fatura consolidada por valor fechado', async () => {
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2020-01-01',1,0,'${uuid(23)}')`, /fatura passada/);
  await db.query(`insert into public.personal_wallet_expenses(owner_user_id, description, amount, card_id,
    installment_count, entry_type, invoice_due_month) values ('${user}', 'Fatura consolidada', 500, '${card}', 1,
    'INVOICE_OVERRIDE', '2027-01-01')`);
  await fails(`select public.personal_wallet_advance_installments('${purchase}','2027-01-01',1,0,'${uuid(24)}')`, /consolidada/);
  assert.equal(await invoice('2027-02-01'), 100, 'nada foi movido');
});

test('antecipação funciona com parcela anterior já paga', async () => {
  await db.query(`select public.personal_wallet_pay_invoice_partial('${card}','2027-01-01','${account}',100,'${uuid(25)}')`);
  await db.query(`select public.personal_wallet_advance_installments('${purchase}','2027-02-01',2,0,'${uuid(26)}')`);
  assert.equal(await invoice('2027-02-01'), 300);
  assert.equal(await invoice('2027-03-01'), 0);
});

test('a migration só cria funções e define permissões', () => {
  const sql = readFileSync(MIGRATIONS + '20261126120000_wallet_atomic_card_operations.sql', 'utf8');
  const outside = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /\b(update|delete|insert|truncate|alter table|drop)\b/i);
  for (const fn of ['personal_wallet_roll_invoice_remainder', 'personal_wallet_advance_installments', 'personal_wallet_cancel_installments']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
  }
});

test('a tela não compõe operações financeiras com chamadas encadeadas', () => {
  const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const handler = (name: string) => {
    const start = page.indexOf(`const ${name} = async`);
    assert.ok(start >= 0, name);
    const end = page.indexOf('\n  };', start);
    return page.slice(start, end);
  };
  const remainder = handler('handleInvoiceRemainder');
  assert.match(remainder, /personalWalletService\.rollInvoiceRemainder\(/);
  assert.doesNotMatch(remainder, /payInvoicePartial|createExpense/);
  const advance = handler('handleAdvanceInstallments');
  assert.match(advance, /personalWalletService\.advanceInstallments\(/);
  assert.doesNotMatch(advance, /cancelExpense|createExpense/);
  const scoped = handler('handleScopedInstallmentDelete');
  assert.match(scoped, /personalWalletService\.cancelInstallments\(/);
  assert.doesNotMatch(scoped, /createExpense/);
  // request_id composto com sufixo deixa de existir (não é um uuid válido).
  assert.doesNotMatch(page, /:roll-clear|:plan-clear/);
});
