import { AdEvent, LevelPlayAds } from 'capacitor-levelplay-ads';
import { AdCooldown } from './cooldown';
import { DailyCap } from './dailyCap';
import { readLevelPlayConfig, type LevelPlayConfig } from './levelplayConfig';
import { adDebug, describeError, enableAdDebug } from './levelplayDebug';
import { AD_TIMEOUT_MS } from './timing';
import type { AdService, BannerService } from './types';

/**
 * Unity LevelPlay for the Android app. ANDROID BUILD ONLY: this file (and the plugin) is loaded through a dynamic import behind
 * `import.meta.env.MODE === 'android'` in `src/ads/index.ts`, so the browser and CrazyGames builds contain none of it.
 * The reward itself is NOT decided here: this file only reports whether LevelPlay confirmed it. The numbers stay in the game model.
 *
 * Ads are loaded ahead of time. An ad is only offered when LevelPlay has one loaded, so the player never waits for an ad.
 */

/** LevelPlay can report the reward AFTER the ad closed (official docs), so a closed ad waits this long for the reward event. */
export const REWARD_GRACE_MS = 2_500;
/** After a failed load, the next attempt comes this much later (LevelPlay also throttles loads itself). */
export const RETRY_LOAD_MS = 30_000;
/** If the SDK could not start (offline at launch, for example), it is tried again this much later, a few times. */
export const INIT_RETRY_MS = 30_000;
const MAX_INIT_ATTEMPTS = 4;

type Kind = 'rewarded' | 'interstitial';

/** The one ad on screen right now. The persistent LevelPlay listeners hand their events to it. */
interface Session {
  kind: Kind;
  displayed(): void;
  rewarded(): void;
  closed(): void;
  failed(): void;
}

let cfg: LevelPlayConfig | null = null;
let ready = false;
let listening = false;
let initAttempts = 0;
let initTimer: ReturnType<typeof setTimeout> | undefined;
let cooldown = new AdCooldown();
let cap = new DailyCap();
let session: Session | null = null;
const loaded: Record<Kind, boolean> = { rewarded: false, interstitial: false };
const retryTimer: Partial<Record<Kind, ReturnType<typeof setTimeout>>> = {};

// banner
let bannerWanted = false;
let bannerCreated = false;
let bannerPending = false;
let bannerRetry: ReturnType<typeof setTimeout> | undefined;

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a game callback must never break the ad flow */
  }
}

function idOf(kind: Kind): string {
  return kind === 'rewarded' ? (cfg?.rewardedId ?? '') : (cfg?.interstitialId ?? '');
}

function load(kind: Kind): Promise<void> {
  const adUnitId = idOf(kind);
  if (!adUnitId) return Promise.reject(new Error('no ad unit id'));
  return kind === 'rewarded' ? LevelPlayAds.loadRewarded({ adUnitId }) : LevelPlayAds.loadInterstitial({ adUnitId });
}

/** Loads the next ad of this kind in the background. A failure only schedules a later retry; it is never shown to the player. */
function preload(kind: Kind): void {
  if (!ready || loaded[kind]) return;
  try {
    void load(kind)
      .then(() => {
        loaded[kind] = true;
      })
      .catch((e) => {
        adDebug(`${kind} load error: ${describeError(e)}`);
        scheduleRetry(kind);
      });
  } catch {
    scheduleRetry(kind);
  }
}

function scheduleRetry(kind: Kind): void {
  if (!ready || retryTimer[kind] !== undefined) return;
  retryTimer[kind] = setTimeout(() => {
    retryTimer[kind] = undefined;
    preload(kind);
  }, RETRY_LOAD_MS);
}

function listen(event: string, fn: (info?: unknown) => void): void {
  try {
    void LevelPlayAds.addListener(event, fn).catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}

/** Registered once. The plugin reloads an ad itself after it closes; a failed reload comes back as a load-failed event. */
function registerListeners(): void {
  if (listening) return;
  listening = true;
  for (const kind of ['rewarded', 'interstitial'] as const) {
    const names =
      kind === 'rewarded'
        ? {
            loaded: AdEvent.RewardedLoaded,
            loadFailed: AdEvent.RewardedLoadFailed,
            displayed: AdEvent.RewardedDisplayed,
            displayFailed: AdEvent.RewardedDisplayFailed,
            closed: AdEvent.RewardedClosed,
          }
        : {
            loaded: AdEvent.InterstitialLoaded,
            loadFailed: AdEvent.InterstitialLoadFailed,
            displayed: AdEvent.InterstitialDisplayed,
            displayFailed: AdEvent.InterstitialDisplayFailed,
            closed: AdEvent.InterstitialClosed,
          };
    listen(names.loaded, () => {
      loaded[kind] = true;
      adDebug(`${kind} loaded`);
    });
    listen(names.loadFailed, (info) => {
      loaded[kind] = false;
      adDebug(`${kind} load failed: ${describeError(info)}`);
      scheduleRetry(kind);
    });
    listen(names.displayed, () => {
      loaded[kind] = false; // this ad is used up
      if (session?.kind === kind) session.displayed();
    });
    listen(names.displayFailed, (info) => {
      loaded[kind] = false;
      adDebug(`${kind} display failed: ${describeError(info)}`);
      scheduleRetry(kind);
      if (session?.kind === kind) session.failed();
    });
    listen(names.closed, () => {
      if (session?.kind === kind) session.closed();
    });
  }
  listen(AdEvent.RewardedRewarded, () => {
    if (session?.kind === 'rewarded') session.rewarded();
  });
  listen(AdEvent.BannerLoaded, () => {
    bannerCreated = true;
    adDebug('banner loaded');
  });
  listen(AdEvent.BannerLoadFailed, (info) => adDebug(`banner load failed: ${describeError(info)}`));
}

async function attemptInit(): Promise<void> {
  if (!cfg || ready) return;
  try {
    adDebug(`starting (try ${initAttempts + 1})`);
    await LevelPlayAds.initialize({ appKey: cfg.appKey, isTesting: cfg.testing });
    ready = true;
    adDebug('SDK started');
    preload('rewarded');
    preload('interstitial');
    if (bannerWanted) showBanner();
  } catch (e) {
    ready = false;
    adDebug(`start FAILED: ${describeError(e)}`);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      initAttempts += 1;
      initTimer = setTimeout(() => void attemptInit(), INIT_RETRY_MS);
    }
  }
}

