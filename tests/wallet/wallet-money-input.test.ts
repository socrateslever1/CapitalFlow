import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { formatLiveBrazilianMoney } from '../../features/wallet/utils/liveBrazilianMoneyInput';

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
  for (const invalid of ['', '495,611', '495.6111', '-1', 'R$ 10', '1.2.3', '10000000000']) {
    assert.throws(() => parseWalletMoney(invalid), { name: 'Error' }, invalid);
  }
});
test('create/edit card form uses validated centavos rather than native integer stepping', () => {
  const cards = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const edit = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');
  assert(cards.includes('parseWalletMoney(cardForm.credit_limit'));
  assert(cards.includes('<input name="wallet-card-credit-limit" autoComplete="off" inputMode="decimal" placeholder="Pode informar ou importar pela fatura depois"'));
  assert(edit.includes("parseWalletMoney(form.credit_limit"));
  assert(edit.includes('FinancialCalculatorInput'));
  assert(edit.includes('fieldLabel="limite de crédito"'));
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
  assert(source.includes("dismissReleaseNotice('android-install', __CAPITALFLOW_BUILD_ID__)"));
  assert(!source.includes('sessionStorage'), 'session-scoped preferences must not reshow the popup');
  assert(header.includes('<AndroidApkNotice placement="notifications" />'));
  assert(!shell.includes('<AndroidApkNotice placement="banner" />'));
});

test('digits advance reais without moving the fixed decimal or thousands separators', () => {
  let value = '';
  let caret = 0;
  for (const [digit, expected] of [
    ['1', '1,00'], ['0', '10,00'], ['0', '100,00'],
    ['0', '1.000,00'], ['0', '10.000,00'], ['0', '100.000,00'],
  ] as const) {
    const next = formatLiveBrazilianMoney(value.slice(0, caret) + digit + value.slice(caret), caret + 1);
    assert.ok(next, 'mask should accept a new digit');
    ({ value, caret } = next);
    assert.equal(value, expected);
    assert.equal(caret, value.indexOf(','));
  }
  assert.equal(parseWalletMoney(value), 100000);
});

test('manual cents and pasted Brazilian values preserve both centavos and caret', () => {
  assert.deepEqual(formatLiveBrazilianMoney('1.234,56', 8), { value: '1.234,56', caret: 8 });
  assert.deepEqual(formatLiveBrazilianMoney('1234,5', 6), { value: '1.234,50', caret: 7 });
  assert.deepEqual(formatLiveBrazilianMoney('0001,50', 4), { value: '1,50', caret: 1 });
  assert.deepEqual(formatLiveBrazilianMoney('', 0), { value: '', caret: 0 });
  for (const ambiguous of ['1,234', '123.45', '1,,00', 'R$ 1', '1.2.3']) {
    assert.equal(formatLiveBrazilianMoney(ambiguous, ambiguous.length), null, ambiguous);
  }
});

test('calculator UI has one unobtrusive operator control per field and no duplicate fx badge', () => {
  const input = readFileSync('components/forms/FinancialCalculatorInput.tsx', 'utf8');
  const expense = readFileSync('components/wallet/QuickExpenseModal.tsx', 'utf8');
  assert(input.includes('formatLiveBrazilianMoney(raw, input.selectionStart'));
  assert(input.includes('aria-label="Operadores de cálculo"'));
  assert(!input.includes('>ƒx</button>'));
  assert(!expense.includes('>fx</span>'));
  assert.equal((expense.match(/<FinancialCalculatorInput/g) || []).length, 1);
  const cards = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  assert(cards.includes('formatLiveBrazilianMoney(input.value,input.selectionStart'));
});
