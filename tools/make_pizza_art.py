#!/usr/bin/env python3
"""Build the Pizza Place runtime art (public/assets/pizza/) from tools/pizza_source/. Rerunnable: python3 tools/make_pizza_art.py

What it does (all numbers are 1679x937 background pixels unless said otherwise):
- background: pizza_back.webp (whole picture) and pizza_front.webp (same picture with the window glass cut out, so customers stand between them).
- stations: ovens, fryer halves and the ice cream machine are cut down to the frames the game plays, scaled and packed into small sprite sheets
  (the supplied sheets would use about 170 MB of GPU memory; see the report printed at the end).
- atlases: the supplied atlases are copied as Phaser atlases (hash JSON); the effects atlas is repacked to the few sprites that are used.
"""
import json, math, os, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'pizza_source')
OUT = os.path.join(ROOT, 'public', 'assets', 'pizza')
GLASS = (262, 112, 1080, 385)  # window glass in the 1679x937 background (measured)
mem = {}


def save(im, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=kw.get('quality', 88), method=6, lossless=kw.get('lossless', False))
    mem[os.path.relpath(path, OUT)] = im.width * im.height * 4 / 1048576


def background():
    im = Image.open(os.path.join(SRC, 'pizza_background.webp')).convert('RGBA')
    save(im, os.path.join(OUT, 'background', 'pizza_back.webp'), quality=90)
    front = im.copy()
    px = front.load()
    for y in range(GLASS[1], GLASS[3]):
        for x in range(GLASS[0], GLASS[2]):
            px[x, y] = (0, 0, 0, 0)
    save(front, os.path.join(OUT, 'background', 'pizza_front.webp'), quality=90)
    thumb = im.convert('RGB').resize((420, 234), Image.LANCZOS)
    save(thumb, os.path.join(OUT, 'background', 'pizza_thumb.webp'))


