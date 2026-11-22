import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { CookPhase } from '../game/cook';
import { makeRng } from '../game/rng';
import { OvenDoorMachine, ovenDoorTarget } from '../game/pizza/pizzaOvenDoor';
import { defaultPizzaConfig, type DishDef, type PizzaConfig, type PizzaZone } from '../game/pizza/pizzaConfig';
import type { PizzaItem, PizzaKitchenState } from '../game/pizza/PizzaKitchenState';
import sheetMeta from '../../data/pizza_sheets.json';
import { SaveSystem } from '../systems/SaveSystem';
import { pop, shake } from '../anim/helpers';
import type { ParticlePool } from '../anim/ParticlePool';
import type { Ring } from './Ring';

// The Pizza Place pictures: art loader, the animated stations (brick oven, small oven, fryer, ice cream machine) and the pizzas on the boards and in the oven.
// Views only READ the kitchen model (PizzaKitchenState). They never decide when anything is done.

interface SheetMeta {
  key: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frameCount: number;
  clips: Record<string, { from: number; to: number; fps: number; loop: boolean }>;
  closedFrame?: number;
  openHoldFrame?: number;
  slots?: number[][];
  slotEllipse?: number[];
}
const SHEETS = sheetMeta as unknown as Record<string, SheetMeta>;

const ATLASES = ['raw_layers', 'baked_layers', 'toppings_a', 'toppings_b', 'ingredient_icons', 'pizza_icons', 'sides_items', 'fried_items', 'effects', 'cups_icons'] as const;
export const atlasKey = (name: string): string => `pz_${name}`;
export const sheetKey = (name: string): string => `pz_sheet_${name}`;

/** Queue the Pizza Place art (backgrounds are loaded by the scene). Missing files are reported by the scene's loaderror handler. */
export function loadPizzaArt(scene: Phaser.Scene): void {
  for (const a of ATLASES) scene.load.atlas(atlasKey(a), `assets/pizza/atlases/${a}.webp`, `assets/pizza/atlases/${a}.atlas.json`);
  for (const m of Object.values(SHEETS)) scene.load.spritesheet(sheetKey(m.key), `assets/pizza/sheets/${m.image}`, { frameWidth: m.frameWidth, frameHeight: m.frameHeight });
}

/** Which atlas holds a frame (frame names repeat between atlases, so the lookup is explicit). */
export function iconFrame(dish: DishDef): { atlas: string; frame: string } {
  switch (dish.kind) {
    case 'pizza':
      return { atlas: atlasKey('pizza_icons'), frame: dish.id.replace(/_pizza$/, '') };
    case 'side':
      return { atlas: atlasKey('sides_items'), frame: `${dish.id}_ready` };
    case 'fried':
      return { atlas: atlasKey('fried_items'), frame: `${dish.basket === 1 ? 'wings' : 'fries'}_ready` };
    default:
      return { atlas: atlasKey('cups_icons'), frame: 'icecream_full_icon_128' };
  }
}
export function ingredientFrame(step: string): { atlas: string; frame: string } {
  const [kind, id] = step.split(':');
  return { atlas: atlasKey('ingredient_icons'), frame: kind === 'topping' ? id : `${kind}_${id}` };
}

const hasFrame = (scene: Phaser.Scene, atlas: string, frame: string): boolean => scene.textures.exists(atlas) && scene.textures.get(atlas).has(frame);

/** Frame of a sheet clip `t` seconds after it started. */
export function clipFrame(meta: SheetMeta, clip: string, t: number): number {
  const c = meta.clips[clip];
  if (!c) return 0;
  const n = c.to - c.from + 1;
  const i = Math.floor(Math.max(0, t) * c.fps);
  return c.from + (c.loop ? i % n : Math.min(n - 1, i));
}

const TINT: Record<string, number> = { cooking: 0xe9e1d2, ready: 0xffffff, warning: 0xe2ae6a, danger: 0xc98a4a, burnt: 0x3a2f28 };
const TOP_FRAMES_A = new Set(['pepperoni', 'mushroom', 'olive', 'bell_pepper', 'red_onion', 'jalapeno']);
const DEPTH_OVEN = 22;
const DEPTH_ITEMS = 26;

