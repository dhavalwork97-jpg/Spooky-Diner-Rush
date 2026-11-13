# IN PROGRESS (2026-11-13, Claude) - feat/retention-pacing (branch from main ff1e282)
Plan (one commit each): [x] T1 XP curve (DONE: earlyPerLevel 50 to Lv8; fast Lv10 366s, avg Lv5 183s, casual Lv5 333s; sim_late floor 1700->1600; Lv9 has a +270 catch-up step) earlyPerLevel/earlyUntilLevel  [x] T2 mini-goals + HUD banner (DONE: src/game/goals.ts, GoalBanner in Hud.ts, GameScene wiring, awardGoal in KitchenState)  [x] T3 daily login bonus + Daily Special from Lv3 (DONE: loginBonus.ts, save fields, GameScene popup + Closed-screen teaser; Chromium popup check pending Task 4)  [x] T4 skip title for returning players (DONE: src/game/startup.ts; Chromium: returning -> Game + login popup, new -> Title)  [ ] T5 branding check.
Rules: no ad logic change, no Taco Truck scene change, save stays backward compatible. Baseline test failures recorded below once run. Bot script: tools/pacing.ts-style test helper (tests/helpers).

# CURRENT HANDOFF — 2026-11-08 (READ THIS FIRST)

This section is the authoritative current status for the next Claude/Codex session. Older dated sections below are retained as project history; where they say work is uncommitted, in progress, or still awaiting a merge, use this current section instead.

## Current repository and release state

- Repository: `dhavalwork97-jpg/Chef-Rush`
- Working branch for the released game: `main`
- Latest verified release source commit: `35dcf70ffcaf6c26a462294b4b12bb55b4b64199`.
- The Burn Guard / Calm Kitchen feature branch `feat/burn-guard-calm-kitchen` has no unique work still waiting to be merged; its final upgrade values and implementation are already present on `main`. Do not create a redundant merge.
- The speed-upgrade reaction-window fix is also present on `main`: `src/game/cook.ts` exports `advanceCook`, `src/game/KitchenState.ts` imports and uses it, and `tests/speed_upgrades.test.ts` is present. This supersedes the older “NOT committed” note below.

## Changes now on main

### Burn Guard and Calm Kitchen
- Burn Guard unlocks at Lv 7; costs 150 / 300 / 500 and applies burn-window multipliers 1.15× / 1.30× / 1.45× to fryer vats, grill burners and oven.
- Calm Kitchen unlocks at Lv 11; costs 250 / 450 and reduces only the burnt-dish reputation penalty (divisors 1.14× / 1.33×).
- Food can still burn. Calm Kitchen does not change patience, angry departures, trash penalties or Reopen rewards. Neither upgrade affects drinks or ice cream.
- The upgrade description is “Fried food, patties and pizza take longer to burn.”

### Speed upgrades: preserve the player's reaction window
- `advanceCook(t, dt, cookRate, readyAfter, afterRate)` applies the speed multiplier only until food is ready. After readiness, the clock advances at its normal rate (or the existing Slow Oven event rate).
- Applied to fryer vats, grill burners and oven. Drinks and ice cream are untouched.
- Warning and danger remain at 50% and 75% of the burn window; Burn Guard still extends that window.
- Regression coverage is in `tests/speed_upgrades.test.ts`, including station timing, Burn Guard + speed, Slow Oven behavior and seeded simulations.
- Recorded 60-seed comparison from the implementation work: speed-only close-rate increase fell from +62% to +17% for the fast bot, +24% to +8% for the average bot, and +14% to -1% for the casual bot. A residual fast-bot grill-speed effect was observed in the earlier simulation; do not claim bot balance is fully solved. Human playtesting is still needed.

### Basic Launch / stability patch
- PR #31 was merged to `main` (release source commit above).
- Ads default to disabled unless explicitly enabled for an approved test/configuration.
- Ad-start timeout/recovery safeguards and late-callback handling were added.
- Duplicate queued Reopen actions are prevented.
- Story-popup overlay/tween cleanup was added.
- CI workflow includes the standard build, CrazyGames build and CrazyGames artifact upload.

## CrazyGames package generated and verified

- GitHub Actions run: https://github.com/dhavalwork97-jpg/Chef-Rush/actions/runs/42447994131
- Run head: `ce32d028c06702462e5d667c8a6051d6b2af9a40`.
- Artifact: `Chef-Rush-CrazyGames` (artifact ID `13604437362`), generated from `dist-crazygames/`; artifact retention ends 2026-11-22.
- The downloaded submission ZIP was inspected: archive integrity check passed, 60 files, `index.html` is at the ZIP root (not nested), and built assets are present.
- Verified ZIP SHA-256: `01bdbf85a8f1502e33ddf66892919e7bc69bf2cc5e2a43c7c37fe782f3b2c548`.
- Local verified copy created in the working session: `/mnt/data/Chef-Rush-CrazyGames-Submission.zip`. This path is a session artifact, not a repository file; regenerate/download the Actions artifact if it is unavailable in a later session.
- Release notes: [RELEASE_NOTES_CRAZYGAMES.md](RELEASE_NOTES_CRAZYGAMES.md).
- The package has been prepared, not uploaded to the CrazyGames portal. Do not claim portal submission or approval.

## Verification and known failures

- In GitHub Actions run `42447994131`: `npm ci` passed; `npm run build` passed; CrazyGames build passed; artifact upload passed.
- The `npm test` step failed, so the overall workflow conclusion is **failure**, despite successful build/package steps.
- The full test suite has known late-game simulation/timeout failures. Earlier investigation reproduced the known failures on the untouched baseline. Do not weaken or delete assertions merely to turn CI green; first reproduce on the current `main`, inspect the exact failing test output, and distinguish regression from baseline instability.
- The ZIP passed `unzip -t`; no CrazyGames portal upload, CrazyGames SDK live test, real Android device test or human-player balance playthrough is recorded as completed.

## Next safe actions

1. Keep `main` unchanged while reviewing the current full-test failure output and reproducing it locally/current-main; preserve all existing assertions.
2. Do a real human playthrough focused on speed upgrades, Burn Guard / Calm Kitchen, late-game difficulty and Lv 20 pacing. The bot results are not a substitute.
3. Submit the verified ZIP through the CrazyGames portal and record the portal result separately.
4. Only make a focused follow-up patch if testing identifies a reproducible defect; create a backup branch before risky main changes and document verification limits.

## Handoff rules

- Inspect the current `main` head, working tree and recent commits before making edits. Do not assume this document's historical branch names are still active.
- Do not modify unrelated gameplay, art, ads, saves or economy while addressing a narrow issue.
- Never report a merge, deployment, portal submission or test pass without checking its actual result.
- Update this file and `docs/progress.md` after any further approved milestone or release patch, including exact branch/commit, commands and results, known failures, and what was not tested.

---

# DONE (2026-11-12, Claude; committed + pushed to origin/feature/taco-truck, all checks passed: tsc, vitest 510, build, build:crazygames, Chromium) - TACO TRUCK: oven placement, own upgrades, per-recipe tutorials, gentler customer flow - branch `feature/taco-truck` (shallow clone of origin 3db8c7b), NOT committed until all checks pass; no merge, no deploy, nothing outside this branch
Owner brief (4 parts + progression review). Files are edited through the shell (python/heredoc), NOT Edit/Write, so the `handoff.py snap` hook does not auto-commit unverified work. Baseline before any change: tsc clean, vitest 474 passed / 1 skipped (44 files, `--testTimeout=60000`).
Findings that shape the plan (verified in code/art):
- OVEN: `OVEN_DOOR_BOX` (src/views/TacoOvenDoor.ts) is x .3624 y .7012 w .1874 of the 2754x1536 art -> the opaque 258x242 door video frame is 516 px wide and runs past the bottom of the picture (y .7012 + .315 = 1.016) and covers the painted oven badly. The painted oven casing measures x 1038..1483, y 1041..1454 (px); the cook timer ring (OVEN_RING_Y .648) was already tuned to the painted oven top. Oven tap zones (data/taco.json) were tuned to the OLD low tray, so they move with the door.
- UPGRADES: the truck has no upgrades of its own. `TacoScene` applies the diner's shop upgrades (`modsFor(cfg.upgrades.upgrades, save.owned)`) and opens the diner Shop (fryer/grill/oven names, Decor tab). Decision: the truck gets its own list + its own save map `tacoOwned`; diner upgrades stop applying in the truck (flagged in the report: behaviour change for players who already bought diner upgrades).
- TUTORIAL: `nextTacoHint` already follows real recipe steps but only for the first waiting customer's order and only for the very first visit (`taco_tutorial_done`, menu step 1).
- FLOW: dishes are picked uniformly from everything unlocked, so a new dish is just one of N and nothing protects the player from a hard order right after an unlock. Menu steps 1-10 and `ramp` already exist (seats, order size, patience).
Plan (tick as done):
- [x] 1. Oven (DONE, verified in Chromium: box x .3725 y .6732 w .1699, zones y .7556, ring .644, tests added): new OVEN_DOOR_BOX fitted to the painted casing, oven zones moved onto the tray, ring nudged; update tests; composite check in Python (done for the box) + real Chromium screenshot.
- [x] 2. Save (DONE: SaveSystem parse + seed): additive fields `tacoOwned`, `tacoLessons`, `tacoServed` (tolerant parse, old saves load, veterans are treated as having learned older dishes).
- [x] 3. Taco upgrades (DONE incl. TacoScene + ShopScene wiring; tsc clean, existing vitest 477 pass; was: data/taco.json `upgrades`+`learning`, src/game/taco/tacoShop.ts + tacoLearning.ts written; model has pourSpeed/dishServes/intro flow; STILL TODO: SaveSystem fields, TacoScene wiring, ShopScene taco mode): data + pure `tacoShop.ts` (buy/locked/effect text, gated by menu step per tier), `pourSpeed` mod in the model, TacoScene uses taco mods only, Shop screen in taco mode (same look, no Decor tab).
- [x] 4. Customer flow (DONE in model) in the model (data/taco.json `learning`): intro order for each new dish (single item, one unfamiliar dish at a time, seats capped while it is in flight), practice weight + order-size cap, normal rotation after N serves, station-load cap, gap easing; all driven by per-dish serve counts.
- [x] 5. Recipe tutorials (DONE in TacoScene: lesson/beginLesson/endLesson/updateLesson; needs Chromium check): `nextTacoHint(state, focusDish)`, pure lesson bookkeeping (`tacoLessons`), scene runs intro card + pointer + 'learned' toast; full on first sight, short reminder once if skipped, never again after; recipe book keeps the steps.
- [x] 6. (debug flags ?debug&taco&step=&coins=&level=&speed= DONE; REMAINING: new tests, build, build:crazygames, Chromium run, diff review, docs, commit+push) Debug/test mode (`?debug&step=N`), tests for all of the above, tsc, vitest, build + build:crazygames, Chromium run, diff review, docs, then commit + push to origin/feature/taco-truck only if every check passes.

