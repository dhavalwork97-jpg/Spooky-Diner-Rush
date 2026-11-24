import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POKI_AD_TIMEOUT_MS, Poki } from '../src/sdk/poki';
import { DEV_PARAMS, isScrollKey, stripDevParams } from '../src/build/devParams';

const g = globalThis as unknown as { PokiSDK?: unknown; window?: unknown };

/** A tiny fake window so the "first input" listener can be fired by the test. */
function fakeWindow(): { fire: () => void } {
  const handlers: Array<() => void> = [];
  g.window = {
    addEventListener: (_t: string, h: () => void) => handlers.push(h),
    removeEventListener: (_t: string, h: () => void) => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    },
  };
  return { fire: () => [...handlers].forEach((h) => h()) };
}

function sdk(extra: Record<string, unknown> = {}): { calls: string[] } {
  const calls: string[] = [];
  g.PokiSDK = {
    init: async () => void calls.push('init'),
    gameLoadingFinished: () => calls.push('loaded'),
    gameplayStart: () => calls.push('start'),
    gameplayStop: () => calls.push('stop'),
    commercialBreak: async (cb?: () => void) => {
      calls.push('commercial');
      cb?.();
    },
    rewardedBreak: async (cb?: () => void) => {
      cb?.();
      return true;
    },
    ...extra,
  };
  return { calls };
}

beforeEach(() => {
  Poki._reset();
});
afterEach(() => {
  delete g.PokiSDK;
  delete g.window;
  vi.useRealTimers();
});

