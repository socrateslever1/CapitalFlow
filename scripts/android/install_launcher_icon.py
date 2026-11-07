#!/usr/bin/env python3
"""Install the approved CapitalFlow CF icon into all Android launchers."""
from io import BytesIO
from pathlib import Path
import re
import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/brand/capitalflow-app-icon.svg'
RES = ROOT / 'android/app/src/main/res'
MANIFEST = ROOT / 'android/app/src/main/AndroidManifest.xml'
NAVY = '#08295d'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

def render(svg: str, size: int) -> Image.Image:
    data = cairosvg.svg2png(bytestring=svg.encode('utf-8'), output_width=size, output_height=size)
    return Image.open(BytesIO(data)).convert('RGBA')

def save_png(img: Image.Image, folder: Path, name: str):
    folder.mkdir(parents=True, exist_ok=True)
    img.save(folder / name, format='PNG', optimize=True)

def install():
    if not SOURCE.is_file() or not MANIFEST.is_file():
        raise SystemExit('Official SVG or native AndroidManifest is missing')
    full_svg = SOURCE.read_text(encoding='utf-8')
    if full_svg.count('<rect') != 1 or full_svg.count('<path') != 3:
        raise SystemExit('Unexpected official icon geometry')
    # Adaptive launcher: the white-and-turquoise CF is independent of its background.
    glyph_svg = re.sub(r'<rect\b[^>]*/>', '', full_svg, count=1)
    for density, scale in DENSITIES.items():
        size = round(48 * scale)
        legacy = render(full_svg, size)
        folder = RES / f'mipmap-{density}'
        save_png(legacy, folder, 'cf_launcher.png')
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        save_png(Image.composite(legacy, Image.new('RGBA', legacy.size), mask),
                 folder, 'cf_launcher_round.png')

        adaptive_size = round(108 * scale)
        foreground = Image.new('RGBA', (adaptive_size, adaptive_size))
        safe_size = round(adaptive_size * 0.85)
        off = (adaptive_size - safe_size) // 2
        foreground.alpha_composite(render(glyph_svg, safe_size), (off, off))
        drawable_dir = RES / f'drawable-{density}'
        save_png(foreground, drawable_dir, 'cf_launcher_foreground.png')
        mono = Image.new('RGBA', foreground.size, (255, 255, 255, 0))
        mono.putalpha(foreground.getchannel('A'))
        save_png(mono, drawable_dir, 'cf_launcher_monochrome.png')

    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/cf_icon_background" />
  <foreground android:drawable="@drawable/cf_launcher_foreground" />
  <monochrome android:drawable="@drawable/cf_launcher_monochrome" />
</adaptive-icon>
'''
    xml_dir = RES / 'mipmap-anydpi-v26'
    xml_dir.mkdir(parents=True, exist_ok=True)
    for name in ('cf_launcher.xml', 'cf_launcher_round.xml'):
        (xml_dir / name).write_text(xml, encoding='utf-8')
    values_dir = RES / 'values'
    values_dir.mkdir(parents=True, exist_ok=True)
    (values_dir / 'capitalflow_icon_colors.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="cf_icon_background">' + NAVY + '</color></resources>\n',
        encoding='utf-8'
    )
    # Capacitor ships a default Android robot vector using ic_launcher_foreground.
    # Unique cf_launcher names ensure the resource resolver cannot select it.
    if (RES / 'drawable-anydpi-v24' / 'cf_launcher_foreground.xml').exists():
        raise SystemExit('Unexpected conflicting CapitalFlow vector foreground')
    manifest = MANIFEST.read_text(encoding='utf-8')
    if manifest.count('<application') != 1:
        raise SystemExit('Unexpected generated AndroidManifest')
    for key, resource in (('icon', '@mipmap/cf_launcher'), ('roundIcon', '@mipmap/cf_launcher_round')):
        attr = f'android:{key}'
        if re.search(rf'\b{attr}="[^"]+"', manifest):
            manifest = re.sub(rf'\b{attr}="[^"]+"', f'{attr}="{resource}"', manifest, count=1)
        else:
            manifest = manifest.replace('<application', f'<application {attr}="{resource}"', 1)
    MANIFEST.write_text(manifest, encoding='utf-8')
    print('CapitalFlow CF launcher icon rendered at all 5 densities')

if __name__ == '__main__':
    install()
