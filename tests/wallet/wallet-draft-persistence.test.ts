import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('rascunho da carteira persiste formulário e exclui quando limpo', () => {
  const source = readFileSync('features/wallet/hooks/useWalletDraft.ts', 'utf8');
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /localStorage\.removeItem/);
  assert.match(source, /scopeId \? `\$\{prefix\}\$\{scopeId\}:\$\{key\}`/);
  assert.match(source, /Nunca usar para PAN, PIN, CVC\/CVV/);
});

test('compromisso usa rascunho restaurável com escopo por usuário e data comercial de Manaus', () => {
  const source = readFileSync('features/wallet/pages/WalletPayablesPage.tsx', 'utf8');
  const income = readFileSync('features/wallet/pages/WalletIncomePage.tsx', 'utf8');
  assert.match(source, /useWalletDraft\('payables:new', emptyPayableForm, activeUser\?\.id\)/);
  assert.match(source, /businessDateInManaus\(\)/);
  assert.match(income, /businessDateInManaus\(\)\.slice\(0, 7\)/);
  assert.doesNotMatch(source, /Rascunho restaurado/);
  assert.doesNotMatch(source, /if \(form\.description \|\| form\.creditor_name/);
  assert.match(source, /panelClassName="sm:rounded-xl"/);
  assert.match(source, /clearFormDraft\(\)/);
});