describe('Poki SDK wrapper', () => {
  it('is a quiet no-op without the SDK', async () => {
    expect(Poki.canShowAd()).toBe(false);
    expect(await Poki.midgameAd(() => {})).toBe(false);
    expect(await Poki.rewardedAd(() => {})).toBe(false);
    await expect(Poki.init(10)).resolves.toBeUndefined();
    expect(() => {
      Poki.loadingStart();
      Poki.loadingStop();
      Poki.gameplayStart();
      Poki.gameplayStop();
    }).not.toThrow();
  });

  it('init never throws when the SDK fails', async () => {
    sdk({ init: async () => Promise.reject(new Error('blocked')) });
    await expect(Poki.init(50)).resolves.toBeUndefined();
  });

  it('reports loading finished', () => {
    const { calls } = sdk();
    Poki.loadingStop();
    expect(calls).toEqual(['loaded']);
  });

  it('sends gameplayStart only after the first input, and never twice in a row', () => {
    const w = fakeWindow();
    const { calls } = sdk();
    Poki.gameplayStart();
    expect(calls).toEqual([]);
    w.fire();
    expect(calls).toEqual(['start']);
    Poki.gameplayStart();
    expect(calls).toEqual(['start']);
    Poki.gameplayStop();
    Poki.gameplayStop();
    expect(calls).toEqual(['start', 'stop']);
  });

  it('does not start if gameplay was stopped before the first input', () => {
    const w = fakeWindow();
    const { calls } = sdk();
    Poki.gameplayStart();
    Poki.gameplayStop();
    w.fire();
    expect(calls).toEqual([]);
  });

  it('stops gameplay before a commercial break and reports whether an ad started', async () => {
    const w = fakeWindow();
    const { calls } = sdk();
    Poki.gameplayStart();
    w.fire();
    const onStart = vi.fn();
    expect(await Poki.midgameAd(onStart)).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    expect(calls).toEqual(['start', 'stop', 'commercial']);
  });

  it('resumes gameplay when no ad came', async () => {
    const w = fakeWindow();
    const { calls } = sdk({ commercialBreak: async () => {} });
    Poki.gameplayStart();
    w.fire();
    const onStart = vi.fn();
    expect(await Poki.midgameAd(onStart)).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('has no cooldown of its own: every request goes to Poki', async () => {
    sdk();
    expect(await Poki.midgameAd(() => {})).toBe(true);
    expect(await Poki.midgameAd(() => {})).toBe(true);
    expect(Poki.canShowAd()).toBe(true);
  });

  it('sends no gameplay events while an ad is playing', async () => {
    const w = fakeWindow();
    const { calls } = sdk({
      commercialBreak: async (cb?: () => void) => {
        cb?.();
        Poki.gameplayStart();
        Poki.gameplayStop();
      },
    });
    Poki.gameplayStart();
    w.fire();
    await Poki.midgameAd(() => {});
    expect(calls).toEqual(['start', 'stop']);
  });

  it('grants a reward only on success', async () => {
    sdk();
    expect(await Poki.rewardedAd(() => {})).toBe(true);
    sdk({ rewardedBreak: async () => false });
    expect(await Poki.rewardedAd(() => {})).toBe(false);
    sdk({ rewardedBreak: async () => Promise.reject(new Error('blocker')) });
    expect(await Poki.rewardedAd(() => {})).toBe(false);
    sdk({ rewardedBreak: async () => 'yes' });
    expect(await Poki.rewardedAd(() => {})).toBe(false);
  });

  it('gives up on a rewarded video that never answers, without a reward', async () => {
    vi.useFakeTimers();
    sdk({ rewardedBreak: () => new Promise(() => {}) });
    const p = Poki.rewardedAd(() => {});
    await vi.advanceTimersByTimeAsync(91_000);
    expect(await p).toBe(false);
  });

  it('does not pause when Poki has no rewarded ad to show', async () => {
    const onStart = vi.fn();
    sdk({ rewardedBreak: async () => false });
    expect(await Poki.rewardedAd(onStart)).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
    expect(Poki._state.inAd).toBe(false);
  });

  it('ignores a rewarded ad start callback that arrives after timeout', async () => {
    vi.useFakeTimers();
    let lateStart: (() => void) | undefined;
    const onStart = vi.fn();
    sdk({ rewardedBreak: (cb?: () => void) => {
      lateStart = cb;
      return new Promise<boolean>(() => {});
    } });
    const p = Poki.rewardedAd(onStart);
    await vi.advanceTimersByTimeAsync(POKI_AD_TIMEOUT_MS + 1);
    expect(await p).toBe(false);
    lateStart?.();
    expect(onStart).not.toHaveBeenCalled();
    expect(Poki._state.inAd).toBe(false);
  });

  it('ignores a commercial ad start callback that arrives after timeout', async () => {
    vi.useFakeTimers();
    const w = fakeWindow();
    let lateStart: (() => void) | undefined;
    const onStart = vi.fn();
    const { calls } = sdk({ commercialBreak: (cb?: () => void) => {
      lateStart = cb;
      return new Promise<void>(() => {});
    } });
    Poki.gameplayStart();
    w.fire();
    const p = Poki.midgameAd(onStart);
    await vi.advanceTimersByTimeAsync(POKI_AD_TIMEOUT_MS + 1);
    expect(await p).toBe(false);
    lateStart?.();
    expect(onStart).not.toHaveBeenCalled();
    expect(Poki._state.inAd).toBe(false);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('keeps no saves in the SDK', () => {
    expect(Poki.getItem()).toBeNull();
    expect(Poki.setItem()).toBe(false);
  });
});

describe('dev URL switches', () => {
  it('removes every developer switch', () => {
    const q = '?' + DEV_PARAMS.map((k) => `${k}=1`).join('&');
    expect(stripDevParams(q)).toBe('');
  });
  it('keeps Poki and other parameters', () => {
    expect(stripDevParams('?debug=1&gdsrc=x&level=9&gdpid=7')).toBe('?gdsrc=x&gdpid=7');
    expect(stripDevParams('')).toBe('');
    expect(stripDevParams('?test')).toBe('');
  });
});

describe('scroll keys', () => {
  it('blocks arrows up/down and space only', () => {
    expect(isScrollKey({ code: 'ArrowUp' })).toBe(true);
    expect(isScrollKey({ code: 'ArrowDown' })).toBe(true);
    expect(isScrollKey({ code: 'Space' })).toBe(true);
    expect(isScrollKey({ key: ' ' })).toBe(true);
    expect(isScrollKey({ code: 'KeyA', key: 'a' })).toBe(false);
    expect(isScrollKey({ code: 'Escape', key: 'Escape' })).toBe(false);
  });
});
