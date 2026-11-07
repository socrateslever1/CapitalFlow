import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';

const header = readFileSync('layout/HeaderBar.tsx', 'utf8');

test('React portal is not a valid React element for an AnimatePresence direct child', () => {
  const target = { nodeType: 1 };
  const portal = createPortal(createElement('div', null, 'Alertas'), target);
  assert.equal(isValidElement(portal), false, 'an unwrapped portal is filtered out by AnimatePresence');
});

test('mobile bell wraps motion content inside the portal, never the portal inside AnimatePresence', () => {
  assert.match(
    header,
    /createPortal\(\s*<AnimatePresence[^>]*>\s*\{showNotifications\s*&&\s*renderNotificationList\(true\)\}\s*<\/AnimatePresence>\s*,\s*document\.body\s*\)/,
  );
  assert.doesNotMatch(
    header,
    /<AnimatePresence>\s*\{showNotifications\s*&&[^}]*createPortal\(/,
  );
  assert.match(header, /id="btn-notifications-mobile"/);
  assert.match(header, /id="btn-notifications-desktop"/);
  assert.match(header, /aria-expanded=\{showNotifications\}/);
});

test('portal panel is mobile-only; desktop bell retains its own visible dropdown', () => {
  assert.match(header, /'md:hidden fixed inset-x-3/);
  assert.match(header, /showNotifications\s*&&\s*renderNotificationList\(false\)/);
  assert.match(header, /mobileNotificationPanelRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(header, /overflow-y-auto overscroll-contain touch-pan-y/);
  assert.match(header, /<AndroidNativeUpdateNotice placement="notifications"\s*\/>/);
  assert.match(header, /<AndroidApkNotice placement="notifications"\s*\/>/);
  assert.match(header, /<AppUpdateBanner placement="notifications"\s*\/>/);
});
