import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatementOfx, parseSmartFinancialDocument } from '../../utils/statementSmartReader';
import { isCardInvoicePaymentDescription, parseStatementLines } from '../../utils/walletStatementPdf';
import { readFileSync } from 'node:fs';
import { getCardCreditPosition, getEffectiveInvoiceCycles } from '../../components/wallet/invoiceStatementDomain';

const makeFile = (body: string, name = 'extrato.ofx', encoding: BufferEncoding = 'utf8'): File => {
  const bytes = Buffer.from(body, encoding);
  return {
    name, type: 'application/octet-stream', size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  } as unknown as File;
};

test('OFX preserves purchases, separates refunds/payments and stable FITIDs', async () => {
  const file = makeFile([
    'OFXHEADER:100', 'CHARSET:1252', '<OFX><FI><ORG>Banco de São Paulo</FI>',
    '<BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261025150000<TRNAMT>-23.95<FITID>cmp-1<NAME>UBER TRIP</STMTTRN>',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261025150000<TRNAMT>23.95<FITID>cred-1<NAME>ESTORNO UBER</STMTTRN>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261025150000<TRNAMT>-1.234,56<FITID>cmp-2<NAME>LOJA DE COMPRAS</STMTTRN>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260231150000<TRNAMT>-2.00<FITID>bad-1<NAME>DATA INVALIDA</STMTTRN>',
    '</BANKTRANLIST></OFX>',
  ].join('\n'), 'cartao.ofx', 'latin1');
  const card = await parseStatementOfx(file, 'CARD');
  assert.equal(card.rows.length, 3);
  assert.equal(card.skipped, 1);
  assert.equal(card.rows[0].amount, 23.95);
  assert.equal(card.rows[0].selected, true);
  assert.equal(card.rows[0].rowKey, 'ofx-cmp-1');
  assert.equal(card.rows[1].amount, -23.95);
  assert.equal(card.rows[1].selected, false);
  assert.equal(card.rows[2].amount, 1234.56);
  assert.match(card.institutionDetected || '', /S.o Paulo/);
  const bank = await parseSmartFinancialDocument(file, 'ACCOUNT');
  assert.equal(bank.rows[0].amount, -23.95);
  assert.equal(bank.rows[1].amount, 23.95);
});

test('OFX without actual STMTTRN returns actionable error, not fake zero entries', async () => {
  await assert.rejects(() => parseStatementOfx(makeFile('<OFX><BANKTRANLIST/></OFX>'), 'CARD'), /não contém transações STMTTRN/);
});

test('PDF local detects split transaction rows, Brazilian months and prevents importing card payments', () => {
  const result = parseStatementLines([
    { key: 'header', text: 'Resumo da fatura R$ 400,00' },
    { key: 'marker', text: 'Histórico de lançamentos' },
    { key: 'a', text: '10 out 2026 UBER TRIP' },
    { key: 'b', text: 'R$ 34,56' },
    { key: 'c', text: '11/10/2026 MERCADO CENTRAL 1.234,56' },
    { key: 'd', text: '12/10/2026 PAGAMENTO DA FATURA 400,00 C' },
    { key: 'footer', text: 'Total da fatura R$ 869,12' },
  ], 'CARD');
  assert.deepEqual(result.rows.map(r => r.amount), [34.56, 1234.56, -400]);
  assert.deepEqual(result.rows.map(r => r.date), ['2026-10-10', '2026-10-11', '2026-10-12']);
  assert(result.rows.every(r => r.selected === false), 'PDF review must be explicit');
});

test('Bradesco Eucatur refund keeps -R$ 86,00 while prior invoice payment stays excluded', () => {
  const { rows } = parseStatementLines([
    { key: 'refund', text: '14/08/2026 PAG EUCATUR*Eucat -86,00' },
    { key: 'payment', text: '30/10/2026 PAGTO ANTECIPADO PIX -2.517,55' },
  ], 'CARD');
  assert.deepEqual(rows.map(row => row.amount), [-86, -2517.55]);
  assert.equal(isCardInvoicePaymentDescription(rows[0].description), false);
  assert.equal(isCardInvoicePaymentDescription(rows[1].description), true);
  const selectedNetCents = rows.filter(row => !isCardInvoicePaymentDescription(row.description))
    .reduce((total, row) => total + Math.round(row.amount * 100), 0);
  assert.equal(selectedNetCents, -8600);
  assert.equal(301688 + selectedNetCents, 293088);
});

