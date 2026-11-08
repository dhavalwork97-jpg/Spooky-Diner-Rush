"""Paint the four painted pans (and handles) out of the Taco Truck kitchen so pan sprites can be drawn instead.

Usage: python3 -I tools/taco_source/remove_pans.py <composite_kitchen.png> <out_front.webp> [preview.png]
The composite is back + front layers flattened (2754 x 1536). The new RGB is applied to kitchen_front.webp keeping its own
alpha (the window cut-out), so customers still show through the window.
"""
import sys
import cv2
import numpy as np
from PIL import Image

W, H = 2754, 1536
OX, OY = 1983, 614  # crop origin: the stove area
comp = np.array(Image.open(sys.argv[1]).convert('RGB'))
assert comp.shape[:2] == (H, W)

# (centre x, centre y, radius x, radius y) of each bowl in full-image px; handles as (x1, y1, x2, y2, thickness)
BOWLS = [(OX + 190, OY + 170, 98, 60), (OX + 436, OY + 170, 92, 56), (OX + 212, OY + 262, 112, 66), (OX + 458, OY + 262, 112, 66)]
HANDLES = [(OX + 265, OY + 300, OX + 362, OY + 340, 30), (OX + 505, OY + 300, OX + 605, OY + 340, 30)]
mask = np.zeros((H, W), np.uint8)
for cx, cy, rx, ry in BOWLS:
    cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
for x1, y1, x2, y2, t in HANDLES:
    cv2.line(mask, (x1, y1), (x2, y2), 255, t)
out = cv2.inpaint(comp, mask, 9, cv2.INPAINT_TELEA)
if len(sys.argv) > 3:
    Image.fromarray(out[OY - 20:OY + 400, OX - 20:OX + 690]).save(sys.argv[3])
    ov = comp.copy()
    ov[mask > 0] = (0.5 * ov[mask > 0] + 0.5 * np.array([255, 0, 255])).astype(np.uint8)
    Image.fromarray(ov[OY - 20:OY + 400, OX - 20:OX + 690]).save(sys.argv[3].replace('.png', '_mask.png'))
front = Image.open('public/assets/taco/background/kitchen_front.webp').convert('RGBA')
alpha = front.getchannel('A')
res = Image.fromarray(out).convert('RGBA')
res.putalpha(alpha)
res.save(sys.argv[2], 'WEBP', quality=92, method=6)
print('saved', sys.argv[2])
