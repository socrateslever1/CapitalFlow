import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations').find(name => name.endsWith('_wallet_credit_separation_phase3.sql'));

test('phase 3 migration keeps overrides in the canonical expense domain', () => {
  assert.ok(migrationName, 'phase 3 migration is missing');
  const sql = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
  assert.match(sql, /alter table public\.personal_wallet_expenses/i);
  assert.match(sql, /INVOICE_OVERRIDE/);
  assert.match(sql, /invoice_due_month/i);
  assert.match(sql, /request_id/i);
  assert.doesNotMatch(sql, /create table/i);
});

test('override RPC is locked, owner-scoped, idempotent and least-privileged', () => {
  assert.ok(migrationName, 'phase 3 migration is missing');
  const sql = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
  assert.match(sql, /personal_wallet_set_monthly_invoice_override\s*\(/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /owner_user_id\s*=\s*v_user/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(sql, /revoke all on function public\.personal_wallet_set_monthly_invoice_override[\s\S]*from public,\s*anon,\s*authenticated,\s*service_role/i);
  assert.match(sql, /grant execute on function public\.personal_wallet_set_monthly_invoice_override[\s\S]*to authenticated/i);
});

test('payment and mutations use effective override math without replacing legacy RPC names', () => {
  assert.ok(migrationName, 'phase 3 migration is missing');
  const sql = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
  assert.match(sql, /personal_wallet_update_expense_idempotent/i);
  assert.match(sql, /personal_wallet_cancel_expense_idempotent/i);
  assert.match(sql, /personal_wallet_pay_invoice_partial/i);
  assert.match(sql, /entry_type\s*=\s*'INVOICE_OVERRIDE'/i);
  assert.match(sql, /personal_wallet_invoice_payments/i);
});

