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
  assert(source.includes("registerPlugin<InAppInstaller>('CapitalFlowApkInstaller')"));
  assert(source.includes('await apkInstaller.downloadAndInstall()'));
  assert(!source.includes('target="_blank"'),'native update must never launch external browser');
  assert(!source.includes('href={update.downloadUrl}'),'native update must not navigate to GitHub');
  const native = readFileSync('native/android/CapitalFlowApkInstallerPlugin.java','utf8');
  const nativeShellScript = readFileSync('scripts/android/apply-native-shell.py','utf8');
  assert(native.includes('verifyPackageAndCertificate'));
  assert(native.includes('downloadChecksum'));
  assert(native.includes('MessageDigest.isEqual'));
  assert(native.includes('PackageInstaller.SessionParams'));
  assert(native.includes('installer.createSession(params)'));
  assert(native.includes('session.openWrite('));
  assert(native.includes('session.commit(pending.getIntentSender())'));
  assert(native.includes('PendingIntent.FLAG_MUTABLE'));
  assert(!native.includes('Intent.ACTION_VIEW'));
  assert(native.includes('consumeInstallStatus'));
  assert(readFileSync('native/android/CapitalFlowInstallStatusReceiver.java','utf8').includes('STATUS_PENDING_USER_ACTION'));
  assert(native.includes('FLAG_GRANT_READ_URI_PERMISSION'));
  assert(native.includes('ACTION_MANAGE_UNKNOWN_APP_SOURCES'));
  assert(nativeShellScript.includes('CapitalFlowApkInstallerPlugin.java'));
  assert(nativeShellScript.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  assert(nativeShellScript.includes('capitalflow_apk_file_paths.xml'));
  assert(nativeShellScript.includes('CapitalFlowInstallStatusReceiver.java'));
  assert(nativeShellScript.includes('android:exported="false"'));
  assert(source.includes('apkInstaller.consumeInstallStatus()'));
  assert(source.includes("status.stage === 'ERROR'"));
  assert(readFileSync('native/android/MainActivity.java','utf8').includes('registerPlugin(CapitalFlowApkInstallerPlugin.class)'));

  assert(source.includes('App.addListener(\'resume\''));
  assert(/<AndroidNativeUpdateNotice\s*\/>/.test(shell));
});
