/**
 * Soft lofi background music, made of plain WebAudio nodes (the game ships no music files).
 * The music is data (chords, beat and melody tables) plus a small player that schedules one bar at a time.
 * Everything is continuous: pads and crackle never stop, and notes overlap the bar lines.
 */
export const BPM = 74;
export const BEAT = 60 / BPM;
export const BEATS_PER_BAR = 4;
export const BAR = BEAT * BEATS_PER_BAR;
/** How far (in beats) the off-beat eighth notes are pushed late: the lazy lofi swing. */
export const SWING = 0.16;

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface Chord {
  /** Bass note (MIDI). */
  bass: number;
  /** Chord tones for the electric piano (MIDI). */
  keys: number[];
}

/** Eight bars: Cmaj9 Am9 Dm9 G13, then Fmaj9 Em7 Dm9 G13. */
export const CHORDS: Chord[] = [
  { bass: 36, keys: [52, 55, 59, 62] },
  { bass: 45 - 12, keys: [55, 59, 60, 64] },
  { bass: 38, keys: [53, 57, 60, 64] },
  { bass: 43 - 12, keys: [53, 59, 62, 64] },
  { bass: 41 - 12, keys: [57, 60, 64, 67] },
  { bass: 40 - 12, keys: [55, 59, 62, 67] },
  { bass: 38, keys: [53, 57, 60, 64] },
  { bass: 43 - 12, keys: [53, 59, 62, 64] },
];
export const LOOP_BARS = CHORDS.length;

/** Piano hits per bar: [beat, length in beats]. Two feels, used on even and odd bars. */
export const COMPING: [number, number][][] = [
  [[0, 2.6], [2.5, 1.2]],
  [[0, 1.8], [1.5, 1.2], [3, 0.9]],
];

/** One melody entry per bar: [beat, MIDI note, length in beats]. Empty bars are left to the pads. Notes come from the C major pentatonic scale. */
export const MELODY: [number, number, number][][] = [
  [[1, 79, 1.5], [3, 76, 1]],
  [[0.5, 76, 1.5], [2.5, 72, 1.5]],
  [[1, 76, 2]],
  [[0, 74, 1], [1.5, 76, 1], [3, 79, 1]],
  [[1, 81, 1.5], [2.5, 79, 1.5]],
  [[0, 79, 2]],
  [[1.5, 76, 1], [3, 74, 1]],
  [[0, 72, 3]],
];

/** Small seeded random numbers, so the humanising is the same every loop and in every test. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LofiPlayer {
  private bus: GainNode;
  private noise: AudioBuffer;
  private crackle: AudioBufferSourceNode | null = null;
  private rand = rng(7);

  /** `out` is where the music goes (the game's music volume). */
  constructor(private ctx: BaseAudioContext, out: AudioNode) {
    // Warm sound: everything goes through a low-pass filter and a gentle compressor, which also lets the music be loud without clipping.
    this.bus = ctx.createGain();
    this.bus.gain.value = 2.4; // loud enough to be heard clearly under the sound effects; the compressor below keeps it from clipping
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 3200;
    warm.Q.value = 0.4;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.ratio.value = 3;
    glue.attack.value = 0.02;
    glue.release.value = 0.3;
    this.bus.connect(warm).connect(glue).connect(out);
    this.noise = this.makeNoise();
  }

  private makeNoise(): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(99);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  /** Vinyl crackle: soft hiss with small random pops, looping for as long as the music plays. */
  startCrackle(): void {
    if (this.crackle) return;
    const len = Math.floor(this.ctx.sampleRate * 4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(5);
    for (let i = 0; i < len; i++) {
      d[i] = (r() * 2 - 1) * 0.12;
      if (r() < 0.0004) d[i] += (r() * 2 - 1) * 0.9;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(hp).connect(lp).connect(g).connect(this.bus);
    src.start();
    this.crackle = src;
  }

  stop(): void {
    try {
      this.crackle?.stop();
    } catch {
      /* already stopped */
    }
    this.crackle = null;
  }

  /** A soft electric-piano note: a sine plus a quiet bell tone one octave up that dies away faster. */
  private key(midi: number, t: number, len: number, vol: number): void {
    const f = midiToHz(midi);
    this.voice(f, t, len, vol, 'sine', 0.012);
    this.voice(f * 2, t, Math.min(len, 0.7), vol * 0.22, 'sine', 0.004);
  }

  private voice(freq: number, t: number, len: number, vol: number, type: OscillatorType, attack: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  private kick(t: number, vol: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.35);
  }

  private hit(t: number, len: number, vol: number, filterType: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, this.rand() * 1.5);
    src.stop(t + len + 0.05);
  }

  /** Schedule one bar that starts at audio time `t`. Call this a little before `t`; the bar index counts up forever. */
  scheduleBar(bar: number, t: number): void {
    const i = bar % LOOP_BARS;
    const chord = CHORDS[i];
    const human = () => (this.rand() - 0.5) * 0.02;

    // Pads: long, slow, overlapping from bar to bar so the sound never drops out.
    for (const m of chord.keys) this.voice(midiToHz(m + 12), t, BAR * 1.5, 0.05, 'sine', 0.9);
    this.voice(midiToHz(chord.bass + 12), t, BAR * 1.4, 0.07, 'sine', 0.6);

    // Electric piano comping, lightly strummed.
    for (const [beat, len] of COMPING[i % COMPING.length]) {
      const start = t + beat * BEAT + (beat % 1 !== 0 ? SWING * BEAT : 0);
      chord.keys.forEach((m, n) => this.key(m, start + n * 0.022 + human(), len * BEAT, 0.12));
    }

    // Bass: root on the one, and again on the "and" of two.
    this.voice(midiToHz(chord.bass), t, BEAT * 1.6, 0.28, 'sine', 0.015);
    this.voice(midiToHz(chord.bass), t + 2.5 * BEAT + SWING * BEAT, BEAT * 1.1, 0.22, 'sine', 0.015);

    // Drums: soft kick, soft snare on two and four, swung hats.
    this.kick(t, 0.5);
    this.kick(t + 2.5 * BEAT + SWING * BEAT, 0.38);
    this.hit(t + BEAT, 0.14, 0.22, 'bandpass', 1900);
    this.hit(t + 3 * BEAT, 0.14, 0.22, 'bandpass', 1900);
    for (let e = 0; e < 8; e++) {
      const at = t + e * 0.5 * BEAT + (e % 2 === 1 ? SWING * BEAT : 0);
      this.hit(at, 0.05, e % 2 === 0 ? 0.1 : 0.06, 'highpass', 7000);
    }

    // Melody: a few warm notes.
    for (const [beat, m, len] of MELODY[i]) this.voice(midiToHz(m), t + beat * BEAT, len * BEAT + 0.8, 0.1, 'triangle', 0.05);
  }
}
