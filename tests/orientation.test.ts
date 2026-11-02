import { describe, expect, it, vi } from 'vitest';
import { canLock, enterLandscape, isPhoneLike, type OrientationEnv } from '../src/systems/Orientation';

const phone = (over: Partial<OrientationEnv> = {}): OrientationEnv => ({
  isIframe: false,
  coarsePointer: true,
  shortSide: 390,
  fullscreenElement: null,
  requestFullscreen: vi.fn().mockResolvedValue(undefined),
  lock: vi.fn().mockResolvedValue(undefined),
  ...over,
});

describe('phone detection', () => {
  it('touch devices with a short side under 900 are phones; desktops and big tablets are not', () => {
    expect(isPhoneLike({ coarsePointer: true, shortSide: 390 })).toBe(true);
    expect(isPhoneLike({ coarsePointer: true, shortSide: 820 })).toBe(true);
    expect(isPhoneLike({ coarsePointer: true, shortSide: 1024 })).toBe(false);
    expect(isPhoneLike({ coarsePointer: false, shortSide: 390 })).toBe(false);
  });
  it('can lock only where the browser offers orientation.lock', () => {
    expect(canLock({ lock: async () => {} })).toBe(true);
    expect(canLock({})).toBe(false);
  });
});

describe('enterLandscape', () => {
  it('enters fullscreen first, then locks landscape', async () => {
    const order: string[] = [];
    const env = phone({
      requestFullscreen: vi.fn(async () => void order.push('fullscreen')),
      lock: vi.fn(async () => void order.push('lock')),
    });
    expect(await enterLandscape(env)).toBe('locked');
    expect(order).toEqual(['fullscreen', 'lock']);
    expect(env.lock).toHaveBeenCalledWith('landscape');
  });

  it('does not ask for fullscreen twice when already fullscreen, but still locks', async () => {
    const env = phone({ fullscreenElement: {} });
    expect(await enterLandscape(env)).toBe('locked');
    expect(env.requestFullscreen).not.toHaveBeenCalled();
  });

  it('does nothing on desktop and inside an iframe (CrazyGames)', async () => {
    const a = phone({ coarsePointer: false });
    expect(await enterLandscape(a)).toBe('skipped');
    expect(a.requestFullscreen).not.toHaveBeenCalled();
    const b = phone({ isIframe: true });
    expect(await enterLandscape(b)).toBe('skipped');
    expect(b.lock).not.toHaveBeenCalled();
  });

  it('reports fullscreen when the lock is refused, and never throws', async () => {
    expect(await enterLandscape(phone({ lock: vi.fn().mockRejectedValue(new Error('NotSupportedError')) }))).toBe('fullscreen');
    expect(await enterLandscape(phone({ requestFullscreen: vi.fn().mockRejectedValue(new Error('denied')) }))).toBe('locked');
  });

  it('reports unsupported when the browser can do neither (iPhone Safari)', async () => {
    expect(await enterLandscape(phone({ requestFullscreen: undefined, lock: undefined }))).toBe('unsupported');
    expect(
      await enterLandscape(phone({ requestFullscreen: vi.fn().mockRejectedValue(new Error('x')), lock: vi.fn().mockRejectedValue(new Error('y')) })),
    ).toBe('unsupported');
  });
});
