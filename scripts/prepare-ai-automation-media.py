"""Reproducible, uncropped derivatives of the supplied Day1 photographs.

Run: python scripts/prepare-ai-automation-media.py (requires Pillow).
No retouching, colour grading, external imagery or original-file changes.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/ai-automation/Day1-20261110T190451Z-1-001/Day1'
OUTPUT = ROOT / 'public/ai-automation/optimized'
SELECTED = {
    '07.png': 'in-the-room', '02.png': 'vector-search',
    '05.png': 'explaining', '06.png': 'listening',
    '04.png': 'sharing', '01.png': 'conversation',
    '03.png': 'attention', '09.png': 'together',
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for path in sorted(SOURCE.iterdir()):
        if not path.is_file():
            continue
        with Image.open(path) as original:
            photo = ImageOps.exif_transpose(original).convert('RGB')
            item = {
                'source': path.relative_to(ROOT / 'public').as_posix(),
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'width': photo.width, 'height': photo.height,
                'bytes': path.stat().st_size, 'selected': path.name in SELECTED,
                'variants': [],
            }
            if path.name in SELECTED:
                for width in (160, 360, 720, 1080):
                    size = (width, round(width * photo.height / photo.width))
                    name = f'{SELECTED[path.name]}-{width}.webp'
                    photo.resize(size, Image.Resampling.LANCZOS).save(
                        OUTPUT / name, 'WEBP', quality=85, method=6,
                        icc_profile=original.info.get('icc_profile', b''),
                    )
                    item['variants'].append({'file': name, 'width': size[0], 'height': size[1], 'bytes': (OUTPUT / name).stat().st_size})
                if path.name == '07.png':
                    photo.save(OUTPUT / 'ai-automation-social.jpg', quality=88, optimize=True)
            inventory.append(item)
    (OUTPUT / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n', encoding='utf-8')
    original_bytes = sum(item['bytes'] for item in inventory if item['selected'])
    full_bytes = sum(v['bytes'] for item in inventory for v in item['variants'] if v['width'] == 1080)
    print(json.dumps({'inspected': len(inventory), 'selected': len(SELECTED), 'originalBytes': original_bytes, 'fullSizeWebpBytes': full_bytes, 'reduction': f'{1 - full_bytes / original_bytes:.1%}'}))


if __name__ == '__main__':
    main()
