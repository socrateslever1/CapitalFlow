import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issuerMatchesBank, parseCardInvoiceSummary, reconcileCardInvoice, withCardCreditLimitSuggestion, withStatementEstimatedPosition } from '../../utils/cardInvoiceSummary';
import { isCardInvoicePaymentDescription, parseStatementLines } from '../../utils/walletStatementPdf';

test('registered card limit fills a missing PDF value as a suggestion without overriding a reported value', () => {
  const parsed = parseCardInvoiceSummary(['Bradesco Cartões', 'Total da fatura R$ 896,98']);
  const suggested = withCardCreditLimitSuggestion(parsed, 10000);

  assert.equal(parsed.creditLimit, null);
  assert.equal(suggested.creditLimit, 10000);
  assert.equal(withCardCreditLimitSuggestion({ ...parsed, creditLimit: 12000 }, 10000).creditLimit, 12000);
  assert.equal(withCardCreditLimitSuggestion(parsed, 0), parsed);
});

test('Mercado Pago: distinguish invoice, minimum, commitments and available limit', () => {
  const result = parseCardInvoiceSummary([
    'Cartão de crédito Mercado Pago',
    'Total a pagar R$ 450,00',
    'Pagamento mínimo R$ 70,00',
    'Limite total R$ 2.800,00',
    'Limite utilizado R$ 1.700,00',
    'Limite disponível R$ 1.100,00',
    'Compras parceladas R$ 1.250,00',
    'Vencimento: 04/11/2026',
  ]);
  assert.equal(result.institution, 'Mercado Pago');
  assert.equal(result.invoiceTotal, 450);
  assert.equal(result.minimumPayment, 70);
  assert.equal(result.futureInstallments, 1250);
  assert.equal(result.availableLimit, 1100);
  assert.equal(result.dueDate, '2026-11-04');
  assert.deepEqual(result.warnings, []);
});
test('Itaú: residual does not become a purchase or an installment', () => {
  const result = parseCardInvoiceSummary([
    'Banco Itaú',
    'Total desta fatura 2.123,00',
    'Pagamento mínimo: R$ 220,00',
    'Limite total de crédito 3.221,00',
    'Limite total utilizado 2.321,00',
    'Limite disponível 900,00',
    'Total para próximas faturas 162,00',
  ]);
  assert.equal(result.futureInstallments, 162);
  assert(result.warnings.some(w => /diferença/.test(w)));
});
test('Nubank: suspicious columns stay declared and issue reconciliation warning', () => {
  const result = parseCardInvoiceSummary([
    'Nubank',
    'Total a pagar R$ 3.500,00',
    'Limite total do cartão de crédito R$ 6.000,00',
    'Limites disponíveis',
    'Utilizado Disponível',
    'Limite total R$ 5.500,00 R$ 6.000,00',
    'Saldo em aberto total R$ 2.000,00',
  ]);
  assert.equal(result.usedLimit, 5500);
  assert.equal(result.availableLimit, 6000);
  assert(result.warnings.some(w => /subtração simples/.test(w)));
});
test('payments are not inferred from a PDF and cannot double-count', () => {
  assert.equal(reconcileCardInvoice({invoiceTotal:410, paymentsConfirmed:null, creditLimit:2800, usedLimit:1650, availableLimit:1150}).remaining, null);
  assert.deepEqual(reconcileCardInvoice({invoiceTotal:410, paymentsConfirmed:100, creditLimit:2800, usedLimit:1650, availableLimit:1150}),
    {remaining:310,available:1150,availableIsDeclared:true,overpaid:0});
  assert.equal(reconcileCardInvoice({invoiceTotal:410, paymentsConfirmed:600,creditLimit:null, usedLimit:null,availableLimit:null}).overpaid, 190);
});


test('masked suffix is read only when unique; multiple cards require review',()=>{
  const one = parseCardInvoiceSummary(['Nubank','Total a pagar R$ 200,00','03 OUT •••• 8981 Compra R$ 200,00']);
  assert.equal(one.cardLastFour,'8981');
  const many = parseCardInvoiceSummary([
    'Nubank', 'Total a pagar R$ 200,00',
    '03 OUT •••• 8981 Compra R$ 100,00',
    '04 OUT •••• 6294 Compra R$ 100,00',
  ]);
  assert.equal(many.cardLastFour,null);
  assert.equal(many.multipleCards,true);
});
test('four digit amounts and written due dates must parse without truncation',()=>{
  const result = parseCardInvoiceSummary([
    'Nubank', 'Total a pagar R$ 3.642,09',
    'Data de vencimento: 06 NOV 2026',
    'Limite total do cartão de crédito: R$ 6.991,30',
  ]);
  assert.equal(result.invoiceTotal,3642.09);
  assert.equal(result.creditLimit,6991.3);
  assert.equal(result.dueDate,'2026-11-06');
});


