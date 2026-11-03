"""Soften the frame edges of the ghost scare sheets (public/assets/customers/ghosts/scare/*.webp).

Why: the scare frames are full-frame art. The ghosts (the wild-haired one is 99.5 percent of the frame wide) touch the frame
edges and carry a faint cyan haze, so the edge of each frame showed as a visible rectangle around the ghost while the angry
face faded in and during the scare.

What it does (alpha only; the picture itself is not redrawn): inside every frame, alpha is faded to 0 towards the four frame
edges. Faint haze pixels (alpha under about 60) fade over a wide band, solid pixels over a narrow band, so the body keeps its
shape and only the cut-off haze and edge disappear. Each sheet's .anim.json gets an "edgeFeather" entry, and a sheet that
already has it is skipped, so running the tool twice does not fade twice.

Usage: python3 tools/feather_scare_edges.py [scare dir] [--preview out.png]   (needs numpy and Pillow)
  --preview writes a before/after strip of three frames of the wild-haired ghost on a night-blue background and changes nothing.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_DIR = Path(__file__).resolve().parent.parent / 'public/assets/customers/ghosts/scare'
# Band widths in px of a 208 x 370 frame: (horizontal, vertical) for solid pixels and for faint haze.
NARROW = (18, 14)
WIDE = (44, 24)
HAZE_FULL = 60   # alpha at or below this: treated as haze (wide band)
HAZE_NONE = 140  # alpha at or above this: treated as solid (narrow band)


def smooth(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def edge_mask(w: int, h: int, band: tuple[int, int]) -> np.ndarray:
    x = np.arange(w, dtype=np.float32)
    y = np.arange(h, dtype=np.float32)
    dx = np.minimum(x, w - 1 - x) / band[0]
    dy = np.minimum(y, h - 1 - y) / band[1]
    return smooth(dx)[None, :] * smooth(dy)[:, None]


def feather_frame(frame: np.ndarray, narrow: np.ndarray, wide: np.ndarray) -> np.ndarray:
    a = frame[:, :, 3].astype(np.float32)
    haze = np.clip((HAZE_NONE - a) / (HAZE_NONE - HAZE_FULL), 0.0, 1.0)
    factor = (1 - haze) * narrow + haze * wide
    out = frame.copy()
    out[:, :, 3] = np.round(a * factor).astype(np.uint8)
    return out


def process(sheet: Image.Image, meta: dict) -> Image.Image:
    fw, fh, cols, count = meta['frameWidth'], meta['frameHeight'], meta['columns'], meta['frameCount']
    narrow, wide = edge_mask(fw, fh, NARROW), edge_mask(fw, fh, WIDE)
    arr = np.array(sheet.convert('RGBA'))
    for i in range(count):
        x, y = (i % cols) * fw, (i // cols) * fh
        arr[y:y + fh, x:x + fw] = feather_frame(arr[y:y + fh, x:x + fw], narrow, wide)
    return Image.fromarray(arr, 'RGBA')


def preview(folder: Path, out: Path) -> None:
    name = 'wildhair_corset_ghost_scare'
    meta = json.loads((folder / f'{name}.anim.json').read_text())
    sheet = Image.open(folder / f'{name}.webp').convert('RGBA')
    after = process(sheet, meta)
    fw, fh, cols = meta['frameWidth'], meta['frameHeight'], meta['columns']
    pick = [0, 20, meta['peakFrame']]
    strip = Image.new('RGB', (fw * len(pick) * 2 + 10 * (len(pick) * 2 - 1), fh), (14, 20, 60))
    for n, i in enumerate(pick):
        box = ((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh)
        for k, img in enumerate((sheet, after)):
            tile = Image.new('RGBA', (fw, fh), (14, 20, 60, 255))
            tile.alpha_composite(img.crop(box))
            strip.paste(tile.convert('RGB'), ((n * 2 + k) * (fw + 10), 0))
    strip.save(out)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    folder = Path(args[0]) if args and not args[0].endswith('.png') else DEFAULT_DIR
    if '--preview' in sys.argv:
        preview(folder, Path(sys.argv[sys.argv.index('--preview') + 1]))
        return
    for meta_file in sorted(folder.glob('*.anim.json')):
        meta = json.loads(meta_file.read_text())
        if 'edgeFeather' in meta:
            print(f'{meta_file.name}: already feathered, skipped')
            continue
        webp = meta_file.with_name(meta['imageWebp'])
        out = process(Image.open(webp), meta)
        out.save(webp, 'WEBP', quality=88, alpha_quality=100, method=6)
        meta['edgeFeather'] = {'narrow': list(NARROW), 'wide': list(WIDE), 'hazeFull': HAZE_FULL, 'hazeNone': HAZE_NONE}
        meta_file.write_text(json.dumps(meta, indent=2) + '\n')
        print(f'{meta_file.name}: feathered, {webp.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
