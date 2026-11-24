# Asset optimisation report

Branch `performance/asset-optimization` (from `release/poki`). Scope: everything in `public/` (what the game downloads). Nothing merged, nothing deployed.

## Result

- Original total: 25,418,153 bytes (24.24 MB)
- Optimized total: 25,297,263 bytes (24.13 MB)
- Saved: 120,890 bytes (0.48%)
- Optimized files: 10; unchanged files: 224 (of 234)

**Honest summary:** the saving is small (about 1%). 157 of 159 WebP files are already lossy WebP, so lossless re-encoding would make them bigger, and re-encoding lossy files again only gives a gain once quality drops visibly. The real remaining saving is in image dimensions (see the last section), which the brief does not allow for spritesheets.

## Per category

| Category | Files | Improved | Original | Optimized | Saved |
|---|---|---|---|---|---|
| Customer assets | 35 | 0 | 7,854,556 | 7,854,556 | 0 (0.0%) |
| Pizza Shop | 33 | 0 | 2,355,161 | 2,355,161 | 0 (0.0%) |
| Shared UI / game (fonts, icons, intro, JSON) | 11 | 3 | 1,981,848 | 1,973,397 | 8,451 (0.4%) |
| Spooky Diner (extras) | 24 | 0 | 677,170 | 677,170 | 0 (0.0%) |
| Spooky Diner (kitchen art) | 37 | 4 | 3,051,369 | 3,018,812 | 32,557 (1.1%) |
| Taco Truck | 94 | 3 | 9,498,049 | 9,418,167 | 79,882 (0.8%) |

## 30 largest assets (original vs optimized)

| File | Original | Optimized |
|---|---|---|
| `assets/intro/intro.mp4` | 1,484,608 | 1,484,608 |
| `assets/customers/mint_ghost/ghost_leave_happy.webp` | 1,025,716 | 1,025,716 |
| `assets/taco/animations/oven_taco_shell_sheet.webp` | 1,006,748 | 1,006,748 |
| `assets/art/ice_cream_anim.webp` | 860,876 | 860,876 |
| `assets/customers/mint_ghost/ghost_leave_angry.webp` | 831,250 | 831,250 |
| `assets/customers/mummy_ghost/mummy_ghost_happy.webp` | 691,774 | 691,774 |
| `assets/customers/blue_yeti/blue_yeti_happy.webp` | 654,716 | 654,716 |
| `assets/customers/mint_ghost/ghost_idle_happy.webp` | 563,094 | 563,094 |
| `assets/customers/mint_ghost/ghost_impatient.webp` | 520,550 | 520,550 |
| `assets/art/cold_drink_anim.webp` | 515,464 | 515,464 |
| `assets/customers/mummy_ghost/mummy_ghost_angry.webp` | 508,904 | 508,904 |
| `assets/customers/pink_fuzz/pink_fuzz_happy.webp` | 501,560 | 501,560 |
| `assets/customers/mummy_ghost/mummy_ghost_calm.webp` | 443,414 | 443,414 |
| `assets/taco/background/kitchen_front.webp` | 442,236 | 442,236 |
| `assets/art/kitchen_full.webp` | 429,328 | 429,328 |
| `assets/customers/blue_yeti/blue_yeti_angry.webp` | 423,482 | 423,482 |
| `assets/taco/animations/taco_dispenser_sheet.webp` | 422,432 | 422,432 |
| `assets/taco/animations/pan_blue_chicken_sheet.webp` | 310,516 | 310,516 |
| `assets/taco/animations/pan_red_chicken_sheet.webp` | 308,146 | 308,146 |
| `assets/customers/mint_ghost/ghost_angry.webp` | 306,256 | 306,256 |
| `assets/customers/mummy_ghost/mummy_ghost_upset.webp` | 294,950 | 294,950 |
| `assets/taco/animations/pan_blue_shrimp_sheet.webp` | 290,614 | 290,614 |
| `assets/taco/animations/pan_red_shrimp_sheet.webp` | 288,310 | 288,310 |
| `assets/taco/animations/pan_blue_veggies_sheet.webp` | 286,462 | 286,462 |
| `assets/customers/pink_fuzz/pink_fuzz_angry.webp` | 282,438 | 282,438 |
| `assets/taco/animations/pan_red_veggies_sheet.webp` | 275,794 | 275,794 |
| `assets/taco/animations/cook_veggies_sheet.webp` | 259,710 | 259,710 |
| `assets/taco/animations/pan_blue_fish_sheet.webp` | 255,408 | 255,408 |
| `assets/taco/animations/pan_red_fish_sheet.webp` | 252,886 | 252,886 |
| `assets/art/cold_drink_icon.webp` | 251,872 | 251,872 |

