import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync('supabase/migrations/20261026170000_wallet_card_opening_balances.sql', 'utf8');
const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
const ui = readFileSync('features/wallet/components/CardOpeningFields.tsx', 'utf8');
const service = readFileSync('services/personalWallet.service.ts', 'utf8');

test('card opening is atomic and uses only existing canonical financial tables', () => {
  assert.doesNotMatch(sql, /CREATE TABLE/i);
  assert.match(sql, /SECURITY INVOKER/g);
  assert.match(sql, /personal_wallet_create_linked_assets/);
  assert.match(sql, /personal_wallet_create_expense/);
  assert.match(sql, /personal_wallet_expense_installments/);
  assert.match(sql, /p_future_months NOT BETWEEN 1 AND 120/);
  assert.match(sql, /Reconciliação da posição inicial falhou/);
  assert.match(sql, /v_total <> p_used_limit/);
});
test('financial writes require authenticated admin and active entitlement', () => {
  assert.match(sql, /auth.uid\(\)/);
  assert.match(sql, /is_platform_super_admin\(\)/);
  assert.match(sql, /modulo_chave = 'carteira' AND m.ativo/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.personal_wallet_create_card_with_opening/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.personal_wallet_initialize_card_opening/);
});
test('replay requests cannot create duplicate card or opening expenses', () => {
  assert.match(sql, /opening_request_id/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_card_opening_request/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /'replayed',true/);
  assert.match(sql, /O cartão já possui histórico/);
});
test('onboarding and empty existing cards share validated opening workflow', () => {
  assert.match(page, /createCompleteCard/);
  assert.match(readFileSync('supabase/migrations/20261030030321_wallet_complete_registration.sql','utf8'),/public.personal_wallet_create_card_with_opening\(p_card,p_existing_account_id,p_opening,p_request_id\)/);
  assert.match(page, /setSimpleCardOpening/);
  assert.match(page, /mayInitializeExisting/);
  assert.match(page, /validateCardOpening/);
  assert.match(page, /CardOpeningFields/);
  assert.match(ui, /Limite usado/);
  assert.match(ui, /Fatura inicial/);
  assert.match(ui, /Situação da fatura/);
  assert.match(ui, /Disponível para gastar/);
  assert.match(ui, /used > limit/);
  assert.match(ui, /invoice \+ future > used/);
  assert.match(service, /personal_wallet_create_card_with_opening/);
  assert.match(service, /personal_wallet_initialize_card_opening/);
});
