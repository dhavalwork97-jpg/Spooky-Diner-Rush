# Poki release checklist (branch `release/poki`)

Source: https://developers.poki.com/guide/working-with-poki and the pages it links to.
Build: `npm run build:poki` -> folder `dist-poki` (zip the CONTENTS of that folder and upload it).
Status: prepared and tested locally only. NOT submitted, NOT approved, NOT live.

## Done in code (Poki build only)
- Poki SDK script replaces the CrazyGames script (`vite --mode poki`). CrazyGames and Android code are untouched.
- `src/sdk/poki.ts`: init (game still runs if the SDK is blocked), gameLoadingFinished, gameplayStart on first input,
  gameplayStop on pause/ads/menus, commercialBreak at natural breaks, rewardedBreak (reward only on `true`).
- No own ad timer in the Poki build: Poki decides how often an ad shows.
- ESC or Space pauses; returning from pause shows a commercial break.
- Rewarded button: blue (not green), camera icon, and the main button is wider than it.
- Developer URL switches (debug, test, level, ...) are removed from the address bar at start.
- Arrow Up/Down, Space and mouse wheel no longer scroll the page.
- No external requests (fonts and art are local), no analytics, no IAP, no "remove ads".
- Intro video removed (smaller build, no splash screen). Title screen skipped.
- Tests: `tests/poki_build.test.ts` (15 tests). Whole suite: 1019 passed, 2 skipped.

## Owner decisions needed BEFORE submitting
1. Exclusivity: Poki asks for web exclusivity. This game is also prepared for CrazyGames. Choose one portal for web.
2. Ad frequency: the 180-second interstitial cooldown is NOT applied in the Poki build (Poki bans own ad timers).
   This differs from the project rule "180 seconds" and needs your approval. Reward values (55 / 100) are unchanged.
3. Download size: about 5.8 MB raw (roughly 4.5 MB with the JavaScript compressed) loads at start, measured network-only in headless Chromium. Poki recommends 5 MB at start and 8 MB total; the whole build is 26 MB, so the total is over the guide. The Inspector's Game Details shows the official numbers.
4. Thumbnails (not created): static 628x628, no text, do not use colour #83FFE7; an animated one is added at Soft Release.

## Not tested (needs you)
- Real Poki SDK and the Poki Inspector (https://inspector.poki.dev/): upload `dist-poki` there and check the ads flow.
- A real phone (touch, landscape).
- Language: English only (Poki recommends, does not require, localisation).

## How to test
1. `git checkout release/poki`
2. `npm ci && npm run build:poki`
3. `npx vite preview --outDir dist-poki` and open the printed address.
4. Press ESC while playing: a Paused screen appears. Resume: an ad break is requested (nothing shows without the SDK).

## Poki release steps
Submit -> Poki QA feedback -> Soft Release (animated thumbnail needed) -> full release.
