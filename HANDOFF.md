# HANDOFF

Last updated: ChatGPT, session 2026-10-29
Last updated at: 2026-10-29 12:00 IST

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

### Exact next task: Milestone 5 — content
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
