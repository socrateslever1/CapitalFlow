import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { formatCardSummaryForClipboard } from '../../utils/cardClipboard';

const editor = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');
const cardStack = readFileSync('components/wallet/BankStack.tsx', 'utf8');
const service = readFileSync('services/personalWallet.service.ts', 'utf8');
const migrations = readdirSync('supabase/migrations')
  .filter(file => file.endsWith('.sql'))
  .map(file => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n');

test('o editor persiste identificação segura do cartão no schema canônico', () => {
  for (const field of ['last_four', 'cardholder_name', 'expiry_month', 'expiry_year']) {
    assert.match(editor, new RegExp(field));
    assert.match(service, new RegExp(field));
  }
  assert.match(service, /p_last_four/);
  assert.match(service, /p_cardholder_name/);
  assert.match(service, /p_expiry_month/);
  assert.match(service, /p_expiry_year/);
});

test('a migration adiciona os dados seguros e não cria armazenamento de CVC', () => {
  assert.match(migrations, /add column if not exists cardholder_name text/i);
  assert.match(migrations, /add column if not exists expiry_month smallint/i);
  assert.match(migrations, /add column if not exists expiry_year smallint/i);
  assert.doesNotMatch(migrations, /add column if not exists (?:cvc|cvv)/i);
});

test('a visualização usa titular e validade persistidos e abre dados completos somente pelo cofre', () => {
  assert.match(cardStack, /selected\.cardholder_name/);
  assert.match(cardStack, /selected\.expiry_month/);
  assert.match(cardStack, /selected\.expiry_year/);
  assert.match(editor, /CardVaultModal/);
  assert.match(editor, /Número e CVC são guardados criptografados/);
  assert.doesNotMatch(service, /p_(?:cvc|cvv)/i);
});

test('a cópia contém identificação do cartão e não inclui limite ou fatura', () => {
  const summary = formatCardSummaryForClipboard({
    nickname: 'PicPay', issuer: 'PicPay', brand: 'Mastercard', last_four: '4101',
    cardholder_name: 'MANOEL SOCRATES', expiry_month: 2, expiry_year: 2031,
    credit_limit: 8176, used_limit: 0, available_limit: 8176,
    closing_day: 4, due_day: 10,
  } as never);

  assert.match(summary, /Número: •••• •••• •••• 4101/);
  assert.match(summary, /Titular: MANOEL SOCRATES/);
  assert.match(summary, /Validade: 02\/31/);
  assert.doesNotMatch(summary, /Limite|Fatura|Fechamento|Vencimento/i);
  assert.doesNotMatch(summary, /CVC|CVV/i);
});
