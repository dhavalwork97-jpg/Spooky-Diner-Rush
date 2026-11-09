/**
 * Unity LevelPlay settings, read from Vite env variables (`VITE_LEVELPLAY_*`). ANDROID DIRECT BUILD ONLY: this file is imported only by
 * `levelplayAds.ts`, which only the direct build loads, so none of these values reach the browser or CrazyGames bundles.
 *
 * Where the values live: `.env.android-direct.local` (git-ignored, on the owner's computer). `.env.example` shows the names with placeholders.
 * Missing, empty or placeholder values mean "no ads": the game runs normally without them.
 */
export interface LevelPlayConfig {
  /** LevelPlay dashboard App Key. */
  appKey: string;
  /** Rewarded ad unit ID (dashboard name `Extra_Life`). */
  rewardedId: string;
  /** Interstitial ad unit ID (dashboard name `Between_Levels`). */
  interstitialId: string;
  /** Banner ad unit ID (dashboard name `Main_Menu_Banner`). */
  bannerId: string;
  /** LevelPlay test mode (test suite, adapter debug). Only for development builds; never set it in a build for the store. */
  testing: boolean;
}

function text(env: Record<string, unknown>, key: string): string {
  const v = env[key];
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return /^your[_-]/i.test(t) ? '' : t; // the .env.example placeholders count as "not set"
}

/** All four ids present, or null (then the app simply shows no ads). */
export function readLevelPlayConfig(env: Record<string, unknown> = import.meta.env as Record<string, unknown>): LevelPlayConfig | null {
  const appKey = text(env, 'VITE_LEVELPLAY_APP_KEY');
  const rewardedId = text(env, 'VITE_LEVELPLAY_REWARDED_ID');
  const interstitialId = text(env, 'VITE_LEVELPLAY_INTERSTITIAL_ID');
  const bannerId = text(env, 'VITE_LEVELPLAY_BANNER_ID');
  if (!appKey || !rewardedId || !interstitialId || !bannerId) return null;
  return { appKey, rewardedId, interstitialId, bannerId, testing: text(env, 'VITE_LEVELPLAY_TEST') === 'true' };
}
