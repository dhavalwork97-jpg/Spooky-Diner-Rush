# Release notes: first version (Spooky Diner Rush, one restaurant)

## Build 2026-11-13 (main d77bc5e: Taco Truck update + retention pacing)
- ZIP: `npm run build:crazygames`, then zip the CONTENTS of `dist-crazygames/` (162 files, 16.9 MB zipped, `index.html` at the root, no `.mp4`, the SDK script is the only external URL). Well inside the limits below. Not run in the real CrazyGames QA tool.
- Taco Truck: oven now fits the kitchen art; the truck has its own 5 upgrades (cooking speed, burn protection, patience, serving, drink pouring) in its own Shop view, separate from the diner's (diner upgrades no longer change the truck); each new dish gets a one-time pointer lesson (full once, one short reminder, then never) and arrives alone first, then in practice orders, before it joins the normal mix. Old saves load: dishes older than the current menu step count as already learned.
- Diner pacing (aimed at playtime, D1 retention and gameplay conversion): Lv 3-8 need less XP (`data/xp.json` `earlyPerLevel` 50 up to `earlyUntilLevel` 8; Lv 1-2 and Lv 9+ unchanged, so Lv 9 has one visible step up); one mini-goal at a time from Lv 3 with a banner and a small coin and XP reward; the Daily Special starts at Lv 3 (was 15).
- Returning players: a daily login bonus (25 / 50 / 100 coins over a 3-day cycle, popup "Welcome back!"), never on the first launch and never in Lv 1-2; the Closed screen says what coming back tomorrow pays. Players with saved progress skip the title screen and go straight into the game; new players still see it.
- Branding: `index.html` has a description and og tags; the web manifest short name is now "Spooky Diner Rush". `public/assets/art/logo_chef_rush.webp` shows "CHEF RUSH" but no code displays it.
- Ads: unchanged (same CrazyGames calls, reopen 55 / rewarded 100, 180 s cooldown).
- Tested: type check, 575 unit tests, bot pacing table (average bot Lv 5 at 183 s instead of 220 s; fast bot Lv 10 at 366 s; casual bot Lv 5 at 333 s instead of 441 s; slower bots close the diner more often than before), headless Chromium for the oven, tutorial pointer, truck Shop, goal banner and login popup.
- Needs the owner: a real phone in landscape (goal banner size, touch drag, login popup, direct start without the title), play-testing the Taco Truck learning flow (hardest point: the nachos dishes), and the CrazyGames QA tool.

## CrazyGames ZIP (browser release)
1. `npm run build:crazygames` (typecheck, then Vite in `--mode crazygames`). Output goes to `dist-crazygames/` (git-ignored); the normal `npm run build` keeps writing `dist/` and is unchanged.
2. Zip the CONTENTS of `dist-crazygames/` so `index.html` is at the top of the ZIP, not inside a folder. Windows 10/11 or macOS (Terminal or PowerShell, from the repo root): `tar -a -c -f chef-rush-crazygames.zip -C dist-crazygames .` Or open the folder, select everything inside, right-click, Compress / Send to ZIP.
3. Upload that ZIP on the CrazyGames developer portal yourself. Not done by Claude: submission, cover images, title and description, the "saves progress" toggle.
- What differs from the normal build: no intro video (CrazyGames wants players in gameplay at once, at most one click; `src/build/target.ts`, `vite.config.ts`), so `intro.mp4` (1.5 MB) is not in the ZIP and the title waits for one tap. Everything else (ads, saves, art) is identical.
- Checked 2026-11-03 (browser prep): ZIP 11.0 MB, 76 files, `index.html` at the root, no `.mp4`, all paths relative, only external URL is the SDK script. Limits: 250 MB total, 1500 files, 50 MB initial (20 MB for the mobile homepage).
- Inside the CrazyGames iframe the page makes no fullscreen or orientation-lock attempt and the portrait overlay only says "Turn your phone sideways to play" (CrazyGames shows its own rotate prompt). `user-select: none` is set on the body, and sound the browser stopped (iOS) restarts on the next tap unless the game paused it.

## Size (dist, 2026-11-01)
- Whole `dist/`: about 11.9 MB. Boot art loaded before play: about 1.2 MB, game script 1.5 MB (about 400 KB gzipped), bundled Fredoka font 3 x 16 KB.
- Lazy (only when needed): the two mint ghost leave clips (about 1.8 MB, loaded the first time a ghost appears; without them the ghost walks out or lunges) and the ice cream and cold drink animations.
- Customers: one mint ghost with five animation sheets in `public/assets/customers/mint_ghost/` (about 3.2 MB, made by `tools/make_mint_ghost_art.py`). The old ghosts and their scare sheets were removed on 2026-11-04 (about 7 MB less).

## SDK (CrazyGames v3)
- `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`; `src/main.ts` awaits `CrazyGames.init()` (3 s timeout, never throws) before the game starts, so save data comes from the SDK `data` module when it is there and from localStorage otherwise. `gameplayStart/Stop` are called on play and pause or close.
- Not checked: the real SDK (this environment cannot reach it). With the script blocked the game starts normally in about 1.3 s. On submission switch on "Does your game save progress?". `loadingStart` runs before the game boots and `loadingStop` when Boot hands over to the title; mid-game ads (`ad.requestAd('midgame')`) run at natural breaks only: after the player taps Reopen on the Closed screen, and after the level-up cards from Lv 3 on once no story card or other popup is open. The model and sound are frozen during an ad, our own cooldown is 3 minutes (the SDK adds its own), a failed or missing ad never blocks, and a silent ad is abandoned after 90 s. Checked only against a fake SDK. Rewarded ad: on the Closed screen a green button "Watch an ad: reopen at full reputation" (normal Reopen gives 55, the ad gives 100; no coins, so the economy is untouched). It is only shown when the SDK ad module exists, the reward is granted only when the ad finishes, and an error shows "No ad available right now" while Reopen still works. Not done: happytime.

## Needs the owner
- Cover images and the game title/description for the CrazyGames form, and a final check on the CrazyGames QA tool.
- Real phone and tablet testing (thumb feel, frame rate), real sound check, and a slow-connection check.

## Known limits
- The mint ghost has no scare sheet (the angry leave is its supplied sulk clip). No scare sound. Only one customer character exists for now; more are expected.
- People customers are blanked in `customers.webp` (frames 0-7 are empty, `CUSTOMER_LOOK_MIN` is 8); to bring them back run the art tool with the eight PNGs and set it to 0.
