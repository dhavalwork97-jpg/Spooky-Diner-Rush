import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import type { Layout } from '../views/layout';
import { makeRng, randRange, type Rng } from '../game/rng';
import {
  FOG_ASPECT,
  FOG_GAP,
  GRADE_DEPTH,
  GRADE_STOPS,
  LAMPS,
  MOON,
  NIGHT_SKY,
  QUALITY_DESKTOP,
  QUALITY_MOBILE,
  STAR_BOX,
  WINDOW_PANES,
  WISP_GAP,
  envelope,
  fogSpec,
  lampIntensity,
  moteSpec,
  nextDelay,
  twinkle,
  wispSpec,
  type AtmosphereQuality,
} from './atmosphereMath';

/**
 * Subtle haunted-night atmosphere drawn as separate layers over the static kitchen art. Nothing here is
 * interactive and nothing sits above the customers (depth 299+), so taps, drags and ghosts are untouched.
 *
 * Depth order (all below the customers at 299 and the items at 500+):
 *   249 dusk grade (multiply gradient over the background, decor and painted machines, but under the Lv lock covers at 250),
 *       window sky, vignette
 *   256-259 sky pinpoints, moon, pendant lamps and their glow
 *   270 floor fog, 275 wisps, 280 floating motes
 *
 * Every texture is drawn into a canvas at start-up (no downloads). Fog, wisps and motes are pooled and driven by
 * counter tweens that are tracked, so they can be paused on blur and stopped on shutdown.
 */
const D = { grade: GRADE_DEPTH, pinpoints: 256, moon: 256.4, lamp: 258, lampGlow: 259, fog: 270, wisp: 275, mote: 280 };

const GLOW = 'atm_glow';
const FOG = 'atm_fog';
const MOON_TEX = 'atm_moon';
const WISP = 'atm_wisp';
const LAMP = 'atm_lamp';
const VIGNETTE = 'atm_vignette';
const GRADE = 'atm_grade';
const FOG_TINT = 0x3fd9e6;
const WISP_TINT = 0x8fefff;

type Img = Phaser.GameObjects.Image;

export class Atmosphere {
  private readonly rng: Rng = makeRng((Date.now() & 0xffffff) | 1);
  private readonly quality: AtmosphereQuality;
  private owned: Phaser.GameObjects.GameObject[] = [];
  private tweens = new Set<Phaser.Tweens.Tween>();
  private free = new Map<string, Img[]>();
  /** Pooled images currently in use, with the pool they return to. */
  private active = new Map<Img, string>();
  private pinpoints: { img: Img; phase: number }[] = [];
  private lamps: { glow: Img; core: Img; phase: number; base: number; coreBase: number }[] = [];
  private moonGlow?: Img;

  private t = 0;
  private paused = false;
  private reduced = false;
  private motionCheck = 0;
  private fogLeft = 0;
  private wispLeft = 0;
  private moteLeft = 0;
  private fogCount = 0;
  private wispCount = 0;
  private moteCount = 0;

  constructor(private scene: Phaser.Scene, private layout: Layout) {
    this.quality = scene.sys.game.device.os.desktop ? QUALITY_DESKTOP : QUALITY_MOBILE;
    ensureTextures(scene);
    this.buildGrade();
    this.buildSky();
    this.buildLamps();
    this.reduced = SaveSystem.reduceMotion();
    this.fogLeft = randRange(this.rng, 1, 2.5);
    this.wispLeft = randRange(this.rng, 6, 12);
    this.moteLeft = 0.5;
    scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    scene.game.events.on(Phaser.Core.Events.FOCUS, this.onFocus, this);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.applyStaticLook();
  }

  /** Number of live fog patches / wisps / motes (for tests and the debug hook). */
  get live(): { fog: number; wisps: number; motes: number } {
    return { fog: this.fogCount, wisps: this.wispCount, motes: this.moteCount };
  }

  update(deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs / 1000, 0.1);

    this.motionCheck += dt;
    if (this.motionCheck > 1) {
      this.motionCheck = 0;
      const now = SaveSystem.reduceMotion();
      if (now !== this.reduced) {
        this.reduced = now;
        if (now) this.stopDynamic();
        this.applyStaticLook();
      }
    }
    if (this.reduced) return;

