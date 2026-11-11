import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';
import { buildSourceReferenceDisplay } from '../../domain/sources/sourceReferenceDisplay';
import { formatLiveBrazilianCents } from '../../features/wallet/utils/liveBrazilianMoneyInput';

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

test('contrato permite digitação centesimal em todos os campos monetários e percentuais', () => {
  const sources = [
    'components/forms/LoanFormFinancialSection.tsx',
    'components/forms/LoanFundingCostFields.tsx',
    'components/forms/LoanFormFinancialSection.preview.tsx',
  ];
  for (const path of sources) {
    const code = readFileSync(path, 'utf8');
    const inputs = code.match(/<FinancialCalculatorInput\b[\s\S]*?\/>/g) || [];
    assert.ok(inputs.length > 0, path);
    for (const input of inputs) assert.match(input, /\bcentsEntry\b/, path);
  }
  for (const [digits, expected] of [
    ['1', '0,01'], ['8', '0,08'], ['880', '8,80'],
    ['70025', '700,25'], ['1250', '12,50'],
    ['499', '4,99'],
  ]) {
    assert.equal(formatLiveBrazilianCents(digits)?.value, expected);
  }
  assert.equal(parseWalletMoney('700,25'), 700.25);
  assert.equal(parseWalletRate('8,80'), 8.8);
  assert.equal(parseWalletRate('4,99'), 4.99);
});

test('fontes com cartão exibem crédito real sem reclassificar saldo contábil', () => {
  const section = readFileSync('components/forms/LoanFormFinancialSection.tsx', 'utf8');
  assert.match(section, /can_manage_capital_source_wallet_origins/);
  assert.match(section, /capital_source_wallet_references/);
  assert.match(section, /\.in\('source_id', ids\)/);
  assert.match(section, /personalWalletService\.loadOverview\(\)/);
  assert.match(section, /buildSourceReferenceDisplay/);
  assert.match(section, /Crédito disponível no cartão vinculado/);
  assert.match(section, /Saldo operacional da fonte/);
  assert.match(section, /não debita automaticamente o limite bancário/);
  const source = { balance: 0 };
  const cards = [{ id: 'card-nu', nickname: 'Nu', status: 'ACTIVE', available_limit: 6982.5 }];
  const display = buildSourceReferenceDisplay(
    [{ source_id: 'fonte-nu', target_kind: 'CARD', target_id: 'card-nu', allocated_amount: null }],
    [], cards,
  );
  assert.equal(display?.entries[0]?.available, 6982.5);
  assert.equal(display?.total, 6982.5);
  assert.equal(source.balance, 0, 'crédito não modifica o caixa da fonte');
  assert.equal(buildSourceReferenceDisplay(
    [{ source_id: 'fonte-nu', target_kind: 'CARD', target_id: 'card-nu', allocated_amount: null }],
    [], [],
  )?.total, null, 'cartão ausente não pode ser tratado como crédito zero');
});
