/**
 * A fake of the `@capacitor-community/admob` plugin for tests. The test fires the plugin's events by hand (`emit`), so every path
 * (shown, dismissed, reward earned, failed) can be checked without a phone. One shared instance on globalThis, so it survives
 * `vi.resetModules()` in the routing tests.
 */
type Handler = (payload?: unknown) => void;

export class FakeAdmob {
  handlers = new Map<string, Set<Handler>>();
  calls: { fn: string; arg?: unknown }[] = [];
  /** What each plugin call does. Tests replace these. */
  onInitialize: () => Promise<void> = () => Promise.resolve();
  onPrepareInterstitial: () => Promise<unknown> = () => Promise.resolve({});
  onShowInterstitial: () => Promise<void> = () => Promise.resolve();
  onPrepareReward: () => Promise<unknown> = () => Promise.resolve({});
  onShowReward: () => Promise<unknown> = () => Promise.resolve({ type: 'x', amount: 1 });

  reset(): void {
    this.handlers.clear();
    this.calls = [];
    this.onInitialize = () => Promise.resolve();
    this.onPrepareInterstitial = () => Promise.resolve({});
    this.onShowInterstitial = () => Promise.resolve();
    this.onPrepareReward = () => Promise.resolve({});
    this.onShowReward = () => Promise.resolve({ type: 'x', amount: 1 });
  }
  called(fn: string): number {
    return this.calls.filter((c) => c.fn === fn).length;
  }
  listenerCount(): number {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }
  emit(event: string, payload?: unknown): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) h(payload);
  }

  // ---- the plugin surface the game uses
  initialize = (arg?: unknown): Promise<void> => {
    this.calls.push({ fn: 'initialize', arg });
    return this.onInitialize();
  };
  addListener = (event: string, fn: Handler): Promise<{ remove: () => Promise<void> }> => {
    this.calls.push({ fn: 'addListener', arg: event });
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
  prepareInterstitial = (arg: unknown): Promise<unknown> => {
    this.calls.push({ fn: 'prepareInterstitial', arg });
    return this.onPrepareInterstitial();
  };
  showInterstitial = (): Promise<void> => {
    this.calls.push({ fn: 'showInterstitial' });
    return this.onShowInterstitial();
  };
  prepareRewardVideoAd = (arg: unknown): Promise<unknown> => {
    this.calls.push({ fn: 'prepareRewardVideoAd', arg });
    return this.onPrepareReward();
  };
  showRewardVideoAd = (): Promise<unknown> => {
    this.calls.push({ fn: 'showRewardVideoAd' });
    return this.onShowReward();
  };
}

export function fakeAdmob(): FakeAdmob {
  const g = globalThis as unknown as { __fakeAdmob?: FakeAdmob };
  g.__fakeAdmob ??= new FakeAdmob();
  return g.__fakeAdmob;
}

/** Factory for `vi.mock('@capacitor-community/admob', ...)`: the real event-name enums, the fake plugin object. */
export async function fakeAdmobModule(): Promise<Record<string, unknown>> {
  const real = await vi_importActual();
  return { ...real, AdMob: fakeAdmob() };
}

async function vi_importActual(): Promise<Record<string, unknown>> {
  const { vi } = await import('vitest');
  return (await vi.importActual('@capacitor-community/admob')) as Record<string, unknown>;
}
