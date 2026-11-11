import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import React from 'react';
import ts from 'typescript';
import { getEffectiveInvoiceCycles } from '../../components/wallet/invoiceStatementDomain';
import type { CardInvoiceSummary } from '../../utils/cardInvoiceSummary';
import type { WalletIssuerInvoiceCommit } from '../../services/personalWallet.service';

const summary: CardInvoiceSummary = {
  institution: 'Nubank', cardLastFour: '1234', multipleCards: false,
  invoiceTotal: 100, minimumPayment: 10, creditLimit: 1000, usedLimit: 100,
  availableLimit: 900, futureInstallments: 0, dueDate: '2026-11-10', warnings: [],
};
const commit = (financialApplied = true): WalletIssuerInvoiceCommit => ({
  facts: {
    id: 'fact', card_id: 'card-a', due_month: '2026-11-01', due_date: '2026-11-10',
    issuer: 'Nubank', invoice_total: 100, minimum_payment: 10, credit_limit: 1000,
    used_limit: 100, available_limit: 900, future_installments: 0,
    source_hash: 'a'.repeat(64), source_type: 'PDF', observed_at: '', updated_at: '',
  },
  due_month: '2026-11-01', financial_applied: financialApplied, replayed: false, note: '',
});
const parsed = {
  hash: 'a'.repeat(64), sourceType: 'PDF_NATIVE', costLabel: 'Local', pages: 1, skipped: 0,
  invoiceSummary: summary,
  rows: [{ rowKey: 'row-1', date: '2026-10-20', description: 'Mercado', amount: 100,
    category: 'Compras', confidence: 'HIGH', selected: true,
    installmentNumber: null, installmentTotal: null }],
};

// Execute the production component and its event handlers without adding a DOM
// dependency. Only React's synchronous hook storage and external I/O are replaced.
function readerHarness(name: 'FlatSmartStatementReader' | 'WalletStatementImport') {
  const slots: any[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const useState = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value: any) => {
      slots[index] = typeof value === 'function' ? value(slots[index]) : value;
    }];
  };
  const useRef = (initial: any) => {
    const index = cursor++;
    return slots[index] ??= { current: initial };
  };
  const useEffect = (effect: () => void, dependencies: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) {
      slots[index] = dependencies;
      effects.push(effect);
    }
  };
  const calls = { confirmations: [] as any[][], rows: [] as any[], purchases: [] as any[][],
    parses: [] as any[][], reviews: [] as any[][] };
  const io = {
    confirm: async () => commit(),
    review: async () => [] as any[],
    refreshed: async () => {},
    consent: true,
  };
  const service = {
    async saveCardInvoiceFacts(...args: any[]) { calls.confirmations.push(args); return io.confirm(); },
    async getStatementRowsForReview(...args: any[]) { calls.reviews.push(args); return io.review(); },
    async recordStatementRow(input: any) { calls.rows.push(input); return 'saved-row'; },
    async recordAndImportCardStatementPurchase(input: any) {
      calls.rows.push(input);
      calls.purchases.push(['saved-row', input.dueMonth, input.included]);
      return 'saved-row';
    },
    async importCardStatementPurchase(...args: any[]) { calls.purchases.push(args); },
  };
  const SummaryPreview = () => null;
  const filename = resolve('components/wallet', name + '.tsx');
  const require = createRequire(filename);
  const localRequire = (specifier: string) => {
    if (specifier === 'react') return { ...React, useState, useRef, useEffect };
    if (specifier.endsWith('/personalWallet.service')) return { personalWalletService: service };
    if (specifier.endsWith('/statementSmartReader')) return {
      parseSmartFinancialDocument: async (...args: any[]) => { calls.parses.push(args); return parsed; },
    };
    if (specifier === './CardInvoiceSummaryPreview') return { CardInvoiceSummaryPreview: SummaryPreview };
    return require(specifier);
  };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'window', compiled)(
    localRequire, module, module.exports, { confirm: () => io.consent },
  );
  const Component = module.exports[name];
  let tree: any;
  const props: any = {
    kind: 'CARD', targetId: 'card-a', targetName: 'Cartão A', targetIssuer: 'Nubank',
    targetLastFour: '1234', initialDueMonth: '2026-11-01', hasOpening: false, existingRows: [],
    onClose: () => {}, onImported: async () => {},
    onSummarySaved: async () => { await io.refreshed(); props.hasOpening = true; },
  };
  const render = () => {
    cursor = 0; effects = [];
    tree = Component(props);
    effects.forEach(effect => effect());
    return tree;
  };
  const all = (node: any): any[] => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(item => all(item))
      : [node, ...all(node.props?.children)];
  const find = (predicate: (node: any) => boolean) => {
    const node = all(tree).find(predicate);
    assert.ok(node, 'Expected reader control is present');
    return node;
  };
  const text = (node: any): string => typeof node === 'string' ? node
    : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '');
  const button = (label: string) => find(node => node.type === 'button' && text(node).includes(label));
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const load = async (type = 'application/pdf', filename = 'synthetic.pdf') => {
    const file = new File(['synthetic'], filename, { type });
    find(node => node.type === 'input' && node.props.type === 'file')
      .props.onChange({ target: { files: [file], value: filename } });
    await flush();
    if (name === 'WalletStatementImport') {
      button('Dissecar').props.onClick();
      await flush();
    }
  };
  render(); render();
  return { props, calls, io, render, find, button, load, flush,
    async confirmSummary() {
      await find(node => node.type === SummaryPreview).props.onSave(summary);
      render();
    },
    async save() { await button('Confirmar itens selecionados').props.onClick(); render(); },
    setMonth(month: string) {
      find(node => node.type === 'input' && node.props.type === 'month')
        .props.onChange({ target: { value: month } }); render();
    },
    setMode(mode: string) {
      find(node => node.type === 'select' && ['NEW', 'INCLUDED', 'DOCUMENT'].includes(node.props.value))
        .props.onChange({ target: { value: mode } }); render();
    },
  };
}

