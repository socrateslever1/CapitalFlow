import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getRouteBackFallback, resolveBackTarget } from '../../utils/nativeBackNavigation';

const read = (path: string) => readFileSync(path, 'utf8');

test('hardware back prioritizes modal, nav hub, nested route, tab and final exit', () => {
  const base = { hasModal: false, hubOpen: false, pathname: '/', activeTab: 'DASHBOARD' };
  assert.equal(resolveBackTarget(base), 'exit-dialog');
  assert.equal(resolveBackTarget({ ...base, canGoBackTab: true }), 'tab', 'home must go back through earlier tabs');
  assert.equal(resolveBackTarget({ ...base, activeTab: 'CLIENTS' }), 'tab');
  assert.equal(resolveBackTarget({ ...base, pathname: '/carteira/cartoes' }), 'route');
  assert.equal(resolveBackTarget({ ...base, hubOpen: true, activeTab: 'CLIENTS' }), 'hub');
  assert.equal(resolveBackTarget({ ...base, hasModal: true, hubOpen: true, pathname: '/carteira/cartoes' }), 'modal');
  assert.equal(getRouteBackFallback('/carteira/cartoes'), '/carteira/visao-geral');
  assert.equal(getRouteBackFallback('/contrato/abc'), '/');
  assert.equal(getRouteBackFallback('/carteira/visao-geral'), '/');
});

test('only Capacitor Android receives hardware back; button exits only after explicit confirmation', () => {
  const hook = read('hooks/useExitGuard.ts');
  const app = read('App.tsx');
  const popup = read('components/system/ExitConfirmDialog.tsx');
  assert.match(hook, /Capacitor\.isNativePlatform\(\).*Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(hook, /NativeApp\.addListener\('backButton',/);
  assert.match(hook, /requestDialogBack\(\)/);
  assert.match(hook, /capitalflow:back/);
  assert.match(hook, /options\.navigate\(-1\)/);
  assert.match(hook, /options\.goBackTab\(\)/);
  assert.match(hook, /setShowExitConfirm\(true\)/);
  assert.match(hook, /const confirmExit = useCallback/);
  assert.match(hook, /NativeApp\.exitApp\(\)/);
  assert.doesNotMatch(hook, /lastBackPress|Pressione novamente para sair/);
  assert.match(app, /<ExitConfirmDialog open=\{showExitConfirm\}/);
  assert.match(popup, /role="alertdialog"/);
  assert.match(popup, /aria-modal="true"/);
  assert.match(popup, /Continuar no app/);
  assert.match(popup, />\s*Sair\s*</);
  assert.match(app, /previousPathnameRef/, 'restores previous tab when nested wallet route ends');
});

test('native button plugin is in the bundle and checked after Capacitor sync', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['@capacitor/app'], /^\^7\./);
  assert.match(pkg.dependencies['@capacitor/core'], /^\^7\./);
  const workflow = read('.github/workflows/android-apk.yml');
  assert.match(workflow, /npx cap sync android/);
  assert.match(workflow, /capacitor\.plugins\.json/);
  assert.match(workflow, /p\.pkg==='@capacitor\/app'/);
  assert.match(workflow, /assembleRelease/);
});

test('safe-area top space is owned by body once in web and APK', () => {
  const html = read('index.html');
  const header = read('layout/HeaderBar.tsx');
  const shell = read('layout/AppShell.tsx');
  const css = read('index.css');
  const main = read('main.tsx');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /padding: env\(safe-area-inset-top\)/);
  assert.doesNotMatch(header, /border-b border-slate-800 pt-safe/);
  assert.match(shell, /cf-app-shell/);
  assert.match(css, /\.cf-app-shell\s*\{/);
  assert.match(css, /calc\(100dvh - env\(safe-area-inset-top/);
  assert.match(css, /orientation: landscape/);
  assert.match(main, /document\.body\.dataset\.capacitorAndroid = 'true'/);
  assert.match(css, /body\[data-capacitor-android="true"\]/);
  assert.match(css, /padding: 0/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /@media \(max-height: 560px\)/);
});

test('Android 15+ system back is intercepted in native activity before default exit', () => {
  const activity = read('native/android/MainActivity.java');
  const patch = read('scripts/android/apply-native-shell.py');
  const hook = read('hooks/useExitGuard.ts');
  const workflow = read('.github/workflows/android-apk.yml');
  assert.match(activity, /extends BridgeActivity/);
  assert.match(activity, /getOnBackPressedDispatcher\(\)\.addCallback/);
  assert.match(activity, /new OnBackPressedCallback\(true\)/);
  assert.match(activity, /triggerWindowJSEvent\("capitalflow:android-back"\)/);
  assert.match(hook, /window\.addEventListener\('capitalflow:android-back'/);
  assert.match(hook, /window\.removeEventListener\('capitalflow:android-back'/);
  assert.match(patch, /android:enableOnBackInvokedCallback/);
  assert.match(patch, /"false"/);
  assert.match(workflow, /python3 scripts\/android\/apply-native-shell\.py/);
  assert.match(workflow, /getOnBackPressedDispatcher/);
});

test('back from dashboard preserves earlier pages until tab history is exhausted', () => {
  const stack = read('hooks/useNavigationStack.ts');
  const app = read('App.tsx');
  const hook = read('hooks/useExitGuard.ts');
  assert.match(stack, /const canGoBackPage = stack\.length > 1/);
  assert.match(stack, /if \(stack\.length <= 1\) return/);
  assert.doesNotMatch(stack, /if \(activeTab === 'DASHBOARD'\) return/);
  assert.match(app, /canGoBackTab: canGoBackPage/);
  assert.match(hook, /canGoBackTab: options\.canGoBackTab/);
});

test('status/navigation bars and cutouts use native dynamic WindowInsets without double CSS padding', () => {
  const activity = read('native/android/MainActivity.java');
  const css = read('index.css');
  const html = read('index.html');
  assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
  assert.match(activity, /findViewById\(android\.R\.id\.content\)/);
  assert.match(activity, /ViewCompat\.setOnApplyWindowInsetsListener\(content/);
  assert.match(activity, /WindowInsetsCompat\.Type\.systemBars\(\)/);
  assert.match(activity, /WindowInsetsCompat\.Type\.displayCutout\(\)/);
  assert.match(activity, /view\.setPadding\(/);
  assert.match(activity, /initialTop \+ bars\.top/);
  assert.match(activity, /initialBottom \+ bars\.bottom/);
  assert.match(activity, /initialLeft \+ bars\.left/);
  assert.match(activity, /initialRight \+ bars\.right/);
  assert.match(activity, /new WindowInsetsCompat\.Builder\(windowInsets\)/);
  assert.match(activity, /setInsets\(insetTypes, Insets\.NONE\)/);
  assert.match(activity, /ViewCompat\.requestApplyInsets\(content\)/);
  assert.doesNotMatch(activity, /WindowInsetsCompat\.CONSUMED/, 'do not swallow IME/keyboard updates');
  assert.match(css, /body\[data-capacitor-android="true"\]\s*\{\s*padding:\s*0/);
  assert.match(html, /viewport-fit=cover/);
});
