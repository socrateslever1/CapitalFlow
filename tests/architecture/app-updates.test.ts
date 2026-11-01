import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parsePublishedVersion, isNewPublishedVersion } from '../../utils/appVersion';
import { claimReleaseNotice, releaseNoticeKey, dismissReleaseNotice, isReleaseNoticeDismissed, type NoticeStorage } from '../../utils/releaseNotice';

const read = (file: string) => readFileSync(file, 'utf8');

test('Vite publishes a verifiable marker for every built release', () => {
  assert.ok(existsSync('dist/version.json'), 'Build output missing version.json');
  const payload = JSON.parse(read('dist/version.json'));
  const version = parsePublishedVersion(payload);
  assert.ok(version, 'Malformed version manifest');
  assert.equal(version.buildId, payload.buildId);
  assert.equal(isNewPublishedVersion(payload.buildId, version), false);
  assert.equal(isNewPublishedVersion('old-release-123456', version), true);
  assert.ok(readdirSync('dist/assets').some(name =>
    name.endsWith('.js') && read('dist/assets/' + name).includes(payload.buildId)
  ), 'Published JS bundle must contain the same version ID');
  const config = read('vite.config.ts');
  assert.match(config, /publishedVersionPlugin\(buildId\)/);
  assert.match(config, /__CAPITALFLOW_BUILD_ID__/);
  assert.match(config, /CF_PAGES_COMMIT_SHA/);
});

test('Reject HTML SPA fallbacks, malformed payloads and silent updates', () => {
  for (const input of [
    null, undefined, '', '<html>...', {}, [], { buildId: null },
    { buildId: 'x' }, { version: '123456789012' },
    { buildId: '<script>evil</script>' },
  ]) {
    assert.equal(parsePublishedVersion(input), null);
  }
  assert.equal(isNewPublishedVersion('1234567890', null), false);
  assert.deepEqual(parsePublishedVersion({ buildId: 'build_123456789' }), { buildId: 'build_123456789' });
});

test('Background polling offers a button without forced reloads', () => {
  const banner = read('components/system/AppUpdateBanner.tsx');
  const main = read('main.tsx');
  const sw = read('public/service-worker.js');
  const headers = read('public/_headers');

  assert.doesNotMatch(main, /<AppUpdateBanner\s*\/>/, 'updates must never render as overlays');
  assert.match(banner, /Atualização disponível/);
  assert.match(banner, /Atualizar agora/);
  assert.match(banner, /CHECK_INTERVAL_MS = 60_000/);
  assert.match(banner, /cache: 'no-store'/);
  assert.match(banner, /application\/json/);
  assert.match(banner, /visibilitychange/);
  assert.match(banner, /online/);
  assert.match(banner, /focus/);
  assert.match(banner, /navigator\.onLine/);
  assert.match(banner, /window\.location\.reload\(\)/);
  assert.match(banner, /registration\.waiting\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(banner, /dismissReleaseNotice/);
  assert.doesNotMatch(main, /activateWaitingWorker/);
  assert.doesNotMatch(main, /serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(sw, /event\.waitUntil\(cacheAppShell\(\)\)/);
  assert.doesNotMatch(sw, /cacheAppShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(sw, /PUSH_NAVIGATE/);
  assert.match(headers, /\/version\.json\s+Cache-Control: no-store/);
});

test('release notices are claimed once for each version and independently for each platform', () => {
  const values = new Map<string, string>();
  const store: NoticeStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => { values.set(key, value); },
  };
  assert.equal(claimReleaseNotice('web-update', 'release-web-a', store), true);
  assert.equal(claimReleaseNotice('web-update', 'release-web-a', store), false);
  assert.equal(values.get(releaseNoticeKey('web-update')), 'release-web-a');
  assert.equal(claimReleaseNotice('web-update', 'release-web-b', store), true);
  assert.equal(claimReleaseNotice('android-install', 'release-web-b', store), true);
  assert.equal(claimReleaseNotice('android-update', '100245', store), true);
  assert.equal(claimReleaseNotice('android-update', '100245', store), false);
  assert.equal(claimReleaseNotice('android-update', '100246', store), true);
  assert.equal(claimReleaseNotice('web-update', '<script>', store), false);
  assert.equal(claimReleaseNotice('android-update', '', store), false);
});

test('release-specific refusals hide notices until the next release', () => {
  const values = new Map<string, string>();
  const store: NoticeStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => { values.set(key, value); },
  };
  for (const kind of ['android-install', 'android-update', 'web-update'] as const) {
    assert.equal(isReleaseNoticeDismissed(kind, 'version-200', store), false);
    dismissReleaseNotice(kind, 'version-200', store);
    assert.equal(isReleaseNoticeDismissed(kind, 'version-200', store), true);
    assert.equal(isReleaseNoticeDismissed(kind, 'version-201', store), false);
  }
  assert.equal(isReleaseNoticeDismissed('web-update', 'invalid version', store), false);
});

test('updates only appear inside notification bell and never cover the screen', () => {
  const browser = read('components/system/AndroidApkNotice.tsx');
  const native = read('components/system/AndroidNativeUpdateNotice.tsx');
  const web = read('components/system/AppUpdateBanner.tsx');
  const header = read('layout/HeaderBar.tsx');
  const shell = read('layout/AppShell.tsx');
  const main = read('main.tsx');
  assert.match(header, /<AndroidApkNotice placement="notifications"\s*\\/>/);
  assert.match(header, /<AppUpdateBanner placement="notifications"\s*\\/>/);
  assert.match(header, /<AndroidNativeUpdateNotice placement="notifications"\s*\\/>/);
  assert.doesNotMatch(shell, /<AndroidApkNotice placement="banner"\s*\\/>/);
  assert.doesNotMatch(shell, /<AndroidNativeUpdateNotice\s*\\/>/);
  assert.doesNotMatch(main, /<AppUpdateBanner\s*\\/>/);
  for (const source of [browser, native, web]) {
    assert.match(source, /dismissReleaseNotice/, 'refusal must persist');
    assert.match(source, /isReleaseNoticeDismissed/, 'dismissed notices stay hidden');
    assert.match(source, /Agora não/, 'refusal action required');
    assert.doesNotMatch(source, /<aside/, 'do not render floating notice');
    assert.doesNotMatch(source, /fixed bottom-/, 'do not render screen overlay');
  }
});