for (const reader of ['FlatSmartStatementReader', 'WalletStatementImport'] as const) {
  test(`${reader}: confirmed opening is detailed once after the parent snapshot refresh`, async () => {
    const app = readerHarness(reader);
    await app.load();
    await app.confirmSummary();
    await app.save();
    assert.deepEqual(app.calls.purchases, [['saved-row', '2026-11-01', true]]);
    const expenses: any[] = [
      { id: 'opening', card_id: 'card-a', status: 'PENDING', entry_type: 'INVOICE_OVERRIDE',
        is_opening_summary: true, invoice_due_month: '2026-11-01' },
      { id: 'purchase', card_id: 'card-a', status: 'PENDING', entry_type: 'PURCHASE' },
    ];
    const installments: any[] = [
      { expense_id: 'opening', due_month: '2026-11-01', amount: 100, paid_amount: 0, status: 'PENDING' },
      { expense_id: 'purchase', due_month: '2026-11-01', amount: 100, paid_amount: 0, status: 'PENDING',
        opening_invoice_id: app.calls.purchases[0][2] ? 'opening' : null },
    ];
    assert.equal(getEffectiveInvoiceCycles('card-a', expenses, installments)[0].amount, 100);
  });

  test(`${reader}: observations without a financial opening remain new purchases`, async () => {
    const app = readerHarness(reader);
    app.io.confirm = async () => commit(false);
    await app.load(); await app.confirmSummary(); await app.save();
    assert.deepEqual(app.calls.purchases, [['saved-row', '2026-11-01', false]]);
  });

  test(`${reader}: document-only mode survives an opening confirmation`, async () => {
    const app = readerHarness(reader);
    await app.load(); app.setMode('DOCUMENT');
    await app.confirmSummary(); await app.save();
    assert.equal(app.calls.rows.length, 1);
    assert.equal(app.calls.purchases.length, 0);
  });

  test(`${reader}: automatic inclusion is restricted to the confirmed payment month`, async () => {
    const app = readerHarness(reader);
    await app.load(); await app.confirmSummary(); app.setMonth('2026-12'); await app.save();
    assert.deepEqual(app.calls.purchases, [['saved-row', '2026-12-01', false]]);
  });

  test(`${reader}: uncertain confirmation retries with the same request identity`, async () => {
    const app = readerHarness(reader);
    let attempts = 0;
    app.io.confirm = async () => {
      if (++attempts === 1) throw new Error('Resposta perdida após commit');
      return { ...commit(), replayed: true };
    };
    await app.load();
    await assert.rejects(() => app.confirmSummary(), /Resposta perdida/);
    await app.confirmSummary(); await app.save();
    const firstId = app.calls.confirmations[0][1];
    assert.equal(typeof firstId, 'string');
    assert.equal(app.calls.confirmations[1][1], firstId);
    assert.deepEqual(app.calls.purchases, [['saved-row', '2026-11-01', true]]);
  });

  test(`${reader}: refresh failure cannot turn a confirmed opening back into new purchases`, async () => {
    const app = readerHarness(reader);
    app.io.refreshed = async () => { throw new Error('Snapshot indisponível'); };
    await app.load();
    await assert.rejects(() => app.confirmSummary(), /Snapshot indisponível/);
    app.render(); await app.save();
    assert.deepEqual(app.calls.purchases, [['saved-row', '2026-11-01', true]]);
  });

  test(`${reader}: changing destination discards the previous card's parsed transactions`, async () => {
    const app = readerHarness(reader);
    await app.load(); await app.confirmSummary();
    app.props.targetId = 'card-b'; app.props.targetName = 'Cartão B'; app.props.hasOpening = false;
    app.render(); app.render();
    if (reader === 'FlatSmartStatementReader') {
      assert.throws(() => app.button('Confirmar itens selecionados'), /Expected reader control is present/);
    } else {
      assert.equal(app.button('Confirmar itens selecionados').props.disabled, true);
    }
    assert.equal(app.calls.rows.length, 0);
  });

  test(`${reader}: fresh duplicate review blocks writes and remains explicitly overridable`, async () => {
    const app = readerHarness(reader);
    app.io.review = async () => [{ id: 'older-row', target_kind: 'CARD', target_id: 'card-a',
      entry_date: '2026-10-20', description: 'MERCADO', amount: 100 }];
    await app.load(); await app.save();
    assert.equal(app.calls.rows.length, 0);
    assert.deepEqual(app.calls.reviews[0], ['CARD', 'card-a', ['2026-10-20']]);
    app.find(node => node.type === 'input' && node.props.type === 'checkbox'
      && node.props.onChange && node.props.checked === false).props.onChange({ target: { checked: true } });
    app.render(); await app.save();
    assert.equal(app.calls.rows.length, 1);
  });

  test(`${reader}: a failed history review blocks all financial writes and can be retried`, async () => {
    const app = readerHarness(reader);
    app.io.review = async () => { throw new Error('Histórico indisponível'); };
    await app.load(); await app.save();
    assert.equal(app.calls.rows.length, 0);
    app.io.review = async () => []; await app.save();
    assert.equal(app.calls.rows.length, 1);
  });

  test(`${reader}: image reading waits for explicit consent before calling cloud parsing`, async () => {
    const app = readerHarness(reader);
    await app.load('image/png', 'synthetic.png');
    assert.equal(app.calls.parses.length, 0);
    app.io.consent = false;
    app.button('Ler imagem com IA').props.onClick(); await app.flush();
    assert.equal(app.calls.parses.length, 0);
    app.io.consent = true;
    app.button('Ler imagem com IA').props.onClick(); await app.flush();
    assert.equal(app.calls.parses.length, 1);
    assert.equal(app.calls.parses[0][2].forceAi, true);
    assert.equal(app.calls.parses[0][2].cloudConsent, true);
  });
}
