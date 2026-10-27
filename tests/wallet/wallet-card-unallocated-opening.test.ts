import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync('supabase/migrations/20261026235000_wallet_card_unallocated_opening.sql', 'utf8');

test('card opening keeps unknown future commitments on the canonical card without fake installments', () => {
  assert.match(sql, /opening_unallocated_amount/);
  assert.match(sql, /p_future_months = 0/);
  assert.match(sql, /personal_wallet_reconcile_card_opening/);
  assert.match(sql, /opening_reconciliation_requests/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.personal_wallet_reconcile_card_opening[\s\S]*TO authenticated/);
});