def atlas_from(webp, sprites, name, folder='atlases', scale=1.0, keep=None, pad=2):
    """Write a Phaser hash atlas. With `scale` or `keep` the atlas is repacked."""
    img = Image.open(webp).convert('RGBA')
    frames = {}
    if scale == 1.0 and keep is None:
        for k, r in sprites.items():
            frames[k] = {'frame': {'x': r['x'], 'y': r['y'], 'w': r['w'], 'h': r['h']}, 'sourceSize': {'w': r['w'], 'h': r['h']}}
        out_img = img
    else:
        names = [k for k in sprites if keep is None or k in keep]
        crops = []
        for k in names:
            r = sprites[k]
            c = img.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
            c = c.resize((max(1, round(r['w'] * scale)), max(1, round(r['h'] * scale))), Image.LANCZOS)
            crops.append((k, c))
        width = 1024
        x = y = rowh = 0
        placed = []
        for k, c in crops:
            if x + c.width + pad > width:
                x, y, rowh = 0, y + rowh + pad, 0
            placed.append((k, c, x, y))
            x += c.width + pad
            rowh = max(rowh, c.height)
        out_img = Image.new('RGBA', (width, y + rowh + pad), (0, 0, 0, 0))
        for k, c, px_, py_ in placed:
            out_img.paste(c, (px_, py_))
            frames[k] = {'frame': {'x': px_, 'y': py_, 'w': c.width, 'h': c.height}, 'sourceSize': {'w': c.width, 'h': c.height}}
    save(out_img, os.path.join(OUT, folder, f'{name}.webp'))
    with open(os.path.join(OUT, folder, f'{name}.atlas.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'image': f'{name}.webp', 'size': {'w': out_img.width, 'h': out_img.height}}}, f, separators=(',', ':'))


def atlases():
    prep = json.load(open(os.path.join(SRC, 'prep', 'pizza_prep_assets.json')))
    for group, name in [('raw_layers', 'raw_layers'), ('baked_layers', 'baked_layers'), ('toppings_a', 'toppings_a'), ('toppings_b', 'toppings_b'), ('ingredient_icons', 'ingredient_icons'), ('pizza_icons', 'pizza_icons')]:
        g = prep[group]
        atlas_from(os.path.join(SRC, 'prep', g['atlas_webp']), g['sprites'], name)
    sides = json.load(open(os.path.join(SRC, 'sides', 'pizza_sides_assets.json')))
    sp = {f'{item}_{state}': {'x': r[0], 'y': r[1], 'w': r[2], 'h': r[3]} for item, d in sides['items'].items() for state, r in d['atlas_rects'].items()}
    atlas_from(os.path.join(SRC, 'sides', 'sides_items_atlas.webp'), sp, 'sides_items')
    fried = json.load(open(os.path.join(SRC, 'fried', 'fried_plate_items.json')))
    atlas_from(os.path.join(SRC, 'fried', fried['atlas_webp']), fried['sprites'], 'fried_items')
    fx = json.load(open(os.path.join(SRC, 'effects', 'effects_assets.json')))
    atlas_from(os.path.join(SRC, 'effects', fx['atlas_alpha']), fx['sprites'], 'effects', scale=0.4, keep={'sparkle_gold_1', 'sparkle_gold_2', 'glint_white', 'smoke_dark_1', 'smoke_dark_2', 'smoke_dark_3', 'dot_white', 'dot_warm_1'})
    # icecream cups and icons (small PNGs -> one atlas)
    cups = {}
    for n in ['icecream_cup_empty', 'icecream_cup_full']:
        cups[n] = Image.open(os.path.join(SRC, 'icecream', n + '.png')).convert('RGBA').resize((126, 160), Image.LANCZOS)
    for n in ['icecream_empty_icon_128', 'icecream_full_icon_128']:
        cups[n] = Image.open(os.path.join(SRC, 'icecream', n + '.png')).convert('RGBA')
    for n in ['fries_icon_128', 'wings_icon_128']:
        cups[n] = Image.open(os.path.join(SRC, 'fried', n + '.png')).convert('RGBA')
    x = y = rowh = 0
    frames = {}
    sheet = Image.new('RGBA', (1024, 512), (0, 0, 0, 0))
    for k, c in cups.items():
        if x + c.width > 1024:
            x, y, rowh = 0, y + rowh + 2, 0
        sheet.paste(c, (x, y))
        frames[k] = {'frame': {'x': x, 'y': y, 'w': c.width, 'h': c.height}, 'sourceSize': {'w': c.width, 'h': c.height}}
        x += c.width + 2
        rowh = max(rowh, c.height)
    sheet = sheet.crop((0, 0, 1024, y + rowh + 2))
    save(sheet, os.path.join(OUT, 'atlases', 'cups_icons.webp'))
    json.dump({'frames': frames, 'meta': {'image': 'cups_icons.webp', 'size': {'w': sheet.width, 'h': sheet.height}}}, open(os.path.join(OUT, 'atlases', 'cups_icons.atlas.json'), 'w'), separators=(',', ':'))


def frames_of(sheet_path, meta):
    im = Image.open(sheet_path).convert('RGBA')
    fw, fh, cols = meta['frame_width'], meta['frame_height'], meta['columns']
    def get(i):
        return im.crop(((i % cols) * fw, (i // cols) * fh, (i % cols + 1) * fw, (i // cols + 1) * fh))
    return get


def pick(lo, hi, step):
    out = list(range(lo, hi + 1, step))
    if out[-1] != hi:
        out.append(hi)
    return out


def pack_sheet(name, frames, clips, scale, cols, extra=None, crop=None):
    """frames: list of PIL images (already cropped); clips: {name: (first, last, fps, loop)} indices into `frames`."""
    ims = [f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS) for f in frames]
    fw, fh = ims[0].size
    rows = math.ceil(len(ims) / cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(ims):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    save(sheet, os.path.join(OUT, 'sheets', f'{name}.webp'))
    meta = {'key': name, 'image': f'{name}.webp', 'frameWidth': fw, 'frameHeight': fh, 'columns': cols, 'rows': rows, 'frameCount': len(ims),
            'clips': {k: {'from': a, 'to': b, 'fps': fps, 'loop': lp} for k, (a, b, fps, lp) in clips.items()}}
    if extra:
        meta.update(extra)
    json.dump(meta, open(os.path.join(OUT, 'sheets', f'{name}.anim.json'), 'w'), indent=1)


def oven(name, folder_json, sheet_name, crop_top, crop_x, scale, step=2):
    meta = json.load(open(os.path.join(SRC, 'ovens', folder_json)))['body']
    get = frames_of(os.path.join(SRC, 'ovens', sheet_name), meta)
    close_a, close_b = meta['clips']['close']['frames']
    open_a, open_b = meta['clips']['open']['frames']
    hold = meta['frames']['open_hold']
    seq = pick(close_a, close_b, step) + pick(open_a, open_b, step)
    if hold not in seq:
        seq.append(hold)
    W, H = meta['frame_width'], meta['frame_height']
    box = (round(W * crop_x[0]), round(H * crop_top), round(W * crop_x[1]), H)
    frames = [get(i).crop(box) for i in seq]
    idx = {src: i for i, src in enumerate(seq)}
    close = [idx[i] for i in pick(close_a, close_b, step)]
    opn = [idx[i] for i in pick(open_a, open_b, step)]
    clips = {'close': (close[0], close[-1], 18, False), 'open': (opn[0], opn[-1], 18, False)}
    extra = {'closedFrame': idx[meta['frames']['closed']], 'openHoldFrame': idx[hold], 'sourceFrame': [W, H], 'crop': {'top': crop_top, 'x': crop_x}}
    slots = meta.get('item_slots_in_sheet_px')
    if slots:  # pizza slots on the oven floor, in pixels of the packed (cropped, scaled) frame
        ox, oy = box[0], box[1]
        extra['slots'] = [[round((slots[k][0] - ox) * scale, 1), round((slots[k][1] - oy) * scale, 1)] for k in ('slot_1', 'slot_2')]
        extra['slotEllipse'] = [round(slots['ellipse_size'][0] * scale, 1), round(slots['ellipse_size'][1] * scale, 1)]
    pack_sheet(name, frames, clips, scale, 5, extra=extra)


def fryer(name, folder_json, sheet, half, scale):
    meta = json.load(open(os.path.join(SRC, 'fryers', folder_json)))
    body = meta['body']
    get = frames_of(os.path.join(SRC, 'fryers', sheet), body)
    split = round(meta['split_between_baskets_x_in_frame'][0] / (body['full_res_frame_size'][0] / body['frame_width']))
    W, H = body['frame_width'], body['frame_height']
    box = (0, 0, split, H) if half == 'left' else (split, 0, W, H)
    c = body['clips']
    plan = [('intro', c['intro']['frames'], 2, False, 12), ('cook_loop', c['cook_loop']['frames'], 3, True, 8), ('ready_loop', c['ready_loop']['frames'], 2, True, 8),
            ('overcook_loop', c['overcook_loop']['frames'], 2, True, 8), ('burnt_loop', c['burnt_loop']['frames'], 3, True, 8), ('idle_empty', c['idle_empty']['frames'], 1, False, 1)]
    frames, clips = [], {}
    for cname, (a, b), st, lp, fps in plan:
        seq = pick(a, b, st)
        clips[cname] = (len(frames), len(frames) + len(seq) - 1, fps, lp)
        frames += [get(i).crop(box) for i in seq]
    tl = meta['place_in_kitchen']
    pack_sheet(name, frames, clips, scale, 8, extra={'half': half, 'splitX': split, 'sourceFrame': [W, H], 'kitchenPlace': {'fryerTopLeft2752': tl['fryer_top_left_in_kitchen_px'], 'videoToKitchen': tl['video_px_per_kitchen_px'], 'frameOriginInVideo': tl['frame_origin_in_video'], 'fryerTopLeftInVideo': tl['fryer_top_left_in_video']}})


def icecream(scale):
    meta = json.load(open(os.path.join(SRC, 'icecream', 'icecream_machine_anim.json')))['sheet']
    get = frames_of(os.path.join(SRC, 'icecream', 'icecream_machine_anim_spritesheet.webp'), meta)
    a, b = meta['clips']['dispense']['frames']
    seq = pick(a, b, 2)
    frames = [get(i) for i in seq] + [get(meta['frames']['idle_empty']), get(meta['frames']['done_full'])]
    clips = {'dispense': (0, len(seq) - 1, 8, False), 'idle_empty': (len(seq), len(seq), 1, False), 'done_full': (len(seq) + 1, len(seq) + 1, 1, False)}
    pack_sheet('icecream_machine', frames, clips, scale, 6, extra={'sourceFrame': [meta['frame_width'], meta['frame_height']]})


def write_sheet_meta():
    """Collect every sheet's .anim.json into data/pizza_sheets.json so the game can build its spritesheets and clips without extra requests."""
    import glob, json
    meta = {}
    for f in sorted(glob.glob(os.path.join(OUT, 'sheets', '*.anim.json'))):
        m = json.load(open(f))
        meta[m['key']] = m
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'pizza_sheets.json')
    with open(path, 'w') as fh:
        json.dump(meta, fh, indent=1)
        fh.write('\n')
    print('wrote', path, len(meta), 'sheets')


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    background()
    atlases()
    oven('oven_big', 'pizza_oven_big.json', 'pizza_oven_big_body_spritesheet.webp', 108 / 699, (0.0, 1.0), 0.6)
    oven('oven_small', 'small_oven.json', 'small_oven_body_spritesheet.webp', 0.0, (0.0, 1.0), 0.45)
    fryer('fryer_fries', 'fries.json', 'fries_body.webp', 'left', 0.7)
    fryer('fryer_wings', 'wings.json', 'wings_body.webp', 'right', 0.7)
    icecream(0.5)
    write_sheet_meta()
    total = sum(mem.values())
    print('files:', len(mem))
    for k, v in sorted(mem.items(), key=lambda kv: -kv[1]):
        print(f'  {v:6.2f} MB  {k}')
    print(f'GPU texture estimate: {total:.1f} MB (existing gate: 85 MB)')


if __name__ == '__main__':
    main()