test('C6: card limits must not be confused with the cash-advance limit or future commitments', () => {
  const result = parseCardInvoiceSummary([
    'Cartão C6 Bank',
    'Vencimento: 05 de Novembro',
    'Valor da fatura: R$ 3.050,00',
    'Pagamento mínimo R$ 750,00',
    'Compras e pagamentos feitos até o fechamento desta fatura em 29/10/26.',
    'Saldo obrigações futuras R$ 6.100,00',
    'Limite de cartão',
    'Valores atualizados na data de fechamento da fatura',
    'Total Utilizado Disponível Total Utilizado Disponível',
    'R$ 8.000,00 R$ 6.100,00 R$ 1.900,00 R$ 800,00 R$ 0,00 R$ 800,00',
  ]);
  assert.equal(result.institution, 'C6 Bank');
  assert.equal(result.invoiceTotal, 3050);
  assert.equal(result.minimumPayment, 750);
  assert.equal(result.creditLimit, 8000);
  assert.equal(result.usedLimit, 6100);
  assert.equal(result.availableLimit, 1900);
  assert.equal(result.futureInstallments, null, 'C6 future obligations are not installment schedule');
  assert.equal(result.dueDate, '2026-11-05');
});
test('RecargaPay: columnar minimum payment and credit limit remain distinct', () => {
  const result = parseCardInvoiceSummary([
    'RecargaPay',
    'Fatura Limite de crédito: R$ 800,00 | Limite utilizado: R$ 630,00',
    'Total da fatura Pagamento mínimo Data de vencimento',
    'R$ 630,00 R$ 94,50 06/11/2026',
    'Compras no App',
    'Total da fatura R$ 630,00',
    'Total de compras parceladas R$ 0,00',
  ]);
  assert.equal(result.institution, 'RecargaPay');
  assert.equal(result.invoiceTotal, 630);
  assert.equal(result.minimumPayment, 94.5);
  assert.equal(result.creditLimit, 800);
  assert.equal(result.usedLimit, 630);
  assert.equal(result.dueDate, '2026-11-06');
  assert.equal(result.futureInstallments, 0);
});

test('Itaú: o total contábil prevalece se o PDF extrair o financiamento antes do resumo', () => {
  // Fixture sintética baseada na estrutura de um documento real.
  // Nenhum dado pessoal ou valor real é persistido no repositório.
  const parsed = parseCardInvoiceSummary([
    'Itaú - Platinum',
    'Encargos de financiamento',
    'Total a pagar',
    'R$ 1.934,79',
    'Resumo da fatura em R$',
    'Total desta fatura',
    '1.876,54',
    'Pagamento mínimo:',
    'R$ 205,00',
    'O total da sua fatura é:',
    'R$ 1.876,54',
    'Limite total de crédito',
    'R$ 3.000,00',
    'Vencimento: 02/11/2026',
  ]);
  assert.equal(parsed.institution, 'Itaú');
  assert.equal(parsed.invoiceTotal, 1876.54, 'não incorporar encargos do financiamento');
  assert.equal(parsed.minimumPayment, 205);
  assert.equal(parsed.dueDate, '2026-11-02');
  assert(parsed.warnings.some(w => /alternativo de financiamento/.test(w)));
});

test('Itaú: total declarado também é correto sem financiamento alternativo', () => {
  const parsed = parseCardInvoiceSummary([
    'Banco Itaú', 'Total desta fatura', 'R$ 1.111,21',
    'Pagamento mínimo: R$ 111,00', 'Vencimento 25/12/2026',
  ]);
  assert.equal(parsed.invoiceTotal, 1111.21);
  assert.equal(parsed.warnings.filter(w => /alternativo de financiamento/.test(w)).length, 0);
});

