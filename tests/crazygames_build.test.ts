import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotateMessage } from '../src/systems/Orientation';
import { AudioSystem } from '../src/systems/AudioSystem';
import { INTRO_VIDEO_ENABLED, IS_CRAZYGAMES_BUILD } from '../src/build/target';

describe('build target', () => {
  it('the normal (test) build keeps the intro video; only --mode crazygames turns it off', () => {
    expect(IS_CRAZYGAMES_BUILD).toBe(false);
    expect(INTRO_VIDEO_ENABLED).toBe(true);
  });
});

describe('rotate overlay text', () => {
  const lock = vi.fn();
  it('offers a landscape button only outside an iframe on a browser that can lock', () => {
    expect(rotateMessage({ isIframe: false, lock })).toBe('Tap to play in landscape');
  });
  it('only asks to turn the phone inside an iframe (CrazyGames) or where locking is impossible', () => {
    expect(rotateMessage({ isIframe: true, lock })).toBe('Turn your phone sideways to play');
    expect(rotateMessage({ isIframe: false })).toBe('Turn your phone sideways to play');
  });
});

describe('sound after an interruption', () => {
  const g = globalThis as unknown as { AudioContext?: unknown };
  afterEach(() => {
    delete g.AudioContext;
  });

  function fakeContext(): { state: string; resume: ReturnType<typeof vi.fn>; suspend: ReturnType<typeof vi.fn> } {
    const node = (): Record<string, unknown> => ({
      connect: () => node(),
      start: () => undefined,
      gain: { value: 1, setTargetAtTime: () => undefined },
      frequency: { value: 0 },
    });
    const ctx = {
      state: 'running',
      destination: {},
      resume: vi.fn(async () => {
        ctx.state = 'running';
      }),
      suspend: vi.fn(async () => {
        ctx.state = 'suspended';
      }),
      currentTime: 0,
      sampleRate: 100,
      createGain: node,
      createBiquadFilter: node,
      createBufferSource: node,
      createBuffer: () => ({ getChannelData: () => new Float32Array(200) }),
    };
    g.AudioContext = function () {
      return ctx;
    };
    return ctx;
  }

  it('a tap restarts sound the browser interrupted (iOS)', () => {
    const ctx = fakeContext();
    const a = new AudioSystem();
    a.unlock();
    ctx.state = 'interrupted';
    a.resumeOnGesture();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('a tap does not undo a pause the game asked for (pause screen, ad)', () => {
    const ctx = fakeContext();
    const a = new AudioSystem();
    a.unlock();
    a.pauseAll();
    ctx.resume.mockClear();
    a.resumeOnGesture();
    a.unlock();
    expect(ctx.resume).not.toHaveBeenCalled();
    a.resumeAll();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the first unlock and while the sound is running', () => {
    const ctx = fakeContext();
    const a = new AudioSystem();
    expect(() => a.resumeOnGesture()).not.toThrow();
    a.unlock();
    a.resumeOnGesture();
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
