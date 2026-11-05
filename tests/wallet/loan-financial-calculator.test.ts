import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';

test('principal, custos e juros calculam expressões sem arredondamento prematuro', () => {
  const examples: Array<[string, number]> = [
    ['700+200', 900],
    ['700+4,99%', 734.93],
    ['700-4,99%', 665.07],
    ['700×2', 1400],
    ['700÷2', 350],
    ['(700+200)*2', 1800],
    ['0,1+0,2', 0.3],
  ];
  for (const [input, expected] of examples) assert.equal(parseWalletMoney(input), expected);
  assert.equal(parseWalletRate('4,999999'), 4.999999);
  assert.equal(parseWalletSignedMoney('100-150'), -50);
  assert.equal(parseWalletSignedMoney('-200+50'), -150);
  assert.equal(parseWalletRate('700+4,99%'), 734.93);
  assert.throws(() => parseWalletMoney('1/0'));
  assert.throws(() => parseWalletRate('2**8'));
  assert.throws(() => parseWalletMoney('100+'));
  assert.throws(() => parseWalletMoney('495,611'));
});

test('calculadora inserida em todos os campos monetários principais do contrato', () => {
  const section = readFileSync('components/forms/LoanFormFinancialSection.tsx', 'utf8');
  const card = readFileSync('components/forms/LoanFundingCostFields.tsx', 'utf8');
  const preview = readFileSync('components/forms/LoanFormFinancialSection.preview.tsx', 'utf8');
  const inputs = readFileSync('components/forms/FinancialCalculatorInput.tsx', 'utf8');
  assert.match(section, /FinancialCalculatorInput required type="text" min="0.01" step="0.01" value=\{formData.principal/);
  assert.match(section, /FinancialCalculatorInput rate required type="text" step="0.01" value=\{formData.interestRate/);
  assert.match(section, /FinancialCalculatorInput rate type="text" step="0.1" value=\{formData.finePercent/);
  assert.match(section, /FinancialCalculatorInput rate type="text" step="0.1" value=\{formData.dailyInterestPercent/);
  assert.match(section, /FinancialCalculatorInput rate type="text"[^>]*value=\{formData.fundingMonthlyRate/);
  assert.match(section, /FinancialCalculatorInput type="text"[^>]*value=\{formData.fundingInstallmentValue/);
  assert.match(section, /FinancialCalculatorInput type="text"[^>]*value=\{formData.fundingTotalPayable/);
  assert.match(section, /FinancialCalculatorInput rate type="text"[^>]*value=\{formData.customerMarginPercent/);
  assert.equal((card.match(/<FinancialCalculatorInput/g) || []).length, 3);
  assert.match(preview, /<FinancialCalculatorInput/);
  assert.match(inputs, /setCustomValidity/);
  assert.match(inputs, /onBlur=\{commit\}/);
  assert.match(inputs, /onChange\?\.\(\{ target: \{ value: normalized \} \}\)/);
  assert.match(inputs, /Operadores matemáticos/);
  assert.match(section, /Definir parcela do cliente \(R\$\)/);
  assert.match(section, /<FinancialCalculatorInput\s+type="text"\s+placeholder="Ex\.: 150,00"/);
});

test('correção de saldo real é verificada no banco, sem fabricar histórico financeiro', () => {
  const sourcePage = readFileSync('pages/SourcesPage.tsx', 'utf8');
  const controller = readFileSync('hooks/controllers/useSourceController.ts', 'utf8');
  assert.match(sourcePage, /<FinancialCalculatorInput[\s\S]*?fieldLabel="saldo real"/);
  assert.match(sourcePage, /saldo real da fonte/);
  assert.match(sourcePage, /signed/);
  assert.match(controller, /select\('id,balance'\)/);
  assert.match(controller, /maybeSingle\(\)/);
  assert.match(controller, /updated\.balance/);
  assert.doesNotMatch(controller, /delete from.*ledger/i);
});
