"""Turn a Gemini 'pan with food' sheet (pure green background, 4 x 2 equal cells, no divider lines, 7 frames)
into a game sheet plus its .anim.json.

Usage: python3 -I tools/taco_source/import_pan_sheet.py <gemini.png> <colour> <protein>
Frames: 0 empty, 1 raw, 2 sizzling, 3 browning, 4 flipping, 5 cooked ready, 6 burnt.
Output (public/assets/taco/animations/): pan_<colour>_<protein>_sheet.webp (4 x 2 cells of 560 x 480, transparent) and
pan_<colour>_<protein>_sheet.anim.json, whose `panBox` is where the pan itself sits inside every frame (all frames are aligned
on the pan's left and bottom edge, and the pan is scaled to 400 px wide), so the game can place it exactly over the kitchen's pan.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

COLS, ROWS = 4, 2
FW, FH = 560, 480
PAN_W, LEFT, BOTTOM = 400, 60, 470
src, colour, protein = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.array(Image.open(src).convert('RGB')).astype(float)
H, W = im.shape[:2]
cw, ch = W // COLS, H // ROWS


def key(cell):
    r, g, b = cell[..., 0], cell[..., 1], cell[..., 2]
    dom = g - np.maximum(r, b)
    bgdom = float(np.median(np.concatenate([dom[:12, :12].ravel(), dom[-12:, :12].ravel(), dom[:12, -12:].ravel(), dom[-12:, -12:].ravel()])))
    bgcol = np.array([np.median(cell[:12, :12, c]) for c in range(3)])
    strict = dom > 0.8 * bgdom
    lab, n = ndi.label(strict)
    sizes = ndi.sum(strict, lab, range(1, n + 1))
    bg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 150])
    grown = ndi.binary_dilation(bg, iterations=90)
    near = (ndi.binary_dilation(bg, iterations=14) & (dom > 0.08 * bgdom)) | (grown & (g > 190) & (dom > 0.06 * bgdom)) | (grown & (dom > 0.12 * bgdom) & (np.abs(r - b) < 25))
    alpha = np.where(near, np.clip(1 - dom / bgdom, 0, 1), 1.0)
    alpha[bg] = 0
    alpha[ndi.binary_dilation(bg, iterations=30) & (dom > 0.3 * bgdom) & (g > 100)] = 0
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip(np.where(near[..., None], (cell - (1 - a) * bgcol) / a, cell), 0, 255)
    rgb[..., 1] = np.where(near, np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 12), rgb[..., 1])
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8))


def drop_strays(img):
    """Gemini's frames overlap their cell borders, so a bit of the neighbouring frame's food can sit under the pan.
    Keep only pieces that touch the pan or sit above it (steam, sparks, flying food); drop pieces lying below the pan's bottom edge."""
    a = np.array(img)
    lab, n = ndi.label(a[..., 3] > 20)
    if n < 2:
        return img
    sizes = ndi.sum(a[..., 3] > 20, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    ys = np.where((lab == main).any(axis=1))[0]
    bottom = ys.max()
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if i != main and sl[0].start >= bottom - 10:
            a[lab == i] = 0
    return Image.fromarray(a)


frames = []
for i in range(7):
    c, r = i % COLS, i // COLS
    frames.append(drop_strays(key(im[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw])))
solid = [f.getchannel('A').point(lambda v: 255 if v > 200 else 0).getbbox() for f in frames]
# scale so the empty pan (frame 0) is PAN_W wide, then line every frame up on the pan's left and bottom edge
scale = PAN_W / (solid[0][2] - solid[0][0])
sheet = Image.new('RGBA', (FW * COLS, FH * ROWS), (0, 0, 0, 0))
for i, (f, b) in enumerate(zip(frames, solid)):
    f2 = f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS)
    left, bottom = round(b[0] * scale), round(b[3] * scale)
    cell = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    cell.alpha_composite(f2, (LEFT - left, BOTTOM - bottom)) if LEFT - left >= 0 and BOTTOM - bottom >= 0 else cell.paste(f2, (LEFT - left, BOTTOM - bottom))
    sheet.alpha_composite(cell, ((i % COLS) * FW, (i // COLS) * FH))
pan_h = round((solid[0][3] - solid[0][1]) * scale)
name = f'pan_{colour}_{protein}'
sheet.save(f'public/assets/taco/animations/{name}_sheet.webp', 'WEBP', quality=90, method=6)
meta = {
    'key': name, 'image': f'{name}_sheet.webp', 'frameWidth': FW, 'frameHeight': FH, 'columns': COLS, 'rows': ROWS, 'frameCount': 7,
    'frameLabels': ['empty', 'raw', 'sizzling', 'browning', 'flipping', 'cooked_ready', 'burnt'],
    'panBox': {'x': LEFT, 'y': BOTTOM - pan_h, 'w': PAN_W, 'h': pan_h},
    'note': 'Pan and food drawn together; panBox is the pan (bowl and handle) in every frame. Frames 1-3 cook, 5 ready, 6 burnt.',
}
json.dump(meta, open(f'public/assets/taco/animations/{name}_sheet.anim.json', 'w'), indent=1)
print(name, sheet.size, 'scale', round(scale, 3), 'panBox', meta['panBox'])
