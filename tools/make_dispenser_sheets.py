#!/usr/bin/env python3
"""Build the Taco Truck pouring-dispenser art from the two supplied Gemini clips.

Source (tools/taco_source/incoming/dispenser_pour/): <name>_dispenser_pour_spritesheet.webp + .json
  taco  = the orange taco machine, red agua de jamaica, 68 frames of 300x327, 12 fps
  round = the round coloured machine, creamy horchata,   58 frames of 177x316, 12 fps
Each clip pours all three cups together. The game fills its three lanes independently, so the runtime draws
  base  = frame 0 (empty cups) once, and for every lane that holds a cup a copy of the SAME sheet cropped to that lane's
          column, showing the clip frame that matches that lane's own fill progress.
That needs (1) the three columns to be separable and (2) no colour seam between a strip and the base. The video drifts a little in
colour/brightness over time, so every frame is gain/offset corrected to frame 0 on the pixels that never change (everything outside the cup columns).
To save memory the sheet keeps only the rows where something moves (spouts down to the tray) and every STEP-th frame; the runtime mixes
neighbouring frames, so the pour still looks continuous.
Output: public/assets/taco/animations/<name>_dispenser_sheet.webp + .anim.json, and <name>_dispenser_base.webp (frame 0, full machine).
Run: python3 tools/make_dispenser_sheets.py
"""
import json, os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools/taco_source/incoming/dispenser_pour')
OUT = os.path.join(ROOT, 'public/assets/taco/animations')
STEP = 2
COLS = 8

def load(name):
    meta = json.load(open(os.path.join(SRC, f'{name}_dispenser_pour_spritesheet.json')))
    sh = np.asarray(Image.open(os.path.join(SRC, f'{name}_dispenser_pour_spritesheet.webp')).convert('RGBA')).astype(np.float32)
    s = meta['sheet']; W, H, c = s['frame_width'], s['frame_height'], s['columns']
    fr = [sh[(i // c) * H:(i // c + 1) * H, (i % c) * W:(i % c + 1) * W].copy() for i in range(meta['frame_count'])]
    return meta, fr, W, H

def runs(mask):
    out, s = [], None
    for x, m in enumerate(mask):
        if m and s is None: s = x
        if not m and s is not None: out.append((s, x - 1)); s = None
    if s is not None: out.append((s, len(mask) - 1))
    return out

def build(name):
    meta, fr, W, H = load(name)
    n = len(fr)
    f0 = fr[0]
    # 1. where do the cup columns move? (last vs first, rows 35-80% of the height where the cups are; edge columns ignored)
    d = np.abs(fr[-1] - f0)[int(H * .35):int(H * .8), :, :3].mean((0, 2))
    cols = [r for r in runs(d > 8) if r[1] - r[0] >= 20]
    assert len(cols) == 3, f'{name}: expected 3 cup columns, found {cols}'
    pad = 4
    static = np.ones(W, bool)
    for a, b in cols: static[max(0, a - pad):b + pad + 1] = False
    # lane strips end half way through the gaps between columns
    edges = [0, (cols[0][1] + cols[1][0]) // 2 + 1, (cols[1][1] + cols[2][0]) // 2 + 1, W]
    # 2. colour-correct every frame to frame 0 on the pixels that never change
    solid = (f0[..., 3] > 250)
    mask = solid & static[None, :]
    resid = []
    for i in range(1, n):
        f = fr[i]
        for c in range(3):
            x, y = f[..., c][mask], f0[..., c][mask]
            A = np.vstack([x, np.ones_like(x)]).T
            g, o = np.linalg.lstsq(A, y, rcond=None)[0]
            f[..., c] = np.clip(f[..., c] * g + o, 0, 255)
        resid.append(float(np.abs(f - f0)[..., :3][mask].mean()))
    # 3. rows that move at all (after correction)
    # (only pixels well inside the machine outline count: the outline itself flickers with video compression noise)
    inner = cv2.erode((f0[..., 3] > 250).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & (~static)[None, :]
    moved = np.zeros(H, bool)
    for f in fr[1:]:
        moved |= ((np.abs(f - f0)[..., :3].mean(2) > 25) & inner).sum(1) >= 3
    ys = np.where(moved)[0]
    top, bot = int(ys.min()) - 2, int(ys.max()) + 3
    top, bot = max(0, top), min(H, bot)
    # outside the band every frame equals frame 0, so the band alone is enough
    keep = list(range(0, n, STEP))
    if keep[-1] != n - 1: keep.append(n - 1)
    bh = bot - top
    rows = -(-len(keep) // COLS)
    sheet = np.zeros((rows * bh, COLS * W, 4), np.uint8)
    for k, i in enumerate(keep):
        r, c = divmod(k, COLS)
        sheet[r * bh:(r + 1) * bh, c * W:(c + 1) * W] = np.clip(fr[i][top:bot], 0, 255).astype(np.uint8)
    sheet[sheet[..., 3] == 0] = 0
    sp = os.path.join(OUT, f'{name}_dispenser_sheet.webp')
    Image.fromarray(sheet, 'RGBA').save(sp, 'WEBP', quality=90, method=6, alpha_quality=96)
    base = np.clip(f0, 0, 255).astype(np.uint8); base[base[..., 3] == 0] = 0
    bp = os.path.join(OUT, f'{name}_dispenser_base.webp')
    Image.fromarray(base, 'RGBA').save(bp, 'WEBP', quality=92, method=6, alpha_quality=96)
    anim = {
        'key': f'{name}_dispenser', 'image': f'{name}_dispenser_sheet.webp', 'base': f'{name}_dispenser_base.webp',
        'frameWidth': W, 'frameHeight': bh, 'columns': COLS, 'rows': rows, 'frameCount': len(keep),
        'fullFrame': {'width': W, 'height': H}, 'bandTop': top,
        'lanes': [[edges[i], edges[i + 1]] for i in range(3)],
        'sourceFrames': keep, 'sourceFps': meta['fps'], 'sourceFrameCount': n,
        'clips': {'idle_empty': [0, 0], 'pour': [0, len(keep) - 1], 'idle_full': [len(keep) - 1, len(keep) - 1]},
        'anchor': 'bottom-center',
        'note': 'Sheet cells are the rows [bandTop, bandTop+frameHeight) of the full frame. Draw base once; per lane draw the sheet frame cropped to lanes[i] at y=bandTop. Pour progress comes from the lane\'s fill time, never from fps.',
    }
    json.dump(anim, open(os.path.join(OUT, f'{name}_dispenser_sheet.anim.json'), 'w'), indent=1)
    print(f'{name}: cup columns {cols} lanes {anim["lanes"]} band y {top}-{bot} of {H}, {len(keep)} frames, {rows} rows, '
          f'sheet {os.path.getsize(sp)//1024} KB base {os.path.getsize(bp)//1024} KB, GPU {sheet.nbytes/1048576:.1f} MB; '
          f'static-area residual after correction max {max(resid):.2f} mean {np.mean(resid):.2f}')

for nm in ('taco', 'round'):
    build(nm)
