#!/usr/bin/env python3
"""Build the Taco Truck pan "stir" sheets from the Gemini sheets in tools/taco_source/incoming/.

Re-runnable:  python3 tools/make_stir_sheets.py            (writes public/assets/taco/animations/pan_{red,blue}_<protein>_sheet.webp + .anim.json)
              python3 tools/make_stir_sheets.py --debug DIR  (also writes contact sheets and checks into DIR)

Steps (see HANDOFF.md): key out the green, cut every frame out of its sheet by its pan, register all frames to ONE pan placement
(pan silhouette, never the food), remove the watermark sparkle from the last frame, build one 8-step loop per cooking look from a hand-made
frame table (FRAME_TABLE below, classified by looking at every frame), make the burnt look where the art has none, make the blue pans by
turning the hue of the pan only, and write the sheets with their .anim.json.
"""
import json, sys, os, pickle
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *  # shared keying / registration / blue turn / writing helpers

# (columns, rows) of each source sheet
GRID = {'veggies': (8, 3), 'chicken': (8, 3), 'shrimp': (8, 3), 'fish': (8, 4)}

# ---------------------------------------------------------------------------------------------------------------------------
# Frame table. Every source frame was looked at. Frame index = row * 8 + column.
# Loop timeline (8 steps, the same in every look so two looks can be cross-faded step for step):
#   0 rest | 1 lift | 2 up | 3 peak | 4 peak (high) | 5 falling | 6 landing | 7 rest
# "rest" = food lying in the pan. A frame that is listed twice is simply held.
FRAME_TABLE = {
    # veggies: row 0 bright (raw) 1-7; row 1 browning 8-15; row 2: 16,17 browned rest, 18-19 DROPPED (bright food in the browned row, mis-generated),
    # 20-21 dark toss, 22-23 dark rest (a real burnt look). Frame 0 = empty pan.
    'veggies': dict(empty=0,
        raw=[1, 2, 3, 4, 5, 6, 7, 7],
        mid=[8, 9, 10, 11, 12, 13, 14, 15],
        cooked=[16, 17, 12, 12, 13, 13, 14, 15],
        burnt=[22, 22, 20, 20, 21, 21, 22, 23],
        burnt_real=True),
    # chicken: row 0 raw 0-7 (5 DROPPED: golden pieces in the raw row); row 1 browning 8-15; row 2 deep brown 16-23 (no black burnt look in the art).
    'chicken': dict(empty=None,
        raw=[0, 1, 2, 3, 4, 6, 7, 0],
        mid=[8, 9, 10, 11, 13, 14, 15, 12],
        cooked=[16, 19, 18, 20, 21, 22, 23, 17],
        burnt=None, burnt_from='cooked'),
    # shrimp: row 0 raw/grey 0-7 (4-5 DROPPED: orange shrimp in the raw row); row 1 orange 8-15; row 2 deep 16-23; 22 has dark smoke.
    'shrimp': dict(empty=None,
        raw=[0, 2, 3, 3, 6, 6, 7, 1],
        mid=[8, 9, 10, 11, 13, 12, 15, 14],
        cooked=[16, 17, 18, 19, 20, 21, 23, 16],
        burnt=None, burnt_from='cooked'),
    # fish: 4 rows. 0-7 raw, 8-15 light golden, 24-31 + 21-23 golden brown, 20 DROPPED (empty pan, food out of the cell), no burnt look.
    'fish': dict(empty=None,
        raw=[0, 1, 3, 5, 4, 6, 7, 0],
        mid=[8, 10, 11, 13, 14, 15, 12, 9],
        cooked=[24, 22, 26, 27, 28, 29, 30, 25],
        burnt=None, burnt_from='cooked'),
}

PAN_OUT_W = 262          # width of the pan (bowl + handle) in the output sheets, px
LOOP = 8
LOOKS = ['raw', 'mid', 'cooked', 'burnt']

def build_sheet_frames(name, placed, T, empty, stable):
    """-> (list of unique canvas frames, labels, clips{look:[8 indices]}, empty index)."""
    spec = FRAME_TABLE[name]
    uniq, labels, key_to_idx = [], [], {}
    def add(key, img, label):
        if key not in key_to_idx:
            key_to_idx[key] = len(uniq)
            uniq.append(img)
            labels.append(label)
        return key_to_idx[key]
    add('empty', empty, 'empty')
    clips = {}
    for st in ('raw', 'mid', 'cooked'):
        clips[st] = [add(('src', f), placed[f], f'{st}_{k}_src{f}') for k, f in enumerate(spec[st])]
    if spec.get('burnt_real'):
        clips['burnt'] = [add(('src', f), placed[f], f'burnt_{k}_src{f}') for k, f in enumerate(spec['burnt'])]
    else:
        a, b = spec['cooked'][0], spec['cooked'][7]
        ia = add(('burnt', a), burnt_look(placed[a], empty, stable), f'burnt_0_from{a}')
        ib = add(('burnt', b), burnt_look(placed[b], empty, stable), f'burnt_7_from{b}')
        clips['burnt'] = [ia] * 7 + [ib]
    return uniq, labels, clips

