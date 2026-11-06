import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('memória cifrada é vinculada ao usuário e não grava mensagens no localStorage/Supabase', () => {
  const src = read('services/ai/fluxLocalMemory.ts');
  const ui = read('components/ai/MasterMascot.tsx');
  assert.match(src, /AES-GCM/);
  assert.match(src, /extractable: false|256 }, false, \['encrypt', 'decrypt'\]/);
  assert.match(src, /additionalData: new TextEncoder\(\)\.encode\(id\)/);
  assert.match(src, /JSON\.stringify\(\[profileId, conversationId\]\)/);
  assert.match(src, /RETENTION_MS = 30/);
  assert.doesNotMatch(src, /localStorage\.setItem/);
  assert.match(ui, /loadFluxMemory/);
  assert.match(ui, /saveFluxMemory/);
  assert.match(ui, /clearFluxMemory/);
  assert.match(ui, /authorizedProfileRef\.current !== profileId/);
  assert.match(ui, /Conversa cifrada neste aparelho/);
  assert.doesNotMatch(ui, /localStorage\.setItem\([^,]+,\s*messages/);
});

test('os balões são acionados por eventos financeiros internos e jamais por consulta contínua à IA', () => {
  const ui = read('components/ai/MasterMascot.tsx');
  const shell = read('layout/AppShell.tsx');
  const rules = read('components/ai/fluxCuePolicy.ts');
  assert.match(shell, /<MasterMascot activeUser=\{activeUser\} notifications=\{notifications\}/);
  assert.match(ui, /cueForNotification/);
  assert.match(ui, /mayShowFluxCue/);
  assert.match(ui, /Balões: /);
  assert.match(ui, /shownToday/);
  assert.match(ui, /setTimeout\(\(\) => setCue\(null\), 8_000\)/);
  assert.match(ui, /disabled=\{privacyHidden\}/);
  assert.doesNotMatch(rules, /supabase|fetch\(/);
  assert.doesNotMatch(ui, /setInterval/);
  assert.match(ui, /const requestAlerts = async/);
});

test('APK ainda não possui serviço nativo para interceptar notificações de apps bancários', () => {
  const activity = read('native/android/MainActivity.java');
  assert.doesNotMatch(activity, /registerPlugin\(BankNotificationReaderPlugin\.class\)/);
  assert.doesNotMatch(activity, /NotificationListenerService/);
  const webNotifications = read('services/notification.service.ts');
  assert.match(webNotifications, /new Notification\(title, options\)/);
});
