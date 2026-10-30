import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const request='20000000-0000-4000-8000-000000000001';
const envelope={version:1,algorithm:'AES-GCM',iterations:600000,salt:Buffer.alloc(16,1).toString('base64'),iv:Buffer.alloc(12,2).toString('base64'),ciphertext:Buffer.alloc(80,3).toString('base64'),context_id:request};
const card={nickname:'Cartão de teste',issuer:'Banco',brand:'Visa',last_four:'1111',credit_limit:1000,closing_day:1,due_day:10};
const identity={cardholder_name:'Titular de teste',expiry_month:12,expiry_year:2030};
const create=(encrypted=envelope,identification=identity)=>db.query('select personal_wallet_create_complete_card($1,null,$2,$3,$4,$5) as result',[card,{invoice_amount:0},request,identification,encrypted]);
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function is_platform_super_admin() returns boolean language sql stable as $$select current_setting('test.master',true)='true'$$;
    create table personal_wallet_accounts(id uuid primary key default gen_random_uuid(),balance numeric not null default 0);
    create table personal_wallet_cards(id uuid primary key default gen_random_uuid(),owner_user_id uuid,nickname text,issuer text,brand text,last_four text,
      account_id uuid,credit_limit numeric,closing_day int,due_day int,status text default 'ACTIVE',primary_color text default '#111111',
      cardholder_name text,expiry_month int,expiry_year int,opening_request_id uuid,updated_at timestamptz);
    -- Boundary fixture: the existing financial RPC owns creation and replay.
    create function personal_wallet_create_card_with_opening(p_card jsonb,p_existing_account_id uuid,p_opening jsonb,p_request_id uuid)
    returns jsonb language plpgsql as $$declare v_id uuid;begin
      if auth.uid() is null or not is_platform_super_admin() then raise exception 'Acesso nao autorizado.';end if;
      select id into v_id from personal_wallet_cards where owner_user_id=auth.uid() and opening_request_id=p_request_id;
      if found then return jsonb_build_object('card_id',v_id,'replayed',true);end if;
      insert into personal_wallet_cards(owner_user_id,nickname,issuer,brand,last_four,credit_limit,closing_day,due_day,opening_request_id)
        values(auth.uid(),p_card->>'nickname',p_card->>'issuer',p_card->>'brand',p_card->>'last_four',(p_card->>'credit_limit')::numeric,1,10,p_request_id) returning id into v_id;
      return jsonb_build_object('card_id',v_id,'replayed',false);end$$;
    create function personal_wallet_update_card_metadata(p_id uuid,p_nickname text,p_issuer text,p_brand text,p_account uuid,p_limit numeric,p_close int,p_due int,p_status text,p_color text,p_last text,p_holder text,p_month int,p_year int)
    returns void language plpgsql as $$begin
      if (p_month is null)<>(p_year is null) or p_month not between 1 and 12 then raise exception 'Validade invalida.';end if;
      update personal_wallet_cards set cardholder_name=p_holder,expiry_month=p_month,expiry_year=p_year,last_four=p_last where id=p_id and owner_user_id=auth.uid();end$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261030030321_wallet_complete_registration.sql','utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec(`reset role;truncate personal_wallet_cards,personal_wallet_accounts,auth.users cascade;
    insert into auth.users values('${owner}'),('${other}');select set_config('test.user','${owner}',false);select set_config('test.master','true',false);`);
});
test('complete registration persists identity and an opaque envelope atomically',async()=>{
  const result=await create();const id=result.rows[0].result.card_id;
  const stored=await db.query('select last_four,cardholder_name,expiry_month,has_protected_data from personal_wallet_cards where id=$1',[id]);
  assert.deepEqual(stored.rows,[{last_four:'1111',cardholder_name:'Titular de teste',expiry_month:12,has_protected_data:true}]);
  assert.deepEqual((await db.query('select personal_wallet_get_card_vault($1) as envelope',[id])).rows[0].envelope,envelope);
});
test('canonical request replay never duplicates a card or overwrites protected data',async()=>{
  await create();await create({...envelope,ciphertext:Buffer.alloc(80,4).toString('base64')});
  assert.equal((await db.query('select count(*)::int as total from personal_wallet_cards')).rows[0].total,1);
  assert.deepEqual((await db.query('select envelope from personal_wallet_card_vault')).rows[0].envelope,envelope);
});
test('invalid envelope and invalid identity roll back the canonical card creation',async()=>{
  await assert.rejects(create({...envelope,number:'4111111111111111'}),/Envelope/);
  await assert.rejects(create(envelope,{...identity,expiry_month:13}),/Validade/);
  assert.equal((await db.query('select count(*)::int as total from personal_wallet_cards')).rows[0].total,0);
});
test('legacy registration without full plastic data remains supported',async()=>{
  await create(null,{cardholder_name:null,expiry_month:null,expiry_year:null});
  assert.equal((await db.query('select has_protected_data from personal_wallet_cards')).rows[0].has_protected_data,false);
});
test('another owner cannot fetch or replace a card vault even with administrator access',async()=>{
  const id=(await create()).rows[0].result.card_id;
  await db.exec(`select set_config('test.user','${other}',false)`);
  await assert.rejects(db.query('select personal_wallet_get_card_vault($1)',[id]),/nao autorizado/);
  await assert.rejects(db.query('select personal_wallet_save_card_vault($1,$2,$3)',[id,envelope,'1111']),/nao autorizado/);
});
test('vault contexts cannot be swapped and plaintext fields are refused',async()=>{
  const id=(await create()).rows[0].result.card_id;
  await assert.rejects(db.query('select personal_wallet_save_card_vault($1,$2,$3)',[id,{...envelope,context_id:other},'1111']),/nao pertence/);
  await assert.rejects(db.query('select personal_wallet_save_card_vault($1,$2,$3)',[id,{...envelope,context_id:id},'1111']),/preservado/);
  await assert.rejects(db.query('select personal_wallet_save_card_vault($1,$2,$3)',[id,{...envelope,cvc:'123'},'1111']),/Envelope/);
});
test('bank products are optional validated metadata and never change the balance',async()=>{
  const id=(await db.query('insert into personal_wallet_accounts(balance) values(250) returning id')).rows[0].id;
  await db.query('update personal_wallet_accounts set bank_details=$1 where id=$2',[{agency:'0012',account_number:'000099',has_overdraft:true,overdraft_limit:2000,has_loans:true,loan_balance:15000.5},id]);
  assert.equal((await db.query('select balance::float8 as balance from personal_wallet_accounts where id=$1',[id])).rows[0].balance,250);
  for(const details of [{overdraft_limit:-1},{loan_balance:1.001},{has_loans:'yes'},{unknown:1}]) await assert.rejects(db.query('update personal_wallet_accounts set bank_details=$1 where id=$2',[details,id]),/wallet_accounts_bank_details_check/);
});
test('vault table is not directly readable and RPCs are not exposed to anonymous access',async()=>{
  const permissions=await db.query(`select has_table_privilege('authenticated','personal_wallet_card_vault','SELECT') as direct,
    has_function_privilege('anon','personal_wallet_get_card_vault(uuid)','EXECUTE') as anonymous,
    has_function_privilege('authenticated','personal_wallet_get_card_vault(uuid)','EXECUTE') as authenticated`);
  assert.deepEqual(permissions.rows,[{direct:false,anonymous:false,authenticated:true}]);
});
test('authenticated owner uses the RPC but cannot select ciphertexts directly',async()=>{
  const id=(await create()).rows[0].result.card_id;
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select personal_wallet_get_card_vault($1) as envelope',[id])).rows[0].envelope,envelope);
  await assert.rejects(db.query('select * from personal_wallet_card_vault'),/permission denied/);
  await db.exec('reset role');
});
test('archiving a card preserves encrypted history while closing its active vault access',async()=>{
  const id=(await create()).rows[0].result.card_id;
  await db.query("update personal_wallet_cards set status='CANCELED' where id=$1",[id]);
  await assert.rejects(db.query('select personal_wallet_get_card_vault($1)',[id]),/nao autorizado/);
  assert.equal((await db.query('select count(*)::int as total from personal_wallet_card_vault')).rows[0].total,1);
});
test('stale metadata edits cannot invalidate the final digits of protected data',async()=>{
  const id=(await create()).rows[0].result.card_id;
  await db.query('select personal_wallet_save_card_vault($1,$2,$3)',[id,envelope,'2222']);
  await assert.rejects(db.query("update personal_wallet_cards set last_four='1111' where id=$1",[id]),/pelo cofre/);
  await assert.rejects(db.query('update personal_wallet_cards set has_protected_data=false where id=$1',[id]),/pelo cofre/);
  assert.equal((await db.query('select last_four from personal_wallet_cards where id=$1',[id])).rows[0].last_four,'2222');
});
