import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { formatLiveBrazilianMoney, formatLiveBrazilianCents, backspaceLiveBrazilianCents, resolveLiveBrazilianCentsChange, formatPastedBrazilianMoney, formatLiveBrazilianSignedCents, backspaceLiveBrazilianSignedCents } from '../../features/wallet/utils/liveBrazilianMoneyInput';

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
  assert(cards.includes('resolveLiveBrazilianCentsChange(input.value,cardForm.credit_limit'));
});

test('financial fields start blank and can be cleared without trapping the decimal separator', () => {
  const input = readFileSync('components/forms/FinancialCalculatorInput.tsx', 'utf8');
  const bank = readFileSync('features/wallet/domain/bankAccountDetails.ts', 'utf8');
  const account = readFileSync('components/wallet/CreateAccountModal.tsx', 'utf8');
  assert.match(account, /const \[initialBalance, setInitialBalance\] = useState<string>\(''\)/);
  assert.match(input, /if \(!raw\) \{/);
  assert.match(input, /onCommit\?\.\(''\)/);
  assert.match(input, /if \(Number\(raw\.replace\(',', '\.'\)\) === 0\) return ''/);
  assert.match(input, /focusedInput\.select\(\)/);
  assert.match(input, /const remaining = integerDigits\.slice\(0, -1\)/);
  assert.doesNotMatch(input, /input\.setSelectionRange\(separator, separator\)/);
  assert.match(bank, /Number\(value\[key as keyof BankAccountDetails\]\) === 0 \? ''/);
});

test('digitacao por centavos desloca a virgula e aceita R$ 8,80', () => {
  let display = '';
  for (const [digit, expected] of [
    ['8', '0,08'],
    ['8', '0,88'],
    ['0', '8,80'],
  ] as const) {
    const result = formatLiveBrazilianCents(display + digit);
    assert.ok(result);
    display = result.value;
    assert.equal(display, expected);
    assert.equal(result.caret, display.length);
  }
  assert.equal(parseWalletMoney(display), 8.8);
  assert.deepEqual(formatLiveBrazilianCents('880'), { value: '8,80', caret: 4 });
  assert.deepEqual(formatLiveBrazilianCents('8,80'), { value: '8,80', caret: 4 });
  assert.deepEqual(formatLiveBrazilianCents('1.234,56'), { value: '1.234,56', caret: 8 });
});

test('digitos monetarios podem ser apagados ate limpar o campo', () => {
  const cents = ['8,80', '0,88', '0,08', ''];
  for (let i = 0; i < cents.length - 1; i++) {
    const digits = cents[i].replace(/\D/g, '');
    const remaining = BigInt(digits) / 10n;
    const next = remaining === 0n ? '' : formatLiveBrazilianCents(remaining.toString())?.value;
    assert.equal(next, cents[i + 1]);
  }
  assert.deepEqual(formatLiveBrazilianCents(''), { value: '', caret: 0 });
  assert.equal(formatLiveBrazilianCents('R$ 8,80'), null);
  assert.equal(formatLiveBrazilianCents('12a3'), null);
  assert.equal(formatLiveBrazilianCents('9999999999999999'), null);
});

test('modal de despesa usa centavos e componente compartilhado mantém o modo por padrão', () => {
  const expense = readFileSync('components/wallet/QuickExpenseModal.tsx', 'utf8');
  const calculator = readFileSync('components/forms/FinancialCalculatorInput.tsx', 'utf8');
  assert.match(expense, /<FinancialCalculatorInput required centsEntry/);
  assert.match(calculator, /signed \? formatLiveBrazilianSignedCents\(raw\) : formatLiveBrazilianCents\(raw\)/);
  assert.match(calculator, /!centsEntry && \(e.key === 'Backspace'/);
  assert.match(calculator, /backspaceLiveBrazilianCents\(input\.value\)/);
  assert.match(calculator, /onCommit\?\.\(normalized\)/);
});

test('máscara compartilhada mantém centavos em valores e taxas e limpa com retrocesso', () => {
  const calculator = readFileSync('components/forms/FinancialCalculatorInput.tsx', 'utf8');
  assert.match(calculator, /centsEntry = true/);
  assert.match(calculator, /if \(rate\) \{/);
  assert.match(calculator, /parseWalletRate\(raw, fieldLabel\)/);
  assert.match(calculator, /deleteContentBackward/);
  assert.match(calculator, /backspaceLiveBrazilianCents\(draft\)/);
  assert.deepEqual(backspaceLiveBrazilianCents('8,80'), { value: '0,88', caret: 4 });
  assert.deepEqual(backspaceLiveBrazilianCents('0,88'), { value: '0,08', caret: 4 });
  assert.deepEqual(backspaceLiveBrazilianCents('0,08'), { value: '', caret: 0 });
  assert.deepEqual(backspaceLiveBrazilianCents(''), { value: '', caret: 0 });
  assert.equal(parseWalletMoney('8,80'), 8.8);
});

test('campos controlados movem a virgula e respeitam backspace do teclado Android', () => {
  let text = '';
  for (const [digit, expected] of [['8', '0,08'], ['8', '0,88'], ['0', '8,80']] as const) {
    const next = resolveLiveBrazilianCentsChange(text + digit, text, 'insertText');
    assert.ok(next);
    text = next.value;
    assert.equal(text, expected);
  }
  assert.deepEqual(resolveLiveBrazilianCentsChange('8,8', text, 'deleteContentBackward'), { value: '0,88', caret: 4 });
  assert.deepEqual(resolveLiveBrazilianCentsChange('', text, 'deleteContentBackward'), { value: '', caret: 0 });
  assert.deepEqual(resolveLiveBrazilianCentsChange('1.234,56', '', 'insertFromPaste'), { value: '1.234,56', caret: 8 });
  assert.equal(resolveLiveBrazilianCentsChange('R$ 8,80', '', 'insertFromPaste'), null);
});

test('a mesma regra cobre abertura, fatura, pagamento, despesas e recorrencias', () => {
  for (const path of [
    'components/wallet/CardInitialBalancesModal.tsx',
    'features/wallet/components/CardOpeningFields.tsx',
    'components/wallet/PayInvoiceModal.tsx',
    'components/wallet/InvoiceOverrideModal.tsx',
    'components/wallet/CardInvoiceSummaryPreview.tsx',
  ]) {
    const code = readFileSync(path, 'utf8');
    assert.match(code, /resolveLiveBrazilianCentsChange/, path);
  }
  const quick = readFileSync('features/wallet/components/QuickWalletActionsModal.tsx', 'utf8');
  const obligations = readFileSync('components/wallet/RecurringObligationsPanel.tsx', 'utf8');
  assert.match(quick, /FinancialCalculatorInput required centsEntry/);
  assert.match(quick, /FinancialCalculatorInput centsEntry/);
  assert.match(obligations, /FinancialCalculatorInput className=\{field\} required centsEntry/);
});

test('receitas, saldo real, desconto e cobrança PIX aceitam centavos sem arredondar reais', () => {
  for (const path of [
    'components/wallet/RecurringIncomePanel.tsx',
    'components/wallet/AccountDetailsPage.tsx',
    'components/wallet/CardInvoiceStatement.tsx',
    'components/wallet/WalletPixCharge.tsx',
  ]) {
    const file = readFileSync(path, 'utf8');
    assert.match(file, /resolveLiveBrazilianCentsChange/, path);
  }
  const pix = readFileSync('components/wallet/WalletPixCharge.tsx', 'utf8');
  assert.match(pix, /parseWalletMoney\(normalized\)/);
  assert.doesNotMatch(pix, /Number\(normalized\.replace\(',', '\.'\)\)/);
  assert.equal(parseWalletMoney('1.234,56'), 1234.56);
  assert.equal(formatLiveBrazilianCents('123456')?.value, '1.234,56');
  assert.equal(parseWalletMoney('8,80'), 8.8);
});

test('colagem de numerais preserva reais e centavos sem deslocamento oculto', () => {
  assert.equal(formatPastedBrazilianMoney('700'), '700,00');
  assert.equal(formatPastedBrazilianMoney('1250'), '1.250,00');
  assert.equal(formatPastedBrazilianMoney('8,80'), '8,80');
  assert.equal(formatPastedBrazilianMoney('R$ 1.234,56'), '1.234,56');
  assert.equal(formatPastedBrazilianMoney('4,99', true), '4,99');
  assert.throws(() => formatPastedBrazilianMoney('R$ 8,80 lixo'));
  assert.equal(formatLiveBrazilianCents('880')?.value, '8,80');
});

test('revisão monetária preserva importação e competências locais', () => {
  const cards=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  assert.match(cards, /resolveLiveBrazilianCentsChange\(input.value,cardForm.credit_limit/);
  assert.match(cards, /onPaste=\{e=>/);
  const recurring=readFileSync('components/wallet/RecurringObligationsPanel.tsx','utf8');
  const income=readFileSync('components/wallet/RecurringIncomePanel.tsx','utf8');
  assert.match(recurring, /businessDateInManaus\(\)/);
  assert.match(recurring, /parseWalletMoney\(form.amount/);
  assert.match(income, /businessDateInManaus\(\)/);
  const payment=readFileSync('components/modals/PaymentManagerModal.tsx','utf8');
  assert.match(payment, /resolveLiveBrazilianCentsChange/);
});

test('valores de extrato aceitam centavos e sinais sem coerção pelo input number', () => {
  assert.equal(formatLiveBrazilianSignedCents('-880')?.value, '-8,80');
  assert.equal(formatLiveBrazilianSignedCents('880')?.value, '8,80');
  assert.equal(formatLiveBrazilianSignedCents('-1.234,56')?.value, '-1.234,56');
  assert.equal(backspaceLiveBrazilianSignedCents('-8,80').value, '-0,88');
  assert.equal(backspaceLiveBrazilianSignedCents('-0,08').value, '');
  assert.equal(formatPastedBrazilianMoney('-700', false, true), '-700,00');
  assert.equal(formatPastedBrazilianMoney('-8,80', false, true), '-8,80');
  for (const name of ['WalletStatementImport.tsx', 'FlatSmartStatementReader.tsx']) {
    const source = readFileSync('components/wallet/' + name, 'utf8');
    assert.match(source, /FinancialCalculatorInput signed centsEntry/);
    assert.match(source, /parseWalletSignedMoney\(raw, 'valor do lançamento'\)/);
    assert.doesNotMatch(source, /amount: Number\(e\.target\.value\)/);
  }
});
