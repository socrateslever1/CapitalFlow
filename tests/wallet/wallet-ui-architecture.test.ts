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

test('a pilha preserva o alternador por setas e gesto horizontal sem cartão sintético CapitalFlow', () => {
  assert.match(stack, /aria-label="Cartão anterior"/);
  assert.match(stack, /aria-label="Próximo cartão"/);
  assert.match(stack, /onTouchStart/);
  assert.match(stack, /onTouchEnd/);
  assert.doesNotMatch(stack, />CapitalFlow</);
});

test('a página da carteira possui somente pilha, balanço e base operacional por quatro abas', () => {
  assert.match(page, /type ActiveTab = 'extrato' \| 'contas' \| 'dividas' \| 'receitas'/);
  assert.match(page, /lg:grid-cols-12/);
  assert.match(page, /lg:col-span-5/);
  assert.match(page, /lg:col-span-7/);
  assert.match(page, /lg:sticky lg:top-6/);
  assert.match(page, /Extrato do Cartão/);
  assert.match(page, /Contas Bancárias & PIX/);
  assert.match(page, /Dívidas & A Pagar/);
  assert.match(page, /Receitas Fixas/);
  assert.doesNotMatch(page, /Liquidez e compromissos/);
  assert.doesNotMatch(page, /Cartão selecionado/);
  assert.doesNotMatch(page, /Contas e passivos/);
  assert.doesNotMatch(page, />Em contas</);
});
