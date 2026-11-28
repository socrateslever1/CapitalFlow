import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('movimento funcional usa tokens, respeita redução e não pressiona controles indisponíveis', () => {
  const css = read('index.css');
  for (const [key, value] of [['press','100ms'],['state','180ms'],['enter','260ms'],['exit','200ms']]) {
    assert.ok(css.includes('--cf-motion-' + key + ': ' + value));
  }
  assert.ok(css.includes('.cf-motion-press:enabled:not([aria-disabled="true"]):active'));
  assert.ok(css.includes('.cf-seg-tab:enabled:not([aria-disabled="true"]):active'));
  assert.ok(css.includes('.cf-motion-dialog[data-modal-state="closing"] > .cf-motion-dialog-panel'));
  assert.match(css, /to \{ transform: none; opacity: 1; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.cf-motion-press, \.cf-motion-dialog, \.cf-motion-dialog-panel, \.cf-seg-tab \{\s*animation: none;\s*transition: none;/);
});

test('modais mantêm semântica, proteção de formulário e navegação existentes', () => {
  const modal = read('components/ui/Modal.tsx');
  for (const value of ['cf-motion-dialog','cf-motion-dialog-panel','cf-motion-press','registerDialogBack(back)','role="dialog"','aria-modal="true"','disabled={busy}','fieldset disabled={busy}','data-dialog-body','createPortal(dialog, document.body)']) assert.ok(modal.includes(value), value);
  assert.ok(read('components/ui/Button.tsx').includes('cf-motion-press'));
  const loan = read('components/LoanForm.tsx');
  assert.ok(loan.includes("name={props.initialData ? 'edit' : 'contracts'}"));
  assert.ok(loan.includes('name="details"'));
});
