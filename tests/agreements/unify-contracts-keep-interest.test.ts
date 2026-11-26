import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Dados fictícios. Função real da migration.
const db = new PGlite();
const profile = '20000000-0000-4000-8000-000000000001';
const client = '30000000-0000-4000-8000-000000000001';
const otherClient = '30000000-0000-4000-8000-000000000002';
const loanA = '50000000-0000-4000-8000-00000000000a';
const loanB = '50000000-0000-4000-8000-00000000000b';
const instA = '60000000-0000-4000-8000-00000000000a';
const instB = '60000000-0000-4000-8000-00000000000b';
const req = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIGRATION = readFileSync('supabase/migrations/20261127160000_unify_contracts_keep_interest.sql', 'utf8');
const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const unify = (n: number, due = '2099-01-10', ids = `array['${loanA}','${loanB}']::uuid[]`) => db.query<{ r: Record<string, unknown> }>(
  `select public.unify_contracts_keep_interest('${loanA}', ${ids}, '${instA}', 1500, 120, '${due}', '${profile}', '${req(n)}') as r`);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${profile}'::uuid $$;
    create table public.contratos(id uuid primary key, client_id uuid, owner_id uuid, is_archived boolean default false,
      billing_cycle text default 'MONTHLY', interest_rate numeric default 10, fine_percent numeric default 2,
      daily_interest_percent numeric default 0.5, principal numeric, total_to_receive numeric,
      policies_snapshot jsonb default '{}', status text default 'PENDING', acordo_ativo_id uuid, notes text, next_due_date date);
    create table public.parcelas(id uuid primary key, loan_id uuid, scheduled_principal numeric, scheduled_interest numeric,
      principal_remaining numeric, interest_remaining numeric, late_fee_accrued numeric, paid_principal numeric,
      paid_interest numeric, paid_late_fee numeric, paid_total numeric, amount numeric, valor_parcela numeric,
      due_date date, data_vencimento date, status text default 'PENDING');
    create table public.transacoes(id uuid primary key, loan_id uuid, profile_id uuid, date timestamptz, type text,
      category text, amount numeric, principal_delta numeric, interest_delta numeric, late_fee_delta numeric, notes text, meta jsonb);
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`delete from public.transacoes; delete from public.parcelas; delete from public.contratos;
    insert into public.contratos(id, client_id, owner_id, principal) values
      ('${loanA}', '${client}', '${profile}', 1000), ('${loanB}', '${client}', '${profile}', 500);
    insert into public.parcelas(id, loan_id, principal_remaining, interest_remaining, late_fee_accrued, due_date, data_vencimento) values
      ('${instA}', '${loanA}', 1000, 100, 0, '2020-01-10', '2020-01-10'),
      ('${instB}', '${loanB}', 500, 20, 0, '2020-01-10', '2020-01-10');`);
});

test('soma o principal, mantém a taxa e põe os juros em aberto na 1ª parcela sem cobrar o mês duas vezes', async () => {
  const result = (await unify(1)).rows[0].r;
  assert.equal(Number(result.charges), 120);
  const main = await one<{ principal: string; interest_rate: string; fine_percent: string; status: string; frozen: boolean }>(
    `select principal, interest_rate, fine_percent, status, policies_snapshot ? 'normalUnificationFrozen' as frozen from public.contratos where id='${loanA}'`);
  assert.equal(Number(main.principal), 1500);
  assert.equal(Number(main.interest_rate), 10, 'taxa não é zerada');
  assert.equal(Number(main.fine_percent), 2);
  assert.equal(main.frozen, false);
  const inst = await one<{ principal_remaining: string; interest_remaining: string; due: string; status: string }>(
    `select principal_remaining, interest_remaining, to_char(due_date,'YYYY-MM-DD') due, status from public.parcelas where id='${instA}'`);
  assert.equal(Number(inst.principal_remaining), 1500);
  assert.equal(Number(inst.interest_remaining), 120, 'os juros do mês de cada contrato já estão nos 120');
  const next = await one<{ d: string }>(`select to_char(next_due_date,'YYYY-MM-DD') d from public.contratos where id='${loanA}'`);
  assert.equal(next.d, '2099-01-10');
  assert.equal(inst.due, '2099-01-10');
  const other = await one<{ status: string }>(`select status from public.contratos where id='${loanB}'`);
  assert.equal(other.status, 'RENEGOCIADO');
  assert.equal((await one<{ status: string }>(`select status from public.parcelas where id='${instB}'`)).status, 'RENEGOCIADO');
});

test('repetir a mesma requisição não unifica de novo', async () => {
  await unify(2);
  const again = (await unify(2)).rows[0].r;
  assert.equal(again.replayed, true);
  assert.equal(Number((await one<{ n: string }>(`select count(*) n from public.transacoes`)).n), 1);
});

test('recusa vencimento passado, contrato não mensal, outro cliente e acordo ativo', async () => {
  await assert.rejects(unify(3, '2000-01-01'), /passado/);
  await db.exec(`update public.contratos set billing_cycle='DAILY_FREE' where id='${loanA}'`);
  await assert.rejects(unify(4), /mensal/);
  await db.exec(`update public.contratos set billing_cycle='MONTHLY' where id='${loanA}';
    update public.contratos set client_id='${otherClient}' where id='${loanB}'`);
  await assert.rejects(unify(5), /mesmo cliente/);
  await db.exec(`update public.contratos set client_id='${client}', acordo_ativo_id=gen_random_uuid() where id='${loanB}'`);
  await assert.rejects(unify(6), /acordo ativo/);
  await db.exec(`update public.contratos set acordo_ativo_id=null, billing_cycle='DAILY_FREE' where id='${loanB}'`);
  await assert.rejects(unify(7), /mensais/);
  await db.exec(`update public.contratos set billing_cycle='MONTHLY' where id='${loanB}';
    update public.contratos set interest_rate=0 where id='${loanA}'`);
  await assert.rejects(unify(8), /sem taxa/);
  assert.equal(Number((await one<{ p: string }>(`select principal p from public.contratos where id='${loanA}'`)).p), 1000, 'nada mudou');
});

test('a migration não altera dados existentes', () => {
  const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /^\s*(update\s|delete\s+from|insert\s+into)/im);
});
