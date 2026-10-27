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