/** A pizza picture built from the layer atlases. `top` is the flat view on a board; `oven` squashes it for the brick oven. Rebuilt when its signature changes. */
class PizzaPicture {
  readonly box: Phaser.GameObjects.Container;
  private sig = '';
  constructor(private scene: Phaser.Scene, private diameter: number, depth: number) {
    this.box = scene.add.container(0, 0).setDepth(depth).setVisible(false);
  }
  setPos(x: number, y: number): void {
    this.box.setPosition(x, y);
  }
  hide(): void {
    this.box.setVisible(false);
    this.sig = '';
  }
  show(item: PizzaItem, mode: 'top' | 'oven', phase: CookPhase | null): void {
    const sig = `${item.id}|${item.placed.join(',')}|${mode}|${phase}`;
    this.box.setVisible(true);
    if (sig === this.sig) return;
    this.sig = sig;
    this.box.removeAll(true);
    const s = this.scene;
    const D = this.diameter;
    const tint = phase ? (TINT[phase] ?? 0xffffff) : 0xffffff;
    const raw = atlasKey('raw_layers');
    const add = (atlas: string, frame: string, w: number, tinted: boolean): Phaser.GameObjects.Image | null => {
      if (!hasFrame(s, atlas, frame)) return null;
      const img = s.add.image(0, 0, atlas, frame);
      img.setScale(w / img.width);
      if (tinted) img.setTint(tint);
      this.box.add(img);
      return img;
    };
    const sauce = item.placed.find((p) => p.startsWith('sauce:'))?.slice(6);
    const cheese = item.placed.find((p) => p.startsWith('cheese:'))?.slice(7);
    const phaseName = phase === 'warning' || phase === 'danger' ? 'overcooking' : phase === 'burnt' ? 'burnt' : 'ready';
    if (mode === 'oven') {
      // Baked layers are drawn in the oven's slanted view already.
      add(atlasKey('baked_layers'), `dough_${phaseName}`, D, phase === 'cooking');
      if (cheese) add(atlasKey('baked_layers'), `${cheese === 'white' ? 'white_cheese' : 'cheese'}_${phaseName}`, D * 0.92, phase === 'cooking');
    } else {
      add(raw, 'dough_disc', D, true);
      if (sauce) add(raw, `sauce_${sauce}`, D * 0.9, true);
      if (cheese) add(raw, `cheese_${cheese}`, D * 0.9, true);
    }
    const tops = item.placed.filter((p) => p.startsWith('topping:')).map((p) => p.slice(8));
    tops.forEach((t, ti) => {
      const atlas = atlasKey(TOP_FRAMES_A.has(t) ? 'toppings_a' : 'toppings_b');
      const rng = makeRng(item.id * 7919 + ti * 131 + 5);
      const count = 7;
      for (let i = 0; i < count; i++) {
        const ang = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * D * (mode === 'oven' ? 0.3 : 0.32);
        const img = add(atlas, `${t}_${1 + Math.floor(rng() * 3)}`, D * 0.17, true);
        if (!img) continue;
        img.setPosition(Math.cos(ang) * rad, Math.sin(ang) * rad * (mode === 'oven' ? 0.55 : 1)).setRotation(rng() * Math.PI * 2);
      }
    });
    this.box.setScale(1, mode === 'oven' ? 1 : 1);
  }
}

type Spot = { x: number; y: number };
interface TrayPic {
  img: Phaser.GameObjects.Image;
  key: string;
}

export type RingFactory = (x: number, y: number, radius: number) => Ring;

export class PizzaViews {
  private px: number; // logical px per background px
  private ovenBig?: Phaser.GameObjects.Sprite;
  private ovenSmall?: Phaser.GameObjects.Sprite;
  private fryer: (Phaser.GameObjects.Sprite | undefined)[] = [];
  private fryerSince: { phase: CookPhase | null; at: number }[] = [];
  private ice?: Phaser.GameObjects.Sprite;
  private iceCups: Phaser.GameObjects.Image[] = [];
  private bigDoor: OvenDoorMachine;
  private smallDoor: OvenDoorMachine;
  private boards: PizzaPicture[] = [];
  private ovenPics: PizzaPicture[] = [];
  private rings = new Map<string, Ring>();
  private smallPics: (TrayPic | null)[] = [];
  private lastClock = 0;
  private ovenFullShakeKey = 'pz_oven_shake';
  private lastPhase = { ovens: [] as (CookPhase | null)[] };

