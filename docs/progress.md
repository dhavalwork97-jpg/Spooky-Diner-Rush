# Chef Rush: Progress

## Milestone 1: Foundation (in review)

### Done
- Repo audit: the repo held only a README and an initial commit. Everything is new.
- Style guide drafted and approved (`docs/style-guide.md`).
- Vite + TypeScript + Phaser project, scene skeleton (Boot, Game), data loading with validation.
- `kitchen_full.webp` registered and shown as a static background.
- Kitchen scene with 12 data-driven tap zones, overlay highlight, label, pooled sparkle burst.
- Animation helpers (pop, bounce, shake, glow, fade, moveTo), animation guard, particle pool, reduced-motion support.
- CrazyGames SDK wrapper (no-op without the SDK), save system (SDK with localStorage fallback).
- 14 unit tests (coordinate conversion, zone mapping, overlap check, data validation, animation guard, save parsing).

### Kitchen background
- Source: supplied `kitchen_full.webp`, 1699 x 926, 178,662 bytes (VP8 lossy).
- Final file: `public/assets/art/kitchen_full.webp`, byte-identical to the source. No resize and no re-encode, because the file is already small and re-encoding a lossy file would only lose detail.
- Lives under `public/` so Vite copies it into `dist` and the manifest path `assets/art/kitchen_full.webp` works in dev and production.
- Registered in `data/assets.json` and loaded once by BootScene as texture `kitchen_full`.
- Logical canvas is 1280 x 698 and the image is contain-fitted (about 0.753x), centered. No distortion.

### Station zones (`data/restaurants.json`, burger_diner)
Normalized 0..1 rectangles, converted at runtime. Mapping to the artwork:

| Zone id | Station type | Artwork | Unlock |
|---|---|---|---|
| fryer | fryer | basket fryer, two baskets | Lv 1 |
| grill | grill | four-burner grill top | Lv 1 |
| serving_counter | assembly | four plates | Lv 1 |
| drink_dispenser | drinks | red dispenser | Lv 6 |
| ice_cream_machine | ice_cream | soft-serve machine | Lv 12 |
| pizza_oven | oven | center oven | Lv 10 |
| dough_bases | dough | two dough bases | Lv 10 |
| topping_bins | toppings | left orange counter bins | Lv 1 |
| ingredient_bins | ingredients | yellow two-bin unit | Lv 1 |
| prep_station | prep | bowl and mold tray | Lv 1 |
| trash_bin | trash | trash can | Lv 1 |
| chiller | chiller | steel unit, far right | Lv 1 |

Assumptions to confirm: the artwork has no dedicated burger assembly area or bun, lettuce and tomato trays, so the plate counter is used for assembly and serving. The yellow two-bin unit and the steel chiller have no assigned role yet.

### Verified (real game in Chromium, mouse and touch)
- Production build loads with no console errors and 12 zones.
- At 1280x720, 1920x900, 844x390 (touch) and 390x844 (touch): tapping the center of each of the 12 zones selected exactly that zone (0 wrong taps), and tapping empty space selected nothing new. Zones stayed aligned in every size.
- Tap highlight, label and sparkle burst render over the static background.
- Typecheck clean, 14 unit tests pass.

### Not verified or not done
- Station animations beyond tap feedback (fryer, grill, assembly, customers, serving, rewards). No gameplay exists yet, so there is nothing real to animate.
- Real-device touch and performance (only emulated touch in desktop Chromium).
- Reduce-motion behavior was written but not exercised in a browser.
- Fredoka font is not bundled yet (needs approval for a font file). The fallback stack is used.
- Scenes not created yet: Menu, RestaurantSelect, Shop, RecipeBook, Settings. They arrive with their milestones.

### Known issues
- Touch target size: at the 1280 logical size only trash_bin (55 x 134 css px) is under 88 px, because the can is narrow in the artwork and its neighbors leave no room to widen it without overlap. On phones in landscape, topping_bins, prep_station, dough_bases, serving_counter and trash_bin are under 88 px in one dimension. Portrait mode shrinks the whole canvas to about 213 px tall, so a landscape prompt is needed in a later milestone.
- Bundle: 1.38 MB JS (362 KB gzip) plus 179 KB art. Phaser is most of it.
- Headless Chromium logs "GPU stall due to ReadPixels" warnings from the software GL driver. They are not from game code.

### Next
- Milestone 2: vertical slice (fries, burger, drag-and-drop serving, tutorial, XP, Closed screen, audio), plus the first station animations (fryer, grill, assembly, customer arrival, serving, rewards).
