import Phaser from 'phaser';
import type { KitchenState } from '../game/KitchenState';
import { INK } from '../art/builders';
import { Ring } from './Ring';
import assetsJson from '../../data/assets.json';
import { SaveSystem } from '../systems/SaveSystem';
import { COLD, COLD_BASE_W, COLD_FRAMES, COLD_ICON_OFFSET, COLD_LANE_DX, COLD_LANES, COLD_LAYER_OFFSET, COLD_ZORDER, CONE, CONE_RING, CUP, DRINK_RING, ICE, ICE_BASE_W, ICE_FRAMES, ICE_LANES, ICE_LANE_DX, ICE_LAYER_OFFSET, type Layout } from './layout';

/**
 * The drinks dispenser and the ice cream machine. Both are painted into the kitchen art (three empty
 * cups, three empty cones), so nothing is drawn on top at rest. While the model is working, one glass
 * fills (or one scoop grows) in the first painted slot and a Ring above the machine shows the phase.
 * Looks only: the model decides when a cup is full and when a cone melts.
 */
const SODA = 0x6b3b1f;
export const ICE_BASE = 'ice_cream_base';
export const ICE_ANIM = 'ice_cream_anim';

/** Load the supplied ice cream art in the background. Until it arrives (or if it fails) the code-drawn scoop is used. */
export function loadIceCreamArt(scene: Phaser.Scene): void {
  const defs = (assetsJson as { assets: { key: string; file: string; frameWidth?: number; frameHeight?: number }[] }).assets;
  const base = defs.find((a) => a.key === ICE_BASE);
  const anim = defs.find((a) => a.key === ICE_ANIM);
  if (!base || !anim || !anim.frameWidth || !anim.frameHeight) return;
  let queued = false;
  scene.load.on('loaderror', (f: Phaser.Loader.File) => {
    if (f.key === ICE_BASE || f.key === ICE_ANIM) console.error(`Missing asset: ${f.key} (${f.url}); the ice cream animation is off`);
  });
  if (!scene.textures.exists(ICE_BASE)) (scene.load.image(ICE_BASE, base.file), (queued = true));
  if (!scene.textures.exists(ICE_ANIM)) (scene.load.spritesheet(ICE_ANIM, anim.file, { frameWidth: anim.frameWidth, frameHeight: anim.frameHeight }), (queued = true));
  if (queued && !scene.load.isLoading()) scene.load.start();
}
const SCOOP = 0xf7b6c8;
export const COLD_BASE = 'cold_drink_base';
export const COLD_ANIM = 'cold_drink_anim';
export const COLD_ICON = 'cold_drink_icon';

/** Load the supplied cold drink art in the background. Until it arrives (or if it fails) the code-drawn glass is used. */
export function loadColdDrinkArt(scene: Phaser.Scene): void {
  const defs = (assetsJson as { assets: { key: string; file: string; frameWidth?: number; frameHeight?: number }[] }).assets;
  const find = (k: string) => defs.find((a) => a.key === k);
  const base = find(COLD_BASE);
  const anim = find(COLD_ANIM);
  const icon = find(COLD_ICON);
  if (!base || !anim || !icon || !anim.frameWidth || !anim.frameHeight || !icon.frameWidth || !icon.frameHeight) return;
  let queued = false;
  scene.load.on('loaderror', (f: Phaser.Loader.File) => {
    if (f.key === COLD_BASE || f.key === COLD_ANIM || f.key === COLD_ICON) console.error(`Missing asset: ${f.key} (${f.url}); the cold drink animation is off`);
  });
  if (!scene.textures.exists(COLD_BASE)) (scene.load.image(COLD_BASE, base.file), (queued = true));
  if (!scene.textures.exists(COLD_ANIM)) (scene.load.spritesheet(COLD_ANIM, anim.file, { frameWidth: anim.frameWidth, frameHeight: anim.frameHeight }), (queued = true));
  if (!scene.textures.exists(COLD_ICON)) (scene.load.spritesheet(COLD_ICON, icon.file, { frameWidth: icon.frameWidth, frameHeight: icon.frameHeight }), (queued = true));
  if (queued && !scene.load.isLoading()) scene.load.start();
}

