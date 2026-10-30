import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const dashboard = readFileSync('pages/DashboardPage.tsx', 'utf8');
const focus = readFileSync('components/cards/hooks/useStableExpandedCardFocus.ts', 'utf8');
const installment = readFileSync('components/cards/components/InstallmentCard.tsx', 'utf8');
const actions = readFileSync('components/cards/components/installmentCard/InstallmentCardAction.tsx', 'utf8');
const icon = readFileSync('public/brand/capitalflow-app-icon.svg', 'utf8');
const generator = readFileSync('scripts/android/install_launcher_icon.py', 'utf8');

test('selected group is focused at the center without expanding the background columns', () => {
  assert(dashboard.includes('createPortal('));
  assert(dashboard.includes('data-card-focus-modal="true"'));
  assert(dashboard.includes('showCenteredCard ? { ...loanCardProps, selectedLoanId: null }'));
  assert(dashboard.includes('aria-modal="true"'));
});
test('inline cards center when space permits and never scroll the focused modal', () => {
  assert(focus.includes("element.closest('[data-card-focus-modal"));
  assert(focus.includes("? 'center' : 'start'"));
});
test('installment buttons stay on a separate responsive grid away from status and value', () => {
  assert(installment.includes('flex flex-col gap-3 px-3 py-2.5'));
  assert(actions.includes('grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4'));
});
test('APK launcher draws the provided white/turquoise CF from the same vector as web', () => {
  assert(icon.includes('fill="url(#flow)"'));
  assert(icon.includes('stop-color="#18edaf"'));
  assert(generator.includes("SOURCE = ROOT / 'public/brand/capitalflow-app-icon.svg'"));
  assert(generator.includes('cf_launcher_foreground.png'));
  assert(generator.includes('cf_launcher_round.png'));
});
