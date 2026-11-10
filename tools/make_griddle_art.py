#!/usr/bin/env python3
"""Bake tools/taco_source/incoming/new_griddle.webp into public/assets/taco/background/kitchen_front.webp.

Re-runnable: it always starts from the backup tools/taco_source/kitchen_front_before_griddle.webp (made on the first run).
Steps: remove the green background and the sparkle watermark -> fit onto the old griddle footprint (plate + control strip)
-> composite (keeping the food bins in front) -> save webp q96 with alpha -> re-measure the 4 food clusters and
rewrite the griddle_raw_* zones in data/taco.json.   Usage: python3 tools/make_griddle_art.py [--debug DIR]
"""
import json, re, shutil, sys
from pathlib import Path
import cv2, numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NEW = ROOT / 'tools/taco_source/incoming/new_griddle.webp'
BACKUP = ROOT / 'tools/taco_source/kitchen_front_before_griddle.webp'
TARGET = ROOT / 'public/assets/taco/background/kitchen_front.webp'
TACO = ROOT / 'data/taco.json'

# Old griddle footprint measured on the 2754x1536 background (plate outer edge .. control strip bottom).
FOOT = dict(x0=1512, x1=2044, y0=656, y1=1034)
BINS_Y, BINS_X = 1012, 1700          # the food bins start here: old pixels stay in front of the new griddle

def key_green(rgb):
    """Alpha for the new picture: green connected to the border is background; peppers inside the pan survive."""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    green = ((g - np.maximum(r, b)) > 60).astype(np.uint8)
    n, lab = cv2.connectedComponents(green)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # soft edge: how green is each pixel next to the background
    near = cv2.dilate(bg.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    spill = np.clip((g - np.maximum(r, b)) / 120.0, 0, 1)
    a = np.where(bg, 0.0, np.where(near, 1 - spill, 1.0))
    a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), 0.8)
    a[bg & (a < 0.5)] = 0
    # despill edge pixels
    out = f.copy()
    m = near & ~bg
    out[..., 1][m] = np.minimum(g[m], np.maximum(r[m], b[m]) + 8)
    return out.clip(0, 255).astype(np.uint8), np.clip(a, 0, 1)

def remove_sparkle(rgb, a):
    """Gemini sparkle at the bottom-right of the base: inpaint the bright blob."""
    h, w = a.shape
    y0, x0 = int(h * 0.88), int(w * 0.90)
    reg = rgb[y0:, x0:].astype(np.int16)
    bright = (reg.min(axis=2) > 200) & (a[y0:, x0:] > 0.5)
    m = np.zeros((h, w), np.uint8)
    m[y0:, x0:] = cv2.dilate(bright.astype(np.uint8), np.ones((9, 9), np.uint8))
    return cv2.inpaint(rgb, m, 5, cv2.INPAINT_TELEA)

