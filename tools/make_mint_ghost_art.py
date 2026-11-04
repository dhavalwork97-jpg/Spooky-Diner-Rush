"""Convert the supplied mint ghost animation sheets into the game's WebP sheets (75 percent size, see below).

Usage: python3 tools/make_mint_ghost_art.py <dir with the five supplied sheets>
  The dir must hold one image per clip, named by the stems in CLIPS below (png or webp), for example
  ghost_idle_happy_sheet.png, ghost_impatient_anim_sheet.png, ghost_angry_anim_sheet.png,
  ghost_leave_angry_anim_sheet.webp, ghost_leave_happy_anim_sheet.png

Output in public/assets/customers/mint_ghost/: <clip>.webp and <clip>.anim.json (frame size, count, measured body size).

The game canvas is a fixed 1280 x 698 and the ghost is drawn about 160 px tall, so the 256 px frames (288 px for leave_happy)
are resized to 75 percent (192 / 216 px): the ghost is then drawn 1:1, nothing visible is lost, and the textures take
about 44 percent less memory. Resizing is done on premultiplied colour so no dark fringe appears at the soft edge.
The numbers in src/anim/customerMotion.ts (LOOK_ART) come from the measurements printed here; tests keep them in step.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCALE = 0.75
# name -> (source stem, frames, source frame px, columns, loop)
CLIPS = {
    'ghost_idle_happy': ('ghost_idle_happy_sheet', 90, 256, 9, True),
    'ghost_impatient': ('ghost_impatient_anim_sheet', 85, 256, 9, True),
    'ghost_angry': ('ghost_angry_anim_sheet', 42, 256, 16, True),
    'ghost_leave_angry': ('ghost_leave_angry_anim_sheet', 130, 256, 16, False),
    'ghost_leave_happy': ('ghost_leave_happy_anim_sheet', 127, 288, 14, False),
}


def find(src: Path, stem: str) -> Path:
    for ext in ('.png', '.webp'):
        if (src / (stem + ext)).exists():
            return src / (stem + ext)
    raise SystemExit(f'missing {stem}.png/.webp in {src}')


if __name__ == '__main__':
    src = Path(sys.argv[1])
    dst = Path('public/assets/customers/mint_ghost')
    dst.mkdir(parents=True, exist_ok=True)
    for name, (stem, n, fw, cols, loop) in CLIPS.items():
        im = Image.open(find(src, stem)).convert('RGBA')
        rows = (n + cols - 1) // cols
        assert im.size == (cols * fw, rows * fw), (name, im.size)
        out_fw = round(fw * SCALE)
        out = im.convert('RGBa').resize((cols * out_fw, rows * out_fw), Image.LANCZOS).convert('RGBA')
        a = np.array(out)[:, :, 3]
        tops, bots, widths, edge = [], [], [], 0
        for i in range(n):
            c, r = i % cols, i // cols
            f = a[r * out_fw:(r + 1) * out_fw, c * out_fw:(c + 1) * out_fw]
            edge = max(edge, int(f[0].max()), int(f[-1].max()), int(f[:, 0].max()), int(f[:, -1].max()))
            if i < 40:  # the first frames are the body at rest; later frames of the leave clips add swirls and hearts
                ys, xs = np.where(f > 200)
                tops.append(ys.min()); bots.append(ys.max() + 1); widths.append(xs.max() - xs.min() + 1)
        meta = {'frames': n, 'columns': cols, 'frameWidth': out_fw, 'frameHeight': out_fw, 'fps': 24, 'loop': loop,
                'bodyTop': int(np.median(tops)), 'bodyBottom': int(np.median(bots)), 'bodyHeight': int(np.median(np.array(bots) - np.array(tops))),
                'bodyWidth': int(np.median(widths)), 'edgeAlpha': edge}
        out.save(dst / f'{name}.webp', 'WEBP', quality=85, alpha_quality=100, method=6, exact=True)
        (dst / f'{name}.anim.json').write_text(json.dumps(meta, indent=2) + '\n')
        print(name, 'frame', out_fw, 'sheet', out.size, (dst / f'{name}.webp').stat().st_size // 1024, 'KB', meta)
