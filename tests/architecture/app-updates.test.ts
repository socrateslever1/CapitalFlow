import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parsePublishedVersion, isNewPublishedVersion } from '../../utils/appVersion';
import { claimReleaseNotice, releaseNoticeKey, type NoticeStorage } from '../../utils/releaseNotice';

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

  assert.match(main, /<AppUpdateBanner\s*\/>/);
  assert.match(banner, /Nova atualização disponível/);
  assert.match(banner, /Atualizar página/);
  assert.match(banner, /CHECK_INTERVAL_MS = 60_000/);
  assert.match(banner, /cache: 'no-store'/);
  assert.match(banner, /application\/json/);
  assert.match(banner, /visibilitychange/);
  assert.match(banner, /online/);
  assert.match(banner, /focus/);
  assert.match(banner, /navigator\.onLine/);
  assert.match(banner, /window\.location\.reload\(\)/);
  assert.match(banner, /registration\.waiting\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(banner, /setDismissedBuild/);
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

test('all platforms show banners only once, while the bell retains dismissible actions', () => {
  const browser = read('components/system/AndroidApkNotice.tsx');
  const native = read('components/system/AndroidNativeUpdateNotice.tsx');
  const web = read('components/system/AppUpdateBanner.tsx');
  const header = read('layout/HeaderBar.tsx');
  assert.match(browser, /claimReleaseNotice\('android-install', __CAPITALFLOW_BUILD_ID__\)/);
  assert.match(native, /claimReleaseNotice\('android-update', String\(next.versionCode\)\)/);
  assert.match(web, /claimReleaseNotice\('web-update', remote!\.buildId\)/);
  assert.match(header, /<AndroidApkNotice placement="notifications"\s*\/>/);
  assert.match(header, /<AppUpdateBanner placement="notifications"\s*\/>/);
  assert.match(header, /<AndroidNativeUpdateNotice placement="notifications"\s*\/>/);
  assert.match(browser, /placement === 'notifications'/);
  assert.match(native, /placement === 'notifications'/);
  assert.match(web, /placement === 'notifications'/);
  for (const source of [browser, native, web]) {
    assert.match(source, /Agora não/, 'user must be able to refuse an update inside the bell');
  }
  assert.doesNotMatch(browser, /sessionStorage/, 'browser dismissal survives app restarts');
});
