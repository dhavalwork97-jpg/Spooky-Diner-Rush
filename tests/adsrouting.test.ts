import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { fakeAdmob } from './helpers/fakeAdmob';

vi.mock('@capacitor-community/admob', async () => (await import('./helpers/fakeAdmob')).fakeAdmobModule());

type Cb = { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void };
const g = globalThis as unknown as { CrazyGames?: unknown; window?: unknown };
const fake = fakeAdmob();
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
    it(`mode "${mode}": ads go to the CrazyGames SDK, AdMob is never touched`, async () => {
      const { ads, initAds } = await loadAds(mode);
      await initAds();
      expect(ads.canShowRewarded()).toBe(true);
      expect(await ads.midgameAd(() => undefined)).toBe(true);
      expect(await ads.rewardedAd(() => undefined)).toBe(true);
      expect(requestAd.mock.calls.map((c) => c[0])).toEqual(['midgame', 'rewarded']);
      expect(fake.calls).toEqual([]); // no initialize, no listener, no ad request
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

describe('the Android build uses AdMob only', () => {
  it('before AdMob is ready there is no ad, and CrazyGames is NOT used as a stand-in', async () => {
    const { ads } = await loadAds('android');
    expect(ads.canShowRewarded()).toBe(false);
    expect(ads.canShowAd()).toBe(false);
    expect(await ads.midgameAd(() => undefined)).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });

  it('after initAds the game talks to AdMob, never to CrazyGames', async () => {
    const { ads, initAds } = await loadAds('android');
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
  });

  it('if AdMob fails to start there are no ads at all (still no CrazyGames fallback)', async () => {
    fake.onInitialize = () => Promise.reject(new Error('no play services'));
    const { ads, initAds } = await loadAds('android');
    await expect(initAds()).resolves.toBeUndefined();
    expect(ads.canShowRewarded()).toBe(false);
    expect(await ads.rewardedAd(() => undefined)).toBe(false);
    expect(requestAd).not.toHaveBeenCalled();
  });
});
