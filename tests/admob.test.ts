import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { fakeAdmob } from './helpers/fakeAdmob';
import { ADMOB_TEST_IDS } from '../src/ads/adIds';
import { AD_GAP_MS, AD_TIMEOUT_MS } from '../src/ads/timing';

vi.mock('@capacitor-community/admob', async () => (await import('./helpers/fakeAdmob')).fakeAdmobModule());

import { admobAds, initAdMob } from '../src/ads/admobAds';

const fake = fakeAdmob();
const reset = (): void => (admobAds as unknown as { _reset(): void })._reset();
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Script what AdMob does when the interstitial is shown. */
function interstitialPlays(...events: InterstitialAdPluginEvents[]): void {
  fake.onShowInterstitial = () => {
    for (const e of events) fake.emit(e);
    return Promise.resolve();
  };
}
/** Script what AdMob does when the rewarded ad is shown. */
function rewardedPlays(...events: RewardAdPluginEvents[]): void {
  fake.onShowReward = () => {
    for (const e of events) fake.emit(e);
    return Promise.resolve({ type: 'coins', amount: 1 });
  };
}

beforeEach(() => {
  fake.reset();
  reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdMob: unavailable', () => {
  it('offers nothing and never calls the plugin before AdMob is initialised', async () => {
    expect(admobAds.canShowAd()).toBe(false);
    expect(admobAds.canShowRewarded()).toBe(false);
    const start = vi.fn();
    expect(await admobAds.midgameAd(start)).toBe(false);
    expect(await admobAds.rewardedAd(start)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(fake.called('prepareInterstitial')).toBe(0);
    expect(fake.called('prepareRewardVideoAd')).toBe(0);
  });

  it('stays unavailable when AdMob fails to start (and never throws)', async () => {
    fake.onInitialize = () => Promise.reject(new Error('no play services'));
    await expect(initAdMob()).resolves.toBeUndefined();
    expect(admobAds.canShowRewarded()).toBe(false);
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);
  });

  it('becomes available after a successful start', async () => {
    await initAdMob();
    expect(fake.called('initialize')).toBe(1);
    expect(admobAds.canShowAd()).toBe(true);
    expect(admobAds.canShowRewarded()).toBe(true);
  });
});

