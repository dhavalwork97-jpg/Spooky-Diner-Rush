import Phaser from 'phaser';
import type { KitchenState } from '../game/KitchenState';
import { ParticlePool } from '../anim/ParticlePool';
import { SaveSystem } from '../systems/SaveSystem';
import { bounce } from '../anim/helpers';
import { Ring } from './Ring';
import { BURNER_LABEL_BELOW, BURNERS, Layout, OVENS, OVENS_LIT, VAT_FOOD_W, VAT_GLASS, VATS } from './layout';
import { OvenDoor } from './OvenDoor';

/**
 * Fryer and grill visuals. Every frame they read the model (phase and elapsed time)
 * and show it. They never decide whether anything is cooked or burnt.
 */

interface VatView {
  fries: Phaser.GameObjects.Image;
  k: number;
  ring: Ring;
  nextBubble: number;
  nextSmoke: number;
  holdUntil: number; // raw fries are still flying in from the bin
  oil: Phaser.GameObjects.Graphics; // translucent oil over the lower part of the food, with a rippling surface
  ripples: { x: number; at: number }[];
}
interface BurnerView {
  base: Phaser.GameObjects.Image;
  top: Phaser.GameObjects.Image; // cooked overlay that fades in as the side browns
  k: number;
  ring: Ring;
  flipText: Phaser.GameObjects.Text;
  nextSteam: number;
  nextSmoke: number;
  flipping: boolean;
  holdUntil: number;
}

interface OvenView {
  base: Phaser.GameObjects.Image; // raw pizza
  top: Phaser.GameObjects.Image; // cooked pizza that fades in as it bakes
  k: number;
  baseY: number;
  door: OvenDoor;
  ring: Ring;
  nextSmoke: number;
  holdUntil: number;
}

export class StationViews {
  private ovens: OvenView[] = [];
  private vats: VatView[] = [];
  private burners: BurnerView[] = [];

