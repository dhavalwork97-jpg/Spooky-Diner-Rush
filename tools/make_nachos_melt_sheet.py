#!/usr/bin/env python3
"""Build the nachos MELT sheet (public/assets/taco/animations/nachos_melt_sheet.webp + .anim.json) from tools/taco_source/incoming/nachos_melt_sheet.webp.

Re-runnable:  python3 tools/make_nachos_melt_sheet.py [--debug DIR]
Source: 1024x765, 4 x 4 cells of 256x191, a pile of chips + cheese on green (no plate). While the nachos melt in the oven the item is ONLY chips + cheese
(recipe order: tortilla > cheese > oven:melt > protein > toppings), so one sheet serves all four nachos dishes.
Steps: key the green, cut each frame, register every frame on the BOTTOM-CENTRE of its pile (the pile shape changes between frames; the bottom-centre is what
sits on the oven slot), scale to the size of the existing nachos frames (288x208, pile bottom at y 199 like the old frames), write the sheet + json.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *  # shared keying / cutting / writing helpers

FW, FH = 288, 208            # the existing nachos_<protein> frame size
ANCHOR = (144, 199)          # bottom-centre of the pile in the old frames (solid pile bbox: centre x 143.5, bottom y 199)
SCALE = 1.10                 # source 256-px cells -> frame; the old melted pile was 269 px wide, this one is ~260 (a pile + steam must fit the frame height)
LOOP = 4
LOOKS = ['raw', 'melting', 'melted', 'browned', 'burnt']
# Source frame (row * 4 + col) -> what it is. Every frame was looked at:
#   0  chips only                         UNUSABLE as a look (no cheese: it is the state BEFORE the cheese step)
#   1  cheese only, no chips              UNUSABLE (a pile of cheese without chips)
#   2,3 chips with sparse cheese          not used: the oven always starts with a full cheese layer (4,5); they would not help the very start
#   4,5 raw shredded cheese on chips      raw
#   6,7 melted, glossy, bubbles           melting (cheese just melted: used while the raw look turns into the melted one, the bubbles hide the change)
#   8-11 melted, bubbles, steam           melted (ready)
#   12  lightly browned, smoke            browned (between ready and burnt)
#   13-15 burnt, black chips, smoke       burnt: 14 and 15 (the two darkest; 13 is lighter, so mixing all three made the burnt look pulse). 13 unused.
NACHO_TABLE = {
    'raw': [4, 4, 5, 5],
    'melting': [6, 6, 7, 7],
    'melted': [8, 9, 10, 11],
    'browned': [12, 12, 12, 12],
    'burnt': [14, 14, 15, 15],
}
UNUSED = {13: 'burnt but lighter than 14 and 15 (the loop would pulse)', 0: 'chips only', 1: 'cheese only, no chips', 2: 'chips with sparse cheese', 3: 'chips with sparse cheese'}

def despill(img):
    """Green may not exceed the larger of red/blue anywhere in this sheet (chips, cheese and char are all red-dominant; only leftover key spill, e.g. in the
    smoke of the last frames, is greener than that)."""
    c = img[..., :3]
    c[..., 1] = np.minimum(c[..., 1], np.maximum(c[..., 0], c[..., 2]))
    return img

def pile_anchor(img):
    """Bottom-centre of the solid pile in a cut frame (crop px): centre x of the solid bounding box, lowest solid row. Steam and smoke are translucent, so they are ignored."""
    ys, xs = np.where(img[..., 3] > 0.9)
    return (xs.min() + xs.max() + 1) / 2.0, float(ys.max() + 1)

def place_on_frame(img):
    """Cut frame (straight RGBA floats) scaled by SCALE and put on an FW x FH frame with its pile bottom-centre on ANCHOR."""
    cx, by = pile_anchor(img)
    pm = img.copy()
    pm[..., :3] *= pm[..., 3:4]
    M = np.array([[SCALE, 0, ANCHOR[0] - cx * SCALE], [0, SCALE, ANCHOR[1] - by * SCALE]], np.float32)
    out = cv2.warpAffine(pm, M, (FW, FH), flags=cv2.INTER_AREA if SCALE < 1 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = np.clip(out[..., 3:4], 0, 1)
    col = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return np.dstack([np.clip(col, 0, 1), a[..., 0]]).astype(np.float32)

def clean_sparkle(img):
    """Remove small bright pieces that do not touch the pile in the bottom-right part of a frame (the Gemini sparkle). Returns the pixel count removed."""
    m = (img[..., 3] > 0.03).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    removed = 0
    for k in range(1, n):
        x, y, w, h = st[k, :4]
        if k != big and st[k, cv2.CC_STAT_AREA] < 600 and x > img.shape[1] * 0.5 and y > img.shape[0] * 0.5 and img[..., :3][lab == k].min(-1).mean() > 0.75:
            img[lab == k] = 0
            removed += int(st[k, cv2.CC_STAT_AREA])
    return removed

def main(debug_dir=None):
    rgb = np.asarray(Image.open(os.path.join(SRC, 'nachos_melt_sheet.webp')).convert('RGB'))
    cut = cut_frames(key_green(rgb), 4, 4, min_pan_area=8000)
    print('sparkle pixels removed from the last frame:', clean_sparkle(cut[15]['img']))
    used = sorted({f for fs in NACHO_TABLE.values() for f in fs})
    frames, labels, idx = [], [], {}
    for look in LOOKS:
        for step, f in enumerate(NACHO_TABLE[look]):
            if f not in idx:
                idx[f] = len(frames)
                frames.append(place_on_frame(despill(cut[f]['img'])))
                labels.append(f'{look}_{step}_src{f}')
    clips = {look: [idx[f] for f in NACHO_TABLE[look]] for look in LOOKS}
    # popping check: how different are two frames that follow each other inside one loop (mean abs colour difference over the solid pile, 0..1)?
    def diff(a, b):
        m = (frames[a][..., 3] > 0.9) & (frames[b][..., 3] > 0.9)
        return float(np.abs(frames[a][..., :3] - frames[b][..., :3])[m].mean()) if m.any() else 0.0
    for look in LOOKS:
        c = clips[look]
        print(f'  loop {look:8s} source {NACHO_TABLE[look]}  step-to-step diff', [round(diff(c[i], c[(i + 1) % 4]), 3) for i in range(4)])
    u8 = [rgba_to_u8(f) for f in frames]
    cols = 4
    rows, nbytes = write_sheet(u8, (FW, FH), cols, os.path.join(OUT, 'nachos_melt_sheet.webp'))
    meta = dict(key='nachos_melt', image='nachos_melt_sheet.webp', frameWidth=FW, frameHeight=FH, columns=cols, rows=rows, frameCount=len(u8), suggestedFps=4,
                frameLabels=labels, anchorPx=dict(x=ANCHOR[0], y=ANCHOR[1]), originX=0.5, originY=round(ANCHOR[1] / FH, 4),
                anchorNote='Anchor = bottom-centre of the chip pile (steam rises above).',
                stir=dict(looks=LOOKS, loop=LOOP, fps=4, empty=-1, clips={k: [int(i) for i in v] for k, v in clips.items()}),
                note='Nachos while they MELT in the oven: chips + cheese only, shared by all four nachos dishes. Looks in stir.clips: raw (shredded cheese), melting (just melted, bubbles), '
                     'melted (ready, steam), browned, burnt (smoke); each is a 4-step loop, looks cross-fade step for step. Plates keep using nachos_<protein>. Made by tools/make_nachos_melt_sheet.py.')
    with open(os.path.join(OUT, 'nachos_melt_sheet.anim.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('unused source frames:', UNUSED)
    print_table({'nachos_melt': ((FW, FH), len(u8), rows, nbytes, FW * cols * FH * rows * 4)})
    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        bg = np.array([70, 40, 95], np.float32)
        tiles = []
        for look in LOOKS:
            row = []
            for i in clips[look]:
                g = u8[i].astype(np.float32); a = g[..., 3:4] / 255
                row.append((g[..., :3] * a + bg * (1 - a)).astype(np.uint8))
            tiles.append(np.concatenate(row, 1))
        Image.fromarray(np.concatenate(tiles, 0)).save(os.path.join(debug_dir, 'nachos_melt_loops.png'))

if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None)
