#!/usr/bin/env python3
"""Build the burrito-press pan sheets (pan_red_press, pan_blue_press) from tools/taco_source/incoming/burrito_press_sheet.webp.

Re-runnable:  python3 tools/make_press_sheets.py [--debug DIR]
Source: 1024x1024, 4 columns x 4 rows of 256 px cells, a RED pan with a rolled burrito on green (#00FF00).
Rows are cooking looks (pale, sear, golden, burnt); columns are a 4-step loop: 0 rest, 1 rest + small steam, 2 PRESSED moment (steam puffs at the sides), 3 rest.
Steps: key the green, cut each frame by its pan, register every frame to ONE pan placement (pan silhouette, never the food/steam),
build the loops from PRESS_TABLE (fixes for the art's known flaws are listed there), make the blue pan by turning the hue of the pan only,
write pan_<colour>_press_sheet.webp + .anim.json (same panBox / stir layout as the stir sheets, so TacoViews uses one code path).
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *  # shared keying / registration / blue turn / writing helpers

COLS, ROWS = 4, 4
LOOP = 4
LOOKS = ['pale', 'sear', 'golden', 'burnt']
# Source frame (row * 4 + col) shown at each of the 4 loop steps, per look. Every source frame was looked at:
#   row 0 (0-3)  pale tortilla                  -> pale   [0, 1, 2, 3]
#   row 1 (4-6)  light sear lines               -> sear   [4, 5, 6, 4]   frame 7 is ALREADY GOLDEN (flaw a): not used; the rest step 3 repeats frame 4
#   row 2 (8-11) golden-brown stripes           -> golden [8, 9, 10, 11]
#   row 3 (12,15) burnt/charred with smoke      -> burnt  [12, 12, 15, 15]   frame 13 is GOLDEN, not burnt (flaw b): replaced by a duplicate of frame 12;
#                                                frame 14 (pressed puffs) is left out: a burnt burrito is not pressed any more.
PRESS_TABLE = {'pale': [0, 1, 2, 3], 'sear': [4, 5, 6, 4], 'golden': [8, 9, 10, 11], 'burnt': [12, 12, 15, 15]}
DROPPED = {7: 'golden frame inside the sear row (flaw a)', 13: 'golden frame inside the burnt row (flaw b), replaced by a copy of 12', 14: 'pressed puffs: no press moment when burnt'}

def empty_pan_from_fish(T):
    """The clean empty red pan (frame 0 of the finished pan_red_fish sheet), placed onto this sheet's pan silhouette T. Frame 0 of the press sheet."""
    meta = json.load(open(os.path.join(OUT, 'pan_red_fish_sheet.anim.json')))
    sheet = np.asarray(Image.open(os.path.join(OUT, meta['image'])).convert('RGBA')).astype(np.float32) / 255
    f = sheet[0:meta['frameHeight'], 0:meta['frameWidth']]
    a = f[..., 3] > 0.5
    yy, xx = np.where(a)
    crop = f[yy.min():yy.max() + 1, xx.min():xx.max() + 1].copy()
    # the stir pan has its handle tip at the right-bottom of its box, like every pan here
    return fit_to_template({'img': crop, 'pan_right': crop.shape[1] - 1, 'pan_bottom': crop.shape[0] - 1}, T)

def remove_sparkle(placed, last, T):
    """The Gemini sparkle may sit at the bottom-right of the last frame. Looks for small bright semi-transparent pieces next to the pan (off the pan
    silhouette) in the last frame and removes them. Returns how many pixels were removed (0 = none found)."""
    p = placed[last]
    m = (p[..., 3] > 0.03).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((5, 5), np.uint8)))
    removed = 0
    ys, xs = np.where(T > 0)
    for k in range(1, n):
        x, y, w, h = st[k, :4]
        piece = (lab == k) & (m > 0)
        bright = p[..., :3][piece].min(-1).mean() > 0.8 if piece.any() else False
        if st[k, 4] < 900 and bright and x > xs.min() + 0.5 * (xs.max() - xs.min()) and y > ys.min() + 0.5 * (ys.max() - ys.min()):
            p[piece] = 0
            removed += int(piece.sum())
    return removed

