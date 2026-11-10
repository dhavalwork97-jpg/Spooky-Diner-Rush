"""Shared helpers for the taco art scripts (make_stir_sheets.py, make_press_sheets.py, make_nachos_melt_sheet.py).

Green-screen keying, frame cutting, registration on one pan placement, watermark removal, the blue-pan hue turn,
cropping/scaling and writing a sheet. Pure functions on float RGBA arrays (straight alpha, 0..1) unless noted.
"""
import json, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools/taco_source/incoming')
OUT = os.path.join(ROOT, 'public/assets/taco/animations')

def key_green(rgb):
    """Chroma-key #00FF00 into straight (un-premultiplied) RGBA floats 0..1. Only the green background and its blends are touched."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gscore = g - np.maximum(r, b)
    core = (g > 200) & (r < 60) & (b < 60)
    # the zone where background blends can be: next to / inside real background, or a light (steam) tint of it
    zone = cv2.dilate(core.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    zone |= (gscore > 90) & (g > 190)
    alpha = np.where(zone, np.clip(1.0 - gscore / 255.0, 0, 1), 1.0)
    alpha = np.where(core, 0.0, alpha)
    alpha = np.where(alpha < 0.06, 0.0, alpha)
    alpha = np.where(zone & (gscore > 70) & (g > 120), 0.0, alpha)  # enclosed holes (the handle eyelet) that are still strongly green
    safe = np.maximum(alpha, 0.06)[..., None]
    bg = np.array([0, 255, 0], np.float32)
    col = np.where(zone[..., None] & (alpha[..., None] > 0), (a - (1 - safe) * bg) / safe, a)
    col = np.clip(col, 0, 255)
    # remove any remaining green spill on edge pixels: green may not exceed the larger of red/blue by much
    edge = zone & (alpha > 0) & (alpha < 1)
    cap = np.maximum(col[..., 0], col[..., 2]) + 6
    col[..., 1] = np.where(edge, np.minimum(col[..., 1], cap), col[..., 1])
    col = col / 255.0
    # green spill on every edge pixel (within 4 px of the background): green may not exceed red/blue
    near = cv2.dilate((alpha < 0.05).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    col[..., 1] = np.where(near & (alpha > 0), np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2]) + 0.02), col[..., 1])
    # translucent bits (steam, motion lines, sparkles) come out of the green with a tint: pull them towards grey
    semi = (alpha > 0) & (alpha < 0.92)
    lum = col.mean(-1, keepdims=True)
    col = np.where(semi[..., None], col * 0.45 + lum * 0.55, col)
    col[..., 1] = np.where(semi, np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2])), col[..., 1])
    return np.dstack([col, alpha]).astype(np.float32)

def cut_frames(rgba, cols, rows, min_pan_area=20000):
    """One RGBA crop per frame (frame index = row * cols + col), found by connected pieces inside each column band.
    The pan is the big piece; detached food/steam pieces belong to the pan below them."""
    H, W, _ = rgba.shape
    cw = W // cols
    mask = (rgba[..., 3] > 0.04).astype(np.uint8)
    frames = [None] * (cols * rows)
    for c in range(cols):
        x0, x1 = c * cw, (c + 1) * cw
        m = cv2.morphologyEx(mask[:, x0:x1], cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        k = cv2.dilate(m, np.ones((9, 9), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(k)
        pans = sorted([i for i in range(1, n) if st[i, 4] > min_pan_area], key=lambda i: st[i, 1])
        assert len(pans) == rows, f'column {c}: found {len(pans)} pans, expected {rows}'
        owner = {p: p for p in pans}
        for i in range(1, n):
            if i in owner or st[i, 4] < 30:
                continue
            top, bot = st[i, 1], st[i, 1] + st[i, 3]
            best, bd = None, 1e9
            for p in pans:
                pt, pb = st[p, 1], st[p, 1] + st[p, 3]
                if st[p, 1] + st[p, 3] / 2 < top + st[i, 3] / 2:  # the pan must lie below the piece
                    continue
                d = max(0, pt - bot)
                if d < bd:
                    best, bd = p, d
            owner[i] = best if best is not None else None
        for r, p in enumerate(pans):
            sel = np.zeros_like(m, dtype=bool)
            for i, o in owner.items():
                if o == p:
                    sel |= lab == i
            ys, xs = np.where(sel)
            y0, y1, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            crop = rgba[y0:y1, x0 + xa:x0 + xb].copy()
            crop[..., 3] *= sel[y0:y1, xa:xb]
            # pan anchor = right-most / bottom-most pan pixel (the handle tip) of the pan piece itself
            pys, pxs = np.where(lab == p)
            pr, pb = pxs.max() - xa, pys.max() - y0
            # the handle eyelet is a little hole that shows the green background: key it out (only in the last 80 px of the handle tip, where no food ever is)
            win = crop[max(0, pb - 80):pb + 1, max(0, pr - 80):pr + 1]
            gs = win[..., 1] - np.maximum(win[..., 0], win[..., 2])
            win[..., 3] = np.where(gs > 0.12, 0.0, win[..., 3])
            frames[r * cols + c] = dict(img=crop, ox=x0 + xa, oy=y0, pan_right=x0 + pxs.max() - (x0 + xa), pan_bottom=pys.max() - y0)
    return frames

# ---------------------------------------------------------------------------------------------------------------------------
CW, CH = 600, 700          # registration canvas (source pixels)
AX, AY = CW - 60, CH - 40  # the handle tip of every pan is first put here

def place(frame, s, tx, ty):
    """Frame RGBA (straight) scaled by s about its handle tip, put on the canvas with the tip at (AX+tx, AY+ty). Returns straight RGBA floats."""
    img = frame['img']
    pm = img.copy()
    pm[..., :3] *= pm[..., 3:4]
    M = np.array([[s, 0, AX + tx - frame['pan_right'] * s], [0, s, AY + ty - frame['pan_bottom'] * s]], np.float32)
    out = cv2.warpAffine(pm, M, (CW, CH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = np.clip(out[..., 3:4], 0, 1)
    col = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return np.dstack([np.clip(col, 0, 1), a[..., 0]]).astype(np.float32)

def register(frames, iters=4):
    """Put every frame on one pan placement. Matches the pan SILHOUETTE (not the food) against the median silhouette of all frames."""
    idx = [i for i, f in enumerate(frames) if f is not None]
    params = {i: [1.0, 0.0, 0.0] for i in idx}
    for it in range(iters + 1):
        placed = {i: place(frames[i], *params[i]) for i in idx}
        masks = np.stack([(placed[i][..., 3] > 0.5) for i in idx]).astype(np.float32)
        T = (masks.mean(0) >= 0.5).astype(np.float32)
        if it == iters:
            break
        P = 30
        for i in idx:
            best = (-1, params[i])
            for s in np.arange(0.9, 1.1201, 0.01) if it == 0 else np.arange(params[i][0] - 0.01, params[i][0] + 0.0101, 0.0025):
                f = place(frames[i], s, params[i][1], params[i][2])[..., 3] > 0.5
                big = cv2.copyMakeBorder(f.astype(np.float32), P, P, P, P, cv2.BORDER_CONSTANT, value=0)
                res = cv2.matchTemplate(big, T, cv2.TM_CCORR_NORMED)
                _, mx, _, loc = cv2.minMaxLoc(res)
                if mx > best[0]:
                    dx, dy = loc[0] - P, loc[1] - P
                    # the best template position is at -offset: moving the frame by (-dx,-dy) puts it on the template
                    best = (mx, [s, params[i][1] - dx, params[i][2] - dy])
            params[i] = best[1]
    return placed, params, T

def drop_strays(placed, T, margin=4):
    """Remove pieces that cannot be food, steam or the pan: anything wholly below, left of or right of the pan silhouette (bits of the neighbouring frame)."""
    ys, xs = np.where(T > 0)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    for i, p in placed.items():
        m = (p[..., 3] > 0.03).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((5, 5), np.uint8)))
        for k in range(1, n):
            x, y, w, h = st[k, :4]
            if y > y1 + margin or x > x1 + margin or x + w < x0 - margin:
                p[(lab == k) & (m > 0)] = 0
    return placed

def silhouette_iou(placed, T):
    ys, xs = np.where(T > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = {}
    for i, p in placed.items():
        f = (p[y0:y1, x0:x1, 3] > 0.5)
        t = T[y0:y1, x0:x1] > 0
        out[i] = float((f & t).sum() / max(1, (f | t).sum()))
    return out

def fit_to_template(frame, T, scales=np.arange(0.8, 1.25, 0.01)):
    """Place another picture of the same pan (e.g. the empty fish pan) onto the pan silhouette T of this sheet. Returns RGBA on the canvas."""
    P = 40
    best = (-1, None)
    for s in scales:
        f = place(frame, s, 0, 0)[..., 3] > 0.5
        big = cv2.copyMakeBorder(f.astype(np.float32), P, P, P, P, cv2.BORDER_CONSTANT, value=0)
        res = cv2.matchTemplate(big, T, cv2.TM_CCORR_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(res)
        if mx > best[0]:
            best = (mx, (s, -(loc[0] - P), -(loc[1] - P)))
    return place(frame, *best[1])


# Red -> blue: measured on the old pan_red_fish / pan_blue_fish sheets (median hue 10 deg vs 212 deg, saturation x0.94, value x0.97).
BLUE_HUE_TURN = 202.0
BLUE_SAT, BLUE_VAL = 0.94, 0.97

def rgba_to_u8(x):
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)

def remove_watermark(frame, empty, T, prev=None):
    """The Gemini sparkle sits on the pan handle/rim at the bottom-right of the LAST frame. On green it is a white translucent sparkle (removed:
    nothing but the pan lives there); on the pan the clean empty pan is put back."""
    ys, xs = np.where(T > 0)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    box = np.zeros(T.shape, bool)
    box[int(y0 + 0.40 * (y1 - y0)):y1 + 40, int(x0 + 0.45 * (x1 - x0)):x1 + 40] = True
    ref = prev if prev is not None else empty
    fa, ea = frame[..., 3], ref[..., 3]
    off_pan = box & (fa > 0.02) & (ea < 0.5)
    lighter = (frame[..., :3] - ref[..., :3]).min(-1) > 0.05
    on_pan = box & (fa > 0.5) & (ea > 0.5) & lighter
    sparkle = cv2.dilate((off_pan | on_pan).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    sparkle &= box
    out = frame.copy()
    out[sparkle] = ref[sparkle]
    return out

def food_mask(frame, empty):
    """Pixels of a frame that are food (differ from the clean pan), inside or near the pan."""
    d = np.abs(frame[..., :3] - empty[..., :3]).max(-1)
    return (frame[..., 3] > 0.5) & ((d > 0.14) | (empty[..., 3] < 0.5))

def burnt_look(frame, empty, stable):
    """Procedural burnt food (used where the art has no burnt look): the food is darkened and desaturated to char, the pan is untouched."""
    out = frame.copy()
    fm = food_mask(frame, empty) & ~(cv2.dilate(stable.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)  # never the pan's red body and handle
    c = out[..., :3]
    lum = c.mean(-1, keepdims=True)
    char = (0.50 * c + 0.50 * lum) * (0.20 + 0.28 * lum) + np.array([0.018, 0.011, 0.007], np.float32)
    char[..., 0] *= 1.05
    m = cv2.GaussianBlur(fm.astype(np.float32), (0, 0), 0.8)[..., None]
    out[..., :3] = c * (1 - m) + char * m
    return out

def stable_red(placed_all):
    """Pixels that are the pan's red body/handle: red and saturated in at least 70 percent of the frames of the sheet (food never stays in one place that long)."""
    hits = []
    for p in placed_all:
        hsv = cv2.cvtColor(rgba_to_u8(p[..., :3]), cv2.COLOR_RGB2HSV).astype(np.float32)
        h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
        hits.append((p[..., 3] > 0.5) & (s > 0.45) & (v > 0.18) & ((h < 50) | (h > 330)))
    return np.mean(np.stack(hits), 0) >= 0.7

