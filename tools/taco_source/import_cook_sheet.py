"""Turn a Gemini cook sheet (green background, 4 x 2 cells with white divider lines) into the game's cook_<protein>_sheet.webp.

Usage: python3 -I tools/taco_source/import_cook_sheet.py <gemini.png> <protein> [loose]
'loose' (chicken, fish, shrimp) also drops Gemini's green ground shadow and green-tinted smoke; do not use it for veggies (green peppers).
Output: public/assets/taco/animations/cook_<protein>_sheet.webp (1712 x 782, 4 columns x 2 rows of 428 x 391, transparent).
The food is scaled the same in every frame and anchored so its base sits at y = 372 of 391 (the sheet's anchor, originY 0.9514).
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

FW, FH, COLS, ROWS = 428, 391, 4, 2
ANCHOR_Y = 372
src, protein = sys.argv[1], sys.argv[2]
LOOSE = len(sys.argv) > 3 and sys.argv[3] == 'loose'
im = np.array(Image.open(src).convert('RGB')).astype(float)
H, W = im.shape[:2]


def runs(white, n):
    """Cell [start, end) ranges between the white divider lines along one axis."""
    idx = np.where(white > 0.8)[0]
    cuts, start = [], None
    for i in idx:
        if start is None or i != prev + 1:
            if start is not None:
                cuts.append((start, prev))
            start = i
        prev = i
    cuts.append((start, prev))
    edges = [0] + [c for cut in cuts for c in (cut[0], cut[1] + 1)] + [n]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]


wh = im.min(axis=2) > 225
xs = runs(wh.mean(axis=0), W)
ys = runs(wh.mean(axis=1), H)
assert len(xs) == COLS and len(ys) == ROWS, (xs, ys)


def key(cell):
    """Remove the green background: alpha 0 in real background (also holes inside the food), soft unmix on steam and edges."""
    r, g, b = cell[..., 0], cell[..., 1], cell[..., 2]
    dom = g - np.maximum(r, b)
    corners = np.concatenate([dom[:12, :12].ravel(), dom[-12:, :12].ravel(), dom[:12, -12:].ravel(), dom[-12:, -12:].ravel()])
    bgdom = float(np.median(corners))
    bgcol = np.array([np.median(cell[:12, :12, c]) for c in range(3)])
    strict = dom > 0.8 * bgdom
    lab, n = ndi.label(strict)
    sizes = ndi.sum(strict, lab, range(1, n + 1))
    bg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 150])
    # Edge pixels (within 14 px of the background) and steam over the background. Steam over green keeps a high green value
    # (mix of green and white), which green peppers and dark food never have, so g > 190 separates them.
    edge = ndi.binary_dilation(bg, iterations=14) & (dom > 0.08 * bgdom)
    steam = ndi.binary_dilation(bg, iterations=90) & (g > 190) & (dom > 0.06 * bgdom)
    if LOOSE:
        steam = steam | (ndi.binary_dilation(bg, iterations=90) & (dom > 0.12 * bgdom) & (np.abs(r - b) < 25))
    near = edge | steam
    alpha = np.where(near, np.clip(1 - dom / bgdom, 0, 1), 1.0)
    alpha[bg] = 0
    if LOOSE:
        alpha[ndi.binary_dilation(bg, iterations=30) & (dom > 0.3 * bgdom) & (g > 100)] = 0
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(near[..., None], (cell - (1 - a) * bgcol) / a, cell)
    rgb = np.clip(rgb, 0, 255)
    # light despill on the remaining edge pixels
    rgb[..., 1] = np.where(near, np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 12), rgb[..., 1])
    return np.dstack([rgb, alpha * 255]).astype(np.uint8)


cells = []
for (y0, y1) in ys:
    for (x0, x1) in xs:
        cells.append(key(im[y0 + 4:y1 - 4, x0 + 4:x1 - 4]))
cw, ch = cells[0].shape[1], cells[0].shape[0]
scale = min(FW / cw, FH / ch)
tw, th = round(cw * scale), round(ch * scale)
scaled = [Image.fromarray(c).resize((tw, th), Image.LANCZOS) for c in cells]
boxes = [s.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox() for s in scaled[:5]]
bottoms = sorted(b[3] for b in boxes if b)
centres = sorted((b[0] + b[2]) / 2 for b in boxes if b)
dy = round(ANCHOR_Y - bottoms[len(bottoms) // 2])
dx = round(FW / 2 - centres[len(centres) // 2])
sheet = Image.new('RGBA', (FW * COLS, FH * ROWS), (0, 0, 0, 0))
for i, s in enumerate(scaled[:7]):  # the 8th cell is empty (and carries the Gemini mark)
    col, row = i % COLS, i // COLS
    cell = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    cell.alpha_composite(s, (round((FW - tw) / 2) + dx, dy))
    sheet.alpha_composite(cell, (col * FW, row * FH))
out = f'public/assets/taco/animations/cook_{protein}_sheet.webp'
sheet.save(out, 'WEBP', quality=90, method=6)
print(out, sheet.size, 'scale', round(scale, 3), 'dx', dx, 'dy', dy)