    this.t += dt;
    for (const l of this.lamps) {
      const k = lampIntensity(this.t, l.phase);
      l.glow.setAlpha(l.base * k);
      l.core.setAlpha(l.coreBase * k);
    }
    for (const s of this.pinpoints) s.img.setAlpha(twinkle(this.t, s.phase));
    if (this.moonGlow) this.moonGlow.setAlpha(0.5 + 0.05 * Math.sin(this.t * 0.6));

    this.fogLeft -= dt;
    if (this.fogLeft <= 0 && this.fogCount < this.quality.maxFog) {
      this.spawnFog();
      this.fogLeft = nextDelay(this.rng, FOG_GAP);
    }
    this.wispLeft -= dt;
    if (this.wispLeft <= 0 && this.wispCount < this.quality.maxWisps) {
      this.spawnWisp();
      this.wispLeft = nextDelay(this.rng, WISP_GAP);
    }
    this.moteLeft -= dt;
    if (this.moteLeft <= 0 && this.moteCount < this.quality.motes) {
      this.spawnMote();
      this.moteLeft = randRange(this.rng, 0.4, 1.6);
    }
  }

  /** Freeze (focus lost): running tweens pause and nothing new spawns. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const tw of this.tweens) tw.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const tw of this.tweens) tw.resume();
  }

  destroy(): void {
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.scene.game.events.off(Phaser.Core.Events.FOCUS, this.onFocus, this);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const tw of this.tweens) tw.stop();
    this.tweens.clear();
    for (const o of this.owned) o.destroy();
    this.owned = [];
    this.free.clear();
    this.active.clear();
    this.pinpoints = [];
    this.lamps = [];
  }

  // ------------------------------------------------------------------ static layers

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.owned.push(o);
    return o;
  }

  private buildGrade(): void {
    const { bg } = this.layout;
    const mult = (x: number, y: number, w: number, h: number, color: number, depth: number) =>
      this.add(this.scene.add.rectangle(x, y, w, h, color).setOrigin(0, 0).setDepth(depth).setBlendMode(Phaser.BlendModes.MULTIPLY));
    this.add(
      this.scene.add.image(bg.x, bg.y, GRADE).setOrigin(0, 0).setDisplaySize(bg.width, bg.height).setDepth(D.grade).setBlendMode(Phaser.BlendModes.MULTIPLY),
    );
    for (const p of WINDOW_PANES) mult(this.layout.x(p.x), this.layout.y(p.y), this.layout.s(p.w), this.layout.y(p.y + p.h) - this.layout.y(p.y), NIGHT_SKY, D.grade + 0.1);
    this.add(this.scene.add.image(bg.x, bg.y, VIGNETTE).setOrigin(0, 0).setDisplaySize(bg.width, bg.height).setDepth(D.grade + 0.2));
  }

  private buildSky(): void {
    const L = this.layout;
    this.moonGlow = this.add(
      this.scene.add.image(L.x(MOON.x), L.y(MOON.y), GLOW).setTint(0xaec8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.moon - 0.2).setAlpha(0.5),
    );
    this.moonGlow.setDisplaySize(L.s(MOON.r * 7), L.s(MOON.r * 7));
    const moon = this.add(this.scene.add.image(L.x(MOON.x), L.y(MOON.y), MOON_TEX).setDepth(D.moon));
    moon.setDisplaySize(L.s(MOON.r * 2 * (128 / 84)), L.s(MOON.r * 2 * (128 / 84)));

    const rng = makeRng(77); // fixed, so the sky is the same every visit
    for (let i = 0; i < this.quality.pinpoints; i++) {
      const size = randRange(rng, 2.5, 5.5);
      const img = this.add(
        this.scene.add
          .image(L.x(STAR_BOX.x + rng() * STAR_BOX.w), L.y(STAR_BOX.y + rng() * STAR_BOX.h), GLOW)
          .setTint(rng() < 0.7 ? 0xdfe8ff : 0xbfb4ff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(D.pinpoints)
          .setAlpha(0.6),
      );
      img.setDisplaySize(L.s(size), L.s(size));
      this.pinpoints.push({ img, phase: rng() * 10 });
    }
  }

  private buildLamps(): void {
    const L = this.layout;
    const rng = makeRng(31);
    for (const lamp of LAMPS) {
      if (lamp.drawn) {
        const w = L.s(70);
        const img = this.add(this.scene.add.image(L.x(lamp.x), 0, LAMP).setOrigin(0.5, 0).setDepth(D.lamp));
        img.setScale(w / img.width);
        img.y = L.y(lamp.y) - 98 * img.scaleX; // texture row 98 is the bulb
      }
      const glow = this.add(this.scene.add.image(L.x(lamp.x), L.y(lamp.y), GLOW).setTint(0xffa43a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.lampGlow));
      glow.setDisplaySize(L.s(lamp.glow), L.s(lamp.glow * 0.8));
      const core = this.add(this.scene.add.image(L.x(lamp.x), L.y(lamp.y + 4), GLOW).setTint(0xffe3a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.lampGlow));
      core.setDisplaySize(L.s(lamp.glow * 0.34), L.s(lamp.glow * 0.26));
      const base = 0.7;
      const coreBase = 0.85;
      glow.setAlpha(base);
      core.setAlpha(coreBase);
      this.lamps.push({ glow, core, phase: rng() * 6, base, coreBase });
    }
  }

  /** Reduced motion (and the first frame): everything steady, no moving parts. */
  private applyStaticLook(): void {
    if (!this.reduced) return;
    for (const l of this.lamps) {
      l.glow.setAlpha(l.base);
      l.core.setAlpha(l.coreBase);
    }
    for (const s of this.pinpoints) s.img.setAlpha(0.6);
    this.moonGlow?.setAlpha(0.5);
  }

  // ------------------------------------------------------------------ moving layers

  private spawnFog(): void {
    const s = fogSpec(this.rng);
    const L = this.layout;
    const img = this.take(`${FOG}${s.variant}`);
    const w = L.s(s.width);
    img.setTint(FOG_TINT).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(D.fog).setDisplaySize(w, w * FOG_ASPECT).setFlipX(this.rng() < 0.5);
    const x0 = L.x(s.x);
    const dx = L.s(s.drift);
    const y = L.y(s.y);
    this.fogCount++;
    this.run(
      s.life,
      (p) => img.setPosition(x0 + dx * p, y).setAlpha(s.peakAlpha * envelope(p)),
      () => {
        this.fogCount--;
        this.release(`${FOG}${s.variant}`, img);
      },
    );
  }

  private spawnWisp(): void {
    const s = wispSpec(this.rng);
    const L = this.layout;
    const img = this.take(WISP);
    const w = L.s(s.size * 2.2);
    img.setTint(WISP_TINT).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.wisp).setDisplaySize(w, w * 0.375).setFlipX(s.dx < 0);
    const x0 = L.x(s.x);
    const y0 = L.y(s.y);
    const dx = L.s(s.dx);
    const dy = L.s(s.dy);
    const bob = L.s(14);
    this.wispCount++;
    this.run(
      s.life,
      (p) => img.setPosition(x0 + dx * p, y0 + dy * p + Math.sin(p * Math.PI * 3) * bob).setAlpha(s.peakAlpha * envelope(p, 0.3, 0.35)),
      () => {
        this.wispCount--;
        this.release(WISP, img);
      },
    );
  }

  private spawnMote(): void {
    const s = moteSpec(this.rng);
    const L = this.layout;
    const img = this.take(GLOW);
    const size = L.s(s.size);
    img.setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.mote).setDisplaySize(size, size);
    const x0 = L.x(s.x);
    const y0 = L.y(s.y);
    const rise = L.s(s.rise);
    const sway = L.s(s.sway);
    this.moteCount++;
    this.run(
      s.life,
      (p) => img.setPosition(x0 + sway * Math.sin(p * Math.PI), y0 - rise * p).setAlpha(s.peakAlpha * envelope(p, 0.3, 0.4)),
      () => {
        this.moteCount--;
        this.release(GLOW, img);
      },
    );
  }

  /** One tracked counter tween from 0 to 1 over `life` seconds. */
  private run(life: number, onUpdate: (p: number) => void, onDone: () => void): void {
    onUpdate(0);
    const tw = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: life * 1000,
      onUpdate: (t: Phaser.Tweens.Tween) => onUpdate(t.getValue() ?? 0),
      onComplete: () => {
        this.tweens.delete(tw);
        onDone();
      },
    });
    this.tweens.add(tw);
    if (this.paused) tw.pause();
  }

  /** Stop everything that moves (reduced motion switched on): objects go back to the pool hidden. */
  private stopDynamic(): void {
    for (const tw of [...this.tweens]) tw.stop(); // onComplete does not run on stop
    this.tweens.clear();
    for (const [img, key] of [...this.active]) this.release(key, img);
    this.fogCount = this.wispCount = this.moteCount = 0;
  }

  private take(key: string): Img {
    const img = this.free.get(key)?.pop() ?? this.add(this.scene.add.image(0, 0, key));
    this.active.set(img, key);
    return img.setVisible(true).setActive(true).setAlpha(0);
  }

  private release(key: string, img: Img): void {
    this.active.delete(img);
    img.setVisible(false).setActive(false);
    const list = this.free.get(key) ?? [];
    list.push(img);
    this.free.set(key, list);
  }

  private onBlur = (): void => this.pause();
  private onFocus = (): void => this.resume();
  private onVisibility = (): void => (document.hidden ? this.pause() : this.resume());
}

