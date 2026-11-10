import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const usr = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const profile = '20000000-0000-4000-8000-000000000001';
const loan = '30000000-0000-4000-8000-000000000001';
const inst = '30000000-0000-4000-8000-000000000002';
const principal = '40000000-0000-4000-8000-000000000001';
const profit = '40000000-0000-4000-8000-000000000002';
const destination = '40000000-0000-4000-8000-000000000003';
const account = '50000000-0000-4000-8000-000000000001';
const key = '60000000-0000-4000-8000-000000000001';
const reverseKey = '60000000-0000-4000-8000-000000000002';

const rows = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[];
const totals = async () => rows(`select
  (select balance::float8 from fontes where id='${principal}') principal,
  (select balance::float8 from fontes where id='${profit}') profit,
  (select balance::float8 from fontes where id='${destination}') destination,
  (select balance::float8 from personal_wallet_accounts where id='${account}') account`);
const movements = async () => rows('select operation_type,amount::float8 amount,contract_id,installment_id from personal_wallet_account_operations order by created_at,id');

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table perfis(id uuid primary key,user_id uuid,created_at timestamptz default now());
    create function is_platform_super_admin() returns boolean language sql stable as
      $$select auth.uid() = '10000000-0000-4000-8000-000000000001'::uuid$$;
    create function private.financial_actor_can_access(p uuid) returns boolean language sql stable as
      $$select exists(select 1 from perfis where id=p and user_id=auth.uid())$$;
    create table contratos(id uuid primary key,profile_id uuid,owner_id uuid,debtor_name text);
    create table fontes(id uuid primary key,profile_id uuid,balance numeric(14,2),archived_at timestamptz);
    create table personal_wallet_accounts(id uuid primary key,owner_user_id uuid,nickname text,balance numeric(14,2),capital_source_id uuid,archived_at timestamptz,updated_at timestamptz);
    create table capital_source_wallet_references(
      source_id uuid,owner_user_id uuid,target_kind text,target_id uuid,
      unique(owner_user_id,target_kind,target_id));
    create table wallet_receipt_destinations(idempotency_key uuid primary key,owner_user_id uuid,loan_id uuid,account_id uuid,created_at timestamptz default now());
    create table financial_operations(
      operation_id uuid primary key,idempotency_key uuid unique,profile_id uuid,loan_id uuid,
      installment_id uuid,source_id uuid,profit_source_id uuid,amount_received numeric(14,2),
      principal_paid numeric(14,2),interest_paid numeric(14,2),late_fee_paid numeric(14,2),
      operation_type text,status text default 'COMPLETED',original_operation_id uuid,
      payment_date date,wallet_destination_account_id uuid);
    create table personal_wallet_account_operations(
      id uuid primary key default gen_random_uuid(),owner_user_id uuid,request_id uuid,
      operation_type text,from_account_id uuid,to_account_id uuid,amount numeric(14,2),
      description text,category text,operation_date date,occurred_at timestamptz,
      contract_id uuid,installment_id uuid,created_at timestamptz default now(),
      unique(owner_user_id,request_id));
    create function wallet_keep_capital_mirror() returns trigger language plpgsql as
      $$begin if new.capital_source_id is not null then
        update fontes set balance=new.balance where id=new.capital_source_id;
        end if; return new; end$$;
    create trigger trg_wallet_keep_capital_mirror after update of balance on personal_wallet_accounts
      for each row when (new.capital_source_id is not null)
      execute function wallet_keep_capital_mirror();
    create function reverse_financial_operation_v4(orig uuid, rev uuid, reason text)
    returns jsonb language plpgsql as $$
    declare v financial_operations%rowtype;
    begin
      select * into v from financial_operations where idempotency_key=orig for update;
      if not found then raise exception 'Operacao nao encontrada'; end if;
      update fontes set balance=balance-v.principal_paid where id=v.source_id;
      if v.profit_source_id is not null then update fontes
        set balance=balance-v.interest_paid-v.late_fee_paid where id=v.profit_source_id; end if;
      update financial_operations set status='REVERSED' where idempotency_key=orig;
      return jsonb_build_object('success',true);
    end $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261109235900_wallet_receipt_linked_source_routing.sql','utf8'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec(`truncate personal_wallet_account_operations,financial_operations,
    wallet_receipt_destinations,capital_source_wallet_references,
    personal_wallet_accounts,fontes,contratos,perfis cascade;
    select set_config('test.user','${usr}',false);
    insert into perfis(id,user_id) values('${profile}','${usr}');
    insert into contratos(id,profile_id,owner_id,debtor_name)
      values('${loan}','${profile}','${profile}','Cliente teste');
    insert into fontes(id,profile_id,balance)
      values('${principal}','${profile}',1000),('${profit}','${profile}',300),
            ('${destination}','${profile}',400);
    insert into personal_wallet_accounts(id,owner_user_id,nickname,balance)
      values('${account}','${usr}','Banco teste',200); `);
});
const receive = async (profitSource: string | null = null) => {
  await db.exec(`begin;
    select personal_wallet_set_receipt_destination('${key}','${loan}','${account}');
    update fontes set balance=balance+500 where id='${principal}';
    ${profitSource ? `update fontes set balance=balance+100 where id='${profitSource}';` : ''}
    insert into financial_operations(
      operation_id,idempotency_key,profile_id,loan_id,installment_id,
      source_id,profit_source_id,amount_received,principal_paid,interest_paid,
      late_fee_paid,operation_type,status,payment_date)
    values(gen_random_uuid(),'${key}','${profile}','${loan}','${inst}',
      '${principal}',${profitSource ? "'"+profitSource+"'" : 'null'},600,500,100,0,
      'PAYMENT','COMPLETED','2026-11-09');
    commit;`);
};
test('linked account receives exactly one integral amount; original principal and profit stay separately auditable',async()=>{
  await db.exec(`update personal_wallet_accounts set capital_source_id='${principal}',balance=1000 where id='${account}';`);
  await receive();
  assert.deepEqual(await totals(),[{principal:1600,profit:300,destination:400,account:1600}]);
  assert.deepEqual((await movements()).map(r=>[r.operation_type,r.amount]),[['RECEIPT',600]]);
  const audit=await rows('select principal_paid::float8 principal,interest_paid::float8 interest,amount_received::float8 total from financial_operations');
  assert.deepEqual(audit,[{principal:500,interest:100,total:600}]);
});
test('reference-only destination routes available capital without cloning original source balance',async()=>{
  await db.exec(`insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id)
    values('${destination}','${usr}','ACCOUNT','${account}');`);
  await receive(profit);
  assert.deepEqual(await totals(),[{principal:1000,profit:300,destination:1000,account:800}]);
  assert.equal((await movements()).length,1);
  const route=await rows(`select routed_source_id,was_direct_link from wallet_receipt_destinations`);
  assert.deepEqual(route,[{routed_source_id:destination,was_direct_link:false}]);
});
test('integrated reversal restores both account and original source balances atomically',async()=>{
  await db.exec(`insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id)
    values('${destination}','${usr}','ACCOUNT','${account}');`);
  await receive(profit);
  await db.exec(`select reverse_wallet_financial_operation_v4('${key}','${reverseKey}','Erro de registro');`);
  assert.deepEqual(await totals(),[{principal:1000,profit:300,destination:400,account:200}]);
  assert.deepEqual((await movements()).map(r=>r.operation_type),['RECEIPT','PAYMENT']);
});
test('legacy reversal is blocked so it cannot leave a paid account after ledger reversal',async()=>{
  await receive();
  await assert.rejects(db.exec(`select reverse_financial_operation_v4('${key}','${reverseKey}','Erro');`),/integrada/);
  await db.exec('rollback');
  assert.deepEqual(await totals(),[{principal:1500,profit:300,destination:400,account:800}]);
  assert.equal((await movements()).length,1);
});
test('same routing key is idempotent; changing account with same key is rejected',async()=>{
  await receive();
  await db.exec(`select personal_wallet_set_receipt_destination('${key}','${loan}','${account}');`);
  assert.equal((await movements()).length,1);
  const otherAccount='50000000-0000-4000-8000-000000000002';
  await db.exec(`insert into personal_wallet_accounts(id,owner_user_id,nickname,balance)
    values('${otherAccount}','${usr}','Outro banco',0);`);
  await assert.rejects(db.exec(`select personal_wallet_set_receipt_destination('${key}','${loan}','${otherAccount}');`),/outro destino/);
  await db.exec('rollback');
});
test('unauthorized owner cannot select a destination or read others accounts',async()=>{
  await db.exec(`select set_config('test.user','${other}',false)`);
  await assert.rejects(db.exec(`select personal_wallet_set_receipt_destination('${key}','${loan}','${account}');`),/administrador master/);
  await db.exec('rollback');
});
test('conflicting direct and reference links fail without posting partial balances',async()=>{
  await db.exec(`update personal_wallet_accounts set capital_source_id='${principal}',balance=1000 where id='${account}';
    insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id)
    values('${destination}','${usr}','ACCOUNT','${account}');`);
  await assert.rejects(receive(),/vínculos conflitantes/);
  await db.exec('rollback');
  assert.deepEqual(await totals(),[{principal:1000,profit:300,destination:400,account:1000}]);
});
test('wallet stays restricted to master, and UI offers linked and referenced accounts',()=>{
  const modal=readFileSync('components/modals/PaymentManagerModal.tsx','utf8');
  const engine=readFileSync('services/payments/paymentEngineV4.ts','utf8');
  assert.match(modal,/platformAdminService\.isSuperAdmin\(\)/);
  assert.match(modal,/walletAccounts\.map\(account/);
  assert.doesNotMatch(modal,/walletAccounts\.filter\(account => !account\.capital_source_id\)/);
  assert.match(modal,/focus-visible:ring-2/);
  assert.match(engine,/supabase\.rpc\('reverse_wallet_financial_operation_v4'/);
});
