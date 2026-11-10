"""Reproducible, uncropped derivatives of the supplied Day1 and Day2 photographs.

Run: python scripts/prepare-ai-automation-media.py (requires Pillow).
No retouching, colour grading, external imagery or original-file changes.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/ai-automation/optimized'
BYTE_BUDGET = 155_000
SOURCES = {
    'day1': (ROOT / 'public/ai-automation/Day1-20261110T190451Z-1-001/Day1', {
        '07.png': 'in-the-room', '02.png': 'vector-search',
        '05.png': 'explaining', '06.png': 'listening',
        '04.png': 'sharing', '01.png': 'conversation',
        '03.png': 'attention', '09.png': 'together',
    }),
    # Day2: the hands-on lab. Every frame was reviewed; all fifteen are kept.
    'day2': (ROOT / 'public/ai-automation/Day2-20261110T190453Z-1-001/Day2', {
        '1(1).png': 'lab-guidance', '1.png': 'lab-side-by-side',
        '2(1).png': 'lab-focus', '2.png': 'lab-workstation',
        '3(1).png': 'lab-row', '3.png': 'lab-debug',
        '4(1).png': 'lab-card', '4.png': 'lab-smile',
        '5(1).png': 'lab-room', '5.png': 'lab-laptops',
        '6(1).png': 'lab-attention', '6.png': 'lab-testing',
        '7.png': 'lab-thinking', '8.png': 'lab-mentor', '9.png': 'lab-listening',
    }),
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for day, (source, selected) in SOURCES.items():
        for path in sorted(source.iterdir()):
            if not path.is_file():
                continue
            with Image.open(path) as original:
                photo = ImageOps.exif_transpose(original).convert('RGB')
                item = {
                    'day': day,
                    'source': path.relative_to(ROOT / 'public').as_posix(),
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'width': photo.width, 'height': photo.height,
                    'bytes': path.stat().st_size, 'selected': path.name in selected,
                    'variants': [],
                }
                if path.name in selected:
                    for width in (160, 360, 720, 1080):
                        size = (width, round(width * photo.height / photo.width))
                        name = f'{selected[path.name]}-{width}.webp'
                        target = OUTPUT / name
                        # Existing derivatives are kept byte-for-byte: re-running
                        # the script never rewrites a published file.
                        if not target.exists():
                            resized = photo.resize(size, Image.Resampling.LANCZOS)
                            # Busy frames step down in quality until they fit the page budget.
                            for quality in (85, 82, 79, 76):
                                resized.save(target, 'WEBP', quality=quality, method=6,
                                             icc_profile=original.info.get('icc_profile', b''))
                                if target.stat().st_size < BYTE_BUDGET:
                                    break
                        item['variants'].append({'file': name, 'width': size[0], 'height': size[1], 'bytes': target.stat().st_size})
                    if day == 'day1' and path.name == '07.png' and not (OUTPUT / 'ai-automation-social.jpg').exists():
                        photo.save(OUTPUT / 'ai-automation-social.jpg', quality=88, optimize=True)
                inventory.append(item)
    (OUTPUT / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n', encoding='utf-8')
    chosen = [item for item in inventory if item['selected']]
    original_bytes = sum(item['bytes'] for item in chosen)
    full_bytes = sum(v['bytes'] for item in chosen for v in item['variants'] if v['width'] == 1080)
    print(json.dumps({'inspected': len(inventory), 'selected': len(chosen), 'originalBytes': original_bytes, 'fullSizeWebpBytes': full_bytes, 'reduction': f'{1 - full_bytes / original_bytes:.1%}'}))


if __name__ == '__main__':
    main()
