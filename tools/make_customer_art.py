"""Build the game-ready customer sprite sheet from the supplied transparent PNGs.

Usage: python3 tools/make_customer_art.py <dir with customer_*.png | existing customers.webp> [ghost dir] [out file] [--blank-people]
  --blank-people leaves frames 0-7 empty (same frame numbers, about half the file size): the game only spawns ghosts.
  To bring the people back, re-run with the dir of the eight customer_*.png files (not in the repo; the owner has them) and set CUSTOMER_LOOK_MIN to 0.
  Pass the current public/assets/art/customers.webp as the first argument when the eight people PNGs are not at hand:
  the 8 people cells are then copied from it (they are not used in game any more).
  The ghosts are animated and have their own sheets (tools/make_mint_ghost_art.py), so their cells here are blank; the
  [ghost dir] argument is no longer used and is kept only so old command lines still work.

For each source PNG: drop the faint alpha haze left by background removal (keep only the largest
connected figure), crop tight to the figure so the bottom edge is the shoes (feet stand on the
floor line), resize to a fixed height and centre it in a fixed-size cell. All eight go into ONE
WebP sprite sheet (one texture, one draw batch), together with a contact shadow and a heart.
The characters themselves are not redrawn.

Ghosts keep their soft glow (no component filtering); only stray alpha under 3 is dropped.

Sheet layout: 4 columns x 4 rows of CELL_W x HEIGHT cells.
Frames 0-7: people in the order of NAMES, frames 8 on: ghosts in the order of GHOSTS (blank cells; all must match
CUSTOMER_LOOKS in src/anim/customerMotion.ts), then the contact shadow, then the heart.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

NAMES = ['kid', 'grandma', 'businessman', 'foodie', 'teen', 'chef_fan', 'athlete', 'sleepy']
GHOSTS = ['mint_ghost']  # animated: drawn from its own sheets (tools/make_mint_ghost_art.py), so its cell here stays blank
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
    blank = '--blank-people' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = Path(args[0])
    ghosts = Path(args[1]) if len(args) > 1 else Path('public/assets/customers/ghosts')
    dst = Path(args[2]) if len(args) > 2 else Path('public/assets/art/customers.webp')
    cells = []
    widths = []
    blank_cell = lambda: Image.new('RGBA', (CELL_W, HEIGHT), (0, 0, 0, 0))
    if src.is_file():
        old = Image.open(src).convert('RGBA')
        for i, n in enumerate(NAMES):
            cell = old.crop(((i % COLS) * CELL_W, (i // COLS) * HEIGHT, (i % COLS) * CELL_W + CELL_W, (i // COLS) * HEIGHT + HEIGHT))
            cells.append(blank_cell() if blank else cell)
            widths.append(0)
        figs = []
    else:
        figs = [(n, figure(src / f'customer_{n}.png')) for n in NAMES]
    for name, f in figs:
        assert f.width <= CELL_W, (name, f.width)
        cell = blank_cell()
        cell.paste(f, ((CELL_W - f.width) // 2, 0))
        cells.append(cell)
        widths.append(f.width)
    # animated ghosts have no still: their cell stays empty (the width is taken from LOOK_ART instead)
    for n in GHOSTS:
        cells.append(blank_cell())
        widths.append(0)
    print('FIGURE_W =', widths)
    cells += [shadow(), heart()]
    rows = (len(cells) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL_W, rows * HEIGHT), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % COLS) * CELL_W, (i // COLS) * HEIGHT))
    sheet.save(dst, 'WEBP', quality=88, method=6, exact=True)
    print(dst, sheet.size, dst.stat().st_size, 'bytes')
