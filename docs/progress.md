# Chef Rush: Progress

## Milestone 2: Vertical slice (in review)

Lv 1 to 3 is playable start to finish: fries, burgers, drag-and-drop serving, tutorial hand, XP and level-ups, reputation and the Closed screen, animations, and synthesized audio.

### How the code is split
- `src/game/*` is the whole game model (no Phaser): cook phases, orders, patience, XP, coins, reputation, closing, tutorial hints. 41 unit tests cover it, plus a bot simulation.
- `src/views/*` and `GameScene` only read that model and play effects from its events. Animations never decide cooked, burnt, served or ready.
- All numbers come from `data/recipes.json`, `progression.json`, `xp.json`, `customers.json`, and are checked at load.

### Implemented and verified in the real game (Chromium, 1280x720, mouse)
- Fryer: two independent vats, progress ring, green tick when ready, warning and danger rings (exclamation shape, not color alone), burnt fries with black spots, smoke, "Not ready yet" on an early tap, discard with a coin penalty. Verified by script and screenshots.
- Grill: patty cooks, FLIP prompt, flip hop with squash and stretch, second side, collect onto a waiting bun. Verified by script and screenshots.
- Burger assembly: bun drops onto a counter plate, patty and top bun drop on, squish. Verified by script and screenshots.
- Customers: arrival slide and card pop, order card with patience strip and ticks, expression changes (neutral, impatient, angry, happy), leave animation, Closed overlay when reputation empties. Verified.
- Drag and drop: drag with highlight on the customer under the pointer, snap back on a wrong or empty drop, tap-to-serve. Verified with mouse and with real touch events at 844x390 and 1024x768.
- Rewards: coins fly to the coin counter and count up, XP bar fills smoothly, level badge pops, level-up card with unlocks. Verified.
- Reduced motion (saved setting): shake, particles and loops are skipped; a burger was built with no errors. Verified once.
- Pause when the tab loses focus, and save at level-up and every 15 s. Level-up save verified in localStorage.

### Not verified
- Audio is synthesized with WebAudio and runs without errors, but nobody has listened to it, so mix and loudness are untested.
- Real phones: only emulated touch in desktop Chromium. No real frame rate measurement (the headless browser ran about 30 fps in software rendering).
- The 30-minute memory soak was run on the model only (30 simulated minutes, no growing state), not in the browser.
- The pause overlay (tab blur) and the mute button were not exercised.
- Oil bubbles and steam particles are small; they were seen in motion only indirectly.

### Balance probe (bot simulation, 5 seeds)
A bot that acts every 0.7 s with no mistakes reaches Lv 2 at about 34 s and Lv 3 at about 75 s, and never closes. A human will be slower, so the first level-up lands near the first minute. XP uses the brief's formula, 100 + 40 x level. A bot that never acts closes the shop. Real tuning comes with the Milestone 5 simulation.

### Differences from the brief (please confirm)
- No dedicated assembly area exists in the artwork, so burgers are built on the four counter plates. Tap the buns, then collect the finished patty from the grill; the patty lands on the waiting bun.
- A patty cannot be removed before it is done (the player gets "Not ready yet"). The brief said under-cooked patties are rejected by customers; this is simpler and gives the same result.
- Items cannot be dragged out of the fryer or off the grill yet. Tap collects them onto a plate, then they are dragged to a customer.
- Not started (later milestones): combo meter and Rush tag, events, upgrades and Shop, the chef, story cards, restaurants, debug panel (only `?debug&level=N&speed=N` and a `window.__chefRush` test hook exist).
- Past Lv 3 the game keeps running with slowly shrinking patience (floor 30 s) but no new content yet.
- Fredoka is still not bundled; the fallback font stack is used.

### Known issues
- Phone text is small: HUD labels are 18 logical px, about 10 CSS px on an 844 px wide phone. Needs a bigger HUD scale on small screens.
- Seat 4 (far left) would overlap its neighbor's order card. It only matters at 4 customers (Lv 13+).
- Order icons, customers and food are code-drawn placeholders in the style guide until real art is supplied.

---

