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
  assert(!native.includes('FLAG_GRANT_READ_URI_PERMISSION'));
  assert(native.includes('params.setRequireUserAction('));
  assert(native.includes('USER_ACTION_NOT_REQUIRED'));
  assert(nativeShellScript.includes('android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION'));
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
  assert(!shell.includes('<AndroidNativeUpdateNotice />'), 'native update must not cover screens');
  const header = readFileSync('layout/HeaderBar.tsx', 'utf8');
  assert(header.includes('<AndroidNativeUpdateNotice placement="notifications" />'));
});

test('Android update never leaks technical exceptions or network internals to the user', () => {
  const native = readFileSync('native/android/CapitalFlowApkInstallerPlugin.java', 'utf8');
  const receiver = readFileSync('native/android/CapitalFlowInstallStatusReceiver.java','utf8');
  const messages = readFileSync('utils/androidUpdateMessages.ts','utf8');
  assert(source.includes('friendlyAndroidUpdateError(status.message)'));
  assert(source.includes('friendlyAndroidUpdateError(error)'));
  assert(!source.includes('error instanceof Error ? error.message'));
  assert(!source.includes('status.message ||'));
  assert(!native.includes('private static String safeError('));
  assert(!native.includes('"Falha na atualização: " +'));
  assert(!receiver.includes('reason = reason + " Detalhe técnico: "'));
  assert(!receiver.includes('error.getClass().getSimpleName()'));
  assert(messages.includes('Não foi possível baixar a atualização'));
  assert(!messages.includes('return error.message'));
});

test('native installer retries interrupted transfers and rechecks the downloaded file', () => {
  const native = readFileSync('native/android/CapitalFlowApkInstallerPlugin.java', 'utf8');
  assert(native.includes('MAX_DOWNLOAD_ATTEMPTS = 3'));
  assert(native.includes('downloadWithRetries('));
  assert(native.includes('getContentLengthLong()'));
  assert(native.includes('count != expectedLength'));
  assert(native.includes('actual.equals(checksum)'));
  assert(native.includes('verifyPackageAndCertificate(temp)'));
  assert(native.includes('MessageDigest.isEqual'));
  assert(native.includes('temp.delete()'));
});

test('mobile notification panel stays within screen and lets long messages scroll', () => {
  const header = readFileSync('layout/HeaderBar.tsx','utf8');
  // Portalling escapes the sticky header backdrop, which is a CSS containing block.
  assert(header.includes("import { createPortal } from 'react-dom'"));
  assert(header.includes("createPortal(renderNotificationList(true), document.body)"));
  assert(header.includes('mobileNotificationPanelRef'));
  assert(header.includes('mobileNotificationPanelRef.current?.contains(event.target as Node)'));
  assert(header.includes('bottom-[calc('));
  assert(header.includes('touch-pan-y'));
  assert(header.includes('overflow-y-auto'));
  const nativeNotice = readFileSync('components/system/AndroidNativeUpdateNotice.tsx','utf8');
  assert(nativeNotice.includes('break-words'));
  assert(nativeNotice.includes('aria-live="polite"'));
});
