#!/usr/bin/env python3
"""Build the Taco Truck midnight layers (re-runnable).
Inputs (tools/taco_source/midnight/): midnight_painting.png (1681x936 target look), gemini_front.webp (Gemini edit: pans + plates
removed, window glass flat green).  Outputs: kitchen_front.webp (window transparent), kitchen_street_back.webp, thumb.webp, all 2754x1536 / 640x357.
The front is the SHARP painting everywhere except the stove and right counter, which come from the Gemini edit (registered to the painting)."""
import sys, os, cv2, numpy as np
from PIL import Image
from scipy import ndimage as ndi
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'out'
WORK = os.path.join(SRC, '_build')   # masters and previews stay out of public/
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
OUTW, OUTH = 2754, 1536
def rd(p):
    return cv2.cvtColor(np.asarray(Image.open(p).convert('RGB')), cv2.COLOR_RGB2BGR)
O = rd(f'{SRC}/midnight_painting.png'); G = rd(f'{SRC}/gemini_front.webp')
oh, ow = O.shape[:2]; gh, gw = G.shape[:2]
# ---- 1. register Gemini image to the painting (SIFT + homography on areas Gemini did not edit)
Gu = cv2.resize(G, (ow, oh), interpolation=cv2.INTER_CUBIC)
og = cv2.cvtColor(O, cv2.COLOR_BGR2GRAY); gg = cv2.cvtColor(Gu, cv2.COLOR_BGR2GRAY)
mask = np.full(og.shape, 255, np.uint8)
mask[int(.05*oh):int(.40*oh), int(.22*ow):int(.86*ow)] = 0
mask[int(.40*oh):int(.72*oh), int(.72*ow):int(.97*ow)] = 0
mask[int(.64*oh):int(.86*oh), int(.76*ow):] = 0
sift = cv2.SIFT_create(6000)
k1, d1 = sift.detectAndCompute(og, mask); k2, d2 = sift.detectAndCompute(gg, mask)
mt = cv2.BFMatcher().knnMatch(d2, d1, k=2)
good = [a for a, b in mt if a.distance < 0.7 * b.distance]
src = np.float32([k2[a.queryIdx].pt for a in good]); dst = np.float32([k1[a.trainIdx].pt for a in good])
Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
print('registration inliers', int(inl.sum()), 'of', len(good))
S1 = np.diag([ow / gw, oh / gh, 1.0]); S2 = np.diag([OUTW / ow, OUTH / oh, 1.0])
M = S2 @ Hm @ S1
base = cv2.resize(O, (OUTW, OUTH), interpolation=cv2.INTER_LANCZOS4)
gem = cv2.warpPerspective(G, M, (OUTW, OUTH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
# ---- 2. patch regions that Gemini edited (stove pans, counter plates)
diff = cv2.GaussianBlur(cv2.absdiff(gem, base).mean(2).astype(np.float32), (0, 0), 4)
H, W = diff.shape
boxes = [(.72, .40, .98, .72), (.76, .62, 1.0, .88)]
pm = np.zeros((H, W), bool)
for x0, y0, x1, y1 in boxes:
    sub = np.zeros((H, W), bool); sub[int(y0*H):int(y1*H), int(x0*W):int(x1*W)] = True
    pm |= sub & (diff > 22)
pm = ndi.binary_opening(pm, iterations=3)
lab, n = ndi.label(pm); sz = ndi.sum(pm, lab, range(1, n + 1))
pm = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 4000])
pm = ndi.binary_fill_holes(ndi.binary_closing(pm, iterations=10))
pm = ndi.binary_dilation(pm, iterations=18)
pw = ndi.gaussian_filter(pm.astype(np.float32), 9)[..., None]
gem_sharp = cv2.addWeighted(gem, 1.7, cv2.GaussianBlur(gem, (0, 0), 2.2), -0.7, 0)
rgb = (base * (1 - pw) + gem_sharp * pw).astype(np.float32)
# ---- 3. window: green-screen unmix inside the window box only (keeps lettuce/limes untouched)
GREEN = np.array([5, 248, 8], np.float32)  # BGR of the flat window green (measured)
gf = gem.astype(np.float32)
dist = np.linalg.norm(gf - GREEN, axis=2)
gm = (gf[..., 1] > 170) & (gf[..., 1] - gf[..., 2] > 80) & (gf[..., 1] - gf[..., 0] > 80)
gm &= False if False else True
box = np.zeros((H, W), bool); box[int(.05*H):int(.40*H), int(.22*W):int(.86*W)] = True
lab, n = ndi.label(gm & box); sz = ndi.sum(gm & box, lab, range(1, n + 1))
core = np.isin(lab, [i + 1 for i, s_ in enumerate(sz) if s_ > 150])   # every green pocket, incl. the slivers above the light-string wire
glass = ndi.binary_fill_holes(ndi.binary_closing(core, iterations=10))
zone = ndi.binary_dilation(glass, iterations=24)
alpha = np.ones((H, W), np.float32)
t = np.clip((dist - 35) / (170 - 35), 0, 1); t = t * t * (3 - 2 * t)
alpha[zone] = t[zone]
alpha[core & (dist < 35)] = 0
# unmixed colour where partially transparent; sharp painting colour where fully opaque
a3 = np.maximum(alpha, 0.12)[..., None]
unmix = np.clip((gf - GREEN * (1 - a3)) / a3, 0, 255)
# kill any green cast in the semi-transparent glow/edge pixels (BGR order: B=0, G=1, R=2)
unmix[..., 1] = np.minimum(unmix[..., 1], np.maximum(unmix[..., 0], unmix[..., 2]) + 8)
use_unmix = ((alpha < 0.98) & zone)[..., None]
rgb = np.where(use_unmix, unmix, rgb)
front = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
Image.fromarray(cv2.cvtColor(front[..., :3], cv2.COLOR_BGR2RGB)).convert('RGBA')
fr = Image.fromarray(np.dstack([cv2.cvtColor(front[..., :3], cv2.COLOR_BGR2RGB), front[..., 3]]), 'RGBA')
fr.save(f'{OUT}/kitchen_front.webp', quality=93, method=6)
fr.save(f'{WORK}/kitchen_front_master.png')
# ---- 4. back layer: the painted night scene inside the glass, bulbs removed, extended outward behind the frame
bulbs = glass & (alpha > 0.08)
bulbs = ndi.binary_dilation(bulbs, iterations=7)
gl_e = ndi.binary_erosion(glass, iterations=8)
ys, xs = np.where(glass); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
crop = base[y0:y1, x0:x1].copy()
fill = ((~gl_e) | bulbs)[y0:y1, x0:x1].astype(np.uint8) * 255
crop = cv2.inpaint(crop, fill, 9, cv2.INPAINT_TELEA)
Mg = 140
pad = cv2.copyMakeBorder(crop, Mg, Mg, Mg, Mg, cv2.BORDER_REFLECT)
padb = cv2.GaussianBlur(pad, (0, 0), 6)
inner = np.zeros(pad.shape[:2], np.float32); inner[Mg:-Mg, Mg:-Mg] = 1
inner = cv2.GaussianBlur(inner, (0, 0), 10)[..., None]
pad = (pad * inner + padb * (1 - inner)).astype(np.uint8)
canvas = np.empty((H, W, 3), np.uint8); canvas[:] = np.median(crop.reshape(-1, 3), axis=0).astype(np.uint8) // 2
ya, xa = y0 - Mg, x0 - Mg
sy0, sx0 = max(0, -ya), max(0, -xa)
dy0, dx0 = max(0, ya), max(0, xa)
hh = min(pad.shape[0] - sy0, H - dy0); ww = min(pad.shape[1] - sx0, W - dx0)
canvas[dy0:dy0 + hh, dx0:dx0 + ww] = pad[sy0:sy0 + hh, sx0:sx0 + ww]
Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)).save(f'{OUT}/kitchen_street_back.webp', quality=92, method=6)
# ---- 5. thumbnail
comp = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)).convert('RGBA'); comp.alpha_composite(fr)
comp.convert('RGB').resize((640, 357), Image.LANCZOS).save(f'{OUT}/thumb.webp', quality=90, method=6)
comp.convert('RGB').resize((1377, 768), Image.LANCZOS).save(f'{WORK}/preview_composite.png')
print('window glass bbox (norm):', round(x0/W,3), round(x1/W,3), round(y0/H,3), round(y1/H,3))
print('patched px share %.3f' % pm.mean())