## Files that changed

| File | Original | Optimized | Method |
|---|---|---|---|
| `assets/taco/background/kitchen_street_back.webp` | 116,176 | 55,994 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `assets/taco/sprites/cooked_fish.webp` | 120,080 | 106,574 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `assets/art/nuggets_raw.webp` | 23,902 | 15,392 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `assets/art/level_badge.svg` | 8,907 | 723 | svgo (metadata/whitespace removed, viewBox kept) |
| `assets/art/xp_bar_frame.svg` | 8,508 | 485 | svgo (metadata/whitespace removed, viewBox kept) |
| `assets/art/nuggets_burnt.webp` | 18,494 | 10,654 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `assets/taco/sprites/raw_fish.webp` | 30,574 | 24,380 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `assets/intro/title_chef.webp` | 48,282 | 42,836 | WebP re-encode, method 6, alpha lossless, RGB min PSNR >= 44 dB |
| `icons/icon-512.png` | 96,167 | 93,486 | oxipng level 6 (lossless, pixel-identical) |
| `icons/icon-192.png` | 21,480 | 21,156 | oxipng level 6 (lossless, pixel-identical) |

## Method per category
- SVG (2): svgo 3 with `removeViewBox` off. `level_badge.svg` carried an 8 KB embedded provenance (c2pa) metadata blob that is not drawn. Rendered at 4x: `xp_bar_frame` is pixel-identical; `level_badge` differs in 53 anti-aliased edge pixels (rounding of a highlight curve), invisible at game size.
- PNG (2 icons): oxipng level 6, lossless. Pixel-identical (checked).
- WebP: each file was decoded, re-encoded (method 6, lossless alpha, hidden colour kept) at q86, 82, 78, 74 and the smallest passing result kept only if (a) width and height are identical, (b) the alpha channel is byte-identical, (c) the colour score against the original (composited on black, grey and white) is at least 44 dB (46 dB for sheets) and (d) it is at least 8% smaller. Otherwise the original file stays untouched.

## Skipped and why
- Animation sheets and atlases (taco/animations, pizza/sheets, pizza/atlases, customers, ice cream and cold drink sheets, diner_extras): the brief says to protect them. A few passed the test (for example `oven_taco_shell_sheet`, about 119 KB saving) but were reverted to the originals to keep the animation art byte-identical. Only static sprites and a background were re-encoded.
- Files where no quality level met the rules and the 8% gain: 148 files, left byte-identical.
- `intro/intro.mp4` (1.4 MB): not an image; it is already left out of the CrazyGames and Poki builds.
- Not deleted: no asset was removed. Nothing was proven unused.

## Remaining opportunities (checked, mostly not worth the risk)
1. Shrinking the customer or Taco Truck sheets was investigated and rejected. Customer frames are 192 to 256 px and are drawn at about the same size on a 1280x698 game screen (a 162 px tall body from a 192 px frame), and larger on big or high-density screens. Halving them would visibly blur the characters. The sheets are big because they hold 90 to 130 frames each, not because they are oversized.
2. Start-up download (Poki build, measured in headless Chromium, network only): 5.78 MB raw, roughly 4.5 MB after the JavaScript is gzip-compressed (estimate). Poki recommends about 5 MB at start, so this is close to the guide. (An earlier note of 9.8 MB double-counted images the browser re-reads from memory.) The largest start-up files: first customer (mint ghost) 1.36 MB, Phaser 1.33 MB, `ice_cream_anim` 0.84 MB, `cold_drink_anim` 0.50 MB, `kitchen_full` 0.42 MB.
3. Possible future saving, not done: load `ice_cream_anim` and `cold_drink_anim` (1.3 MB) only when those machines first appear. This changes loading order and needs animation checks, so it needs your approval.
4. Real WebP gains need the original artwork files re-exported, since the shipped files are already lossy.

## Validation
- Full test suite: 84 files, 1019 passed, 2 skipped, 0 failed.
- Headless Chromium smoke test of the normal build (Diner, `?taco&test`, `?pizza&test`): no script errors and no missing assets (no 4xx). The only console errors were the external CrazyGames SDK script, which the sandbox network blocks (expected here).
- Production builds: `build`, `build:crazygames`, `build:poki` all succeed.
- Dimensions and alpha channels of every changed WebP compared with the original: identical.
- Side-by-side visual check of three changed images: no visible difference.
