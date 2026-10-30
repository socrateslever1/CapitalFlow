import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCardInvoiceSummary, reconcileCardInvoice } from '../../utils/cardInvoiceSummary';

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
