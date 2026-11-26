import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  getPurchaseInvoiceMonth,
  isBrazilBusinessDay,
  nextBrazilBusinessDay,
  resolveCardCycleDates,
  type CardCycleSource,
} from '../../components/wallet/invoiceStatementDomain';

// Mesmos casos rodados no banco (migration real em Postgres de memória) e na tela.
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const card = '40000000-0000-4000-8000-000000000001';
const MIGRATION = readFileSync('supabase/migrations/20261126160000_wallet_card_cycle_rules.sql', 'utf8');

type Rules = { mode: 'FIXED_DAY' | 'DAYS_BEFORE_DUE'; closing: number | null; before: number | null; due: number; business: boolean };
const setRules = async (rules: Rules) => {
  await db.exec(`update public.personal_wallet_cards set closing_mode='${rules.mode}', closing_day=${rules.closing ?? 'null'},
    closing_days_before_due=${rules.before ?? 'null'}, due_day=${rules.due}, due_business_days=${rules.business}
    where id='${card}'`);
  // A configuração por mês é testada à parte: aqui só a regra atual vale para todos os meses.
  await db.exec(`delete from public.personal_wallet_card_cycle_settings`);
};
const sqlDates = async (month: string) => (await db.query<{ closing_date: string; due_date: string }>(
  `select to_char(d.closing_date,'YYYY-MM-DD') as closing_date, to_char(d.due_date,'YYYY-MM-DD') as due_date
   from public.personal_wallet_cards c, private.wallet_card_cycle_dates(c, '${month}') d where c.id='${card}'`)).rows[0];
const sqlMonthFor = async (day: string) => (await db.query<{ m: string }>(
  `select to_char(private.wallet_card_cycle_month_for_date(c, '${day}'),'YYYY-MM-DD') as m
   from public.personal_wallet_cards c where c.id='${card}'`)).rows[0].m;
