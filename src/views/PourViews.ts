import Phaser from 'phaser';
import type { KitchenState } from '../game/KitchenState';
import { INK } from '../art/builders';
import { Ring } from './Ring';
import { CONE, CONE_RING, CUP, DRINK_RING, type Layout } from './layout';

/**
 * The drinks dispenser and the ice cream machine. Both are painted into the kitchen art (three empty
 * cups, three empty cones), so nothing is drawn on top at rest. While the model is working, one glass
 * fills (or one scoop grows) in the first painted slot and a Ring above the machine shows the phase.
 * Looks only: the model decides when a cup is full and when a cone melts.
 */
const SODA = 0x6b3b1f;
const SCOOP = 0xf7b6c8;

export class PourViews {
  private cupRing: Ring;
  private coneRing: Ring;
  private cup: Phaser.GameObjects.Graphics;
  private cone: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private layout: Layout) {
    this.cupRing = new Ring(scene, layout.x(DRINK_RING[0]), layout.y(DRINK_RING[1]));
    this.coneRing = new Ring(scene, layout.x(CONE_RING[0]), layout.y(CONE_RING[1]));
    this.cup = scene.add.graphics().setDepth(590);
    this.cone = scene.add.graphics().setDepth(590);
  }

  /** Where a collected cup leaves from. */
  dispenserPos(): { x: number; y: number } {
    return { x: this.layout.x(CUP[0] + CUP[2] / 2), y: this.layout.y(CUP[1] + CUP[3] / 2) };
  }
  /** Where a collected cone leaves from. */
  conePos(): { x: number; y: number } {
    return { x: this.layout.x(CONE[0] + CONE[2] / 2), y: this.layout.y(CONE[1] + CONE[3] / 2) };
  }
  ringPos(which: 'drink' | 'cone'): { x: number; y: number } {
    const r = which === 'drink' ? DRINK_RING : CONE_RING;
    return { x: this.layout.x(r[0]), y: this.layout.y(r[1]) };
  }

  update(state: KitchenState, now: number): void {
    const L = this.layout;
    const drink = state.spouts.find((p) => p) ?? null;
    const dDef = state.cfg.recipes.items.drink;
    this.cup.clear();
    if (drink) {
      const f = Math.min(1, drink.t / dDef.readyAfter!);
      const [x, y, w, h] = CUP;
      const px = L.x(x);
      const pw = L.s(w);
      const ph = L.s(h);
      const py = L.y(y);
      this.cup.fillStyle(SODA, 0.92).fillRect(px, py + ph * (1 - f), pw, ph * f);
      this.cup.lineStyle(2, INK, 0.5).strokeRect(px, py, pw, ph);
    }
    this.cupRing.show(drink ? drink.phase : null, drink ? drink.t / dDef.readyAfter! : 0, now);

    const cone = state.cones.find((p) => p) ?? null;
    const cDef = state.cfg.recipes.items.icecream;
    this.cone.clear();
    if (cone) {
      const f = Math.min(1, cone.t / cDef.readyAfter!);
      const [x, y, w] = CONE;
      const r = L.s(w) * 0.52 * (0.35 + 0.65 * f);
      // A scoop that droops pinker-to-paler as it nears melting.
      const melt = cone.phase === 'warning' || cone.phase === 'danger' ? 0.65 : 1;
      this.cone.fillStyle(SCOOP, melt).fillCircle(L.x(x + w / 2), L.y(y) - r * 0.2, r);
      this.cone.lineStyle(3, INK, 0.9).strokeCircle(L.x(x + w / 2), L.y(y) - r * 0.2, r);
    }
    this.coneRing.show(cone ? cone.phase : null, cone ? cone.t / cDef.readyAfter! : 0, now);
  }

  destroy(): void {
    this.cupRing.destroy();
    this.coneRing.destroy();
    this.cup.destroy();
    this.cone.destroy();
  }
}
