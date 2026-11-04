import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { calculateCardOpening, calculateUsedFromAvailable } from '../../components/wallet/cardOpeningSummary';
import { validateCardOpening } from '../../features/wallet/components/CardOpeningFields';

const sql = readFileSync('supabase/migrations/20261030193000_wallet_allow_overlimit_opening.sql', 'utf8');
const modal = readFileSync('components/wallet/CardInitialBalancesModal.tsx', 'utf8');

test('cartão com limite excedido conserva centavos sem gerar crédito negativo para compras', () => {
  const result = calculateCardOpening(10000, 10663.38, 2517.55);
  assert.deepEqual(result, { available: 0, overLimit: 663.38, other: 8145.83, unallocated: 8145.83 });
  assert.equal(calculateCardOpening(10000, 10000, 0).available, 0);
  assert.equal(calculateCardOpening(10000, 9999.99, 0).available, 0.01);
});
test('a fatura precisa caber no limite usado e os números precisam ser válidos', () => {
  assert.throws(() => calculateCardOpening(10000, 100, 101), /fatura/);
  assert.throws(() => calculateCardOpening(10000, Number.NaN, 1), /até duas casas/);
  assert.throws(() => calculateCardOpening(10000, 100.001, 1), /até duas casas/);
});
test('cadastro inicial aceita valores bancários acima do limite sem inventar gastos', () => {
  const result = validateCardOpening({
    used: '10663,38', invoice: '2517,55', future: '8145,83',
    futureCount: '0', invoiceMonth: '2026-10', invoiceState: 'CLOSED',
  }, 10000);
  assert.equal(result.used_limit, 10663.38);
  assert.equal(result.future_amount, 8145.83);
  assert.equal(result.invoice_amount, 2517.55);
});
test('modal tem só um cancelar, mostra excesso e impede precisão flutuante no formulário', () => {
  assert.match(modal, /footer=\{/);
  assert.doesNotMatch(modal, />\s*Cancelar\s*</);
  assert.match(modal, /Limite excedido/);
  assert.match(modal, /Math\.round\(Number\(card\.used_limit \|\| 0\) \* 100\)/);
  assert.match(modal, /parseWalletMoney\(\s*used/);
  assert.doesNotMatch(modal, /min="0"[^>]*value=\{available\}/);
});
test('migração preserva RPCs canônicas e permite o excedente apenas na abertura', () => {
  assert.match(sql, /public\.personal_wallet_set_card_opening_summary/);
  assert.match(sql, /public\.personal_wallet_set_card_initial_balances/);
  assert.match(sql, /public\.personal_wallet_create_card_with_opening/);
  assert.match(sql, /public\.personal_wallet_update_card_metadata/);
  assert.doesNotMatch(sql, /p_used_limit\s*>\s*p_credit_limit/);
  assert.doesNotMatch(sql, /v_invoice\s*\+\s*v_future\s*>\s*v_limit/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /opening_summary_requests/);
  assert.match(sql, /is_platform_super_admin/);
  assert.match(sql, /private\.wallet_recalculate_card_position/);
});

test('limite usado é calculado pelo disponível bancário, sem supor que a fatura seja o total usado', () => {
  assert.equal(calculateUsedFromAvailable(6991.30, 3720.90), 3270.40);
  const used = calculateUsedFromAvailable(6991.30, 2180.35);
  assert.equal(used, 4810.95);
  assert.deepEqual(calculateCardOpening(6991.30, used, 3270.40), {
    available: 2180.35, overLimit: 0, other: 1540.55, unallocated: 1540.55,
  });
  assert.equal(calculateUsedFromAvailable(6991.30, 0), 6991.30);
  assert.equal(calculateUsedFromAvailable(6991.30, 6991.30), 0);
});

test('validação não ajusta silenciosamente o disponível informado pelo banco', () => {
  assert.throws(() => calculateUsedFromAvailable(6991.30, 6991.31), /não pode superar/);
  assert.throws(() => calculateUsedFromAvailable(100, -0.01), /valores|limites/);
  assert.throws(() => calculateUsedFromAvailable(100, Number.NaN), /valores|limites/);
  assert.throws(() => calculateUsedFromAvailable(100, 1.001), /duas casas/);
  assert.throws(() => validateCardOpening({
    used: '3.270,40', available: '7.000,00', invoice: '3.270,40',
    future: '', futureCount: '', invoiceMonth: '2026-11',
  }, 6991.30), /não pode superar/);
});

test('cadastro do cartão utiliza o disponível declarado como fonte de cálculo', () => {
  const result = validateCardOpening({
    used: '3.270,40', available: '2.180,35', invoice: '3.270,40',
    future: '', futureCount: '', invoiceMonth: '2026-11',
  }, 6991.30);
  assert.equal(result.used_limit, 4810.95);
  assert.equal(result.invoice_amount, 3270.40);
  assert.equal(result.future_amount, 1540.55);
  assert.throws(() => validateCardOpening({
    used: '', available: '4.000,00', invoice: '3.270,40',
    future: '', futureCount: '', invoiceMonth: '2026-11',
  }, 6991.30), /fatura/);
});

test('situação inicial distingue o disponível do banco da fatura e preserva os compromissos', () => {
  const opening = readFileSync('features/wallet/components/CardOpeningFields.tsx', 'utf8');
  const summary = readFileSync('components/wallet/cardOpeningSummary.ts', 'utf8');
  assert.match(modal, /name="wallet-card-available-limit"/);
  assert.match(modal, /value={available}/);
  assert.match(modal, /calculateUsedFromAvailable\(creditLimit, parseWalletMoney\(available/);
  assert.match(modal, /positionSource !== 'INVOICE'/);
  assert.match(modal, /Math\.round\(usedLimit \* 100\) < Math\.round\(currentInvoice \* 100\) \+ futureCents/);
  assert.match(opening, /name="wallet-card-available-limit-new"/);
  assert.match(opening, /calculateUsedFromAvailable\(/);
  assert.match(opening, /available: ''/);
  assert.match(summary, /Math\.round\(available \* 100\)/);
});
