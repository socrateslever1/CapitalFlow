import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const dashboard = readFileSync('pages/DashboardPage.tsx', 'utf8');
const focus = readFileSync('components/cards/hooks/useStableExpandedCardFocus.ts', 'utf8');
const installment = readFileSync('components/cards/components/InstallmentCard.tsx', 'utf8');
const actions = readFileSync('components/cards/components/installmentCard/InstallmentCardAction.tsx', 'utf8');
const icon = readFileSync('public/brand/capitalflow-app-icon.svg', 'utf8');
const generator = readFileSync('scripts/android/install_launcher_icon.py', 'utf8');

function focusHarness(rect) {
  const refs = [];
  const effects = [];
  const callbacks = new Map();
  const scrolls = [];
  let cursor = 0;
  let sequence = 0;
  const schedule = fn => { callbacks.set(++sequence, fn); return sequence; };
  const react = {
    useRef(initial) { return refs[cursor++] ||= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); },
    useLayoutEffect(fn) { effects.push(fn); },
  };
  const window = {
    innerHeight: 960,
    requestAnimationFrame: schedule, setTimeout: schedule,
    cancelAnimationFrame: id => callbacks.delete(id), clearTimeout: id => callbacks.delete(id),
    scrollBy: options => scrolls.push({ by: options }),
  };
  const compiled = ts.transpileModule(focus, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'window', compiled)(
    name => { assert.equal(name, 'react'); return { __esModule: true, default: react }; }, exports, window,
  );
  return {
    callbacks, scrolls,
    render(expanded) {
      cursor = 0;
      effects.length = 0;
      const result = exports.useStableExpandedCardFocus(expanded, 'contract-a');
      result.ref.current = { getBoundingClientRect: () => rect, scrollIntoView: options => scrolls.push(options) };
      const cleanups = effects.map(fn => fn()).filter(Boolean);
      return { ...result, cleanup: () => cleanups.forEach(fn => fn()) };
    },
    flush() {
      for (const [id, fn] of [...callbacks]) { callbacks.delete(id); fn(); }
    },
  };
}

test('desktop restores the original contract columns and keeps the wallet indicators alongside them', () => {
  const source = ts.createSourceFile('DashboardPage.tsx', dashboard, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(item => item.name.getText(source) === 'getDashboardColumnCount');
  assert(declaration?.initializer);
  for (const [width, expected] of [[375,1],[1024,1],[1279,1],[1280,2],[1535,2],[1536,3],[1920,3]]) {
    const window = {matchMedia: query => ({matches:width >= Number(query.match(/\d+/)[0])})};
    const count = new Function('window', `return (${declaration.initializer.getText(source)})();`)(window);
    assert.equal(count, expected, `viewport ${width}px`);
  }
  assert.equal((dashboard.match(/xl:grid-cols-2 2xl:grid-cols-3/g) || []).length, 2);
  assert(dashboard.includes('flex flex-col lg:flex-row gap-6 sm:gap-8'));
  assert(dashboard.includes('w-full lg:w-80 shrink-0'));
  assert(dashboard.includes('sm:grid-cols-2 lg:grid-cols-1 gap-3'));
});

test('selected contracts expand in their original card without a second window blocking details', () => {
  assert.doesNotMatch(dashboard, /createPortal|data-card-focus-modal|showCenteredCard|wideCardFocus/);
  assert(dashboard.includes('passThroughProps={loanCardProps}'));
  assert(dashboard.includes('sources, activeUser, selectedLoanId, setSelectedLoanId'));
  assert(dashboard.includes('onNavigate: (id: string) => onNavigate(`/contrato/${id}`)'));
});
test('inline cards center when space permits without depending on a focus window', () => {
  assert.doesNotMatch(focus, /data-card-focus-modal/);
  assert(focus.includes("? 'center' : 'start'"));
});

test('opening a contract focuses the existing small card and cancels delayed scrolls on unmount', () => {
  const harness = focusHarness({ top: 400, height: 300 });
  const card = harness.render(true);
  harness.flush();
  assert.deepEqual(harness.scrolls, [
    { behavior: 'smooth', block: 'center', inline: 'nearest' },
    { behavior: 'auto', block: 'center', inline: 'nearest' },
  ]);
  const pending = focusHarness({ top: 400, height: 300 });
  const pendingCard = pending.render(true);
  pendingCard.cleanup(); pending.flush();
  assert.equal(pending.callbacks.size, 0); assert.deepEqual(pending.scrolls, []);
  card.cleanup();
});

test('a tall expanded card keeps its beginning accessible instead of centering clipped content', () => {
  const harness = focusHarness({ top: 120, height: 1200 });
  harness.render(true); harness.flush();
  assert.ok(harness.scrolls.every(item => item.block === 'start'));
});

test('clicking an already visible expanded card does not scroll it again', () => {
  const harness = focusHarness({ top: 120, height: 300 });
  const card = harness.render(true);
  card.focusCard();
  assert.deepEqual(harness.scrolls, []);
  card.cleanup();
});

test('collapsing a card restores the original viewport position', () => {
  const rect = { top: 120, height: 300 };
  const harness = focusHarness(rect);
  const expanded = harness.render(true);
  expanded.prepareForCollapse(); expanded.cleanup();
  rect.top = 145;
  harness.render(false); harness.flush();
  assert.equal(harness.scrolls[0].by.top, 25);
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


test('desktop sidebar indicators begin at the same grid row as contract cards', () => {
  // Two aligned CSS-grid rows replace unrelated flex-column spacing.
  // This remains aligned when staff controls, a low-balance alert, or search expands.
  assert.match(dashboard, /lg:grid-cols-\\[minmax\\(0,1fr\\)_20rem\\]/);
  assert.match(dashboard, /lg:gap-x-8 lg:gap-y-8/);
  assert.match(dashboard, /data-dashboard-filters[^>]*lg:col-start-1 lg:row-start-1/);
  assert.match(dashboard, /data-dashboard-indicator-heading[^>]*lg:col-start-2 lg:row-start-1/);
  assert.match(dashboard, /data-dashboard-contracts[^>]*lg:col-start-1 lg:row-start-2/);
  assert.match(dashboard, /data-dashboard-indicators[^>]*lg:col-start-2 lg:row-start-2/);
  assert.equal((dashboard.match(/lg:contents lg:space-y-0/g) || []).length, 2);
  // Keep existing tablet/mobile tabs and stat layout intact.
  assert.match(dashboard, /mobileDashboardTab === 'CONTRACTS' \\? 'hidden md:block'/);
  assert.match(dashboard, /mobileDashboardTab === 'BALANCE' \\? 'hidden md:block'/);
  assert.match(dashboard, /sm:grid-cols-2 lg:grid-cols-1 gap-3/);
  const parsed = ts.createSourceFile('DashboardPage.tsx', dashboard, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length, 0, 'Dashboard JSX must remain syntactically valid');
});
