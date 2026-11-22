import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
test('notificação opt-in, silenciosa, privada e sem overlays ou serviço artificial', () => {
  const java = read('native/android/WalletQuickAccessPlugin.java');
  for (const pattern of [/POST_NOTIFICATIONS/, /PermissionCallback/, /IMPORTANCE_LOW/, /VISIBILITY_SECRET/, /setOngoing\(true\)/, /FLAG_IMMUTABLE/, /Lançar gasto/, /Registrar entrada/]) assert.match(java, pattern);
  assert.doesNotMatch(java, /SYSTEM_ALERT_WINDOW|startForegroundService|ACTION_VIEW|https?:/);
  assert.match(java, /removeExtra/);
  assert.match(java, /cancel\(NOTIFICATION_ID\)/);
  assert.match(read('scripts/android/apply-native-shell.py'), /WalletQuickAccessPlugin.java/);
  assert.match(read('native/android/MainActivity.java'), /WalletQuickAccessPlugin.class/);
});
test('atalho só abre formulários existentes, depende de autorização atual e consome ação uma vez', () => {
  const hook = read('hooks/useMasterTools.ts');
  assert.match(hook, /authorizedProfile/);
  assert.match(hook, /consumeAction/);
  assert.match(hook, /capitalflow:quick-access/);
  assert.match(hook, /\[authorizedProfile, accessResolved\]/, 'navegação não deve encerrar a sessão nativa');
  assert.match(hook, /navigateRef.current/);
  assert.doesNotMatch(hook, /createExpense|createAccountMovement|createLoan/);
  assert.match(read('features/wallet/components/WalletExpenseFab.tsx'), /searchParams.delete\('lancamento'\)/);
});

test('preferências Android ficam compactas, não ocupam o topo do perfil e preservam a ação', () => {
  const page = read('pages/ProfilePage.tsx');
  const settings = read('components/settings/AndroidQuickAccessSettings.tsx');
  assert.doesNotMatch(page, /<AndroidQuickAccessSettings\s*\/>\s*<div className="grid grid-cols-1 lg:grid-cols-12/);
  assert.match(page, /activeSection === 'INTERFACE'[\s\S]*?<AndroidQuickAccessSettings\s*\/>/);
  assert.match(settings, /Lançamento rápido/);
  assert.match(settings, /Notificação Android/);
  assert.match(settings, /status\.enabled \? 'Desativar' : 'Ativar'/);
  assert.match(settings, /walletQuickAccess\.setEnabled/);
  assert.match(settings, /aria-pressed=\{status\.enabled\}/);
  assert.match(settings, /!status\.permissionGranted/);
  assert.match(settings, /role="alert"/);
  assert.doesNotMatch(settings, /O Android pode permitir dispensar|Após reiniciar o aparelho|Sem sobreposição sobre outros apps/);
});
