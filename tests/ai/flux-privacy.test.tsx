import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialPrivacyProvider, PrivateMoney } from '../../contexts/FinancialPrivacyContext';

test('ocultar valores substitui o valor no HTML renderizado sem alterar os dados', () => {
  const show = renderToStaticMarkup(
    <FinancialPrivacyProvider hidden={false}><PrivateMoney value="R$ 1.234,56" /></FinancialPrivacyProvider>,
  );
  assert.match(show, /R\$ 1\.234,56/);
  const hide = renderToStaticMarkup(
    <FinancialPrivacyProvider hidden><PrivateMoney value="R$ 1.234,56" /></FinancialPrivacyProvider>,
  );
  assert.match(hide, /Valor oculto/);
  assert.match(hide, /R\$ ••••/);
  assert.doesNotMatch(hide, /1\.234,56/);
});
