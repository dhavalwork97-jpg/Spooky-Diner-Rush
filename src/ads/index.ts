import { CrazyGames } from '../sdk/crazygames';
import type { AdService } from './types';

/**
 * The one door the game uses for ads (`ads.midgameAd`, `ads.rewardedAd`, `ads.canShowRewarded`).
 *  - Browser and CrazyGames builds: the existing CrazyGames wrapper (`src/sdk/crazygames.ts`).
 *  - Android build: Google AdMob (`src/ads/admobAds.ts`), loaded by `initAds()`. Never CrazyGames there.
 * The two networks are never mixed: each build talks to exactly one.
 */

/** Nothing to show (the Android app before AdMob is ready, or if AdMob failed to start). The game simply goes on without an ad. */
const noAds: AdService = {
  canShowAd: () => false,
  midgameAd: () => Promise.resolve(false),
  canShowRewarded: () => false,
  rewardedAd: () => Promise.resolve(false),
};

let impl: AdService = import.meta.env.MODE === 'android' ? noAds : CrazyGames;

export const ads: AdService = {
  canShowAd: (now) => impl.canShowAd(now),
  midgameAd: (onStart, now) => impl.midgameAd(onStart, now),
  canShowRewarded: () => impl.canShowRewarded(),
  rewardedAd: (onStart, now) => impl.rewardedAd(onStart, now),
};

/**
 * Starts the ad network for this build. Call once after the game has started; it never blocks the game and never throws.
 * Written with the literal `import.meta.env.MODE` so Vite removes the AdMob branch (and the plugin) from every build except Android.
 */
export async function initAds(): Promise<void> {
  if (import.meta.env.MODE === 'android') {
    try {
      const m = await import('./admobAds');
      await m.initAdMob();
      impl = m.admobAds;
    } catch {
      impl = noAds;
    }
  }
}