  constructor(private scene: Phaser.Scene, private bg: BackgroundPlacement, private s: PizzaKitchenState, private fx: ParticlePool, private ringFor: RingFactory, private cfg: PizzaConfig = defaultPizzaConfig) {
    this.px = bg.width / cfg.art.width;
    const o = cfg.oven;
    this.bigDoor = new OvenDoorMachine(o.doorMinGap, o.openSeconds, o.closeSeconds);
    this.smallDoor = new OvenDoorMachine(o.doorMinGap, o.openSeconds, o.closeSeconds);
    this.buildStations();
    const boardD = Math.min(...cfg.zones.filter((z) => z.action === 'board').map((z) => Math.min(z.width * bg.width, z.height * bg.height))) * 0.98;
    for (let i = 0; i < s.boards.length; i++) {
      this.boards.push(new PizzaPicture(scene, boardD, DEPTH_ITEMS));
    }
    const m = SHEETS.oven_big;
    const k = this.k('ovenBig', m);
    const d = (m.slotEllipse?.[0] ?? 70) * 2 * k * 0.92;
    for (let i = 0; i < s.ovens.length; i++) this.ovenPics.push(new PizzaPicture(scene, d, DEPTH_OVEN + 1));
  }

  // ---------------------------------------------------------------- layout helpers

  private bgX(x: number): number {
    return this.bg.x + x * this.px;
  }
  private bgY(y: number): number {
    return this.bg.y + y * this.px;
  }
  /** Display scale of a station sprite: its configured width over the sheet frame width. */
  private k(name: keyof PizzaConfig['stations'], m: SheetMeta): number {
    const st = this.cfg.stations[name];
    const frameW = st.half ? m.frameWidth : m.frameWidth;
    // Fryer halves share one display width: scale from the pair's combined packed width.
    if (name === 'fryerFries' || name === 'fryerWings') return (st.width * this.px) / (SHEETS.fryer_fries.frameWidth + SHEETS.fryer_wings.frameWidth);
    return (st.width * this.px) / frameW;
  }
  /** Centre of a zone in logical px. */
  spot(z: PizzaZone): Spot {
    return { x: this.bg.x + (z.x + z.width / 2) * this.bg.width, y: this.bg.y + (z.y + z.height / 2) * this.bg.height };
  }
  zoneById(id: string): PizzaZone | undefined {
    return this.cfg.zones.find((z) => z.id === id);
  }
  boardSpot(i: number): Spot | null {
    const z = this.cfg.zones.find((q) => q.action === 'board' && q.index === i);
    return z ? this.spot(z) : null;
  }
  ovenSlotSpot(i: number): Spot | null {
    const m = SHEETS.oven_big;
    const st = this.cfg.stations.ovenBig;
    const slot = m.slots?.[i];
    if (!slot) return null;
    const k = this.k('ovenBig', m);
    return { x: this.bgX(st.x) + slot[0] * k, y: this.bgY(st.y) + slot[1] * k };
  }

