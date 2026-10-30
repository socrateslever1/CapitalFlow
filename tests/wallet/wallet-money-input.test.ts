import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

test('wallet amounts accept Brazilian decimal comma, dot and grouped thousands', () => {
  assert.equal(parseWalletMoney('495,61'), 495.61);
  assert.equal(parseWalletMoney('495.61'), 495.61);
  assert.equal(parseWalletMoney('1.495,61'), 1495.61);
  assert.equal(parseWalletMoney('1.495'), 1495);
  assert.equal(parseWalletMoney('0,01'), 0.01);
  assert.equal(parseWalletMoney('0'), 0);
});
test('wallet amounts never silently round more than two decimal digits', () => {
  for (const invalid of ['', '495,611', '495.611', '-1', 'R$ 10', '1.2.3', '10000000000']) {
    assert.throws(() => parseWalletMoney(invalid), { name: 'Error' }, invalid);
  }
});
test('create/edit card form uses validated centavos rather than native integer stepping', () => {
  const cards = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const edit = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');
  assert(cards.includes('parseWalletMoney(cardForm.credit_limit'));
  assert(cards.includes("field === 'credit_limit' ? 'decimal'"));
  assert(edit.includes("parseWalletMoney(form.credit_limit"));
  assert(edit.includes('type="text" inputMode="decimal"'));
});
test('mobile browser offers the signed APK directly, native app never prompts itself', () => {
  const source = readFileSync('components/system/AndroidApkNotice.tsx', 'utf8');
  const header = readFileSync('layout/HeaderBar.tsx', 'utf8');
  const shell = readFileSync('layout/AppShell.tsx', 'utf8');
  assert(source.includes('/releases/download/android-signed-beta/CapitalFlow-Android.apk'));
  assert(source.includes('isNativePlatform'));
  assert(source.includes('sessionStorage'));
  assert(header.includes('<AndroidApkNotice placement="notifications" />'));
  assert(shell.includes('<AndroidApkNotice placement="banner" />'));
});
