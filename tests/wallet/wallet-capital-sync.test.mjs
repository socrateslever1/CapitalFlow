import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const profile = '20000000-0000-4000-8000-000000000001';
const source = '30000000-0000-4000-8000-000000000001';
const account = '40000000-0000-4000-8000-000000000001';
const tx = '50000000-0000-4000-8000-000000000001';
const migration = readFileSync('supabase/migrations/20261029205428_wallet_capital_balance_sync.sql', 'utf8');
const query = async sql => (await db.query(sql)).rows;
const balances = () => query(`select a.balance::float8 as wallet, f.balance::float8 as capital
  from public.personal_wallet_accounts a join public.fontes f on f.id=a.capital_source_id where a.id='${account}'`);
const operations = () => query('select operation_type, amount::float8 as amount, from_account_id, to_account_id, source_transaction_id from personal_wallet_account_operations order by created_at, id');

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table perfis(id uuid primary key,user_id uuid,created_at timestamptz default now());
    create table platform_admins(user_id uuid,role text);
    create table user_modulos(user_id uuid,modulo_chave text,ativo boolean);
    create function is_platform_super_admin() returns boolean language sql stable as $$
      select exists(select 1 from platform_admins where user_id=auth.uid() and role='SUPER_ADMIN')$$;
    create table fontes(id uuid primary key default gen_random_uuid(),profile_id uuid,name text,type text,balance numeric(14,2),archived_at timestamptz,created_at timestamptz default now());
    create table contratos(id uuid primary key,debtor_name text);
    create table parcelas(id uuid primary key,numero_parcela int);
    create table personal_wallet_accounts(id uuid primary key,owner_user_id uuid,nickname text,account_type text,balance numeric(14,2),archived_at timestamptz,updated_at timestamptz);
    create table personal_wallet_account_operations(id uuid primary key default gen_random_uuid(),owner_user_id uuid,request_id uuid,operation_type text,from_account_id uuid,to_account_id uuid,amount numeric(14,2) check(amount>0),description text,category text,operation_date date,created_at timestamptz default now(),unique(owner_user_id,request_id));
    create table transacoes(id uuid primary key,profile_id uuid,source_id uuid,type text,amount numeric(14,2),date timestamptz default now(),loan_id uuid,installment_id uuid,created_at timestamptz default now(),description text,notes text,reversed_of_transaction_id uuid);
  `);
  await db.exec(readFileSync('supabase/migrations/20261026225500_wallet_capital_source_integration_phase5.sql','utf8'));
  // This mirror is installed in production but was absent from repository migrations.
  await db.exec(`create function wallet_keep_capital_mirror() returns trigger language plpgsql as $$begin
    update fontes set balance=new.balance where id=new.capital_source_id and balance is distinct from new.balance; return new; end$$;
    create trigger trg_wallet_keep_capital_mirror after update of balance on personal_wallet_accounts for each row when(new.capital_source_id is not null) execute function wallet_keep_capital_mirror();`);
  if (migration.trim()) await db.exec(migration);
});
after(() => db.close());
beforeEach(async () => {
  await db.exec(`truncate personal_wallet_account_operations,personal_wallet_accounts,transacoes,fontes,perfis,platform_admins,user_modulos cascade;
    select set_config('test.user','${user}',false);
    insert into perfis(id,user_id) values('${profile}','${user}');
    insert into platform_admins values('${user}','SUPER_ADMIN');
    insert into fontes(id,profile_id,name,balance) values('${source}','${profile}','Fonte de teste',100);
    insert into personal_wallet_accounts(id,owner_user_id,nickname,account_type,balance) values('${account}','${user}','Conta de teste','CHECKING',100);
    select personal_wallet_link_capital_source('${account}','${source}');`);
});

test('a real Capital adjustment updates the wallet and records exactly one movement', async () => {
  await db.exec(`update fontes set balance=75 where id='${source}'`);
  assert.deepEqual(await balances(), [{wallet:75,capital:75}]);
  const rows = await operations(); assert.equal(rows.length,1); assert.equal(rows[0].amount,25); assert.equal(rows[0].from_account_id,account);
});
test('loan debit and transaction insertion never debit the wallet twice', async () => {
  await db.exec(`begin; update fontes set balance=balance-25 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_INITIAL',25); commit;`);
  assert.deepEqual(await balances(),[{wallet:75,capital:75}]);
  const rows=await operations(); assert.equal(rows.length,1); assert.equal(rows[0].operation_type,'LOAN_DISBURSEMENT'); assert.equal(rows[0].source_transaction_id,tx);
});
test('payment works when its transaction is inserted before the source balance change', async () => {
  await db.exec(`begin; insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','PAYMENT_RECEIVED',30);
    update fontes set balance=balance+30 where id='${source}'; commit;`);
  assert.deepEqual(await balances(),[{wallet:130,capital:130}]);
  const rows=await operations(); assert.equal(rows.length,1); assert.equal(rows[0].operation_type,'LOAN_REPAYMENT');
});
test('a negative reversal follows the real source debit without redoing payment allocation', async () => {
  await db.exec(`begin; update fontes set balance=balance-20 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','ESTORNO',-20); commit;`);
  assert.deepEqual(await balances(),[{wallet:80,capital:80}]);
  const rows=await operations(); assert.equal(rows.length,1); assert.equal(rows[0].amount,20); assert.equal(rows[0].from_account_id,account);
});
test('wallet movements mirror Capital without creating a second ledger movement', async () => {
  await db.exec(`update personal_wallet_accounts set balance=90 where id='${account}'`);
  assert.deepEqual(await balances(),[{wallet:90,capital:90}]); assert.equal((await operations()).length,0);
});
test('transaction-only inserts never fabricate balance movements; repeated balance is a no-op', async () => {
  await db.exec(`insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','PAYMENT_RECEIVED',30); update fontes set balance=100 where id='${source}'`);
  assert.deepEqual(await balances(),[{wallet:100,capital:100}]); assert.equal((await operations()).length,0);
});
test('ambiguous equal-value transactions preserve exact balance movements without inventing associations', async () => {
  await db.exec(`begin; update fontes set balance=90 where id='${source}'; update fontes set balance=80 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_INITIAL',10),(gen_random_uuid(),'${profile}','${source}','LOAN_INITIAL',10); commit;`);
  assert.deepEqual(await balances(),[{wallet:80,capital:80}]); const rows=await operations(); assert.equal(rows.length,2); assert.ok(rows.every(x=>x.source_transaction_id===null));
});
test('linking divergent balances, another owner, or bypassing the RPC fails without changing funds', async () => {
  await db.exec(`select personal_wallet_link_capital_source('${account}',null); update fontes set balance=200 where id='${source}'`);
  await assert.rejects(db.exec(`select personal_wallet_link_capital_source('${account}','${source}')`),/saldo|divergen/i);
  await assert.rejects(db.exec(`update personal_wallet_accounts set capital_source_id='${source}' where id='${account}'`),/saldo|divergen/i);
  await db.exec(`select set_config('test.user','10000000-0000-4000-8000-000000000002',false)`);
  await assert.rejects(db.exec(`select personal_wallet_link_capital_source('${account}','${source}')`),/autoriz|administrador/i);
});
test('rollback rolls back both balances and the ledger', async () => {
  await db.exec(`begin; update fontes set balance=50 where id='${source}'; rollback;`);
  assert.deepEqual(await balances(),[{wallet:100,capital:100}]); assert.equal((await operations()).length,0);
});
test('unlinked sources keep their established independent behavior', async () => {
  await db.exec(`select personal_wallet_link_capital_source('${account}',null); update fontes set balance=40 where id='${source}'`);
  assert.deepEqual(await query(`select balance::float8 as balance from personal_wallet_accounts where id='${account}'`),[{balance:100}]); assert.equal((await operations()).length,0);
});
test('insufficient funds on a contextualized loan roll back Capital, wallet and its operation', async () => {
  await assert.rejects(db.exec(`begin; update fontes set balance=balance-120 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_INITIAL',120); commit;`),/Saldo insuficiente/);
  await db.exec('rollback');
  assert.deepEqual(await balances(),[{wallet:100,capital:100}]); assert.equal((await operations()).length,0);
});
test('a transfer between linked sources updates each account once', async () => {
  await db.exec(`insert into fontes(id,profile_id,name,balance) values('30000000-0000-4000-8000-000000000002','${profile}','Outra fonte',40);
    insert into personal_wallet_accounts(id,owner_user_id,nickname,account_type,balance) values('40000000-0000-4000-8000-000000000002','${user}','Outra conta','CHECKING',40);
    select personal_wallet_link_capital_source('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
    begin; update fontes set balance=balance-20 where id='${source}'; update fontes set balance=balance+20 where id='30000000-0000-4000-8000-000000000002'; commit;`);
  assert.deepEqual(await balances(),[{wallet:80,capital:80}]);
  assert.deepEqual(await query("select balance::float8 as balance from personal_wallet_accounts where id='40000000-0000-4000-8000-000000000002'"),[{balance:60}]);
  assert.equal((await operations()).length,2);
});
test('existing divergent links fail closed rather than silently overwriting either balance', async () => {
  await db.exec(`alter table fontes disable trigger trg_wallet_sync_capital_balance; update fontes set balance=120 where id='${source}'; alter table fontes enable trigger trg_wallet_sync_capital_balance;`);
  await assert.rejects(db.exec(`update personal_wallet_accounts set balance=90 where id='${account}'`),/divergentes/);
  await assert.rejects(db.exec(`select personal_wallet_ensure_capital_source('${account}')`),/divergente/);
  assert.deepEqual(await balances(),[{wallet:100,capital:120}]); assert.equal((await operations()).length,0);
});
test('reapplying the migration preserves existing balances and ledger rows', async () => {
  await db.exec(`update fontes set balance=110 where id='${source}'`);
  const before=await operations(); await db.exec(migration);
  assert.deepEqual(await balances(),[{wallet:110,capital:110}]); assert.deepEqual(await operations(),before);
});
test('equal loan debits cannot bypass insufficient funds when their metadata is ambiguous', async () => {
  await assert.rejects(db.exec(`begin;
    update fontes set balance=balance-60 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_INITIAL',60);
    update fontes set balance=balance-60 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values(gen_random_uuid(),'${profile}','${source}','LOAN_INITIAL',60); commit;`),/Saldo insuficiente/);
  await db.exec('rollback'); assert.deepEqual(await balances(),[{wallet:100,capital:100}]);
});
test('aggregated loan debits cannot bypass insufficient funds without an exact transaction amount', async () => {
  await assert.rejects(db.exec(`begin; update fontes set balance=balance-120 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_INITIAL',60),(gen_random_uuid(),'${profile}','${source}','LOAN_INITIAL',60); commit;`),/Saldo insuficiente/);
  await db.exec('rollback'); assert.deepEqual(await balances(),[{wallet:100,capital:100}]);
});
test('the existing allowance for capital advances is not replaced by a universal nonnegative balance rule', async () => {
  await db.exec(`begin; update fontes set balance=balance-120 where id='${source}';
    insert into transacoes(id,profile_id,source_id,type,amount) values('${tx}','${profile}','${source}','LOAN_ADDITION',120); commit;`);
  assert.deepEqual(await balances(),[{wallet:-20,capital:-20}]); assert.equal((await operations()).length,1);
});