  private buildStations(): void {
    const sc = this.scene;
    const mk = (name: keyof PizzaConfig['stations'], sheet: string, xOffset = 0): Phaser.GameObjects.Sprite | undefined => {
      const key = sheetKey(sheet);
      if (!sc.textures.exists(key)) return undefined;
      const m = SHEETS[sheet];
      const st = this.cfg.stations[name];
      const sp = sc.add.sprite(this.bgX(st.x) + xOffset, this.bgY(st.y), key, 0).setOrigin(0, 0).setDepth(DEPTH_OVEN);
      sp.setScale(this.k(name, m));
      return sp;
    };
    this.ovenBig = mk('ovenBig', 'oven_big');
    this.ovenSmall = mk('ovenSmall', 'oven_small')?.setDepth(DEPTH_OVEN + 2);
    const half = SHEETS.fryer_fries.frameWidth * this.k('fryerFries', SHEETS.fryer_fries);
    this.fryer = [mk('fryerFries', 'fryer_fries')?.setDepth(DEPTH_OVEN + 2), mk('fryerWings', 'fryer_wings', half)?.setDepth(DEPTH_OVEN + 2)];
    this.fryerSince = [{ phase: null, at: 0 }, { phase: null, at: 0 }];
    this.ice = mk('iceMachine', 'icecream_machine')?.setDepth(DEPTH_OVEN + 2);
    if (this.ovenBig) this.ovenBig.setFrame(SHEETS.oven_big.openHoldFrame ?? 0);
    if (this.ovenSmall) this.ovenSmall.setFrame(SHEETS.oven_small.openHoldFrame ?? 0);
    if (this.ice) this.ice.setFrame(SHEETS.icecream_machine.clips.idle_empty.from);
    // Three cup icons under the ice cream machine: empty, filling, full.
    if (this.ice) {
      const st = this.cfg.stations.iceMachine;
      const kk = this.k('iceMachine', SHEETS.icecream_machine);
      const y = this.bgY(st.y) + SHEETS.icecream_machine.frameHeight * kk - 4;
      for (let i = 0; i < this.s.ice.length; i++) {
        const x = this.bgX(st.x) + (SHEETS.icecream_machine.frameWidth * kk) * ((i + 0.5) / this.s.ice.length);
        const cup = sc.add.image(x, y, atlasKey('cups_icons'), 'icecream_cup_empty').setDepth(DEPTH_ITEMS).setVisible(false);
        cup.setScale(26 / cup.height);
        this.iceCups.push(cup);
      }
    }
  }

  private ring(key: string, x: number, y: number, r: number): Ring {
    let g = this.rings.get(key);
    if (!g) {
      g = this.ringFor(x, y, r);
      this.rings.set(key, g);
    }
    return g;
  }

  private progress(t: number, readyAfter: number, burnWindow: number, phase: CookPhase): number {
    return phase === 'cooking' ? Math.min(1, t / readyAfter) : this.s.burnFraction(t, readyAfter, burnWindow);
  }

  // ---------------------------------------------------------------- per frame

  sync(): void {
    const now = this.scene.time.now;
    const dt = this.lastClock === 0 ? 0 : (now - this.lastClock) / 1000;
    this.lastClock = now;
    this.syncBoards(now);
    this.syncBigOven(dt, now);
    this.syncSmallOven(dt, now);
    this.syncFryer(now);
    this.syncIce(now);
  }

  private syncBoards(now: number): void {
    this.s.boards.forEach((b, i) => {
      const pic = this.boards[i];
      const at = this.boardSpot(i);
      const item = b.item;
      const ring = this.ring(`board${i}`, at?.x ?? 0, at?.y ?? 0, 18);
      if (!item || !at || item.status === 'baking') {
        pic.hide();
        ring.show(null, 0, now);
        return;
      }
      pic.setPos(at.x, at.y);
      pic.show(item, 'top', item.status === 'baked' ? item.bakedPhase : null);
      // A finished, unbaked pizza shows a small ring-free hint by being brighter; only a baked pizza that is getting too dark warns.
      if (item.status === 'baked' && (item.bakedPhase === 'warning' || item.bakedPhase === 'danger')) ring.setPosition(at.x, at.y - 40).show(item.bakedPhase, 1, now);
      else ring.show(null, 0, now);
    });
  }

