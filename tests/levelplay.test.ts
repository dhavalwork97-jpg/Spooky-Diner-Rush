import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLevelPlay } from './helpers/fakeLevelPlay';
import { AD_GAP_MS, AD_TIMEOUT_MS } from '../src/ads/timing';
import { DailyCap, MAX_INTERSTITIALS_PER_DAY } from '../src/ads/dailyCap';
import { readLevelPlayConfig } from '../src/ads/levelplayConfig';

vi.mock('capacitor-levelplay-ads', async () => (await import('./helpers/fakeLevelPlay')).fakeLevelPlayModule());

const fake = fakeLevelPlay();
type Mod = typeof import('../src/ads/levelplayAds');
type Ads = Mod['levelplayAds'] & { _reset(): void };
let m: Mod;
let ads: Ads;

const ENV = { VITE_LEVELPLAY_APP_KEY: 'k', VITE_LEVELPLAY_REWARDED_ID: 'rw1', VITE_LEVELPLAY_INTERSTITIAL_ID: 'in1', VITE_LEVELPLAY_BANNER_ID: 'bn1' };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function start(): Promise<void> {
  expect(await m.initLevelPlay()).toBe(true);
  await flush();
}

/** A rewarded ad that is shown, then the given events fire in order. */
function rewardedEvents(...events: string[]): void {
  fake.onShowRewarded = () => {
    for (const e of events) fake.emit(e);
    return Promise.resolve();
  };
}
function interstitialEvents(...events: string[]): void {
  fake.onShowInterstitial = () => {
    for (const e of events) fake.emit(e);
    return Promise.resolve();
  };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0));
  fake.reset();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.resetModules();
  m = await import('../src/ads/levelplayAds');
  ads = m.levelplayAds as Ads;
  ads._reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('start and preload', () => {
  it('starts with the app key and preloads the rewarded and interstitial ads with their own ad unit ids', async () => {
    await start();
    expect(fake.calls.find((c) => c.fn === 'initialize')?.arg).toEqual({ appKey: 'k', isTesting: false });
    expect(fake.calls.find((c) => c.fn === 'loadRewarded')?.arg).toEqual({ adUnitId: 'rw1' });
    expect(fake.calls.find((c) => c.fn === 'loadInterstitial')?.arg).toEqual({ adUnitId: 'in1' });
    expect(ads.canShowRewarded()).toBe(true);
    expect(ads.canShowAd(Date.now())).toBe(true);
  });
  it('test mode only when VITE_LEVELPLAY_TEST is exactly "true"', () => {
    expect(readLevelPlayConfig({ ...ENV, VITE_LEVELPLAY_TEST: 'true' })?.testing).toBe(true);
    expect(readLevelPlayConfig({ ...ENV, VITE_LEVELPLAY_TEST: 'yes' })?.testing).toBe(false);
    expect(readLevelPlayConfig(ENV)?.testing).toBe(false);
  });
  it('missing, empty or placeholder values mean no config', () => {
    expect(readLevelPlayConfig({})).toBeNull();
    expect(readLevelPlayConfig({ ...ENV, VITE_LEVELPLAY_BANNER_ID: '  ' })).toBeNull();
    expect(readLevelPlayConfig({ ...ENV, VITE_LEVELPLAY_APP_KEY: 'YOUR_APP_KEY' })).toBeNull();
  });
  it('a failed start never throws, shows no ads, and is retried later', async () => {
    fake.onInitialize = () => Promise.reject(new Error('offline'));
    expect(await m.initLevelPlay()).toBe(true);
    expect(ads.canShowRewarded()).toBe(false);
    fake.onInitialize = () => Promise.resolve({ status: 'INITIALIZED_SUCCESSFULLY' });
    await vi.advanceTimersByTimeAsync(m.INIT_RETRY_MS + 10);
    expect(ads.canShowRewarded()).toBe(true);
  });
  it('a failed load is retried later, not in a loop', async () => {
    fake.onLoad = () => Promise.reject(new Error('no fill'));
    await start();
    expect(fake.called('loadRewarded')).toBe(1);
    expect(ads.canShowRewarded()).toBe(false);
    fake.reset();
    await vi.advanceTimersByTimeAsync(m.RETRY_LOAD_MS + 10);
    expect(fake.called('loadRewarded')).toBe(1);
    expect(ads.canShowRewarded()).toBe(true);
  });
});

