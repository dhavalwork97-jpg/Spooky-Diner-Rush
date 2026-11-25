import { SaveSystem } from './SaveSystem';
import { makeThrottle } from './throttle';
import { BAR, BEAT, CHORDS, LOOP_BARS, MELODY } from './calmMusic';

/**
 * All sound is synthesized with WebAudio, no files. The context is created and resumed
 * on the first user gesture so browser autoplay rules are respected.
 */
export type Sfx = 'tap' | 'ding' | 'coin' | 'burn' | 'levelUp' | 'click' | 'drop' | 'wrong' | 'pop' | 'close' | 'flap' | 'chest' | 'party' | 'badge' | 'moon' | TacoSfx;
/** The Taco Truck's own night sounds (synthesized here with the rest; chosen by src/views/TacoSounds.ts). */
export type TacoSfx = 'owl_hoot' | 'wolf_howl' | 'creak' | 'chest_open' | 'bat_flap' | 'ghost_giggle' | 'regular_ding';

/** Seconds that must pass before the same new sound may play again (the older sounds are unchanged and unthrottled). */
export const SFX_GAPS: Readonly<Record<string, number>> = { flap: 0.35, chest: 0.6, party: 1.5, badge: 1.0, moon: 4 };
/** Same idea for the Taco Truck's night sounds (kept apart so the diner's table above stays exactly as it was). */
export const TACO_SFX_GAPS: Readonly<Record<TacoSfx, number>> = { owl_hoot: 8, wolf_howl: 6, creak: 2, chest_open: 0.6, bat_flap: 0.35, ghost_giggle: 3, regular_ding: 0.5 };
const throttled = makeThrottle({ ...SFX_GAPS, ...TACO_SFX_GAPS });

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private fryNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTimer: number | null = null;
  private musicBar = 0;
  private musicNext = 0;

  /** Call from any pointer or key handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (!this.heldByGame && this.isStopped()) void this.ctx.resume();
  }

  /** True while the game itself has the sound paused (a pause screen or an ad): a tap must not undo that. */
  private heldByGame = false;

  /** Browsers stop the context after a call, a lock screen or a tab switch; iOS Safari calls that state 'interrupted'. */
  private isStopped(): boolean {
    const state = this.ctx?.state as string | undefined;
    return state === 'suspended' || state === 'interrupted';
  }

  /**
   * Call on every tap or key: restarts sound that the BROWSER stopped (iOS only allows that inside a tap).
   * Does nothing when the game paused the sound on purpose.
   */
  resumeOnGesture(): void {
    if (this.ctx && !this.heldByGame && this.isStopped()) void this.ctx.resume();
  }

  applyVolumes(): void {
    const s = SaveSystem.data.settings;
    if (!this.master || !this.sfxGain || !this.musicGain) return;
    this.master.gain.value = s.muted ? 0 : 1;
    this.sfxGain.gain.value = s.sfxVolume;
    this.musicGain.gain.value = s.musicVolume * 0.25;
  }

  setMuted(muted: boolean): void {
    SaveSystem.data.settings.muted = muted;
    this.applyVolumes();
    SaveSystem.save();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, dest?: AudioNode): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: Sfx): void {
    if (!this.ctx) return;
    if (!throttled(name, this.ctx.currentTime)) return;
    switch (name) {
      case 'tap': return this.tone(520, 0.07, 'triangle', 0.3);
      case 'click': return this.tone(660, 0.06, 'square', 0.15);
      case 'pop': return this.tone(380, 0.1, 'sine', 0.35, 0, 760);
      case 'drop': return this.tone(180, 0.12, 'sine', 0.5, 0, 90);
      case 'ding': this.tone(988, 0.25, 'sine', 0.4); return this.tone(1318, 0.35, 'sine', 0.3, 0.08);
      case 'coin': this.tone(1318, 0.08, 'square', 0.18); return this.tone(1760, 0.18, 'square', 0.18, 0.07);
      case 'burn': return this.tone(140, 0.45, 'sawtooth', 0.3, 0, 60);
      case 'wrong': return this.tone(220, 0.15, 'square', 0.2, 0, 160);
      case 'close': return this.tone(330, 0.5, 'triangle', 0.4, 0, 110);
      case 'flap': this.tone(620, 0.07, 'triangle', 0.16, 0, 900); return this.tone(540, 0.08, 'triangle', 0.14, 0.09, 820);
      case 'chest':
        this.tone(150, 0.2, 'sine', 0.45, 0, 70);
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.28, 'sine', 0.26, 0.12 + i * 0.07));
        return;
      case 'party': [523, 659, 784, 659, 880].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, i * 0.08)); return;
      case 'badge': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.28, i * 0.09)); return;
      case 'moon': return this.tone(196, 1.1, 'sine', 0.2, 0, 150);
      case 'owl_hoot': this.tone(392, 0.26, 'sine', 0.3, 0, 330); this.tone(330, 0.42, 'sine', 0.3, 0.34, 294); return this.tone(392, 0.2, 'sine', 0.2, 0.95, 349);
      case 'wolf_howl': this.tone(300, 1.3, 'sine', 0.22, 0, 640); this.tone(640, 1.0, 'sine', 0.2, 1.25, 420); return this.tone(604, 1.2, 'triangle', 0.08, 0.4, 630);
      case 'creak': this.tone(110, 0.5, 'sawtooth', 0.12, 0, 170); return this.tone(150, 0.4, 'sawtooth', 0.1, 0.25, 90);
      case 'chest_open':
        this.tone(120, 0.45, 'sawtooth', 0.12, 0, 190);
        this.tone(150, 0.2, 'sine', 0.4, 0.3, 70);
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.28, 'sine', 0.26, 0.42 + i * 0.07));
        return;
      case 'bat_flap': this.tone(480, 0.07, 'triangle', 0.16, 0, 720); return this.tone(420, 0.08, 'triangle', 0.14, 0.09, 660);
      case 'ghost_giggle': [880, 1047, 988, 1175].forEach((f, i) => this.tone(f, 0.07, 'triangle', 0.16, i * 0.07, f * 1.15)); return;
      case 'regular_ding': [1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.26, i * 0.07)); return;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.4, i * 0.09));
        return;
    }
  }

  /** Frying and sizzle loop: filtered noise whose level follows how much is cooking. */
  setSizzle(level: number): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!this.fryNode) {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3500;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxGain);
      src.start();
      this.fryNode = { src, gain };
    }
    this.fryNode.gain.gain.setTargetAtTime(Math.min(0.14, level * 0.07), this.ctx.currentTime, 0.1);
  }

  /** Calm looping background music (data in calmMusic.ts): slow soft pads, a low note and a few quiet melody notes, scheduled just ahead on the audio clock. */
  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    this.musicBar = 0;
    this.musicNext = 0;
    this.musicTimer = window.setInterval(() => {
      const ctx = this.ctx;
      if (!ctx || !this.musicGain || ctx.state !== 'running') return;
      if (this.musicNext < ctx.currentTime) this.musicNext = ctx.currentTime + 0.1; // late (tab was hidden): restart the bar cleanly
      while (this.musicNext < ctx.currentTime + 2) {
        this.scheduleBar(this.musicBar++ % LOOP_BARS, this.musicNext);
        this.musicNext += BAR;
      }
    }, 500);
  }

  /** One soft note: slow fade in and out so nothing clicks or startles. */
  private soft(freq: number, start: number, len: number, vol: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.musicGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    const attack = Math.min(0.9, len * 0.4);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    o.connect(g).connect(this.musicGain);
    o.start(start);
    o.stop(start + len + 0.05);
  }

  private scheduleBar(bar: number, t: number): void {
    const chord = CHORDS[bar % CHORDS.length];
    this.soft(chord.bass, t, BAR * 1.05, 0.3);
    for (const f of chord.pad) this.soft(f, t, BAR * 1.15, 0.12);
    const line = MELODY[Math.floor(bar / CHORDS.length) % MELODY.length][bar % CHORDS.length];
    for (const n of line) this.soft(n.freq, t + n.beat * BEAT, n.len * BEAT + 0.6, 0.18, 'triangle');
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  pauseAll(): void {
    this.heldByGame = true;
    this.setSizzle(0);
    void this.ctx?.suspend();
  }

  resumeAll(): void {
    this.heldByGame = false;
    void this.ctx?.resume();
  }
}

export const audio = new AudioSystem();
