import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('o leitor nativo usa opt-in e permissão exclusiva do Android', () => {
  const service = read('native/android/WalletBankNotificationListenerService.java');
  const bridge = read('native/android/WalletBankNotificationsPlugin.java');
  const shell = read('scripts/android/apply-native-shell.py');
  const main = read('native/android/MainActivity.java');
  assert.match(shell, /android.permission.BIND_NOTIFICATION_LISTENER_SERVICE/);
  assert.match(shell, /android.service.notification.NotificationListenerService/);
  assert.match(shell, /android:name=".WalletBankNotificationListenerService"/);
  assert.match(main, /registerPlugin\(WalletBankNotificationsPlugin\.class\)/);
  assert.match(bridge, /ACTION_NOTIFICATION_LISTENER_SETTINGS/);
  assert.match(bridge, /getEnabledListenerPackages/);
  assert.match(service, /WalletBankNotificationStore.capture\(/);
  assert.match(shell, /WalletBankNotificationStore.java/);
  assert.match(shell, /WalletBankNotificationsPlugin.java/);
  assert.match(shell, /WalletBankNotificationListenerService.java/);
  assert.doesNotMatch(service, /startForeground|sendBroadcast\(/);
});

test('somente bancos permitidos, sem tokens, e sugestões cifradas e limitadas', () => {
  const src = read('native/android/WalletBankNotificationStore.java');
  assert.match(src, /getBoolean\("enabled", false\)/);
  assert.match(src, /getStringSet\("packages"/);
  assert.match(src, /!enabled\(context\)/);
  assert.match(src, /label\(pkg\) == null/);
  assert.match(src, /packages\(context\).contains\(pkg\)/);
  assert.match(src, /BLOCKED\.matcher\(raw\)\.find\(\)/);
  assert.match(src, /AMOUNT\.matcher\(raw\)/);
  assert.match(src, /"AndroidKeyStore"/);
  assert.match(src, /"AES\/GCM\/NoPadding"/);
  assert.match(src, /MAX_PENDING = 40/);
  assert.match(src, /RETENTION = 72L/);
  assert.match(src, /put\("cents", cents\)/);
  assert.doesNotMatch(src, /put\("raw"|put\("title"|put\("message"|Log\.d\(/);
  assert.match(src, /setProfile\(Context context, String profile\)/);
  assert.match(src, /putBoolean\("enabled", false\)/);
  assert.match(src, /"seen"/);
});

test('tela de revisão exige confirmação e usa escrita financeira existente', () => {
  const screen = read('features/wallet/pages/WalletBankNotificationsPage.tsx');
  const modal = read('components/wallet/QuickExpenseModal.tsx');
  const routes = read('features/wallet/routes.tsx');
  const menu = read('features/wallet/components/WalletExpenseFab.tsx');
  const shell = read('layout/AppShell.tsx');
  assert.match(routes, /route === 'notificacoes'/);
  assert.match(routes, /segment === 'notificacoes'/);
  assert.doesNotMatch(read('features/wallet/WalletModule.tsx'), /notificacoes'.*WALLET_ROUTES/);
  assert.match(menu, /Notificações bancárias/);
  assert.match(screen, /<ReviewNotification/);
  assert.match(screen, /<QuickExpenseModal/);
  assert.match(screen, /requireExplicitDestination/);
  assert.match(screen, /setBankNoticePackages/);
  assert.match(screen, /openBankNoticeSettings/);
  assert.match(screen, /dismissBankNotice\(item\.id\)/);
  assert.match(modal, /notificationPrefill\?/);
  assert.match(modal, /requireExplicitDestination/);
  assert.match(modal, /if \(!selectedAccountId\)/);
  assert.match(modal, /if \(!selectedCardId\)/);
  assert.match(shell, /bindBankNotificationsProfile\(activeUser\?\.id \|\| null\)/);
  assert.match(shell, /bindBankNotificationsProfile\(null\)/);
  assert.doesNotMatch(screen, /supabase\.from\(|supabase\.rpc\(/);
  assert.doesNotMatch(screen, /createExpense\(|recordAccountOperation\(/);
});

test('ponte nativa não envia conteúdo de notificações para servidor ou LLM', () => {
  const bridge = read('features/wallet/bankNotificationsBridge.ts');
  assert.match(bridge, /registerPlugin<NativeBankPlugin>\('WalletBankNotifications'\)/);
  assert.match(bridge, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.doesNotMatch(bridge, /fetch\(|supabase|gemini|openrouter|Groq/);
});