  private syncBigOven(dt: number, now: number): void {
    const m = SHEETS.oven_big;
    const st = this.cfg.stations.ovenBig;
    const state = this.bigDoor.update(dt, ovenDoorTarget(this.s.ovens));
    let frame = m.openHoldFrame ?? 0;
    if (state === 'closed') frame = m.closedFrame ?? 9;
    else if (state === 'closing') frame = clipIndex(m.clips.close, this.bigDoor.progress);
    else if (state === 'opening') frame = clipIndex(m.clips.open, this.bigDoor.progress);
    this.ovenBig?.setFrame(frame);
    const showPizzas = state === 'open';
    const k = this.k('ovenBig', m);
    this.s.ovens.forEach((o, i) => {
      const pic = this.ovenPics[i];
      const slot = m.slots?.[i];
      const ring = this.ring(`oven${i}`, 0, 0, 20);
      if (!o || !slot) {
        pic.hide();
        ring.show(null, 0, now);
        this.lastPhase.ovens[i] = null;
        return;
      }
      const x = this.bgX(st.x) + slot[0] * k;
      const y = this.bgY(st.y) + slot[1] * k;
      const item = this.s.boards[o.board]?.item;
      if (showPizzas && item) {
        pic.setPos(x, y);
        pic.show(item, 'oven', o.phase);
      } else pic.hide();
      // The ring sits above the oven mouth so it can be read with the door closed.
      ring.setPosition(x, y - 58 * (k / 0.6) * 0.4 - 26);
      ring.show(o.phase, this.progress(o.t, this.cfg.timed.pizza.readyAfter, this.cfg.timed.pizza.burnWindow, o.phase), now);
      if (this.lastPhase.ovens[i] !== o.phase && o.phase === 'ready' && !SaveSystem.reduceMotion()) this.fx.burst(x, y, 0xfff1b8, 6, 30, 400);
      this.lastPhase.ovens[i] = o.phase;
    });
  }

  private syncSmallOven(dt: number, now: number): void {
    const m = SHEETS.oven_small;
    const st = this.cfg.stations.ovenSmall;
    const state = this.smallDoor.update(dt, ovenDoorTarget(this.s.smallOven));
    let frame = m.openHoldFrame ?? 0;
    if (state === 'closed') frame = m.closedFrame ?? 10;
    else if (state === 'closing') frame = clipIndex(m.clips.close, this.smallDoor.progress);
    else if (state === 'opening') frame = clipIndex(m.clips.open, this.smallDoor.progress);
    this.ovenSmall?.setFrame(frame);
    const k = this.k('ovenSmall', m);
    this.s.smallOven.forEach((t, i) => {
      const x = this.bgX(st.x) + m.frameWidth * k * (0.3 + 0.4 * i);
      const y = this.bgY(st.y) + m.frameHeight * k * 0.55;
      const ring = this.ring(`small${i}`, x, y - 36, 17);
      let pic = this.smallPics[i] ?? null;
      if (!t) {
        pic?.img.setVisible(false);
        ring.show(null, 0, now);
        return;
      }
      const name = t.phase === 'cooking' ? 'raw' : t.phase === 'ready' ? 'ready' : t.phase === 'burnt' ? 'burnt' : 'overcooking';
      const key = `${t.dish}_${name}`;
      if (!pic) pic = this.smallPics[i] = { img: this.scene.add.image(x, y, atlasKey('sides_items'), key).setDepth(DEPTH_ITEMS), key };
      if (pic.key !== key && hasFrame(this.scene, atlasKey('sides_items'), key)) {
        pic.img.setFrame(key);
        pic.key = key;
      }
      pic.img.setPosition(x, y).setScale(54 / pic.img.height).setVisible(state === 'open');
      ring.setPosition(x, y - 36);
      ring.show(t.phase, this.progress(t.t, this.cfg.timed.side.readyAfter, this.cfg.timed.side.burnWindow, t.phase), now);
    });
  }

  private syncFryer(now: number): void {
    const T = this.cfg.timed;
    this.s.fryer.forEach((b, i) => {
      const sp = this.fryer[i];
      if (!sp) return;
      const meta = SHEETS[i === 0 ? 'fryer_fries' : 'fryer_wings'];
      const phase = b ? b.phase : null;
      const rec = this.fryerSince[i];
      if (rec.phase !== phase) {
        rec.phase = phase;
        rec.at = now;
      }
      const t = (now - rec.at) / 1000;
      let frame: number;
      if (!b) frame = meta.clips.idle_empty.from;
      else if (b.phase === 'cooking') frame = t < (meta.clips.intro.to - meta.clips.intro.from + 1) / meta.clips.intro.fps ? clipFrame(meta, 'intro', t) : clipFrame(meta, 'cook_loop', t);
      else if (b.phase === 'ready') frame = clipFrame(meta, 'ready_loop', t);
      else if (b.phase === 'burnt') frame = clipFrame(meta, 'burnt_loop', t);
      else frame = clipFrame(meta, 'overcook_loop', t);
      sp.setFrame(frame);
      const k = sp.scaleX;
      const x = sp.x + meta.frameWidth * k * 0.5;
      const y = sp.y + meta.frameHeight * k * 0.18;
      const ring = this.ring(`fry${i}`, x, y, 17);
      if (!b) return ring.show(null, 0, now);
      const def = i === 1 ? T.wings : T.fries;
      ring.setPosition(x, y);
      ring.show(b.phase, this.progress(b.t, def.readyAfter, def.burnWindow, b.phase), now);
    });
  }

