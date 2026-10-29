import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yaml = readFileSync('.github/workflows/android-apk.yml', 'utf8');
test('android workflow contains clean, independent build, verification and upload steps', () => {
  const names = [...yaml.matchAll(/^      - name: ([^\r\n]+)/gm)].map(m => m[1].trim());
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

test('public Android APK only comes from a permanent release signature', () => {
  assert(!yaml.includes('Publish stable test APK to GitHub Releases'),
    'a new debug signing key must never overwrite the public installer');
  assert(yaml.includes('Publish update-compatible APK with immutable signing identity'));
  assert(yaml.includes('gh release upload "$tag"'), 'publish permanently signed APK');
  assert(yaml.includes('for tag in android-signed-beta android-preview'),
    'existing link must be preserved after signing setup');
  assert(yaml.includes('new_cert" != "$prior_cert"'),
    'reject incompatible signatures from new release');
  assert(yaml.includes('new_code <= prior_code'),
    'reject Android version downgrades or unchanged versionCode');
  assert(yaml.includes('com.socrateslever.capitalflow'), 'validate Android package identity');
  assert(yaml.includes('contents: write'), 'publishing requires GitHub write permissions');
});

test('Android production APK uses a permanent signing secret, monotonic code and release build', () => {
  const start = yaml.indexOf('      - name: Check permanent Android signing credentials');
  const build = yaml.indexOf('      - name: Compile Android release package');
  const sign = yaml.indexOf('      - name: Sign and verify Android release APK');
  const publish = yaml.indexOf('      - name: Publish update-compatible APK with immutable signing identity');
  assert(start > 0 && build > start && sign > build && publish > sign);
  const release = yaml.slice(start);
  for(const secret of ['ANDROID_RELEASE_KEYSTORE_BASE64', 'ANDROID_RELEASE_STORE_PASSWORD', 'ANDROID_RELEASE_KEY_ALIAS', 'ANDROID_RELEASE_KEY_PASSWORD'])
    assert(release.includes('secrets.' + secret), 'Secret must be provided via GitHub Actions, not source code: ' + secret);
  assert.match(release, /enabled=false/);
  assert.match(release, /steps.signing.outputs.enabled == 'true'/);
  assert.match(release, /assembleRelease/);
  assert.match(release, /versionCode/);
  assert.match(release, /GITHUB_RUN_NUMBER/);
  assert.match(release, /zipalign/);
  assert.match(release, /apksigner/);
  assert.match(release, /--ks-pass env:CF_STORE_PASSWORD/);
  assert.match(release, /CN=Android Debug/);
  assert.match(release, /android-signed-beta/);
  assert.match(release, /sha256sum CapitalFlow-Android.apk/);
  assert.doesNotMatch(release, /echo "\$CF_KEYSTORE_B64"|echo "\$CF_STORE_PASSWORD"/);
});

test('mobile APK CI watches actual auth, wallet and responsive style sources', () => {
  const filters = ['index.css', 'brand.css', 'features/**', 'containers/**', 'contexts/**', 'hooks/**', 'layout/**', 'services/**', 'utils/**', 'src/**', 'assets/**', 'types.ts'];
  const dispatch = yaml.indexOf('  pull_request:');
  const push = yaml.indexOf('  push:');
  const permissions = yaml.indexOf('\npermissions:');
  const prConfig = yaml.slice(dispatch, push);
  const pushConfig = yaml.slice(push, permissions);
  for (const path of filters) {
    assert(prConfig.includes("'" + path + "'"), 'PR APK must rebuild on ' + path);
    assert(pushConfig.includes("'" + path + "'"), 'main APK must rebuild on ' + path);
  }
});

test('signing key is provisioned on the owner computer, not stored in source control', () => {
  const setup = readFileSync('scripts/setup-android-release-signing.sh', 'utf8');
  assert(setup.includes('keytool -genkeypair'), 'setup creates owner-controlled keystore');
  assert(setup.includes('gh secret set ANDROID_RELEASE_KEYSTORE_BASE64'));
  assert(setup.includes('gh secret set ANDROID_RELEASE_STORE_PASSWORD'));
  assert(setup.includes('gh secret set ANDROID_RELEASE_KEY_ALIAS'));
  assert(setup.includes('gh secret set ANDROID_RELEASE_KEY_PASSWORD'));
  assert(setup.includes('gh workflow run android-apk.yml'), 'setup triggers signed build');
  assert(setup.includes('if [[ ! -f "$keyfile" ]]'), 'must reuse existing signing key');
  assert(!setup.includes('echo "$CF_SIGN_PASSWORD"'), 'never log password');
});

test('signed APK certificate parser supports Android v3 signer labels', () => {
  const labels = [
    'Signer #1 certificate SHA-256 digest: D878990798BA77E325AC3385B571FA24FA589EED358CADA6705AB8AB5363AE5D',
    'V3.0 Signer: certificate SHA-256 digest: d878990798ba77e325ac3385b571fa24fa589eed358cada6705ab8ab5363ae5d',
  ];
  const certificateDigest = line => line.match(/certificate SHA-256 digest: ([0-9a-fA-F]{64})/)?.[1]?.toLowerCase() || '';
  assert.equal(certificateDigest(labels[0]), certificateDigest(labels[1]));
  assert.equal(certificateDigest('no certificate'), '');
  const publication = yaml.slice(yaml.indexOf('      - name: Publish update-compatible APK'));
  assert(publication.includes('verify --verbose --print-certs'), 'inspect v3 signer when checking stable key');
  assert(publication.includes('certificate SHA-256 digest:'), 'match the digest independent of signer label');
  assert(!publication.includes('/Signer #1 certificate SHA-256 digest:/'),
    'hard-coded signer labels produce false certificate mismatch for v3 APKs');
  assert(publication.includes('prior_cert'), 'check the previous release');
  assert(publication.includes('new_cert'), 'check the current release');
});

test('Android CI injects real native Back callback and rebuilds when native sources change', () => {
  const native = readFileSync('native/android/MainActivity.java', 'utf8');
  const patch = readFileSync('scripts/android/apply-native-shell.py', 'utf8');
  assert(yaml.includes('Install native Android navigation and system-bar policy'));
  assert(yaml.includes('python3 scripts/android/apply-native-shell.py'));
  assert(yaml.includes("'native/android/**'"));
  assert(yaml.includes("'scripts/android/**'"));
  assert(native.includes('getOnBackPressedDispatcher().addCallback'));
  assert(native.includes('triggerWindowJSEvent("capitalflow:android-back")'));
  assert(patch.includes('enableOnBackInvokedCallback'));
});

test('CI rejects builds missing the Android 15+ system bar native inset policy', () => {
  const activity = readFileSync('native/android/MainActivity.java', 'utf8');
  const workflow = yaml;
  assert(activity.includes('WindowCompat.setDecorFitsSystemWindows(getWindow(), false)'));
  assert(activity.includes('WindowInsetsCompat.Type.systemBars()'));
  assert(activity.includes('WindowInsetsCompat.Type.displayCutout()'));
  assert(activity.includes('setInsets(insetTypes, Insets.NONE)'));
  assert(workflow.includes("grep -q 'WindowCompat.setDecorFitsSystemWindows'"));
  assert(workflow.includes("grep -q 'WindowInsetsCompat.Type.displayCutout'"));
  assert(workflow.includes("grep -q 'Insets.NONE'"));
});

test('official CapitalFlow CF icon is packaged into Android installer on every build', () => {
  const mark = readFileSync('assets/branding/capitalflow-mark.webp');
  assert(mark.length > 2000, 'the approved CF artwork must be present, not a placeholder');
  assert.equal(mark.toString('ascii', 0, 4), 'RIFF');
  assert.equal(mark.toString('ascii', 8, 12), 'WEBP');
  const script = readFileSync('scripts/android/install_launcher_icon.py', 'utf8');
  assert(script.includes("'assets/branding/capitalflow-mark.webp'"));
  for(const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])
    assert(script.includes("'" + density + "'"), 'missing launcher density ' + density);
  for(const icon of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_monochrome.png'])
    assert(script.includes(icon), 'missing legacy/adaptive themed icon ' + icon);
  assert(script.includes('mipmap-anydpi-v26'), 'must publish adaptive icon on Android 8+');
  assert(script.includes("('icon', '@mipmap/ic_launcher')"), 'installer must use the CF logo');
  assert(script.includes("('roundIcon', '@mipmap/ic_launcher_round')"), 'round launcher icon');
  const install = yaml.indexOf('      - name: Install official CapitalFlow icon into Android installer');
  const assemble = yaml.indexOf('      - name: Assemble Android debug APK');
  assert(install > 0 && install < assemble, 'regenerated native res must be changed before assembling debug/release');
  assert(yaml.includes('Pillow==11.3.0'), 'pin reproducible icon generation version');
  assert(yaml.includes('python" scripts/android/install_launcher_icon.py'));
  assert(yaml.includes("'assets/branding/**'"), 'icon asset changes must trigger main APK release');
});
