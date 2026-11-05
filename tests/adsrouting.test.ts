import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLevelPlay } from './helpers/fakeLevelPlay';

vi.mock('capacitor-levelplay-ads', async () => (await import('./helpers/fakeLevelPlay')).fakeLevelPlayModule());

type Cb = { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void };
const g = globalThis as unknown as { CrazyGames?: unknown; window?: unknown };
const fake = fakeLevelPlay();
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
    it(`mode "${mode}": ads go to the CrazyGames SDK, LevelPlay is never touched`, async () => {
      const { ads, initAds } = await loadAds(mode);
      await initAds();
      expect(ads.canShowRewarded()).toBe(true);
      expect(await ads.midgameAd(() => undefined)).toBe(true);
      expect(await ads.rewardedAd(() => undefined)).toBe(true);
      expect(requestAd.mock.calls.map((c) => c[0])).toEqual(['midgame', 'rewarded']);
      expect(fake.calls).toEqual([]); // no initialize, no ad request, no banner
    });
  }

  it('without the CrazyGames SDK there is simply no ad and no rewarded button (and still no LevelPlay)', async () => {
    delete g.CrazyGames;
    const { ads, initAds } = await loadAds('production');
    await initAds();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(fake.calls).toEqual([]);
  });
});

describe('the Android build uses LevelPlay only', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_LEVELPLAY_APP_KEY', 'testkey');
    vi.stubEnv('VITE_LEVELPLAY_REWARDED_ID', 'rw1');
    vi.stubEnv('VITE_LEVELPLAY_INTERSTITIAL_ID', 'in1');
    vi.stubEnv('VITE_LEVELPLAY_BANNER_ID', 'bn1');
  });

  it('before LevelPlay is ready there is no ad, and CrazyGames is NOT used as a stand-in', async () => {
    const { ads } = await loadAds('android');
    expect(ads.canShowRewarded()).toBe(false);
    expect(ads.canShowAd()).toBe(false);
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('after initAds the game talks to LevelPlay, never to CrazyGames', async () => {
    const { ads, initAds } = await loadAds('android');
    await initAds();
    await Promise.resolve();
    expect(fake.called('initialize')).toBe(1);
    expect(fake.calls.find((c) => c.fn === 'initialize')?.arg).toEqual({ appKey: 'testkey', isTesting: false });
    expect(ads.canShowRewarded()).toBe(true);

    fake.onShowInterstitial = () => {
      fake.emit('onInterstitialAdDisplayed');
      fake.emit('onInterstitialAdClosed');
      return Promise.resolve();
    };
    expect(await ads.midgameAd(() => undefined)).toBe(true);

    fake.onShowRewarded = () => {
      fake.emit('onRewardedAdDisplayed');
      fake.emit('onRewardedAdRewarded');
      fake.emit('onRewardedAdClosed');
      return Promise.resolve();
    };
    expect(await ads.rewardedAd(() => undefined)).toBe(true);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('without ids in the env there are no ads and LevelPlay is never started', async () => {
    vi.unstubAllEnvs();
    const { ads, initAds } = await loadAds('android');
    await initAds();
    expect(fake.calls).toEqual([]);
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
  });

  it('if LevelPlay fails to start there are no ads at first (still no CrazyGames fallback) and the game is not blocked', async () => {
    fake.onInitialize = () => Promise.reject(new Error('offline'));
    const { ads, initAds } = await loadAds('android');
    await expect(initAds()).resolves.toBeUndefined();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('the banner request made before LevelPlay started is replayed once it has', async () => {
    const { banner, initAds } = await loadAds('android');
    banner.show(); // the title screen asks first
    expect(fake.called('createBanner')).toBe(0);
    await initAds();
    await Promise.resolve();
    expect(fake.called('createBanner')).toBe(1);
  });

  it('browser builds never create a banner', async () => {
    const { banner, initAds } = await loadAds('production');
    await initAds();
    banner.show();
    banner.hide();
    expect(fake.calls).toEqual([]);
  });
});
