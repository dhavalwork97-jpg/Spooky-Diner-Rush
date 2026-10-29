# Chef Rush: Architecture

## Stack
Phaser 3+ (installed: Phaser 4), TypeScript, Vite, Vitest. No other runtime libraries.

## Layout
- `src/scenes`: BootScene (validate data, load assets, loading bar), GameScene (kitchen). More scenes arrive per milestone.
- `src/kitchen`: `zones.ts` is pure math (no Phaser): normalized rect to logical coordinates, background fit, hit testing, overlap and touch-size checks. `stationHandlers.ts` is the typed seam that station systems register against.
- `src/anim`: `guard.ts` (one running animation per key, no stacking, pure), `helpers.ts` (pop, bounce, shake, glow, fade, moveTo), `ParticlePool.ts` (pooled bursts).
- `src/data/validate.ts`: validation for every JSON file at load. Bad data throws with a readable list.
- `src/sdk/crazygames.ts`: no-op safe SDK wrapper.
- `src/systems/SaveSystem.ts`: SDK data first, localStorage fallback, tolerant parsing.
- `data/`: `restaurants.json` (backgrounds and station zones), `assets.json` (asset manifest).
- `public/assets/art`: supplied art. Under `public/` so Vite ships it.

## Rules
- The kitchen background is static. Interaction is drawn as overlays above it.
- Zones are normalized (0..1) against the background image, so the same data works at any canvas size or letterbox. Each restaurant owns its own zones.
- One scene-level pointer handler resolves a tap to at most one zone (nearest center wins if hit areas ever overlap; the validator also rejects overlaps).
- Gameplay state lives in systems. Animations read state and never decide it.
- Animations are keyed through `AnimGuard`, so repeated taps restart instead of stacking. Reduced motion comes from the save setting, falling back to the OS preference.
- Station gameplay plugs in with `registerStationHandler(stationType, handler)`.

## Gameplay model (Milestone 2)
- `src/game/KitchenState.ts` owns fryer vats, grill burners, counter plates, customers, XP, coins and reputation. `update(dt)` advances time; actions are method calls (`tapFryer`, `tapGrill`, `tapBuns`, `tapTrash`, `serve`). It emits events (`GameEvent`) that views drain each frame.
- `src/game/cook.ts` holds the phase rules. `src/game/tutorial.ts` computes the next hint from state and never changes it.
- `src/views/*` are read-only views: `StationViews` (fryer and grill), `ItemView` (plate items, draggable), `CustomerView`, `Hud`, `Popups`, `TutorialHand`, `Ring`.
- `src/art/builders.ts` draws every non-supplied texture in code and caches it by key.
- `src/systems/AudioSystem.ts` synthesizes all sound; the context unlocks on the first pointer event.
- Because the model has no Phaser code, it runs in tests and bot simulations without a browser.

## Shop and progression (Milestone 4)
- Scenes: `Boot`, `Game`, and three panels launched over the paused game, `Shop`, `RecipeBook` and `RestaurantSelect`. `GameScene.openPanel(key)` pauses `Game` and resumes it from the panel's `onClose` callback; panels get the live `KitchenState` through launch data, never through globals.
- Pure modules (no Phaser, unit-tested): `shop.ts` (`buy`, `canBuy`, `modsFor`, `buyLabel`), `decor.ts`, `career.ts`, `chef.ts` (`ChefTalk`), `story.ts`, `recipebook.ts`, `restaurants.ts`. Views only draw what these return.
- Upgrades work by setting `KitchenState.mods`, the hooks added in Milestone 3. The model does not know the Shop exists.
- Save v2 (`SaveSystem.ts`): `owned`, `decor`, `seenStory`, `lastRestaurant` are cleaned by `parseSave`, so old or corrupt saves still load.
- Every new data file has a validator in `src/data/validate.ts`, called in `BootScene.preload`, so bad data fails early with a readable list.
- Free screen areas (no tap zone): the cream strip right of the grill (chef), the band right of the seats under the mute button (menu buttons), the wall right of the window, the strip above the window, and the dining floor (decor). Tests keep decor and menu buttons off the zones.
