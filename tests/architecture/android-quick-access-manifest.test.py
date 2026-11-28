"""Exercise the actual CI native-shell patch twice in an isolated generated project."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]

class NativeShellTest(unittest.TestCase):
    def test_manifest_is_idempotent_and_plugin_is_copied(self):
        with tempfile.TemporaryDirectory(prefix="capitalflow-native-test-") as directory:
            root = Path(directory)
            script = root / "scripts/android/apply-native-shell.py"
            script.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / "scripts/android/apply-native-shell.py", script)
            shutil.copytree(ROOT / "native/android", root / "native/android")
            manifest = root / "android/app/src/main/AndroidManifest.xml"
            manifest.parent.mkdir(parents=True)
            manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity"></activity></application></manifest>', encoding="utf-8")
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            first = manifest.read_bytes()
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            self.assertEqual(first, manifest.read_bytes())
            tree = ET.parse(manifest)
            key = "{http://schemas.android.com/apk/res/android}name"
            self.assertEqual(sum(e.get(key) == "android.permission.POST_NOTIFICATIONS" for e in tree.findall("uses-permission")), 1)
            plugin = root / "android/app/src/main/java/com/socrateslever/capitalflow/WalletQuickAccessPlugin.java"
            self.assertEqual(plugin.read_bytes(), (ROOT / "native/android/WalletQuickAccessPlugin.java").read_bytes())

if __name__ == "__main__":
    unittest.main()
