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

test('notificação enxuta mantém dois atalhos distintos, sem texto duplicado ou interrupção', () => {
  const java = read('native/android/WalletQuickAccessPlugin.java');
  assert.match(java, /setContentTitle\("Lançamento rápido"\)/);
  assert.match(java, /setContentText\("Escolha uma ação"\)/);
  assert.doesNotMatch(java, /setContentTitle\("CapitalFlow · Lançamento rápido"\)/);
  assert.match(java, /ic_menu_edit, "➖ Lançar gasto"/);
  assert.match(java, /ic_input_add, "➕ Registrar entrada"/);
  assert.match(java, /target\("expense", 7104\)/);
  assert.match(java, /target\("income", 7105\)/);
  assert.match(java, /setCategory\(NotificationCompat\.CATEGORY_STATUS\)/);
  assert.match(java, /setSilent\(true\)/);
  assert.match(java, /setOnlyAlertOnce\(true\)/);
  assert.doesNotMatch(java, /IMPORTANCE_HIGH|PRIORITY_HIGH|setFullScreenIntent|setSound\([^n]/);
});

test('destaque da notificação é opt-in por perfil e não ignora canal bloqueado', () => {
  const java = read('native/android/WalletQuickAccessPlugin.java');
  const service = read('services/walletQuickAccess.ts');
  const settings = read('components/settings/AndroidQuickAccessSettings.tsx');
  assert.match(java, /PROMINENT_CHANNEL = "capitalflow_quick_access_visible_v1"/);
  assert.match(java, /preferences\(\)\.getBoolean\(profileId \+ ":prominent", false\)/);
  assert.match(java, /getImportance\(\) == NotificationManager\.IMPORTANCE_NONE/);
  assert.match(java, /getNotificationChannel\(CHANNEL\)/);
  assert.match(java, /IMPORTANCE_DEFAULT : NotificationManager\.IMPORTANCE_LOW/);
  assert.match(java, /channel\.setSound\(null, null\)/);
  assert.match(java, /channel\.enableVibration\(false\)/);
  assert.match(java, /public void setProminent\(PluginCall call\)/);
  assert.match(java, /cancel\(\); \/\/ Canal e prioridade/);
  assert.match(service, /setProminent\(args: \{ prominent: boolean \}\)/);
  assert.match(settings, /Destacar notificação/);
  assert.match(settings, /status\.priorityAvailable/);
  assert.match(settings, /walletQuickAccess\.setProminent/);
  assert.match(settings, /O Android decide a posição/);
});
