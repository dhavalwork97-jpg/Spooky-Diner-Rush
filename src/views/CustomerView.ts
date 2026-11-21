import Phaser from 'phaser';
import type { Customer } from '../game/KitchenState';
import { INK, LEAF, MUSTARD, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { defaultRegulars } from '../game/regulars';
import { dxKey, hasDinerArt } from './dinerArt';
import { lookIsReady } from './ghostArt';
import { SEATS_X, CUSTOMER_FLOOR_Y, Layout } from './layout';
import { ParticlePool } from '../anim/ParticlePool';
import {
  PERSONALITIES,
  Personality,
  Pose,
  REST,
  ARRIVE_MS,
  WALK_MS,
  WATCH_MS,
  addPose,
  arrivePose,
  departPose,
  eatPose,
  hopPose,
  idlePose,
  impatiencePose,
  CELL_H,
  CUSTOMER_SHEET,
  FIGURE_W,
  LEAVE_FADE_MS,
  LOOK_ART,
  clipFor,
  type LookArt,
  type LookClip,
  LUNGE_MS,
  SCARES,
  SCARE_FADE_MS,
  SCARE_FRAMES,
  SCARE_FPS,
  SCARE_FRAME_H,
  SCARE_FRAME_W,
  warnAlpha,
  warnFrame,
  warnScale,
  warnSeverity,
  SCARE_SCALE,
  floatPose,
  lungePose,
  shimmyPose,
  type ScareDef,
  CUSTOMER_LOOKS,
  HEART_FRAME,
  SHADOW_ART_W,
  SHADOW_FRAME,
  lookIndex,
  lookKey,
  nextWatchDelay,
  phaseFor,
  seedFor,
  watchPose,
} from '../anim/customerMotion';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
/**
 * Every customer is drawn this tall (logical px, canvas is 698) from the soles of the shoes to the top of the hair:
 * 23 percent of the canvas height, 45 percent taller than the first version. They stand on the restaurant floor in
 * front of the stools (CUSTOMER_FLOOR_Y), so the order bubble fits above the head and the bar and price fit on the
 * floor strip below the feet, above the kitchen stations.
 */
const BODY_H = 162;
/** Tap and drop targets are never narrower than this, even for the slimmest character. */
const MIN_HIT_W = 96;
/** How far past the screen edge a customer starts or ends their walk (logical px). */
const EDGE_MARGIN = 70;
const HEART_MAX = 5;
/** Scare sheets and leave clips already asked for (they load lazily, the first time a ghost that has one appears). */
const scareRequested = new Set<string>();
const GLOW_COLOR = 0x8fe8ff;
const GLOW_ALPHA = 0.3;
const BUBBLE_W = 76;
const BAR_W = 100;
const TYPE_CHIPS: Record<string, { label: string; color: number; text: string }> = {
  vip: { label: 'VIP', color: 0xf6c445, text: '#2B1B17' },
  impatient: { label: 'Hurry', color: 0xf28c28, text: '#2B1B17' },
  critic: { label: 'Critic', color: 0x1f2a44, text: '#FFF4DC' },
};

/**
 * One customer: a supplied character, a speech bubble with the order, a patience bar and the
 * price on the floor under the stool. Reads the model every frame; it never decides anything.
 *
 * The character is a single static PNG, so its motion is whole-body transforms around the feet
 * (see anim/customerMotion.ts): breathing, walking steps, a foot-tap when the wait is long, a happy
 * bounce and a chew when food arrives, hearts when the order is complete. One-shot reactions are
 * timestamps read each frame, so there are no per-reaction tweens to leak; only hearts and the exit
 * use tweens, and destroy() stops them.
 */
export class CustomerView {
  readonly id: number;
  readonly body: Phaser.GameObjects.Sprite;
  private bubble: Phaser.GameObjects.Container;
  private ticks: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private barFrame: Phaser.GameObjects.Image;
  private price: Phaser.GameObjects.Container;
  private mood: 'normal' | 'worried' | 'angry' | 'happy' = 'normal';
  private x: number;
  private bubbleBaseX: number;
  private bodyW: number;
  private barY: number;
  private baseY: number;
  private scaleBase: number;
  private shadow: Phaser.GameObjects.Image;
  private shadowW = 1;
  private shadowH = 1;
  /** Set for customers drawn from their own animation sheets (the mint ghost); they play `calm` or `upset` by mood. */
  private art?: LookArt;
  /** Size of the clip now showing relative to the calm clip (1 for all but the happy leave clip). */
  private clipScale = 1;
  private persona: Personality;
  private seed: number;
  private look: number;
  private hover = 0;
  private glow?: Phaser.GameObjects.Image;
  private warn?: Phaser.GameObjects.Image;
  private warnK = 0;
  private glowK = GLOW_ALPHA;
  private scareSprite?: Phaser.GameObjects.Sprite;
  private scareTimer?: Phaser.Time.TimerEvent;
  private hearts: Phaser.GameObjects.Image[] = [];
  private enterAt: number;
  private enterDir: number;
  private edgeDist = 0;
  private tickY = -20;
  private tickR = 9;
  private hopAt = -1e9;
  private eatUntil = 0;
  private watchAt = -1e9;
  private nextWatchAt = Infinity;
  private shakeAt = -1e9;
  private deliveredCount = 0;
  private exitTween?: Phaser.Tweens.Tween;
  private leaving = false;
  private iconXs: number[] = [];
  private rushTag: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene, layout: Layout, c: Customer, private fx?: ParticlePool) {
    this.id = c.id;
    this.x = layout.x(SEATS_X[c.seat]);
    const bottom = layout.y(CUSTOMER_FLOOR_Y);
    this.baseY = bottom;
    // A ghost whose art has not arrived yet (slow download, or a device that keeps the mint ghost only) is drawn as the mint ghost, persona included.
    const wanted = lookKey(c.look);
    const wantedArt = LOOK_ART[wanted];
    const key = wantedArt && !lookIsReady(scene, wantedArt) ? 'mint_ghost' : wanted;
    this.look = CUSTOMER_LOOKS.indexOf(key);
    this.persona = PERSONALITIES[key];
    this.hover = this.persona.ghost?.hover ?? 0;
    this.art = LOOK_ART[key]; // before requestLeaveClips, which needs it
    this.requestScare();
    this.requestLeaveClips();
    this.seed = seedFor(c.id);
    this.deliveredCount = c.delivered.filter(Boolean).length;
    this.enterAt = scene.time.now;
    this.enterDir = this.x < layout.x(850) ? -1 : 1;
    this.nextWatchAt = this.enterAt + ARRIVE_MS + nextWatchDelay(this.persona, Math.random());
    // they walk in from the nearest screen edge and walk back out the same way
    this.edgeDist = this.enterDir < 0 ? this.x + EDGE_MARGIN : scene.scale.width + EDGE_MARGIN - this.x;
    // soft contact shadow so the feet sit on the floor
    // Character, shadow and hearts are all frames of one sprite sheet (one texture, one draw batch).
    // The shadow is an image from the sheet, not a Shape: Shapes drawn between sprites corrupted neighbours in testing.
    // a still character is one cell of the shared sheet; an animated one is drawn from its own frames, scaled so its figure is BODY_H tall
    this.scaleBase = this.art ? BODY_H / this.art.bodyH : BODY_H / CELL_H;
    this.bodyW = (this.art ? this.art.bodyW : FIGURE_W[lookIndex(c.look)]) * this.scaleBase; // the figure, not the padded cell
    this.shadowW = this.bodyW / SHADOW_ART_W;
    this.shadowH = BODY_H / CELL_H; // the shadow is always a cell of the shared sheet
    this.shadow = scene.add.image(this.x, bottom, CUSTOMER_SHEET, SHADOW_FRAME).setOrigin(0.5, 1).setDepth(299);
    this.shadow.setScale(this.shadowW, this.shadowH);
    const originY = this.art ? this.art.calm.footY : 1;
    this.body = scene.add.sprite(this.x, bottom, this.art ? this.art.calm.key : CUSTOMER_SHEET, this.art ? 0 : lookIndex(c.look)).setOrigin(0.5, originY).setDepth(300);
    this.body.setScale(this.scaleBase);
    if (this.persona.ghost && !this.art) {
      // (animated ghosts have the glow painted into their art; an additive copy that swaps sheets every frame also glitched)
      // a soft additive copy over the ghost lifts its colours so it reads as glowing, not washed out
      this.glow = scene.add.image(this.x, bottom, this.body.texture.key, this.body.frame.name).setOrigin(0.5, originY).setDepth(301).setBlendMode(Phaser.BlendModes.ADD).setTint(GLOW_COLOR).setAlpha(GLOW_ALPHA).setScale(this.scaleBase);
    }
    this.showLook();
    // widen the tap area for slim characters (hit area is in texture pixels)
    const hitW = Math.max(this.bodyW, MIN_HIT_W) / this.scaleBase;
    this.body.setInteractive({
      hitArea: new Phaser.Geom.Rectangle((this.body.width - hitW) / 2, 0, hitW, this.body.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    // order bubble above the head
    this.bubbleBaseX = this.x;
    this.bubble = scene.add.container(this.x, bottom - BODY_H + 1).setDepth(310);
    const bg = scene.add.image(0, 0, 'order_bubble').setOrigin(0.5, 1);
    bg.setScale(BUBBLE_W / bg.width);
    this.bubble.add(bg);
    const n = c.items.length;
    const iconW = n > 2 ? 20 : 25;
    const gap = iconW + 3;
    this.tickY = -bg.displayHeight * 0.5;
    this.tickR = Math.round(iconW * 0.4);
    c.items.forEach((k, i) => {
      const ix = (i - (n - 1) / 2) * gap;
      this.iconXs.push(ix);
      const icon = scene.add.image(ix, -bg.displayHeight * 0.5, k === 'burger' ? 'bun_top' : `${k}_cooked`);
      icon.setScale(iconW / icon.width);
      this.bubble.add(icon);
    });
    this.ticks = scene.add.graphics();
    this.bubble.add(this.ticks);

    // small red "Rush" tag while the customer is still fresh, and a chip for special customer types
    const tagY = -bg.displayHeight + 5;
    const tagBg = scene.add.graphics();
    tagBg.fillStyle(0xd9382b, 1).fillRoundedRect(-22, -8, 44, 16, 6).lineStyle(2, INK, 1).strokeRoundedRect(-22, -8, 44, 16, 6);
    const tagText = scene.add.text(0, 0, 'Rush', { fontFamily: FONT, fontSize: '12px', color: '#FFF4DC' }).setOrigin(0.5);
    this.rushTag = scene.add.container(-BUBBLE_W / 2 + 22, tagY, [tagBg, tagText]);
    this.bubble.add(this.rushTag);
    if (c.special) {
      // gold "Special" tag above the others: today's Daily Special order
      const spBg = scene.add.graphics();
      spBg.fillStyle(0xf6c445, 1).fillRoundedRect(-30, -8, 60, 16, 6).lineStyle(2, INK, 1).strokeRoundedRect(-30, -8, 60, 16, 6);
      const spText = scene.add.text(0, 0, 'Special', { fontFamily: FONT, fontSize: '12px', color: '#3A2412' }).setOrigin(0.5);
      this.bubble.add(scene.add.container(0, tagY - 20, [spBg, spText]));
    }
    if (c.regular) {
      // named regular: a small name tag (with the heart badge when its art is loaded) above the bubble
      const reg = defaultRegulars.find((r) => r.id === c.regular);
      if (reg) {
        const label = scene.add.text(0, 0, reg.name, { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#FFF4DC' }).setOrigin(0.5);
        const hasHeart = hasDinerArt(scene, 'heart_badge');
        const w = Math.ceil(label.width) + 16 + (hasHeart ? 18 : 0);
        const nBg = scene.add.graphics();
        nBg.fillStyle(0x6a3d8f, 1).fillRoundedRect(-w / 2, -10, w, 20, 8).lineStyle(2, INK, 1).strokeRoundedRect(-w / 2, -10, w, 20, 8);
        const parts: Phaser.GameObjects.GameObject[] = [nBg, label];
        if (hasHeart) {
          const heart = scene.add.image(-w / 2 + 12, 0, dxKey('heart_badge'));
          heart.setScale(16 / Math.max(heart.width, heart.height));
          label.x = 9;
          parts.push(heart);
        }
        this.bubble.add(scene.add.container(0, tagY - (c.special ? 40 : 21), parts));
      }
    }
    if (c.type !== 'regular') {
      const chip = TYPE_CHIPS[c.type];
      if (chip) {
        const chipBg = scene.add.graphics();
        chipBg.fillStyle(chip.color, 1).fillRoundedRect(-24, -8, 48, 16, 6).lineStyle(2, INK, 1).strokeRoundedRect(-24, -8, 48, 16, 6);
        const chipText = scene.add.text(0, 0, chip.label, { fontFamily: FONT, fontSize: '12px', color: chip.text }).setOrigin(0.5);
        this.bubble.add(scene.add.container(BUBBLE_W / 2 - 24, tagY, [chipBg, chipText]));
      }
    }

    // patience bar and price on the floor
    const barBottom = bottom + 4;
    this.barY = barBottom;
    this.barFrame = scene.add.image(this.x, barBottom, 'patience_bar_frame').setOrigin(0.5, 0).setDepth(311);
    this.barFrame.setScale(BAR_W / this.barFrame.width);
    this.bar = scene.add.graphics().setDepth(310);
    const coin = scene.add.image(-18, 0, 'coin');
    coin.setScale(18 / coin.width);
    const priceText = scene.add.text(-4, 0, String(c.price), { fontFamily: FONT, fontSize: '20px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 4 }).setOrigin(0, 0.5);
    this.price = scene.add.container(this.x, barBottom + this.barFrame.displayHeight + 12, [coin, priceText]).setDepth(311);
    this.drawBar(1);

    if (SaveSystem.reduceMotion()) {
      this.bubble.setScale(1);
    } else {
      // the customer walks in (driven from update); the bubble pops once they have nearly arrived
      this.body.setAlpha(0);
      this.shadow.setAlpha(0);
      this.bubble.setScale(0);
      const showAt = WALK_MS * 0.7;
      scene.tweens.add({ targets: this.bubble, scale: 1, duration: 280, delay: showAt, ease: 'Back.Out' });
      this.price.setAlpha(0);
      this.barFrame.setAlpha(0);
      this.bar.setAlpha(0);
      scene.tweens.add({ targets: [this.price, this.barFrame, this.bar], alpha: 1, duration: 250, delay: showAt });
    }
  }

  // Hit and centre use the seat position, not the bouncing sprite, so taps never move with the animation.
  get hitRect(): Phaser.Geom.Rectangle {
    const w = Math.max(this.bodyW + 28, MIN_HIT_W);
    return new Phaser.Geom.Rectangle(this.x - w / 2, this.baseY - BODY_H - 8, w, BODY_H + 24);
  }
  get center(): { x: number; y: number } {
    return { x: this.x, y: this.baseY - BODY_H / 2 };
  }

  private drawBar(frac: number): void {
    const g = this.bar;
    g.clear();
    const fh = this.barFrame.displayHeight;
    const x0 = this.x - BAR_W * 0.43;
    const w = BAR_W * 0.86 * Math.max(0, Math.min(1, frac));
    const y0 = this.barY + fh * 0.26;
    const h = fh * 0.48;
    if (w <= 0) return;
    const color = frac > 0.5 ? LEAF : frac > 0.25 ? MUSTARD : TOMATO;
    g.fillStyle(color, 1).fillRoundedRect(x0, y0, Math.max(h, w), h, h / 2);
  }

  private drawTicks(c: Customer): void {
    const g = this.ticks;
    g.clear();
    c.delivered.forEach((d, i) => {
      if (!d) return;
      const cx = this.iconXs[i];
      const cy = this.tickY;
      const r = this.tickR;
      g.fillStyle(LEAF, 1).fillCircle(cx, cy, r);
      g.lineStyle(2, INK, 1).strokeCircle(cx, cy, r);
      g.lineStyle(2.5, 0xffffff, 1).beginPath().moveTo(cx - r * 0.45, cy).lineTo(cx - r * 0.1, cy + r * 0.35).lineTo(cx + r * 0.55, cy - r * 0.4).strokePath();
    });
  }

  private setMood(m: 'normal' | 'worried' | 'angry' | 'happy'): void {
    if (this.mood === m) return;
    this.mood = m;
    // The supplied customers have one pose, so mood shows as a tint and a small motion.
    // (ghosts keep their own colours: a warm tint turns the blue glow brown; they show mood by shimmying instead)
    if (this.persona.ghost) this.body.clearTint();
    else if (m === 'angry') this.body.setTint(0xff9a8a);
    else if (m === 'worried') this.body.setTint(0xffe2a0);
    else this.body.clearTint();
    this.showLook();
    if (m === 'happy') this.celebrate();
  }

  /** Makes sure a clip's animation exists (they are created once, the first time they are needed). */
  private ensureClipAnim(clip: LookClip): void {
    const anims = this.scene.anims;
    if (anims.exists(clip.key)) return;
    anims.create({ key: clip.key, frames: anims.generateFrameNumbers(clip.key, { start: 0, end: clip.frames - 1 }), frameRate: clip.fps, repeat: clip.loop ? -1 : 0 });
  }

  /** Animated customers: happy idle while patient or happy, impatient under half patience, angry under a quarter. Still when motion is reduced. */
  private showLook(): void {
    const art = this.art;
    if (!art) return;
    const clip = art[clipFor(this.mood)];
    this.ensureClipAnim(clip);
    this.clipScale = clip.scale;
    this.body.setOrigin(0.5, clip.footY);
    if (SaveSystem.reduceMotion()) {
      this.body.stop();
      this.body.setTexture(clip.key, 0);
      return;
    }
    const playing = this.body.anims.isPlaying && this.body.anims.currentAnim?.key === clip.key;
    // each ghost starts at its own frame, so two of them on screen never move in step
    if (!playing) this.body.play({ key: clip.key, startFrame: Math.floor((this.seed % 1) * clip.frames) % clip.frames });
  }

  private motionOn(): boolean {
    return !SaveSystem.reduceMotion() && !this.leaving;
  }

  /** Food arrived: happy bounce, then a few chews. */
  private reactToFood(): void {
    if (!this.motionOn()) return;
    const now = this.scene.time.now;
    this.hopAt = now;
    this.eatUntil = now + this.persona.hopMs + this.persona.eatMs * 3;
    this.sparkle(Math.ceil(this.persona.sparkles / 2));
  }

  /** Whole order served: hearts and sparkles, and keep chewing until they leave. */
  private celebrate(): void {
    if (!this.motionOn()) return;
    const now = this.scene.time.now;
    this.hopAt = now;
    this.eatUntil = now + this.persona.hopMs + this.persona.eatMs * 3;
    this.sparkle(this.persona.sparkles);
    this.releaseHearts(this.persona.hearts);
  }

  private sparkle(n: number): void {
    this.fx?.burst(this.x, this.baseY - BODY_H * 0.8, 0xfff1b8, n, 34, 420);
  }

  private releaseHearts(n: number): void {
    for (let i = 0; i < n; i++) {
      let h = this.hearts.find((x) => !x.active);
      if (!h) {
        if (this.hearts.length >= HEART_MAX) return;
        h = this.scene.add.image(0, 0, CUSTOMER_SHEET, HEART_FRAME).setDepth(320);
        this.hearts.push(h);
      }
      // hearts float up beside the head, below the order bubble, so they never hide the order
      const side = i % 2 ? 1 : -1;
      const dx = side * (this.bodyW * 0.5 + 8 + Math.floor(i / 2) * 12);
      const y0 = this.baseY - BODY_H * 0.66 - (i % 2) * 8;
      h.setActive(true).setVisible(true).setAlpha(1).setScale(0.25).setPosition(this.x + dx, y0);
      this.scene.tweens.add({
        targets: h,
        y: y0 - 26,
        x: h.x + side * 4,
        scale: 0.45 + (i % 3) * 0.05,
        duration: 800,
        delay: i * 70,
        ease: 'Sine.Out',
      });
      this.scene.tweens.add({
        targets: h,
        alpha: 0,
        duration: 360,
        delay: i * 70 + 460,
        onComplete: () => h?.setActive(false).setVisible(false),
      });
    }
  }

  /** Drives the body from the current state. Called from update() with the scene clock. */
  private animate(c: Customer, now: number, frac: number): void {
    const p = this.persona;
    if (SaveSystem.reduceMotion()) {
      this.applyPose(REST, 1);
      return;
    }
    // walking in
    const arrive = now - this.enterAt < ARRIVE_MS ? arrivePose(p, now - this.enterAt, this.edgeDist, this.enterDir) : null;
    if (arrive) {
      this.applyPose(arrive.pose, 1);
      return;
    }
    let pose: Pose = p.ghost ? floatPose(p, now, this.seed) : idlePose(p, now, this.seed);
    const phase = c.mood === 'waiting' ? phaseFor(frac) : 'calm';
    if (phase !== 'calm') pose = addPose(pose, p.ghost ? shimmyPose(phase, now, this.seed) : impatiencePose(p, phase, now, this.seed));
    // occasional wristwatch check (businessman); more often once the wait drags
    if (this.nextWatchAt !== Infinity && c.mood === 'waiting' && now >= this.nextWatchAt && now - this.hopAt > 600) {
      this.watchAt = now;
      this.nextWatchAt = now + WATCH_MS + nextWatchDelay(p, Math.random()) * (phase === 'calm' ? 1 : 0.5);
      if (p.watchAt) this.fx?.burst(this.x + (p.watchAt.x - 0.5) * this.bodyW, this.baseY - (1 - p.watchAt.y) * BODY_H, 0xffffff, 4, 9, 320);
    }
    const watchK = (now - this.watchAt) / WATCH_MS;
    if (watchK >= 0 && watchK < 1) pose = addPose(pose, watchPose(watchK));
    const hopK = (now - this.hopAt) / p.hopMs;
    if (hopK >= 0 && hopK < 1) pose = addPose(pose, hopPose(p, hopK));
    else if (now < this.eatUntil) pose = addPose(pose, eatPose(p, now, this.seed));
    const shakeK = (now - this.shakeAt) / 200;
    if (shakeK >= 0 && shakeK < 1) pose = addPose(pose, { ...REST, dx: Math.sin(shakeK * Math.PI * 8) * 6 * (1 - shakeK) });
    this.updateWarn(c, frac);
    this.applyPose(pose, 1);
  }

  /** Losing-patience face: fade into the early frames of the ghost's scare sheet once patience is under half. */
  private updateWarn(c: Customer, frac: number): void {
    const def = SCARES[lookKey(this.look)];
    const sev = def && def.warnMax > 0 && c.mood === 'waiting' ? warnSeverity(frac) : 0;
    this.warnK = sev;
    if (!def || sev <= 0 || !this.scene.textures.exists(def.key)) {
      this.warn?.setVisible(false);
      return;
    }
    if (!this.warn) {
      this.warn = this.scene.add.image(this.x, this.baseY, def.key, 0).setOrigin(0.5, 0).setDepth(300.5);
    }
    this.warn.setVisible(true).setFrame(warnFrame(def, sev)).setAlpha(warnAlpha(sev));
  }

  private applyPose(pose: Pose, alpha: number): void {
    this.body.setPosition(this.x + pose.dx, this.baseY + pose.dy - this.hover);
    this.body.setScale(this.scaleBase * this.clipScale * pose.sx, this.scaleBase * this.clipScale * pose.sy);
    this.body.setAngle(pose.angle);
    this.body.setAlpha(alpha);
    if (this.warn?.visible) {
      const def = SCARES[lookKey(this.look)]!;
      const k = warnScale(def, FIGURE_W[lookIndex(this.look)] * this.scaleBase);
      const rad = (pose.angle * Math.PI) / 180;
      const headY = this.body.y - BODY_H * pose.sy;
      // line the ghost box up with the idle figure: head top, centre x, width; follow the body's lean and squash
      this.warn
        .setScale(k * pose.sx, k * pose.sy)
        .setPosition(this.body.x + Math.sin(rad) * BODY_H * pose.sy - (def.boxCx - 0.5) * SCARE_FRAME_W * k, headY - def.boxTop * SCARE_FRAME_H * k * pose.sy)
        .setAngle(pose.angle)
        .setAlpha(alpha * warnAlpha(this.warnK));
    }
    this.glow?.setPosition(this.body.x, this.body.y).setScale(this.body.scaleX, this.body.scaleY).setAngle(pose.angle).setAlpha(alpha * this.glowK);
    // the shadow stays on the floor, follows sideways motion and shrinks while the body is lifted
    const lift = Math.min(1, Math.max(0, -pose.dy + this.hover) / 10);
    this.shadow.setPosition(this.x + pose.dx, this.baseY).setScale(this.shadowW * (1 - lift * 0.3), this.shadowH).setAlpha(alpha * (1 - lift * 0.5));
  }

  update(c: Customer, now: number, rush = false): void {
    this.rushTag.setVisible(rush);
    const frac = c.patience / c.patienceMax;
    const delivered = c.delivered.filter(Boolean).length;
    if (delivered > this.deliveredCount && c.mood !== 'happy') this.reactToFood();
    this.deliveredCount = delivered;
    this.drawBar(frac);
    this.drawTicks(c);
    if (c.mood === 'happy') this.setMood('happy');
    else if (c.mood === 'angry' || frac < 0.25) this.setMood('angry');
    else if (frac < 0.5) this.setMood('worried');
    else this.setMood('normal');
    const shaking = c.mood === 'waiting' && frac < 0.25 && !SaveSystem.reduceMotion();
    this.bubble.x = this.bubbleBaseX + (shaking ? Math.sin(now / 35) * 2.5 : 0);
    if (!this.leaving) this.animate(c, now, frac);
  }

  /** Wrong item dropped on this customer: a quick shake. */
  shake(): void {
    if (SaveSystem.reduceMotion()) return;
    this.shakeAt = this.scene.time.now;
  }

  leave(done: () => void): void {
    this.leaving = true;
    if (SaveSystem.reduceMotion()) {
      done();
      return;
    }
    this.scene.tweens.add({ targets: [this.bubble, this.price, this.barFrame, this.bar], alpha: 0, duration: 200 });
    // animated ghosts play their supplied leave clip in place (angry or happy) when it has loaded; otherwise the old exits below
    const leaveClip = this.art ? (this.mood === 'angry' ? this.art.leaveAngry : this.art.leaveHappy) : undefined;
    if (leaveClip && this.scene.textures.exists(leaveClip.key)) {
      this.playLeaveClip(leaveClip, done);
      return;
    }
    // an angry ghost scares on the way out: the supplied sheet when it is loaded, otherwise a code-only lunge
    if (this.persona.ghost && this.mood === 'angry') {
      const def = SCARES[lookKey(this.look)];
      if (def && this.scene.textures.exists(def.key)) this.playScare(def, done);
      else this.playLunge(done);
      return;
    }
    // walk back out the way they came in: same steps, to the screen edge
    const prog = { t: 0 };
    this.exitTween = this.scene.tweens.add({
      targets: prog,
      t: WALK_MS,
      duration: WALK_MS,
      ease: 'Linear',
      onUpdate: () => this.applyPose(departPose(this.persona, prog.t, this.edgeDist, this.enterDir).pose, 1),
      onComplete: done,
    });
  }

  /** Ask for the leave clips of an animated ghost in the background, once. */
  private requestLeaveClips(): void {
    if (!this.art || SaveSystem.reduceMotion()) return;
    for (const clip of [this.art.leaveHappy, this.art.leaveAngry]) {
      if (scareRequested.has(clip.key) || this.scene.textures.exists(clip.key)) continue;
      scareRequested.add(clip.key);
      this.scene.load.spritesheet(clip.key, clip.file, { frameWidth: clip.size, frameHeight: clip.size });
    }
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  /** Plays a one-shot leave clip in place (the customer stays on their seat), then fades out. */
  private playLeaveClip(clip: LookClip, done: () => void): void {
    const sc = this.scene;
    const b = this.body;
    this.warn?.setVisible(false);
    this.ensureClipAnim(clip);
    this.clipScale = clip.scale;
    b.clearTint();
    b.setOrigin(0.5, clip.footY).setAngle(0).setAlpha(1).setScale(this.scaleBase * clip.scale).setPosition(this.x, this.baseY - this.hover);
    this.shadow.setPosition(this.x, this.baseY).setScale(this.shadowW, this.shadowH).setAlpha(1);
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      sc.tweens.add({ targets: [b, this.shadow], alpha: 0, duration: LEAVE_FADE_MS, onComplete: done });
    };
    b.once('animationcomplete', finish);
    // safety net in case the animation never reports completion
    this.scareTimer = sc.time.delayedCall((clip.frames / clip.fps) * 1000 + 800, finish);
    b.play(clip.key);
  }

  /** Ask for this ghost's scare sheet in the background, once. */
  private requestScare(): void {
    const def = SCARES[lookKey(this.look)];
    if (!def || scareRequested.has(def.key) || this.scene.textures.exists(def.key) || SaveSystem.reduceMotion()) return;
    scareRequested.add(def.key);
    this.scene.load.spritesheet(def.key, def.file, { frameWidth: SCARE_FRAME_W, frameHeight: SCARE_FRAME_H });
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  /** Play the supplied scare sheet once, centred on the customer with the head tops lined up, shaking the camera at the peak frame. */
  private playScare(def: ScareDef, done: () => void): void {
    const sc = this.scene;
    this.warn?.setVisible(false);
    const spr = sc.add.sprite(this.x, this.baseY - BODY_H, def.key, 0).setOrigin(0.5, 0).setScale(SCARE_SCALE).setDepth(330).setAlpha(0);
    this.scareSprite = spr;
    if (!sc.anims.exists(def.key)) {
      sc.anims.create({ key: def.key, frames: sc.anims.generateFrameNumbers(def.key, { start: 0, end: SCARE_FRAMES - 1 }), frameRate: SCARE_FPS, repeat: 0 });
    }
    sc.tweens.add({ targets: spr, alpha: 1, duration: SCARE_FADE_MS });
    sc.tweens.add({ targets: [this.body, this.shadow, ...(this.glow ? [this.glow] : [])], alpha: 0, duration: SCARE_FADE_MS });
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      sc.tweens.add({ targets: spr, alpha: 0, duration: 200, onComplete: done });
    };
    let shook = false;
    spr.on('animationupdate', (_a: unknown, frame: Phaser.Animations.AnimationFrame) => {
      if (!shook && Number(frame.textureFrame) >= def.peakFrame) {
        shook = true;
        sc.cameras.main.shake(220, 0.004);
      }
    });
    spr.once('animationcomplete', finish);
    // safety net in case the animation never reports completion
    this.scareTimer = sc.time.delayedCall((SCARE_FRAMES / SCARE_FPS) * 1000 + 800, finish);
    spr.play(def.key);
  }

  /** Code-only scare (no sheet, or it has not loaded yet): the ghost surges toward the camera, flashes red and fades. */
  private playLunge(done: () => void): void {
    const sc = this.scene;
    const prog = { t: 0 };
    let shook = false;
    // angry ghosts flare red through the glow copy; the body keeps its own colours
    this.warn?.setVisible(false);
    this.glow?.setTint(0xff5040);
    if (this.art) this.body.setTint(0xffb0a0); // animated ghosts have no glow copy: the body itself flares red
    this.glowK = 0.55;
    this.exitTween = sc.tweens.add({
      targets: prog,
      t: LUNGE_MS,
      duration: LUNGE_MS,
      ease: 'Linear',
      onUpdate: () => {
        const l = lungePose(prog.t / LUNGE_MS);
        this.applyPose(l.pose, l.alpha);
        if (l.peak && !shook) {
          shook = true;
          sc.cameras.main.shake(160, 0.003);
        }
      },
      onComplete: done,
    });
  }

  destroy(): void {
    this.scareTimer?.remove(false);
    if (this.scareSprite) {
      this.scene.tweens.killTweensOf(this.scareSprite);
      this.scareSprite.destroy();
    }
    this.exitTween?.stop();
    this.scene.tweens.killTweensOf([this.body, this.bubble, this.price, this.barFrame, this.bar, ...this.hearts]);
    for (const h of this.hearts) h.destroy();
    this.hearts = [];
    this.shadow.destroy();
    this.glow?.destroy();
    this.warn?.destroy();
    this.body.destroy();
    this.bubble.destroy();
    this.price.destroy();
    this.barFrame.destroy();
    this.bar.destroy();
  }
}
