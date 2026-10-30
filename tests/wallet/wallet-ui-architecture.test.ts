import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('pages/PersonalWalletPage.tsx', 'utf8');
const stack = readFileSync('components/wallet/BankStack.tsx', 'utf8');
const accountStack = readFileSync('components/wallet/AccountCardStack.tsx', 'utf8');
const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const virtualCard = readFileSync('components/wallet/VirtualCreditCard.tsx', 'utf8');

test('a página não mantém aba ou lista redundante de cartões', () => {
  assert.doesNotMatch(page, /activeTab === ['"]CARDS['"]/);
  assert.doesNotMatch(page, /type WalletTab = [^\n]*CARDS/);
});

test('a carteira usa uma pilha física absoluta e gira o cartão sem painel intermediário', () => {
  assert.match(stack, /absolute inset-x-0/);
  assert.match(stack, /isFlipped/);
  assert.match(stack, /rotateY\(180deg\)/);
  assert.match(stack, /backfaceVisibility/);
  assert.match(stack, /•••• •••• ••••/);
  assert.doesNotMatch(stack, /WalletCardsSheet/);
  assert.doesNotMatch(stack, /ChevronUp|ChevronDown|expanded|accordion/i);
});

test('a pilha preserva o alternador por setas e gesto horizontal sem cartão sintético CapitalFlow', () => {
  assert.match(stack, /aria-label="Cartão anterior"/);
  assert.match(stack, /aria-label="Próximo cartão"/);
  assert.match(stack, /onPointerDown/);
  assert.match(stack, /onPointerUp/);
  assert.doesNotMatch(stack, />CapitalFlow</);
});

test('o verso usa elementos físicos de cartão em vez de uma grade técnica', () => {
  assert.match(stack, /Assinatura autorizada/i);
  assert.match(stack, /Código de segurança/i);
  assert.match(stack, /bg-black\/90/);
  assert.doesNotMatch(stack, /grid flex-1 grid-cols-2/);
});

test('a frente reserva linhas próprias para número, titular e validade', () => {
  assert.match(stack, /data-card-section="number"/);
  assert.match(stack, /data-card-section="holder"/);
  assert.match(stack, /data-card-section="expiry"/);
  assert.match(stack, /aria-label="Copiar titular do cartão"/);
  assert.match(stack, /aria-label="Copiar validade do cartão"/);
});

test('o cartão não recupera número completo nem CVC de anotações livres', () => {
  assert.doesNotMatch(virtualCard, /parsedMeta\.card_number/);
  assert.doesNotMatch(virtualCard, /parsedMeta\.(?:cvc|cvv)/);
});

test('as contas usam linhas compactas com a identidade visual da instituição', () => {
  assert.match(accountStack, /BankLogo/);
  assert.match(accountStack, /divide-y divide-slate-800/);
  assert.match(accountStack, /px-2.5 py-2.5/);
  assert.match(accountStack, /min-h-12 items-center justify-between/);
  assert.match(accountStack, /walletAccountTypeLabel\(account\.account_type\)/);
  assert.match(accountStack, /Saldo disponível/);
});

test('a visão geral preserva a mesma largura interna das demais páginas da carteira', () => {
  assert.match(overview, /w-full min-w-0 space-y-4 pb-24/);
  assert.doesNotMatch(overview, /max-w-\[1500px\].*px-/);
  const frame=readFileSync('features/wallet/components/WalletPageFrame.tsx','utf8');
  assert.match(frame,/w-full min-w-0 space-y-4 pb-24/);
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