  constructor(private scene: Phaser.Scene, private layout: Layout, private fx: ParticlePool, state: KitchenState) {
    state.vats.forEach((_, i) => {
      const [sx, sy] = VATS[i];
      const x = layout.x(sx);
      const y = layout.y(sy);
      const fries = scene.add.image(x, y + 1, 'fries_raw').setDepth(500).setVisible(false);
      const k = layout.fit(fries, VAT_FOOD_W.fries);
      const oil = scene.add.graphics().setDepth(502);
      this.vats.push({ fries, k, ring: new Ring(scene, x, y - layout.s(78)), nextBubble: 0, nextSmoke: 0, holdUntil: 0, oil, ripples: [] });
    });
    state.ovens.forEach((_, i) => {
      const [sx, sy] = OVENS[i];
      const [lx, ly] = OVENS_LIT[i];
      const x = layout.x(sx);
      const y = layout.y(sy);
      // Raw pizza waits on the pulled-out door; the cooked one sits on the baking tray once the door has opened.
      const base = scene.add.image(x, y, 'pizza_raw').setDepth(500).setVisible(false);
      const top = scene.add.image(layout.x(lx), layout.y(ly), 'pizza_cooked').setDepth(501).setAlpha(0).setVisible(false);
      const k = layout.fit(base, 160);
      top.setScale(layout.s(130) / top.width, (layout.s(130) / top.width) * 0.8);
      this.ovens.push({ base, top, k, baseY: y, door: new OvenDoor(scene, layout), ring: new Ring(scene, x, y - layout.s(110)), nextSmoke: 0, holdUntil: 0 });
    });
    state.burners.forEach((_, i) => {
      const [sx, sy] = BURNERS[i];
      const x = layout.x(sx);
      const y = layout.y(sy);
      const base = scene.add.image(x, y, 'patty_raw').setDepth(500).setVisible(false);
      const top = scene.add.image(x, y, 'patty_cooked').setDepth(501).setAlpha(0).setVisible(false);
      const k = layout.fit(base, 120);
      top.setScale(k);
      const below = BURNER_LABEL_BELOW[i];
      const flipText = scene.add
        .text(x, below ? y + layout.s(72) + 26 : y - layout.s(72) - 26, 'FLIP', { fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif', fontSize: '20px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(602)
        .setVisible(false);
      this.burners.push({ base, top, k, ring: new Ring(scene, x, below ? y + layout.s(62) : y - layout.s(62)), flipText, nextSteam: 0, nextSmoke: 0, flipping: false, holdUntil: 0 });
    });
  }

  update(state: KitchenState, now: number): void {
        state.vats.forEach((v, i) => {
      const view = this.vats[i];
      if (!v || now < view.holdUntil) {
        view.fries.setVisible(false);
        view.oil.clear();
        view.ripples.length = 0;
        view.ring.show(null, 0, now);
        return;
      }
      // Fries are shown in the vat as the raw sticks turning golden (the boxed cooked art is for the plate).
      const tex = v.kind === 'nuggets' ? (v.phase === 'cooking' ? 'nuggets_raw' : v.phase === 'burnt' ? 'nuggets_burnt' : 'nuggets_cooked') : v.phase === 'burnt' ? 'fries_burnt' : 'fries_raw';
      view.fries.setVisible(true).setTexture(tex);
      view.fries.setScale(this.layout.s(VAT_FOOD_W[v.kind === 'nuggets' ? 'nuggets' : 'fries']) / view.fries.width);
      if (v.kind === 'fries') {
        const tints: Record<string, number> = { cooking: 0xffffff, ready: 0xffd45e, warning: 0xe3a23a, danger: 0xb06a28, burnt: 0xffffff };
        view.fries.setTint(tints[v.phase]);
      } else view.fries.clearTint();
      view.ring.show(v.phase, v.t / state.cfg.recipes.items[v.kind].readyAfter!, now);

      const x = view.fries.x;
      const w = view.fries.displayWidth;
      const h = view.fries.displayHeight;
      const reduce = SaveSystem.reduceMotion();
      // food floats and jiggles in the oil
      if (!reduce) view.fries.setAngle(Math.sin(now / 190 + i * 2) * 2.2);
      // oil fills the whole glass lid (so the food is clearly inside the vat), with a rippling surface near the top
      const gw = this.layout.s(VAT_GLASS.halfW * 2);
      const gx = x - gw / 2;
      const gTop = this.layout.y(VAT_GLASS.top) + this.layout.s(5);
      const gBot = this.layout.y(VAT_GLASS.bottom) - this.layout.s(3);
      const top = gTop + this.layout.s(8);
      const g = view.oil;
      g.clear();
      g.fillStyle(0xf2b630, 0.3).fillRoundedRect(gx, gTop, gw, gBot - gTop, 6);
      g.lineStyle(3, 0xfff3b0, 0.9).beginPath();
      for (let px = 0; px <= gw; px += 6) {
        const wy = top + (reduce ? 0 : Math.sin(now / 150 + px / 9 + i) * 1.4);
        if (px === 0) g.moveTo(gx + px, wy);
        else g.lineTo(gx + px, wy);
      }
      g.strokePath();
      // surface ripples where bubbles pop
      view.ripples = view.ripples.filter((r) => now - r.at < 420);
      for (const r of view.ripples) {
        const t = (now - r.at) / 420;
        if (t < 0) continue;
        g.lineStyle(2, 0xfff8d0, 0.8 * (1 - t)).strokeEllipse(r.x, top, 6 + t * 16, 3 + t * 5);
      }
      // boiling: bubbles rise from the food and pop at the surface; denser while raw, calmer once golden
      if (!reduce && v.phase !== 'burnt' && now > view.nextBubble) {
        const boil = v.phase === 'cooking' ? 70 : 140;
        view.nextBubble = now + boil + Math.random() * boil;
        const bx = x + (Math.random() - 0.5) * Math.min(w, gw) * 0.8;
        const rise = Math.max(8, view.fries.y + h * 0.3 - top);
        this.fx.rise(bx, view.fries.y + h * 0.3, 0xfff6c8, 0.95, 2 + Math.random() * 2.5, rise, 460, (Math.random() - 0.5) * 6);
        view.ripples.push({ x: bx, at: now + 460 });
      }
      // smoke gets heavier from warning to danger
      if ((v.phase === 'warning' || v.phase === 'danger') && now > view.nextSmoke) {
        view.nextSmoke = now + (v.phase === 'danger' ? 150 : 320);
        this.fx.rise(x + (Math.random() - 0.5) * 20, view.fries.y - h * 0.3, v.phase === 'danger' ? 0x3a3a3a : 0xbdbdbd, v.phase === 'danger' ? 0.8 : 0.6, 6, 40, 900, (Math.random() - 0.5) * 18);
      }
    });

    const bake = state.cfg.recipes.items.pizza.readyAfter!;
    state.ovens.forEach((o, i) => {
      const view = this.ovens[i];
      // The door only follows the model's phase; it never decides anything.
      view.door.update(o ? o.phase : null, now, view.holdUntil);
      if (!o || now < view.holdUntil) {
        view.base.setVisible(false);
        view.top.setVisible(false);
        view.ring.show(null, 0, now);
        return;
      }
      const burnt = o.phase === 'burnt';
      if (view.door.ready) {
        // Door closing: the raw pizza slides in and disappears. Closed: nothing shows. Opening: the cooked pizza appears on the tray.
        const cp = view.door.closeProgress;
        const op = view.door.openProgress;
        if (o.phase === 'cooking') {
          const a = Math.max(0, 1 - cp * 2.5);
          view.base.setVisible(a > 0).setAlpha(a).setScale(view.k * (1 - 0.15 * cp)).setY(view.baseY - 16 * cp);
          view.top.setVisible(false);
        } else {
          view.base.setVisible(false);
          view.top.setVisible(true).setAlpha(Math.max(0, Math.min(1, (op - 0.55) / 0.35)));
        }
      } else {
        // No door art: browning is shown as the cooked pizza fading in over the raw one while it bakes.
        view.base.setVisible(!burnt && o.phase === 'cooking').setAlpha(1).setScale(view.k).setY(view.baseY);
        view.top.setVisible(true).setAlpha(burnt ? 1 : Math.min(1, o.t / bake));
      }
      if (burnt) view.top.setTint(0x3a2a22);
      else view.top.clearTint();
      view.ring.show(o.phase, o.t / bake, now);
      if ((o.phase === 'warning' || o.phase === 'danger') && now > view.nextSmoke) {
        view.nextSmoke = now + (o.phase === 'danger' ? 140 : 300);
        this.fx.rise(view.top.x + (Math.random() - 0.5) * 60, view.top.y - 20, o.phase === 'danger' ? 0x333333 : 0xaaaaaa, 0.75, 7, 50, 950, (Math.random() - 0.5) * 20);
      }
    });

    const side = state.cfg.recipes.items.burger.sideSeconds!;
    state.burners.forEach((p, i) => {
      const view = this.burners[i];
      if (!p || now < view.holdUntil) {
        view.base.setVisible(false);
        view.top.setVisible(false);
        view.ring.show(null, 0, now);
        view.flipText.setVisible(false);
        return;
      }
      const burnt = p.phase === 'burnt';
      if (!view.flipping) {
        view.base.setVisible(true).setTexture(burnt ? 'patty_burnt' : p.side === 2 ? 'patty_cooked' : 'patty_raw');
        const progress = Math.min(1, p.t / side);
        // browning: the cooked texture fades in over the raw one as this side cooks
        view.top.setVisible(!burnt).setAlpha(p.side === 1 ? progress : 0).setTint(0xffffff);
        if (p.side === 2) view.base.setTint(0xdddddd).setAlpha(1);
        else view.base.clearTint().setAlpha(1);
      }
      view.ring.show(p.phase, p.t / side, now);
      view.flipText.setVisible(p.side === 1 && p.phase !== 'cooking' && p.phase !== 'burnt');
      const x = view.base.x;
      const y = view.base.y;
      if (!burnt && now > view.nextSteam) {
        view.nextSteam = now + 200 + Math.random() * 160;
        this.fx.rise(x + (Math.random() - 0.5) * 40, y - 6, 0xffffff, 0.55, 4, 26, 650, (Math.random() - 0.5) * 10);
      }
      if ((p.phase === 'warning' || p.phase === 'danger') && now > view.nextSmoke) {
        view.nextSmoke = now + (p.phase === 'danger' ? 140 : 300);
        this.fx.rise(x + (Math.random() - 0.5) * 24, y - 12, p.phase === 'danger' ? 0x333333 : 0xaaaaaa, 0.75, 6, 44, 950, (Math.random() - 0.5) * 20);
      }
    });
  }

  /** Keep a vat's fries hidden while the raw fries fly in from the bin. */
  holdVat(vat: number, ms: number, now: number): void {
    if (this.vats[vat]) this.vats[vat].holdUntil = now + ms;
  }

  /** Squash-and-stretch hop when the patty is flipped. */
  flip(burner: number): void {
    const v = this.burners[burner];
    if (!v) return;
    v.flipping = true;
    const y = v.base.y;
    const k = v.k;
    const reduce = SaveSystem.reduceMotion();
    const targets = [v.base, v.top];
    if (reduce) {
      v.flipping = false;
      return;
    }
    this.scene.tweens.add({
      targets,
      y: y - 34,
      scaleX: k * 0.8,
      scaleY: k * 1.25,
      duration: 160,
      ease: 'Quad.Out',
      yoyo: true,
      onYoyo: () => targets.forEach((t) => t.setScale(k * 1.2, k * 0.8)),
      onComplete: () => {
        targets.forEach((t) => t.setPosition(t.x, y).setScale(k));
        v.flipping = false;
      },
    });
  }

  /** Little hop when something becomes ready. */
  readyBounce(where: 'vat' | 'burner' | 'oven', index: number): void {
    const t = where === 'vat' ? this.vats[index]?.fries : where === 'oven' ? this.ovens[index]?.top : this.burners[index]?.base;
    if (t) bounce(this.scene, t, `${where}${index}`, 10, 300);
  }

  burntPuff(where: 'vat' | 'burner' | 'oven', index: number): void {
    const target = where === 'vat' ? this.vats[index]?.fries : where === 'oven' ? this.ovens[index]?.top : this.burners[index]?.base;
    if (!target) return;
    for (let i = 0; i < 6; i++) this.fx.rise(target.x + (Math.random() - 0.5) * 30, target.y, 0x222222, 0.85, 9, 50, 800, (Math.random() - 0.5) * 30);
    this.scene.cameras.main.shake(SaveSystem.reduceMotion() ? 0 : 120, 0.0025);
  }

  /** Debug and tests: the oven door state ('open' | 'closing' | 'closed' | 'opening' | 'lit'), or 'none' without door art. */
  doorState(i: number): string {
    const o = this.ovens[i];
    return o && o.door.ready ? o.door.state : 'none';
  }

  /** Where the raw pizza lands in the oven (on the pulled-out door). */
  ovenLoadPos(i: number): { x: number; y: number } {
    return { x: this.ovens[i].base.x, y: this.ovens[i].baseY };
  }

  /** Keep the oven pizza hidden while the raw pizza flies in. */
  holdOven(oven: number, ms: number, now: number): void {
    if (this.ovens[oven]) this.ovens[oven].holdUntil = now + ms;
  }

  holdBurner(burner: number, ms: number, now: number): void {
    if (this.burners[burner]) this.burners[burner].holdUntil = now + ms;
  }

  ovenPos(i: number): { x: number; y: number } {
    return { x: this.ovens[i].top.x, y: this.ovens[i].top.y };
  }

  /** Where an item leaves from, for fly-to-counter animations. */
  vatPos(i: number): { x: number; y: number } {
    return { x: this.vats[i].fries.x, y: this.vats[i].fries.y };
  }
  burnerPos(i: number): { x: number; y: number } {
    return { x: this.burners[i].base.x, y: this.burners[i].base.y };
  }

  destroy(): void {
    this.vats.forEach((v) => {
      v.fries.destroy();
      v.oil.destroy();
      v.ring.destroy();
    });
    this.burners.forEach((b) => {
      b.base.destroy();
      b.top.destroy();
      b.ring.destroy();
      b.flipText.destroy();
    });
    this.ovens.forEach((o) => {
      o.door.destroy();
      o.base.destroy();
      o.top.destroy();
      o.ring.destroy();
    });
    this.vats = [];
    this.burners = [];
    this.ovens = [];
  }
}
