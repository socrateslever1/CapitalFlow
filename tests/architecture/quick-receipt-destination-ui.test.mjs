import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('quick receipt offers optional destination and confirms actual account before submission', () => {
  const grid = read('components/cards/components/InstallmentGrid.tsx');
  assert.match(grid, /platformAdminService\.isSuperAdmin\(\)/);
  assert.match(grid, /walletRepository\.loadOverview\(\)/);
  assert.match(grid, /Conta que recebeu o pagamento \(opcional\)/);
  assert.match(grid, /Fonte de destino para recebimento \(opcional\)/);
  assert.match(grid, /Padrão · retorno às fontes originais/);
  assert.match(grid, /Padrão · devolver às fontes originais/);
  assert.match(grid, /receiptDestinationAccountId: walletReceiptAllowed/);
  assert.match(grid, /walletReceiptAccounts\.some\(account => account\.id === receiptDestinationAccountId\)/);
  assert.match(grid, /Destino do recebimento/);
  assert.match(grid, /Valor integral na conta:/);
  assert.match(grid, /\[selectedInst\?\.id, receiptAmount, paymentDateStr, quickMode, lateFeeForgiven, businessAction, receiptDestinationAccountId\]/);
  assert.doesNotMatch(grid, /required\s+value=\{receiptDestinationAccountId\}/);
});

test('payment destination propagates unchanged through typed quick-payment contract and dashboard', () => {
  const model = read('components/cards/components/InstallmentReceiptModel.ts');
  const dashboard = read('containers/DashboardContainer.tsx');
  const service = read('services/payments.service.ts');
  const engine = read('services/payments/paymentEngineV4.ts');
  assert.match(model, /receiptDestinationAccountId\?: string \| null/);
  assert.match(model, /receiptDestinationSourceId\?: string \| null/);
  assert.match(dashboard, /receiptDestinationAccountId: options\?\.receiptDestinationAccountId \|\| null/);
  assert.match(dashboard, /receiptDestinationSourceId: options\?\.receiptDestinationSourceId \|\| null/);
  assert.match(service, /receiptDestinationAccountId,/);
  assert.match(service, /receiptDestinationSourceId,/);
  assert.match(engine, /personal_wallet_set_receipt_destination/);
  assert.match(engine, /p_destination_source_id/);
  assert.match(dashboard, /capitalflow:wallet-updated/);
});

test('withdrawal and account access remain optional and master-gated', () => {
  const withdraw = read('components/modals/ModalGroups.tsx');
  const ctrl = read('hooks/controllers/useSourceController.ts');
  assert.match(withdraw, /Enviar para conta da Minha Carteira \(opcional\)/);
  assert.match(withdraw, /Padrão · não enviar para conta/);
  assert.match(withdraw, /platformAdminService\.isSuperAdmin\(\)/);
  assert.match(ctrl, /withdraw_profit_to_wallet_atomic/);
  assert.match(ctrl, /withdraw_profit_atomic_v2/);
});

test('zero card operator fees are optional in the production contract form', () => {
  const fields = read('components/forms/LoanFundingCostFields.tsx');
  const validator = read('features/loans/domain/loanForm.validators.ts');
  assert.match(fields, /Custo da operação \(R\$\) · opcional/);
  assert.doesNotMatch(fields, /required=\{required\}/);
  assert.doesNotMatch(validator, /Informe o custo do cartão/);
});

test('quick receipt uses cents mask in all monetary entries, without changing destination routing', () => {
  const screen=read('components/cards/components/InstallmentGrid.tsx');
  const input=read('components/forms/BrazilianCentsInput.tsx');
  assert.equal((screen.match(/<BrazilianCentsInput/g)||[]).length,3);
  assert.match(screen,/setReceiptAmount\(nextAmount\)/);
  assert.match(screen,/calculateReceiptForTargetBalance\(totalAmount, Number\(nextTarget\)\)/);
  assert.match(screen,/calculatePrincipalReductionForTarget\(principal, Number\(nextTarget\)\)/);
  assert.match(input,/resolveLiveBrazilianCentsChange/);
  assert.match(input,/formatPastedBrazilianMoney/);
  assert.match(screen,/receiptDestinationAccountId: walletReceiptAllowed/);
  assert.match(screen,/receiptDestinationSourceId: receiptDestinationSourceId \|\| null/);
});