def main(debug_dir=None):
    rgb = np.asarray(Image.open(os.path.join(SRC, 'burrito_press_sheet.webp')).convert('RGB'))
    frames = cut_frames(key_green(rgb), COLS, ROWS, min_pan_area=12000)
    placed, params, T = register(frames)
    placed = drop_strays(placed, T)
    iou = silhouette_iou(placed, T)
    ys, xs = np.where(T > 0)
    half = (ys.min() + ys.max()) // 2
    lo = {i: float(((p[half:, :, 3] > 0.5) & (T[half:] > 0)).sum() / max(1, ((p[half:, :, 3] > 0.5) | (T[half:] > 0)).sum())) for i, p in placed.items()}
    print(f'registration IoU (whole pan box): min {min(iou.values()):.3f}; lower pan only: min {min(lo.values()):.3f} mean {np.mean(list(lo.values())):.3f}  '
          f'(worst frame {min(lo, key=lo.get)})')
    print('scale/shift per frame:', {i: [round(v, 3) for v in params[i]] for i in sorted(params)})
    empty = empty_pan_from_fish(T)
    print('sparkle pixels removed from the last frame:', remove_sparkle(placed, COLS * ROWS - 1, T))
    stable = outer_pieces(stable_red([placed[i] for i in sorted(placed)]), T)  # the pan only: the burrito never moves, so it also looks 'stable red'
    uniq, labels, idx = [empty], ['empty'], {}
    clips = {}
    for look in LOOKS:
        clips[look] = []
        for step, f in enumerate(PRESS_TABLE[look]):
            if f not in idx:
                idx[f] = len(uniq)
                uniq.append(placed[f])
                labels.append(f'{look}_{step}_src{f}')
            clips[look].append(idx[f])
    summary = {}
    for colour in ('red', 'blue'):
        fr = uniq if colour == 'red' else [to_blue(f, empty, stable) for f in uniq]
        out, size, box = crop_and_scale(fr, T, None)  # native resolution: the source cells are only 256 px, never upsample
        key = f'pan_{colour}_press'
        rws, nbytes = write_sheet(out, size, 4, os.path.join(OUT, f'{key}_sheet.webp'))
        meta = dict(key=key, image=f'{key}_sheet.webp', frameWidth=size[0], frameHeight=size[1], columns=4, rows=rws, frameCount=len(out),
                    frameLabels=labels, panBox=box,
                    stir=dict(looks=LOOKS, loop=LOOP, fps=4, empty=0, clips={k: [int(i) for i in v] for k, v in clips.items()}),
                    note='Pan and burrito drawn together (one sheet for all four burrito fillings: once wrapped the filling is not visible). panBox is the pan (bowl and handle). '
                         'Each look in stir.clips is a 4-step loop: 0 rest, 1 rest + small steam, 2 pressed (puffs at the sides), 3 rest; looks cross-fade step for step. '
                         'Made by tools/make_press_sheets.py. No press plate exists in the art yet.')
        with open(os.path.join(OUT, f'{key}_sheet.anim.json'), 'w') as f:
            json.dump(meta, f, indent=1)
        summary[key] = (size, len(out), rws, nbytes, size[0] * 4 * size[1] * rws * 4)
        if debug_dir:
            os.makedirs(debug_dir, exist_ok=True)
            bg = np.array([70, 40, 95], np.float32)
            rows_ = []
            for look in LOOKS:
                row = []
                for i in clips[look]:
                    g = out[i].astype(np.float32); a = g[..., 3:4] / 255
                    row.append((g[..., :3] * a + bg * (1 - a)).astype(np.uint8))
                rows_.append(np.concatenate(row, 1))
            Image.fromarray(np.concatenate(rows_, 0)).save(os.path.join(debug_dir, f'{key}_loops.png'))
    print('dropped source frames:', DROPPED)
    print_table(summary)

if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None)