def main(debug_dir=None, cache_dir=None):
    cache = {}
    order = ['fish', 'veggies', 'chicken', 'shrimp']  # fish first: its empty pan is reused for the sheets that have none
    results = {}
    for name in order:
        cols, rows = GRID[name]
        rgb = np.asarray(Image.open(os.path.join(SRC, f'{name}_stir_sheet.webp')).convert('RGB'))
        frames = cut_frames(key_green(rgb), cols, rows)
        cf = os.path.join(cache_dir, f'{name}_reg.pkl') if cache_dir else None
        if cf and os.path.exists(cf):
            placed, T = pickle.load(open(cf, 'rb'))
        else:
            placed, params, T = register(frames)
            if cf:
                os.makedirs(cache_dir, exist_ok=True)
                pickle.dump((placed, T), open(cf, 'wb'), protocol=4)
        placed = drop_strays(placed, T)
        iou = silhouette_iou(placed, T)
        # lower half of the pan only: flying food and steam never reach it, so this is the pan alone
        ys, xs = np.where(T > 0)
        half = (ys.min() + ys.max()) // 2
        lo = {i: float(((p[half:, :, 3] > 0.5) & (T[half:] > 0)).sum() / max(1, ((p[half:, :, 3] > 0.5) | (T[half:] > 0)).sum())) for i, p in placed.items()}
        # the clean empty pan of this sheet
        if name == 'fish':
            empty = placed[20]
        elif name == 'veggies':
            empty = placed[0]
        else:
            empty = fit_to_template({'img': cache['fish_empty_crop'], 'pan_right': cache['fish_empty_pr'], 'pan_bottom': cache['fish_empty_pb']}, T)
        if name == 'fish':
            # keep the fish empty pan as a crop so other sheets can place it (handle tip anchor = the pan's right/bottom-most pixel)
            a = empty[..., 3] > 0.5
            yy, xx = np.where(a)
            cache['fish_empty_crop'] = empty[yy.min():yy.max() + 1, xx.min():xx.max() + 1].copy()
            cache['fish_empty_pr'] = xx.max() - xx.min()
            cache['fish_empty_pb'] = yy.max() - yy.min()
        last = cols * rows - 1
        placed[last] = remove_watermark(placed[last], empty, T, placed[last - 1])
        stable = stable_red([placed[i] for i in sorted(placed)])
        uniq, labels, clips = build_sheet_frames(name, placed, T, empty, stable)
        results[name] = dict(stable=stable, uniq=uniq, labels=labels, clips=clips, T=T, empty=empty, iou=iou, lo=lo)
        print(f'{name}: silhouette IoU (whole pan box) min {min(iou.values()):.3f}; lower pan min {min(lo.values()):.3f} mean {np.mean(list(lo.values())):.3f}')
    summary = {}
    for name, r in results.items():
        for colour in ('red', 'blue'):
            fr = r['uniq'] if colour == 'red' else [to_blue(f, r['empty'], r['stable']) for f in r['uniq']]
            out, size, box = crop_and_scale(fr, r['T'], PAN_OUT_W)
            key = f'pan_{colour}_{name}'
            png = os.path.join(OUT, f'{key}_sheet.webp')
            rows, nbytes = write_sheet(out, size, 4, png)
            meta = dict(key=key, image=f'{key}_sheet.webp', frameWidth=size[0], frameHeight=size[1], columns=4, rows=rows, frameCount=len(out),
                        frameLabels=r['labels'], panBox=box,
                        stir=dict(looks=LOOKS, loop=LOOP, fps=10, empty=0, clips={k: [int(i) for i in v] for k, v in r['clips'].items()}),
                        note='Pan and food drawn together; panBox is the pan (bowl and handle) in every frame. Each look in stir.clips is an 8-step stir/toss loop with the same timeline '
                             '(rest, lift, up, peak, peak, falling, landing, rest); looks cross-fade step for step. Made by tools/make_stir_sheets.py.')
            with open(os.path.join(OUT, f'{key}_sheet.anim.json'), 'w') as f:
                json.dump(meta, f, indent=1)
            summary[key] = (size, len(out), rows, nbytes, size[0] * 4 * size[1] * rows * 4)
            if debug_dir and colour in ('red', 'blue'):
                os.makedirs(debug_dir, exist_ok=True)
                bg = np.array([70, 40, 95], np.float32)
                tiles = []
                for st in LOOKS:
                    row = []
                    for i in r['clips'][st]:
                        f = out[i].astype(np.float32); a = f[..., 3:4] / 255
                        row.append((f[..., :3] * a + bg * (1 - a)).astype(np.uint8))
                    tiles.append(np.concatenate(row, 1))
                Image.fromarray(np.concatenate(tiles, 0)).save(os.path.join(debug_dir, f'{key}_loops.png'))
    print_table(summary)

if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None, sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else None)