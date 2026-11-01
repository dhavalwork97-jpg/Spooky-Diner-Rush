# Release notes: first version (Chef Rush, one restaurant)

Build: `npm run build` (typecheck + Vite), output in `dist/` (relative paths, so it runs from any sub-folder). Zip the contents of `dist/` for upload. Second restaurant ships in a later update.

## Size (dist, 2026-11-01)
- Whole `dist/`: about 11.9 MB. Boot art loaded before play: about 1.2 MB, game script 1.5 MB (about 400 KB gzipped), bundled Fredoka font 3 x 16 KB.
- Lazy (only when needed): about 9.0 MB in total, of which the six ghost scare sheets are about 7.0 MB (each loads the first time that ghost appears; without it the game uses a code lunge) and the rest is the ice cream and cold drink animations.
- The ghost cutout PNGs in `public/assets/customers/ghosts/` are only the source for `tools/make_customer_art.py`; the build removes them from `dist/` (`vite.config.ts`).

## SDK (CrazyGames v3)
- `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`; `src/main.ts` awaits `CrazyGames.init()` (3 s timeout, never throws) before the game starts, so save data comes from the SDK `data` module when it is there and from localStorage otherwise. `gameplayStart/Stop` are called on play and pause or close.
- Not checked: the real SDK (this environment cannot reach it). With the script blocked the game starts normally in about 1.3 s. On submission switch on "Does your game save progress?". Not done: `loadingStart/Stop`, ads, happytime.

## Needs the owner
- Cover images and the game title/description for the CrazyGames form, and a final check on the CrazyGames QA tool.
- Real phone and tablet testing (thumb feel, frame rate), real sound check, and a slow-connection check.

## Known limits
- Only the vest gentleman has no scare clip (code lunge). No scare sound. Happy and eating faces for ghosts need new art.
- People customers are blanked in `customers.webp` (frames 0-7 are empty, `CUSTOMER_LOOK_MIN` is 8); to bring them back run the art tool with the eight PNGs and set it to 0.
