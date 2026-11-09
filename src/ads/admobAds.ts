import { AdMob, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { ADMOB_TEST_IDS, ADMOB_TESTING } from './adIds';
import { AdCooldown } from './cooldown';
import { AD_TIMEOUT_MS } from './timing';
import type { AdService } from './types';

/**
 * Google AdMob for the Android app. ANDROID STORE BUILD ONLY: this file (and the AdMob plugin) is loaded through a dynamic import behind
 * `import.meta.env.MODE === 'android-play'` in `src/ads/index.ts`, so the browser, CrazyGames and Android direct builds contain none of it.
 * Test ad ids only (see `adIds.ts`). The reward itself is NOT decided here: this file only reports whether it was earned.
 */

let ready = false;
const cooldown = new AdCooldown();

/** Starts the Mobile Ads SDK. Never throws; until it succeeds no ad is offered. */
export async function initAdMob(): Promise<void> {
  try {
    await AdMob.initialize({});
    ready = true;
  } catch {
    ready = false;
  }
}

/** Removes every listener once the ad is over, so the next ad starts clean. */
function release(handles: Promise<PluginListenerHandle>[]): void {
  for (const h of handles) {
    void h
      .then((x) => x.remove())
      .catch(() => {
        /* ignore */
      });
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a game callback must never break the ad flow */
  }
}

export const admobAds: AdService = {
  canShowAd(now = Date.now()): boolean {
    return ready && cooldown.ready(now);
  },

  midgameAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    if (!this.canShowAd(now)) return Promise.resolve(false);
    cooldown.mark(now);
    return new Promise<boolean>((resolve) => {
      let started = false;
      let done = false;
      const handles: Promise<PluginListenerHandle>[] = [];
      const end = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        release(handles);
        resolve(started);
      };
      const timer = setTimeout(end, AD_TIMEOUT_MS);
      try {
        handles.push(
          AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
            started = true;
            safe(onStart);
          }),
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, end),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, end),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, end),
        );
        void AdMob.prepareInterstitial({ adId: ADMOB_TEST_IDS.interstitial, isTesting: ADMOB_TESTING })
          .then(() => AdMob.showInterstitial())
          .catch(end);
      } catch {
        end();
      }
    });
  },

  canShowRewarded(): boolean {
    return ready;
  },

  rewardedAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    if (!this.canShowRewarded()) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let earned = false; // set ONLY by AdMob's own "reward earned" event
      let done = false;
      const handles: Promise<PluginListenerHandle>[] = [];
      const end = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        release(handles);
        if (earned) cooldown.mark(now); // a rewarded ad just ran: hold back the next mid-game ad
        resolve(earned);
      };
      const timer = setTimeout(end, AD_TIMEOUT_MS);
      try {
        handles.push(
          AdMob.addListener(RewardAdPluginEvents.Showed, () => safe(onStart)),
          AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            earned = true;
          }),
          AdMob.addListener(RewardAdPluginEvents.Dismissed, end),
          AdMob.addListener(RewardAdPluginEvents.FailedToLoad, end),
          AdMob.addListener(RewardAdPluginEvents.FailedToShow, end),
        );
        void AdMob.prepareRewardVideoAd({ adId: ADMOB_TEST_IDS.rewarded, isTesting: ADMOB_TESTING })
          .then(() => AdMob.showRewardVideoAd())
          .catch(end);
      } catch {
        end();
      }
    });
  },

  /** Test hook: forget the cooldown and the ready flag. */
  _reset(): void {
    ready = false;
    cooldown.reset();
  },
} as AdService & { _reset(): void };
