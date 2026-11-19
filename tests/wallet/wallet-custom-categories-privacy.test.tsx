import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialPrivacyProvider } from '../../contexts/FinancialPrivacyContext';
import { SelectOptionList } from '../../components/ui/SelectOptionList';
import {
  loadCustomExpenseCategories,
  saveCustomExpenseCategory,
} from '../../features/wallet/utils/walletCustomCategories';

test('categorias personalizadas ficam isoladas por perfil no mesmo aparelho', () => {
  const storage = new Map<string, string>();
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    } },
  });
  try {
    assert.deepEqual(saveCustomExpenseCategory('Pets', 'perfil-a'), ['Pets']);
    assert.deepEqual(loadCustomExpenseCategories('perfil-a'), ['Pets']);
    assert.deepEqual(loadCustomExpenseCategories('perfil-b'), []);
    assert.deepEqual(saveCustomExpenseCategory('Viagem', null), ['Viagem']);
    assert.deepEqual(loadCustomExpenseCategories(null), []);
    assert.equal(storage.size, 1);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});

test('seletor mascara valores monetários quando a privacidade está ativa', () => {
  const markup = renderToStaticMarkup(<FinancialPrivacyProvider hidden>
    <SelectOptionList ariaLabel="Conta" value="conta-1" onChange={() => {}}
      options={[{ value: 'conta-1', label: 'Conta principal', rightValue: 'R$ 5.100,81' }]}/>
  </FinancialPrivacyProvider>);
  assert.match(markup, /R\$ ••••/);
  assert.doesNotMatch(markup, /5\.100,81/);
});
