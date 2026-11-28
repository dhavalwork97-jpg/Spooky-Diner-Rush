#!/usr/bin/env python3
"""Converts the supplied lilac ghost emotion sheets (6x4 frames of 192 px, PNG) into the game's webp sheets plus the .anim.json sidecars.

Usage: python3 tools/make_lilac_ghost_art.py <folder with ghost_<emotion>_sheet.png> [out folder]
Only the four clips the game uses are converted (see CLIPS). Body numbers are measured on the largest solid shape of each frame (alpha > 128),
so puffs, sparkles and "zz" marks do not count.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'customers', 'lilac_ghost')
# game clip name -> (supplied emotion, loops)
CLIPS = {'calm': ('curious', True), 'upset': ('tired', True), 'angry': ('angry', True), 'happy': ('laughing', False)}
CELL, COLS, ROWS, FPS = 192, 6, 4, 12

os.makedirs(OUT, exist_ok=True)
for clip, (emotion, loop) in CLIPS.items():
    img = Image.open(os.path.join(SRC, f'ghost_{emotion}_sheet.png')).convert('RGBA')
    assert img.size == (CELL * COLS, CELL * ROWS), img.size
    a = np.array(img)[..., 3]
    tops, bottoms, widths, edge = [], [], [], 0
    for r in range(ROWS):
        for c in range(COLS):
            f = a[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
            edge = max(edge, int(f[0].max()), int(f[-1].max()), int(f[:, 0].max()), int(f[:, -1].max()))
            lab, n = ndimage.label(f > 128)
            sizes = ndimage.sum(f > 128, lab, range(1, n + 1))
            ys, xs = np.where(lab == 1 + int(np.argmax(sizes)))
            tops.append(ys.min()); bottoms.append(ys.max()); widths.append(xs.max() - xs.min() + 1)
    top, bottom = int(np.median(tops)), int(np.median(bottoms))
    name = f'lilac_ghost_{clip}'
    img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, alpha_quality=100, method=6)
    meta = {'frames': COLS * ROWS, 'columns': COLS, 'frameWidth': CELL, 'frameHeight': CELL, 'fps': FPS, 'loop': loop,
            'bodyTop': top, 'bodyBottom': bottom, 'bodyHeight': bottom - top + 1, 'bodyWidth': int(np.median(widths)), 'edgeAlpha': edge}
    with open(os.path.join(OUT, name + '.anim.json'), 'w') as fh:
        json.dump(meta, fh, indent=2)
        fh.write('\n')
    print(name, meta, os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'KB')
