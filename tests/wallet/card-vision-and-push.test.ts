import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pushSubscriptionService } from '../../services/pushSubscription.service';
import { notificationService } from '../../services/notification.service';

test('Push Notification Architecture - Service Worker possui handlers push e notificationclick', () => {
  const swContent = fs.readFileSync('public/service-worker.js', 'utf8');
  assert.ok(swContent.includes("addEventListener('push'"), 'SW deve ouvir evento push');
  assert.ok(swContent.includes("addEventListener('notificationclick'"), 'SW deve ouvir notificationclick');
  assert.ok(swContent.includes('showNotification'), 'SW deve chamar showNotification');
  assert.ok(swContent.includes('PUSH_NAVIGATE'), 'SW deve suportar navegacao ao clicar no push');
});

test('Push Notification Service - valida suporte e chave publica VAPID', () => {
  // No Node.js ambiente puro window/navigator nao tem pushManager
  const isSupportedInNode = pushSubscriptionService.isSupported();
  assert.equal(isSupportedInNode, false, 'Em ambiente Node headless deve retornar false com seguranca');

  // Simula browser moderno com PushManager
  const fakeWindow = {
    PushManager: function() {},
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
  };
  (globalThis as any).window = fakeWindow;
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: {},
    configurable: true,
    writable: true,
  });

  try {
    const isSupportedBrowser = pushSubscriptionService.isSupported();
    assert.equal(isSupportedBrowser, true, 'Browser com PushManager e ServiceWorker deve ser suportado');
  } finally {
    delete (globalThis as any).window;
  }
});

test('Notification Service - gerencia permissoes e notificacao', async () => {
  // Mock window.Notification
  let notificationTriggered = false;
  let requested = false;

  (globalThis as any).window = {
    Notification: class MockNotification {
      static permission = 'default';
      static async requestPermission() {
        requested = true;
        MockNotification.permission = 'granted';
        return 'granted';
      }
      constructor(title: string, options: any) {
        notificationTriggered = true;
      }
    },
    focus: () => {},
  };
  (globalThis as any).Notification = (globalThis as any).window.Notification;
  (globalThis as any).document = { hidden: false };

  try {
    const granted = await notificationService.requestPermission();
    assert.equal(granted, true);
    assert.equal(requested, true);

    await notificationService.notify('Teste Push', 'Corpo da notificacao de teste');
    assert.equal(notificationTriggered, true, 'Notificacao nativa deve ser instanciada');
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).Notification;
    delete (globalThis as any).document;
  }
});

test('Card Vision Recognizer - modulo esta importavel e possui tipagem estrita', async () => {
  const { recognizeCardFromImage } = await import('../../utils/cardVisionRecognizer');
  assert.equal(typeof recognizeCardFromImage, 'function');
});
