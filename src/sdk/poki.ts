// Safe wrapper around the Poki SDK (https://developers.poki.com/guide/sdk-html5). Every call is a no-op when the SDK is absent,
// so the game also runs locally and in tests. Poki-only: nothing here is used by the CrazyGames or Android builds.
//
// Poki rules this file follows (https://developers.poki.com/guide/requirements-quality):
//  - the same event is never fired twice in a row (gameplayStart after gameplayStart, gameplayStop after gameplayStop);
//  - gameplayStart is sent on the player's FIRST INPUT, not on load;
//  - no SDK events while a midroll or rewarded video is playing;
//  - no ad timers of our own: Poki decides how often an ad really shows, so `commercialBreak` is requested at every natural break;
//  - a rewarded video grants its reward only when the SDK says it was completed (an ad blocker therefore never pays).

interface PokiSdk {
  init?: () => Promise<void>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  commercialBreak?: (beforeAd?: () => void) => Promise<unknown>;
  rewardedBreak?: (beforeAd?: () => void) => Promise<boolean>;
  setDebug?: (on: boolean) => void;
}

function sdk(): PokiSdk | undefined {
  return (globalThis as { PokiSDK?: PokiSdk }).PokiSDK;
}

/** An ad that never reports back must not freeze the game. */
export const POKI_AD_TIMEOUT_MS = 90_000;

let ready = false;
let playing = false;
/** The scene wants gameplay to be running; it is only reported to Poki after the first input. */
let wanted = false;
let sawInput = false;
let inAd = false;
let armed = false;

function reportStart(): void {
  if (playing || inAd) return;
  playing = true;
  try {
    sdk()?.gameplayStart?.();
  } catch {
    /* SDK errors must never break the game */
  }
}

function reportStop(): void {
  if (!playing || inAd) return;
  playing = false;
  try {
    sdk()?.gameplayStop?.();
  } catch {
    /* ignore */
  }
}

/** Wait for the first tap, click or key, then report gameplayStart if the game is still running. */
function armFirstInput(): void {
  if (armed || sawInput || typeof window === 'undefined') return;
  armed = true;
  const go = (): void => {
    sawInput = true;
    for (const t of ['pointerdown', 'keydown'] as const) window.removeEventListener(t, go, true);
    if (wanted) reportStart();
  };
  for (const t of ['pointerdown', 'keydown'] as const) window.addEventListener(t, go, true);
}

export const Poki = {
  /** Initialise the SDK. The game starts whether or not this works (Poki's guide says to continue in `.catch` too). Never throws; gives up after `ms`. */
  async init(ms = 3000): Promise<void> {
    try {
      const s = sdk();
      if (!s?.init) return;
      await Promise.race([s.init().then(() => (ready = true)), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
    } catch {
      /* blocked or failed: play without it */
    }
  },
  /** Poki has no "loading started" call. */
  loadingStart(): void {},
  /** Loading is over: Poki measures conversion to play from this. */
  loadingStop(): void {
    try {
      sdk()?.gameLoadingFinished?.();
    } catch {
      /* ignore */
    }
  },
  /** True when a commercial break may be requested. No cooldown of our own: Poki decides if an ad really shows. */
  canShowAd(): boolean {
    return typeof sdk()?.commercialBreak === 'function';
  },
  /**
   * Requests a commercial break at a natural break. `onStart` runs only if an ad really starts (mute the game there).
   * Resolves true when an ad was shown, false when none was. Never rejects.
   */
  async midgameAd(onStart: () => void): Promise<boolean> {
    const s = sdk();
    if (!s?.commercialBreak) return false;
    const was = playing;
    reportStop(); // Poki wants gameplayStop BEFORE the break
    let started = false;
    let settled = false;
    let resolveBreak!: (shown: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      resolveBreak = resolve;
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      inAd = false;
      if (!started && was && wanted) reportStart();
      resolveBreak(started);
    }, POKI_AD_TIMEOUT_MS);
    const finish = (shown: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      inAd = false;
      if (!started && was && wanted) reportStart();
      resolveBreak(shown);
    };
    try {
      void s.commercialBreak(() => {
        if (settled || started) return; // Ignore callbacks arriving after timeout or a duplicate start.
        started = true;
        inAd = true; // no SDK events while the video plays
        try {
          onStart();
        } catch {
          /* ignore */
        }
      }).then(
        () => finish(started),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
    return result;
  },
  /** True when the SDK is there. A rewarded video is always the player's own choice. */
  canShowRewarded(): boolean {
    return typeof sdk()?.rewardedBreak === 'function';
  },
  /**
   * Requests a rewarded video. Resolves true ONLY when Poki reports success (grant the reward then); false on no SDK, an ad blocker,
   * no fill, an error or a timeout. Never rejects.
   */
  async rewardedAd(onStart: () => void): Promise<boolean> {
    const s = sdk();
    if (!s?.rewardedBreak) return false;
    reportStop();
    let started = false;
    const begin = (): void => {
      if (started) return;
      started = true;
      inAd = true;
      try {
        onStart();
      } catch {
        /* ignore */
      }
    };
    let settled = false;
    let resolveReward!: (success: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      resolveReward = resolve;
    });
    const timer = setTimeout(() => finish(false), POKI_AD_TIMEOUT_MS);
    const finish = (success: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      inAd = false;
      resolveReward(success);
    };
    try {
      // Do not pause pre-emptively: Poki invokes begin only when a rewarded ad actually starts.
      void s.rewardedBreak(begin).then(
        (success) => finish(success === true),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
    return result;
  },
  gameplayStart(): void {
    wanted = true;
    if (!sawInput) {
      armFirstInput();
      return;
    }
    reportStart();
  },
  gameplayStop(): void {
    wanted = false;
    reportStop();
  },
  /** Poki has no cloud save in the plain SDK: progress lives in localStorage (wrapped in try/catch by SaveSystem). */
  getItem(): string | null {
    return null;
  },
  setItem(): boolean {
    return false;
  },
  /** Test hook: forget every flag. */
  _reset(): void {
    ready = false;
    playing = false;
    wanted = false;
    sawInput = false;
    inAd = false;
    armed = false;
  },
  /** Test hook. */
  get _state(): { ready: boolean; playing: boolean; wanted: boolean; sawInput: boolean; inAd: boolean } {
    return { ready, playing, wanted, sawInput, inAd };
  },
};