  private syncIce(now: number): void {
    if (!this.ice) return;
    const m = SHEETS.icecream_machine;
    const filling = this.s.ice.find((l) => l && l.phase === 'cooking');
    const full = this.s.ice.some((l) => l && l.phase === 'ready');
    if (filling) {
      const n = m.clips.dispense.to - m.clips.dispense.from + 1;
      this.ice.setFrame(m.clips.dispense.from + Math.min(n - 1, Math.floor((filling.t / this.cfg.ice.fillSeconds) * n)));
    } else this.ice.setFrame(full ? m.clips.done_full.from : m.clips.idle_empty.from);
    this.s.ice.forEach((l, i) => {
      const cup = this.iceCups[i];
      if (!cup) return;
      cup.setVisible(!!l);
      if (l) cup.setFrame(l.phase === 'ready' ? 'icecream_cup_full' : 'icecream_cup_empty');
      const ring = this.ring(`ice${i}`, cup.x, cup.y - 22, 13);
      if (l) ring.setPosition(cup.x, cup.y - 24).show(l.phase, this.progress(l.t, this.cfg.ice.fillSeconds, 1, l.phase), now);
      else ring.show(null, 0, now);
    });
  }

  // ---------------------------------------------------------------- feedback

  /** A small pop where the player tapped, so every tap answers (the model adds its own message when the tap is not allowed). */
  tapFeedback(z: PizzaZone): void {
    if (SaveSystem.reduceMotion()) return;
    const at = this.spot(z);
    this.fx.burst(at.x, at.y, 0xfff1b8, 4, 20, 260);
  }

  ovenFullShake(): void {
    if (this.ovenBig) shake(this.scene, this.ovenBig, this.ovenFullShakeKey, 6, 260);
    for (const p of this.ovenPics) if (p.box.visible) shake(this.scene, p.box, `${this.ovenFullShakeKey}_p`, 5, 260);
  }

  wobble(where: 'oven' | 'small' | 'fryer' | 'ice', index: number): void {
    const target = where === 'oven' ? this.ovenPics[index]?.box : where === 'small' ? this.smallPics[index]?.img : where === 'fryer' ? this.fryer[index] : this.iceCups[index];
    if (target) shake(this.scene, target, `pz_wobble_${where}_${index}`, 4, 220);
  }

  /** A pizza being dragged to a customer dims on its board (the carried picture follows the finger). */
  setCarried(i: number, carried: boolean): void {
    this.boards[i]?.box.setAlpha(carried ? 0.3 : 1);
  }

  boardPop(i: number): void {
    const b = this.boards[i]?.box;
    if (b) pop(this.scene, b, `pz_board_${i}`, 1.08, 160);
  }

  destroy(): void {
    for (const p of [...this.boards, ...this.ovenPics]) p.box.destroy();
    for (const r of this.rings.values()) r.destroy();
    this.ovenBig?.destroy();
    this.ovenSmall?.destroy();
    this.ice?.destroy();
    this.fryer.forEach((f) => f?.destroy());
    this.iceCups.forEach((c) => c.destroy());
    this.smallPics.forEach((p) => p?.img.destroy());
  }
}

function clipIndex(c: { from: number; to: number }, progress: number): number {
  const n = c.to - c.from + 1;
  return c.from + Math.min(n - 1, Math.floor(progress * n));
}