// ---------------------------------------------------------------------- textures

/** Draw the small soft textures once per game (they live in the texture manager across scene restarts). */
function ensureTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
    if (tm.exists(key)) return;
    const tex = tm.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.getContext(), w, h);
    tex.refresh();
  };

  make(GLOW, 128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  for (let v = 0; v < 3; v++) {
    make(`${FOG}${v}`, 256, 128, (c, w, h) => {
      const rng = makeRng(100 + v * 17);
      for (let i = 0; i < 8; i++) {
        const cx = w * (0.22 + rng() * 0.56);
        const cy = h * (0.45 + rng() * 0.1);
        const r = 22 + rng() * 26; // always fits inside the canvas so the edges fade to nothing
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.7)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.24)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
  }

  make(MOON_TEX, 128, 128, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = 42;
    const halo = c.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.5);
    halo.addColorStop(0, 'rgba(210,225,255,0.55)');
    halo.addColorStop(1, 'rgba(210,225,255,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, w, h);
    const disc = c.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, r);
    disc.addColorStop(0, '#fbfdff');
    disc.addColorStop(1, '#c9d7ff');
    c.fillStyle = disc;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(120,138,200,0.22)';
    for (const [x, y, rr] of [[-14, -8, 9], [12, 10, 12], [-6, 20, 6], [18, -16, 5]]) {
      c.beginPath();
      c.arc(cx + x, cy + y, rr, 0, Math.PI * 2);
      c.fill();
    }
  });

  make(WISP, 128, 48, (c, w, h) => {
    const tail = c.createLinearGradient(0, 0, w, 0);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(1, 'rgba(255,255,255,0.7)');
    c.fillStyle = tail;
    c.beginPath();
    c.moveTo(0, h * 0.5);
    c.bezierCurveTo(w * 0.35, h * 0.1, w * 0.7, h * 0.1, w * 0.85, h * 0.3);
    c.lineTo(w * 0.85, h * 0.7);
    c.bezierCurveTo(w * 0.7, h * 0.9, w * 0.35, h * 0.9, 0, h * 0.5);
    c.fill();
    const head = c.createRadialGradient(w * 0.85, h / 2, 0, w * 0.85, h / 2, h * 0.5);
    head.addColorStop(0, 'rgba(255,255,255,1)');
    head.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = head;
    c.fillRect(w * 0.85 - h * 0.5, 0, h, h);
  });

  make(LAMP, 96, 130, (c, w) => {
    const cx = w / 2;
    c.strokeStyle = '#3b2418';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, 0);
    c.lineTo(cx, 42);
    c.stroke();
    const dome = c.createLinearGradient(0, 42, 0, 94);
    dome.addColorStop(0, '#ffc766');
    dome.addColorStop(1, '#e8761c');
    c.fillStyle = dome;
    c.strokeStyle = '#5a2a10';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(10, 92);
    c.bezierCurveTo(10, 60, 30, 42, cx, 42);
    c.bezierCurveTo(w - 30, 42, w - 10, 60, w - 10, 92);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd98a';
    c.beginPath();
    c.ellipse(cx, 93, w / 2 - 8, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.ellipse(cx - 16, 62, 6, 14, 0.5, 0, Math.PI * 2);
    c.fill();
    const bulb = c.createRadialGradient(cx, 98, 0, cx, 98, 15);
    bulb.addColorStop(0, 'rgba(255,248,210,1)');
    bulb.addColorStop(1, 'rgba(255,200,110,0)');
    c.fillStyle = bulb;
    c.fillRect(cx - 16, 84, 32, 32);
  });

  make(GRADE, 4, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    for (const [at, color] of GRADE_STOPS) g.addColorStop(at, color);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  make(VIGNETTE, 128, 72, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(10,8,40,0)');
    g.addColorStop(1, 'rgba(10,8,40,0.3)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