export class PourViews {
  private cupRing: Ring;
  private coneRing: Ring;
  private cup: Phaser.GameObjects.Graphics;
  private cone: Phaser.GameObjects.Graphics;
  private laneRings: Ring[] = [];
  private layers: Phaser.GameObjects.Sprite[] = [];
  private baseImg?: Phaser.GameObjects.Image;
  private coldBase?: Phaser.GameObjects.Image;
  private coldLayers = new Map<string, Phaser.GameObjects.Sprite>();
  private coldIcon?: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, private layout: Layout) {
    this.scene = scene;
    this.cupRing = new Ring(scene, layout.x(DRINK_RING[0]), layout.y(DRINK_RING[1]));
    this.coneRing = new Ring(scene, layout.x(CONE_RING[0]), layout.y(CONE_RING[1]));
    this.cup = scene.add.graphics().setDepth(590);
    this.cone = scene.add.graphics().setDepth(590);
  }

  private coldPt(bx: number, by: number): { x: number; y: number } {
    const k = COLD.w / COLD_BASE_W;
    return { x: COLD.x + bx * k, y: COLD.y + by * k };
  }
  /** Where a collected cup leaves from (the glass in its lane when the art is on, else the first painted cup). */
  dispenserPos(i = 0): { x: number; y: number } {
    if (this.coldBase) {
      const p = this.coldPt(COLD_LAYER_OFFSET[0] + COLD_LANE_DX[COLD_LANES[i % COLD_LANES.length]] + 61, 290);
      return { x: this.layout.x(p.x), y: this.layout.y(p.y) };
    }
    return { x: this.layout.x(CUP[0] + CUP[2] / 2), y: this.layout.y(CUP[1] + CUP[3] / 2) };
  }
  /** True once the supplied ice cream art is on screen. */
  get artReady(): boolean {
    return !!this.baseImg;
  }
  private iceScale(): number {
    return this.layout.s(ICE.w) / ICE_BASE_W;
  }
  /** Position (source px) of base-pixel point (bx, by) on the machine. */
  private icePt(bx: number, by: number): { x: number; y: number } {
    const k = ICE.w / ICE_BASE_W;
    return { x: ICE.x + bx * k, y: ICE.y + by * k };
  }
  private laneX(cone: number): number {
    return 150.5 + ICE_LANE_DX[ICE_LANES[cone % ICE_LANES.length]];
  }
  /** Where a collected cone leaves from (the cone in its lane when the art is on, else the first painted cone). */
  conePos(i = 0): { x: number; y: number } {
    if (this.baseImg) {
      const p = this.icePt(this.laneX(i), 315);
      return { x: this.layout.x(p.x), y: this.layout.y(p.y) };
    }
    return { x: this.layout.x(CONE[0] + CONE[2] / 2), y: this.layout.y(CONE[1] + CONE[3] / 2) };
  }
  /** Where a lane's progress ring sits (on the cabinet under the machine), or the single ring without the art. */
  coneRingPos(i: number): { x: number; y: number } {
    if (this.baseImg) {
      const p = this.icePt(this.laneX(i), 408);
      return { x: this.layout.x(p.x), y: this.layout.y(p.y) };
    }
    return this.ringPos('cone');
  }

  /** Build the base picture, the three animation layers and their rings, once the art has loaded. */
  private attachArt(): void {
    if (this.baseImg || !this.scene.textures.exists(ICE_BASE) || !this.scene.textures.exists(ICE_ANIM)) return;
    const L = this.layout;
    const sc = this.iceScale();
    this.baseImg = this.scene.add.image(L.x(ICE.x), L.y(ICE.y), ICE_BASE).setOrigin(0, 0).setDepth(240).setScale(sc);
    ICE_LANES.forEach((lane, i) => {
      const p = this.icePt(ICE_LAYER_OFFSET[0] + ICE_LANE_DX[lane], ICE_LAYER_OFFSET[1]);
      this.layers.push(this.scene.add.sprite(L.x(p.x), L.y(p.y), ICE_ANIM, 0).setOrigin(0, 0).setDepth(245).setScale(sc).setVisible(false));
      const r = this.coneRingPos(i);
      this.laneRings.push(new Ring(this.scene, r.x, r.y, 13));
    });
    this.coneRing.setVisible(false);
    this.cone.clear();
  }

  /** Build the cold drink picture, its three lanes and the header glow once the art has loaded. */
  private attachColdArt(): void {
    if (this.coldBase || !this.scene.textures.exists(COLD_BASE) || !this.scene.textures.exists(COLD_ANIM) || !this.scene.textures.exists(COLD_ICON)) return;
    const L = this.layout;
    const sc = this.layout.s(COLD.w) / COLD_BASE_W;
    this.coldBase = this.scene.add.image(L.x(COLD.x), L.y(COLD.y), COLD_BASE).setOrigin(0, 0).setDepth(240).setScale(sc);
    COLD_ZORDER.forEach((lane, z) => {
      const p = this.coldPt(COLD_LAYER_OFFSET[0] + COLD_LANE_DX[lane], COLD_LAYER_OFFSET[1]);
      this.coldLayers.set(lane, this.scene.add.sprite(L.x(p.x), L.y(p.y), COLD_ANIM, 0).setOrigin(0, 0).setDepth(245 + z).setScale(sc));
    });
    const ip = this.coldPt(COLD_ICON_OFFSET[0], COLD_ICON_OFFSET[1]);
    this.coldIcon = this.scene.add.sprite(L.x(ip.x), L.y(ip.y), COLD_ICON, 0).setOrigin(0, 0).setDepth(248).setScale(sc);
    this.cup.clear();
  }

  /** A melting cone fades away where it stood. */
  melt(i: number): void {
    const src = this.layers[i];
    if (!src || SaveSystem.reduceMotion()) return;
    const ghost = this.scene.add.sprite(src.x, src.y, ICE_ANIM, ICE_FRAMES - 1).setOrigin(0, 0).setDepth(246).setScale(src.scaleX);
    this.scene.tweens.add({ targets: ghost, alpha: 0, y: ghost.y + this.layout.s(6), duration: 450, onComplete: () => ghost.destroy() });
  }
  ringPos(which: 'drink' | 'cone'): { x: number; y: number } {
    const r = which === 'drink' ? DRINK_RING : CONE_RING;
    return { x: this.layout.x(r[0]), y: this.layout.y(r[1]) };
  }

  update(state: KitchenState, now: number): void {
    const L = this.layout;
    const dDef = state.cfg.recipes.items.drink;
    this.attachColdArt();
    let drink: (typeof state.spouts)[number] = state.spouts.find((p) => p) ?? null;
    if (this.coldBase) {
      // The frame is a function of the model's timers only; the model decides when a cup is full.
      let newest: (typeof state.spouts)[number] = null;
      COLD_LANES.forEach((lane, i) => {
        const c = state.spouts[i] ?? null;
        const frame = !c ? 0 : c.phase === 'cooking' ? Math.min(COLD_FRAMES - 1, Math.floor(Math.min(1, c.t / dDef.readyAfter!) * (COLD_FRAMES - 1))) : COLD_FRAMES - 1;
        this.coldLayers.get(lane)?.setFrame(frame);
        if (c && c.phase === 'cooking' && (!newest || c.t < newest.t)) newest = c;
      });
      const cooking = newest as (typeof state.spouts)[number];
      this.coldIcon?.setFrame(cooking ? Math.min(COLD_FRAMES - 1, Math.floor(Math.min(1, cooking.t / dDef.readyAfter!) * (COLD_FRAMES - 1))) : 0);
      // One ring: a tick when any cup is full, otherwise the progress of the cup that is furthest along.
      const full = state.spouts.some((c) => c?.phase === 'ready');
      const lead = state.spouts.reduce<(typeof state.spouts)[number]>((a, c) => (c && (!a || c.t > a.t) ? c : a), null);
      this.cup.clear();
      this.cupRing.show(full ? 'ready' : lead ? 'cooking' : null, lead ? lead.t / dDef.readyAfter! : 0, now);
      drink = null;
    } else {
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
    }

    const cDef = state.cfg.recipes.items.icecream;
    this.attachArt();
    if (this.baseImg) {
      this.cone.clear();
      state.cones.forEach((c, i) => {
        const layer = this.layers[i];
        const ring = this.laneRings[i];
        if (!layer || !ring) return;
        if (!c) {
          layer.setVisible(false);
          ring.show(null, 0, now);
          return;
        }
        // The frame is a function of the model's timer only; the model decides when the cone is ready.
        const p = Math.min(1, c.t / cDef.readyAfter!);
        layer.setVisible(true).setFrame(c.phase === 'cooking' ? Math.min(ICE_FRAMES - 1, Math.floor(p * (ICE_FRAMES - 1))) : ICE_FRAMES - 1);
        layer.setAlpha(c.phase === 'danger' && !SaveSystem.reduceMotion() ? 0.7 + 0.3 * Math.sin(now / 90) : 1);
        ring.show(c.phase, p, now);
      });
      return;
    }
    const cone = state.cones.find((p) => p) ?? null;
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
    this.baseImg?.destroy();
    this.coldBase?.destroy();
    this.coldLayers.forEach((l) => l.destroy());
    this.coldIcon?.destroy();
    this.layers.forEach((l) => l.destroy());
    this.laneRings.forEach((r) => r.destroy());
  }
}
