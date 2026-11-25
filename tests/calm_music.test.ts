import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/systems/AudioSystem';
import { BAR, BEAT, CHORDS, LOOP_BARS, MELODY } from '../src/systems/calmMusic';

describe('calm music data', () => {
  it('is slow: 60 bpm, a bar of 4 s', () => {
    expect(BEAT).toBeGreaterThanOrEqual(0.9);
    expect(BAR).toBe(4 * BEAT);
  });
  it('stays in a soft, low-to-middle range and every melody note fits inside its bar', () => {
    for (const c of CHORDS) for (const f of [c.bass, ...c.pad]) expect(f).toBeGreaterThan(70), expect(f).toBeLessThan(700);
    for (const line of MELODY) for (const bar of line) for (const n of bar) {
      expect(n.freq).toBeGreaterThan(200);
      expect(n.freq).toBeLessThan(700);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat).toBeLessThan(4);
      expect(n.len).toBeGreaterThan(0);
    }
  });
  it('every melody line has one entry per chord, and the loop is two lines long', () => {
    for (const line of MELODY) expect(line.length).toBe(CHORDS.length);
    expect(LOOP_BARS).toBe(MELODY.length * CHORDS.length);
  });
});

describe('calm music playback', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function fakeCtx() {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
    const node = () => ({ connect: vi.fn((n: unknown) => n), gain: param(), frequency: param(), start: vi.fn(), stop: vi.fn(), type: '' });
    const ctx = { state: 'running', currentTime: 0, destination: {}, createGain: vi.fn(node), createOscillator: vi.fn(node), resume: vi.fn(), suspend: vi.fn() };
    vi.stubGlobal('AudioContext', function () { return ctx; });
    vi.stubGlobal('window', { setInterval: (f: () => void, ms: number) => setInterval(f, ms), clearInterval: (id: number) => clearInterval(id) });
    return ctx;
  }

  it('schedules pads ahead on the audio clock, stops cleanly, and stays silent while the sound is stopped', () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    const a = new AudioSystem();
    a.unlock();
    const before = ctx.createOscillator.mock.calls.length;
    a.startMusic();
    vi.advanceTimersByTime(600);
    const first = ctx.createOscillator.mock.calls.length - before;
    expect(first).toBeGreaterThanOrEqual(4); // bass + 3 pad notes at least
    a.startMusic(); // a second start must not double up
    ctx.currentTime = 10;
    vi.advanceTimersByTime(600);
    a.stopMusic();
    const after = ctx.createOscillator.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(ctx.createOscillator.mock.calls.length).toBe(after);
    ctx.state = 'suspended';
    a.startMusic();
    vi.advanceTimersByTime(2000);
    expect(ctx.createOscillator.mock.calls.length).toBe(after);
  });
});
