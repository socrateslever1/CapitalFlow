import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const u='10000000-0000-4000-8000-000000000001';
const p='20000000-0000-4000-8000-000000000001';
const l='30000000-0000-4000-8000-000000000001';
const i='30000000-0000-4000-8000-000000000002';
const principal='40000000-0000-4000-8000-000000000001';
const profit='40000000-0000-4000-8000-000000000002';
const target='40000000-0000-4000-8000-000000000003';
const account='50000000-0000-4000-8000-000000000001';
const key='60000000-0000-4000-8000-000000000001';
const reversal='60000000-0000-4000-8000-000000000002';
const withdraw='70000000-0000-4000-8000-000000000001';
const rows=async(s:string)=>(await db.query(s)).rows as Record<string,unknown>[];
const balances=async()=>(await rows(`select
 (select balance::float8 from fontes where id='${principal}') as original,
 (select balance::float8 from fontes where id='${profit}') as profit,
 (select balance::float8 from fontes where id='${target}') as target,
 (select balance::float8 from personal_wallet_accounts where id='${account}') as account,
 (select interest_balance::float8 from perfis where id='${p}') as profile`))[0];
const movement=async()=>rows('select operation_type,amount::float8 amount from personal_wallet_account_operations order by created_at,id');
const route=async()=>db.exec(`select personal_wallet_set_receipt_destination('${key}','${l}','${account}')`);
const routeWith=async(acc:string|null,src:string|null)=>db.exec(`select personal_wallet_set_receipt_destination('${key}','${l}',${acc?`'${acc}'`:'null'},${src?`'${src}'`:'null'})`);
async function receive(choose:boolean|string,interestSource:string|null=profit) {
 await db.exec('BEGIN');
 try {
  if(choose===true) await route();
  else if(choose==='SOURCE_ONLY') await routeWith(null,target);
  else if(choose==='PRINCIPAL_SOURCE') await routeWith(null,principal);
  else if(choose==='ACCOUNT_AND_SOURCE') await routeWith(account,target);
  await db.exec(`update fontes set balance=balance+500 where id='${principal}'`);
  if(interestSource) await db.exec(`update fontes set balance=balance+100 where id='${interestSource}'`);
  else await db.exec(`update perfis set interest_balance=interest_balance+100 where id='${p}'`);
  await db.exec(`insert into financial_operations(
  operation_id,idempotency_key,profile_id,loan_id,installment_id,
  source_id,profit_source_id,amount_received,principal_paid,interest_paid,
  late_fee_paid,operation_type,status,payment_date
  ) values(gen_random_uuid(),'${key}','${p}','${l}','${i}','${principal}',
  ${interestSource ? `'${interestSource}'` : 'null'},600,500,100,0,'PAYMENT','COMPLETED','2026-11-10')`);
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
before(async()=>{
 await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function is_platform_super_admin() returns boolean language sql stable as
 $$select auth.uid()='${u}'::uuid$$;
 create table perfis(id uuid primary key,user_id uuid,created_at timestamptz default now(),interest_balance numeric default 0);
 create function private.financial_actor_can_access(x uuid) returns boolean language sql stable as
 $$select exists(select 1 from perfis where id=x and user_id=auth.uid())$$;
 create table contratos(id uuid primary key,profile_id uuid,owner_id uuid,debtor_name text);
 create table fontes(id uuid primary key,profile_id uuid,balance numeric,archived_at timestamptz);
 create table personal_wallet_accounts(id uuid primary key,owner_user_id uuid,nickname text,balance numeric,capital_source_id uuid,archived_at timestamptz,updated_at timestamptz);
 create table capital_source_wallet_references(source_id uuid,owner_user_id uuid,target_kind text,target_id uuid,unique(owner_user_id,target_kind,target_id));
 create table wallet_receipt_destinations(idempotency_key uuid primary key,owner_user_id uuid,loan_id uuid,account_id uuid,created_at timestamptz default now());
 create table financial_operations(operation_id uuid primary key,idempotency_key uuid unique,profile_id uuid,loan_id uuid,installment_id uuid,source_id uuid,profit_source_id uuid,amount_received numeric,principal_paid numeric,interest_paid numeric,late_fee_paid numeric,status text,operation_type text,original_operation_id uuid,payment_date date,wallet_destination_account_id uuid);
 create table installment_payment_offer_history(id uuid primary key default gen_random_uuid(),profile_id uuid,loan_id uuid,installment_id uuid,payment_id uuid,action text,agreed_date date);
 create table transacoes(id uuid primary key default gen_random_uuid(),profile_id uuid,loan_id uuid,installment_id uuid,source_id uuid,type text,amount numeric,principal_delta numeric,interest_delta numeric,late_fee_delta numeric,category text,idempotency_key text,meta jsonb default '{}'::jsonb,operator_id uuid,date date,notes text);
 create table personal_wallet_account_operations(id uuid primary key default gen_random_uuid(),owner_user_id uuid,request_id uuid,operation_type text,from_account_id uuid,to_account_id uuid,amount numeric,description text,category text,operation_date date,occurred_at timestamptz,contract_id uuid,installment_id uuid,created_at timestamptz default now(),unique(owner_user_id,request_id));
 create function wallet_keep_capital_mirror() returns trigger language plpgsql as
 $$begin if new.capital_source_id is not null then update fontes set balance=round(new.balance,2) where id=new.capital_source_id;end if;return new;end$$;
 create trigger trg_wallet_keep_capital_mirror after update of balance on personal_wallet_accounts for each row when(new.capital_source_id is not null) execute function wallet_keep_capital_mirror();
 create function wallet_apply_receipt_destination() returns trigger language plpgsql as $$begin return new;end$$;
 create constraint trigger trg_wallet_apply_receipt_destination after insert on financial_operations deferrable initially deferred for each row execute function wallet_apply_receipt_destination();
 create function withdraw_profit_atomic_v2(p_idempotency_key uuid,p_amount numeric,p_profile_id uuid,p_source_id uuid,p_target_source_id uuid) returns jsonb language plpgsql as $$
 begin
  if p_source_id is not null then update fontes set balance=balance-p_amount where id=p_source_id;
  else update perfis set interest_balance=interest_balance-p_amount where id=p_profile_id;end if;
  if p_target_source_id is not null then update fontes set balance=balance+p_amount where id=p_target_source_id;end if;
  insert into transacoes(profile_id,source_id,type,amount,idempotency_key,meta) values
  (p_profile_id,p_target_source_id,'PROFIT_WITHDRAWAL',p_amount,p_idempotency_key::text,
   jsonb_build_object('source_id',p_source_id,'result',jsonb_build_object('success',true)));
  return jsonb_build_object('success',true);
 end$$;
 create function reverse_financial_operation_v4(p_original_idempotency_key uuid,p_reversal_idempotency_key uuid,p_reason text) returns jsonb language plpgsql as $$
 declare v financial_operations%rowtype;
 begin
  select * into v from financial_operations where idempotency_key=p_original_idempotency_key for update;
  update fontes set balance=balance-v.principal_paid where id=v.source_id;
  if v.profit_source_id is not null then update fontes set balance=balance-v.interest_paid-v.late_fee_paid where id=v.profit_source_id;
  else update perfis set interest_balance=interest_balance-v.interest_paid-v.late_fee_paid where id=v.profile_id;end if;
  update financial_operations set status='REVERSED' where idempotency_key=p_original_idempotency_key;
  return jsonb_build_object('success',true);
 end$$;
 `);
 await db.exec(readFileSync('supabase/migrations/20261110210000_optional_wallet_receipt_withdrawal_routing.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261110220000_optional_payment_capital_destination_routing.sql','utf8'));
});
after(async()=>db.close());
beforeEach(async()=>{
 await db.exec(`truncate personal_wallet_account_operations,transacoes,financial_operations,installment_payment_offer_history,wallet_receipt_destinations,capital_source_wallet_references,personal_wallet_accounts,fontes,contratos,perfis cascade;
 select set_config('test.user','${u}',false);
 insert into perfis(id,user_id,interest_balance) values('${p}','${u}',0);
 insert into contratos(id,profile_id,owner_id,debtor_name) values('${l}','${p}','${p}','Cliente teste');
 insert into fontes(id,profile_id,balance) values('${principal}','${p}',1000),('${profit}','${p}',300),('${target}','${p}',400);
 insert into personal_wallet_accounts(id,owner_user_id,nickname,balance) values('${account}','${u}','Nubank',200);`);
});
test('sem destino mantem principal e lucro nas fontes originais',async()=>{
 await receive(false);
 assert.deepEqual(await balances(),{original:1500,profit:400,target:400,account:200,profile:0});
 assert.equal((await movement()).length,0);
});
test('conta livre recebe valor integral e nao duplica fontes',async()=>{
 await receive(true);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:800,profile:0});
 assert.deepEqual((await movement()).map(m=>[m.operation_type,m.amount]),[['RECEIPT',600]]);
 const r=await rows('select principal_paid::float8 principal,interest_paid::float8 interest from wallet_receipt_destinations');
 assert.deepEqual(r,[{principal:500,interest:100}]);
});
test('conta vinculada por referencia recebe tudo e atualiza sua fonte',async()=>{
 await db.exec(`insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id) values('${target}','${u}','ACCOUNT','${account}')`);
 await receive(true);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:1000,account:800,profile:0});
});
test('espelho direto de Capital recebe sem duplicar',async()=>{
 await db.exec(`update personal_wallet_accounts set capital_source_id='${target}',balance=400 where id='${account}'`);
 await receive(true);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:1000,account:1000,profile:0});
});
test('lucro no saldo de perfil tambem e desviado sem duplicar',async()=>{
 await receive(true,null);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:800,profile:0});
});
test('estorno integrado reverte conta e fontes na mesma transacao',async()=>{
 await receive(true);
 await db.exec(`select reverse_wallet_financial_operation_v4('${key}','${reversal}','Registro incorreto')`);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:200,profile:0});
 assert.deepEqual((await movement()).map(m=>m.operation_type),['RECEIPT','PAYMENT']);
});
test('estorno legado nao pode manter dinheiro fisico indevido',async()=>{
 await receive(true);
 await assert.rejects(db.exec(`select reverse_financial_operation_v4('${key}','${reversal}','Erro')`),/integrado/);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:800,profile:0});
});
test('condicao especial V3 registra credito integral e auditoria separada',async()=>{
 await db.exec('BEGIN');
 try{
  await route();
  await db.exec(`update fontes set balance=balance+500 where id='${principal}';
    update fontes set balance=balance+100 where id='${profit}';
    insert into transacoes(profile_id,loan_id,installment_id,source_id,type,amount,principal_delta,interest_delta,late_fee_delta,category,idempotency_key) values
    ('${p}','${l}','${i}','${principal}','PAYMENT',500,500,0,0,'PAGAMENTO','${key}'),
    ('${p}','${l}','${i}','${profit}','PAYMENT',100,0,100,0,'LUCRO','${key}_lucro');
    insert into installment_payment_offer_history(profile_id,loan_id,installment_id,payment_id,action,agreed_date)
    values('${p}','${l}','${i}','${key}','USED','2026-11-10')`);
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:800,profile:0});
 assert.equal((await rows('select applied_kind from wallet_receipt_destinations'))[0].applied_kind,'OFFER');
});
test('saque para conta opcional registra apenas uma entrada e suporta repeticao',async()=>{
 await db.exec(`select withdraw_profit_to_wallet_atomic('${withdraw}',100,'${p}','${profit}','${account}')`);
 assert.deepEqual(await balances(),{original:1000,profit:200,target:400,account:300,profile:0});
 await db.exec(`select withdraw_profit_to_wallet_atomic('${withdraw}',100,'${p}','${profit}','${account}')`);
 assert.equal((await movement()).length,1);
 assert.deepEqual(await balances(),{original:1000,profit:200,target:400,account:300,profile:0});
});
test('saque vinculado transfere lucro para fonte vinculada sem replicar',async()=>{
 await db.exec(`insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id) values('${target}','${u}','ACCOUNT','${account}');
 select withdraw_profit_to_wallet_atomic('${withdraw}',100,'${p}','${profit}','${account}')`);
 assert.deepEqual(await balances(),{original:1000,profit:200,target:500,account:300,profile:0});
});
test('conta ligada a propria fonte de lucro nao permite credito duplo',async()=>{
 await db.exec(`insert into capital_source_wallet_references(source_id,owner_user_id,target_kind,target_id) values('${profit}','${u}','ACCOUNT','${account}')`);
 await assert.rejects(db.exec(`select withdraw_profit_to_wallet_atomic('${withdraw}',100,'${p}','${profit}','${account}')`),/mesma fonte/);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:200,profile:0});
});
test('usuario sem privilegio nao escolhe conta',async()=>{
 await db.exec("select set_config('test.user','10000000-0000-4000-8000-000000000002',false)");
 await assert.rejects(route(),/administrador master|autorizado/);
 await assert.rejects(db.exec(`select withdraw_profit_to_wallet_atomic('${withdraw}',100,'${p}','${profit}','${account}')`),/nao autorizado/);
});
test('usuario comum escolhe fonte de capital para receber capital e lucro com estorno atomico',async()=>{
 const u2='10000000-0000-4000-8000-000000000002';
 const p2='20000000-0000-4000-8000-000000000002';
 await db.exec(`
  insert into perfis(id,user_id,interest_balance) values('${p2}','${u2}',0);
  update contratos set profile_id='${p2}',owner_id='${p2}' where id='${l}';
  update fontes set profile_id='${p2}' where id in ('${principal}','${profit}','${target}');
  select set_config('test.user','${u2}',false);
 `);
 await db.exec('BEGIN');
 try{
  await db.exec(`select personal_wallet_set_receipt_destination('${key}','${l}',null,'${target}')`);
  await db.exec(`update fontes set balance=balance+500 where id='${principal}';
   update fontes set balance=balance+100 where id='${profit}';
   insert into financial_operations(
    operation_id,idempotency_key,profile_id,loan_id,installment_id,
    source_id,profit_source_id,amount_received,principal_paid,interest_paid,
    late_fee_paid,operation_type,status,payment_date
   ) values(gen_random_uuid(),'${key}','${p2}','${l}','${i}','${principal}','${profit}',600,500,100,0,'PAYMENT','COMPLETED','2026-11-10')`);
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
 assert.deepEqual(await balances(),{original:1000,profit:300,target:1000,account:200,profile:0});
 assert.equal((await movement()).length,0);
 assert.equal((await rows(`select destination_source_id::text dst from financial_operations where idempotency_key='${key}'`))[0].dst,target);
 await db.exec(`select reverse_wallet_financial_operation_v4('${key}','${reversal}','Estorno usuario comum')`);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:200,profile:0});
});
test('fonte escolhida igual a fonte original do contrato recebe capital e lucro juntos e estorna',async()=>{
 await receive('PRINCIPAL_SOURCE');
 assert.deepEqual(await balances(),{original:1600,profit:300,target:400,account:200,profile:0});
 await db.exec(`select reverse_wallet_financial_operation_v4('${key}','${reversal}','Estorno mesma fonte')`);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:200,profile:0});
});
test('master pode escolher simultaneamente conta da Carteira e fonte de capital nao conflitante',async()=>{
 await receive('ACCOUNT_AND_SOURCE');
 assert.deepEqual(await balances(),{original:1000,profit:300,target:1000,account:800,profile:0});
 await assert.rejects((async()=>{
  await db.exec(`update personal_wallet_accounts set capital_source_id='${principal}',balance=1000 where id='${account}'`);
  await db.exec(`select personal_wallet_set_receipt_destination('${withdraw}','${l}','${account}','${target}')`);
 })(),/outra fonte de capital/);
 await db.exec(`update personal_wallet_accounts set capital_source_id=null,balance=800 where id='${account}'`);
 await db.exec(`select reverse_wallet_financial_operation_v4('${key}','${reversal}','Estorno combinado')`);
 assert.deepEqual(await balances(),{original:1000,profit:300,target:400,account:200,profile:0});
});
