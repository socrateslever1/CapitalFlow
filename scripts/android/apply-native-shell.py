#!/usr/bin/env python3
"""Apply narrowly scoped native Android customizations to disposable Capacitor CI output."""
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parents[2]
manifest = root / "android/app/src/main/AndroidManifest.xml"
target = root / "android/app/src/main/java/com/socrateslever/capitalflow/MainActivity.java"
source = root / "native/android/MainActivity.java"

if not manifest.is_file() or not source.is_file():
    raise SystemExit("Missing generated Android manifest or controlled MainActivity template")

text = manifest.read_text(encoding="utf-8")
if text.count("<application") != 1:
    raise SystemExit("Unexpected AndroidManifest: application tag is missing or duplicated")
if 'android:enableOnBackInvokedCallback' in text:
    text = re.sub(
        r'android:enableOnBackInvokedCallback="[^"]+"',
        'android:enableOnBackInvokedCallback="false"',
        text,
    )
else:
    text = text.replace(
        "<application",
        '<application android:enableOnBackInvokedCallback="false"',
        1,
    )
manifest.write_text(text, encoding="utf-8")
target.parent.mkdir(parents=True, exist_ok=True)
# Add Android intent targets only to the activity; avoid granting file access to other components.
activity_tag = "<activity"
if text.count(activity_tag) != 1:
    raise SystemExit("Expected exactly one Capacitor activity")
intent_filters = """
        <!-- User-controlled bank statements opened from Gmail/file managers. -->
        <intent-filter android:label="Abrir fatura no CapitalFlow">
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="content" />
            <data android:mimeType="application/pdf" />
            <data android:mimeType="application/x-ofx" />
            <data android:mimeType="application/ofx" />
            <data android:mimeType="application/vnd.intu.qfx" />
            <data android:mimeType="application/octet-stream" />
        </intent-filter>
        <intent-filter android:label="Compartilhar fatura com CapitalFlow">
            <action android:name="android.intent.action.SEND" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:mimeType="application/pdf" />
            <data android:mimeType="application/x-ofx" />
            <data android:mimeType="application/ofx" />
            <data android:mimeType="application/vnd.intu.qfx" />
            <data android:mimeType="application/octet-stream" />
        </intent-filter>
"""
end = text.find("</activity>")
if end < 0:
    raise SystemExit("Missing closing activity tag")
if 'Abrir fatura no CapitalFlow' not in text:
    text = text[:end] + intent_filters + text[end:]
manifest.write_text(text, encoding="utf-8")
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, target)
shutil.copyfile(root / "native/android/WalletFileInboxPlugin.java", target.with_name("WalletFileInboxPlugin.java"))
shutil.copyfile(root / "native/android/CapitalFlowApkInstallerPlugin.java", target.with_name("CapitalFlowApkInstallerPlugin.java"))
shutil.copyfile(root / "native/android/CapitalFlowInstallStatusReceiver.java", target.with_name("CapitalFlowInstallStatusReceiver.java"))

# Retain the old constrained FileProvider for compatibility with previous
# native shells. The updater now stages through PackageInstaller.Session.
application_close = "</application>"
if text.count(application_close) != 1:
    raise SystemExit("Unexpected AndroidManifest: application close tag missing")
provider = '''
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.capitalflowapk"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/capitalflow_apk_file_paths"/>
        </provider>
'''
if 'android:authorities="${applicationId}.capitalflowapk"' not in text:
    text = text.replace(application_close, provider + application_close, 1)
# Explicit system-install callback. Not exported to other Android apps.
receiver = '''
        <receiver
            android:name=".CapitalFlowInstallStatusReceiver"
            android:enabled="true"
            android:exported="false"/>
'''
if 'android:name=".CapitalFlowInstallStatusReceiver"' not in text:
    text = text.replace(application_close, receiver + application_close, 1)
if 'android.permission.REQUEST_INSTALL_PACKAGES' not in text:
    text = text.replace('<application',
        '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>\n    <application', 1)
if 'android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION' not in text:
    text = text.replace('<application',
        '<uses-permission android:name="android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION"/>\n    <application', 1)
manifest.write_text(text, encoding="utf-8")
xml_directory = root / "android/app/src/main/res/xml"
xml_directory.mkdir(parents=True, exist_ok=True)
(xml_directory / "capitalflow_apk_file_paths.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<paths xmlns:android="http://schemas.android.com/apk/res/android">'
    '<cache-path name="verified_signed_apks" path="capitalflow-apk/"/>'
    '</paths>\n', encoding="utf-8")

print("Native wallet inbox, session installer, private status receiver and system-bar insets installed")
