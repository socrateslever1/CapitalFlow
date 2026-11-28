import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Dados fictícios. Funções reais extraídas da migration.
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const account = '60000000-0000-4000-8000-000000000001';
const MIGRATION = readFileSync('supabase/migrations/20261127090000_wallet_pending_account_operations.sql', 'utf8');
const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const balance = async () => Number((await one<{ b: string }>(`select balance as b from public.personal_wallet_accounts where id='${account}'`)).b);
const create = (direction: string, amount: number, request: number) => one<{ id: string }>(
  `select public.personal_wallet_create_pending_operation('${account}','${direction}',${amount},'Recebimento teste','Outros','2026-12-10','${uuid(request)}') as id`);
const post = (id: string, amount: number, request: number, date = '2026-11-20') => one<{ r: Record<string, unknown> }>(
  `select public.personal_wallet_post_pending_operation('${id}',${amount},'${date}','${uuid(request)}') as r`);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create function public.can_access_personal_wallet() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    insert into auth.users values ('${user}'), ('${other}');
    create table public.personal_wallet_accounts(id uuid primary key, owner_user_id uuid, balance numeric(14,2), updated_at timestamptz default now());
    create table public.personal_wallet_account_operations(id uuid primary key default gen_random_uuid(), owner_user_id uuid,
      request_id uuid, operation_type text, from_account_id uuid, to_account_id uuid, amount numeric(14,2), description text,
      category text, operation_date date, unique(owner_user_id, request_id));
    -- Stand-in da anulação manual com o mesmo ponto de inserção da função real.
    create function public.personal_wallet_void_manual_operation(p_operation_id uuid) returns uuid
      language plpgsql as $$
      declare v_user uuid := auth.uid();
      begin
        if false then raise exception 'Lançamento já anulado.'; end if;
        return p_operation_id;
      end $$;
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`select set_config('test.user', '', false);
    delete from public.personal_wallet_pending_operations; delete from public.personal_wallet_account_operations;
    delete from public.personal_wallet_accounts;
    insert into public.personal_wallet_accounts values ('${account}', '${user}', 100);
    select set_config('test.user', '${user}', false);`);
});

test('pendente não mexe no saldo nem no extrato; criar de novo com a mesma chave não duplica', async () => {
  const first = await create('IN', 250, 1);
  const again = await create('IN', 250, 1);
  assert.equal(first.id, again.id);
  assert.equal(await balance(), 100);
  assert.equal(Number((await one<{ n: string }>(`select count(*) n from public.personal_wallet_account_operations`)).n), 0);
  await assert.rejects(create('IN', 300, 1), /reutilizado/);
});

test('efetivar parcial e depois o restante: saldo e extrato batem; repetir não duplica', async () => {
  const { id } = await create('IN', 250, 1);
  const partial = (await post(id, 100, 2)).r;
  assert.equal(partial.status, 'PENDING');
  assert.equal(Number(partial.remaining), 150);
  assert.equal(await balance(), 200);
  const replay = (await post(id, 100, 2)).r;
  assert.equal(replay.replayed, true);
  assert.equal(await balance(), 200, 'repetir não credita de novo');
  await assert.rejects(post(id, 200, 3), /maior que o restante/);
  const rest = (await post(id, 150, 4)).r;
  assert.equal(rest.status, 'POSTED');
  assert.equal(await balance(), 350);
  const ops = (await db.query<{ operation_type: string; amount: string }>(`select operation_type, amount from public.personal_wallet_account_operations order by amount`)).rows;
  assert.deepEqual(ops.map(o => `${o.operation_type}:${Number(o.amount)}`), ['INCOME:100', 'INCOME:150']);
  await assert.rejects(post(id, 1, 5), /nao esta mais pendente/);
});

test('saída pendente: efetivar debita; saldo insuficiente é recusado sem alterar nada', async () => {
  const { id } = await create('OUT', 80, 1);
  await assert.rejects(post(id, 120, 2), /maior que o restante/);
  await post(id, 80, 3);
  assert.equal(await balance(), 20);
  const big = await create('OUT', 50, 4);
  await assert.rejects(post(big.id, 50, 5), /Saldo insuficiente/);
  assert.equal(await balance(), 20);
});

test('cancelar só o restante; efetivado não pode ser cancelado; outro usuário não vê', async () => {
  const { id } = await create('IN', 90, 1);
  await post(id, 40, 2);
  assert.equal((await one<{ s: string }>(`select public.personal_wallet_cancel_pending_operation('${id}') as s`)).s, 'CANCELED');
  assert.equal(await balance(), 140, 'parte efetivada continua');
  await assert.rejects(post(id, 10, 3), /nao esta mais pendente/);
  const done = await create('IN', 10, 4);
  await post(done.id, 10, 5);
  await assert.rejects(db.query(`select public.personal_wallet_cancel_pending_operation('${done.id}')`), /ja efetivado/);
  await db.exec(`select set_config('test.user', '${other}', false)`);
  await assert.rejects(post(id, 1, 6), /nao encontrado/);
  await assert.rejects(db.query(`select public.personal_wallet_create_pending_operation('${account}','IN',1,'x','Outros','2026-12-01','${uuid(7)}')`), /Conta nao encontrada/);
});

test('movimentação criada ao efetivar não pode ser anulada manualmente; as demais podem', async () => {
  const { id } = await create('IN', 40, 1);
  const operation = String((await post(id, 40, 2)).r.operation_id);
  await assert.rejects(db.query(`select public.personal_wallet_void_manual_operation('${operation}')`), /lançamento pendente efetivado/);
  const other = uuid(99);
  assert.equal((await one<{ v: string }>(`select public.personal_wallet_void_manual_operation('${other}') as v`)).v, other);
  // Aplicar a migration de novo não duplica a trava.
  await db.exec(MIGRATION);
  const def = (await one<{ d: string }>(`select pg_get_functiondef('public.personal_wallet_void_manual_operation(uuid)'::regprocedure) as d`)).d;
  assert.equal(def.split('personal_wallet_pending_operations').length - 1, 1);
});

test('mesma chave com categoria diferente é recusada', async () => {
  await create('IN', 10, 1);
  await assert.rejects(db.query(`select public.personal_wallet_create_pending_operation('${account}','IN',10,'Recebimento teste','Lazer','2026-12-10','${uuid(1)}')`), /reutilizado/);
});

test('efetivação com data futura é recusada', async () => {
  const { id } = await create('IN', 10, 1);
  await assert.rejects(post(id, 10, 2, '2099-01-01'), /futuro/);
});

test('a migration não altera dados existentes', () => {
  const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /^\s*(update\s|delete\s+from|insert\s+into)/im);
});
