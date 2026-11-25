import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/systems/AudioSystem';
import { BAR, BPM, CHORDS, COMPING, LOOP_BARS, MELODY, midiToHz } from '../src/systems/lofiMusic';

describe('lofi music data', () => {
  it('is slow and relaxed: about 70-80 bpm', () => {
    expect(BPM).toBeGreaterThanOrEqual(65);
    expect(BPM).toBeLessThanOrEqual(85);
    expect(BAR).toBeCloseTo(4 * (60 / BPM), 6);
  });
  it('has one chord, one comping pattern entry and one melody entry per bar of the loop', () => {
    expect(LOOP_BARS).toBe(8);
    expect(MELODY.length).toBe(LOOP_BARS);
    expect(COMPING.length).toBeGreaterThanOrEqual(2);
  });
  it('keeps every note in a soft, warm range and inside its bar', () => {
    for (const c of CHORDS) {
      expect(midiToHz(c.bass)).toBeGreaterThan(40);
      for (const m of c.keys) {
        expect(midiToHz(m)).toBeGreaterThan(150);
        expect(midiToHz(m)).toBeLessThan(500);
      }
    }
    for (const bar of MELODY) for (const [beat, m, len] of bar) {
      expect(beat).toBeGreaterThanOrEqual(0);
      expect(beat).toBeLessThan(4);
      expect(len).toBeGreaterThan(0);
      expect(midiToHz(m)).toBeLessThan(1200);
      expect([0, 2, 4, 7, 9]).toContain(m % 12); // C major pentatonic: always sounds good over the chords
    }
    for (const pattern of COMPING) for (const [beat, len] of pattern) expect(beat + len).toBeLessThanOrEqual(4 + 0.5);
  });
});

describe('lofi music playback', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function fakeCtx() {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
    const node = () => {
      const n: Record<string, unknown> = { gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), attack: param(), release: param(), start: vi.fn(), stop: vi.fn(), type: '' };
      n.connect = vi.fn((x: unknown) => x);
      return n;
    };
    const ctx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      createGain: vi.fn(node),
      createOscillator: vi.fn(node),
      createBiquadFilter: vi.fn(node),
      createDynamicsCompressor: vi.fn(node),
      createBufferSource: vi.fn(node),
      createBuffer: vi.fn((_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })),
      resume: vi.fn(),
      suspend: vi.fn(),
    };
    vi.stubGlobal('AudioContext', function () { return ctx; });
    vi.stubGlobal('window', { setInterval: (f: () => void, ms: number) => setInterval(f, ms), clearInterval: (id: number) => clearInterval(id) });
    return ctx;
  }

  it('plays ahead on the audio clock, never twice, and keeps going as time passes', () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    const a = new AudioSystem();
    a.unlock();
    const base = ctx.createOscillator.mock.calls.length;
    a.startMusic();
    vi.advanceTimersByTime(600);
    const first = ctx.createOscillator.mock.calls.length - base;
    expect(first).toBeGreaterThan(20); // pads, piano, bass, kick and melody for the first bars
    a.startMusic(); // a second start must not double up
    ctx.currentTime = 20;
    vi.advanceTimersByTime(600);
    expect(ctx.createOscillator.mock.calls.length - base).toBeGreaterThan(first);
  });

  it('stops scheduling after stopMusic and stays silent while the sound is suspended', () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    const a = new AudioSystem();
    a.unlock();
    a.startMusic();
    vi.advanceTimersByTime(600);
    a.stopMusic();
    const after = ctx.createOscillator.mock.calls.length;
    ctx.currentTime = 50;
    vi.advanceTimersByTime(5000);
    expect(ctx.createOscillator.mock.calls.length).toBe(after);
    ctx.state = 'suspended';
    a.startMusic();
    vi.advanceTimersByTime(2000);
    expect(ctx.createOscillator.mock.calls.length).toBe(after);
  });
});
