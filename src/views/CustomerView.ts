import Phaser from 'phaser';
import type { Customer } from '../game/KitchenState';
import { INK, LEAF, MUSTARD, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { SEATS_X, SEAT_BOTTOM_Y, Layout } from './layout';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const BODY_H = 124;
const BUBBLE_W = 104;
const BAR_W = 100;

/**
 * One customer: a supplied character, a speech bubble with the order, a patience bar and the
 * price on the floor under the stool. Reads the model every frame; it never decides anything.
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
  private bobTween?: Phaser.Tweens.Tween;
  private leaving = false;
  private iconXs: number[] = [];

  constructor(private scene: Phaser.Scene, layout: Layout, c: Customer) {
    this.id = c.id;
    this.x = layout.x(SEATS_X[c.seat]);
    const bottom = layout.y(SEAT_BOTTOM_Y);
    this.body = scene.add.image(this.x, bottom, `customer_0${(c.look % 3) + 1}`).setOrigin(0.5, 1).setDepth(300);
    this.body.setScale(BODY_H / this.body.height);
    this.bodyW = this.body.displayWidth;
    this.body.setInteractive({ useHandCursor: true });
    this.highlight = scene.add
      .rectangle(this.x, bottom - BODY_H / 2, this.bodyW + 22, BODY_H + 14)
      .setStrokeStyle(5, 0xffffff, 1)
      .setFillStyle(0xffffff, 0.12)
      .setDepth(299)
      .setVisible(false);

    // order bubble above the head
    this.bubbleBaseX = this.x;
    this.bubble = scene.add.container(this.x, bottom - BODY_H - 2).setDepth(310);
    const bg = scene.add.image(0, 0, 'order_bubble').setOrigin(0.5, 1);
    bg.setScale(BUBBLE_W / bg.width);
    this.bubble.add(bg);
    const n = c.items.length;
    const iconW = n > 2 ? 26 : 32;
    const gap = iconW + 4;
    c.items.forEach((k, i) => {
      const ix = (i - (n - 1) / 2) * gap;
      this.iconXs.push(ix);
      const icon = scene.add.image(ix, -bg.displayHeight * 0.5, k === 'fries' ? 'fries_cooked' : 'bun_top');
      icon.setScale(iconW / icon.width);
      this.bubble.add(icon);
    });
    this.ticks = scene.add.graphics();
    this.bubble.add(this.ticks);

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
      this.body.setAlpha(0).setY(bottom + 50);
      scene.tweens.add({ targets: this.body, alpha: 1, y: bottom, duration: 380, ease: 'Back.Out' });
      this.bubble.setScale(0);
      scene.tweens.add({ targets: this.bubble, scale: 1, duration: 280, delay: 330, ease: 'Back.Out' });
    }
  }

  get hitRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - this.bodyW / 2 - 14, this.body.y - BODY_H - 8, this.bodyW + 28, BODY_H + 24);
  }
  get center(): { x: number; y: number } {
    return { x: this.x, y: this.body.y - BODY_H / 2 };
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
      const cy = -26;
      g.fillStyle(LEAF, 1).fillCircle(cx, cy, 11);
      g.lineStyle(2, INK, 1).strokeCircle(cx, cy, 11);
      g.lineStyle(3, 0xffffff, 1).beginPath().moveTo(cx - 5, cy).lineTo(cx - 1, cy + 4).lineTo(cx + 6, cy - 5).strokePath();
    });
  }

  private setMood(m: 'normal' | 'worried' | 'angry' | 'happy'): void {
    if (this.mood === m) return;
    this.mood = m;
    // The supplied customers have one pose, so mood shows as a tint and a small motion.
    if (m === 'angry') this.body.setTint(0xff9a8a);
    else if (m === 'worried') this.body.setTint(0xffe2a0);
    else this.body.clearTint();
    if (m === 'happy' && !SaveSystem.reduceMotion()) {
      this.scene.tweens.add({ targets: this.body, y: this.body.y - 16, duration: 160, yoyo: true, ease: 'Quad.Out' });
    }
  }

  update(c: Customer, now: number): void {
    const frac = c.patience / c.patienceMax;
    this.drawBar(frac);
    this.drawTicks(c);
    if (c.mood === 'happy') this.setMood('happy');
    else if (c.mood === 'angry' || frac < 0.25) this.setMood('angry');
    else if (frac < 0.5) this.setMood('worried');
    else this.setMood('normal');
    const shaking = c.mood === 'waiting' && frac < 0.25 && !SaveSystem.reduceMotion();
    this.bubble.x = this.bubbleBaseX + (shaking ? Math.sin(now / 35) * 2.5 : 0);
  }

  leave(done: () => void): void {
    this.leaving = true;
    this.highlight.setVisible(false);
    this.bobTween?.stop();
    if (SaveSystem.reduceMotion()) {
      done();
      return;
    }
    this.scene.tweens.add({ targets: [this.bubble, this.price, this.barFrame, this.bar], alpha: 0, duration: 200 });
    this.scene.tweens.add({ targets: this.body, alpha: 0, y: this.body.y + 40, duration: 300, onComplete: done });
  }

  destroy(): void {
    this.bobTween?.stop();
    this.scene.tweens.killTweensOf([this.body, this.bubble, this.price, this.barFrame, this.bar]);
    this.body.destroy();
    this.bubble.destroy();
    this.price.destroy();
    this.barFrame.destroy();
    this.bar.destroy();
    this.highlight.destroy();
  }
}
