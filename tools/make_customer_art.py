"""Build the game-ready customer sprite sheet from the supplied transparent PNGs.

Usage: python3 tools/make_customer_art.py <dir with customer_*.png> [ghost dir] [out file]
  ghost dir defaults to public/assets/customers/ghosts (the committed ghost cutouts).

For each source PNG: drop the faint alpha haze left by background removal (keep only the largest
connected figure), crop tight to the figure so the bottom edge is the shoes (feet stand on the
floor line), resize to a fixed height and centre it in a fixed-size cell. All eight go into ONE
WebP sprite sheet (one texture, one draw batch), together with a contact shadow and a heart.
The characters themselves are not redrawn.

Ghosts keep their soft glow (no component filtering); only stray alpha under 3 is dropped.

Sheet layout: 4 columns x 4 rows of CELL_W x HEIGHT cells.
Frames 0-7: people in the order of NAMES, frames 8-13: ghosts in the order of GHOSTS (all must match
CUSTOMER_LOOKS in src/anim/customerMotion.ts), frame 14: contact shadow, frame 15: heart.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

NAMES = ['kid', 'grandma', 'businessman', 'foodie', 'teen', 'chef_fan', 'athlete', 'sleepy']
GHOSTS = ['monocle_gentleman', 'old_bearded_ghost', 'child_nightgown', 'wildhair_corset_ghost', 'vest_gentleman', 'flame_crown_ghost']
HEIGHT = 384
CELL_W = 192
COLS = 4
PAD = 2


def figure(src: Path) -> Image.Image:
    im = Image.open(src).convert('RGBA')
    a = np.array(im)
    alpha = a[:, :, 3]
    labels, n = ndimage.label(alpha > 24)
    sizes = ndimage.sum(np.ones_like(alpha), labels, range(1, n + 1))
    keep = labels == (int(np.argmax(sizes)) + 1)
    keep = ndimage.binary_dilation(keep, iterations=6)  # keep the soft edge around the figure
    a[:, :, 3] = np.where(keep, alpha, 0)
    a[a[:, :, 3] < 6] = 0
    ys, xs = np.where(a[:, :, 3] > 0)
    box = (max(xs.min() - PAD, 0), max(ys.min() - PAD, 0), min(xs.max() + PAD + 1, a.shape[1]), min(ys.max() + PAD + 1, a.shape[0]))
    out = Image.fromarray(a).crop(box)
    w = round(out.width * HEIGHT / out.height)
    return out.resize((w, HEIGHT), Image.LANCZOS)


def ghost_figure(src: Path) -> Image.Image:
    a = np.array(Image.open(src).convert('RGBA'))
    a[a[:, :, 3] < 3] = 0
    ys, xs = np.where(a[:, :, 3] > 0)
    out = Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return out.resize((round(out.width * HEIGHT / out.height), HEIGHT), Image.LANCZOS)


def shadow() -> Image.Image:
    s = 4
    im = Image.new('RGBA', (CELL_W * s, HEIGHT * s), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse(((CELL_W / 2 - 66) * s, (HEIGHT - 30) * s, (CELL_W / 2 + 66) * s, (HEIGHT - 2) * s), fill=(43, 27, 23, 64))
    im = im.filter(ImageFilter.GaussianBlur(3 * s))
    return im.resize((CELL_W, HEIGHT), Image.LANCZOS)


def heart() -> Image.Image:
    s = 8
    im = Image.new('RGBA', (CELL_W * s, HEIGHT * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = CELL_W * s // 2, HEIGHT * s // 2

    def shape(grow: int, col: tuple) -> None:
        r = (10 + grow) * s
        d.ellipse((cx - 16 * s - r + 4 * s, cy - 6 * s - r, cx - 16 * s + r + 4 * s, cy - 6 * s + r), fill=col)
        d.ellipse((cx + 16 * s - r - 4 * s, cy - 6 * s - r, cx + 16 * s + r - 4 * s, cy - 6 * s + r), fill=col)
        d.polygon([(cx - 26 * s - grow * s + 2 * s, cy - 2 * s), (cx + 26 * s + grow * s - 2 * s, cy - 2 * s), (cx, cy + (22 + grow) * s)], fill=col)

    shape(3, (43, 27, 23, 255))
    shape(0, (255, 107, 139, 255))
    d.ellipse((cx - 17 * s, cy - 14 * s, cx - 11 * s, cy - 8 * s), fill=(255, 255, 255, 140))
    return im.resize((CELL_W, HEIGHT), Image.LANCZOS)


if __name__ == '__main__':
    src = Path(sys.argv[1])
    ghosts = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('public/assets/customers/ghosts')
    dst = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('public/assets/art/customers.webp')
    cells = []
    widths = []
    for name, f in [(n, figure(src / f'customer_{n}.png')) for n in NAMES] + [(n, ghost_figure(ghosts / f'{n}.png')) for n in GHOSTS]:
        assert f.width <= CELL_W, (name, f.width)
        cell = Image.new('RGBA', (CELL_W, HEIGHT), (0, 0, 0, 0))
        cell.paste(f, ((CELL_W - f.width) // 2, 0))
        cells.append(cell)
        widths.append(f.width)
    print('FIGURE_W =', widths)
    cells += [shadow(), heart()]
    rows = (len(cells) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL_W, rows * HEIGHT), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % COLS) * CELL_W, (i // COLS) * HEIGHT))
    sheet.save(dst, 'WEBP', quality=88, method=6, exact=True)
    print(dst, sheet.size, dst.stat().st_size, 'bytes')
