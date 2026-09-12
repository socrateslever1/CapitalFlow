import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

const { Client } = pg;

const IMAGE = process.env.TEST_POSTGRES_IMAGE || 'postgres:17.6-alpine';
const ROOT = process.cwd();
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260912_harden_payment_idempotency_concurrency.sql');

const IDS = {
  profile: '11111111-1111-1111-1111-111111111111',
  operator: '22222222-2222-2222-2222-222222222222',
  loan: '33333333-3333-3333-3333-333333333333',
  installment: '44444444-4444-4444-4444-444444444444',
  source: '55555555-5555-5555-5555-555555555555',
  profit: '66666666-6666-6666-6666-666666666666',
};

const money = (value) => Number(Number(value).toFixed(2));

const fixtureSql = `
create table public.perfis (
  id uuid primary key,
  interest_balance numeric(14,2) not null default 0
);

create table public.contratos (
  id uuid primary key,
  status text not null default 'ATIVO'
);

create table public.fontes (
  id uuid primary key,
  profile_id uuid,
  name text,
  balance numeric(14,2) not null default 0
);

create table public.parcelas (
  id uuid primary key,
  loan_id uuid not null,
  principal_remaining numeric(14,2) not null default 0,
  interest_remaining numeric(14,2) not null default 0,
  late_fee_accrued numeric(14,2) not null default 0,
  paid_principal numeric(14,2) not null default 0,
  paid_interest numeric(14,2) not null default 0,
  paid_late_fee numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  paid_date date,
  status text not null default 'PENDING'
);

create table public.transacoes (
  id uuid primary key,
  profile_id uuid,
  loan_id uuid,
  installment_id uuid,
  source_id uuid,
  type text,
  amount numeric(14,2),
  principal_delta numeric(14,2),
  interest_delta numeric(14,2),
  late_fee_delta numeric(14,2),
  date date,
  notes text,
  category text,
  idempotency_key text,
  operator_id uuid
);
`;

function extractUuidRpc(sql) {
  const startMarker = 'CREATE OR REPLACE FUNCTION public.process_payment_v3_selective('; 
  const start = sql.indexOf(startMarker);
  if (start < 0) throw new Error('RPC UUID não encontrada na migration.');
  const endMarker = "\n\nGRANT EXECUTE ON FUNCTION public.process_payment_v3_selective";
  const end = sql.indexOf(endMarker, start);
  if (end < 0) throw new Error('Fim da RPC UUID não encontrado na migration.');
  return sql.slice(start, end).trim();
}

async function openClient(uri) {
  const client = new Client({ connectionString: uri });
  await client.connect();
  return client;
}

async function reset(client, { principal = 3450, interest = 1035, late = 0 } = {}) {
  await client.query('truncate public.transacoes, public.parcelas, public.fontes, public.contratos, public.perfis');
  await client.query('insert into public.perfis(id, interest_balance) values ($1, 0)', [IDS.profile]);
  await client.query('insert into public.contratos(id, status) values ($1, $2)', [IDS.loan, 'ATIVO']);
  await client.query(
    'insert into public.fontes(id, profile_id, name, balance) values ($1,$2,$3,0),($4,$2,$5,0)',
    [IDS.source, IDS.profile, 'Capital', IDS.profit, 'Caixa Livre'],
  );
  await client.query(
    `insert into public.parcelas(
      id, loan_id, principal_remaining, interest_remaining, late_fee_accrued, status
    ) values ($1,$2,$3,$4,$5,'PENDING')`,
    [IDS.installment, IDS.loan, principal, interest, late],
  );
}

async function callPayment(client, {
  key,
  principal = 0,
  interest = 0,
  late = 0,
  lateForgiven = 0,
  interestForgiven = 0,
  capitalize = false,
} = {}) {
  return client.query(
    `select public.process_payment_v3_selective(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
      $6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,
      $11::date,$12::boolean,$13::uuid,$14::uuid
    )`,
    [
      key,
      IDS.loan,
      IDS.installment,
      IDS.profile,
      IDS.operator,
      principal,
      interest,
      late,
      lateForgiven,
      interestForgiven,
      '2026-09-12',
      capitalize,
      IDS.source,
      IDS.profit,
    ],
  );
}

async function snapshot(client) {
  const parcel = (await client.query('select * from public.parcelas where id=$1', [IDS.installment])).rows[0];
  const transactions = (await client.query('select * from public.transacoes order by idempotency_key')).rows;
  const sources = (await client.query('select id,balance from public.fontes order by id')).rows;
  return { parcel, transactions, sources };
}

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
const rpcSql = extractUuidRpc(migrationSql);
const container = await new PostgreSqlContainer(IMAGE)
  .withDatabase('capitalflow_test')
  .withUsername('capitalflow')
  .withPassword('capitalflow')
  .start();
const uri = container.getConnectionUri();
const admin = await openClient(uri);