const tsCard = (rules: Rules, extra: Partial<CardCycleSource> = {}): CardCycleSource => ({
  id: card, closing_day: rules.closing, due_day: rules.due, closing_mode: rules.mode,
  closing_days_before_due: rules.before, due_business_days: rules.business, ...extra,
});

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.is_platform_super_admin() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create function public.can_access_personal_wallet() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    insert into auth.users values ('${user}');
    create table public.personal_wallet_cards(id uuid primary key, owner_user_id uuid, status text default 'ACTIVE',
      closing_day smallint, due_day smallint, opening_invoice_month date, opening_invoice_state text,
      updated_at timestamptz default now());
    create table public.personal_wallet_card_invoice_facts(id uuid primary key default gen_random_uuid(),
      owner_user_id uuid, card_id uuid, due_month date, due_date date, source_type text default 'PDF',
      updated_at timestamptz default now(), unique (owner_user_id, card_id, due_month));
    create table public.personal_wallet_expenses(id uuid primary key, owner_user_id uuid, card_id uuid, status text,
      invoice_due_month date);
    create table public.personal_wallet_expense_installments(expense_id uuid, status text, paid_amount numeric, due_month date);
    create table public.personal_wallet_invoice_payments(card_id uuid, owner_user_id uuid, due_month date);
  `);
  for (const name of ['private.wallet_card_due_in_month']) {
    const source = readFileSync('supabase/migrations/20261124120000_wallet_purchase_date_invoice_routing.sql', 'utf8');
    const start = source.search(new RegExp(`create or replace function ${name.replace('.', '\\.')}\\s*\\(`, 'i'));
    const end = source.indexOf('$$;', source.indexOf('AS $$', start) + 5) + 3;
    await db.exec(source.slice(start, end));
  }
  await db.exec(MIGRATION.replace(/^\s*notify pgrst[^\n]*\n/m, '').replace(/^\s*create policy[\s\S]*?;\n/m, ''));
  await db.exec(`insert into public.personal_wallet_cards(id, owner_user_id, closing_day, due_day) values ('${card}', '${user}', 24, 5)`);
});

test('feriados e dia útil iguais no banco e na tela', async () => {
  const days = ['2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27', '2027-04-21',
    '2026-11-20', '2026-12-05', '2026-12-06', '2026-12-07', '2026-11-26'];
  for (const day of days) {
    const sql = (await db.query<{ b: boolean; n: string }>(
      `select private.br_is_business_day('${day}') as b, to_char(private.br_next_business_day('${day}'),'YYYY-MM-DD') as n`)).rows[0];
    assert.equal(isBrazilBusinessDay(day), sql.b, `dia útil ${day}`);
    assert.equal(nextBrazilBusinessDay(day), sql.n, `próximo dia útil ${day}`);
  }
  assert.equal(isBrazilBusinessDay('2027-02-08'), false, 'segunda de Carnaval 2027');
  assert.equal(isBrazilBusinessDay('2027-03-26'), false, 'Sexta-feira Santa 2027');
  assert.equal(isBrazilBusinessDay('2027-05-27'), false, 'Corpus Christi 2027');
});

const RULES: Rules[] = [
  { mode: 'FIXED_DAY', closing: 24, before: null, due: 5, business: false },
  { mode: 'FIXED_DAY', closing: 3, before: null, due: 10, business: false },
  { mode: 'FIXED_DAY', closing: 31, before: null, due: 7, business: true },
  { mode: 'DAYS_BEFORE_DUE', closing: null, before: 10, due: 5, business: false },
  { mode: 'DAYS_BEFORE_DUE', closing: 24, before: 7, due: 1, business: true },
  { mode: 'DAYS_BEFORE_DUE', closing: null, before: 8, due: 31, business: true },
];
const MONTHS = ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01', '2027-08-01'];
const DAYS = ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-12-26', '2027-01-31', '2027-02-27', '2027-05-20'];

test('fechamento, vencimento e ciclo da compra iguais no banco e na tela', async () => {
  for (const rules of RULES) {
    await setRules(rules);
    for (const month of MONTHS) {
      assert.deepEqual(resolveCardCycleDates(tsCard(rules), month),
        { closingDate: (await sqlDates(month)).closing_date, dueDate: (await sqlDates(month)).due_date },
        `${JSON.stringify(rules)} ${month}`);
    }
    for (const day of DAYS) {
      assert.equal(getPurchaseInvoiceMonth(day, rules.closing, rules.due, tsCard(rules)), await sqlMonthFor(day),
        `${JSON.stringify(rules)} compra ${day}`);
    }
  }
});

test('regra padrão (dia fixo, sem dia útil) dá o mesmo resultado de antes', async () => {
  await setRules(RULES[0]);
  assert.deepEqual(await sqlDates('2026-12-01'), { closing_date: '2026-11-24', due_date: '2026-12-05' });
  assert.equal(await sqlMonthFor('2026-11-23'), '2026-12-01');
  assert.equal(await sqlMonthFor('2026-11-24'), '2027-01-01', 'fechamento exclusivo');
});

test('fechamento dinâmico: 10 dias antes do vencimento, compra no dia do fechamento vai para a seguinte', async () => {
  const rules = RULES[3];
  await setRules(rules);
  assert.deepEqual(await sqlDates('2026-12-01'), { closing_date: '2026-11-25', due_date: '2026-12-05' });
  assert.equal(await sqlMonthFor('2026-11-24'), '2026-12-01');
  assert.equal(await sqlMonthFor('2026-11-25'), '2027-01-01');
});

test('fechamento informado para um mês vale só para ele', async () => {
  const rules = RULES[0];
  await setRules(rules);
  await db.exec(`insert into public.personal_wallet_card_invoice_facts(owner_user_id, card_id, due_month, closing_date)
    values ('${user}', '${card}', '2027-01-01', '2026-12-22')`);
  assert.deepEqual(await sqlDates('2027-01-01'), { closing_date: '2026-12-22', due_date: '2027-01-05' });
  assert.deepEqual(await sqlDates('2027-02-01'), { closing_date: '2027-01-24', due_date: '2027-02-05' });
  assert.equal(await sqlMonthFor('2026-12-22'), '2027-02-01');
  const withFact = tsCard(rules, { invoice_closing_dates: { '2027-01-01': '2026-12-22' } });
  assert.equal(resolveCardCycleDates(withFact, '2027-01-01').closingDate, '2026-12-22');
  assert.equal(getPurchaseInvoiceMonth('2026-12-22', 24, 5, withFact), '2027-02-01');
  await db.exec(`delete from public.personal_wallet_card_invoice_facts`);
});

test('mudança no cartão vale do mês da edição em diante', async () => {
  await setRules(RULES[0]);
  await db.exec(`insert into public.personal_wallet_card_cycle_settings(owner_user_id, card_id, effective_month,
    closing_mode, closing_day, due_day, due_business_days) values
    ('${user}', '${card}', '2000-01-01', 'FIXED_DAY', 25, 5, false),
    ('${user}', '${card}', '2027-03-01', 'FIXED_DAY', 20, 5, false)`);
  assert.equal((await sqlDates('2027-02-01')).closing_date, '2027-01-25', 'antes da edição: regra antiga');
  assert.equal((await sqlDates('2027-03-01')).closing_date, '2027-02-20', 'a partir da edição: regra nova');
  const history = tsCard(RULES[0], { cycle_settings: [
    { card_id: card, effective_month: '2000-01-01', closing_mode: 'FIXED_DAY', closing_day: 25, closing_days_before_due: null, due_day: 5, due_business_days: false },
    { card_id: card, effective_month: '2027-03-01', closing_mode: 'FIXED_DAY', closing_day: 20, closing_days_before_due: null, due_day: 5, due_business_days: false },
  ] });
  assert.equal(resolveCardCycleDates(history, '2027-02-01').closingDate, '2027-01-25');
  assert.equal(resolveCardCycleDates(history, '2027-03-01').closingDate, '2027-02-20');
});

test('o gatilho grava histórico só quando a regra muda', async () => {
  await db.exec(`delete from public.personal_wallet_card_cycle_settings`);
  await db.exec(`update public.personal_wallet_cards set closing_day = closing_day where id='${card}'`);
  assert.equal((await db.query(`select 1 from public.personal_wallet_card_cycle_settings`)).rows.length, 0);
  await db.exec(`update public.personal_wallet_cards set closing_day = 21 where id='${card}'`);
  const rows = (await db.query<{ closing_day: number }>(`select closing_day from public.personal_wallet_card_cycle_settings`)).rows;
  assert.deepEqual(rows.map(row => row.closing_day), [21]);
});

test('a migration não altera lançamentos, parcelas, pagamentos nem saldos', () => {
  const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /\b(update|delete)\b\s+(from\s+)?public\.personal_wallet_(expenses|expense_installments|invoice_payments|accounts)/i);
  assert.match(outside, /insert into public\.personal_wallet_card_cycle_settings/);
});

test('cartão sem dia de fechamento ou vencimento mantém o ciclo pelo mês civil', async () => {
  await db.exec(`update public.personal_wallet_cards set closing_mode='FIXED_DAY', closing_day=null, due_day=5,
    closing_days_before_due=null, due_business_days=false where id='${card}'`);
  assert.equal(await sqlMonthFor('2026-11-26'), '2026-11-01');
  assert.equal(getPurchaseInvoiceMonth('2026-11-26', null, 5, tsCard({ mode: 'FIXED_DAY', closing: null, before: null, due: 5, business: false })), '2026-11-01');
  await db.exec(`update public.personal_wallet_cards set closing_day=24 where id='${card}'`);
});

test('o histórico novo começa na fatura aberta pela regra anterior', async () => {
  await db.exec(`update public.personal_wallet_cards set closing_mode='FIXED_DAY', closing_day=24, due_day=5,
    closing_days_before_due=null, due_business_days=false where id='${card}'`);
  await db.exec(`delete from public.personal_wallet_card_cycle_settings`);
  const open = await sqlMonthFor(new Date().toISOString().slice(0, 10));
  await db.exec(`update public.personal_wallet_cards set closing_day = 20 where id='${card}'`);
  const row = (await db.query<{ m: string }>(`select to_char(effective_month,'YYYY-MM-DD') as m from public.personal_wallet_card_cycle_settings`)).rows;
  assert.deepEqual(row.map(r => r.m), [open]);
});
