import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatementOfx, parseSmartFinancialDocument } from '../../utils/statementSmartReader';
import { formatCardSummaryForClipboard, copyCardDataToClipboard, copyCardFieldToClipboard, copyCardLastFourToClipboard } from '../../utils/cardClipboard';
import type { PersonalWalletCard } from '../../services/personalWallet.service';

test('OFX Parser - extrai transações bancárias e de cartão com custo R$ 0,00', async () => {
  const sampleOfxContent = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0<SEVERITY>INFO</STATUS>
      <DTSERVER>20261025120000[-03:EST]
      <LANGUAGE>POR
      <FI><ORG>Nubank<FID>260</FI>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20261020120000
            <TRNAMT>-45.90
            <FITID>nubank-tx-001
            <NAME>UBER TRIP SAO PAULO
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20261021120000
            <TRNAMT>-180.50
            <FITID>nubank-tx-002
            <NAME>SUPERMERCADO PAO DE ACUCAR
            <MEMO>COMPRA 01/03
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20261022120000
            <TRNAMT>3500.00
            <FITID>nubank-tx-003
            <NAME>SALARIO EMPRESA XYZ
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;

  const dummyFile = {
    name: 'extrato_nubank.ofx',
    type: 'application/x-ofx',
    text: async () => sampleOfxContent,
    arrayBuffer: async () => Buffer.from(sampleOfxContent),
  } as unknown as File;

  // Teste para CARTÃO
  const cardResult = await parseStatementOfx(dummyFile, 'CARD');
  assert.equal(cardResult.sourceType, 'OFX');
  assert.equal(cardResult.costLabel, 'R$ 0,00 (Processamento Local)');
  assert.equal(cardResult.institutionDetected, 'Nubank');
  assert.equal(cardResult.rows.length, 3);

  // Primeira compra Uber (valor positivo para cartão de crédito)
  const uberRow = cardResult.rows.find(r => r.description.includes('UBER'));
  assert.ok(uberRow);
  assert.equal(uberRow.amount, 45.90);
  assert.equal(uberRow.category, 'Transporte');

  // Compra parcelada Supermercado
  const marketRow = cardResult.rows.find(r => r.description.includes('SUPERMERCADO'));
  assert.ok(marketRow);
  assert.equal(marketRow.amount, 180.50);
  assert.ok(['Alimentação', 'Compras'].includes(marketRow.category));
  assert.equal(marketRow.installmentNumber, 1);
  assert.equal(marketRow.installmentTotal, 3);

  // Teste para CONTA BANCÁRIA (ACCOUNT)
  const accountResult = await parseStatementOfx(dummyFile, 'ACCOUNT');
  const salaryRow = accountResult.rows.find(r => r.description.includes('SALARIO'));
  assert.ok(salaryRow);
  assert.equal(salaryRow.amount, 3500.00);
  assert.equal(salaryRow.category, 'Salário');
});

test('Smart Financial Document Dispatcher - despacha OFX automaticamente', async () => {
  const sampleOfx = `
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20261010120000
      <TRNAMT>-89.90
      <FITID>tx-test-01
      <NAME>FARMACIA RAIA
    </STMTTRN>
  </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

  const ofxFile = {
    name: 'fatura_inter.ofx',
    type: 'application/octet-stream',
    text: async () => sampleOfx,
    arrayBuffer: async () => Buffer.from(sampleOfx),
  } as unknown as File;

  const res = await parseSmartFinancialDocument(ofxFile, 'CARD');
  assert.equal(res.sourceType, 'OFX');
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].description, 'FARMACIA RAIA');
  assert.equal(res.rows[0].category, 'Saúde');
  assert.equal(res.rows[0].amount, 89.90);
});

test('Card Clipboard Utility - formata e permite copiar dados do cartão para uso na carteira', async () => {
  const dummyCard: PersonalWalletCard = {
    id: 'card-123',
    nickname: 'Nubank Ultravioleta',
    issuer: 'Nubank',
    brand: 'Mastercard Black',
    last_four: '8899',
    credit_limit: 25000,
    used_limit: 4500,
    available_limit: 20500,
    closing_day: 1,
    due_day: 10,
    current_bill: 4500,
    status: 'ACTIVE',
  };

  const formatted = formatCardSummaryForClipboard(dummyCard);
  assert.ok(formatted.includes('Nubank Ultravioleta'));
  assert.ok(formatted.includes('Mastercard Black'));
  assert.ok(formatted.includes('8899'));
  assert.ok(formatted.includes('Dia 10'));
  assert.ok(formatted.includes('Dia 1'));

  // Mock navigator.clipboard para ambiente Node.js de teste
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: {
      writeText: async () => {},
    },
    configurable: true,
    writable: true,
  });

  try {
    const copyResult = await copyCardDataToClipboard(dummyCard);
    assert.equal(copyResult.success, true);
    assert.ok(copyResult.message.includes('copiados'));

    // Validação de cópia dos 4 dígitos
    const lastFourResult = await copyCardLastFourToClipboard('8899');
    assert.equal(lastFourResult.success, true);
    assert.ok(lastFourResult.message.includes('8899'));

    const fieldResult = await copyCardFieldToClipboard('Vencimento', 'Dia 10');
    assert.equal(fieldResult.success, true);
    assert.equal(fieldResult.message, 'Vencimento copiado.');

    const emptyFieldResult = await copyCardFieldToClipboard('Vencimento', '');
    assert.equal(emptyFieldResult.success, false);
    assert.equal(emptyFieldResult.message, 'Vencimento não informado.');
  } finally {
    // Cleanup
  }
});
