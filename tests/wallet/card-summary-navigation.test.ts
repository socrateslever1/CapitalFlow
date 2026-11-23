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

test('focused card view opens the requested card and keeps all others navigable', () => {
  const cards = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

  assert.deepEqual(
    getCardsForDisplay(cards, 'second').map(card => card.id),
    ['second', 'first', 'third'],
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

// Regression: a complete snapshot already carries the issuer's observation.
import { resolveCardInvoiceFactsView } from '../../features/wallet/domain/cardInvoiceFactsView';
import { getCardAvailablePresentation } from '../../features/wallet/domain/cardAvailablePresentation';
const bankFacts = [
  { card_id:'bank',due_month:'2026-12-01',available_limit:2683.51,updated_at:'2026-11-20T00:00:00Z' },
  { card_id:'other',due_month:'2026-12-01',available_limit:17.17,updated_at:'2026-11-19T00:00:00Z' },
];

test('initial card render uses bank observation without calculated-limit flash', () => {
  const state=resolveCardInvoiceFactsView('bank',bankFacts,null);
  assert.equal(state.status,'LOADING');
  assert.equal(getCardAvailablePresentation({id:'bank',credit_limit:10000,used_limit:6613.13},state.facts).amount,2683.51);
});
test('estimated fallback remains pending until bank query completes', () => {
  const pending=resolveCardInvoiceFactsView('missing',bankFacts,null);
  assert.equal(pending.status,'LOADING');
  assert.equal(pending.facts.length,0);
  const verified=resolveCardInvoiceFactsView('missing',bankFacts,{cardId:'missing',source:bankFacts,outcome:'READY',facts:[]});
  assert.equal(verified.status,'READY');
  assert.equal(getCardAvailablePresentation({id:'missing',credit_limit:900,used_limit:400},verified.facts).amount,500);
});
test('stale fetch cannot leak across selected cards or newer snapshots', () => {
  const fetched={cardId:'bank',source:bankFacts,outcome:'READY' as const,facts:[{...bankFacts[0],available_limit:3000}]};
  const switched=resolveCardInvoiceFactsView('other',bankFacts,fetched);
  assert.equal(switched.status,'LOADING');
  assert.equal(switched.facts[0].available_limit,17.17);
  const latest=[{...bankFacts[0],available_limit:2400},bankFacts[1]];
  assert.equal(resolveCardInvoiceFactsView('bank',latest,fetched).facts[0].available_limit,2400);
  assert.equal(resolveCardInvoiceFactsView('bank',bankFacts,fetched).facts[0].available_limit,3000);
});
test('failed bank lookup remains distinct from no bank record', () => {
  const failed=resolveCardInvoiceFactsView('bank',bankFacts,{cardId:'bank',source:bankFacts,outcome:'ERROR',facts:[]});
  assert.equal(failed.status,'ERROR');
  assert.equal(failed.facts[0].available_limit,2683.51);
  const missing=resolveCardInvoiceFactsView('missing',bankFacts,{cardId:'missing',source:bankFacts,outcome:'ERROR',facts:[]});
  assert.equal(missing.status,'ERROR');
  assert.equal(missing.facts.length,0);
  assert.equal(resolveCardInvoiceFactsView(null,bankFacts,null).status,'READY');
});
