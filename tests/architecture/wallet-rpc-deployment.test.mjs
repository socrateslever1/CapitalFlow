import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261104190000_restore_wallet_financial_rpcs_without_loan_regression.sql','utf8');

test('deploys exactly the three RPCs missing from the live database', () => {
  for (const f of [
    'personal_wallet_record_external_transfer(',
    'personal_wallet_create_charge(',
    'personal_wallet_settle_charge(',
  ]) assert.match(migration, new RegExp('create or replace function public\\.'+f.replace('(','\\('),'i'));
  assert.match(migration,/pg_advisory_xact_lock/g);
  assert.match(migration,/for update/gi);
  assert.match(migration,/request_id/g);
});
test('cannot regress existing loan operations or rewrite financial history', () => {
  assert.match(migration,/LOAN_DISBURSEMENT/);
  assert.match(migration,/LOAN_REPAYMENT/);
  assert.doesNotMatch(migration,/drop constraint if exists personal_wallet_account_operations_operation_type_check/i);
  assert.doesNotMatch(migration,/update public\\.personal_wallet_accounts\\s+set balance\\s*=\\s*\d/i);
  assert.doesNotMatch(migration,/update public\\.payment_charges\\s+set\\s+owner_user_id/i);
  assert.doesNotMatch(migration,/drop policy if exists payment_charges_owner_select/i);
});
test('isolates wallet charges from native gateway charges and the legacy ledger', () => {
  assert.match(migration,/provider='STATIC_PIX'/);
  assert.match(migration,/payment_charges_wallet_select/);
  assert.ok(migration.includes('owner_user_id=(SELECT auth.uid())'), 'A política exige titular da sessão.');
  assert.match(migration,/wallet_prevent_static_charge_legacy_credit/);
  assert.ok(migration.includes('from public,anon,authenticated,service_role'), 'Revogação deve cobrir papéis públicos.');
  assert.match(migration,/revoke all on function public\\.personal_wallet_settle_charge[^;]+from public,anon,authenticated,service_role/i);
  assert.match(migration,/grant execute on function public\\.personal_wallet_settle_charge[^;]+to authenticated/i);
});
