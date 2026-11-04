import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261104190000_restore_wallet_financial_rpcs_without_loan_regression.sql','utf8');
const lower = migration.toLowerCase();

test('instala exatamente as três RPCs ausentes', () => {
  for (const fn of [
    'personal_wallet_record_external_transfer',
    'personal_wallet_create_charge',
    'personal_wallet_settle_charge',
  ]) assert.ok(lower.includes('create or replace function public.' + fn + '('), fn);
  assert.ok(lower.includes('pg_advisory_xact_lock'));
  assert.ok(lower.includes('for update'));
  assert.ok(lower.includes('request_id'));
});

test('preserva lançamentos de empréstimo e não reescreve histórico existente', () => {
  assert.ok(migration.includes('LOAN_DISBURSEMENT'));
  assert.ok(migration.includes('LOAN_REPAYMENT'));
  assert.ok(!lower.includes('drop constraint if exists personal_wallet_account_operations_operation_type_check'));
  assert.ok(!lower.includes('drop policy if exists payment_charges_owner_select'));
  assert.ok(!lower.includes('update public.payment_charges\n  set owner_user_id'));
  assert.ok(!lower.includes('delete from public.personal_wallet_'));
});

test('restringe cobranças manuais ao titular e impede crédito no ledger legado', () => {
  assert.ok(migration.includes("provider='STATIC_PIX'"));
  assert.ok(migration.includes('payment_charges_wallet_select'));
  assert.ok(migration.includes('owner_user_id=(SELECT auth.uid())'));
  assert.ok(migration.includes('wallet_prevent_static_charge_legacy_credit'));
  for (const fn of ['personal_wallet_create_charge','personal_wallet_settle_charge','personal_wallet_record_external_transfer']) {
    const revoke = lower.split('\n').find(line=>line.startsWith('revoke all on function public.' + fn + '('));
    const grant = lower.split('\n').find(line=>line.startsWith('grant execute on function public.' + fn + '('));
    assert.ok(revoke?.endsWith(' from public,anon,authenticated,service_role;'), 'revogação: '+fn);
    assert.ok(grant?.endsWith(' to authenticated;'), 'grant: '+fn);
  }
});