try {
  await admin.query(fixtureSql);
  await admin.query(rpcSql);

  await run('usa a RPC real da migration, não uma função substituta', async () => {
    const def = await admin.query(
      `select pg_get_functiondef('public.process_payment_v3_selective(uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,date,boolean,uuid,uuid)'::regprocedure) as def`,
    );
    assert.match(def.rows[0].def, /pg_advisory_xact_lock/);
    assert.match(def.rows[0].def, /FOR UPDATE/i);
  });

  await run('mesma chave concorrente aplica exatamente uma vez', async () => {
    await reset(admin);
    const a = await openClient(uri);
    const b = await openClient(uri);
    const key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    try {
      await Promise.all([
        callPayment(a, { key, interest: 800 }),
        callPayment(b, { key, interest: 800 }),
      ]);
      const s = await snapshot(admin);
      assert.equal(s.transactions.length, 1);
      assert.equal(money(s.parcel.paid_total), 800);
      assert.equal(money(s.parcel.interest_remaining), 235);
      const profit = s.sources.find((row) => row.id === IDS.profit);
      assert.equal(money(profit.balance), 800);
    } finally {
      await a.end();
      await b.end();
    }
  });

  await run('pagamentos concorrentes distintos serializam sem lost update', async () => {
    await reset(admin);
    const a = await openClient(uri);
    const b = await openClient(uri);
    try {
      await Promise.all([
        callPayment(a, { key: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', interest: 400 }),
        callPayment(b, { key: 'cccccccc-cccc-cccc-cccc-cccccccccccc', interest: 400 }),
      ]);
      const s = await snapshot(admin);
      assert.equal(s.transactions.length, 2);
      assert.equal(money(s.parcel.paid_total), 800);
      assert.equal(money(s.parcel.interest_remaining), 235);
      const profit = s.sources.find((row) => row.id === IDS.profit);
      assert.equal(money(profit.balance), 800);
    } finally {
      await a.end();
      await b.end();
    }
  });

  await run('cálculo obsoleto é rejeitado depois de concorrência', async () => {
    await reset(admin);
    await callPayment(admin, { key: 'dddddddd-dddd-dddd-dddd-dddddddddddd', interest: 800 });
    await assert.rejects(
      callPayment(admin, { key: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', interest: 500 }),
      /Saldo da parcela foi alterado/,
    );
    const s = await snapshot(admin);
    assert.equal(s.transactions.length, 1);
    assert.equal(money(s.parcel.paid_total), 800);
    assert.equal(money(s.parcel.interest_remaining), 235);
  });

  await run('erro tardio faz rollback de parcela, fonte e transação', async () => {
    await reset(admin);
    await admin.query('alter table public.transacoes add constraint fail_large_payment check (amount < 700)');
    try {
      await assert.rejects(
        callPayment(admin, { key: 'ffffffff-ffff-ffff-ffff-ffffffffffff', interest: 800 }),
        /fail_large_payment/,
      );
      const s = await snapshot(admin);
      assert.equal(s.transactions.length, 0);
      assert.equal(money(s.parcel.paid_total), 0);
      assert.equal(money(s.parcel.interest_remaining), 1035);
      const profit = s.sources.find((row) => row.id === IDS.profit);
      assert.equal(money(profit.balance), 0);
    } finally {
      await admin.query('alter table public.transacoes drop constraint fail_large_payment');
    }
  });

  await run('overpayment por bucket é rejeitado sem mutação', async () => {
    await reset(admin, { principal: 10, interest: 0, late: 0 });
    await assert.rejects(
      callPayment(admin, { key: '12121212-1212-1212-1212-121212121212', principal: 10.01 }),
      /Saldo da parcela foi alterado/,
    );
    const s = await snapshot(admin);
    assert.equal(s.transactions.length, 0);
    assert.equal(money(s.parcel.principal_remaining), 10);
    assert.equal(money(s.parcel.paid_total), 0);
  });

  await run('100 pagamentos concorrentes de principal preservam saldo e ledger', async () => {
    await reset(admin, { principal: 200, interest: 0, late: 0 });
    const clients = await Promise.all(Array.from({ length: 10 }, () => openClient(uri)));
    try {
      await Promise.all(Array.from({ length: 100 }, (_, index) => {
        const client = clients[index % clients.length];
        const suffix = String(index + 1).padStart(12, '0');
        const key = `99999999-9999-4999-8999-${suffix}`;
        return callPayment(client, { key, principal: 1 });
      }));
      const s = await snapshot(admin);
      assert.equal(s.transactions.length, 100);
      assert.equal(money(s.parcel.paid_total), 100);
      assert.equal(money(s.parcel.principal_remaining), 100);
      const capital = s.sources.find((row) => row.id === IDS.source);
      assert.equal(money(capital.balance), 100);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  console.log('Suite PostgreSQL/Testcontainers da RPC real concluída com sucesso.');
} finally {
  await admin.end();
  await container.stop();
}