test('Bradesco e PicPay: compras em Mercado Pago ou RecargaPay dentro da fatura não trocam o banco emissor', () => {
  const bradesco = parseCardInvoiceSummary([
    'Bradesco Cartões',
    'Total da fatura R$ 896,98',
    'Vencimento: 03/12/2026',
    '10/11 MERCADO PAGO *LOJA R$ 120,00',
    '11/11 RECARGAPAY *CELULAR R$ 50,00',
  ]);
  assert.equal(bradesco.institution, 'Bradesco');
  assert.equal(bradesco.invoiceTotal, 896.98);
  assert.equal(issuerMatchesBank('Bradesco', bradesco.institution), true);

  const columnarBradesco = parseCardInvoiceSummary([
    'Aplicativo Bradesco Cartões', 'Total da Fatura em Real', '.', ' ', '.',
    '.', 'R$ 2.930,88',
  ]);
  assert.equal(columnarBradesco.invoiceTotal, 2930.88);

  const picpay = parseCardInvoiceSummary([
    'PicPay Card',
    'Total a pagar R$ 1.007,87',
    '07/11 RECARGAPAY R$ 52,50',
  ]);
  assert.equal(picpay.institution, 'PicPay');
  assert.equal(issuerMatchesBank('PicPay', picpay.institution), true);
});

test('Bradesco: calcula parcelas futuras, limite usado, disponível e desconsidera apenas pagamento da fatura anterior', () => {
  const parsed = parseStatementLines([
    { key: 'h', text: 'Data: 19/11/2026 - 17:58' },
    { key: '1', text: '16/11 DROGARIA BOM PRECO 1/3 BRL 72,49 0,00 R$ 0,00 72,49' },
    { key: '2', text: '07/11 DONA NOVINHA 1/2 BRL 62,28 0,00 R$ 0,00 62,28' },
    { key: '3', text: '03/11 SALDO ANTERIOR BRL 0,00 0,00 R$ 0,00 2.517,55' },
    { key: '4', text: '30/10 PAGTO ANTECIPADO PIX BRL -2.517,55 0,00 R$ 0,00 -2.517,55' },
    { key: '5', text: '14/08 PAG EUCATUR*Eucat BRL -86,00 0,00 R$ 0,00 -86,00' },
    { key: '6', text: '31/12 PG *SHOPFACIL SA 11/18 BRL 242,72 0,00 R$ 0,00 242,72' },
  ], 'CARD');

  const eucatur = parsed.rows.find(r => /eucatur/i.test(r.description));
  const pagtoPix = parsed.rows.find(r => /pagto antecipado/i.test(r.description));
  assert.equal(eucatur?.amount, -86);
  assert.equal(isCardInvoicePaymentDescription(eucatur!.description), false);
  assert.equal(pagtoPix?.amount, -2517.55);
  assert.equal(isCardInvoicePaymentDescription(pagtoPix!.description), true);

  const invoiceRows = parsed.rows.filter(r => !isCardInvoicePaymentDescription(r.description));
  const sum = Math.round(invoiceRows.reduce((acc, r) => acc + r.amount, 0) * 100) / 100;
  assert.equal(sum, Math.round((72.49 + 62.28 - 86 + 242.72) * 100) / 100);

  const baseSummary = parseCardInvoiceSummary([
    'Aplicativo Bradesco Cartões',
    'Total da Fatura em Real R$ 2.930,88',
  ]);
  const estimated = withStatementEstimatedPosition(baseSummary, {
    registeredCreditLimit: 10000,
    statementRows: parsed.rows,
    suggestedDueDate: '2026-12-03',
  });
  // Campos que o PDF não declara permanecem em branco para preenchimento manual fiel ao app do banco
  assert.equal(estimated.summary.creditLimit, 10000);
  assert.equal(estimated.summary.futureInstallments, null);
  assert.equal(estimated.summary.usedLimit, null);
  assert.equal(estimated.summary.availableLimit, null);
  assert.equal(estimated.summary.dueDate, '2026-12-03');
  assert.equal(estimated.summary.minimumPayment, null);
  assert.equal(estimated.estimatedFields.creditLimit, true);
  assert.equal(estimated.estimatedFields.futureInstallments, false);
  assert.equal(estimated.estimatedFields.usedLimit, false);
  assert.equal(estimated.estimatedFields.availableLimit, false);
  assert.equal(estimated.estimatedFields.dueDate, true);
});
