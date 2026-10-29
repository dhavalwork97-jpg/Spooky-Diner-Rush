# HANDOFF

Last saved by: Claude (Sonnet 5.5), session 2026-10-29
Last saved at: 2026-10-29 11:58 IST

## Goal
Chef Rush: a browser restaurant game (serve customers, fryer/grill/oven, coins, XP, levels) for CrazyGames. Built in milestones, one PR each; Milestone 3 is done, **Milestone 4 (shop and progression systems) is the active task** on branch `milestone-4`.

## Project notes for a newcomer

### Run and test commands
Run from the repo root. Node and npm only; no other tooling.
- `npm ci` (or `npm install`): install dependencies.
- `npm run dev`: Vite dev server. URL flags: `?debug&level=N&speed=N` (jump to level N, run the model at N x speed, max 20; flags only apply with `debug`), `?zones` or key Z (outline every tap zone).
- `npm test`: Vitest, 4 files, 77 tests, about 2 s. Must stay green.
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
- `milestone-4` is branched from `milestone-3-core-systems` (PR #5, targets main, not merged yet), so `main` lacks Milestone 3 and the handoff files. Do not rebase onto or merge `main` without the owner's say.
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
- [ ] 11. Verification: `npm test`, `npm run typecheck`, `npm run build`; browser run at 1280x720 and 844x390 touch (buy an upgrade and see the effect, open each scene, story card once, chef bubble, reduced motion); report what was and was not seen. Open the Milestone 4 PR (base: `milestone-3-core-systems` because PR #5 is unmerged; confirm with the owner).

Assumptions to confirm with the owner: upgrade tiers and prices; decor is cosmetic only; Taco restaurant is locked, not playable; PR base branch; the start flow stays Boot -> Game (menus reached from the HUD).

## In progress (exact stopping point)
- **Milestone 4 is the active task** (branch `milestone-4`).
- Step 0 done: "Project notes for a newcomer" written and pushed. Plan written and pushed (b7fe37c).
- Step 1 done (3d5408e): `SaveData` is version 2 in `src/systems/SaveSystem.ts` (new fields `owned`, `decor`, `seenStory`, `lastRestaurant`; v1 saves load with defaults). `GameScene` only writes level, xp and coins into `SaveSystem.data`, so the new fields survive its saves.
- Step 2 done: `data/upgrades.json` (5 upgrades x 3 tiers: fryer_speed, grill_speed, oven_speed, patience, tips; `value` is the resulting multiplier, not an increment), `UpgradeDef`/`ModKey` types and `upgrades` in `GameConfig`/`defaultConfig` (`src/game/config.ts`), pure `src/game/shop.ts` (`canBuy`, `buy`, `modsFor`, `tierOf`, `nextTier`, `NO_MODS`), `validateUpgrades` in `src/data/validate.ts` (called in `BootScene.preload`), and `GameScene.create` sets `this.state.mods = modsFor(...)` from `save.owned` right after the model is built. `npm test`: 98 pass (77 old unchanged). Typecheck and build clean.
- Step 3 done: `data/career.json` (8 bands: Fry Cook Lv 1, Line Cook 3, Grill Cook 6, Sous Chef 10, Head Chef 15, Kitchen Boss 20, Master Chef 30, Legend of the Line 40), `CareerTitle` and `career` in `GameConfig`, pure `src/game/career.ts` (`titleForLevel`, `nextTitle`, `titleEarnedAt`), `validateCareer` (called in `BootScene.preload`). The level-up card (`LevelUpCard.show` in `src/views/Popups.ts`) takes an optional 4th arg `title` and prints "New title: X" when `GameScene` (case `'levelUp'`) finds `titleEarnedAt(...)`. The model and its events were not changed. `npm test`: 106 pass (77 old unchanged). Typecheck and build clean.
- Risk to check in the browser (Step 11): the level-up card is 210 px tall; with a title line plus two unlock lines the text may touch the "Lv N!" heading.
- Step 4a done (e1ed2cf): `data/chef.json` (cooldown 8 s, per-trigger cooldown 25 s, hold 3.5 s; triggers first_serve (once), rush, combo, burn, angry, event, level_up (priority), idle), `ChefConfig`/`ChefTrigger` and `chef` in `GameConfig`, pure `src/game/chef.ts` (`ChefTalk.onEvent(e, now)` / `ChefTalk.say(trigger, now)`; `now` is model seconds, `state.clock`), `validateChef` (called in `BootScene.preload`).
- Step 4b done: `src/views/ChefBubble.ts` (chef art 130 source px wide on the cream strip right of the grill, bubble on the floor band above the grill; no input, so taps pass through; no fade when reduced motion). `data/assets.json`: `chef` is no longer lazy. `GameScene`: creates `ChefBubble` and `ChefTalk`, calls `sayChef(chefTalk.onEvent(e, clock))` at the top of `handle(e)`, idle tip after 45 model seconds of quiet (`CHEF_IDLE_AFTER`), no speech while paused or closed. Debug hooks: `__chefRush.chef()` (current text or empty) and `__chefRush.chefSay(trigger)`.
- Verified for step 4 (Chromium headless, production build via `vite preview`): at 1280x720 and 844x390 touch the chef and bubble sit clear of every zone outline (`?zones`), the longest line wraps to two lines and stays on screen, a real `eventStart` and the idle tip make the chef speak, and the bubble hides after its hold; with reduced motion the same checks pass; no page errors. `npm test`: 119 pass (77 old unchanged). Typecheck and build clean. A 404 for a resource was logged once (most likely the automatic favicon request; `index.html` has no icon; not from this work).
- Not verified for step 4: wording and timing feel with a human player; real phone text size (bubble text is 22 logical px, about 12 css px on an 844 px phone, same small-text issue as the HUD).
- Step 5 done: `data/story.json` (6 cards: intro Lv 1, word_spreads 3, pizza_oven 5, sous_chef 10, head_chef 15, kitchen_boss 20), `StoryCardDef`/`story` in `GameConfig`, pure `src/game/story.ts` (`dueStory(cfg, level, seen)` returns the highest-level unseen card reached; `seenAfter` marks it and all lower cards seen, so a returning player sees one card, not a pile), `validateStory` (called in `BootScene.preload`), `StoryCard` in `src/views/Popups.ts` (full-screen dim blocks taps, chef art, Continue button, Enter or Space also close, 700 ms input delay). `GameScene.maybeShowStory()` runs each frame: it waits for the level-up card, overlays, pause and Closed, saves `SaveSystem.data.seenStory`, hides the corner chef while the card shows, and the model does not advance while the card is up. Debug hook: `__chefRush.story()` returns the showing card id or empty.
- Verified for step 5 (Chromium headless, production build): fresh save shows `intro`; model clock frozen while the card is up; a tap on a kitchen zone through the card selects nothing; Enter closes it; model resumes; `seenStory` saved; no card after reload; `?debug&level=3` shows `word_spreads`; Lv 9 to 10 shows the level-up card first (with "New title: Sous Chef"), then `sous_chef`; the Lv 3 level-up card with title plus one unlock line fits (3 lines); phone 844x390 touch with reduced motion shows the card; no page errors. `npm test`: 129 pass (77 old unchanged). Typecheck and build clean.
- Not verified for step 5: clicking the Continue button itself with a real mouse or touch (only Enter was used), card text size on a real phone.
- Step 6 done: `src/scenes/ShopScene.ts` (scene key `Shop`, registered in `src/main.ts`), pure `buyLabel` added to `src/game/shop.ts` (1 new test). `GameScene.openShop()` (key B, also `__chefRush.openShop()`) saves, hides the chef and hand, stops the sizzle, then `scene.launch('Shop', {state, onClose})` and `scene.pause()`; the Shop closes with the Close button, Esc or B and calls `onClose` which resumes the game. Purchases go through `buy()`, then set `state.coins`, `SaveSystem.data.owned`/`coins`, `state.mods = modsFor(...)` and `SaveSystem.save()`. Rows show name, description, tier pips (filled = owned), multiplier now to next, and a Buy / "Lv N" / "N coins" / "Max" button. `openShop()` refuses while paused, Closed, an overlay, a story card or a level-up card is showing.
- Verified for step 6 (Chromium headless, production build): game scene pauses and the model clock stops while the Shop is open; a real mouse click on Buy took the coins (200 to 140), set `mods.fryerSpeed` 1.15 and saved `owned`; Esc closes and the model runs again; after a page reload the upgrade and coins persist and the next tier shows its price; locked row shows "Lv 5"; 844x390 touch view lays out with no overlap (after moving the tier pips beside the name); no page errors. `npm test`: 130 pass (77 old unchanged). Typecheck and build clean.
- Not verified for step 6: touch taps on the Buy buttons (only mouse clicks were sent); buttons are 92 logical px tall, about 61 css px on an 844 px wide phone, which is under the 88 css px target (same limit as the kitchen zones, see `docs/progress.md`); the Shop was never opened while an event was running.
- Step 7 done: `data/decor.json` (3 cosmetic items: clock Lv 2 cost 80, bunting Lv 3 cost 120, runner Lv 4 cost 150; x, y, width, height in source pixels), `DecorDef`/`decor` in `GameConfig`, pure `src/game/decor.ts` (`canBuyDecor`, `buyDecor`, `ownedDecor`, `decorLabel`), `validateDecor` (called in `BootScene.preload`), code-drawn textures `decor_<id>` in `buildDecor` in `src/art/builders.ts` (unknown ids fall back to a plain panel), `GameScene.syncDecor()` (draws owned decor at depth 100, below customers at 299; runs at scene start and after the Shop closes), Decor tab in `ShopScene` (tabs Upgrades / Decor; `tryBuyDecor`). A unit test checks no decor rect overlaps any zone in `data/restaurants.json` or another decor item. Debug hook: `__chefRush.decor()` lists drawn decor ids.
- Verified for step 7 (Chromium, production build, `?zones` on): real clicks on the Decor tab and three Buy buttons took 350 coins (500 to 150), saved `decor`, drew all three items in the kitchen clear of every zone outline, and they were still there after a reload; no page errors. `npm test`: 137 pass (77 old unchanged). Typecheck and build clean.
- Not verified for step 7: decor at phone size (844x390; same layout code, just scaled); the bunting may touch the event banner (top centre, depth 860, drawn above it) and order bubbles when 3 or more customers sit (not looked at with customers present); the art is simple code-drawn placeholder art.
- Step 8 done: `data/recipebook.json` (a few short how-to steps per menu item), `recipebook` in `GameConfig`, pure `src/game/recipebook.ts` (`recipeEntries(cfg, level)`: name, price, xp, unlock level, locked flag, steps; easiest first), `validateRecipeBook(data, itemIds)` (every menu item in `recipes.json` must have an entry; called in `BootScene.preload`), `src/scenes/RecipeBookScene.ts` (scene key `RecipeBook`, registered in `src/main.ts`; locked items show "Unlocks at Lv N" and no steps). `GameScene` now has one shared `openPanel(key)` used by `openShop()` (key B) and `openRecipeBook()` (key R, also `__chefRush.openRecipeBook()`); both pause the game scene and resume it on close. The Recipe Book reuses the `ShopData` type for its launch data.
- Verified for step 8 (Chromium, production build): key R opens it and pauses the game at 1280x720 and 844x390 touch; Esc closes it and the model runs again; locked rows (Lv 3 save: nuggets, pizza) show "Unlocks at Lv N"; no page errors. `npm test`: 143 pass (77 old unchanged). Typecheck and build clean.
- Not verified for step 8: the Close button with a real click or touch (only keys were used), and the book at phone size beyond one screenshot (checked by eye only for desktop).
- Step 9 done: `data/restaurant_menu.json` (`comingSoon`: taco_truck Lv 10, pizza_place Lv 20; kept out of `restaurants.json` because `validateRestaurants` requires zones and the zone tests read that file), `restaurantMenu` in `GameConfig`, pure `src/game/restaurants.ts` (`restaurantCards(playable, soon, level, currentId)` gives open / locked / soon cards, `pickStartRestaurant(playable, lastId, level)`), `validateRestaurantMenu` (called in `BootScene.preload`), `src/scenes/RestaurantSelectScene.ts` (scene key `RestaurantSelect`, key T; Continue button on the current card, Play button on another open card). `BootScene.create` now starts the game in `pickStartRestaurant(..., SaveSystem.data.lastRestaurant, level)`. `GameScene.openRestaurants()` uses the shared `openPanel`; picking another open restaurant calls `scene.start('Game', { restaurantId })` (restart), but only `burger_diner` exists, so that path is covered by unit tests only.
- Verified for step 9 (Chromium, production build): key T opens it and pauses the game at 1280x720 and 844x390 touch; a real click on Continue closes it, the model runs again and `lastRestaurant` is saved; Taco Truck and Pizza Place show "Coming soon" (no button); no page errors. `npm test`: 152 pass (77 old unchanged). Typecheck and build clean.
- Not verified for step 9: starting a second restaurant (no second restaurant has zones yet); the `bg_taco` art stays lazy and unused (cards show a "?" panel); touch taps on the buttons.
- Step 10 done: `src/views/MenuButtons.ts` (three round buttons with code-drawn icons: coins = Shop, book = Recipe Book, shop front = Restaurants; row at logical y 190, x 1244, 1176, 1108, hit area 68 px; created in `GameScene.create` and wired to `openShop`, `openRecipeBook`, `openRestaurants`), `tests/menubuttons.test.ts` (no button overlaps a tap zone). Docs: Milestone 4 section in `docs/progress.md` (built, verified, not verified, deviations), Milestone 4 section in `docs/architecture.md`, key list in `README.md`. Also replaced the per-file banned-word checks with one repo-wide scan (`tests/wording.test.ts`); the three banned words no longer appear anywhere in the repo.
- Verified for step 10 (Chromium, production build, 1280x720 mouse and 844x390 touch): a real mouse click and a real touch tap on each of the three buttons opened its panel and paused the game; the buttons sit clear of every zone outline (`?zones`) at Lv 13; no page errors. `npm test`: 150 pass; the 77 Milestone 3 tests were checked as unchanged (`git diff` against `origin/milestone-3-core-systems` is empty for the model, balance data and four test files). Typecheck and build clean.
- Not verified for step 10: the buttons with four customers seated (the nearest button may overlap the far seat by about 10 px); button size on a real phone (68 logical px hit area is about 45 css px at 844 px wide).
- Stopped at: Step 10 committed and pushed. Next action: Step 11 (final verification and PR). Run `npm test`, `npm run typecheck`, `npm run build`; then in the browser: a longer soak at `?debug&speed=10` for several game minutes with the Shop opened and closed a few times (watch the scene object count and console errors), a run with reduced motion on, a Closed and Reopen cycle while a panel is NOT open, and the Lv 13 four-customer view for the button overlap. Fix what breaks; record what was and was not checked in `docs/progress.md`. Then open the Milestone 4 PR with `gh pr create` (base `milestone-3-core-systems` because PR #5 is unmerged; if `gh` cannot reach the repo, write the PR text into HANDOFF.md and tell the owner), PR body ends with the attribution line from the session reminder.
- Note for Step 6: after a purchase the scene must set `state.mods = modsFor(...)` again and write `SaveSystem.data.owned` / `.coins`, then `SaveSystem.save()`. Purchases must go through `buy()`; the model's `coins` is what the HUD shows.

## Next steps (ordered)
1. Do Milestone 4 step 11 above (final verification and PR), committing and pushing after each.
2. Confirm PR #5 (Milestone 3) with the owner; do not touch Milestone 3 code.
3. Check the unverified items below.

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
