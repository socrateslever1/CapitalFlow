import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney, parseWalletSignedMoney, tryParseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

test('wallet amounts accept Brazilian decimal comma, dot and grouped thousands', () => {
  assert.equal(parseWalletMoney('495,61'), 495.61);
  assert.equal(parseWalletMoney('495.61'), 495.61);
  assert.equal(parseWalletMoney('1.495,61'), 1495.61);
  assert.equal(parseWalletMoney('1.495'), 1495);
  assert.equal(parseWalletMoney('495.611'), 495611); // ponto como milhar brasileiro
  assert.equal(parseWalletMoney('0,01'), 0.01);
  assert.equal(parseWalletMoney('0'), 0);
});
test('wallet amounts never silently round more than two decimal digits', () => {
  for (const invalid of ['', '495,611', '495.6111', '-1', 'R$ abc', '1.2.3', '10000000000']) {
    assert.throws(() => parseWalletMoney(invalid), { name: 'Error' }, invalid);
  }
});
test('create/edit card form uses validated centavos rather than native integer stepping', () => {
  const cards = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const edit = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');
  assert(cards.includes('parseWalletMoney(cardForm.credit_limit'));
  assert(cards.includes('<input name="wallet-card-credit-limit" autoComplete="off" inputMode="decimal" placeholder="Pode informar ou importar pela fatura depois"'));
  assert(edit.includes("parseWalletMoney(form.credit_limit"));
  assert(edit.includes('type="text" inputMode="decimal"'));
});
test('mobile browser offers the signed APK directly, native app never prompts itself', () => {
  const source = readFileSync('components/system/AndroidApkNotice.tsx', 'utf8');
  const header = readFileSync('layout/HeaderBar.tsx', 'utf8');
  const shell = readFileSync('layout/AppShell.tsx', 'utf8');
  assert(source.includes("ANDROID_APK_DOWNLOAD_URL = '/api/android/apk'"));
  assert(source.includes('download="CapitalFlow-Android.apk"'));
  assert(!source.includes('target="_blank"'),'web must not navigate away to download APK');
  const proxy = readFileSync('functions/api/android/apk.ts','utf8');
  assert(proxy.includes('/releases/download/android-signed-beta/CapitalFlow-Android.apk'));
  assert(proxy.includes("'Content-Disposition': 'attachment; filename=\"CapitalFlow-Android.apk\"'"));
  assert(proxy.includes("new Response(bounded"));
  assert(proxy.includes("final.hostname.endsWith('.githubusercontent.com')"));
  assert(source.includes('isNativePlatform'));
  assert(source.includes('sessionStorage'));
  assert(header.includes('<AndroidApkNotice placement="notifications" />'));
  assert(shell.includes('<AndroidApkNotice placement="banner" />'));
});

test('wallet parses Brazilian bank values and explicit centavos without premature zeroes', () => {
  const samples: Array<[string, number]> = [
    ['0000,00', 0], ['0.000,00', 0], ['00.000.00', 0],
    ['1.234,56', 1234.56], ['001234,56', 1234.56],
    ['1.234.56', 1234.56], ['12.345.67', 12345.67],
    ['R$ 1.234,56', 1234.56], ['R$ 1.234,56', 1234.56],
    ['1,234.56', 1234.56], ['1.234.567,89', 1234567.89],
    ['1.234.567', 1234567], ['0,09', 0.09],
    ['1.234,5', 1234.5], ['1.234.5', 1234.5],
  ];
  for (const [input, expected] of samples) {
    assert.equal(parseWalletMoney(input), expected, input);
  }
  assert.equal(parseWalletSignedMoney('-1.234,56'), -1234.56);
  assert.equal(parseWalletSignedMoney('-R$ 1.234,56'), -1234.56);
});
test('wallet rejects malformed groups, excessive decimals and incomplete input', () => {
  for (const invalid of ['', ',', '.', '1,', '1.', '-1,00', '1e3',
    '1.2.3', '1.23,456', '1.234.56.7', '00.00.000', '1 2a,00', '1.2345']) {
    assert.equal(tryParseWalletMoney(invalid), null, invalid);
  }
});
test('wallet payment, receipt, statement and Pix dialogs use centralized currency parser', () => {
  for (const path of [
    'components/wallet/PayInvoiceModal.tsx',
    'components/wallet/AccountMovementModal.tsx',
    'components/wallet/AccountActivityPanel.tsx',
    'components/wallet/WalletPixCharge.tsx',
    'features/wallet/components/QuickWalletActionsModal.tsx',
    'components/wallet/WalletStatementImport.tsx',
    'components/wallet/FlatSmartStatementReader.tsx',
  ]) {
    const content = readFileSync(path,'utf8');
    assert.match(content, /tryParseWallet(?:Signed)?Money/);
  }
  for (const path of [
    'components/wallet/WalletStatementImport.tsx',
    'components/wallet/FlatSmartStatementReader.tsx',
  ]) {
    const content = readFileSync(path,'utf8');
    assert.match(content, /rowAmountDrafts/);
    assert.match(content, /inputMode="decimal"/);
    assert.doesNotMatch(content, /amount: Number\(e\.target\.value\)/);
  }
});
