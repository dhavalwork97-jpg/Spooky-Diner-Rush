/**
 * Which build this is. `npm run build` is the normal build; `npm run build:crazygames` passes `--mode crazygames`.
 * Platform differences that are about the BUILD (not about what the browser reports at run time) live here.
 */
export const IS_CRAZYGAMES_BUILD: boolean = import.meta.env.MODE === 'crazygames';

/** The Poki build (`npm run build:poki`, `--mode poki`). It uses the Poki SDK for ads and never loads the CrazyGames SDK. */
export const IS_POKI_BUILD: boolean = import.meta.env.MODE === 'poki';

/** The 10 s intro video before the title. CrazyGames and Poki want players in gameplay at once (Poki: no splash screens), so it is off there. */
export const INTRO_VIDEO_ENABLED: boolean = !IS_CRAZYGAMES_BUILD && !IS_POKI_BUILD;

/** Skip the title screen for new players (the title is only an extra click once the intro video is off). */
export const SKIP_TITLE: boolean = IS_CRAZYGAMES_BUILD || IS_POKI_BUILD;

/**
 * Ads are off for the CrazyGames basic launch (no ads are served then). Turn them on for the full launch by building
 * with `VITE_ENABLE_ADS=true`. Tests (mode "test") keep them on so the ad logic stays covered.
 */
export const ADS_ENABLED: boolean = import.meta.env.VITE_ENABLE_ADS === 'true' || import.meta.env.MODE === 'test' || IS_POKI_BUILD;