describe('rewarded ad', () => {
  beforeEach(async () => {
    await start();
  });
  it('rewards only after the reward event (shown, rewarded, closed)', async () => {
    const onStart = vi.fn();
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdRewarded', 'onRewardedAdClosed');
    expect(await ads.rewardedAd(onStart)).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('closed without the reward event: no reward, after the grace wait', async () => {
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdClosed');
    const p = ads.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(m.REWARD_GRACE_MS + 10);
    expect(await p).toBe(false);
  });
  it('the reward event arriving AFTER the close still counts (official docs: it is asynchronous)', async () => {
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdClosed');
    const p = ads.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(500);
    fake.emit('onRewardedAdRewarded');
    expect(await p).toBe(true);
  });
  it('loaded, displayed or closed alone never reward', async () => {
    rewardedEvents('onRewardedAdLoaded', 'onRewardedAdDisplayed', 'onRewardedAdClosed');
    const p = ads.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(m.REWARD_GRACE_MS + 10);
    expect(await p).toBe(false);
  });
  it('duplicate reward events resolve once; a second ad needs its own reward event', async () => {
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdRewarded', 'onRewardedAdRewarded', 'onRewardedAdClosed');
    expect(await ads.rewardedAd(() => undefined)).toBe(true);
    fake.emit('onRewardedAdRewarded'); // stray late event with no ad on screen
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdClosed');
    const p = ads.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(m.REWARD_GRACE_MS + 10);
    expect(await p).toBe(false);
  });
  it('a display failure ends with no reward and does not start the game freeze', async () => {
    const onStart = vi.fn();
    rewardedEvents('onRewardedAdDisplayFailed');
    expect(await ads.rewardedAd(onStart)).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });
  it('a rejected show ends with no reward', async () => {
    fake.onShowRewarded = () => Promise.reject(new Error('not ready'));
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
  });
  it('an ad that never reports back ends after the timeout with no reward', async () => {
    const p = ads.rewardedAd(() => undefined);
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT_MS + 10);
    expect(await p).toBe(false);
  });
  it('a throwing game callback cannot break the flow', async () => {
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdRewarded', 'onRewardedAdClosed');
    expect(
      await ads.rewardedAd(() => {
        throw new Error('boom');
      }),
    ).toBe(true);
  });
  it('only one ad at a time', async () => {
    const first = ads.rewardedAd(() => undefined);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(ads.canShowRewarded()).toBe(false);
    fake.emit('onRewardedAdClosed');
    await vi.advanceTimersByTimeAsync(m.REWARD_GRACE_MS + 10);
    await first;
  });
  it('a rewarded ad that was watched holds back the next interstitial by the 180 s gap', async () => {
    const t0 = Date.now();
    rewardedEvents('onRewardedAdDisplayed', 'onRewardedAdRewarded', 'onRewardedAdClosed');
    expect(await ads.rewardedAd(() => undefined, t0)).toBe(true);
    fake.emit('onInterstitialAdLoaded');
    expect(ads.canShowAd(t0 + 1000)).toBe(false);
    expect(ads.canShowAd(t0 + AD_GAP_MS)).toBe(true);
  });
});

describe('interstitial ad', () => {
  beforeEach(async () => {
    await start();
  });
  it('shows, freezes the game through onStart and reports true after it closed', async () => {
    const onStart = vi.fn();
    interstitialEvents('onInterstitialAdDisplayed', 'onInterstitialAdClosed');
    expect(await ads.midgameAd(onStart)).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('no ad loaded: resolves false at once, no request, no spacing used up', async () => {
    fake.emit('onInterstitialAdLoadFailed');
    expect(ads.canShowAd(Date.now())).toBe(false);
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    expect(fake.called('showInterstitial')).toBe(0);
    fake.emit('onInterstitialAdLoaded');
    expect(ads.canShowAd(Date.now())).toBe(true);
  });
  it('the next interstitial waits for the 180 s gap, and the used ad must reload first', async () => {
    const t0 = Date.now();
    interstitialEvents('onInterstitialAdDisplayed', 'onInterstitialAdClosed');
    expect(await ads.midgameAd(() => undefined, t0)).toBe(true);
    fake.emit('onInterstitialAdLoaded'); // the plugin reloads after close
    expect(ads.canShowAd(t0 + AD_GAP_MS - 1)).toBe(false);
    expect(ads.canShowAd(t0 + AD_GAP_MS)).toBe(true);
  });
  it('at most 3 interstitials per day, then none until the next day', async () => {
    let t = Date.now();
    for (let i = 0; i < MAX_INTERSTITIALS_PER_DAY; i++) {
      fake.emit('onInterstitialAdLoaded');
      interstitialEvents('onInterstitialAdDisplayed', 'onInterstitialAdClosed');
      expect(await ads.midgameAd(() => undefined, t)).toBe(true);
      t += AD_GAP_MS;
    }
    fake.emit('onInterstitialAdLoaded');
    expect(ads.canShowAd(t)).toBe(false);
    expect(await ads.midgameAd(() => undefined, t)).toBe(false);
    expect(ads.canShowAd(t + 24 * 3600 * 1000)).toBe(true);
  });
  it('a failed display does not count against the daily cap', async () => {
    interstitialEvents('onInterstitialAdDisplayFailed');
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    const cap = new DailyCap();
    expect(cap.canShow(Date.now())).toBe(true);
  });
  it('a stuck ad ends after the timeout', async () => {
    const p = ads.midgameAd(() => undefined);
    await vi.advanceTimersByTimeAsync(AD_TIMEOUT_MS + 10);
    expect(await p).toBe(false);
  });
});

describe('daily cap storage', () => {
  it('survives an app restart and a broken storage', () => {
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    const now = new Date(2026, 10, 5, 9).getTime();
    const a = new DailyCap(2, store);
    a.record(now);
    a.record(now);
    expect(new DailyCap(2, store).canShow(now)).toBe(false);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const b = new DailyCap(1, broken);
    b.record(now);
    expect(b.canShow(now)).toBe(false); // memory copy still counts
  });
});

describe('banner', () => {
  beforeEach(async () => {
    await start();
  });
  it('shows once at the bottom, adaptive, never overlapping the game', async () => {
    m.levelplayBanner.show();
    m.levelplayBanner.show();
    await flush();
    expect(fake.called('createBanner')).toBe(1);
    expect(fake.calls.find((c) => c.fn === 'createBanner')?.arg).toEqual({
      adUnitId: 'bn1',
      adSize: 'ADAPTIVE',
      position: 'BOTTOM',
      isAutoShow: true,
      isOverlap: false,
    });
  });
  it('hide then show again reuses the same banner (no duplicate)', async () => {
    m.levelplayBanner.show();
    await flush();
    m.levelplayBanner.hide();
    expect(fake.called('hideBanner')).toBe(1);
    m.levelplayBanner.show();
    await flush();
    expect(fake.called('createBanner')).toBe(1);
    expect(fake.called('showBanner')).toBe(1);
  });
  it('leaving the title while the banner loads hides it as soon as it is up', async () => {
    let finish: () => void = () => undefined;
    fake.onCreateBanner = () => new Promise<void>((r) => (finish = r));
    m.levelplayBanner.show();
    m.levelplayBanner.hide();
    finish();
    await flush();
    expect(fake.called('hideBanner')).toBeGreaterThanOrEqual(1);
  });
  it('a banner that fails to load retries later while it is still wanted', async () => {
    fake.onCreateBanner = () => Promise.reject(new Error('no fill'));
    m.levelplayBanner.show();
    await flush();
    fake.onCreateBanner = () => Promise.resolve();
    await vi.advanceTimersByTimeAsync(m.RETRY_LOAD_MS + 10);
    expect(fake.called('createBanner')).toBe(2);
  });
  it('a banner that fails to load is not retried after the player left the title', async () => {
    fake.onCreateBanner = () => Promise.reject(new Error('no fill'));
    m.levelplayBanner.show();
    m.levelplayBanner.hide();
    await flush();
    await vi.advanceTimersByTimeAsync(m.RETRY_LOAD_MS + 10);
    expect(fake.called('createBanner')).toBe(1);
  });
});
