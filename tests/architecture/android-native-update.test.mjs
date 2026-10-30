import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('components/system/AndroidNativeUpdateNotice.tsx', 'utf8');
const shell = readFileSync('layout/AppShell.tsx', 'utf8');

test('native Android checks the official signed release against its installed versionCode', () => {
  assert(source.includes("import { App } from '@capacitor/app'"));
  assert(source.includes('App.getInfo()'));
  assert(source.includes('Number(info.build)'));
  assert(source.includes('versionCode <= installedCode'));
  assert(source.includes('Capacitor.isNativePlatform()'));
  assert(source.includes("Capacitor.getPlatform() !== 'android'"));
  assert(source.includes('RELEASE_API'));
  assert(source.includes('asset.name') || source.includes("item.name === 'CapitalFlow-Android.apk'"));
});
test('APK update can only use the canonical GitHub signed release asset', () => {
  assert(source.includes("link.protocol !== 'https:'"));
  assert(source.includes("link.hostname !== 'github.com'"));
  assert(source.includes('link.pathname !== RELEASE_ASSET_PATH'));
  assert(source.includes('href={update.downloadUrl}'));
  assert(source.includes('App.addListener(\'resume\''));
  assert(shell.includes('<AndroidNativeUpdateNotice />'));
});
