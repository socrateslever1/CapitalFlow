import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountCardStack } from '../../components/wallet/AccountCardStack';

const account = (id: string, nickname: string, balance: number) => ({ id, nickname, balance, bank_name: null, account_type: 'CHECKING' });

test('Suas contas lista o maior saldo primeiro e desempata pelo nome', () => {
  const html = renderToStaticMarkup(<AccountCardStack onOpen={() => {}} accounts={[
    account('a', 'Conta Zero', 0), account('b', 'Conta Alta', 900.5), account('c', 'Conta Media', 40), account('d', 'Beta', 40),
  ] as any} />);
  const order = ['Conta Alta', 'Beta', 'Conta Media', 'Conta Zero'].map(name => html.indexOf(name));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
});