/**
 * Starts LevelPlay. Never throws and never blocks the game. Returns false when the ids are not configured (then the app shows
 * no ads); true when the ad layer is set up (ads appear once the SDK is ready, which can be later if the first start failed).
 */
export async function initLevelPlay(): Promise<boolean> {
  cfg = readLevelPlayConfig();
  if (!cfg) return false;
  enableAdDebug(cfg.testing);
  registerListeners();
  await attemptInit();
  return true;
}

export const levelplayAds: AdService = {
  canShowAd(now = Date.now()): boolean {
    return ready && loaded.interstitial && !session && cooldown.ready(now) && cap.canShow(now);
  },

  midgameAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    // No ad loaded, spacing not over, cap reached: resolve false at once. The game goes on and does not queue a missed ad.
    if (!this.canShowAd(now)) return Promise.resolve(false);
    cooldown.mark(now);
    return new Promise<boolean>((resolve) => {
      let started = false;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (session === me) session = null;
        resolve(started);
      };
      const me: Session = {
        kind: 'interstitial',
        displayed: () => {
          started = true;
          cap.record(now);
          safe(onStart);
        },
        rewarded: () => undefined,
        closed: finish,
        failed: finish,
      };
      const timer = setTimeout(finish, AD_TIMEOUT_MS);
      session = me;
      try {
        void LevelPlayAds.showInterstitial().catch(finish);
      } catch {
        finish();
      }
    });
  },

  canShowRewarded(): boolean {
    return ready && loaded.rewarded && !session;
  },

  rewardedAd(onStart: () => void, now = Date.now()): Promise<boolean> {
    if (!ready || session) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let earned = false; // set ONLY by LevelPlay's own reward event
      let closed = false;
      let done = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(grace);
        if (session === me) session = null;
        if (earned) cooldown.mark(now); // a rewarded ad just ran: hold back the next mid-game ad
        resolve(earned);
      };
      const me: Session = {
        kind: 'rewarded',
        displayed: () => safe(onStart),
        rewarded: () => {
          earned = true;
          if (closed) finish(); // the reward event came after the close
        },
        closed: () => {
          closed = true;
          if (earned) finish();
          else grace = setTimeout(finish, REWARD_GRACE_MS); // wait a moment for a late reward event, then give up
        },
        failed: finish,
      };
      const timer = setTimeout(finish, AD_TIMEOUT_MS);
      session = me;
      const show = (): Promise<void> => LevelPlayAds.showRewarded();
      try {
        // Normally the ad is already loaded. If not (a reload still running), try once now; a failure ends quietly with no reward.
        const start = loaded.rewarded ? show() : load('rewarded').then(show);
        void start.catch(finish);
      } catch {
        finish();
      }
    });
  },

  /** Test hook: forget every flag, timer and counter. */
  _reset(): void {
    clearTimeout(initTimer);
    clearTimeout(bannerRetry);
    clearTimeout(retryTimer.rewarded);
    clearTimeout(retryTimer.interstitial);
    retryTimer.rewarded = undefined;
    retryTimer.interstitial = undefined;
    cfg = null;
    ready = false;
    listening = false;
    initAttempts = 0;
    session = null;
    loaded.rewarded = false;
    loaded.interstitial = false;
    bannerWanted = false;
    bannerCreated = false;
    bannerPending = false;
    cooldown = new AdCooldown();
    cap = new DailyCap();
  },
} as AdService & { _reset(): void };

// ---------------------------------------------------------------- banner

function showBanner(): void {
  if (!ready || !cfg) return;
  if (bannerCreated) {
    void LevelPlayAds.showBanner().catch(() => undefined);
    return;
  }
  if (bannerPending) return; // one banner only: a load is already running
  bannerPending = true;
  try {
    void LevelPlayAds.createBanner({
      adUnitId: cfg.bannerId,
      adSize: 'ADAPTIVE',
      position: 'BOTTOM',
      isAutoShow: true,
      isOverlap: false, // the game view is pushed up by the banner height, so the banner can never cover the menu buttons
    })
      .then(() => {
        bannerPending = false;
        bannerCreated = true;
        // The player left the title screen while the banner was loading: it was shown on load, so hide it again.
        if (!bannerWanted) void LevelPlayAds.hideBanner().catch(() => undefined);
      })
      .catch((e) => {
        bannerPending = false;
        adDebug(`banner error: ${describeError(e)}`);
        if (bannerWanted && bannerRetry === undefined) {
          bannerRetry = setTimeout(() => {
            bannerRetry = undefined;
            if (bannerWanted) showBanner();
          }, RETRY_LOAD_MS);
        }
      });
  } catch {
    bannerPending = false;
  }
}

export const levelplayBanner: BannerService = {
  show(): void {
    bannerWanted = true;
    showBanner();
  },
  hide(): void {
    bannerWanted = false;
    if (bannerCreated) void LevelPlayAds.hideBanner().catch(() => undefined);
  },
};
