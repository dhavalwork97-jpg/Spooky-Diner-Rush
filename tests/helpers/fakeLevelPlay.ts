/**
 * A fake of the `capacitor-levelplay-ads` plugin for tests. Tests fire the plugin's events by hand (`emit`), so every path
 * (loaded, displayed, closed, reward earned, failed) can be checked without a phone. One shared instance on globalThis,
 * so it survives `vi.resetModules()` in the routing tests.
 */
type Handler = (payload?: unknown) => void;

export class FakeLevelPlay {
  handlers = new Map<string, Set<Handler>>();
  calls: { fn: string; arg?: unknown }[] = [];
  /** What each plugin call does. Tests replace these. By default a load succeeds (and fires the loaded event, like the real plugin). */
  onInitialize: () => Promise<unknown> = () => Promise.resolve({ status: 'INITIALIZED_SUCCESSFULLY' });
  onLoad: (kind: 'rewarded' | 'interstitial') => Promise<void> = (kind) => {
    this.emit(kind === 'rewarded' ? 'onRewardedAdLoaded' : 'onInterstitialAdLoaded');
    return Promise.resolve();
  };
  onShowInterstitial: () => Promise<void> = () => Promise.resolve();
  onShowRewarded: () => Promise<void> = () => Promise.resolve();
  onCreateBanner: () => Promise<void> = () => Promise.resolve();

  reset(): void {
    this.handlers.clear();
    this.calls = [];
    this.onInitialize = () => Promise.resolve({ status: 'INITIALIZED_SUCCESSFULLY' });
    this.onLoad = (kind) => {
      this.emit(kind === 'rewarded' ? 'onRewardedAdLoaded' : 'onInterstitialAdLoaded');
      return Promise.resolve();
    };
    this.onShowInterstitial = () => Promise.resolve();
    this.onShowRewarded = () => Promise.resolve();
    this.onCreateBanner = () => Promise.resolve();
  }
  called(fn: string): number {
    return this.calls.filter((c) => c.fn === fn).length;
  }
  emit(event: string, payload?: unknown): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) h(payload);
  }

  // ---- the plugin surface the game uses
  initialize = (arg: unknown): Promise<unknown> => {
    this.calls.push({ fn: 'initialize', arg });
    return this.onInitialize();
  };
  addListener = (event: string, fn: Handler): Promise<{ remove: () => Promise<void> }> => {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(fn);
    this.handlers.set(event, set);
    return Promise.resolve({
      remove: () => {
        set.delete(fn);
        return Promise.resolve();
      },
    });
  };
  loadRewarded = (arg: unknown): Promise<void> => {
    this.calls.push({ fn: 'loadRewarded', arg });
    return this.onLoad('rewarded');
  };
  loadInterstitial = (arg: unknown): Promise<void> => {
    this.calls.push({ fn: 'loadInterstitial', arg });
    return this.onLoad('interstitial');
  };
  showRewarded = (): Promise<void> => {
    this.calls.push({ fn: 'showRewarded' });
    return this.onShowRewarded();
  };
  showInterstitial = (): Promise<void> => {
    this.calls.push({ fn: 'showInterstitial' });
    return this.onShowInterstitial();
  };
  createBanner = (arg: unknown): Promise<void> => {
    this.calls.push({ fn: 'createBanner', arg });
    return this.onCreateBanner();
  };
  showBanner = (): Promise<void> => {
    this.calls.push({ fn: 'showBanner' });
    return Promise.resolve();
  };
  hideBanner = (): Promise<void> => {
    this.calls.push({ fn: 'hideBanner' });
    return Promise.resolve();
  };
}

export function fakeLevelPlay(): FakeLevelPlay {
  const g = globalThis as unknown as { __fakeLevelPlay?: FakeLevelPlay };
  g.__fakeLevelPlay ??= new FakeLevelPlay();
  return g.__fakeLevelPlay;
}

/** Factory for `vi.mock('capacitor-levelplay-ads', ...)`: the real event-name constants, the fake plugin object. */
export async function fakeLevelPlayModule(): Promise<Record<string, unknown>> {
  const { vi } = await import('vitest');
  const real = (await vi.importActual('capacitor-levelplay-ads')) as Record<string, unknown>;
  return { ...real, LevelPlayAds: fakeLevelPlay() };
}