describe('AdMob: mid-game (interstitial) ad', () => {
  beforeEach(async () => {
    await initAdMob();
  });

  it('uses the Google TEST interstitial id and test mode', async () => {
    interstitialPlays(InterstitialAdPluginEvents.Showed, InterstitialAdPluginEvents.Dismissed);
    await admobAds.midgameAd(() => undefined);
    const prep = fake.calls.find((c) => c.fn === 'prepareInterstitial');
    expect(prep?.arg).toEqual({ adId: ADMOB_TEST_IDS.interstitial, isTesting: true });
    expect(ADMOB_TEST_IDS.interstitial.startsWith('ca-app-pub-3940256099942544/')).toBe(true);
  });

  it('calls onStart when the ad shows and resolves true when it is dismissed', async () => {
    interstitialPlays(InterstitialAdPluginEvents.Showed, InterstitialAdPluginEvents.Dismissed);
    const start = vi.fn();
    expect(await admobAds.midgameAd(start)).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it('resolves false and never calls onStart when the ad fails to load', async () => {
    fake.onPrepareInterstitial = () => {
      fake.emit(InterstitialAdPluginEvents.FailedToLoad, { code: 3, message: 'no fill' });
      return Promise.reject(new Error('no fill'));
    };
    const start = vi.fn();
    expect(await admobAds.midgameAd(start)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(fake.called('showInterstitial')).toBe(0);
  });

  it('resolves false when the ad fails to show', async () => {
    interstitialPlays(InterstitialAdPluginEvents.FailedToShow);
    const start = vi.fn();
    expect(await admobAds.midgameAd(start)).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('resolves false when the plugin call itself rejects', async () => {
    fake.onPrepareInterstitial = () => Promise.reject(new Error('boom'));
    expect(await admobAds.midgameAd(() => undefined)).toBe(false);
  });

  it('survives a game callback that throws', async () => {
    interstitialPlays(InterstitialAdPluginEvents.Showed, InterstitialAdPluginEvents.Dismissed);
    expect(
      await admobAds.midgameAd(() => {
        throw new Error('game bug');
      }),
    ).toBe(true);
  });

  it('gives up on an ad that never reports back', async () => {
    vi.useFakeTimers();
    interstitialPlays(InterstitialAdPluginEvents.Showed); // shown, never dismissed
    const p = admobAds.midgameAd(() => undefined);
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT_MS + 1000);
    expect(await p).toBe(true);
  });

  it('removes its listeners when the ad is over', async () => {
    interstitialPlays(InterstitialAdPluginEvents.Showed, InterstitialAdPluginEvents.Dismissed);
    await admobAds.midgameAd(() => undefined);
    await tick();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe('AdMob: 180 second cooldown', () => {
  beforeEach(async () => {
    await initAdMob();
    interstitialPlays(InterstitialAdPluginEvents.Showed, InterstitialAdPluginEvents.Dismissed);
  });

  it('is the same 180 s as the browser', () => {
    expect(AD_GAP_MS).toBe(180_000);
  });

  it('blocks a second mid-game ad until 180 s have passed', async () => {
    const t0 = 1_000_000;
    expect(await admobAds.midgameAd(() => undefined, t0)).toBe(true);
    expect(admobAds.canShowAd(t0 + AD_GAP_MS - 1)).toBe(false);
    const before = fake.called('prepareInterstitial');
    expect(await admobAds.midgameAd(() => undefined, t0 + 1000)).toBe(false);
    expect(fake.called('prepareInterstitial')).toBe(before); // no request was even made
    expect(admobAds.canShowAd(t0 + AD_GAP_MS)).toBe(true);
    expect(await admobAds.midgameAd(() => undefined, t0 + AD_GAP_MS)).toBe(true);
  });

  it('a failed request still counts, like the CrazyGames wrapper (no hammering the network)', async () => {
    fake.onPrepareInterstitial = () => Promise.reject(new Error('no fill'));
    const t0 = 2_000_000;
    expect(await admobAds.midgameAd(() => undefined, t0)).toBe(false);
    expect(admobAds.canShowAd(t0 + 10)).toBe(false);
  });

  it('is not applied to rewarded ads, but a WATCHED rewarded ad restarts it', async () => {
    const t0 = 5_000_000;
    expect(await admobAds.midgameAd(() => undefined, t0)).toBe(true);
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Rewarded, RewardAdPluginEvents.Dismissed);
    expect(await admobAds.rewardedAd(() => undefined, t0 + 10)).toBe(true); // not held back by the cooldown
    expect(admobAds.canShowAd(t0 + AD_GAP_MS + 5)).toBe(false);
    expect(admobAds.canShowAd(t0 + 10 + AD_GAP_MS)).toBe(true);
  });

  it('an unwatched rewarded ad does not restart it', async () => {
    const t0 = 7_000_000;
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Dismissed); // closed early
    expect(await admobAds.rewardedAd(() => undefined, t0)).toBe(false);
    expect(admobAds.canShowAd(t0 + 1)).toBe(true);
  });
});

describe('AdMob: rewarded ad pays out only when AdMob confirms the reward', () => {
  beforeEach(async () => {
    await initAdMob();
  });

  it('uses the Google TEST rewarded id and test mode', async () => {
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Rewarded, RewardAdPluginEvents.Dismissed);
    await admobAds.rewardedAd(() => undefined);
    const prep = fake.calls.find((c) => c.fn === 'prepareRewardVideoAd');
    expect(prep?.arg).toEqual({ adId: ADMOB_TEST_IDS.rewarded, isTesting: true });
    expect(ADMOB_TEST_IDS.rewarded.startsWith('ca-app-pub-3940256099942544/')).toBe(true);
  });

  it('true when the reward was earned, and onStart ran', async () => {
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Rewarded, RewardAdPluginEvents.Dismissed);
    const start = vi.fn();
    expect(await admobAds.rewardedAd(start)).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it('false when the player closes the ad before the reward', async () => {
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Dismissed);
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);
  });

  it('false when the plugin returns a reward item but never sends the reward event (the event is the only proof)', async () => {
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Dismissed); // show() resolves with an item
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);
  });

  it('false on a load failure, a show failure, a plugin rejection or a silent ad', async () => {
    fake.onPrepareReward = () => {
      fake.emit(RewardAdPluginEvents.FailedToLoad, { code: 3, message: 'no fill' });
      return Promise.reject(new Error('no fill'));
    };
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);

    fake.reset();
    rewardedPlays(RewardAdPluginEvents.FailedToShow);
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);

    fake.reset();
    fake.onPrepareReward = () => Promise.reject(new Error('boom'));
    expect(await admobAds.rewardedAd(() => undefined)).toBe(false);

    fake.reset();
    vi.useFakeTimers();
    rewardedPlays(RewardAdPluginEvents.Showed); // never reports back, no reward
    const p = admobAds.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT_MS + 1000);
    expect(await p).toBe(false);
  });

  it('stays pending until the ad is over: nothing is granted while the ad is still playing', async () => {
    let finish: () => void = () => undefined;
    fake.onShowReward = () => {
      fake.emit(RewardAdPluginEvents.Showed);
      fake.emit(RewardAdPluginEvents.Rewarded); // earned, but the ad has not been closed yet
      return new Promise((resolve) => {
        finish = () => {
          fake.emit(RewardAdPluginEvents.Dismissed);
          resolve({ type: 'coins', amount: 1 });
        };
      });
    };
    let settled = false;
    const p = admobAds.rewardedAd(() => undefined).then((v) => {
      settled = true;
      return v;
    });
    await tick();
    expect(settled).toBe(false);
    finish();
    expect(await p).toBe(true);
  });

  it('removes its listeners when the ad is over', async () => {
    rewardedPlays(RewardAdPluginEvents.Showed, RewardAdPluginEvents.Rewarded, RewardAdPluginEvents.Dismissed);
    await admobAds.rewardedAd(() => undefined);
    await tick();
    expect(fake.listenerCount()).toBe(0);
  });
});
