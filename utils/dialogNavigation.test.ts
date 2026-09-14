import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDialogBack, requestDialogBack } from './dialogNavigation';

test('voltar atende somente o cartão superior e restaura o anterior', () => {
  const calls: string[] = [];
  const first = registerDialogBack(() => calls.push('parent'));
  const second = registerDialogBack(() => calls.push('child'));
  try {
    assert.equal(first.isTop(), false);
    assert.equal(second.isTop(), true);
    assert.equal(requestDialogBack(), true);
    assert.deepEqual(calls, ['child']);
    second.dispose();
    assert.equal(first.isTop(), true);
    requestDialogBack();
    assert.deepEqual(calls, ['child', 'parent']);
  } finally { first.dispose(); second.dispose(); }
  assert.equal(requestDialogBack(), false);
});

test('remoção fora de ordem e limpeza repetida não removem outro cartão', () => {
  const first = registerDialogBack(() => {});
  let called = 0;
  const second = registerDialogBack(() => called++);
  first.dispose(); first.dispose();
  try { assert.equal(requestDialogBack(), true); assert.equal(called, 1); }
  finally { second.dispose(); }
  assert.equal(requestDialogBack(), false);
});
