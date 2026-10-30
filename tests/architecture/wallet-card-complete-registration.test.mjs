import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync('supabase/migrations/20261030171500_wallet_create_complete_card_rpc.sql','utf8');
const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
const form = page.slice(page.indexOf('{creating && <Modal'),page.indexOf('{mayInitializeExisting &&'));
const service = readFileSync('services/personalWallet.service.ts','utf8');

test('complete-card RPC is atomic, invoker-restricted, and uses existing financial operations',()=>{
  assert.match(migration,/function public\.personal_wallet_create_complete_card\(/i);
  assert.match(migration,/security invoker/i);
  assert.match(migration,/personal_wallet_create_card_with_opening\(/);
  assert.match(migration,/grant execute on function public\.personal_wallet_create_complete_card[\s\S]+to authenticated/i);
  assert.match(migration,/revoke all on function public\.personal_wallet_create_complete_card[\s\S]+from public, anon/i);
  assert.match(migration,/p_envelope is not null/);
  assert.match(migration,/securityCode/);
  assert.match(migration,/replayed/);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.personal_wallet_cards/i);
  assert.doesNotMatch(migration,/security definer/i);
  assert.match(service,/supabase\.rpc\('personal_wallet_create_complete_card'/);
});
test('new card form is minimal, optional financial values do not require a password or CVV',()=>{
  assert.ok(form.length>1000,'Card creation modal must be present');
  assert.match(form,/Banco ou instituição/);
  assert.match(form,/Apenas o banco é obrigatório/);
  assert.match(form,/Mais informações \(opcional\)/);
  assert.match(form,/CardOpeningFields collapsible/);
  assert.doesNotMatch(form,/type="password"|minLength=\{12\}|CardProtectedFields|confirmar senha/i);
  assert.doesNotMatch(form,/required=\{field !==/);
  assert.match(page,/cardForm\.due_day \? Number\(cardForm\.due_day\) : null/);
  assert.match(page,/cardForm\.closing_day \? Number\(cardForm\.closing_day\) : null/);
});
test('network-uncertain registration retries the same request and does not misreport a completed registration',()=>{
  assert.match(page,/cardRegistrationAttempt\.current\.begin\(candidate\)/);
  assert.match(page,/cardRegistrationAttempt\.current\.confirmed\(\)/);
  assert.match(page,/cardRegistrationAttempt\.current\.failed\(cause\)/);
  assert.match(page,/Cartão salvo no banco, mas a lista não foi atualizada/);
  assert.match(page,/last_four:e\.target\.value\.replace\(\/\\D\/g/);
});
