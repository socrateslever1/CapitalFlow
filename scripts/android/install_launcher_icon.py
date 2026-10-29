#!/usr/bin/env python3
"""Create CapitalFlow launcher/install icons after Capacitor regenerates android/.

The transparent CF artwork is the approved minimalist emblem. The Android
installer reads @mipmap/ic_launcher from AndroidManifest.xml, whereas modern
launchers prefer adaptive, round and Android 13+ monochrome icons.
"""
from pathlib import Path
import re

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/branding/capitalflow-mark.webp'
RES = ROOT / 'android/app/src/main/res'
MANIFEST = ROOT / 'android/app/src/main/AndroidManifest.xml'
NAVY = '#012562'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def save_png(image: Image.Image, folder: Path, name: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    image.save(folder / name, format='PNG', optimize=True)


def generate_legacy(mark: Image.Image, size: int, circular: bool = False) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if circular:
        draw.ellipse((0, 0, size - 1, size - 1), fill=NAVY)
    else:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * .22), fill=NAVY)
    canvas.alpha_composite(mark.resize((size, size), Image.Resampling.LANCZOS))
    return canvas


def install() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f'Original CapitalFlow CF monogram is missing: {SOURCE}')
    if not MANIFEST.is_file():
        raise SystemExit(f'Capacitor Android project has not been generated: {MANIFEST}')

    with Image.open(SOURCE) as source:
        mark = source.convert('RGBA')
    assert mark.width == mark.height and mark.width >= 256, 'CF mark must be a square high-resolution asset'
    assert mark.getextrema()[3][1] > 200, 'CF mark is fully transparent'

    for density, scale in DENSITIES.items():
        size = round(48 * scale)
        folder = RES / f'mipmap-{density}'
        save_png(generate_legacy(mark, size), folder, 'ic_launcher.png')
        save_png(generate_legacy(mark, size, circular=True), folder, 'ic_launcher_round.png')

        # Android adaptive icon canvas is 108dp. The transparent CF occupies
        # the central safe region, so launchers may crop the outer 18dp freely.
        size_108 = round(108 * scale)
        foreground = mark.resize((size_108, size_108), Image.Resampling.LANCZOS)
        foreground_dir = RES / f'drawable-{density}'
        save_png(foreground, foreground_dir, 'ic_launcher_foreground.png')
        # Android 13+ themes recolor the silhouette automatically.
        monochrome = Image.new('RGBA', foreground.size, (255, 255, 255, 0))
        monochrome.putalpha(foreground.getchannel('A'))
        save_png(monochrome, foreground_dir, 'ic_launcher_monochrome.png')

    icon_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/cf_icon_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
'''
    adaptive_dir = RES / 'mipmap-anydpi-v26'
    adaptive_dir.mkdir(parents=True, exist_ok=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        (adaptive_dir / name).write_text(icon_xml, encoding='utf-8')
    color_dir = RES / 'values'
    color_dir.mkdir(parents=True, exist_ok=True)
    (color_dir / 'capitalflow_icon_colors.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="cf_icon_background">#012562</color></resources>\n',
        encoding='utf-8'
    )

    manifest = MANIFEST.read_text(encoding='utf-8')
    if manifest.count('<application') != 1:
        raise SystemExit('Unexpected generated manifest: application element missing or duplicated')
    for prop, resource in (
        ('icon', '@mipmap/ic_launcher'),
        ('roundIcon', '@mipmap/ic_launcher_round'),
    ):
        key = f'android:{prop}'
        if re.search(rf'\b{key}="[^"]+"', manifest):
            manifest = re.sub(rf'\b{key}="[^"]+"', f'{key}="{resource}"', manifest, count=1)
        else:
            manifest = manifest.replace('<application', f'<application {key}="{resource}"', 1)
    MANIFEST.write_text(manifest, encoding='utf-8')
    print('CapitalFlow official CF icon installed in all 5 densities, legacy/round/adaptive/monochrome and AndroidManifest')


if __name__ == '__main__':
    install()