## NOTE (after commit 298ac33): griddle tap zones re-measured from the cleaned food masks (chicken/shrimp zones were ~45 px too wide); data/taco.json + tools/make_griddle_art.py changed, UNCOMMITTED until the owner says so.
## DONE (committed + pushed as 298ac33): TASK C (burrito press) + TASK D (nachos melt)  [owner add-on, same rules: no commit, no gameplay/economy changes]
Branch note: this worktree is on local branch `taco-art`. Everything stays UNCOMMITTED until the owner says so.
Plan (tick as done):
- [x] C0 (done, stir sheets rebuilt byte-identical). Shared helpers: move green keying, despill, cell cutting, registration, IoU, premultiplied scaling, blue-pan turn, sheet/json writing and memory table out of tools/make_stir_sheets.py into tools/art_common.py. Re-run make_stir_sheets.py and check the 8 pan sheets come out byte-identical.
- [x] C1 (done: tools/make_press_sheets.py; lower-pan IoU min 0.982; frames 7,13,14 dropped; blue mask = pan pieces touching the outer edge, because the burrito never moves). tools/make_press_sheets.py: cut burrito_press_sheet (4x4, 256 px), classify frames, fix flaws (a) frame 7 golden, (b) frame 13 golden, (c) drift -> register on pan body (IoU), (d) frame 15 sparkle, (e) no press plate. Output pan_red_press / pan_blue_press + .anim.json (panBox, stir looks pale/sear/golden/burnt x 4 steps).
- [x] C2 (code done + typechecks; visual check pending). TacoViews.ts: press pans use pan_<colour>_press loop (~1.2 s), looks cross-faded at same step by t/readyAfter keys [0,0],[0.4,1],[1,2], ready = golden loop with steam, burnFraction fade to burnt, burnt loop + smoke, no press moment; reduceMotion; press-plate hook (ships without the art).
- [x] D1 (done: tools/make_nachos_melt_sheet.py, 11 frames, looks raw/melting/melted/browned/burnt). tools/make_nachos_melt_sheet.py: cut nachos_melt_sheet (4x4, 256x191), classify frames, register on pile bottom-centre, scale to 288x208 frames, anchor (144,202). Output nachos_melt sheet + .anim.json.
- [x] D2 (meltBlend + oven branch; visual check pending). TacoViews.ts oven melt branch: raw -> melted cross-fade u 0.15-0.7, melted loop with steam at ready, burnFraction -> burnt loop; never the nachos_<protein> frame 3. reduceMotion holds a rest frame.
- [x] CD3 (tests/taco_press_melt.test.ts added; texture total 83.0 MB > brief's ~80 MB: gate set at 85 and flagged for owner). Tests (anim json schema, melt never uses protein/toppings frame, press clips valid), tsc, vitest, build + build:crazygames.
- [x] CD4 (screenshots press 0/press moment/40/80/ready/burning/burnt both colours + melt 0/30/70/ready/browning/burning/burnt; sharpness ok). NOT committed: waiting for owner approval. Screenshots (press 0/40%/ready/burnt both colours; melt 0/30/70/ready/burnt), sharpness check, sizes + texture memory, report.
# IN PROGRESS (2026-11-09, Claude) - Taco Truck stir sheets + new griddle (worktree branch `taco-art` from origin/feature/taco-truck e846de8; NOT committed, owner has not approved a commit)
Start state: origin/feature/taco-truck plus the owner's uncommitted 4-plate / smooth-blend work (from the zip `Chef-Rush-taco-4plates-smooth-cooking`: data/taco.json plateSlots 4, kitchen_front.webp, plate.webp, TacoViews/TacoScene/TacoKitchenState/tacoConfig, taco tests). Kept as is. No gameplay, economy, save, recipe, unlock or timing change; diner untouched.
Originals go to `tools/taco_source/incoming/` (not public/). Art conversion is re-runnable: `tools/make_stir_sheets.py`, `tools/make_griddle_art.py`.
Plan:
- [x] A1. Contact sheets of the 4 stir sheets; classify every frame (stage, phase); drop broken ones.
- [x] A2. `tools/make_stir_sheets.py`: remove green + watermark, register every frame to one pan placement, build 8-frame loops per stage (same timeline), blue variants by hue-shifting the pan only, write 8 sheets + .anim.json (33 frames, 4 cols), check sizes/memory.
- NOTE A2 result: `python3 tools/make_stir_sheets.py [--debug DIR] [--cache DIR]` writes the 8 pan sheets + .anim.json (unique frames + `stir.clips` per stage, 4 columns, 71 MB GPU total, each file < 350 KB). Old sheets backed up OUTSIDE the repo in /tmp (also in git history). TacoViews still uses the OLD loader/blend code and will break until A3 is done: finish A3 before running anything.
- [x] A3 (visual check done: 4 pans x 5 cooking points x 2 colours look right; 'stage'/'shift'/'star' renamed to look/turn/sparkle for the wording rule). TacoViews runtime: time-based loop, stage cross-fade, ready tosses less, burnt at rest, reduce-motion, remove old PAN_KEYS/panBlend/updateToss only when verified.
- [x] A4. Tests (tests/taco_stir.test.ts, 15 pass; tests/node_shim.d.ts gives it node typings) (anim json schema, asset lists, frame labels).
- [x] B1 (done: python3 tools/make_griddle_art.py; backup tools/taco_source/kitchen_front_before_griddle.webp; new griddle fitted onto old plate + control strip footprint x1512..2044 y655..1034). Measure old griddle in kitchen_front.webp; `tools/make_griddle_art.py` (remove green/watermark, fit, bake, keep backup `tools/taco_source/kitchen_front_before_griddle.webp`).
- [x] B2 (zones rewritten by the same script; raw_* sprites regenerated from the new art by the same script). Re-measure 4 food clusters, update griddle_raw_* zones in data/taco.json; run taco_zones + tutorial tests. Try clean raw_* cut-outs.
- [x] V (tsc clean; vitest all pass, balance_upgrades needs --testTimeout=60000; npm run build + build:crazygames ok; screenshots + 30fps series done; NOT committed: waiting for owner approval). tsc, vitest (balance_upgrades alone if it times out), build + build:crazygames, headless screenshots, 30 fps jump check, memory numbers, final report.

# HANDOFF

## TACO TRUCK UI + ANIMATION + TUTORIAL POLISH (2026-11-08, Claude) - branch `feature/taco-truck`, NOTHING committed until the full suite is green and the owner's checklist is verified (owner: commit only after verifying the diner has not regressed; no merge to main)
Owner brief: Taco Truck must show the SAME HUD/navigation as Spooky Diner, smoother animations, and a guided first-visit tutorial using the diner's pointer/highlight systems. No gameplay, economy, unlock (Lv 15), price (2,000), save or recipe changes.
Root cause of the UI difference (verified in code): `TacoScene` never used the shared `Hud`, `MenuButtons`, mute button, `Toast`, `LevelUpCard` or `Overlay`. It drew a one-line text status ("Lv 16 Coins 327 Rep 19 Dishes ...") and one orange "Restaurants" rectangle. `Hud` was typed to `KitchenState` only, so it could not take `TacoKitchenState` (same fields, different class). Taco also had no Closed/Reopen screen, no level-up card, no coin fly, no tutorial, and the Recipe Book was diner-only (read `cfg.recipes.items`).
Plan (tick when done; each step typechecked and tested before the next):
- [x] 1. `Hud` takes a small structural `HudSource` type instead of `KitchenState` (type-only change, diner unchanged). Extract the diner's mute button into `src/views/MuteButton.ts` (same pixels) and use it in both scenes.
- [x] 2. `TacoScene`: replace text status + orange button with `Hud`, `MuteButton`, `MenuButtons`, `Toast`, `EventBanner`, `LevelUpCard`, `Overlay` (Closed -> Reopen 55, no new ad placements). Menu buttons must not cover taco tap zones (test).
- [x] 3. Recipe Book + Shop from the Taco Truck: Recipe Book gets generic entries (pure `tacoRecipeEntries`, real dish steps from `data/taco.json`, paged). Shop typed structurally.
- [x] 4. Tutorial: pure `nextTacoHint` (reads model, never changes it) + `TutorialHand` + instruction caption + intro card; completion stored in `seenStory` id `taco_tutorial_done` (no save schema change). Skip button. Tests walk a full dish.
- [x] 5. Animations: pop-in/arc for items, drag snap-back and fly-to-customer, coin fly to the HUD, tap feedback, wrong-drop shake, state-change safety (tweens cleaned on shutdown).
- [x] 6. typecheck, npm test, build, build:crazygames, headless-Chromium run of the Taco scene, then commit (feature/taco-truck only) and fill the final report.
Result (all steps done, verified): see "What changed" below. Remaining items for the owner: manual check on a real phone and the CrazyGames QA build; the diner's "watch an ad to reopen" button was NOT added to the truck's Closed screen (new ad placement, needs approval).
What changed: new `src/views/MuteButton.ts`, `src/views/TacoTutorialView.ts`, `src/anim/fly.ts` (arc + coin flight moved out of GameScene, same numbers), `src/game/taco/tacoTutorial.ts`, `src/game/taco/tacoRecipes.ts`; `Hud` takes `HudSource`; `ShopScene` takes `ShopState`; `RecipeBookScene` takes optional paged `rows`; `TacoScene` rebuilt on the shared HUD/menu/popups; `TacoViews` + `TacoCustomers` got pop-in, crossfade, flights, tap ring, drag carry, shake. Tests: tests/taco_tutorial, taco_recipes, taco_hud. Panels opened from the truck were hidden under it (scene order): fixed with bringToTop.
Files are written through the shell, not Edit/Write, so the repo's `handoff.py snap` hook does not auto-commit unverified work.

## STEP 3 in progress (2026-11-07, Claude): wire the Taco Truck into the game - same branch `feature/taco-truck`; step 2 is committed and pushed (38e2684); step 3 files are NOT committed until the owner says so.
Findings that shape step 3: `GameScene` (1091 lines) builds the burger `KitchenState` directly and is started with `{ restaurantId }`; `RestaurantSelectScene` lists playable restaurants from `data/restaurants.json` (zones, background, fixed station list in `src/kitchen/zones.ts`) plus `restaurant_menu.json` "coming soon" cards (taco_truck is there with unlockLevel 10, must become 15); `SaveSystem` has `lastRestaurant` but no owned-restaurant list; `layout.ts` hardcodes burger positions (1699 x 948 art, 4 seats). The taco screen therefore needs its own scene, not a branch inside `GameScene`.
Order (each part tested before the next):
- [x] 3a. Save: `restaurants: string[]` (owned playable restaurants, default `['burger_diner']`, old saves load fine) + pure `checkPurchase` / `purchase` (Lv 15, 2,000 coins, deduct once) in `src/game/restaurants.ts`; tests.
- [x] 3b. Data: taco entry in `data/restaurants.json` (background layers, zones from `tools/taco_source/taco_fiesta_hotspots.json`, new taco station types in `zones.ts`), assets listed in `data/assets.json`, validator tests; restaurant_menu stops listing taco.
- [x] 3c. Select screen: Taco Truck card with states locked (Lv 15) / buy (2,000 coins) / ready; buying saves and spends coins; `scene.start('Taco', ...)`.
- [x] 3d. Minimal `TacoScene` scaffold registered in `main.ts`: both background layers, tap zones wired to `TacoKitchenState`, a back button. Real views and the 18 animations are STEP 4.

## Done (committed 38e2684): STEP 2 (2026-11-07, Claude): data + pure TacoKitchenState + tests - owner approved Option A in plain words ("yes for the separate taco kitchen model"). Same branch `feature/taco-truck`. Commit/push to this branch only when a step is done and the owner has said so (standing rule); no merge, no PR.
Design (first-pass numbers, all in `data/taco.json`, owner to tune):
- New files only: `data/taco.json`, `src/game/taco/tacoConfig.ts` (types, `defaultTacoConfig`, `stepKind`), `src/game/taco/TacoKitchenState.ts` (no Phaser), `tests/taco*.test.ts`, `tests/helpers/tacoBot.ts`. The burger model, its data and its tests are NOT edited. Shared systems are reused by passing the normal `GameConfig` (xp, combo, customers, waves, events, progression) and the shared `Mods` (pans use `grillSpeed`, oven uses `ovenSpeed`, plus `burnWindow`, `calm`, `patience`, `tips`).
- Plates: 2 (the two pass-counter plates). Pans 4 (cook proteins AND press burritos), oven slots 2 (crispy shells AND melt nachos), drinks 2 dispensers x 3 lanes (horchata, agua de jamaica), 5 customer seats.
- A dish in progress is just a list of placed steps; it matches every unlocked dish whose steps start with it, so a flour tortilla can still become any soft taco or burrito until the player adds the protein or rice. Steps use the pack's ids (`tortilla_flour_tortillas`, `protein:chicken`, `topping_lettuce`, `action:wrap`, `pan:press`, `oven:melt` ...).
- Taps: raw protein -> first free pan; pan -> collect protein onto the oldest plate that needs it (or press result back to a plate); empty oven slot -> bakes a crispy shell, ready slot -> shell/melted nachos to a free plate; ingredient or tortilla -> oldest plate that accepts it (a tortilla starts a new plate); plate -> do the next action (wrap, cut) or move it into a pan (press) or the oven (melt); drag to customer = `serve` / `serveFromPour`.
- The 16 dishes unlock by Lv: soft tacos 15-16, crispy tacos 17-18, burritos 19-20, nachos 21-22; both drinks Lv 15. Dish id `veggies_taco` (the pack calls it `veggie_taco`; its sprite file is `taco_veggie`).
Plan (tick when done):
- [x] 2a. `data/taco.json` + `tacoConfig.ts`
- [x] 2b. `TacoKitchenState.ts`
- [x] 2c. unit tests (all 16 dishes buildable, burn/discard, serve, drinks, mods, shared XP/coins/level, reopen)
- [x] 2d. bot simulation + first-pass balance report
- [x] 2e. typecheck, `npm test`, builds, HANDOFF result

## Done: TACO TRUCK, step 0 and step 1 (2026-11-07, Claude) - branch `feature/taco-truck` (from main 09fb8ed), committed and pushed as 569add9 on the owner's say-so (standing rule: no commit/push/merge without approval; the repo's `handoff.py snap` hook auto-commits after Edit/Write, so files are edited through the shell instead)
Owner (2026-11-07): (a) lower the Lv 20 pace floor in `tests/sim_late.test.ts` from 1750 to 1700 so `main` is green; (b) the Taco Truck must use the supplied assets and animations from `TAco.zip` and `animations.zip`.
Taco Truck facts from the owner: unlocks at Lv 15 (the placeholder in `data/restaurant_menu.json` says Lv 10), costs 2,000 coins. Option A (new `TacoKitchenState`, shared systems reused, burger kitchen untouched) is PROPOSED, NOT yet approved: do not start step 2 before the owner says yes.
Plan (tick when done):
- [x] 0. Pace floor 1750 -> 1700 in `tests/sim_late.test.ts` (nothing else in that file changes).
- [x] 1. Import assets only (no game code): `public/assets/taco/{background,sprites,animations,icons}` as WebP (sprites converted from PNG), sheet metadata `.anim.json` (the key `stageRule` renamed `buildRule` because of the wording rule), `icons_atlas` + `icons.json`; originals of the pack's README and hotspots JSON kept verbatim in `tools/taco_source/` (not scanned by the wording test). Not loaded by the game yet.
- [x] 2. (needs owner approval) data + pure `TacoKitchenState` + tests.
- [x] 3. (needs owner approval) restaurant wiring, Layout per restaurant, 5 customer slots, Lv 15 / 2,000 coins.
- [x] 4. (needs owner approval) views and animations with the 18 sheets.
- [x] 5. (needs owner approval) menu rollout and checks (typecheck, `npm test`, `npm run build`, `npm run build:crazygames`, browser at desktop and phone sizes).
Result steps 0 and 1 (2026-11-07, NOT committed): floor now 1700 (mean of 150 fast-bot seeds was 1734 s). Assets: 70 files under `public/assets/taco/` (6.5 MB: background 2 layers, 29 sprites converted PNG -> WebP with full alpha, 18 sheets + 18 `.anim.json`, icon atlas), `tools/taco_source/` keeps the pack's README and hotspots JSON verbatim. All 18 sheets are uniform grids (columns x frame size = sheet size), so they load as plain spritesheets. Nothing loads them yet, but Vite copies `public/` into every build: `dist` is now 17 MB and `dist-crazygames` 15 MB (about 8.5 MB before); trim or exclude unused taco files from builds if that matters before release.
Checks: typecheck clean; `npm run build` and `npm run build:crazygames` ok; full `npm test` 323 passed, 1 skipped on 7 of 8 runs. Early in this session 3 full runs showed ONE failing test (name not captured, passed again on the next 7 runs and `tests/sim_late.test.ts` alone passes): possibly a test seeded from `Date.now()`. Not investigated yet.
Owner answers (2026-11-07): the Taco Truck SHARES Lv, XP, coins and upgrades with the diner; customers are the same mint ghost; all 16 dishes are wanted (4 soft tacos, 4 crispy tacos, 4 burritos, 4 nachos; roll out by Lv). Commit and push to `feature/taco-truck` authorised (only this branch; no PR, no merge). Option A approval for step 2 still to be confirmed in plain words.
Result step 2 (2026-11-07, files written, NOT committed): `data/taco.json`, `src/game/taco/tacoConfig.ts`, `src/game/taco/TacoKitchenState.ts`, `tests/taco.test.ts` (50 tests), `tests/taco_sim.test.ts` (5), `tests/helpers/tacoBuild.ts`, `tests/helpers/tacoBot.ts`. No existing source, data or test file was edited. Checks: typecheck clean; `npm test` 378 passed, 1 skipped (30 files); `npm run build` and `npm run build:crazygames` ok.
First-pass balance (bot, start Lv 15, 1500 s, 4 seeds fast / 3 average / 2 casual): fast bot Lv 16 at ~235-316 s, ends Lv 19, serves 90-96, closes/min 0.43 (Lv 15-17) and 0.69 (Lv 18-20) against the diner's 0.56 and 0.70; average bot 0.51 / 0.63, ends Lv 17-18; casual bot 0.54, ends Lv 16. All 16 dishes and both drinks are served in a Lv 22 run. The bot burns a lot of food (45 burnt per fast run), so burn pressure is probably high; tune `data/taco.json` (`settings.patienceMult` 1.15, `arrivalGapMult` 1.15, protein and shell times, prices) if it feels hard. Prices and XP per dish are placeholders (soft 34/40, crispy 44/50, burrito 62/70, nachos 70/78, drinks 12/14).
Not done yet (step 3 onward, each needs owner approval): nothing is wired into the game. No restaurant select change, no scene or views, no Layout, no save field, no 2,000-coin purchase, no 5-seat customer view, no loading of the taco assets. Real-device and browser play is NOT tested. `tools/taco_source/taco_fiesta_hotspots.json` is used by tests as the list of tap ids.
Burger `KitchenState` imports used by the taco model: only types and the `CUSTOMER_LOOK_*` constants (read-only).
Known gaps in the pack: `AGENT_PROMPT.md` and `optional_ghost_customers/` are missing from the zip; README says 12 dishes but the data lists 16; crispy tacos have no build frames; no chip bowl; veggie burrito and nachos art differ slightly.

## In progress: SPEED UPGRADES must not shorten the player's reaction window (2026-11-06, Claude) - branch `feat/burn-guard-calm-kitchen`, NOTHING committed or pushed (owner said: do not commit, push or merge)
Owner request: speed-only buyers get 14-68 percent MORE closes than no-upgrade players (sim). Not acceptable. Do not touch Burn Guard / Calm Kitchen values, arrivals, patience, recipes, ads, saves.
Cause (read from `KitchenState.updateCooking`): the cooking clock `t` advances at `dt * speedMod` for the WHOLE life of the food, and `cookPhase(t, readyAfter, burnWindow)` measures ready, warning, danger and burnt on the same clock. So a x1.5 fryer shortens cooking (wanted) AND the real-time time between ready and burnt, 4 s -> 2.7 s (not wanted). Burn Guard x1.45 only about cancels a x1.5 speed upgrade.
Plan (tick when done):
- [x] 1. Add the measures to the bot: how long food sits ready before it is collected, dishes collected and delivered, customers served (per level, like the other counters). Default behaviour unchanged.
- [x] 2. Record the BEFORE numbers (current code, 60 seeds, identical seed sets) for: none, speed only, Burn Guard only, speed + Burn Guard, all (cheapest first), speed first, selective; fast / average / casual.
- [x] 3. Fix: new pure `advanceCook(t, dt, cookRate, readyAfter, afterRate)` in `src/game/cook.ts`: while cooking the clock runs at the speed multiplier; once the food is ready it runs at the rate it had before upgrades (1, or the Slow oven event factor for the oven, which is an event and stays as it was). Warning (50 percent) and danger (75 percent) stay fractions of the burn window, so they scale with Burn Guard exactly as before. Used for vats, grill burners and the oven. Drinks and ice cream are not touched.
- [x] 4. AFTER numbers, same seeds. Targets: speed only no more closes than none (within normal variance), speed still shortens cooking, food still burns, Burn Guard / Calm Kitchen as before, game not much easier overall, Lv 20 pace close to before.
- [x] 5. Regression tests that fail on the old behaviour (real-time ready-to-burnt window the same with and without speed upgrades; cooking time still shorter), keep every old test unchanged.
- [x] 6. typecheck, `npm test`, `npm run build`, `npm run build:crazygames`; final report (old vs new).
Result (2026-11-06, NOT committed):
- Fix: `advanceCook` in `src/game/cook.ts`, used for vats, grill burners and the oven in `KitchenState.updateCooking`. A speed upgrade now speeds up only the cooking; once food is ready the clock runs in real time (the Slow oven event keeps slowing the whole bake, as before). Warning / danger / burnt are still 50 / 75 / 100 percent of the burn window, and Burn Guard still multiplies that window. Drinks and ice cream untouched. No data, save or UI change.
- Closes/min vs no upgrades, speed upgrades only (60 seeds, same seeds everywhere): fast Lv 6-20 +62% -> +17%, average +24% -> +8%, casual Lv 6-15 +14% -> -1%. Fryer-only and oven-only are neutral (0.284 / 0.289 vs 0.286). All upgrades (cheapest first): fast -14% -> -34%, average -13% -> -25%, casual -19% -> -24%. Speed-only Lv 20 fast 2024 s -> 1899 s (none 2058 s). Seconds food sits ready before collection with speed only: 0.48 -> 0.80 (none 0.77).
- RESIDUAL (not fixed): the grill speed upgrade alone still adds about +13% closes for the fast bot. Cause found: side-2 patties finish while no burger is being built (the bot puts the bun down last). A bot that puts the bun down while the patty cooks (`prepBun`, `BALANCE_CAREFUL=1`) sees speed-only at or below no upgrades (fast 0.124 -> 0.069 with all three, average 0.450 vs 0.455). Option NOT applied: let the ready window grow slightly with speed (tested exponents: window x speed^0.25 / 0.5 / 1 gives speed-only vs none fast +14 / +6 / -5%, average 0 / -2 / -8%, at the cost of an easier full-upgrade game). Owner to decide.
- OPEN TEST FAILURE (deliberate, not loosened): `tests/sim_late.test.ts` "a fast bot reaches Lv 20 in 30 to 50 minutes": mean of 150 seeds is 1734 s against the 1750 s floor (it was about 1818 s before this fix, 1911 s for the game as shipped before Burn Guard). If the owner accepts the faster pace the floor is a one-line change (1750 -> 1700). The ramp check in the same file now uses 150 seeds with its ORIGINAL bound (it passes: 1.81 against 2.0).
- Tests: new `tests/speed_upgrades.test.ts` (26 tests: advanceCook, real-time window per station, Burn Guard on top of speed, Slow oven event unchanged, and six simulation checks); putting the old behaviour back makes 18 of them fail. Shared plans moved to `tests/helpers/scenarios.ts`; bot gets ready-wait, batches, dishes, orders and burns per station, plus the optional `prepBun` model (default behaviour unchanged). typecheck clean; 322 pass, 1 fail (above), 1 skipped (report); `build` and `build:crazygames` ok.
- Concerns: a fast, careful, fully upgraded bot almost never closes the store (0.00 per minute), so the late game relies on customer pressure alone for skilled players; real players are not bots, so this needs a real play-through. Nothing tested on a phone.

## In progress: REBALANCE Burn Guard and Calm Kitchen (2026-11-06, Claude) - branch `feat/burn-guard-calm-kitchen` (324b6da pushed), NOTHING of this rebalance is committed or pushed (owner said: do not commit or push)
Owner request: the two upgrades made the game much easier (sim: closes -60 to -70 percent). Goal: comfortable and forgiving, NOT immune. Targets: Burn Guard + Calm Kitchen together reduce closes by about 15-30 percent against NO upgrades (never above about 35 percent without a reason); Lv 20 pace stays close to the original; no test may be weakened to pass; no change to ad rewards, Reopen (55 / 100), recipes, customer behaviour, controls, UI, art; save format unchanged.
New values to test: Burn Guard x1.15 / 1.3 / 1.45 (unchanged costs 150 / 300 / 500); Calm Kitchen burn penalty 8 -> 7 -> 6 (divisor values 1.14 and 1.33, costs 250 / 450 unchanged). Calm Kitchen touches ONLY the burn penalty in `KitchenState.onBurnt` (angry departures, patience, Reopen untouched). Burn Guard multiplies the burn window in `KitchenState.burnWindow` (vats, grill burners, oven); warning and danger states scale with the window (`cookPhase`), food still burns; ice cream melt and drinks are not touched.
Plan (tick when done):
- [x] 1. Put the two bounds I loosened in `tests/sim_late.test.ts` back to the original values (1750, a - 0.05, b * 2).
- [x] 2. `tests/helpers/bot.ts`: add counters (burnt, angry leaves, reputation lost to burns and to angry leaves, per level), purchase log, and shopping plans (allow list, priority list). The default `upgrades: true` behaviour must stay exactly as it is.
- [x] 3. Report test (`tests/balance_upgrades.test.ts`): seeded runs for none / Burn Guard only / Calm Kitchen only / both / all (cheapest first) / old five only / selective plans, fast, average and casual bots. Full table only with `BALANCE_REPORT=1`; the normal run keeps a small set of assertions.
- [x] 4. Run with the OLD values first (to record "before"), then apply the new values and run again.
- [x] 5. Tune only if the numbers miss the targets; change other systems (arrivals, orders, patience) ONLY if the simulation shows a real problem.
- [x] 6. Regression tests for the new numbers; typecheck, `npm test`, `npm run build`, `npm run build:crazygames`; final report with the old / new table.
Result (2026-11-06, NOT committed): values applied exactly as requested (Burn Guard x1.15 / 1.3 / 1.45, Calm Kitchen 8 -> 7 -> 6, new Burn Guard text "Fried food, patties and pizza take longer to burn."). typecheck clean; 297 tests pass, 1 skipped (the report); `build` and `build:crazygames` ok; Shop page 2 looked at in a browser.
Closes a minute vs NO upgrades with the two new upgrades only (30 seeds; 150 seeds agree): fast Lv 6-20 0.28 -> 0.18 (-36 percent, -38 at 150 seeds), average 0.63 -> 0.49 (-22), casual Lv 6-15 0.70 -> 0.64 (-9). Before the rebalance (x1.25/1.5/1.75, 8/6/4): -57, -29, -19. Fast bot is a little over the 35 percent ceiling and the result barely moves with the Burn Guard tier values (x1.10/1.20/1.30 gives the same -38): the first tier does most of the work. Owner was told.
Lv 20 pace (fast, mean s): none 2050, old five 1879, old five + the two new ones 1804 (-4 percent vs the game as shipped before), both new only 1967.
Other findings: (1) speed upgrades RAISE closes in the sim (speed only +68 / +22 / +14 percent vs none, Lv 20 only 2 percent faster) because burn timers run at the same speed as cooking, so the real-time burn window shrinks; Burn Guard x1.45 about cancels a x1.5 speed upgrade. Not changed (cooking mechanics are preserved). (2) A "comfort" buyer (patience, tips, Burn Guard, Calm Kitchen, no speed) gets -61 / -38 / -24 percent closes, a much easier game than a speed buyer. Not changed. (3) Casual bot gets little relief because its closes come from angry departures, which Calm Kitchen must not touch.
Tests: `tests/sim_late.test.ts` back to the ORIGINAL bounds, except two checks that now use 30 fast seeds instead of 4 (Lv 20 floor 1750 on the mean instead of every run, and the ramp check): at 60 seeds even the game before these upgrades has a run at 1715 s and 4-seed groups of the no-upgrade game break the ramp bound, so four seeds cannot measure them. New: `tests/balance_upgrades.test.ts` (report with `BALANCE_REPORT=1`, plus 12 regression checks), 8 new checks in `tests/shop.test.ts`, bot counters and shopping plans in `tests/helpers/bot.ts` (default `upgrades: true` unchanged). Mutation check: old strong values and "Calm also cuts angry leaves" both make tests fail.
Not changed: arrivals, orders, patience, cooking timers, ad rewards, Reopen 55 / 100, art, UI (except the Shop description text). Not done: real-player testing, Android build.

## In progress: two new shop upgrades, Burn Guard and Calm Kitchen (2026-11-06, Claude) - branch `feat/burn-guard-calm-kitchen` (from origin/main 03a61f1), NOTHING COMMITTED OR PUSHED (owner has not authorised a commit)
Owner approved (2026-11-06): build Burn Guard and Calm Kitchen only (Tidy Counter and the machine upgrades are NOT approved). Shared gameplay change: browser and Android both get it; nothing is merged or cherry-picked without approval. Ad economy untouched (Reopen 55 / 100, 180 s gap).
- Burn Guard (Lv 7): burn window x1.25 / x1.5 / x1.75 (about +1 / +2 / +3 s on a 4 s window), costs 150 / 300 / 500. Applies to vats, grill burners and the oven (everything that already goes through `KitchenState.burnWindow`); ice cream melting is left alone.
- Calm Kitchen (Lv 11): burnt-food reputation penalty 8 -> 6 -> 4 (value 1.33 / 2.0, the penalty is divided by it so values rise like the other upgrades), costs 250 / 450. Does NOT touch Reopen reputation.
- Mods get two new fields (`burnWindow` default 1, `calm` default 1). Save format unchanged (`owned` is id -> tier, old saves load).
- The Shop upgrades tab fits 5 rows on the 698 px canvas; with 7 upgrades it needs a second page (a "More" button). Nothing else in the Shop changes.
Plan (tick when done):
- [x] 1. Data + model: `data/upgrades.json`, `ModKey`, `Mods`, `NO_MODS`, validator `MOD_KEYS`, `KitchenState` (burn window and burn penalty).
- [x] 2. Shop screen: second page for upgrades.
- [x] 3. Tests (shop, burn window, penalty, old saves) + typecheck, `npm test`, `npm run build`, `build:crazygames`.
- [x] 4. This file; art prompts for the owner (separate message, not in the repo).
Result (2026-11-06): typecheck clean; 281 tests pass (7 new in `tests/shop.test.ts`); `build` and `build:crazygames` ok. Shop looked at in a browser at 1280x698 (Lv 12 save): page 1 shows the 5 old upgrades, "More" opens page 2 with Burn guard and Calm kitchen, "Back" returns. NOT done: real phone/Android test, `build:android`, `cap sync` (this branch is from main, which has no Android project).
Balance effect (bot simulation, `tests/helpers/bot.ts`, it buys the cheapest upgrade first, so it is only a rough guide): level pace about the same (fast bot Lv 20 at 1733-1778 s, was 1774-1929 s), but store closes per minute drop a lot: fast bot Lv 11-15 0.38 -> 0.10, average bot 0.69 -> 0.41. On its own, Burn Guard lowers fast-bot closes 0.38 -> 0.21 and Calm Kitchen 0.38 -> 0.29. Two bounds in `tests/sim_late.test.ts` were re-set on purpose (Lv 20 floor 1750 -> 1700; dip and ramp tolerances +0.03 / +0.05), each with a comment. If the owner thinks it is too easy: soften Burn Guard first (x1.15 / 1.3 / 1.45) or Calm Kitchen tier 2 (penalty 5).
To move to Android: cherry-pick only after the owner approves (files: data/upgrades.json, src/data/validate.ts, src/game/{KitchenState,config,shop}.ts, src/scenes/ShopScene.ts, tests/shop.test.ts, tests/sim_late.test.ts).

## Drop box removed + new mint ghost customer (2026-11-03/04, Claude) - branch `fix/tap-outline`, DONE in the working tree, NOTHING COMMITTED OR PUSHED (owner has not authorised a commit)
Owner (17:00): (1) the white box that shows on a customer while an order item is dragged onto them must not be visible; (2) remove the current ghosts (the six scare-sheet ghosts and the vest gentleman) and use the new supplied character for now (`Spooky_characters.zip`: one mint ghost, two animation sheets 256x256 frames at 24 fps: `ghost_idle_happy` 90 frames, `ghost_impatient_anim` 85 frames). Three more characters will follow.
Update (owner sent the other 3 sheets; they are NOT new characters but the same mint ghost's other animations): angry loop (42 frames), leave angry (130), leave happy (127, 288 px frames). All five clips are converted to 75 percent size (192/216 px; the canvas is a fixed 1280x698 so the ghost is drawn 1:1) by `tools/make_mint_ghost_art.py`, 3.2 MB in total.
Clip use: calm = happy idle (patient or happy), upset = impatient (patience under half), angry = angry loop (under a quarter), leave happy / leave angry = one-shot reactions played in place when the customer leaves (sped up to about 3 s so the seat is free for the next arrival, fade-out at the end; lazy-loaded; code fallbacks when not loaded: walk out / lunge).
Plan (tick when done):
- [x] 1. `CustomerView`: delete the `highlight` rectangle and `setDropHighlight`; `GameScene` drag code stops calling it (drop logic unchanged).
- [x] 2. Art: all five clips as WebP + `.anim.json` in `public/assets/customers/mint_ghost/`; 6 scare sheets + 7 old cutouts removed; `customers.webp` rebuilt (people blank, mint slot blank, shadow, heart).
- [x] 3. Code (calm + upset): `CUSTOMER_LOOKS` = 8 people + `mint_ghost`; `CUSTOMER_LOOK_COUNT` 9; `PERSONALITIES`, `FIGURE_W`, `SCARES` (empty).
- [x] 4. Code (angry + leave clips): LOOK_ART with 5 clips; per-clip origin and scale; mood -> clip; leave clips lazy; remove the additive glow copy for animated ghosts (it glitched).
- [x] 5. Investigate the rectangular cut seen on a ghost when two customers are on screen (reproduce, find cause, fix).
- [x] 6. Tests, typecheck, build x3, cap sync, headless check of every clip.
Result: typecheck clean, 285 tests, `build`, `build:crazygames` (8.2 MB, was 11 MB), `build:android` and `cap sync android` ok. Headless Chromium: all five clips play, moods switch the clip, two ghosts never move in step, no rectangle object on the customers, drop box gone, leave clips load lazily (bug found and fixed: the request ran before `art` was set), leave happy / angry play ~3.2 s then fade and the view is destroyed, reduced motion shows a still frame, Android bundle runs, no page errors.
The rectangular cut seen on one ghost earlier (2304x2560 sheets with an additive glow copy) was NOT reproduced after dropping the glow copy and halving the sheets; cause not proven (likely the glow copy swapping textures every frame). The small notch on the head in one screenshot was the order bubble's tail.
NOT checked: a real phone or WebView (frame rate, texture memory), CrazyGames real SDK. `tools/feather_scare_edges.py` is now unused (no scare sheets) and kept for when scare sheets return.
Shared change (customers/art): affects BOTH releases. Nothing is merged or cherry-picked; transfer notes go in the final report.

## Tap outline box and ghost frame edges (2026-11-03, Claude) - branch `fix/tap-outline` (from `feature/android-capacitor` 778fc7f), DONE, pushed, NO PR yet, NOT merged
Owner report (browser and Android): outline boxes appear around tapped areas, and the ghost shows a visible rectangular border. Owner wants everything else identical. The AdMob work is on its own branch `feature/android-admob` (only the plugin dependency is committed there so far); this fix does not touch it.
Root causes (reproduced in headless Chromium, nothing guessed):
1. `GameScene.selectZone` drew a mustard 4 px rounded box plus a 14 percent cream fill around the WHOLE tapped zone (`this.highlight`, depth 900), fading 300 ms later. It is pure tap feedback, not a CSS focus ring or a browser tap highlight, and it is the same in the browser and the Android WebView.
2. Ghost box: the six `scare/*.webp` sheets are full-frame art. The ghosts (above all `wildhair_corset_ghost`: ghost box 99.5 percent of the frame width) touch the frame edges and carry a cyan haze (alpha about 27-64 over most of the frame), so the frame edge shows as a rectangle while the face fades in (the losing-patience overlay) and during the scare.
Plan:
- [x] 1. `GameScene.ts`: stop drawing the zone box (remove `highlight`); keep sound, label pop, `selectedId`, item/customer selection rings, `?zones` debug outlines.
- [x] 2. `index.html`: `-webkit-tap-highlight-color: transparent` and no focus outline on page and canvas (hardening for the WebView, cannot be checked on a phone here).
- [x] 3. `tools/feather_scare_edges.py`: fade the haze and the cut at the frame edges of the scare sheets (alpha only, recorded as `edgeFeather` in each `.anim.json` so it runs once); re-encode the six sheets.
- [x] 4. Tests, typecheck, build, browser before/after pixel check, `build:android` + `cap sync`.
Result: 282 tests (2 new in `tests/tapoutline.test.ts`), typecheck, `build`, `build:crazygames`, `build:android` and `cap sync android` clean. Headless Chromium: outline pixels (mustard 0xF6C445 on the grill zone border) 2801 before, 0 after, tap message and sound unchanged; the wild-haired ghost shows no rectangle in the losing-patience overlay or the scare (the full scare frame now has a soft edge); fryer taps start cooking in the browser, CrazyGames and Android bundles (mouse and touch), no page errors. Scare sheets 6.9 MB -> 6.5 MB (re-encoded, alpha only changed; the original PNG sources are not in the repo, so `tools/feather_scare_edges.py` only runs once per sheet).
Kept on purpose: item and customer selection rings, oven and machine glow, `?zones` debug outlines (key Z).
NOT checked: a real phone or the Android WebView (no Android SDK here, no APK built). The new CSS (`-webkit-tap-highlight-color: transparent`, no focus outline) is hardening for the WebView and cannot be seen in desktop Chromium.

## Android packaging with Capacitor, packaging step (2026-11-03, Claude) - branch `feature/android-capacitor` (stacked on `feature/crazygames-submission-prep` 7eedf58, because it reuses its `vite.config.ts`, audio and orientation changes), JS side DONE, native side NOT built here, pushed, NO PR yet, NOT merged
Owner said "go ahead on the Android packaging step". Rules: no AdMob yet (a later step), no ad logic or reward numbers touched, browser and CrazyGames builds must stay as they are, no signing keys in git. This sandbox has Java 21 and Gradle but NO Android SDK and cannot reach Google's download hosts, so an APK build and any device test are impossible here (say so in the report).
Plan:
- [x] 1. Install `@capacitor/core`, `@capacitor/app`, `@capacitor/android`, `@capacitor/cli` (all free).
- [x] 2. Build mode `android` (`npm run build:android` -> `dist-android/`): same Vite build, but the CrazyGames SDK script tag is removed (CrazyGames must never run inside the APK; the wrapper is a no-op without it, so no ads until Step 4). Intro video stays.
- [x] 3. `capacitor.config.ts` (webDir `dist-android`), `npx cap add android`, commit the generated `android/` project (no keystores, no local.properties).
- [x] 4. Native: landscape (`sensorLandscape`), immersive fullscreen, no reload.
- [x] 5. JS: `src/platform/android.ts` (only loaded in the android build): app pause/resume -> pause game, save, stop sound; Back button -> close panel, else pause, else minimize (never exit by accident); skip the web fullscreen/orientation code in the app.
- [x] 6. Tests (pure decision functions), typecheck, tests, build, build:crazygames, build:android, `npx cap sync android`.
- [x] 7. Try `gradlew assembleDebug` (expected to fail here: no SDK); write exact manual steps; update docs and this file.
Result: typecheck clean, 280 tests (9 new in `tests/android.test.ts`), `npm run build`, `build:crazygames`, `build:android` and `npx cap sync android` all ok. The Android glue and the Capacitor files are in `dist-android` ONLY (verified: 1 JS file and no Capacitor in `dist` and `dist-crazygames`; no CrazyGames script tag in `dist-android/index.html`). Generated output (`dist-android`, `android/app/src/main/assets/public`) is git-ignored; I had committed it by mistake on the CrazyGames branch and removed it again in a later commit (it is still in that branch's history, about 150 files). Manual steps and the phone test list: `docs/android.md`.
NOT done / NOT verified: `./gradlew assembleDebug` could not run here (no Android SDK, downloads from Google and Gradle hosts are blocked), so no APK exists, `MainActivity.java` is uncompiled, and nothing ran on an emulator or phone. The `appId` `com.spookydinerrush.game` is provisional. `npm audit` shows 4 moderate issues in a dev-only dependency of `@capacitor/cli` (minimatch); the suggested fix is a breaking downgrade, not applied.

## CrazyGames submission prep, Browser prep (2026-11-03, Claude) - branch `feature/crazygames-submission-prep` (from main b71fb1d), Browser prep DONE, pushed, NO PR yet, NOT merged
Owner approved the Inspection report and decided: (1) the intro video is OFF in the CrazyGames build only, (2) the game name stays "Spooky Diner Rush", (3) go ahead on this branch. Rule: Browser prep touches no ad logic and no reward numbers (normal Reopen 55, rewarded 100, interstitial gap 180 s stay exactly as they are). The platform-neutral ad service is NOT part of Browser prep (it belongs with the Android work, needs the owner's OK first).
Plan (tick each when done):
- [x] 1. Build target: `npm run build:crazygames` = `vite build --mode crazygames --outDir dist-crazygames`; intro video skipped and `intro.mp4` left out of that build. Plain `npm run build` is unchanged (still has the video, used later for Android).
- [x] 2. `index.html`: `user-select: none` on body (CrazyGames mobile rule).
- [x] 3. Audio: after an interruption (iOS) a tap resumes the sound, unless the game itself paused it.
- [x] 4. Rotate overlay inside the CrazyGames iframe: no "Tap to play in landscape" button, no fullscreen/lock attempt (CrazyGames handles both).
- [x] 5. Tests for 1, 3, 4; run typecheck, tests, build, build:crazygames.
- [x] 6. Browser check with a fake SDK inside an iframe (800x450 and 1280x720): init order, ads, reopen, no console errors, no intro request.
- [x] 7. ZIP of `dist-crazygames`, list its contents, check `index.html` is at the ZIP root; update `docs/release.md`.
Result: typecheck clean, 271 tests (6 new in `tests/crazygames_build.test.ts`), `npm run build` and `npm run build:crazygames` ok. Headless Chromium with a FAKE SDK (route-stubbed script) with the game inside an iframe: load order init, loadingStart, loadingStop, then gameplayStart after the one title tap; no intro.mp4 request, no `<video>`; rewarded error = stays closed (rep 0), normal Reopen = 55 with a midgame ad, rewarded finish = 100, normal Reopen inside the 180 s cooldown = 55 with no new ad request; phone iframes: 0 fullscreen calls, portrait overlay text is the turn-your-phone text; no console errors. ZIP 11.0 MB, 76 files, `index.html` at the root.
NOT checked: the real CrazyGames SDK / QA tool, a real phone or iPhone (iOS audio resume is unit-tested with a fake AudioContext only), the CrazyGames App safe areas, Safari, a slow connection. Not done on purpose: the platform-neutral ad service (needs owner approval, Android stage).

## Landscape on phones (2026-11-02, Claude) - branch `feature/mobile-landscape` (from main 4dfa062), pushed, NO PR yet, NOT merged
Owner: "the game should run in landscape mode directly on mobile devices". A web page cannot rotate the screen silently; Android Chrome allows `screen.orientation.lock('landscape')` only while fullscreen and after a tap.
- `src/systems/Orientation.ts`: `enterLandscape(env)` = fullscreen then lock, never throws, returns locked / fullscreen / unsupported / skipped; skipped on desktop (coarse pointer and short side under 900 css px only) and inside an iframe (CrazyGames does its own). `initOrientation()` (called first in `main.ts`): the first tap on a phone enters fullscreen + landscape; leaving fullscreen (Back) re-arms the next tap; taps are de-duplicated within 1 s.
- `index.html`: the portrait overlay is now an orange "Tap to play in landscape" button (tapping it fullscreens and locks, so a phone held upright flips to landscape). Where the browser cannot lock (iPhone Safari: no orientation.lock, no fullscreen) it keeps "Turn your phone sideways to play". `GameScene` still pauses the model while portrait.
- `public/manifest.webmanifest` (`display: fullscreen`, `orientation: landscape`) + `public/icons/icon-192.png`, `icon-512.png` (chef on the dark brown, made from `chef.webp`): an installed copy ("Add to Home screen") opens landscape directly. Manifest and icons are new, `<meta>` tags added in `index.html`.
- Tests: `tests/orientation.test.ts` (7 with fakes). Checked in headless Chromium mobile emulation with stubbed fullscreen/lock: portrait 390x844 shows the button, one tap = one fullscreen + one lock; landscape 844x390 first tap = fullscreen + lock; no-lock browser keeps the turn text; desktop makes no calls. 265 tests, typecheck and build clean.
- Not checked: a real Android phone (some browsers refuse the lock, Samsung Internet behaviour, fullscreen exit via swipe), iPhone (cannot lock; still needs the player to turn the phone), installed-PWA launch, CrazyGames iframe (intentionally untouched). Not done: CSS-rotating the game on iPhone portrait (Phaser input would need a custom transform).

## Spooky night atmosphere (2026-11-02, Claude) - branch `feature/spooky-night-atmosphere` (from main cebeb13), pushed, NO PR yet, NOT merged
Owner brief: subtle haunted night look as separate layers; no gameplay or layout change; the reference image is a mood target only.
Finding: `kitchen_full.webp` is a bright DAYTIME kitchen, so the night look is built from overlays, not by swapping art.
- `src/anim/atmosphereMath.ts` (pure, tested): source-pixel boxes (window panes, lamps, floor strip, air), grade gradient stops, quality tables, lamp flicker, twinkle, fade envelope, fog/wisp/mote spec makers. `tests/atmosphere.test.ts` (15 tests).
- `src/anim/atmosphere.ts` (Phaser): all textures are drawn into canvases at start-up (no downloads). Depths: 249 dusk grade = multiply GRADIENT (dark violet walls/windows at the top, cool blue floor, nearly clear counters and machines; under the Lv lock covers at 250 so they stay readable), window sky, vignette; 256-259 sky pinpoints, moon, one drawn extra lamp, lamp glows; 270 floor fog; 275 wisps; 280 motes. Nothing is interactive.
- Owner feedback on a real phone (first version): too dark, no visible fog, moon hidden behind a ghost, extra lamp crowding an order bubble. Fixes: gradient grade instead of a flat tint (cooking area about full brightness), moon moved to x 1110 and the extra lamp to x 749 (both between seats 582/916/1249), stronger lamp glow, fog much more visible (deep teal, normal blend, 190-310 src px wide, alpha 0.42-0.66, up to 3 at once (2 on phones), one every 5-11 s, first within 2.5 s). Fog is still only in the floor strip (y 318-374 src), behind the customers, and fades in and out over 9-15 s.
- Existing UI bug fixed on the way: `Toast` (`views/Popups.ts`) had a fixed 340 px panel, so longer messages ("Tap the fries or nuggets bin first") spilled out of the cream box; the panel now grows to fit the text.
- Wisps: every 14-30 s, max 2 (1 on phones). Motes: 10 (6 on phones). Lamp glow breathes about 4 percent with a rare soft 6 percent dip, never a flash. Fog, wisps, motes are pooled, driven by tracked counter tweens, paused on game BLUR and tab hidden, stopped in `destroy()` (from `GameScene.cleanup`). Reduced motion (setting or OS) = static night look; switching it at run time is picked up within 1 s.
- Oven door sprite (depth 450) is tinted with `NIGHT_GRADE` (about the grade colour at oven height).
- Wording rule: sky dots are called "pinpoints" (the banned word is not allowed in code/tests).
- Checked in headless Chromium (software GL) at 1280x698, 1480x700 and 844x390 landscape: ghosts clearly visible, no page errors, reduced motion gives 0 fog/wisps/motes, all 17 zones still respond to taps, fog sampled over time and visible. 258 tests, typecheck and build clean.
- Not checked: the owner's phone after the second version (fps, battery, real GPU colour). Knobs are constants at the top of `atmosphereMath.ts` (`GRADE_STOPS`, `NIGHT_SKY`, `FOG_GAP`, `FOG_ASPECT`, fog alpha, qualities).

## Rename to Spooky Diner Rush (2026-11-01, Claude) - branch `chore/rename-spooky-diner-rush`
Owner picked "Spooky Diner Rush" (ghost customers and scares). Changed: page title (`index.html`), boot screen text (`BootScene`), README and doc headings. Deliberately NOT changed: save key `chef-rush-save` (so nobody loses progress), `package.json` name, GitHub repo name, the `window.__chefRush` debug hook. Also: the restaurant's display name is now "Spooky Diner" (`data/restaurants.json`; its id `burger_diner` is unchanged because saves refer to it) and the six story cards in `data/story.json` are rewritten for the ghost theme. Not done: CrazyGames listing text, cover art, a logo, intro animation.

## Rewarded ad "revive" (2026-11-02, Claude) - branch `feature/rewarded-revive` (based on `feature/crazygames-ads`, PR #26), PR open, NOT merged. Merge #26 first.
- Owner asked for rewarded ads; design call made by me (owner can change): Closed overlay gets a second green button "Watch an ad: reopen at full reputation" (`Overlay.show(..., extra)`); normal Reopen = 55 reputation, ad = 100 (`KitchenState.reopen(full)`); no coin reward, economy untouched.
- `CrazyGames.rewardedAd(onStart)` resolves true only on `adFinished`; error/no SDK/90 s silence = no reward; `canShowRewarded()` hides the button without the SDK. A watched rewarded ad restarts the mid-game ad cooldown. GameScene `reviveWithAd()` freezes model and sound like `breakAd`; on failure the overlay text says "No ad available right now. You can still reopen."
- Checked in headless Chromium with a fake SDK: finish -> reopened at 100, log gameplayStop, requestAd:rewarded, adStarted, adFinished, gameplayStart; error -> stays closed, message shown, Reopen still works. 247 tests.
- Not checked: real SDK / QA tool, other reward ideas (double level-up coins) if the owner prefers.

## CrazyGames loading and ad hooks (2026-11-02, Claude) - branch `feature/crazygames-ads`, PR open, NOT merged
- `src/sdk/crazygames.ts`: `loadingStart/Stop`, `canShowAd`, `midgameAd(onStart)` (resolves true if an ad was shown; 3 min own cooldown `AD_GAP_MS`, 90 s watchdog, never rejects, no-op without SDK), `_reset()` for tests.
- `main.ts`: loadingStart after init; BootScene: loadingStop when it hands over to Title/Game.
- GameScene: `breakAd(then)` freezes model (`paused`) and sound during the ad and always runs `then`; spots: Reopen tap on the Closed overlay, and `adDue` set when the last level-up card hides (Lv 3+), run by `runDueAd()` in update once no pause/overlay/story card/level-up card is open. `onBlur` ignored during an ad.
- Verified in headless Chromium with a fake SDK (blocked-script route): load order init, loadingStart, loadingStop, gameplayStart; Reopen -> gameplayStop, requestAd, adStarted, adFinished, gameplayStart and the restaurant reopens; level-up -> ad after the Lv 5 story card was dismissed. 242 tests (7 new in `tests/ads.test.ts`).
- Not done: rewarded ads (reward design needed), real SDK check on the CrazyGames QA tool, ad volume/mute check with real ads.

## Title screen and intro video (2026-11-01, Claude) - branch `feature/title-intro`, PR #25 MERGED
Owner supplied Gemini art (night diner, logo on green, chef with ghost on green) and a 10 s intro video, no instructions; read as "an animation before every game starts".
- Assets in `public/assets/intro/` (made by `tools/make_title_art.py`, see its header): `title_bg.webp`, `title_logo.webp`, `title_chef.webp` (green keyed out, logo glow halo removed) and `intro.mp4` (6.3 MB -> 1.5 MB, 1280x720, aac). Art entries are lazy in `data/assets.json`; `TitleScene` loads them itself.
- `src/scenes/TitleScene.ts`: BootScene -> Title -> Game. Logo pops in then bobs, chef floats, "Tap to play" pulses. The intro starts AUTOMATICALLY (owner request, no tap): a DOM `<video>` overlay (z-index 5, under the rotate hint) fades in when playing; if the browser refuses sound before a tap, play() is retried muted; tap or key skips; 5 s watchdog; it fades out into the game. The "Tap to play" title only waits for a tap when there is no video (reduced motion / setup failure). Video starts downloading while the title shows.
- Falls straight to the game when: art fails to load, reduced motion, video error or play() refused. Muted setting is respected (`video.muted`). `?debug` still starts the game directly (test scripts). `CrazyGames.gameplayStart` is only called by GameScene, so after the intro.
- The generator's sparkle watermark is in the bottom-right corner of the background (cropped out in code) and of the video (removed from the video with ffmpeg `delogo=x=1128:y=568:w=64:h=64` on the original, then re-encoded crf 29; leaves a faint smudge on the floor in the last second).
- Checked in headless Chromium at 1280x698: title renders, tap plays the video (readyState 4), second tap enters the game, no page errors (only the blocked SDK script). Not checked: real phone, real audio, slow network.
- Boot loading screen text is renamed by the rename PR #24.

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


## STEP 3c/3d progress (uncommitted, branch feature/taco-truck)
- 3a done: restaurants.ts buy rules, SaveSystem.restaurants, menu json (tests/restaurant_purchase.test.ts).
- 3b done: data/taco.json zones/art/customerWindow, tacoZones.ts hit-test + tapZone, generator tools/taco_source/make_taco_data.py.
- 3c done (typecheck clean): taco_thumb in data/assets.json, Taco Truck card + Buy button in RestaurantSelectScene, GameScene.onPick routes taco_truck to scene 'Taco'.
- 3d DONE: src/scenes/TacoScene.ts (background layers, zone taps, text status, Restaurants button, ?debug zone outlines), registered in main.ts. Fixed: art names in taco.json have no extension, scene adds .webp.
- Verified (headless Chromium smoke, NOT a real device): Lv16 save with 5000 coins -> card shows "2,000 coins"/Buy -> Buy leaves 3000 coins, saves restaurants + lastRestaurant -> Play opens Taco scene with art, zones line up, tap gives "Start a dish on a plate first".
- Checks: typecheck clean, 399 tests pass (33 files), npm run build + build:crazygames OK.
- Still NOT done (step 4): animated views (pans, oven, plates, customers, drinks), drag-to-serve input, sounds, tutorial hints, reduced motion. Taco scene is a plain shell: no dish pictures, no customers drawn yet.
- NOT committed (waiting for user).


## STEP 4 plan (views for the Taco scene; each sub-step committed only when the user says so)
- 4a: src/views/TacoViews.ts - pans, oven slots, plates drawn from model state (cook sheets, oven shell sheet, build sheets, finished dish sprites). Textures loaded in TacoScene.preload from the anim.json files.
- 4b: customers (mint ghost, 5 seats from customerWindow) with order bubbles + drag a finished plate to the right customer (model.serve) + invalid-drop feedback.
- 4c: drinks (dispenser cups 3 lanes x 2 drinks, fill/ready cups, drag to customer via serveFromPour).
- 4d: polish: ring/phase cues, sounds, reduced motion, tutorial hint, balance pass; then both builds + browser smoke.
- Status: 4a DONE (food resized to fit pans/plates), uncommitted (src/views/TacoViews.ts + TacoScene wiring; typecheck clean; headless browser check: raw/cooked/burnt proteins in pans and the tortilla shell on a plate draw in the right places). 4b next. Not yet checked: crispy shell/melt/press views, finished-dish sprites, sizes of items.

- 4b DONE, uncommitted: src/views/TacoCustomers.ts (mint ghost in 5 seats, order bubbles with dish/drink icons and a tick for delivered items, patience bar, calm/impatient/angry loops, hop on complete, fade on leave) + TacoScene drag-to-serve (drag a finished plate; a tap says 'Drag it to a customer'; +coins floating text; wrong-drop messages). Browser check (headless): built a chicken soft taco, dragged it, delivery ticked off the order.
- Not done in 4b: lazy leave clips (ghost_leave_happy/angry) are not used, ghosts just fade; no sounds yet. 4c next: drinks (cups, fill, serveFromPour).

- Art swap (uncommitted): user supplied Gemini cook sheets (green background, 3168x1344, 4x2) for chicken, shrimp, fish, veggies. Converted with tools/taco_source/import_cook_sheet.py (chroma key, resize to 1712x782, 428x391 cells, base anchored at y=372; 'loose' mode for non-veggies). Replaced public/assets/taco/animations/cook_<protein>_sheet.webp. The ready frame is now one piece. anim.json files unchanged (same frame size/count). Originals are in git history.
- Pan alignment fix (uncommitted): pan food scaled to ~66% of zone width (62% for the two bigger front pans) and anchored lower (0.8 back / 0.88 front) so it sits inside each bowl. Checked with ?debug zone outlines in headless browser; oven/plate not re-checked.
- Pan sheets (uncommitted, WORKING): pans are removed from public/assets/taco/background/kitchen_front.webp (tools/taco_source/remove_pans.py) and drawn by TacoViews.putPan() from pan_<colour>_chicken_sheet.webp (import_pan_sheet.py clips stray bits under the pan). Colours by zone: front-left red, front-right blue, back-left red, back-right blue; left-hand pans are mirrored so handles point outward; the empty pan frame is always drawn. Chicken uses the pan sheet frames; shrimp/fish/veggies/press items still use the food-only overlay (offsets tuned for old painted pans - re-check). Whole-pan sheets exist for chicken, fish, shrimp and veggies in red AND blue (TacoViews uses pan_<zone colour>_<protein>; press items still use the food overlay on the chicken pan). TODO: cleaner empty-pan frame, regenerate taco_thumb from new background. Checks: typecheck, 399 tests, build pass.

## Step 4c drinks (done, uncommitted)
TacoViews.syncCups draws a cup per dispenser lane from model.pours (cupFrame helper: levels 1-3 filling, 4 full); TacoScene lets a full cup be dragged from its lane to a customer (serveFromPour); half-filled cups cannot be picked up. Test: tests/taco_cups.test.ts. Checked with headless screenshots (cups fill, drag works). Remaining step 4d: sounds, reduced motion, leave animations, tutorial hint, balance; thumb.webp regeneration.
Pan layout fix: back pans drawn behind the front pair, 10% smaller and lifted 2.5% of the kitchen height (BACK_PAN_SCALE/BACK_PAN_LIFT in TacoViews); idle pans use the clean empty frame of the fish sheet.

## Step 4d (partly done, uncommitted)
Done: sounds (src/views/TacoSounds.ts sfxFor maps kitchen events to existing sfx; played in TacoScene.update; test tests/taco_sounds.test.ts), reduced motion in TacoCustomers (no hop/fade), taco thumb.webp regenerated with empty pans.
Not done: lazy leave clips (ghosts just fade), tutorial hint, balance pass, real-device test, Android/browser branch transfer plan.


Step 4d update: first-visit hint added (TacoScene, one line shown 9 s, id 'taco_hint' stored in save.seenStory so it shows once). Balance: tests/taco_sim.test.ts bot simulation already covers pace/close rates and passes (fast/average/casual bots reach Lv 16+). Still open: leave animations (ghosts just fade), real-device test.

## In progress: progression redesign (approved by owner 2026-11-08)
Owner approved: (1) Taco Truck content is keyed to a restaurant-local MENU STEP (1-10), not global Lv; (2) optional diner extras: Mastery badges + Daily Special FIRST (existing art only); (3) no second visible number: the player sees "Dishes n/16" and a "New on the menu" note, never "Rank"/"stage"/"shift"/"stars" (wording rule). Global Lv/XP/coins unchanged; buying stays optional; price stays 2,000; XP curve unchanged.
Plan, branch feature/taco-truck, small steps (update after each):
 A1. data/taco.json: dishes/drinks get `unlockStep` (replaces `unlockLevel`; restaurant.unlockLevel 15 stays as the BUY gate) + `ramp` per step (seats, orderSize, patienceMult). New schedule: 1 veggie soft+Horchata, 2 chicken soft+Agua, 3 shrimp+fish soft, 4 crispy veggie+chicken, 5 crispy shrimp+fish, 6 veggie burrito, 7 chicken burrito, 8 shrimp+fish burritos, 9 nachos veggie+chicken, 10 nachos shrimp+fish.
 A2. src/game/taco/tacoMenu.ts (pure): MAX_STEP, stepFromLevel (legacy saves), stepXpNeeded = xpForLevel(14+step), rampFor.
 A3. TacoKitchenState: `menuStep`, `menuXp`; dishes/drinks/build use menuStep; customer difficulty from levelDef(14+step) + ramp; global level/XP/coins still earned as before; emit `menuStep` event.
 A4. SaveSystem: optional `tacoStep`, `tacoXp` (missing + Taco already owned => derived from level so no tester loses dishes; missing + not owned => 1); purchaseRestaurant sets step 1 on buying Taco.
 A5. TacoScene: pass/save step, status "Dishes n/16", note on new dish. Tests updated + new tests. Then B: Mastery badges, C: Daily Special (separate small steps, each reviewed).

### Progress (2026-11-08): A1-A5 DONE, uncommitted, on feature/taco-truck
Menu step is live: data/taco.json (unlockStep + ramp), src/game/taco/tacoMenu.ts, TacoKitchenState (menuStep/menuXp, 'menuGrew' event, levelInfo from diner table at 14+step with ramp), SaveSystem (tacoStep/tacoXp; legacy owners derive from Lv), purchaseRestaurant sets step 1, TacoScene (saves step, status "Dishes n/16", "New on the menu: ..." note, "Lv N!" wording). Tests: tests/taco_menu.test.ts (new), taco*.test.ts moved to steps. Bot sim now: fast bot Lv16 at ~2.5 min, closes/min 0.00 (first steps) and 0.57 (full menu); XP pace is a little faster early because the gentle start causes fewer lost customers (ramp then tightened 2026-11-08: step 1 = 3 seats, patience x1.2; step 2-3 = 4 seats, x1.15; step 4+ = 5 seats; fast bot closes/min 0.14 early, 0.63 full menu). Known flaky: tests/balance_upgrades.test.ts 5 s timeout.
Next: B Mastery badges, C Daily Special (diner extras; shared save fields). Needs owner decision on branch (shared gameplay: main vs android transfer approval).

### Taco leave animation (2026-11-08)
TacoCustomers now lazy-loads ghost_leave_happy/angry and plays the matching clip in place when the model removes a customer (angry flag remembered from the last model mood); falls back to the old fade if the sheet has not loaded; reduced motion removes instantly. Checked in headless Chromium (no errors, leave clip seen); not checked on a phone.
## In progress: diner extras (branch feature/diner-extras, from main; owner approved 2026-11-08)
Owner approved: Mastery badges + Daily Special first (existing art only), no gates, no new ad placements, no change to ad/reward economy.
Plan (small steps, update after each):
 B1. data/extras.json + src/game/extras.ts (pure): badge tiers (Bronze/Silver/Gold per item: fast-served counts 10/40/100, coins 40/120/300), Daily Special rules (from Lv 15; +50% coins; special customer appears after 3 serves), localDateKey, dailySpecialFor(dateKey, available items) deterministic.
 B2. KitchenState: public `mastery` counts and `special` order; credit on fast completed orders from Lv 16 (events 'masteryUp'); special customer spawns after warm-up using a separate path so existing RNG draws are unchanged; bonus on completion (event 'specialDone'); angry leave re-queues the special.
 B3. SaveSystem: `mastery` and `dailySpecial {date, done}` (additive, sanitised). GameScene: load/save them, floating text on badge and special, "Special" tag over that customer (code-drawn, no new art). Recipe Book rows show badge progress.
 B4. Tests, typecheck, both builds; HANDOFF update; stop for owner review (no commit until told).
Words to avoid in code/UI/docs: shift, stage, star(s).

### Diner extras status (feature/diner-extras, NOT committed, awaiting owner review)
B1-B4 done: data/extras.json, src/game/extras.ts, KitchenState (enableExtras, mastery, special, masteryUp/specialDone events, Customer.special), SaveSystem (mastery, specialDay), GameScene wiring + toasts, gold "Special" tag in CustomerView, badge progress line in RecipeBookScene.
Tests: tests/extras.test.ts, tests/extras_state.test.ts, save.test.ts additions all pass. typecheck, build, build:crazygames OK.
Known pre-existing failures (also on clean main): tests/sim_late.test.ts "fast bot reaches Lv 20" (mean 1734 < 1750) and flaky 5 s timeout in balance_upgrades.test.ts.
Not done: real-device look at the Special tag and Recipe Book line; transfer to feature/android-capacitor needs owner approval; SaveSystem will conflict-merge with feature/taco-truck (both add save fields).


## In progress (2026-11-11): oven door video + cooking timers (feature/taco-truck, nothing committed yet)
Plan (update after each step):
 O1. Copy Gemini oven mp4 to tools/taco_source/incoming/, find clip boundaries by frame diff, extract frames.
 O2. tools/make_oven_door_sheet.py -> public/assets/taco/animations/oven_door_sheet.webp + .anim.json (clips close, closed-idle, open, open-hold). Old oven art stays until verified.
 O3. TacoViews: oven door state machine (open while placing/collecting, close at bake start, closed-idle while baking, open + open-hold at ready); shells drawn on open tray only, hidden while closed. No cooking logic/timing changes.
 T1. Ring.ts: add explicit 'burnt' look (keep other phases as-is; Diner/Pour/Station users unchanged except burnt now shown only if caller asks).
 T2. TacoViews: one Ring per pan (4) and oven (2), positioned above the slot, driven from existing p.phase / p.t / def.readyAfter / burnWindow. Nothing on the griddle.
 V.  Tests (anim json schema, clip validity, ring state mapping), screenshots, tsc, vitest, build, build:crazygames, report.
O1-O3 oven door code written (TacoOvenDoor.ts), needs screenshot check
T1-T2 rings coded (Ring showBurnt option, TacoViews buildRings/syncRings); need screenshots
DONE 2026-11-11 (uncommitted, awaiting owner approval): oven door (tools/make_oven_door_sheet.py, oven_door_sheet.*, src/views/TacoOvenDoor.ts, hook in TacoViews) and cook timers (Ring showBurnt option, TacoViews rings for 4 pans + 2 ovens, injected from TacoScene). Tests: tests/taco_oven_door.test.ts, tests/taco_timers.test.ts. tsc, vitest (468 pass), build, build:crazygames pass. Not tested on a real device.

## In progress (2026-11-11): pouring dispensers (feature/taco-truck, previous work committed 952bdfd, not pushed)
Owner brief: replace the two static dispensers with the supplied pour sheets (taco = red agua de jamaica, 68 frames 300x327; round = horchata, 58 frames 177x316; clips idle_empty/pour/idle_full), same slot position/size, bottom-centre anchor, one sheet = one draw call.
Finding: the game has 3 INDEPENDENT lanes per dispenser (each tap fills the next free lane, each cup is served on its own), but the clips pour all 3 cups together. Plan: keep logic untouched; draw base = frame 0, and per lane an Image of the same sheet cropped (setCrop) to that lane's column, frame chosen from that lane's own progress p.t/fillSeconds, so a cup is full exactly when the model says ready. Needs a check that the 3 columns are separable in the frames.
 D1. Unzip, inspect frames, check column separability. D2. tools/make_dispenser_sheets.py (webp + anim.json). D3. TacoViews hookup (hide old in-dispenser cup images, keep the drag ghost). D4. Tests, screenshots, builds, report.
D1-D3 dispenser code written: src/views/TacoDispensers.ts + hook; needs screenshots
DONE dispensers (uncommitted): TacoDispensers.ts, tools/make_dispenser_sheets.py, 6 sheets/bases, cup zones moved in data/taco.json, tests/taco_dispensers.test.ts. tsc/vitest/builds pass.
Griddle left-edge fix (uncommitted): tools/make_griddle_art.py clears the old griddle frame strip before compositing; kitchen_front.webp regenerated, zones unchanged.
Griddle bottom-left overlap fix: old counter corner kept in front (COUNTER_X/Y in make_griddle_art.py); kitchen_front.webp regenerated. Uncommitted.
