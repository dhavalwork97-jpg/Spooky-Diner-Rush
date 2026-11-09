/**
 * What the game needs from an ad network. The browser and CrazyGames builds use the CrazyGames wrapper (`src/sdk/crazygames.ts`),
 * the Android store build uses AdMob (`src/ads/admobAds.ts`) and the Android direct build uses Unity LevelPlay (`src/ads/levelplayAds.ts`). The game (`GameScene`) only talks to this interface through `ads`
 * (`src/ads/index.ts`), so it never knows which network is behind it.
 *
 * Rules every implementation keeps:
 *  - Never rejects: no ad, a failed ad, a timeout and an error all resolve `false`.
 *  - `onStart` runs only if an ad really started (the game pauses and mutes there).
 *  - `rewardedAd` resolves `true` ONLY when the network confirmed the reward was earned. The game grants the reward then, never before.
 */
export interface AdService {
  /** True when a mid-game ad may be requested now (network ready and the 180 s spacing is over). */
  canShowAd(now?: number): boolean;
  /** Mid-game ad at a natural break. Resolves true when an ad was shown, false when none was. */
  midgameAd(onStart: () => void, now?: number): Promise<boolean>;
  /** True when a rewarded ad can be offered (player-initiated, so no spacing applies). */
  canShowRewarded(): boolean;
  /** Rewarded ad. Resolves true only when the reward was earned. */
  rewardedAd(onStart: () => void, now?: number): Promise<boolean>;
}

/**
 * The banner strip. Only the direct Android build (LevelPlay) has one, on the title screen only; everywhere else both calls do nothing.
 * Both calls are safe to repeat: there is never more than one banner.
 */
export interface BannerService {
  show(): void;
  hide(): void;
}
