import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_GAP_MS, CrazyGames } from '../src/sdk/crazygames';

type Cb = { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void };
const g = globalThis as unknown as { CrazyGames?: unknown; window?: unknown };

function install(requestAd: (t: string, cb: Cb) => void, game: Record<string, () => void> = {}): void {
  g.CrazyGames = { SDK: { ad: { requestAd }, game } };
}

beforeEach(() => {
  CrazyGames._reset();
  if (!g.window) g.window = globalThis;
});
afterEach(() => {
  delete g.CrazyGames;
  vi.useRealTimers();
});

describe('CrazyGames ads and loading', () => {
  it('is a quiet no-op without the SDK', async () => {
    expect(CrazyGames.canShowAd()).toBe(false);
    const start = vi.fn();
    expect(await CrazyGames.midgameAd(start)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(() => {
      CrazyGames.loadingStart();
      CrazyGames.loadingStop();
    }).not.toThrow();
  });

  it('calls onStart when the ad starts and resolves true when it finishes', async () => {
    install((_t, cb) => {
      cb.adStarted?.();
      cb.adFinished?.();
    });
    const start = vi.fn();
    expect(await CrazyGames.midgameAd(start)).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it('resolves false on an ad error and does not call onStart', async () => {
    install((_t, cb) => cb.adError?.('no fill'));
    const start = vi.fn();
    expect(await CrazyGames.midgameAd(start)).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('survives an SDK that throws', async () => {
    install(() => {
      throw new Error('boom');
    });
    expect(await CrazyGames.midgameAd(() => undefined)).toBe(false);
  });

  it('keeps a cooldown between ads', async () => {
    install((_t, cb) => {
      cb.adStarted?.();
      cb.adFinished?.();
    });
    const t0 = 1_000_000;
    expect(await CrazyGames.midgameAd(() => undefined, t0)).toBe(true);
    expect(CrazyGames.canShowAd(t0 + AD_GAP_MS - 1)).toBe(false);
    expect(await CrazyGames.midgameAd(() => undefined, t0 + 1000)).toBe(false);
    expect(CrazyGames.canShowAd(t0 + AD_GAP_MS)).toBe(true);
  });

  it('gives up on an ad that never reports back', async () => {
    vi.useFakeTimers();
    install((_t, cb) => cb.adStarted?.());
    const p = CrazyGames.midgameAd(() => undefined);
    await vi.advanceTimersByTimeAsync(91_000);
    expect(await p).toBe(true);
  });

  it('sends loadingStart and loadingStop once each', () => {
    const game = { loadingStart: vi.fn(), loadingStop: vi.fn() };
    install(() => undefined, game);
    CrazyGames.loadingStop(); // before start: ignored
    CrazyGames.loadingStart();
    CrazyGames.loadingStart();
    CrazyGames.loadingStop();
    CrazyGames.loadingStop();
    expect(game.loadingStart).toHaveBeenCalledOnce();
    expect(game.loadingStop).toHaveBeenCalledOnce();
  });
});
