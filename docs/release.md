# Release notes: first version (Spooky Diner Rush, one restaurant)

## CrazyGames ZIP (browser release)
1. `npm run build:crazygames` (typecheck, then Vite in `--mode crazygames`). Output goes to `dist-crazygames/` (git-ignored); the normal `npm run build` keeps writing `dist/` and is unchanged.
2. Zip the CONTENTS of `dist-crazygames/` so `index.html` is at the top of the ZIP, not inside a folder. Windows 10/11 or macOS (Terminal or PowerShell, from the repo root): `tar -a -c -f chef-rush-crazygames.zip -C dist-crazygames .` Or open the folder, select everything inside, right-click, Compress / Send to ZIP.
3. Upload that ZIP on the CrazyGames developer portal yourself. Not done by Claude: submission, cover images, title and description, the "saves progress" toggle.
- What differs from the normal build: no intro video (CrazyGames wants players in gameplay at once, at most one click; `src/build/target.ts`, `vite.config.ts`), so `intro.mp4` (1.5 MB) is not in the ZIP and the title waits for one tap. Everything else (ads, saves, art) is identical.
- Checked 2026-11-03 (browser prep): ZIP 11.0 MB, 76 files, `index.html` at the root, no `.mp4`, all paths relative, only external URL is the SDK script. Limits: 250 MB total, 1500 files, 50 MB initial (20 MB for the mobile homepage).
- Inside the CrazyGames iframe the page makes no fullscreen or orientation-lock attempt and the portrait overlay only says "Turn your phone sideways to play" (CrazyGames shows its own rotate prompt). `user-select: none` is set on the body, and sound the browser stopped (iOS) restarts on the next tap unless the game paused it.

## Size (dist, 2026-11-01)
- Whole `dist/`: about 11.9 MB. Boot art loaded before play: about 1.2 MB, game script 1.5 MB (about 400 KB gzipped), bundled Fredoka font 3 x 16 KB.
- Lazy (only when needed): about 9.0 MB in total, of which the six ghost scare sheets are about 7.0 MB (each loads the first time that ghost appears; without it the game uses a code lunge) and the rest is the ice cream and cold drink animations.
- The ghost cutout PNGs in `public/assets/customers/ghosts/` are only the source for `tools/make_customer_art.py`; the build removes them from `dist/` (`vite.config.ts`).

## SDK (CrazyGames v3)
- `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`; `src/main.ts` awaits `CrazyGames.init()` (3 s timeout, never throws) before the game starts, so save data comes from the SDK `data` module when it is there and from localStorage otherwise. `gameplayStart/Stop` are called on play and pause or close.
- Not checked: the real SDK (this environment cannot reach it). With the script blocked the game starts normally in about 1.3 s. On submission switch on "Does your game save progress?". `loadingStart` runs before the game boots and `loadingStop` when Boot hands over to the title; mid-game ads (`ad.requestAd('midgame')`) run at natural breaks only: after the player taps Reopen on the Closed screen, and after the level-up cards from Lv 3 on once no story card or other popup is open. The model and sound are frozen during an ad, our own cooldown is 3 minutes (the SDK adds its own), a failed or missing ad never blocks, and a silent ad is abandoned after 90 s. Checked only against a fake SDK. Rewarded ad: on the Closed screen a green button "Watch an ad: reopen at full reputation" (normal Reopen gives 55, the ad gives 100; no coins, so the economy is untouched). It is only shown when the SDK ad module exists, the reward is granted only when the ad finishes, and an error shows "No ad available right now" while Reopen still works. Not done: happytime.

## Needs the owner
- Cover images and the game title/description for the CrazyGames form, and a final check on the CrazyGames QA tool.
- Real phone and tablet testing (thumb feel, frame rate), real sound check, and a slow-connection check.

## Known limits
- Only the vest gentleman has no scare clip (code lunge). No scare sound. Happy and eating faces for ghosts need new art.
- People customers are blanked in `customers.webp` (frames 0-7 are empty, `CUSTOMER_LOOK_MIN` is 8); to bring them back run the art tool with the eight PNGs and set it to 0.