def outer_pieces(mask, T):
    """Only the pieces of `mask` that touch the pan's OUTER edge (silhouette T): the red body ring and the handle. Used when food also stays in one place
    in every frame (the burrito), so that it is not mistaken for pan colour: the food piece is enclosed inside the pan and never reaches the edge."""
    t = (T > 0).astype(np.uint8)
    ring = (t > 0) & (cv2.erode(t, np.ones((13, 13), np.uint8)) == 0)
    n, lab = cv2.connectedComponents(cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)))
    keep = np.unique(lab[ring & (lab > 0)])
    return mask & np.isin(lab, keep[keep > 0])

def to_blue(frame, empty, stable):
    """Hue-turn ONLY the pan's coloured body and handle (mask from the clean empty pan); food pixels (those that differ from the clean pan) are left alone."""
    out = frame.copy()
    part = cv2.dilate(stable.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    fh = cv2.cvtColor(rgba_to_u8(frame[..., :3]), cv2.COLOR_RGB2HSV).astype(np.float32)
    redish = (fh[..., 1] / 255 > 0.30) & (fh[..., 2] / 255 > 0.15) & ((fh[..., 0] * 2 < 55) | (fh[..., 0] * 2 > 330))
    sel = part & redish & (frame[..., 3] > 0)  # the pan's red parts that are still red in this frame (food in front of them stays as it is)
    f8 = rgba_to_u8(frame[..., :3])
    hf = cv2.cvtColor(f8, cv2.COLOR_RGB2HSV).astype(np.float32)
    hf[..., 0] = ((hf[..., 0] * 2 + BLUE_HUE_TURN) % 360) / 2
    hf[..., 1] = np.clip(hf[..., 1] * BLUE_SAT, 0, 255)
    hf[..., 2] = np.clip(hf[..., 2] * BLUE_VAL, 0, 255)
    blue = cv2.cvtColor(hf.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255
    soft = cv2.GaussianBlur(sel.astype(np.float32), (0, 0), 0.7)[..., None] * (frame[..., 3:4] > 0)
    out[..., :3] = frame[..., :3] * (1 - soft) + blue * soft
    return out


def crop_and_scale(frames, T, out_w=262):  # out_w=None keeps the source resolution (no resampling of the pan)
    """Common crop (union of all content) and the scale that makes the pan out_w wide. Returns scaled RGBA uint8 frames + panBox."""
    ys, xs = np.where(T > 0)
    tx0, tx1, ty0, ty1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    al = np.max(np.stack([f[..., 3] for f in frames]), 0) > 0.03
    yy, xx = np.where(al)
    pad = 6
    cx0, cx1 = max(0, min(xx.min(), tx0) - pad), min(CW, max(xx.max() + 1, tx1) + pad)
    cy0, cy1 = max(0, min(yy.min(), ty0) - pad), min(CH, max(yy.max() + 1, ty1) + pad)
    s = out_w / (tx1 - tx0) if out_w else 1.0
    ow, oh = int(np.ceil((cx1 - cx0) * s)), int(np.ceil((cy1 - cy0) * s))
    out = []
    for f in frames:
        c = f[cy0:cy1, cx0:cx1].copy()
        c[..., :3] *= c[..., 3:4]  # premultiplied resize avoids dark/light fringes
        r = cv2.resize(c, (ow, oh), interpolation=cv2.INTER_AREA)
        a = r[..., 3:4]
        col = np.where(a > 1e-4, r[..., :3] / np.maximum(a, 1e-4), 0)
        out.append(rgba_to_u8(np.dstack([col, a[..., 0]])))
    box = dict(x=int(round((tx0 - cx0) * s)), y=int(round((ty0 - cy0) * s)), w=int(round((tx1 - tx0) * s)), h=int(round((ty1 - ty0) * s)))
    return out, (ow, oh), box

def write_sheet(frames_u8, size, cols, path):
    ow, oh = size
    rows = -(-len(frames_u8) // cols)
    sheet = np.zeros((rows * oh, cols * ow, 4), np.uint8)
    for i, f in enumerate(frames_u8):
        r, c = divmod(i, cols)
        sheet[r * oh:(r + 1) * oh, c * ow:(c + 1) * ow] = f
    # transparent pixels carry no colour (smaller file, no fringe)
    sheet[sheet[..., 3] == 0] = 0
    Image.fromarray(sheet, 'RGBA').save(path, 'WEBP', quality=88, method=6, alpha_quality=96)
    return rows, os.path.getsize(path)

def print_table(summary):
    """summary: {key: (frame size, frames, rows, file bytes, GPU bytes)}. Prints the size/memory table and returns the GPU total in MB."""
    total = 0
    print('\nsheet                    frame     frames rows  file KB   GPU MB')
    for k, (size, n, rows, nb, gpu) in summary.items():
        total += gpu
        print(f'{k:24s} {size[0]}x{size[1]}  {n:3d}   {rows:2d}  {nb/1024:7.0f}  {gpu/1048576:7.1f}')
    print(f'TOTAL GPU memory: {total/1048576:.1f} MB')
    return total / 1048576
