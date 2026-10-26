import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .find(name => name.endsWith('_wallet_charge_integration_phase2.sql'));
const walletService = readFileSync('services/personalWallet.service.ts', 'utf8');
const chargeUi = readFileSync('components/wallet/WalletPixCharge.tsx', 'utf8');
const chargePage = readFileSync('features/wallet/pages/WalletChargePage.tsx', 'utf8');

test('migration adds canonical wallet charge metadata and atomic RPCs', () => {
  assert.ok(migrationName, 'Phase 2 migration must exist');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8').toLowerCase();
  for (const required of [
    'owner_user_id', 'account_id', 'description', 'create_request_id',
    'settled_request_id', 'settled_amount', 'settlement_occurred_at', 'charge_id',
    'personal_wallet_create_charge', 'personal_wallet_settle_charge',
    "'static_pix'", "'pending'", "'paid'", "'receipt'",
    'pg_advisory_xact_lock', 'for update', 'is_platform_super_admin',
    'balance=round(balance+v_amount,2)', 'authenticated',
  ]) assert.ok(migration.includes(required), `missing migration contract: ${required}`);
});

test('manual settlement rejects gateways, locks rows and requires exact amount', () => {
  assert.ok(migrationName, 'Phase 2 migration must exist');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8').toLowerCase();
  assert.match(migration, /provider\s*<>\s*'static_pix'/);
  assert.match(migration, /v_charge\.amount\s*<>\s*v_amount/);
  assert.match(migration, /from public\.payment_charges[\s\S]+for update/);
  assert.match(migration, /from public\.personal_wallet_accounts[\s\S]+for update/);
  assert.match(migration, /insert into public\.personal_wallet_account_operations[\s\S]+charge_id/);
  assert.match(migration, /revoke all on function public\.personal_wallet_settle_charge[\s\S]+from public,anon/);
  assert.match(migration, /revoke all on function public\.personal_wallet_create_charge[^;]+from public,anon,authenticated,service_role/);
  assert.match(migration, /revoke all on function public\.personal_wallet_settle_charge[^;]+from public,anon,authenticated,service_role/);
});

test('migration does not rewrite historical gateway charges', () => {
  assert.ok(migrationName, 'Phase 2 migration must exist');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8').toLowerCase();
  assert.doesNotMatch(migration, /update public\.payment_charges\s+set\s+owner_user_id/);
  assert.doesNotMatch(migration, /provider\s+in\s*\(\s*'mercado_pago'/);
});

test('legacy source ledger cannot credit wallet static PIX charges', () => {
  assert.ok(migrationName, 'Phase 2 migration must exist');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8').toLowerCase();
  assert.match(migration, /wallet_prevent_static_charge_legacy_credit/);
  assert.match(migration, /new\.payment_charge_id[\s\S]+provider='static_pix'/);
  assert.match(migration, /before insert or update of payment_charge_id[\s\S]+on public\.transacoes/);
});

test('frontend persists before preview and settles through protected RPCs', () => {
  assert.match(walletService, /rpc\('personal_wallet_create_charge'/);
  assert.match(walletService, /rpc\('personal_wallet_settle_charge'/);
  assert.ok(chargeUi.indexOf('const chargeId = await personalWalletService.createWalletCharge')
    < chargeUi.indexOf('setPreview(buildPersistedPixCharge'));
  assert.match(chargeUi, /Confirmar Recebimento Manual \/ Baixar Cobrança/);
  assert.match(chargeUi, /Confirmar baixa definitiva/);
  assert.match(chargePage, /useWalletSnapshot/);
  assert.match(chargePage, /await refresh\(\)/);
});