## Milestone 1: Foundation (PR #3)

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
| fryer_vats | fryer | yellow unit, two top baskets | Lv 1 |
| fries_bin | fries_bin | yellow unit, right lower bin | Lv 1 |
| nuggets_bin | nuggets_bin | yellow unit, left lower bin | Lv 11 |
| side_plate, side_tray | side_plate | left counter plate and red tray (fries land here) | Lv 1 |
| lettuce_tray, tomato_tray | lettuce, tomato | left counter trays | Lv 2 |
| prep_station | prep | bowl and mold tray | Lv 10 |
| dough_bases | dough | two dough bases | Lv 10 |
| serving_counter | assembly | four plates (burgers and drag-to-serve) | Lv 1 |
| grill | grill | four-burner grill top (two burners used) | Lv 1 |
| bun_basket | buns | basket unit | Lv 2 |
| patty_tray | patty_tray | steel unit, far right | Lv 2 |
| pizza_oven | oven | center oven | Lv 10 |
| drink_dispenser | drinks | red dispenser | Lv 6 |
| ice_cream_machine | ice_cream | soft-serve machine | Lv 12 |
| trash_bin | trash | trash can | Lv 1 |

Station roles were re-mapped from the reference video: the yellow unit is the fryer (top baskets) with the fries and nuggets bins under it, the basket unit holds buns, and the steel unit holds raw patties.

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


## Milestone 2 re-map (reference video flow, your zip art)

Flow now: fries bin -> vat (cooks, then warning, burns) -> tap vat -> side plate. Burger: tap buns -> tap patty tray (patty goes on the grill) -> flip when ready -> tap to put the patty on the burger -> lettuce tray -> tomato tray -> top bun closes it automatically. Drag or tap-tap a finished item to the customer. Continuous service, XP "Lv N", reputation and Closed/Reopen unchanged.

Art now used from the zip: kitchen_full, fries, patty, bun, lettuce, tomato, coin, three customers, order bubble, patience frame. Not used yet (marked lazy in `data/assets.json`): cheese, onion, pickle, nuggets, pizza, drinks, chef, logo, bg_taco.

### Verified in a real browser (Chromium, headless)
- Full burger build via real clicks: bun, patty, flip, patty on burger, lettuce, tomato, top bun, with the zip art stacked on the plate.
- Fries to a side plate and served to a customer: mouse drag at 1280x698, tap-tap at 844x390 touch. Both paid coins and XP.
- No console or page errors. Typecheck clean, 45 unit tests pass (incl. bot simulation reaching Lv 3), production build succeeds.

### Not verified
- Tutorial hand positions for the burger steps were seen once (drag step) but not each step.
- Reduced motion, audio output and real-device performance remain unexercised.
- Fredoka is still not bundled.
- Phone landscape (844x390) touch targets under 88 css px: lettuce, tomato, both side plates, fryer_vats (45 high), nuggets_bin, fries_bin, prep_station, dough_bases, serving_counter, trash_bin. At 1280 wide: lettuce, tomato, side plates, fryer_vats (81 high) and trash_bin.

### Scale mismatch to confirm
The zip food art is drawn at 2x and larger than the plates in this kitchen, so items are scaled down (about 62 to 70 px wide). The customers are single-pose, so mood shows as a tint and a hop, not a face change. Stock sprites on bins and trays are not overlaid; the kitchen image already shows them.

## Added after review: nuggets and pizza
- Nuggets (Lv 4, for now): nuggets bin -> fryer vat -> side plate, using the zip raw/cooked/burnt art.
- Pizza (Lv 5, for now): dough bases -> oven (raw pizza hops in, browns into the cooked pizza) -> plate. The zip has no burnt pizza, so burnt is the cooked art darkened with a tint; replace it if a real burnt pizza is made.
- Unlock levels are earlier than the brief (nuggets Lv 11, pizza Lv 10) so they can be tried now; they are single numbers in `data/recipes.json` and `data/restaurants.json`.
- Verified in Chromium: nuggets and pizza each cooked and landed on a plate; 52 tests pass. Pizza toppings (prep station) are not built.

## Added after comparing phone recordings with the reference video
- Stock sprites on the bins and trays (raw fries, nuggets, buns, raw patties, lettuce, tomato) appear when each station unlocks; they squash when tapped.
- Fries and nuggets sit in the oil: translucent oil layer, rippling surface, bubbles that rise and pop (denser while raw), jiggle, and fries turning golden as they cook. Raw patties also hop from the tray onto the grill.
- Verified in stills only (Chromium); motion feel not judged on a phone. 52 tests pass.
- Seen in the recordings: on a portrait phone the game fills only about a third of the screen, so a "rotate to landscape" prompt is needed (planned for the polish milestone).
