import Phaser from 'phaser';
import type { Customer } from '../game/KitchenState';
import { INK, LEAF, MUSTARD, TOMATO, type Expression } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { SEATS_X, SEAT_BOTTOM_Y, Layout } from './layout';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const BODY_W = 124;
const BODY_H = 136;

/**
 * One customer: a bust, an order card with a vertical patience strip, item icons,
 * green ticks and the price. Reads the model every frame; it never decides anything.
 */
export class CustomerView {
  readonly id: number;
  readonly body: Phaser.GameObjects.Image;
  private card: Phaser.GameObjects.Container;
  private strip: Phaser.GameObjects.Graphics;
  private ticks: Phaser.GameObjects.Graphics;
  private highlight: Phaser.GameObjects.Rectangle;
  private expr: Expression | null = null;
  private x: number;
  private cardBaseX: number;
  private bobTween?: Phaser.Tweens.Tween;
  private leaving = false;

  constructor(private scene: Phaser.Scene, layout: Layout, c: Customer) {
    this.id = c.id;
    this.x = layout.x(SEATS_X[c.seat]);
    const bottom = layout.y(SEAT_BOTTOM_Y);
    this.body = scene.add.image(this.x, bottom, `customer_${c.look}_neutral`).setOrigin(0.5, 1).setScale(0.62).setDepth(300);
    this.body.setInteractive({ useHandCursor: true });
    this.highlight = scene.add
      .rectangle(this.x, bottom - BODY_H / 2, BODY_W + 18, BODY_H + 14)
      .setStrokeStyle(5, 0xffffff, 1)
      .setFillStyle(0xffffff, 0.12)
      .setDepth(299)
      .setVisible(false);

    this.cardBaseX = this.x + 118;
    this.card = scene.add.container(this.cardBaseX, 36).setDepth(310);
    const bg = scene.add.image(0, 0, 'card').setOrigin(0.5, 0).setScale(0.5);
    this.strip = scene.add.graphics();
    this.ticks = scene.add.graphics();
    this.card.add([bg, this.strip, this.ticks]);
    c.items.forEach((k, i) => {
      const icon = scene.add.image(10, 26 + i * 36, k === 'fries' ? 'icon_fries' : 'icon_burger').setScale(0.5);
      this.card.add(icon);
    });
    const coin = scene.add.image(-12, 104, 'coin').setScale(0.5);
    const price = scene.add
      .text(8, 104, String(c.price), { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' })
      .setOrigin(0, 0.5);
    this.card.add([coin, price]);
    this.drawStrip(1);

    // arrival: the customer slides in and the order card pops
    if (SaveSystem.reduceMotion()) {
      this.card.setScale(1);
    } else {
      this.body.setAlpha(0).setY(bottom + 50);
      scene.tweens.add({ targets: this.body, alpha: 1, y: bottom, duration: 380, ease: 'Back.Out' });
      this.card.setScale(0);
      scene.tweens.add({ targets: this.card, scale: 1, duration: 280, delay: 330, ease: 'Back.Out' });
      this.bobTween = scene.tweens.add({ targets: this.body, y: bottom - 3, duration: 1100 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 700 });
    }
  }

  get hitRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - BODY_W / 2 - 10, this.body.y - BODY_H - 6, BODY_W + 20, BODY_H + 16);
  }
  get center(): { x: number; y: number } {
    return { x: this.x, y: this.body.y - BODY_H / 2 };
  }

  setDropHighlight(on: boolean): void {
    this.highlight.setVisible(on && !this.leaving);
  }

  private drawStrip(frac: number): void {
    const g = this.strip;
    g.clear();
    const x = -36;
    const top = 12;
    const h = 92;
    g.fillStyle(INK, 0.25).fillRoundedRect(x, top, 10, h, 4);
    const color = frac > 0.5 ? LEAF : frac > 0.25 ? MUSTARD : TOMATO;
    const fh = Math.max(3, h * frac);
    g.fillStyle(color, 1).fillRoundedRect(x, top + h - fh, 10, fh, 4);
    g.lineStyle(2, INK, 1).strokeRoundedRect(x, top, 10, h, 4);
  }

  private drawTicks(c: Customer): void {
    const g = this.ticks;
    g.clear();
    c.delivered.forEach((d, i) => {
      if (!d) return;
      const cx = 30;
      const cy = 38 + i * 36;
      g.fillStyle(LEAF, 1).fillCircle(cx, cy - 12, 10);
      g.lineStyle(2, INK, 1).strokeCircle(cx, cy - 12, 10);
      g.lineStyle(3, 0xffffff, 1).beginPath().moveTo(cx - 5, cy - 12).lineTo(cx - 1, cy - 8).lineTo(cx + 6, cy - 17).strokePath();
    });
  }

  private setExpression(e: Expression): void {
    if (this.expr === e) return;
    this.expr = e;
    const key = this.body.texture.key.replace(/_[a-z]+$/, `_${e}`);
    this.body.setTexture(key);
    if (e === 'happy' && !SaveSystem.reduceMotion()) {
      this.scene.tweens.add({ targets: this.body, y: this.body.y - 16, duration: 160, yoyo: true, ease: 'Quad.Out' });
    }
  }

  update(c: Customer, now: number): void {
    const frac = c.patience / c.patienceMax;
    this.drawStrip(frac);
    this.drawTicks(c);
    if (c.mood === 'happy') this.setExpression('happy');
    else if (c.mood === 'angry' || frac < 0.25) this.setExpression('angry');
    else if (frac < 0.5) this.setExpression('impatient');
    else this.setExpression('neutral');
    // card shakes in the red zone (skipped with reduced motion)
    const shaking = c.mood === 'waiting' && frac < 0.25 && !SaveSystem.reduceMotion();
    this.card.x = this.cardBaseX + (shaking ? Math.sin(now / 35) * 2.5 : 0);
  }

  leave(done: () => void): void {
    this.leaving = true;
    this.highlight.setVisible(false);
    this.bobTween?.stop();
    if (SaveSystem.reduceMotion()) {
      done();
      return;
    }
    this.scene.tweens.add({ targets: this.card, scale: 0, duration: 160, ease: 'Back.In' });
    this.scene.tweens.add({ targets: this.body, alpha: 0, y: this.body.y + 40, duration: 300, onComplete: done });
  }

  destroy(): void {
    this.bobTween?.stop();
    this.scene.tweens.killTweensOf([this.body, this.card]);
    this.body.destroy();
    this.card.destroy();
    this.highlight.destroy();
  }
}