def cut_raw_sprites(rgb0):
    """Cut the 4 food clusters of the (un-cropped) keyed new picture into raw_<protein>.webp (the sprite that flies to the pan)."""
    h, w = rgb0.shape[:2]
    gray = rgb0.mean(axis=2)
    sat = rgb0.max(axis=2).astype(int) - rgb0.min(axis=2).astype(int)
    food = ((gray > 105) | (sat > 55)).astype(np.uint8)
    food[:int(h * 0.11)] = 0; food[int(h * 0.76):] = 0; food[:, :int(w * 0.12)] = 0; food[:, int(w * 0.89):] = 0
    food = cv2.morphologyEx(food, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    food = cv2.morphologyEx(food, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    boxes = {}
    for name, (qx, qy) in dict(chicken=(0, 0), shrimp=(1, 0), fish=(0, 1), veggies=(1, 1)).items():
        sub = np.zeros_like(food)
        sub[int(h * (0.08 if qy == 0 else 0.45)):int(h * (0.45 if qy == 0 else 0.77)), int(w * (0.07 if qx == 0 else 0.50)):int(w * (0.50 if qx == 0 else 0.93))] = 1
        m = (food & sub)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        keep = np.zeros_like(m)
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] > 0.04 * st[1:, cv2.CC_STAT_AREA].max():
                keep[lab == i] = 1
        # fill only small holes (specular highlights); the dark plate gaps between pieces stay see-through
        inv = (1 - keep).astype(np.uint8)
        nh, lh, sh, _ = cv2.connectedComponentsWithStats(inv)
        filled = keep.copy()
        for i in range(1, nh):
            if sh[i, cv2.CC_STAT_AREA] < 1500 and not (lh[0, 0] == i):
                filled[lh == i] = 1
        filled = cv2.erode(filled, np.ones((3, 3), np.uint8))
        alpha = cv2.GaussianBlur(filled.astype(np.float32), (0, 0), 1.6)
        ys, xs = np.where(filled > 0)
        boxes[name] = (int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1)  # the food itself (used for the tap zones)
        x0, x1, y0, y1 = max(xs.min() - 6, 0), xs.max() + 7, max(ys.min() - 6, 0), ys.max() + 7
        rgba = np.dstack([rgb0, (alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
        im = Image.fromarray(rgba, 'RGBA')
        sc = min(1.0, 540 / im.width)
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        out = ROOT / f'public/assets/taco/sprites/raw_{name}.webp'
        im.save(out, quality=92, method=6)
        print('sprite', out.name, im.size, out.stat().st_size // 1024, 'KB')
    return boxes

def main():
    debug = Path(sys.argv[sys.argv.index('--debug') + 1]) if '--debug' in sys.argv else None
    if not BACKUP.exists():
        shutil.copy(TARGET, BACKUP)
    base = Image.open(BACKUP).convert('RGBA')
    W, H = base.size

    rgb = np.array(Image.open(NEW).convert('RGB'))
    rgb, a = key_green(rgb)
    rgb = remove_sparkle(rgb, a)
    food_boxes = cut_raw_sprites(rgb)  # food bbox per protein, in the uncropped keyed picture
    ys, xs = np.where(a > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    print('new griddle bbox', x0, y0, x1, y1, 'ratio %.3f' % ((x1 - x0) / (y1 - y0)))
    rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    fw, fh = FOOT['x1'] - FOOT['x0'], FOOT['y1'] - FOOT['y0']
    s = max(fw / (x1 - x0), fh / (y1 - y0))
    nw, nh = round((x1 - x0) * s), round((y1 - y0) * s)
    prem = np.dstack([rgb.astype(np.float32) * a[..., None], a])
    prem = cv2.resize(prem, (nw, nh), interpolation=cv2.INTER_AREA)
    al = prem[..., 3:4]
    col = np.where(al > 1e-3, prem[..., :3] / np.maximum(al, 1e-3), 0)
    px = FOOT['x0'] + (fw - nw) // 2
    py = FOOT['y0'] + (fh - nh) // 2
    print('placed at', px, py, 'size', nw, nh, 'scale %.3f' % s)

    out = np.array(base).astype(np.float32)
    # first paint the old footprint plate with the surrounding wall colour so no old edge peeks out
    reg = (slice(py, py + nh), slice(px, px + nw))
    old = out[reg]
    keep = np.zeros(old.shape[:2], bool)           # old pixels that must stay in front (food bins)
    yy, xx = np.mgrid[py:py + nh, px:px + nw]
    keep[(yy >= BINS_Y) & (xx >= BINS_X)] = True
    A = al[..., 0] * (~keep)
    out[reg][..., :3] = old[..., :3] * (1 - A[..., None]) + col * A[..., None]
    out[..., 3] = np.array(base)[..., 3]
    res = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')
    res.save(TARGET, quality=96, method=6)
    print('saved', TARGET.relative_to(ROOT), res.size, TARGET.stat().st_size // 1024, 'KB')

    # tap zones = the four food clusters (the same cleaned masks the raw_* sprites are cut with) mapped onto the background, padded like the old zones
    zones = {}
    for name, (bx0, bx1, by0, by1) in food_boxes.items():
        bx0, bx1, by0, by1 = bx0 - x0, bx1 - x0, by0 - y0, by1 - y0   # into the cropped griddle
        gx0, gx1 = px + bx0 * s, px + bx1 * s
        gy0, gy1 = py + by0 * s, py + by1 * s
        gx0, gx1, gy0, gy1 = gx0 - 12, gx1 + 12, gy0 - 8, gy1 + 8   # 12 px sides, 8 px top and bottom
        zones[name] = dict(x=round(gx0 / W, 4), y=round(gy0 / H, 4), width=round((gx1 - gx0) / W, 4), height=round((gy1 - gy0) / H, 4))
        print(name, {k: float(v) for k, v in zones[name].items()})
    txt = TACO.read_text()
    for name, z in zones.items():
        pat = re.compile(r'("id": "griddle_raw_%s",.*?"x": )[\d.]+(,\s*"y": )[\d.]+(,\s*"width": )[\d.]+(,\s*"height": )[\d.]+' % name, re.S)
        txt, k = pat.subn(lambda m: f'{m.group(1)}{z["x"]}{m.group(2)}{z["y"]}{m.group(3)}{z["width"]}{m.group(4)}{z["height"]}', txt, count=1)
        assert k == 1, name
    TACO.write_text(txt)
    json.loads(txt)
    if debug:
        debug.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), 'RGBA').save(debug / 'griddle_keyed.png')

if __name__ == '__main__':
    main()
