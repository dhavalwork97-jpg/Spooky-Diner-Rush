import { SaveSystem } from './SaveSystem';

/**
 * All sound is synthesized with WebAudio, no files. The context is created and resumed
 * on the first user gesture so browser autoplay rules are respected.
 */
type Sfx = 'tap' | 'ding' | 'coin' | 'burn' | 'levelUp' | 'click' | 'drop' | 'wrong' | 'pop' | 'close';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private fryNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTimer: number | null = null;
  private step = 0;

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
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  /** Simple looping background music: a four-bar arpeggio, scheduled in small steps. */
  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    const notes = [262, 330, 392, 330, 294, 370, 440, 370, 262, 330, 392, 523, 349, 440, 523, 440];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const f = notes[this.step++ % notes.length];
      this.tone(f, 0.28, 'triangle', 0.5, 0, undefined, this.musicGain!);
      if (this.step % 4 === 1) this.tone(f / 2, 0.5, 'sine', 0.4, 0, undefined, this.musicGain!);
    }, 280);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  pauseAll(): void {
    this.setSizzle(0);
    void this.ctx?.suspend();
  }

  resumeAll(): void {
    void this.ctx?.resume();
  }
}

export const audio = new AudioSystem();
