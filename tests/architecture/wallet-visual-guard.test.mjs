import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const summary = readFileSync('features/wallet/components/WalletOverviewSummary.tsx','utf8');
const moduleFile = readFileSync('features/wallet/WalletModule.tsx','utf8');
test('wallet overview uses visual banking cards without altering data contracts', () => {
  assert(summary.includes('snap-x snap-mandatory'));
  assert(summary.includes('aspect-[1.586/1]'));
  assert(summary.includes('getCardSummaryDestination(card.id)'));
  assert(summary.includes('formatMoney(available)'));
  assert(summary.includes('card.last_four'));
  assert(summary.includes('card.primary_color || visual.accent'));
  assert(summary.includes('AccountCardStack compact'));
  assert(moduleFile.includes('<PageHeader'));
});
test('visual polish has no direct financial writes', () => {
  assert(!/supabase\.(from|rpc)\(/.test(summary));
  assert(!/updateCard|deleteCard|setBalance/.test(summary));
});
