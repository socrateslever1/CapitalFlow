import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCardSummaryDestination,
  getCardsForDisplay,
} from '../../features/wallet/cardSummaryNavigation';

test('summary card destination identifies the clicked card', () => {
  assert.equal(
    getCardSummaryDestination('card / 1'),
    'cartoes?card=card%20%2F%201',
  );
});

test('focused card view keeps only the requested card', () => {
  const cards = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

  assert.deepEqual(
    getCardsForDisplay(cards, 'second').map(card => card.id),
    ['second'],
  );
  assert.deepEqual(
    getCardsForDisplay(cards, null).map(card => card.id),
    ['first', 'second', 'third'],
  );
  assert.deepEqual(
    getCardsForDisplay(cards, 'missing').map(card => card.id),
    ['first', 'second', 'third'],
  );
});
