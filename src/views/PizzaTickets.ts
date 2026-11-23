import Phaser from 'phaser';
import type { PizzaCustomer, PizzaKitchenState } from '../game/pizza/PizzaKitchenState';
import { isCustomId } from '../game/pizza/pizzaCustom';
import { SaveSystem } from '../systems/SaveSystem';
import { iconFrame } from './PizzaViews';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const DEPTH = 31;
const X = 12;
const TOP = 124;
const STEP = 45;
const W = 130;
const H = 41;

interface Card {
  id: number;
  box: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Graphics;
  done: boolean;
  key: string;
}

/** Delivery Rush takeout tickets: small cards in a column at the left edge. They only read the model. */
export class PizzaTickets {
  private cards = new Map<number, Card>();

  constructor(private scene: Phaser.Scene, private s: PizzaKitchenState) {}

  private slotY(i: number): number {
    return TOP + i * STEP;
  }

  sync(): void {
    const seen = new Set<number>();
    this.s.tickets.forEach((t, i) => {
      seen.add(t.id);
      let c = this.cards.get(t.id);
      const key = `${t.mood}|${t.delivered.join()}`;
      if (!c) c = this.create(t, i);
      if (c.key !== key) this.redraw(c, t);
      c.key = key;
      c.box.setY(this.slotY(i));
      this.drawBar(c, t);
    });
    for (const [id, c] of this.cards) {
      if (seen.has(id)) continue;
      c.box.destroy();
      this.cards.delete(id);
    }
  }

  private create(t: PizzaCustomer, i: number): Card {
    const box = this.scene.add.container(X, this.slotY(i)).setDepth(DEPTH);
    const bar = this.scene.add.graphics();
    const c: Card = { id: t.id, box, bar, done: false, key: '' };
    this.cards.set(t.id, c);
    this.redraw(c, t);
    if (!SaveSystem.reduceMotion()) {
      box.setAlpha(0);
      this.scene.tweens.add({ targets: box, alpha: 1, duration: 200 });
    }
    return c;
  }

  private redraw(c: Card, t: PizzaCustomer): void {
    c.box.removeAll(true);
    c.bar = this.scene.add.graphics();
    const done = t.mood === 'happy';
    const gone = t.mood === 'angry';
    const g = this.scene.add.graphics();
    g.fillStyle(done ? 0xcfeccf : gone ? 0xd9c5c5 : 0xfff4dc, 0.95).fillRoundedRect(0, 0, W, H, 10);
    g.lineStyle(3, 0xb8742a, 1).strokeRoundedRect(0, 0, W, H, 10);
    c.box.add(g);
    const dish = this.s.dishDef(t.items[0]);
    const f = dish ? iconFrame(dish) : null;
    if (f && this.scene.textures.exists(f.atlas)) {
      const img = this.scene.add.image(24, H / 2, f.atlas, f.frame);
      img.setScale(Math.min(32 / img.width, 32 / img.height));
      c.box.add(img);
    }
    const label = done ? 'Done!' : gone ? 'Missed' : isCustomId(t.items[0]) ? 'Custom' : 'Takeout';
    c.box.add(this.scene.add.text(46, 4, label, { fontFamily: FONT, fontSize: '16px', color: '#4A2A12' }));
    c.box.add(this.scene.add.text(46, 21, `+${Math.round(t.price * this.s.pizza.events.delivery_rush.coinMult)}`, { fontFamily: FONT, fontSize: '14px', color: '#8A5A00' }));
    c.box.add(c.bar);
  }

  private drawBar(c: Card, t: PizzaCustomer): void {
    c.bar.clear();
    if (t.mood !== 'waiting') return;
    const f = Math.max(0, t.patience / t.patienceMax);
    c.bar.fillStyle(0x4a2a12, 0.35).fillRect(8, H - 6, W - 16, 4);
    c.bar.fillStyle(f > 0.3 ? 0x4caf50 : 0xe05a3a, 1).fillRect(8, H - 6, (W - 16) * f, 4);
  }

  /** The waiting ticket under a screen point, for dropping a pizza on it. */
  ticketAt(x: number, y: number): PizzaCustomer | null {
    for (const [id, c] of this.cards) {
      const t = this.s.tickets.find((k) => k.id === id);
      if (!t || t.mood !== 'waiting') continue;
      if (x >= c.box.x - 6 && x <= c.box.x + W + 6 && y >= c.box.y - 4 && y <= c.box.y + H + 4) return t;
    }
    return null;
  }

  centerOf(id: number): { x: number; y: number } | null {
    const c = this.cards.get(id);
    return c ? { x: c.box.x + W / 2, y: c.box.y + H / 2 } : null;
  }

  destroy(): void {
    for (const c of this.cards.values()) c.box.destroy();
    this.cards.clear();
  }
}
