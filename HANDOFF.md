# HANDOFF

Last updated: Claude, session 2026-11-01
Last updated at: 2026-11-01 15:40 IST

## Rename to Spooky Diner Rush (2026-11-01, Claude) - branch `chore/rename-spooky-diner-rush`
Owner picked "Spooky Diner Rush" (ghost customers and scares). Changed: page title (`index.html`), boot screen text (`BootScene`), README and doc headings. Deliberately NOT changed: save key `chef-rush-save` (so nobody loses progress), `package.json` name, GitHub repo name, the `window.__chefRush` debug hook. Not done: CrazyGames listing text, cover art, a logo.

## START HERE: current status (2026-11-01, Claude)
First version (one restaurant) is feature complete and in release prep. Sections below are newest first; older milestone notes are further down.
- `main` is at 6d5eb54 (PR #19 merged). Merged today: customer system, ghost-only customers with scare clips (PRs #15, #16, #18), drinks and ice cream served straight from the machine (#17), animation helper drift fix (#19). Backups: branches `backup/main-2026-10-29`, `backup/main-2026-11-01`, `backup/main-2026-11-01-b` (a3414ed).
- OPEN, NOT MERGED: PR #20 `chore/release-prep` (bundled Fredoka, smaller art sheet, SDK init, 12 MB build, `docs/release.md`). Merge it, then read `docs/release.md`.
- Tests 229, typecheck and build clean on the branch.
- Left for the owner: CrazyGames cover images, title and description, "saves progress" toggle, testing with the real SDK, real phones (thumb feel, fps), real sound, slow connections (scare sheets about 7 MB lazy).
- Known limits: vest gentleman has no scare clip (code lunge) and no angry face; no scare sound; ghosts have no happy or eating faces (needs new art); people customers are blanked in `customers.webp` (needs the 8 PNGs and `CUSTOMER_LOOK_MIN` 0 to return); fast Lv 20 bot is about 7 s quicker since drinks skip the plates (test floor 1750 s); the Lv 1 price label sits over the tomato cover on purpose; second restaurant is not in this version (next update).
- Tools: `tools/make_customer_art.py` (see its header; `--blank-people`). Headless play script lived outside the repo (a bot calling the model through `window.__chefRush` with `?debug&level=N&speed=N`).
- Process notes: branch per task, PR, never merge without the owner saying so. The stop hook "unpushed commits / no remote branch" warning has been a false alarm every time (check `git ls-remote --heads origin <branch>`). Avoid `pkill -f "vite preview"` in the shell (it kills the shell); GitHub writes work through git push and `gh api` REST only.

## Housekeeping and release packaging (2026-11-01, Claude) - branch `chore/release-prep` (from main after PR #19), PR open, NOT merged
- Fredoka bundled: `public/assets/fonts/fredoka-{400,600,700}.woff2` (+ OFL text), `@font-face` in `index.html`, BootScene waits for the font (1.5 s cap) because canvas text does not redraw later.
- People frames blanked in `customers.webp` (391 KB -> 238 KB; frame numbers unchanged; tool flag `--blank-people`). Spawn pool is unchanged (ghosts only).
- Lv 1 price label over the tomato lock cover: left as is on purpose (at Lv 2+ the same price sits over the same tray); shrinking the cover only exposed painted tomatoes behind the coin.
- Packaging: ghost cutout PNGs removed from `dist/` by a Vite plugin (they are art sources only; dist 16 MB -> 12 MB), CrazyGames SDK v3 script tag and awaited `init()` (never throws, 3 s cap), `docs/release.md` with sizes, SDK status and what the owner still has to do.
- Tests 229, typecheck and build clean; browser: game starts in 1.3 s with the SDK script blocked, fonts load. Real SDK, real device, real audio not checked.


## Touch drag check and wider machine grab areas (2026-11-01, Claude) - branch `fix/touch-grab` (from main 6d5eb54), PR open, NOT merged
Owner report: in Chrome device mode, dragging cooked items to customers did not work.
- Reproduced with real emulated touch events (CDP `Input.dispatchTouchEvent`, 667x375 up to 1180x820, also rotating from portrait): cook fries with touch taps, pick up, drag to customer = works. Every plate/side/pizza slot (8) x every seat (4) with burger, fries and pizza = 32 of 32 drags work. So no failure found for items on plates.
- Likely culprit for drinks and ice cream: the grab area of a full glass or cone was one lane wide (about 21 px on a phone), so a finger or cursor easily misses it and just taps the machine. Fix: `laneSpan` in `src/kitchen/grab.ts` lets a ready lane also grab the free lanes beside it (0.9 lane each way, neighbours split the gap, never overlap), rebuilt when the neighbours' readiness changes (`ItemView.pourSig`). At 844x390 a lone glass or cone is about 41 px wide; touch drags with offsets of up to 20-40 px all serve. Unit test added (233 tests).
- Not reproduced / unknown: whatever the owner hit (device, item type, what happened). If it still fails, ask which device, which item, and whether the item snapped back, did nothing, or the customer shook.
- Harness traps (cost time, not game bugs): clearing `state.customers` leaves old customer views in `custViews`, which then win the drop test; level-up cards block input.

## Release check: playthrough and phone size (2026-11-01, Claude) - branch `fix/anim-helper-drift` (from main a3414ed), PR open, NOT merged
Full Lv 1-20 playthrough in Chromium (bot calling the model, real game loop, speed 6, 1280x698; screenshot per level) and phone viewports (844x390, 932x430, 667x375 landscape, 390x844 portrait).
- Lv 20 reached at 2568 s game time (about 43 min, inside the 30-50 min target); no page errors; no persistent view/model mismatches; object and tween counts flat (about 180-215 objects) so no leaks seen. Only console noise is the headless software-GL "GPU stall" message. Frame rate in headless (10-15 fps) says nothing about real devices.
- BUG FOUND AND FIXED: HUD coin icon (and anything using `pop`/`bounce`/`shake`) drifted when the same animation restarted mid-flight: the helper read the already animated scale/x/y as the rest value, so overlaps ratcheted it up (coin icon filled the screen at Lv 16 and 20). Fix: `RestValues` in `src/anim/guard.ts` remembers the rest value per key; `helpers.ts` uses it. Checked: 14 rounds of overlapping coin pops, icon only ever 1.0x or 1.25x. Test added.
- Phone: portrait shows the rotate prompt; landscape fits (letterboxed). Customer tap area 56-64 px wide. The new draggable glass/cone grab areas are one lane wide, which is only about 19-23 px on phones (lanes touch, so no wider), so: they are taller now (cone area reaches down over its progress ring), and the green tick on the dispenser (45 px) is a handle: tap it to pick the first full cup, then tap the customer. Verified at 844x390: badge then customer, and drags from a lane, both serve.
- Not checked: real touch device (thumb feel, real fps), slow network (scare sheets about 7 MB lazy), real audio.

## Drinks and ice cream are served from the machine (2026-11-01, Claude) - branch `feature/serve-from-dispenser` (from main 58d92bf), merged (PR #17)
Owner: a full cold drink must stay at the dispenser and be dragged from there to the customer, not jump onto a plate when tapped; check ice cream too. Ice cream did the same (`tapIceCream` moved a ready cone to a side/plate slot), so both changed.
- Model: new `KitchenState.serveFromPour(from, index, customerId)` and `pourReady(from, index)`. `tapDrinks`/`tapIceCream` now only start a fill/swirl in a free lane (no more collect); with every lane full and one ready they say "Drag the full drink / the ice cream to a customer". A ready cup or cone stays in its lane (cup never spoils, cone still melts). Wrong customer or wrong item behaves like `serve`: patience penalty, item stays. `deliver`/`wrongDrop` events carry `from`/`index` and slot -1; the `collect` event is now fryer/oven only. Drinks and cones no longer use plate or side slots.
- Scene: `GameScene.syncPourItems` keeps an invisible grab area (an `ItemView` in proxy mode, `ItemView.setProxy/reveal`, `source`) over every ready glass/cone. Drag shows a copy of the item following the pointer, a miss snaps it back, a hit flies it to the customer and the painted glass/cone empties. Tap the glass/cone then tap a customer also works (`selectedPour`).
- Balance note: with no plate step the fast Lv 20 bot got 7 s quicker (1793 s, floor was 1800), so `tests/sim_late.test.ts` lower bound moved to 1750. Owner can decide if that needs tuning.
- Tests: 228 pass (drinks/ice cream tests rewritten, bot helper uses `serveFromPour`). Typecheck, build clean. Headless Chromium: full glass and cone stay at the machine, a miss snaps back, drag drops serve the customer, tap-select then tap customer works, no page errors. Not checked on a real touch device.

## Two more ghost scare sheets (2026-11-01, Claude) - branch `feature/two-more-ghosts` (from main), merged (PR #17)
Owner supplied `ghost_scare_sprites_new2.zip` (only scare sheets, no cutouts): `flame_crown_ghost` (already a customer, so she now plays a real scare instead of the code lunge and gets the losing-patience face, `warnMax` 18) and a NEW ghost `ragged_dress_girl`.
- `ragged_dress_girl` has no idle cutout in the zip: `ghosts/ragged_dress_girl.png` is frame 0 of her scare sheet, clipped to the `ghostBoxFirstFrame` x range (drops the loose ring swirls). Look 14 (`CUSTOMER_LOOKS`, `CUSTOMER_LOOK_COUNT` 15, FIGURE_W 187); sheet frames: ghosts 8-14, shadow 15, heart 16 (`customers.webp` 768x1920, 391 KB). If the owner has a proper cutout, drop it over that PNG and re-run the tool.
- `tools/make_customer_art.py` now accepts the existing `customers.webp` as first argument (people cells are copied from it since the 8 people PNGs are not in the repo; ghosts are rebuilt from their cutouts). Command used: `python3 tools/make_customer_art.py /tmp/old_customers.webp public/assets/customers/ghosts public/assets/art/customers.webp` (copy the old sheet first).
- Scare: `SCARES` entries (flame crown peak 26, ragged girl peak 32); sheets are lazy. Her clip is a calm spin with amber eyes, so `warnMax` 0 = no angry face while waiting, she only plays the clip when she leaves angry. Only `vest_gentleman` still uses the code lunge and has no angry face.
- Tests 226 pass; typecheck and build clean. Headless Chromium: both seated, flame crown angry face at low patience, both scare clips play, no errors. Not checked on a real device. Lazy download grows by about 2 MB.

## Losing-patience expressions for ghosts (2026-11-01, Claude) - branch `feature/ghost-customers`
Owner picked "use the scare sheets earlier". Below half patience, the four ghosts that have a scare sheet fade into its early frames laid over the idle ghost (ghost box from each `.anim.json`: same width, head top and centre; follows the body's lean and squash). Frame = severity x `warnMax` (22 monocle, 20 old bearded, 14 child, 20 wildhair), so the face turns more menacing as patience falls; it holds, and the full scare still plays on the angry leave. `warnSeverity/warnFrame/warnAlpha/warnScale` in `customerMotion.ts`, `CustomerView.updateWarn`. Vest gentleman and flame crown ghost have no sheet so they keep their face. Happy and eating expressions still need new art. Only the sheets that already loaded are used. Tests: 226. Checked in headless Chromium at 100, 40, 20 and 4 percent patience.

## Ghosts only (2026-11-01, Claude) - branch `feature/ghost-customers`
Owner: use only the ghost characters as customers. `CUSTOMER_LOOK_MIN = 8` in `KitchenState.ts`: only looks 8-13 (the six ghosts) spawn; same RNG draw count. Set it to 0 to mix the eight people back in. The people frames are still in `customers.webp` (about 200 KB of the 367 KB); re-run `tools/make_customer_art.py` without them if you want that back.

## Customers stand on the floor, bigger, ghosts keep their colours (2026-10-31, Claude) - branch `feature/ghost-customers`
Owner feedback after seeing a scare frame: everyone should stand on the floor in front of the stools like that one, not on the stool; ghosts looked colourless.
- Feet now at `CUSTOMER_FLOOR_Y` (layout.ts, 326 source px, about y=240 logical), in front of the stools. They walk in and out along the floor.
- With the stool limit gone, the height is `BODY_H` 162 (23 percent of the canvas, +45 percent over the first version: the original ask). Bubble is 76 px wide above the head (top about y=26); patience bar and price sit on the floor strip under the feet and stay above the kitchen stations (they touch the Lv 2 lock cover at the left seat only while that cover shows).
- Ghost colours: the angry and worried warm tint (which turned blue glow brown) is skipped for ghosts, the alpha shimmer is gone (ghosts are opaque), and each ghost has a soft additive cyan copy over it (`glow`) so it reads as glowing. Angry ghosts flare red through that copy. Ghost hover 3 px.
- Arrival pop is now a 6 px hop (no stool to step onto). Scare overlay scale 0.55 so it stays above the stations.

## Ghost customers (2026-10-31, Claude) - branch `feature/ghost-customers`, stacked on `feature/cute-customer-system` (PR #15); PR base is that branch
Owner supplied 6 ghost cutouts and 4 scare sheets and wants the ghosts used as customers. Rendering and animation only.
- Assets per the owner's SETUP: cutouts `public/assets/customers/ghosts/<name>.png` (lowercase, no number prefix: monocle_gentleman, old_bearded_ghost, child_nightgown, wildhair_corset_ghost, vest_gentleman, flame_crown_ghost) and `.../ghosts/scare/<name>_scare.{webp,atlas.json,anim.json}` for the first four. Not committed: scare PNGs, preview GIF, white_bg. The scare `.webp` loaded fine in Chromium, so the PNG fallback was not needed.
- Runtime does NOT load the cutout PNGs: they are packed (with the 8 people, shadow, heart) into the single sprite sheet `public/assets/art/customers.webp` (768x1536, 192x384 cells, 367 KB) by `tools/make_customer_art.py <dir of the 8 people PNGs> [ghost dir]`. The cutout PNGs are the source for that script and can be deleted if you stop rebuilding the sheet. Frames: 0-7 people, 8-13 ghosts (`CUSTOMER_LOOKS` order), 14 shadow, 15 heart. Keep everything in one texture (batching glitch seen with several textures).
- Looks: `CUSTOMER_LOOK_COUNT` 8 -> 14 (cosmetic, same RNG draws), so roughly 43 percent of customers are ghosts. Ghost-only or people-only would be a change to that one line plus a mapping.
- Ghost motion (`src/anim/customerMotion.ts`): hover 8-9 px above the stool, float bob and sway, glide (smooth bob, 2 degree lean, no hop or squash) instead of footsteps, soft rise instead of the stool pop, shimmy when patience is low, slight alpha shimmer. Per-ghost timing (old bearded slow, child and flame crown quick).
- Scare: when a ghost leaves angry. monocle_gentleman, old_bearded_ghost, child_nightgown, wildhair_corset_ghost play their sheet once (45 frames, 12 fps, 0.62 scale, head tops lined up, 150 ms crossfade), camera shake at each sheet's peak frame (38, 37, 26, 32), then removed. vest_gentleman and flame_crown_ghost, and any ghost whose sheet has not loaded yet, get a 0.7 s code-only lunge (red tint, grows 25 percent, shake, fade). Sheets load lazily the first time a ghost with one appears (about 5 MB total). Reduced motion: no scare, no walk.
- Not done: scare sound (the existing angry-leave sound plays), a different restaurant theme or a ghost-specific order system.
- Tests: 224 passing (11 more). Typecheck and build clean. Browser (headless Chromium): all six ghosts seated, sheet scare for monocle, old bearded and child, code lunge for vest and flame crown, no page errors. Not checked on a real device (frame rate, 5 MB lazy load on slow networks).

## Customer size and walking pass (2026-10-31, Claude) - branch `feature/cute-customer-system` (PR #15)
Owner feedback: too small, walking did not read. Customer rendering and animation only; no gameplay or balance change.
- Size: `BODY_H` 112 -> 136 logical px, i.e. 16.0 percent -> 19.5 percent of the 698 px canvas (+21 percent). The brief asked for +45 percent (162 px) and also "18-20 percent"; 162 px puts the head top at y=25, leaving no room for the order bubble, so the 18-20 percent band won. Bubble shrank to 72 px wide (icons 24 px, Rush tag and type chip 44-48x16) and sits right on the head, all inside the screen (top of the Rush tag at about y=7). Bar and price are unchanged under the stool.
- Walk (`src/anim/customerMotion.ts`): walk in from the nearest screen edge in 1.6 s (ease-out), step every 0.19-0.26 s per personality (about 0.22) with 6-9 px hop, +/- 3 degree alternating tilt, scaleY 0.97 to 1.03, shadow shrinks and fades at the top of each hop. Step amplitude fades out over the last quarter of the walk so they do not march on the spot. Then 0.18 s settle bounce and a 0.25 s pop onto the stool. Walk out is the same in reverse (ease-in, 1.6 s). Stationary customers have no step cycle, only breathing. Reduced motion unchanged (no walk).
- Bubble, bar and price fade in when the customer is about 70 percent of the way in.
- Things to know: the model's patience timer (and the 0.7 s arrive grace) start at spawn, so a customer is walking in for about 2.0 s while patience ticks. Not changed (gameplay). A customer who leaves keeps walking out for 1.6 s after the model frees the seat, so a new customer can spawn into that seat while the old one is still leaving.
- Tests: 218 passing (12 new for steps, arrival, departure). Typecheck and build clean. Checked in headless Chromium: two customers mid-walk plus two seated, all eight characters seated, no console errors. Not checked on a real device.

## Cute customer system (2026-10-31, Claude) - branch `feature/cute-customer-system` (from `main`), merged (PR #17)
Replaced the 3 generic customers with the owner's 8 static PNG characters (kid, grandma, businessman, foodie, teen, chef_fan, athlete, sleepy) and gave them code-only motion.
- Art: `public/assets/art/customers.webp` (one 800x768 sprite sheet, 160x384 cells, 156 KB, loaded at boot; key `customers` in `data/assets.json`). Frames 0-7 are the characters in `CUSTOMER_LOOKS` order, 8 is the contact shadow, 9 is the heart. Built by `tools/make_customer_art.py <dir of the 8 source PNGs>` (crops to the figure, drops faint alpha haze, same 384 px height for all, feet on the bottom edge). The source PNGs (11 MB) are not in the repo. `customer_01..03.webp` removed.
- Why one sheet: with separate textures plus a shadow, headless Chromium drew pieces of the background over one customer (batching glitch). One texture fixed it and is cheaper on mobile. Keep customer art in the one sheet. Shadow and hearts are images from the sheet, not Phaser Shapes.
- Motion: `src/anim/customerMotion.ts` (pure, tested): personalities table, idle breath (about 1 percent), walk-in/out steps, foot-tap when patience under 50 percent (faster under 25), happy bounce, chew, hearts and sparkles, businessman wristwatch check. `CustomerView` reads the model each frame and drives transforms around the feet; the exit and hearts use tweens that `destroy()` stops. Reduced motion shows a static pose.
- Model change (cosmetic only): `Customer.look` is now `randInt(0, CUSTOMER_LOOK_COUNT - 1)` (was 0..2). Same number of RNG calls, so spawning and balance are unchanged. `GameScene` only passes `fx` to `CustomerView`.
- Hit area: tap and drop rect is at least 96 logical px wide and uses the seat position, not the bouncing sprite.
- Blinking overlay not done (the faces are 3D renders; a flat overlay would look pasted on). No facial or limb animation exists.
- Tests: 212 passing (13 new in `tests/customermotion.test.ts`), typecheck clean, build ok. Checked in headless Chromium at 1280x698 and phone landscape: all 8 characters, walk-in, tap, hearts, walk-out, reduced motion, no console errors. NOT checked on a real phone or GPU (frame rate unmeasured).

## Supplied cold drink animation (2026-10-31, Claude) - branch `colddrink-art` (from `icecream-art`; stacked on PR #11 and #12)
Wired in the owner's `cold-drink-lanes.zip` the same way as the ice cream machine:
- Assets (`public/assets/art`, listed in `data/assets.json`): `cold_drink_base.webp` (300x393, lazy), `cold_drink_anim.webp` (61 layers of 122x215 packed 10x7, 515 KB, lazy), `cold_drink_icon.webp` (the 61 header-glow frames 63x92 packed 10x7, 252 KB, lazy), `drink_cooked.webp` (the full cola glass cut from the last layer, 156x156 padded, loaded at boot; replaces the code-drawn cup on plates, order bubbles and the RecipeBook).
- The base is drawn over the painted dispenser (`COLD` in `src/views/layout.ts`; it matches the painted dispenser's outline closely, scale 1.30 of the art). The three lanes are always drawn in the supplied order (left, right, mid; frame 0 = empty glass when idle); the header glow is drawn once, at the frame of the most recently started cup.
- Model: `drinkSpouts` 3 (one cup per lane, middle lane first), fill time 5 s (`readyAfter`, was one spout and 3.5 s); a full cup still never spoils. The frame shown is a function of the model's timers only.
- View: `PourViews` (`loadColdDrinkArt` loads in the background; the old code-drawn glass is the fallback). One progress ring (top right of the dispenser) shows a tick when any cup is full, otherwise the progress of the cup furthest along. A collected cup flies from its own lane. Lock cover "Lv 6" moved to cover the new glasses.
- Tests: 199 passing (3-lane drink tests, lane placement inside the dispenser zone, all seven art files exist and are listed). `tests/sim_late.test.ts` is unchanged and green.
- Seen in Chromium (1280x720, real clicks, Lv 8, and the Lv 3 lock cover): the three lanes pour in turn with the header glow and fizz, the ring goes to a tick, a collected cup lands on a plate; no console errors.
- Not verified: phone layout and tap size, reduced motion, slow connections (about 770 KB loads after the scene starts, the first cup may use the old picture), the unexplained `glass_scale_x` 0.86 in the zip's json (its note does not say what it is for; unused), and the cola glass on plates looks slightly large (plate width 100).

## Supplied ice cream animation (2026-10-31, Claude) - branch `icecream-art` (from `pizza-plate-fix`; PR base `pizza-plate-fix` until #11 merges)
Wired in the owner's `ice-cream-lanes.zip`. What it does:
- Assets (`public/assets/art`, listed in `data/assets.json`): `ice_cream_base.webp` (300x393 machine, lazy), `ice_cream_anim.webp` (the 75 layers packed 10x8 into one sheet of 106x255 frames, 861 KB, lazy), `icecream_cooked.webp` (the finished cone cut from the last layer, 156x156 with transparent padding, loaded at boot; it replaces the code-drawn cone on plates, order bubbles and the RecipeBook).
- The base picture is drawn over the painted machine's upper part (`ICE` in `src/views/layout.ts`; the base is a different drawing from the painted machine, so the match is by eye: scale 1.32 of the art, a small sliver of the painted machine shows at the left edge). The animation layers sit on top, one per lane (lane offsets from `ice_cream_anim.json`).
- Model: `iceCreamMachines` 3 (one cone per lane, middle lane first, then left, right), swirl time 5 s (`readyAfter`), melt 14 s as before. The frame shown is a function of the model's cone timer only (frame = progress x 74, then the last frame is held); the model alone decides when a cone is ready or melted.
- View: `src/views/PourViews.ts` (`loadIceCreamArt` loads in the background; until it arrives, or if it fails, the old code-drawn scoop and single ring are used). A small ring per lane sits on the cabinet under the machine; a melting cone fades and sinks (skipped with reduced motion); the last frames pulse when about to melt (not with reduced motion); a collected cone flies out from its own lane.
- Tests: 198 passing (3-lane model tests; lane positions inside the machine zone; the three art files exist and are listed). `tests/sim_late.test.ts` unchanged and green: fast bot 0.21 / 0.42 / 0.53 / 0.57 closes a minute at Lv 6-10 / 11-15 / 16-20 / 21-25, average 0.51 / 0.71 / 0.78.
- Seen in Chromium (1280x720, real clicks, Lv 12): three taps start the three lanes, the pour and swirl play, rings go to ticks, a tap collects one cone onto a plate, the next tap collects the next; no console errors.
- Not verified: phone layout and touch size of the lane rings; reduced motion; slow connections (the 861 KB sheet loads after the scene starts, so the first cone may use the old scoop picture); the left-edge sliver of the painted machine is minor but visible if you look for it.

## Pizza plates fix (2026-10-30, Claude) - branch `pizza-plate-fix`, PR #11 (base `main`)
Owner report: a cooked pizza went to the burger plates, and with four burgers waiting the pizza stayed in the oven and burned. Fix: the two painted dough bases are now two pizza-only plates (`recipes.json` `pizzaSlots` 2, slot row `'pizza'`, slot indices 6 and 7, `SLOTS[6..7]` on the dough discs). `tapOven` puts a ready pizza on a free pizza plate only; when both are taken it says "Serve a pizza first: the pizza plates are full" and the pizza waits in the oven. Burger and side plates never hold pizza; drinks and cones still use side slots, then burger plates.
- Tests: 196 passing. CHANGED existing tests on purpose (behavior change the owner asked for): `tests/game.test.ts` pizza collect test now expects a pizza plate, plus a new test for full burger plates; `tests/sim.test.ts` slot count 6 to 8 and its bot collects pizza when a pizza plate is free; `tests/helpers/bot.ts` the same; `tests/kitchenart.test.ts` checks the two new slot positions.
- Seen in Chromium (Lv 6, all four burger plates full): the pizza baked, was collected and landed on the top dough disc. Cooked pizza is drawn larger (112) so it fills the disc.
- Owner follow-up: the plates looked empty, so the raw pizza (`pizza_raw` art) is now drawn on each pizza plate whenever it has no cooked pizza (`StockViews.updateDough`, only from Lv 5). A cooked pizza replaces the raw one on its plate. Seen in Chromium. The raw art already has toppings (it is the supplied raw pizza picture), so raw and cooked differ by the golden crust and glow.
- Not verified: phone layout; the raw dough does not disappear while a pizza is in the oven (dough is unlimited).
- Note: PR #10 (HANDOFF status after PR #9) is a separate open PR; both touch the top of this file, so expect a trivial merge conflict in HANDOFF.md.

## Milestone 6: drinks (Lv 6) and ice cream (Lv 12) stations (2026-10-30, Claude) - branch `milestone-6-drinks-icecream`, not merged, no PR
Branched from `milestone-5-content`. NOT merged: the owner asked me to merge `milestone-5-content` into `main` (it contains `kitchen-art-integration`; 6 commits ahead, 0 behind) but the session's permission checker refused every attempt, so the owner must merge it (or open the PR). If that merges first, rebase this branch onto `main` (or open this PR against `main` after it).
What it does (all numbers in `data/recipes.json`, owner to tune):
- Drink (`drink`, Lv 6, price 10, xp 12): one spout (`drinkSpouts` 1) fills a cup in 3.5 s. Tap the dispenser to start a cup and tap again to put the full cup on a free side slot (a free plate if both side slots are taken). A full cup never spoils.
- Ice cream (`icecream`, Lv 12, price 22, xp 28): one machine swirls a cone in 3.5 s; tap to collect. A ready cone melts after 14 s: it is cleared with a "Melted" puff, no coin or reputation cost.
- Orders: `progression.json` adds `drink` from Lv 6 and `icecream` from Lv 12 (and the unlock text "Drinks" / "Ice cream"). No change to customer counts, gaps, patience or order size.
- Model: `KitchenState.spouts`, `.cones`, `tapDrinks()`, `tapIceCream()`; events `drinkStart/drinkPhase/coneStart/conePhase/melted`; `collect` has `from: 'dispenser' | 'icecream'`; `reopen()` clears both.
- Views: `src/views/PourViews.ts` (glass fills in the first painted cup, a scoop grows on the first painted cone, a Ring above each machine), lock covers "Lv 6" / "Lv 12" in `StockViews`, tap handlers in `GameScene`. Positions (`CUP`, `CONE`, `DRINK_RING`, `CONE_RING`) are in `src/views/layout.ts` and tested to sit inside their zones.
- Art: the cup and cone on plates, in order bubbles and in the RecipeBook are CODE-DRAWN textures `drink_cooked` and `icecream_cooked` (`src/art/builders.ts`). The supplied `drink_cup` / `drink_soda` art (lazy-loaded, never loaded anywhere) is NOT used; there is no ice cream art in the repo. Replace by adding files with those two keys.
- RecipeBook: two new entries with steps (data/recipebook.json) and icons.
Steps (all done, one commit each, pushed):
- [x] 1. Config + model + `tests/drinks.test.ts` (8 tests)
- [x] 2. Progression data
- [x] 3. Views and scene wiring (+ layout test)
- [x] 4. Bot learns drinks and ice cream; late-level simulation rerun
- [x] 5. Browser check and docs
### Balance (bot, seeded, same method as Milestone 5; closes per minute)
| bot | Lv 20 at | Lv 6-10 | Lv 11-15 | Lv 16-20 | Lv 21-25 |
|---|---|---|---|---|---|
| fast | 2010-2190 s | 0.21 | 0.40 | 0.56 | 0.55 |
| average | 3880-4400 s | 0.51 | 0.70 | 0.76 | n/a |
| casual | Lv 15 at 3900-4500 s | 0.64 | 0.78 | n/a | n/a |
Before this milestone the fast bot was 0.37 / 0.56 / 0.70 / 0.82, average 0.63 / 0.86 / 0.89 / 0.93: the game got somewhat EASIER, because drinks are a cheap item with no failure mode and they replace one in five orders of burgers or pizza. Station timings (spouts 1-2, fill 3.5-4.5 s, cone 3.5-6 s, melt 10-14 s) were probed and barely moved this, so I kept the simple values. If a harder late game is wanted, tune `data/progression.json` (gaps, patience, type weights), not the stations.
### Verified
- `npm test`: 195 passing (186 + 8 drinks + 1 layout). `npm run typecheck` clean. `npm run build` ok.
- Chromium 1280x720 with real clicks at Lv 12: tapping the dispenser and the machine starts a cup and a cone; the glass fills and the scoop grows with a ring above each; after the wait a second tap puts a drink on one plate and a cone on the other; no page errors. Lv 8 screenshot shows the ice cream "Lv 12" cover over the painted cones.
### Changed in tests (flagging it)
- `tests/sim_late.test.ts` "the climb is gradual": the Lv 6-10 anchor of the fast bot is now about 0.2 closes a minute, so its ratio to later brackets is meaningless (a handful of closes). The ratio bounds now use the average bot; the fast bot keeps the monotonic check, the absolute bounds (under 0.8 at Lv 11-15, under 1.0 at Lv 16-20) and the 2x step check. Other bounds unchanged.
### Not verified
- Human feel: how drinks and cones play on a phone, whether one spout is annoying, whether 14 s before melting is right.
- Reduced-motion and the 844x390 touch layout for the new rings and glass (the code uses the same Ring and the same reduced-motion checks as other stations, but I did not look).
- The Lv 6 cover (only the Lv 12 one was seen), the Lv 6 and Lv 12 level-up cards, and the tutorial hand (no hints for drinks or ice cream).
- Sound: drinks and cones reuse the existing pop and ding sounds only.
### Next
Owner: merge `milestone-5-content` into `main`, then open the Milestone 6 PR. Then: real ice cream art, decide on upgrades for the new stations (the Shop has none), and a human playtest of Lv 6-20.

## Milestone 5 content (2026-10-30, Claude) - branch `milestone-5-content`, not merged, no PR yet
Branched from `kitchen-art-integration` (unmerged), so the PR base must be `kitchen-art-integration` (or rebase onto `main` once that is merged). The 4-burner change is in all balance numbers below.
Done:
- [x] `data/progression.json` Lv 11-20 (was Lv 1-10): up to 4 customers (4 seats; Lv 13), impatient customers from Lv 11, VIPs from Lv 14 (5 percent, up to 10), critics from Lv 16 (5 percent, up to 8), arrival gaps `[3,6]` at Lv 11-12 easing to `[3.2,5.8]` at Lv 20 (a looser gap only in the level that adds the fourth customer), patience 34 -> 31, order size stays `[1,3]` (plate slots are 4). Unlock text announces the new customer types and the fourth seat. First-pass numbers (more VIPs and critics, tighter gaps) were measured and rejected: closes per minute climbed much too fast.
- [x] After Lv 20: `afterLast` gets `arrivalGapStepPerLevel` -0.05 and `arrivalGapFloor` `[2.5,4.5]` (patience was already on its floor of 30); `levelDef` applies it (optional fields, older data still works). Types and order size stay as at Lv 20.
- [x] Tests: `tests/progression.test.ts` (data rules, the type mix, scaling after Lv 20, model draws types from the weights), `tests/sim_late.test.ts` (balance simulation, bounds below), `tests/helpers/bot.ts` (copy of the M3 bot plus an upgrade-buying policy and a closes-per-minute helper).
- [x] CHANGED an existing M3 test (flagging it): `tests/sim.test.ts` "30 minutes of play ... no growing state" asserted `events.length` is exactly 0. `events` is the queue the views drain each frame, and the bot's last action can leave one event in it; the new data moved where the seed-7 run stops, so it failed with 1. Now `toBeLessThan(10)` with a comment. Nothing else in M3 tests changed.
### Balance numbers (bot, seeded, upgrades bought cheapest first; closes per minute, not per level, because levels get longer)
| bot | Lv 15 at | Lv 20 at | Lv 6-10 | Lv 11-15 | Lv 16-20 | Lv 21-25 |
|---|---|---|---|---|---|---|
| fast (0.8 s per action) | 1140-1290 s | 2170-2420 s | 0.37-0.39 | 0.52-0.56 | 0.70 | 0.82-0.85 |
| average (1.3 s) | 2180-2800 s | 4460-5090 s | 0.63 | 0.81-0.86 | 0.89 | 0.93 |
| casual (2.0 s) | 3900-4560 s | not reached in 8000 s | 0.66 | 0.79-0.81 | n/a | n/a |
Reading: a fast bot reaches Lv 20 in about 36-40 minutes; the close rate rises about 1.4x by Lv 11-15 and 1.9x by Lv 16-20 over Lv 6-10 and then flattens (about 0.8 a minute for the fast bot at Lv 26-30). Upgrades barely change the close rate: the bot is limited by how fast it acts, not by cook speed. By the end of every run the bot owned all 15 upgrade tiers, so shop prices look cheap against income (not retuned; no human data).
### Verified
- `npm test`: 186 passing (161 before + 25 new). `npm run typecheck`: clean. `npm run build`: ok.
- Browser (Chromium 1280x720): Lv 16 with all four customer types seated; no errors.
### Not verified / limitations
- Everything above is a bot; human pacing at Lv 11-20 is unknown. The bot buys upgrades greedily and never drags items wrongly, so it is optimistic on some counts and clumsy on others.
- Seats 2 and 3 (the two on the right) are one stool apart; with four customers their order-card tags touch slightly (still legible). Not changed.
- Drinks (Lv 6) and ice cream (Lv 12) stations have zones in the art but no model support; not part of this milestone.
- Level-up card text for Lv 11-20 was only read in data, not seen on screen; story cards exist only for Lv 1, 3, 5, 10, 15, 20.
### Next
Open the PR (base decision above), then a human playtest of Lv 11-20, and decide the drinks and ice cream stations.

## Kitchen art + oven door integration (2026-10-30, Claude) - branch `kitchen-art-integration`, not merged, no PR yet
Done (all in the branch, tests/typecheck/build green; see "Verified" below):
- [x] New kitchen art: `public/assets/art/kitchen_full.webp` is now the supplied 2752x1536 image (old 1699x926 file replaced; same asset key). `data/restaurants.json` backgroundSize 2752x1536 and all 17 tap zones remapped to the new art (measured on a gridded copy). Layout source space is now 1699 x 948 (`SRC_H` 926 -> 948, same width so sprite sizes stay valid); every point in `src/views/layout.ts` re-measured (seats, vats, burners, slots, oven). New constants: `OVENS_LIT` (cooked pizza on the lit tray), `FRY_FROM` (centre of the food painted in each basket).
- [x] Ingredients: ALL ingredients (raw fries, nuggets, buns, patties, lettuce, tomato, plates) are baked into the background. None needs to move or disappear in this game (supply is unlimited; the model only spawns flying copies and plate items), so nothing was cut out or patched. The old stock sprites (`StockViews` sprites) were removed so nothing is drawn twice. `StockViews` now draws only a dim "Lv N" cover on stations that are still locked (the old art showed locked stock as empty bins); the cover fades when the level unlocks. Tap squash on stock was dropped (the tap outline remains).
- [x] Fries/nuggets: unchanged model and timers (`startFry`). The hop animation now starts from `FRY_FROM` (the painted pile) into the vat; vat food, oil layer and ring unchanged.
- [x] Oven door: `oven_door.webp` (1806x1210, 7x5 grid of 258x242 frames, alpha-feathered 7px edges, 107 KB) cut from the supplied MP4 (frames 21-46 of the closing, 92-131 of the opening, every 2nd frame, ~12 fps). The clip is an opaque crop (no green screen) and its first frame matches the art at 0.98 correlation at 2.195x, top-left (974,956) in the 2752x1536 art, so the sprite is only visible while the door moves, is closed, or is lit-open; at rest the static art shows. `src/views/OvenDoor.ts` is a view driven only by the model oven phase (null -> art; cooking -> close after the raw pizza lands, hold closed; ready/warning/danger/burnt -> open and hold lit; collected/discarded -> fade to art). The sheet is lazy: `loadOvenSheet` starts the load after the scene is up; if it is missing or fails, the oven works as before without a door (`doorState()` returns 'none'). Reduced motion skips straight to the end frames. Generated assets: only `oven_door.webp`; the extracted PNG frames and MP4 are not in the repo.
- [x] Raw pizza lands on the pulled-out door (`OVENS`), slides up and fades as the door closes; the cooked/burnt pizza fades in on the tray (`OVENS_LIT`) during the door opening. Pizza size 160 (raw) and 130 x 0.8 height (cooked, perspective).
- [x] Other: `validate.ts` accepts `type: "spritesheet"` (needs frameWidth/frameHeight); BootScene can load non-lazy spritesheets; decor clock moved to the gap between window and poster and the runner moved up 16px (decor must not overlap zones); new debug accessor `window.__chefRush.ovenDoor(i)`; `tests/kitchenart.test.ts` (6 tests); decor, zone and validator tests updated for the 948 height and new background size.

### Follow-up fixes (2026-10-30, after phone testing)
- Lv 2 covers stayed on screen: `StockViews` restarted the fade tween every frame after a level-up. Now a pure `coverChange(prev, locked)` (`src/game/lockcover.ts`, tested) only acts on a change. Checked in Chromium: Lv 1 -> 2 clears the Lv 2 covers, the Lv 4 nuggets cover stays.
- Only 2 of 4 grill burners worked: `data/recipes.json` `grillBurners` was 2 (pre-existing balance setting; the art always had 4). Now 4, `BURNERS` has all four spots, bottom-row timer ring and FLIP label sit below the patty (`BURNER_LABEL_BELOW`) so they do not cover the top row. Checked in Chromium: 4 patties cook at once. BALANCE NOTE: four parallel patties makes burgers easier; the sim test still passes but the numbers were not retuned. Set `grillBurners` back to 2 (and keep the extra points) if the owner prefers.
- Fries/nuggets not centred in the vat: vat points re-measured (`VATS` x 345 / 469), food sizes capped to fit the glass (`VAT_FOOD_W`), and the oil layer now fills the whole glass lid (`VAT_GLASS`) instead of a band sized to the food. Checked by zoomed screenshots (cooking and ready).
- Tests: 161 passing (+5 on burners, cover logic, glass fit). Typecheck and build ok. Not checked: a real phone, and the fryer food during the burnt state.

### Verified (real Chromium 1280x720 and 844x390 touch via `vite preview`, plus tests)
- `npm test`: 156 passing (150 before + 6 new). `npm run typecheck`: clean. `npm run build`: ok.
- Seen in screenshots: new art at correct aspect; zone outlines (`?zones`) line up with all stations; lock covers at Lv 1; seated customers, chef on the right counter; fries on the side plate and bun on a serving plate line up with the plates; fries and nuggets cooking in the vats while the piles stay in the baskets; pizza flow at normal speed: door open at rest -> pizza on door -> closing (pizza fading) -> closed with ring -> opening -> lit with pizza -> collect -> door back to art (door state sequence also logged via `ovenDoor`). Phone landscape screenshot with door closed. No console errors apart from headless WebGL driver notices.
### Not verified
- The fry/nugget hop in flight was not caught in a screenshot (headless frame rate); the code path only changed its start point.
- Burnt-pizza, trash-discard-while-door-opens and tapping the oven mid-opening were exercised only through the state-machine log, not looked at.
- Real-phone performance; mid-animation resize; reduced-motion path of the door (code only).
- Video quality: the clip is 258x242, shown at about 1:1 on a 1280 canvas but softer than the art on high-DPI screens; the lit/closed frames were not colour-matched (video is ~6 units darker in blue than the art, hidden by the feathered edge).
### Limitations / next steps
- Locked stations show a dim cover; art for locked-state stations was not regenerated. Customers' stool height and the chef position were kept from the old layout and only eyeballed.
- Next: open a PR for this branch (base `main`), review the door look on a real phone, then continue with Milestone 5 below.

## Goal
Chef Rush: a browser restaurant game (serve customers, fryer/grill/oven, coins, XP, levels) for CrazyGames. Built in milestones, one PR each. **Milestones 3 and 4 are merged into `main`; the next task is Milestone 5: gameplay balance and polish.**

## Project notes for a newcomer

### Run and test commands
Run from the repo root. Node and npm only; no other tooling.
- `npm ci` (or `npm install`): install dependencies.
- `npm run dev`: Vite dev server. URL flags: `?debug&level=N&speed=N` (jump to level N, run the model at N x speed, max 20; flags only apply with `debug`), `?zones` or key Z (outline every tap zone).
- `npm test`: Vitest; the current recorded baseline is 150 passing tests (Milestone 4). Run it locally before making changes.
- `npm run typecheck`: `tsc --noEmit`.
- `npm run build`: typecheck, then `vite build` into `dist/` (about 1.4 MB JS, mostly Phaser).
- `python handoff.py resume | save <A> | snap`: the two-account handoff helper (see Gotchas).
- Browser tests: `window.__chefRush` (set in `GameScene.create`) exposes `state`, `zones()`, `items()`, `customers()`, `startEvent(id)`, `spawn(type)`, `slotPos(i)`, `vatPos(i)`, `burnerPos(i)`, `banner()`, `toast()`, `overlayVisible()`, `levelCardVisible()`. Use it from a headless browser instead of guessing coordinates.

### Folder layout
- `data/`: all content and balance JSON (below).
- `src/game/`: the game model, no Phaser. `KitchenState.ts` (673 lines, the whole simulation), `config.ts` (types plus `defaultConfig`, `levelDef`, `xpForLevel`), `cook.ts` (phase rules), `tutorial.ts` (hint chooser, read-only), `rng.ts` (seeded).
- `src/scenes/`: `BootScene` (validates assets and restaurants JSON, loads art, builds code-drawn textures, starts `Game`), `GameScene` (780 lines: the kitchen, input, wiring model events to views).
- `src/views/`: read-only views of the model: `StationViews`, `StockViews`, `ItemView`, `CustomerView`, `Hud`, `Popups` (Toast, LevelUpCard, Overlay, EventBanner), `TutorialHand`, `Ring`, `layout.ts` (pixel coordinates of seats, vats, burners, oven, slots on the 1699 x 926 art).
- `src/kitchen/`: `zones.ts` (pure coordinate math, hit testing, nearest-zone snap), `stationHandlers.ts` (`registerStationHandler(type, fn)`).
- `src/anim/`: `guard.ts` (one running animation per key), `helpers.ts` (pop, bounce, shake, glow, fade, moveTo), `ParticlePool.ts`.
- `src/art/builders.ts`: draws every non-supplied texture in code, cached by key; holds the palette constants.
- `src/systems/`: `SaveSystem` (SDK data first, localStorage fallback, tolerant parse), `AudioSystem` (all sound synthesized with WebAudio).
- `src/sdk/crazygames.ts`: no-op-safe SDK wrapper. `src/data/validate.ts`: JSON validators.
- `tests/`: `game.test.ts` (model), `systems.test.ts` (M3 systems), `sim.test.ts` (bot reaches a level), `zones.test.ts` (coordinates, validators, save parsing).
- `docs/`: `style-guide.md`, `architecture.md`, `progress.md` (per-milestone log with "not verified" lists). `public/assets/art/`: supplied art.

### Key modules and how they fit
- `KitchenState` owns everything that matters: vats, burners, ovens, plate and side slots, customers, XP, coins, reputation, combo, streak, events, waves. Time moves only through `update(dt)`; the player acts through methods (`tapFryer`, `tapGrill`, `tapBuns`, `tapTopping`, `tapOven`, `tapTrash`, `serve`, `startFry`, `startPizza`, `startPatty`, `spawnCustomer`, `startEvent`, `reopen`). It pushes `GameEvent`s into `events`; views call `drainEvents()` each frame and play effects. Views and animations never decide game outcomes.
- Because the model has no Phaser code, tests and bot simulations run it with `new KitchenState(save, cfg, seed)` and `update(dt)`.
- `KitchenState.mods` (`fryerSpeed`, `grillSpeed`, `ovenSpeed`, `patience`, `tips`, all default 1) is the Shop seam: the model already multiplies by them (cook speed in `update`, patience in `spawnCustomer`, tips in `serve`). Milestone 4 only has to set them.
- `GameScene.create` builds the model from `SaveSystem.data` (level, xp, coins), builds views, registers station handlers, and saves at level-up and every 15 s (`SaveSystem.save`). The save shape is `SaveData` v1 in `SaveSystem.ts`: level, xp, coins, settings. Anything M4 persists (owned upgrades, decor, career) must extend this in `parseSave` with safe defaults so old saves still load.
- Only two scenes exist (`Boot`, `Game`); `main.ts` lists them. RecipeBook, RestaurantSelect, Shop, Menu and Settings are not built yet.

### Where data and balance numbers live (all in `data/`, none hard-coded in `src/`)
- `recipes.json`: slots, vats, burners, ovens, burn penalties; per item price, XP, ready time, burn window, unlock level (fries 1, burger 2, nuggets 4, pizza 5).
- `progression.json`: per level `maxCustomers`, `arrivalGap`, `orderSize`, `patience`, `items`, customer-type weights, `unlocks` text (Lv 1 to 10 defined; `afterLast` tightens patience by 0.5 per level to a floor of 30).
- `xp.json`: XP curve (100 + 80 x level), speed bonus, level-up coins, tip fraction, reputation (start 100, angry leave 15, serve gain 3, reopen 55).
- `combo.json` (combo, Rush tag, wrong-item penalty, streak), `events.json` (four events, first after 75 s, 60 to 180 s apart), `waves.json` (110 s cycle), `customers.json` (four types).
- `restaurants.json`: background, normalized tap zones and unlock levels per station (`burger_diner` only). `assets.json`: art manifest; `lazy: true` entries are not loaded at boot.
- Each data file is typed in `src/game/config.ts` (`GameConfig`) and read via `defaultConfig`. Add new data files there. Only `assets.json` and `restaurants.json` are validated at boot (`src/data/validate.ts`); the balance JSONs are covered by types and tests only, so add a test when you add a field.

### Conventions
- Wording rule from the owner: three banned words (a work-period word, a level-group word and a rating-symbol word; the list is in `tests/wording.test.ts`, built from pieces so the words themselves never appear in the repo) must not appear in code, UI, data or docs. The only progression number is shown as "Lv N". `tests/wording.test.ts` scans `src`, `data`, `docs`, `tests`, `README.md` and `index.html`; do not write the words anywhere, including in this file.
- Gameplay state lives in the model; animation state is separate. Animations go through `AnimGuard` (restart, never stack), use pooled particles, and must honor `SaveSystem.reduceMotion()` (setting first, then the OS preference).
- The kitchen background is static; interaction is overlays above it. Zones are normalized 0..1 against the art so they work at any size.
- Style: ink-outlined flat cartoon, palette constants in `src/art/builders.ts` (status colors leaf, mustard, tomato are reserved for state, and state must not rely on color alone). Logical canvas is 1280 x 698, `Scale.FIT`.
- Failure modes stay friendly: a wrong-item serve costs a little patience, no coins or reputation.
- Touch targets should be 88 css px or more; known short of that in phone landscape (see `docs/progress.md`).
- Keep `npm test` and `npm run typecheck` green; add unit tests with every model change. Document each milestone in `docs/progress.md` with a "Not verified" list. State plainly what was and was not checked in a real browser.
- Commits: small steps, one commit per step. Do not modify Milestone 3 behavior; new work must leave the existing 77 tests passing unchanged.

### Gotchas
- `.claude/settings.json` has a PostToolUse hook that runs `python handoff.py snap` after every Edit, Write or MultiEdit. In a session with that hook, every file edit makes a local commit named `wip snapshot <time>` and appends to `.handoff_log`. If `git status` shows nothing but your last commit is a `wip snapshot`, that is why. Check `git log -n 10` and the tail of `.handoff_log` at session start.
- The snapshot only commits locally; it never pushes. Push after each step yourself.
- The original full build brief (`chef-rush-full-game-prompt-corrected.md`) is not in the repo. The only list of Milestone 4 scope in the repo is the "Next steps" below, so check anything uncertain with the owner.
- Milestone 3 PR #5 and Milestone 4 PR #6 have both been merged into `main`. Do not follow any older instructions below that say these PRs are still open or that `main` lacks Milestone 3.
- Shallow clones: `git fetch --depth=N origin +refs/heads/<b>:refs/remotes/origin/<b>` is needed to see other branches; a plain fetch only tracks `main`.
- Branch names are not what you might guess: Milestone 1 lives on `milestone-1-style-guide-draft` (PR #3, the owner chose their own style guide), not `milestone-1-foundation`.
- GitHub shows the repo as `Chef-Rush` and the clone URL as `chef-rush`; both work.
- Phaser installed is v4 even though docs say "Phaser 3+". Typescript 7 and Vite 8 are in use.
- Browser checks that worked in this environment (2026-10-29): Chromium is at `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (launch with `--no-sandbox`); Python Playwright is installed (`from playwright.sync_api import sync_playwright`, pass `executable_path`). Run `npm run build`, then `npx vite preview --port 4173 --strictPort` in the background, open `http://localhost:4173/?debug&level=3` and use `window.__chefRush`. Headless rendering is slow (a few fps), so Phaser timers take several times longer in wall-clock time; wait on state with `page.wait_for_function`, not fixed sleeps. Keep scratch scripts and screenshots outside the repo.
- Unit tests do not cover Phaser rendering. Visual claims need a real browser run; say when you did not do one.
- The fonts fall back to a system stack (Fredoka is not bundled). Customers are single-pose art, so mood shows as tint and hop.

## Done so far
- Milestone 3 complete, open as PR #5 (targets main, not yet merged): https://github.com/dhavalwork97-jpg/Chef-Rush/pull/5
- Combo system: fast consecutive serves build a combo up to 8; +10% coins/XP per step, capped at x1.5; breaks on a slow serve or an angry customer leaving.
- Rush tag: red tag while the customer is fresh; serving then doubles the tip and gives bonus XP.
- Wrong item: item snaps back, customer shakes and loses patience; no coin or reputation cost.
- Customer types in data (impatient, VIP, critic); regular customers only for Lv 1-10; VIPs unlock at Lv 14, 17, 19 (VIP visit event shows them early).
- Events (one at a time, calm moments only): lunch rush, double coins, slow oven, VIP visit.
- Waves: calm -> build -> rush -> calm; bonus for ten serves in a row with no burn or angry customer.
- Progression Lv 6-10: three customers at once from Lv 7; tutorial hand only Lv 1-2.
- Shop hooks: game reads fryer/grill/oven speed, patience and tip modifiers (ready for the M4 shop to set them).
- XP formula changed to 100 + 80 x level; nuggets at Lv 4, pizza at Lv 5.
- Verified: 77 unit tests pass (21 new); bot reaches Lv 10 in 8-9 min; browser check of banner, combo meter, Rush tag, chips, floating text; 5 game minutes at 10x speed with no errors.
- Milestone 4 session start (2026-10-29): cloned repo, checked out `milestone-4` at `cc5713c`, ran `npm ci`, `npm test` (77 pass), `npm run typecheck` (clean) and `npm run build` (ok) to confirm the baseline. Wrote the newcomer notes above.

## Milestone 4 plan
Scope (from the Milestone 3 hand-off): shop and upgrades, decor, RecipeBook, RestaurantSelect, career titles, story cards, chef's speech bubbles. The original brief is not in the repo, so every number below is a first pass in JSON for the owner to tune. Rules: model code stays Phaser-free and unit-tested; all numbers in `data/`; Milestone 3 behavior and its 77 tests stay unchanged; wording rule ("Lv N" only, never shift/stage/stars); honor reduced motion; one commit and push per step; update this file after each step.

Steps (mark each `[x]` when committed and pushed; the exact stopping point goes under "In progress"):
- [x] 1. Save v2 (done, 9 tests in `tests/save.test.ts`): extend `SaveData` in `src/systems/SaveSystem.ts` with `owned` (upgrade id -> tier), `decor` (owned and placed ids), `seenStory` (ids), `lastRestaurant`. `parseSave` stays tolerant and old v1 saves load with defaults. Tests in `tests/zones.test.ts` style (new file `tests/save.test.ts`).
- [x] 2. Shop model (done, 12 tests in `tests/shop.test.ts`): `data/upgrades.json` (fryer, grill and oven speed, patience, tips; 3 tiers each, cost and value per tier, `unlockLevel`) and `src/game/shop.ts` (pure: `canBuy`, `buy`, `modsFor(owned)`). `GameScene` applies `modsFor` to `KitchenState.mods` at start and after a purchase. Add typings to `GameConfig` in `config.ts`. Tests: cost, level gate, insufficient coins, mods match tiers, no change at tier 0.
- [x] 3. Career titles (done, 8 tests in `tests/career.test.ts`; Shop header still to show it in Step 6): `data/career.json` (title per level band, no banned words) and `src/game/career.ts` (`titleForLevel`). Show the title on the level-up card and in the Shop header. Tests for band edges.
- [x] 4. Chef speech bubbles (done: pure part with 13 tests in `tests/chef.test.ts`, view `src/views/ChefBubble.ts`, wired in `GameScene`): `data/chef.json` (lines per trigger: first serve, combo, burn, event start, level-up, idle tip) and `src/game/chef.ts` (pure picker with cooldown and no repeat). `src/views/ChefBubble.ts` shows the lazy `chef` art with a bubble, fed by `GameEvent`s; skipped or instant when reduced motion. Tests for cooldown and no-repeat.
- [x] 5. Story cards (done: 10 tests in `tests/story.test.ts`, `StoryCard` view, wired in `GameScene`): `data/story.json` (card per level milestone) and a `StoryCard` popup in `src/views/Popups.ts`; model paused while it shows; `seenStory` saved so each card shows once. Tests for the "which card is due" function.
- [x] 6. Shop scene (done for upgrades; the Decor tab is added in Step 7; HUD button is Step 10, key B opens it for now): new `src/scenes/ShopScene.ts` (upgrades tab, decor tab, coin balance, buy buttons at least 88 css px) opened from a HUD button; the game pauses while open and resumes on close; saves after each purchase. Register the scene in `main.ts`.
- [x] 7. Decor (done: 8 tests in `tests/decor.test.ts`; 3 items): `data/decor.json` and code-drawn decor sprites in `src/art/builders.ts` (cosmetic only, placed in empty wall and counter-top areas that do not overlap tap zones; add a test that decor rects do not overlap zones). Bought in the Shop, drawn by `GameScene`.
- [x] 8. RecipeBook scene (done: 6 tests in `tests/recipebook.test.ts`): `src/scenes/RecipeBookScene.ts` reads `recipes.json` and `progression.json` (price, XP, steps, locked entries show "Lv N").
- [x] 9. RestaurantSelect scene (done as below, differs from the plan: coming-soon entries live in `data/restaurant_menu.json`, not in `restaurants.json`): `src/scenes/RestaurantSelectScene.ts` lists `restaurants.json`. Only `burger_diner` has mapped zones, so other entries (the `bg_taco` art exists) are shown locked as "Coming soon" through a new `playable` flag in `restaurants.json` plus validator and test support. Pick passes `restaurantId` to `Game`.
- [x] 10. HUD entry points for Shop, RecipeBook and Restaurants (done, docs written) (button row that does not cover any tap zone), then docs: `docs/progress.md` (Milestone 4 section with a Not-verified list), `docs/architecture.md`, README.
- [~] 11. Verification (checks done and recorded in `docs/progress.md`; the PR is the last item): `npm test`, `npm run typecheck`, `npm run build`; browser run at 1280x720 and 844x390 touch (buy an upgrade and see the effect, open each scene, story card once, chef bubble, reduced motion); report what was and was not seen. Open the Milestone 4 PR (base: `milestone-3-core-systems` because PR #5 is unmerged; confirm with the owner).

Assumptions to confirm with the owner: upgrade tiers and prices; decor is cosmetic only; Taco restaurant is locked, not playable; PR base branch; the start flow stays Boot -> Game (menus reached from the HUD).

## Current status and next handoff (2026-10-29)

### Completed and merged
- **Milestone 3** merged to `main` via PR #5: https://github.com/dhavalwork97-jpg/Chef-Rush/pull/5
- **Milestone 4** merged to `main` via PR #6: https://github.com/dhavalwork97-jpg/Chef-Rush/pull/6
- Milestone 4 merge commit: `6e46972dc5ff3e98575e317b61527fb51ac611af`.
- The merge preserved the Milestone 4 tree and resolved the old branch-history mismatch without dropping Milestone 3.
- The post-merge Vercel status for the merge commit reported **deployment completed successfully**.
- Verification recorded for the merged file tree: `npm test` — 150 passing; `npm run typecheck` — passed; `npm run build` — passed; production-preview Chromium checks passed for documented desktop and emulated phone flows. **These commands were not independently rerun during the merge session**; treat those as results recorded in `docs/progress.md`, not as fresh local runs.
- PR #6 had no review comments or review submissions at merge time.

### Milestone 4 scope now on main
Save v2 with backward-compatible v1 parsing; five upgrades with three tiers; persistent modifiers; cosmetic decor; career titles; chef speech bubbles; one-time story cards; Recipe Book; restaurant selection (only `burger_diner` is playable); HUD buttons. Details and the explicit not-verified list are in `docs/progress.md`.

### Milestone 5 — content (status: implemented on branch `milestone-5-content`, see the section at the top; original brief below)
Start from the latest `main`, inspect the current repository and docs first, and avoid rebuilding existing systems. Priorities:
1.Lv 11–20 and the after-Lv 20 scaling.
2.Balance simulation for the later levels.
3. Update `docs/progress.md`, `docs/architecture.md` if needed, and this `HANDOFF.md` with completed work, test outputs, unverified items, exact commit/branch, and next action. Use a focused feature branch and PR for the milestone; do not merge until checks and review are satisfactory.

### Known limitations carried forward
- Balance and upgrade prices are first-pass values; they have not been tuned against a bot simulation.
- Human-player pacing and upgrade difficulty have not been verified.
- Real-phone performance and touch usability have not been measured.
- Sound mix/loudness has not been listened to and evaluated.
- Some event visuals and animation feel remain unverified.
- Only `burger_diner` has playable station zones; other restaurant cards are coming soon.
- Phone touch targets are below the 88 CSS px target in several places; improve carefully without overlapping zones.
- Fredoka is not bundled; fallback font stack is used. Customers use single-pose art.
- Do not claim Milestone 5 is complete until its checks are run and documented.

## Decisions & constraints
- Failure modes should stay user-friendly (no punishing wrong-item serves).
- Keep tests passing (150 currently; the original 77 must stay unchanged).
- Milestone 3 is done; do not change it.

## Not verified yet
- Pacing with a human player (numbers are from the bot only)
- Wrong-item shake animation on screen
- Double coins, slow oven and lunch rush visuals
- Sound
- Phone performance
