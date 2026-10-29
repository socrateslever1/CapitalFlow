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
shutil.copyfile(source, target)
print("Native navigation bridge and Android predictive-back compatibility installed")
