"""Build the title-screen art from the Gemini images.

Usage: python3 tools/make_title_art.py <background.png> <logo_on_green.png> <chef_ghost_on_green.png> [out dir]

The logo and the chef are on a flat bright green background. Each pixel is treated as
pixel = a * figure + (1 - a) * green, so the green is removed and the soft glow around the logo keeps its
colour with a partial alpha (no green fringe). The sparkle mark Gemini puts in the bottom-right corner is cleared.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

GREEN = np.array([0.0, 255.0, 0.0])


def key(src: Path, max_w: int, lo: float, hi: float, outline: bool = False, corner_clear: bool = True) -> Image.Image:
    a = np.asarray(Image.open(src).convert('RGB'), dtype=np.float64)
    h, w, _ = a.shape
    if corner_clear:
        a[int(h * 0.9):, int(w * 0.9):] = GREEN  # the generator's sparkle mark
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = np.clip(1.0 - (g - np.maximum(r, b)) / 255.0, 0.0, 1.0)
    # Harder edge: the soft glow Gemini paints around the figure is orange or cyan mixed with green and would leave a
    # yellow-green halo. Everything below `lo` becomes transparent, everything above `hi` opaque (glow is added in code instead).
    alpha = np.clip((alpha - lo) / (hi - lo), 0.0, 1.0)
    if outline:
        # Orange glow over green has no green dominance, so the keyer would call it solid. Keep only what lies inside the
        # figure's own dark brown outline (plus the pale ghost and the white hat, which are enclosed by it or touch it).
        brown = (r > 35) & (r < 150) & (g < 100) & (b < 80) & (r > g * 1.25)
        pale = (b > 150) & (g > 190) & (r > 120)  # cream letters, white hat, mint ghost
        sil = ndimage.binary_closing(brown | pale, iterations=3)
        sil = ndimage.binary_fill_holes(sil)
        sil = ndimage.binary_opening(sil, iterations=2)
        soft = ndimage.gaussian_filter(sil.astype(np.float64), 1.2)
        alpha = alpha * np.clip(soft * 1.6 - 0.3, 0.0, 1.0)
        # the glow trapped between the letters is still orange or lime: keep only pixels that are the figure's own colours or touch them
        alpha = alpha * ndimage.binary_dilation(brown | pale, iterations=2)
    safe = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip((a - (1.0 - alpha[..., None]) * GREEN) / safe, 0, 255)
    # remove any green left in the figure's edge pixels (despill): green may not exceed the larger of red and blue
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]) * 1.02)
    out = np.dstack([fg, alpha * 255.0]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    ys, xs = np.where(out[..., 3] > 8)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    return im


if __name__ == '__main__':
    bg, logo, chef = (Path(p) for p in sys.argv[1:4])
    out = Path(sys.argv[4]) if len(sys.argv) > 4 else Path('public/assets/intro')
    out.mkdir(parents=True, exist_ok=True)
    b = Image.open(bg).convert('RGB')
    b = b.resize((1600, round(b.height * 1600 / b.width)), Image.LANCZOS)
    b.save(out / 'title_bg.webp', 'WEBP', quality=82, method=6)
    for name, src, mw, lo, hi, ol in (('title_logo', logo, 900, 0.45, 0.9, True), ('title_chef', chef, 520, 0.2, 0.85, False)):
        im = key(src, mw, lo, hi, ol)
        im.save(out / f'{name}.webp', 'WEBP', quality=90, method=6, exact=True)
        print(name, im.size, (out / f'{name}.webp').stat().st_size)
    print('bg', b.size, (out / 'title_bg.webp').stat().st_size)
