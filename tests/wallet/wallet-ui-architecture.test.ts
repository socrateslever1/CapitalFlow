import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('pages/PersonalWalletPage.tsx', 'utf8');
const stack = readFileSync('components/wallet/BankStack.tsx', 'utf8');

test('a página não mantém aba ou lista redundante de cartões', () => {
  assert.doesNotMatch(page, /activeTab === ['"]CARDS['"]/);
  assert.doesNotMatch(page, /type WalletTab = [^\n]*CARDS/);
});

test('a carteira usa uma pilha física absoluta e abre somente o bottom sheet', () => {
  assert.match(stack, /absolute inset-x-0/);
  assert.match(stack, /WalletCardsSheet/);
  assert.doesNotMatch(stack, /ChevronUp|ChevronDown|expanded|accordion/i);
});
