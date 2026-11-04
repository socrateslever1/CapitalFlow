import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { freshCardOpening } from '../../features/wallet/components/CardOpeningFields';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

test('financial entry fields start blank instead of forcing zero text', () => {
  assert.deepEqual(freshCardOpening(), {
    used: '',
    invoice: '',
    future: '',
    futureCount: '',
    invoiceMonth: freshCardOpening().invoiceMonth,
  });

  const createAccount = readFileSync('components/wallet/CreateAccountModal.tsx', 'utf8');
  const cardOpening = readFileSync('components/wallet/CardInitialBalancesModal.tsx', 'utf8');
  const pixDeposit = readFileSync('components/modals/PixDepositModal.tsx', 'utf8');

  assert.match(createAccount, /const \[initialBalance, setInitialBalance\] = useState<string>\(''\)/);
  assert.match(cardOpening, /value !== 0 \? .* : ''/);
  assert.match(pixDeposit, /useState<string>\(""\)/);
  assert.doesNotMatch(pixDeposit, /useState<string>\("10\.00"\)/);
});

test('monetary inputs accept Brazilian grouping and always format two decimals', () => {
  assert.equal(parseWalletMoney('0.000,00'), 0);
  assert.equal(parseWalletMoney('0000,00'), 0);
  assert.equal(parseWalletMoney('1.234,5'), 1234.5);
  assert.equal(formatWalletMoneyInput('0.000,00'), '0,00');
  assert.equal(formatWalletMoneyInput('0000,00'), '0,00');
  assert.equal(formatWalletMoneyInput('1.234,5'), '1.234,50');
  assert.equal(formatWalletMoneyInput(''), '');
});
