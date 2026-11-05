import { CrazyGames } from '../sdk/crazygames';
import type { AdService, BannerService } from './types';

/**
 * The one door the game uses for ads (`ads.midgameAd`, `ads.rewardedAd`, `ads.canShowRewarded`) and for the title-screen banner (`banner`).
 *  - Browser and CrazyGames builds: the existing CrazyGames wrapper (`src/sdk/crazygames.ts`). No banner.
 *  - Android build: Unity LevelPlay (`src/ads/levelplayAds.ts`), loaded by `initAds()`. Never CrazyGames there.
 * The two networks are never mixed: each build talks to exactly one.
 */

/** Nothing to show (the Android app before LevelPlay is ready, without ids, or if LevelPlay failed to start). The game simply goes on without an ad. */
const noAds: AdService = {
  canShowAd: () => false,
  midgameAd: () => Promise.resolve(false),
  canShowRewarded: () => false,
  rewardedAd: () => Promise.resolve(false),
};

const noBanner: BannerService = { show: () => undefined, hide: () => undefined };

let impl: AdService = import.meta.env.MODE === 'android' ? noAds : CrazyGames;
let bannerImpl: BannerService = noBanner;
/** The title screen can ask for the banner before LevelPlay has started; the request is replayed once it has. */
let bannerWanted = false;

export const ads: AdService = {
  canShowAd: (now) => impl.canShowAd(now),
  midgameAd: (onStart, now) => impl.midgameAd(onStart, now),
  canShowRewarded: () => impl.canShowRewarded(),
  rewardedAd: (onStart, now) => impl.rewardedAd(onStart, now),
};

export const banner: BannerService = {
  show: () => {
    bannerWanted = true;
    bannerImpl.show();
  },
  hide: () => {
    bannerWanted = false;
    bannerImpl.hide();
  },
};

/**
 * Starts the ad network for this build. Call once after the game has started; it never blocks the game and never throws.
 * Written with the literal `import.meta.env.MODE` so Vite removes the LevelPlay branch (and the plugin) from every build except Android.
 */
export async function initAds(): Promise<void> {
  if (import.meta.env.MODE === 'android') {
    try {
      const m = await import('./levelplayAds');
      if (await m.initLevelPlay()) {
        impl = m.levelplayAds;
        bannerImpl = m.levelplayBanner;
        if (bannerWanted) bannerImpl.show();
      } else {
        impl = noAds; // ids not configured: no ads
      }
    } catch {
      impl = noAds;
    }
  }
}
