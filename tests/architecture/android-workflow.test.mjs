import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yaml = readFileSync('.github/workflows/android-apk.yml', 'utf8');
test('android workflow contains clean, independent build, verification and upload steps', () => {
  const names = [...yaml.matchAll(/^      - name: ([^\n]+)/gm)].map(m => m[1]);
  for (const step of [
    'Install locked dependencies',
    'Validate architecture and financial invariants',
    'Assemble Android debug APK',
    'Validate APK structure, signature and SHA-256',
    'Publish verified APK and checksum',
  ]) assert.equal(names.filter(name => name === step).length, 1, step);
  const verifyPos = yaml.indexOf('      - name: Validate APK structure');
  const uploadPos = yaml.indexOf('      - name: Publish verified APK');
  assert(verifyPos > 0 && uploadPos > verifyPos, 'artifact publication must follow verification');
  const verifyBlock = yaml.slice(verifyPos, uploadPos);
  assert(verifyBlock.includes('"$signer" verify "$apk"'), 'debug APK must have a valid Android signature');
  assert(verifyBlock.includes('sha256sum "$apk"'), 'debug APK must have SHA-256 checksum');
  assert(!verifyBlock.includes('actions/upload-artifact@'), 'YAML verification block contains upload code');
  assert(yaml.includes('npm ci --no-audit --no-fund'), 'locked dependency installation required');
  assert(yaml.includes('android-actions/setup-android@v4'), 'SDK setup must not request removed tools package');
  assert(yaml.includes('rm -rf android') && yaml.includes('npx cap add android'), 'CI must replace documentation-only android folder with generated native project');
  assert(yaml.includes('test -s android/app/src/main/assets/public/index.html'), 'bundled APK must include built SPA');
  assert(yaml.includes('pull_request:'), 'Android build must run on pull requests before merging');
  assert(!yaml.includes('service_role') && !yaml.includes('sb_secret_'), 'private credentials prohibited');
});

test('the native app does not start the SaaS service worker or development cache cleaner', () => {
  const main = readFileSync('main.tsx', 'utf8');
  const reset = readFileSync('public/dev-cache-reset.js', 'utf8');
  const config = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
  assert(main.includes('import.meta.env.PROD && !isNativeCapacitor'), 'avoid web service worker inside native bundle');
  assert(reset.includes('if (!isLocalDev || isNativeCapacitor) return;'), 'do not clear native app caches on boot');
  assert.equal(config.appId, 'com.socrateslever.capitalflow');
  assert.equal(config.server?.androidScheme, 'https');
  assert(!config.server?.url, 'production native code must be bundled, not remotely loaded via a development URL');
});

test('main workflow publishes a persistent download URL only after APK verification', () => {
  const publish = yaml.indexOf('      - name: Publish stable test APK to GitHub Releases');
  const verify = yaml.indexOf('      - name: Validate APK structure');
  const artifact = yaml.indexOf('      - name: Publish verified APK and checksum');
  assert(publish > artifact && artifact > verify, 'release must follow signed APK verification');
  const section = yaml.slice(publish);
  assert(section.includes("github.event_name == 'push'"), 'never publish from pull requests');
  assert(section.includes("github.ref == 'refs/heads/main'"), 'publish only on main');
  assert(section.includes('GH_TOKEN:'), 'use workflow-scoped GitHub token');
  assert(section.includes('gh release upload'), 'upload installable APK as release asset');
  assert(section.includes('CapitalFlow-Android.apk'), 'publish a stable APK filename');
  assert(section.includes('sha256sum CapitalFlow-Android.apk'), 'provide the checksum of the renamed file');
  assert(section.includes('android-preview'), 'keep a stable tag instead of a disposable action artifact');
  assert(yaml.includes('contents: write'), 'publishing release requires write permission');
});
