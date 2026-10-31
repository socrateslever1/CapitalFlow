import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('iPhone e Android compartilham o mesmo appId e webDir', () => {
  const cfg = JSON.parse(readFileSync('capacitor.config.json','utf8'));
  assert.equal(cfg.appId, 'com.socrateslever.capitalflow');
  assert.equal(cfg.appName, 'CapitalFlow');
  assert.equal(cfg.webDir, 'dist');
  assert.equal(cfg.server?.url, undefined, 'APK/IPA não pode apontar para domínio remoto em produção');
});

test('build para simulador usa Capacitor 7 e não publica apps sem assinatura', () => {
  const workflow = readFileSync('.github/workflows/ios-build-validation.yml','utf8');
  const pkg = JSON.parse(readFileSync('package-lock.json','utf8'));
  const core = pkg.packages['node_modules/@capacitor/core']?.version;
  assert.equal(core,'7.6.10');
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /@capacitor\/cli@7\.6\.10 @capacitor\/ios@7\.6\.10/);
  assert.match(workflow, /npx --no-install cap add ios/);
  assert.match(workflow, /npx --no-install cap sync ios/);
  assert.match(workflow, /-sdk iphonesimulator/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.doesNotMatch(workflow,/app-store|testflight|upload-app|fastlane pilot|apple-actions\/upload-testflight/);
});

test('o app web pode ser instalado como PWA no iPhone antes da versão nativa', () => {
  const html = readFileSync('index.html','utf8');
  const manifest = JSON.parse(readFileSync('public/manifest.json','utf8'));
  assert.match(html,/apple-mobile-web-app-title/);
  assert.match(html,/apple-touch-icon/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name,'CapitalFlow');
});
