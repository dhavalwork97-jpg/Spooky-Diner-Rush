// Safe wrapper around the CrazyGames SDK. Every call is a no-op when the SDK is absent,
// so the game also runs locally and in tests.

import { ADS_ENABLED } from '../build/target';

interface CGData {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface CGSdk {
  init?: () => Promise<void>;
  game?: { gameplayStart?: () => void; gameplayStop?: () => void; loadingStart?: () => void; loadingStop?: () => void };
  ad?: { requestAd?: (type: 'midgame' | 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }) => void };
  data?: CGData;
}

function sdk(): CGSdk | undefined {
  return (globalThis as { CrazyGames?: { SDK?: CGSdk } }).CrazyGames?.SDK;
}

let playing = false;
let loading = false;
let lastAdAt = -Infinity;
/** Our own spacing between mid-game ads; the SDK enforces its own limits on top of this. */
export const AD_GAP_MS = 180_000;
/** An ad that never reports back must not freeze the game. */
export const AD_TIMEOUT_MS = 90_000;
/** If no ad has started this long after the request, stop waiting for it. */
export const AD_START_TIMEOUT_MS = 8_000;

export const CrazyGames = {
  /** Initialise the SDK (it must finish before the save data or any other call is used). Never throws; gives up after `ms`. */
  async init(ms = 3000): Promise<void> {
    try {
      const s = sdk();
      if (!s?.init) return;
      await Promise.race([s.init(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
    } catch {
      /* the SDK is disabled on other domains and rejects: play without it */
    }
  },
  loadingStart(): void {
    if (loading) return;
    loading = true;
    try {
      sdk()?.game?.loadingStart?.();
    } catch {
      /* ignore */
    }
  },
  loadingStop(): void {
    if (!loading) return;
    loading = false;
    try {
      sdk()?.game?.loadingStop?.();
    } catch {
      /* ignore */
    }
  },
  /** True when a mid-game ad may be requested now (SDK ad module present and our cooldown over). */
  canShowAd(now = Date.now()): boolean {
    return ADS_ENABLED && typeof sdk()?.ad?.requestAd === 'function' && now - lastAdAt >= AD_GAP_MS;
  },
  /**
   * Requests a mid-game ad at a natural break. `onStart` runs only if an ad really starts (pause the game and sound there).
   * Resolves with true when an ad was shown, false when none was (no SDK, cooldown, error, timeout). Never rejects.
   */
  midgameAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    if (!this.canShowAd(now)) return Promise.resolve(false);
    lastAdAt = now;
    return new Promise<boolean>((resolve) => {
      let started = false;
      let done = false;
      const end = (): void => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        window.clearTimeout(startTimer);
        resolve(started);
      };
      const timer = window.setTimeout(end, AD_TIMEOUT_MS);
      // No ad began soon after the request (no fill, blocked, wrong domain): give up so nothing waits 90 s.
      const startTimer = window.setTimeout(() => {
        if (!started) end();
      }, AD_START_TIMEOUT_MS);
      try {
        sdk()?.ad?.requestAd?.('midgame', {
          adStarted: () => {
            // A late start after we gave up must not freeze the game: nobody would ever unpause it.
            if (done) return;
            started = true;
            window.clearTimeout(startTimer);
            try {
              onStart();
            } catch {
              /* ignore */
            }
          },
          adFinished: end,
          adError: end,
        });
      } catch {
        end();
      }
    });
  },
  /** True when the SDK ad module is there (a rewarded ad is player-initiated, so no cooldown applies). */
  canShowRewarded(): boolean {
    return ADS_ENABLED && typeof sdk()?.ad?.requestAd === 'function';
  },
  /**
   * Requests a rewarded ad. `onStart` runs only if an ad really starts. Resolves true ONLY when the ad was watched to the end
   * (grant the reward then); false on no SDK, error, no fill or timeout. Never rejects.
   */
  rewardedAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    if (!this.canShowRewarded()) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let finished = false;
      let done = false;
      const end = (): void => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        if (finished) lastAdAt = now; // a rewarded ad just ran: hold back the next mid-game ad
        resolve(finished);
      };
      const timer = window.setTimeout(end, AD_TIMEOUT_MS);
      try {
        sdk()?.ad?.requestAd?.('rewarded', {
          adStarted: () => {
            if (done) return;
            try {
              onStart();
            } catch {
              /* ignore */
            }
          },
          adFinished: () => {
            finished = true;
            end();
          },
          adError: end,
        });
      } catch {
        end();
      }
    });
  },
  /** Test hook: forget the cooldown and flags. */
  _reset(): void {
    playing = false;
    loading = false;
    lastAdAt = -Infinity;
  },
  gameplayStart(): void {
    if (playing) return;
    playing = true;
    try {
      sdk()?.game?.gameplayStart?.();
    } catch {
      /* SDK errors must never break the game */
    }
  },
  gameplayStop(): void {
    if (!playing) return;
    playing = false;
    try {
      sdk()?.game?.gameplayStop?.();
    } catch {
      /* ignore */
    }
  },
  getItem(key: string): string | null {
    try {
      const d = sdk()?.data;
      if (d) return d.getItem(key);
    } catch {
      /* fall through to localStorage */
    }
    return null;
  },
  setItem(key: string, value: string): boolean {
    try {
      const d = sdk()?.data;
      if (d) {
        d.setItem(key, value);
        return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  },
};
