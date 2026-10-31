import Phaser from 'phaser';
import type { Customer } from '../game/KitchenState';
import { INK, LEAF, MUSTARD, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { SEATS_X, SEAT_BOTTOM_Y, Layout } from './layout';
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
 * 19.5 percent of the canvas height. Do not grow it without making room above the head: at this size the top of
 * the head is at y = 51 and the order bubble and Rush tag use all of the space above it.
 */
const BODY_H = 136;
/** Tap and drop targets are never narrower than this, even for the slimmest character. */
const MIN_HIT_W = 96;
/** How far past the screen edge a customer starts or ends their walk (logical px). */
const EDGE_MARGIN = 70;
const HEART_MAX = 5;
const BUBBLE_W = 72;
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
  readonly body: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Container;
  private ticks: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private barFrame: Phaser.GameObjects.Image;
  private price: Phaser.GameObjects.Container;
  private highlight: Phaser.GameObjects.Rectangle;
  private mood: 'normal' | 'worried' | 'angry' | 'happy' = 'normal';
  private x: number;
  private bubbleBaseX: number;
  private bodyW: number;
  private barY: number;
  private baseY: number;
  private scaleBase: number;
  private shadow: Phaser.GameObjects.Image;
  private shadowW = 1;
  private persona: Personality;
  private seed: number;
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
    const bottom = layout.y(SEAT_BOTTOM_Y);
    this.baseY = bottom;
    this.persona = PERSONALITIES[lookKey(c.look)];
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
    this.scaleBase = BODY_H / CELL_H;
    this.shadow = scene.add.image(this.x, bottom, CUSTOMER_SHEET, SHADOW_FRAME).setOrigin(0.5, 1).setDepth(299);
    this.shadowW = (this.scaleBase * FIGURE_W[lookIndex(c.look)]) / SHADOW_ART_W;
    this.shadow.setScale(this.shadowW, this.scaleBase);
    this.body = scene.add.image(this.x, bottom, CUSTOMER_SHEET, lookIndex(c.look)).setOrigin(0.5, 1).setDepth(300);
    this.body.setScale(this.scaleBase);
    this.bodyW = FIGURE_W[lookIndex(c.look)] * this.scaleBase; // the figure, not the padded cell
    // widen the tap area for slim characters (hit area is in texture pixels)
    const hitW = Math.max(this.bodyW, MIN_HIT_W) / this.scaleBase;
    this.body.setInteractive({
      hitArea: new Phaser.Geom.Rectangle((this.body.width - hitW) / 2, 0, hitW, this.body.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    this.highlight = scene.add
      .rectangle(this.x, bottom - BODY_H / 2, Math.max(this.bodyW, 70) + 22, BODY_H + 14)
      .setStrokeStyle(5, 0xffffff, 1)
      .setFillStyle(0xffffff, 0.12)
      .setDepth(299)
      .setVisible(false);

    // order bubble above the head
    this.bubbleBaseX = this.x;
    this.bubble = scene.add.container(this.x, bottom - BODY_H + 1).setDepth(310);
    const bg = scene.add.image(0, 0, 'order_bubble').setOrigin(0.5, 1);
    bg.setScale(BUBBLE_W / bg.width);
    this.bubble.add(bg);
    const n = c.items.length;
    const iconW = n > 2 ? 19 : 24;
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
    const barBottom = bottom + 14;
    this.barY = barBottom;
    this.barFrame = scene.add.image(this.x, barBottom, 'patience_bar_frame').setOrigin(0.5, 0).setDepth(311);
    this.barFrame.setScale(BAR_W / this.barFrame.width);
    this.bar = scene.add.graphics().setDepth(310);
    const coin = scene.add.image(-18, 0, 'coin');
    coin.setScale(18 / coin.width);
    const priceText = scene.add.text(-4, 0, String(c.price), { fontFamily: FONT, fontSize: '20px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 4 }).setOrigin(0, 0.5);
    this.price = scene.add.container(this.x, barBottom + this.barFrame.displayHeight + 14, [coin, priceText]).setDepth(311);
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

  setDropHighlight(on: boolean): void {
    this.highlight.setVisible(on && !this.leaving);
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
    if (m === 'angry') this.body.setTint(0xff9a8a);
    else if (m === 'worried') this.body.setTint(0xffe2a0);
    else this.body.clearTint();
    if (m === 'happy') this.celebrate();
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
    let pose: Pose = idlePose(p, now, this.seed);
    const phase = c.mood === 'waiting' ? phaseFor(frac) : 'calm';
    if (phase !== 'calm') pose = addPose(pose, impatiencePose(p, phase, now, this.seed));
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
    this.applyPose(pose, 1);
  }

  private applyPose(pose: Pose, alpha: number): void {
    this.body.setPosition(this.x + pose.dx, this.baseY + pose.dy);
    this.body.setScale(this.scaleBase * pose.sx, this.scaleBase * pose.sy);
    this.body.setAngle(pose.angle);
    this.body.setAlpha(alpha);
    // the shadow stays on the floor, follows sideways motion and shrinks while the body is lifted
    const lift = Math.min(1, Math.max(0, -pose.dy) / 10);
    this.shadow.setPosition(this.x + pose.dx, this.baseY).setScale(this.shadowW * (1 - lift * 0.3), this.scaleBase).setAlpha(alpha * (1 - lift * 0.5));
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
    this.highlight.setVisible(false);
    if (SaveSystem.reduceMotion()) {
      done();
      return;
    }
    this.scene.tweens.add({ targets: [this.bubble, this.price, this.barFrame, this.bar], alpha: 0, duration: 200 });
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

  destroy(): void {
    this.exitTween?.stop();
    this.scene.tweens.killTweensOf([this.body, this.bubble, this.price, this.barFrame, this.bar, ...this.hearts]);
    for (const h of this.hearts) h.destroy();
    this.hearts = [];
    this.shadow.destroy();
    this.body.destroy();
    this.bubble.destroy();
    this.price.destroy();
    this.barFrame.destroy();
    this.bar.destroy();
    this.highlight.destroy();
  }
}
