import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { fakeAdmob } from './helpers/fakeAdmob';
import { fakeLevelPlay } from './helpers/fakeLevelPlay';

vi.mock('@capacitor-community/admob', async () => (await import('./helpers/fakeAdmob')).fakeAdmobModule());
vi.mock('capacitor-levelplay-ads', async () => (await import('./helpers/fakeLevelPlay')).fakeLevelPlayModule());

type Cb = { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void };
const g = globalThis as unknown as { CrazyGames?: unknown; window?: unknown };
const fake = fakeAdmob();
const lp = fakeLevelPlay();
const requestAd = vi.fn((_type: string, cb: Cb) => {
  cb.adStarted?.();
  cb.adFinished?.();
});

/** A fresh copy of the ads facade, evaluated under the given build mode (the mode is read when the module loads). */
async function loadAds(mode: string): Promise<typeof import('../src/ads')> {
  vi.stubEnv('MODE', mode);
  vi.resetModules();
  return import('../src/ads');
}

beforeEach(() => {
  fake.reset();
  lp.reset();
  requestAd.mockClear();
  g.CrazyGames = { SDK: { ad: { requestAd } } };
  if (!g.window) g.window = globalThis;
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete g.CrazyGames;
});

describe('browser and CrazyGames builds use CrazyGames only', () => {
  for (const mode of ['production', 'crazygames']) {
    it(`mode "${mode}": ads go to the CrazyGames SDK, AdMob is never touched`, async () => {
      vi.stubEnv('VITE_ENABLE_ADS', 'true'); // browser ads are switched off by default for the CrazyGames basic launch; this test is about routing
      const { ads, initAds } = await loadAds(mode);
      await initAds();
      expect(ads.canShowRewarded()).toBe(true);
      expect(await ads.midgameAd(() => undefined)).toBe(true);
      expect(await ads.rewardedAd(() => undefined)).toBe(true);
      expect(requestAd.mock.calls.map((c) => c[0])).toEqual(['midgame', 'rewarded']);
      expect(fake.calls).toEqual([]); // no initialize, no listener, no ad request
      expect(lp.calls).toEqual([]);
    });
  }

  it('without the CrazyGames SDK there is simply no ad and no rewarded button (and still no AdMob)', async () => {
    delete g.CrazyGames;
    const { ads, initAds } = await loadAds('production');
    await initAds();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(fake.calls).toEqual([]);
  });
});

describe('the Android store build (android-play) uses AdMob only', () => {
  it('before AdMob is ready there is no ad, and CrazyGames is NOT used as a stand-in', async () => {
    const { ads } = await loadAds('android-play');
    expect(ads.canShowRewarded()).toBe(false);
    expect(ads.canShowAd()).toBe(false);
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('after initAds the game talks to AdMob, never to CrazyGames', async () => {
    const { ads, initAds } = await loadAds('android-play');
    await initAds();
    expect(fake.called('initialize')).toBe(1);
    expect(ads.canShowRewarded()).toBe(true);

    fake.onShowInterstitial = () => {
      fake.emit(InterstitialAdPluginEvents.Showed);
      fake.emit(InterstitialAdPluginEvents.Dismissed);
      return Promise.resolve();
    };
    expect(await ads.midgameAd(() => undefined)).toBe(true);
    expect(fake.called('prepareInterstitial')).toBe(1);

    fake.onShowReward = () => {
      fake.emit(RewardAdPluginEvents.Showed);
      fake.emit(RewardAdPluginEvents.Rewarded);
      fake.emit(RewardAdPluginEvents.Dismissed);
      return Promise.resolve({ type: 'x', amount: 1 });
    };
    expect(await ads.rewardedAd(() => undefined)).toBe(true);
    expect(fake.called('prepareRewardVideoAd')).toBe(1);
    expect(requestAd).not.toHaveBeenCalled();
    expect(lp.calls).toEqual([]); // LevelPlay is never touched in the store build
  });

  it('if AdMob fails to start there are no ads at all (still no CrazyGames fallback)', async () => {
    fake.onInitialize = () => Promise.reject(new Error('no play services'));
    const { ads, initAds } = await loadAds('android-play');
    await expect(initAds()).resolves.toBeUndefined();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });
});

describe('the Android direct build (android-direct) uses LevelPlay only', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_LEVELPLAY_APP_KEY', 'testkey');
    vi.stubEnv('VITE_LEVELPLAY_REWARDED_ID', 'rw1');
    vi.stubEnv('VITE_LEVELPLAY_INTERSTITIAL_ID', 'in1');
    vi.stubEnv('VITE_LEVELPLAY_BANNER_ID', 'bn1');
  });

  it('before LevelPlay is ready there is no ad, and CrazyGames is NOT used as a stand-in', async () => {
    const { ads } = await loadAds('android-direct');
    expect(ads.canShowRewarded()).toBe(false);
    expect(ads.canShowAd()).toBe(false);
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('after initAds the game talks to LevelPlay, never to CrazyGames or AdMob', async () => {
    const { ads, initAds } = await loadAds('android-direct');
    await initAds();
    await Promise.resolve();
    expect(lp.called('initialize')).toBe(1);
    expect(lp.calls.find((c) => c.fn === 'initialize')?.arg).toEqual({ appKey: 'testkey', isTesting: false });
    expect(ads.canShowRewarded()).toBe(true);

    lp.onShowInterstitial = () => {
      lp.emit('onInterstitialAdDisplayed');
      lp.emit('onInterstitialAdClosed');
      return Promise.resolve();
    };
    expect(await ads.midgameAd(() => undefined)).toBe(true);

    lp.onShowRewarded = () => {
      lp.emit('onRewardedAdDisplayed');
      lp.emit('onRewardedAdRewarded');
      lp.emit('onRewardedAdClosed');
      return Promise.resolve();
    };
    expect(await ads.rewardedAd(() => undefined)).toBe(true);
    expect(requestAd).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]); // AdMob is never touched in the direct build
  });

  it('without ids in the env there are no ads and LevelPlay is never started', async () => {
    vi.unstubAllEnvs();
    const { ads, initAds } = await loadAds('android-direct');
    await initAds();
    expect(lp.calls).toEqual([]);
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
  });

  it('if LevelPlay fails to start there are no ads at first (still no CrazyGames fallback) and the game is not blocked', async () => {
    lp.onInitialize = () => Promise.reject(new Error('offline'));
    const { ads, initAds } = await loadAds('android-direct');
    await expect(initAds()).resolves.toBeUndefined();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('the banner request made before LevelPlay started is replayed once it has', async () => {
    const { banner, initAds } = await loadAds('android-direct');
    banner.show(); // the title screen asks first
    expect(lp.called('createBanner')).toBe(0);
    await initAds();
    await Promise.resolve();
    expect(lp.called('createBanner')).toBe(1);
  });
});

describe('banners exist only in the direct build', () => {
  for (const mode of ['production', 'crazygames', 'android-play']) {
    it(`mode "${mode}" never creates a banner`, async () => {
      const { banner, initAds } = await loadAds(mode);
      await initAds();
      banner.show();
      banner.hide();
      expect(lp.calls).toEqual([]);
    });
  }
});