test('cloud AI statement reading is disabled across dispatcher and statement readers', () => {
  const dispatch = readFileSync('utils/statementSmartReader.ts','utf8');
  const flat = readFileSync('components/wallet/FlatSmartStatementReader.tsx','utf8');
  const modal = readFileSync('components/wallet/WalletStatementImport.tsx','utf8');
  assert(dispatch.includes('A leitura de faturas por IA foi desativada'));
  assert(dispatch.includes('A leitura de faturas por imagem/IA foi desativada'));
  for (const ui of [flat, modal]) {
    assert(!ui.includes('window.confirm('), 'must not use browser confirm popup');
    assert(!ui.includes('Ler PDF com IA'), 'cloud AI PDF button must not be exposed');
    assert(!ui.includes('Ler imagem com IA'), 'cloud AI image button must not be exposed');
  }
});


test('OFX distinguishes invoice PIX settlement from Pix no Crédito charge',async()=>{
  const file=makeFile([
    '<OFX><CCSTMTRS><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261030000000<TRNAMT>-350.00<FITID>p1<NAME>PAGAMENTO PIX</STMTTRN>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261030000000<TRNAMT>-58.50<FITID>p2<NAME>PIX NO CRÉDITO</STMTTRN>',
    '</BANKTRANLIST></CCSTMTRS></OFX>',
  ].join(''),'card.ofx');
  const result=await parseStatementOfx(file,'CARD');
  assert.deepEqual(result.rows.map(x=>x.amount),[-350,58.5]);
});


test('encrypted PDF requires local password and never persists document secrets', () => {
  const parser = readFileSync('utils/walletStatementPdf.ts', 'utf8');
  const dispatcher = readFileSync('utils/statementSmartReader.ts', 'utf8');
  const panels = [
    readFileSync('components/wallet/FlatSmartStatementReader.tsx','utf8'),
    readFileSync('components/wallet/WalletStatementImport.tsx','utf8'),
  ];
  assert(parser.includes('StatementPdfPasswordError'));
  assert(parser.includes('PDF_PASSWORD_REQUIRED'));
  assert(parser.includes('PDF_PASSWORD_INCORRECT'));
  assert(parser.includes('...(password ? {password} : {})'));
  assert(dispatcher.includes('pdfPassword?: string') && dispatcher.includes('options?.pdfPassword'));
  assert(panels.every(panel => panel.includes('type="password"')));
  assert(panels.every(panel => panel.includes("setPdfPassword('')")));
  assert(panels.every(panel => panel.includes('onSave={saveSummary}')));
});

test('invoice credits subtract from cycle total without blocking future installment commitments', () => {
  const expenses = [
    {
      id: 'exp-1', description: 'COMPRA A VISTA', amount: 3016.88, category: 'Compras',
      expense_date: '2026-11-10', due_date: '2026-12-01', status: 'PENDING', installment_count: 1,
      card_id: 'card-1', entry_type: 'PURCHASE' as const, is_invoice_credit: false,
    },
    {
      id: 'exp-credit', description: 'PAG EUCATUR*Eucat', amount: 86.00, category: 'Ajuste de fatura',
      expense_date: '2026-08-14', due_date: '2026-12-01', status: 'PENDING', installment_count: 1,
      card_id: 'card-1', entry_type: 'PURCHASE' as const, is_invoice_credit: true,
    },
    {
      id: 'exp-parcel', description: 'PARC.FACIL', amount: 400.00, category: 'Compras',
      expense_date: '2026-06-10', due_date: '2026-12-01', status: 'PENDING', installment_count: 3,
      card_id: 'card-1', entry_type: 'PURCHASE' as const, is_invoice_credit: false,
    },
  ];
  const installments = [
    { id: 'i-1', expense_id: 'exp-1', installment_number: 1, due_month: '2026-12-01', amount: 3016.88, paid_amount: 0, status: 'PENDING' as const },
    { id: 'i-c', expense_id: 'exp-credit', installment_number: 1, due_month: '2026-12-01', amount: 86.00, paid_amount: 0, status: 'PENDING' as const },
    { id: 'i-p1', expense_id: 'exp-parcel', installment_number: 1, due_month: '2026-12-01', amount: 200.00, paid_amount: 0, status: 'PENDING' as const },
    { id: 'i-p2', expense_id: 'exp-parcel', installment_number: 2, due_month: '2027-01-01', amount: 200.00, paid_amount: 0, status: 'PENDING' as const },
  ];
  const cycles = getEffectiveInvoiceCycles('card-1', expenses, installments);
  assert.deepEqual(cycles, [
    { dueMonth: '2026-12-01', amount: 3130.88, hasOverride: false },
    { dueMonth: '2027-01-01', amount: 200.00, hasOverride: false },
  ]);
  const pos = getCardCreditPosition({ id: 'card-1', credit_limit: 10000, initial_future_installments_balance: 0 }, expenses, installments);
  assert.equal(pos.currentInvoice, 3130.88);
  assert.equal(pos.futureCommitments, 200.00);
  assert.equal(pos.committedLimit, 3330.88);
  assert.equal(pos.freeLimit, 6669.12);
});
