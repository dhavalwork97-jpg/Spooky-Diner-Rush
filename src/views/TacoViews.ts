import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { CookPhase } from '../game/cook';
import type { TacoItem, TacoKitchenState } from '../game/taco/TacoKitchenState';
import type { TacoConfig, TacoZone } from '../game/taco/tacoConfig';
import { SaveSystem } from '../systems/SaveSystem';
import { arcTo } from '../anim/fly';

/** Sheet metadata (frame size, columns) read from the .anim.json files shipped with the art. */
interface SheetMeta {
  key: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  originX?: number;
  originY?: number;
  /** Pan-with-food sheets: where the pan (bowl and handle) sits inside every frame, in frame px. */
  panBox?: { x: number; y: number; w: number; h: number };
}
const metas = import.meta.glob('../../public/assets/taco/animations/*.anim.json', { eager: true, import: 'default' }) as Record<string, SheetMeta>;
const ANIM_DIR = 'assets/taco/animations';
const SPRITE_DIR = 'assets/taco/sprites';
const DEPTH = 25;

/** Texture key of a sheet or sprite, so views and the loader agree. */
export const sheetKey = (name: string): string => `tacosheet_${name}`;
export const spriteKey = (name: string): string => `tacosprite_${name}`;

/** Queue every taco sheet and dish sprite on a scene's loader (call from preload). */
export function loadTacoArt(scene: Phaser.Scene, cfg: TacoConfig): void {
  for (const m of Object.values(metas)) {
    scene.load.spritesheet(sheetKey(m.key), `${ANIM_DIR}/${m.image}`, { frameWidth: m.frameWidth, frameHeight: m.frameHeight });
  }
  const sprites = new Set(cfg.dishes.map((d) => d.sprite));
  // Raw and cooked proteins are the food that flies between the griddle, the pans and the plates.
  for (const p of Object.keys(cfg.proteins)) {
    sprites.add(`raw_${p}`);
    sprites.add(`cooked_${p}`);
  }
  for (const s of sprites) scene.load.image(spriteKey(s), `${SPRITE_DIR}/${s}.webp`);
}

/** Cook sheet frame for a protein in a pan (0 raw, 1 sizzling, 2 browning, 4 ready, 5 burnt). */
export function cookFrame(phase: CookPhase, t: number, readyAfter: number): number {
  if (phase === 'burnt') return 5;
  if (phase === 'cooking') return t < readyAfter * 0.3 ? 0 : t < readyAfter * 0.65 ? 1 : 2;
  return 4;
}
/** Frame of a pan-with-food sheet (0 empty, 1 raw, 2 sizzling, 3 browning, 5 ready, 6 burnt). */
export function panFrame(phase: CookPhase, t: number, readyAfter: number): number {
  if (phase === 'burnt') return 6;
  if (phase === 'cooking') return t < readyAfter * 0.12 ? 1 : t < readyAfter * 0.5 ? 2 : 3;
  return 5;
}
/** The four pans (pan index 0 front-left, 1 front-right, 2 back-left, 3 back-right): red on the left, blue on the right. */
const PAN_COLOURS = ['red', 'blue', 'red', 'blue'];
/** The left-hand pans are mirrored so their handles point outward and never cross a neighbouring pan. */
const PAN_FLIPPED = [true, false, true, false];
/** Sheet whose empty frame (and chicken cooking frames) draw the pan itself. */
const PAN_PROTEIN = 'chicken';
/** A pan with its handle is about this much wider than the pan's tap zone (which covers the bowl). */
const PAN_WIDTH_PER_ZONE = 1.23;
/** The two back pans are drawn a little smaller and higher, and behind the front pair, so pans and handles never cover each other. */
const BACK_PAN_SCALE = 0.9;
const BACK_PAN_LIFT = 0.025; // of the kitchen height
/** Sheet whose empty pan frame is used for every idle pan (a clean, dry pan). */
const EMPTY_PAN_SHEET = 'fish';
const panMetas = new Map<string, SheetMeta>(Object.values(metas).filter((m) => m.panBox).map((m) => [m.key, m]));

/** Oven shell frame (1 folded, 2 warm, 3 golden ready, 4 burnt). */
export function shellFrame(phase: CookPhase, t: number, readyAfter: number): number {
  if (phase === 'burnt') return 4;
  if (phase === 'cooking') return t < readyAfter * 0.5 ? 1 : 2;
  return 3;
}

/** Frame of a cup in `drink_cups_sheet`: row per drink, column 0 empty .. 4 full. A filling cup shows levels 1-3, a ready cup is full. */
export function cupFrame(sheetRow: number, phase: CookPhase, t: number, fillSeconds: number): number {
  const level = phase === 'cooking' ? Math.min(3, 1 + Math.floor((t / fillSeconds) * 3)) : 4;
  return sheetRow * 5 + level;
}

interface Slot {
  img: Phaser.GameObjects.Image;
  key: string;
}

/**
 * Draws the pans, oven slots and plates from the kitchen model. The model is never changed here; each frame `sync()` compares
 * what a slot should show with what it shows now and only touches the sprite when that differs.
 */
export class TacoViews {
  private pans: (Slot | null)[];
  /** The pan itself (always drawn: empty when idle, with the food in it for chicken). */
  private panBase: (Slot | null)[];
  private ovens: (Slot | null)[];
  private plates: (Slot | null)[];
  /** Cups in the dispensers, keyed `<drink>:<lane>`. */
  private cups = new Map<string, Slot>();

  constructor(private scene: Phaser.Scene, private bg: BackgroundPlacement, private s: TacoKitchenState) {
    this.pans = s.pans.map(() => null);
    this.panBase = s.pans.map(() => null);
    this.ovens = s.ovens.map(() => null);
    this.plates = s.plates.map(() => null);
  }

  sync(): void {
    const s = this.s;
    s.pans.forEach((p, i) => {
      const zone = this.zones('pan').find((q) => q.index === i);
      let baseFrame = 0;
      let phase: CookPhase = 'cooking';
      let food: Face | null = null;
      let panProtein = PAN_PROTEIN; // whole-pan art for this protein, when a sheet exists in this pan's colour
      if (p) {
        phase = p.phase;
        if (p.what.kind === 'protein') {
          const def = s.taco.proteins[p.what.protein];
          if (panMetas.has(`pan_${PAN_COLOURS[i] ?? 'red'}_${p.what.protein}`)) {
            panProtein = p.what.protein;
            baseFrame = panFrame(p.phase, p.t, def.readyAfter);
          } else food = { sheet: `cook_${p.what.protein}`, frame: cookFrame(p.phase, p.t, def.readyAfter), phase: p.phase };
        } else {
          const ready = p.phase !== 'cooking';
          food = this.itemFace(p.what.item, ready ? 5 : 4, ready ? p.phase : 'cooking');
        }
      }
      if (baseFrame === 0) panProtein = EMPTY_PAN_SHEET;
      if (zone) this.putPan(this.panBase, i, zone, `pan_${PAN_COLOURS[i] ?? 'red'}_${panProtein}`, baseFrame, `${i}:${panProtein}:${baseFrame}`, phase, PAN_FLIPPED[i] ?? false);
      this.put(this.pans, i, 'pan', food);
    });
    s.ovens.forEach((o, i) => {
      if (!o) return this.put(this.ovens, i, 'oven', null);
      if (o.what.kind === 'shell') {
        this.put(this.ovens, i, 'oven', { sheet: 'oven_taco_shell', frame: shellFrame(o.phase, o.t, s.taco.timed.crispy_shell.readyAfter), phase: o.phase });
      } else {
        this.put(this.ovens, i, 'oven', this.itemFace(o.what.item, 3, o.phase));
      }
    });
    this.syncCups();
    s.plates.forEach((pl, i) => this.put(this.plates, i, 'plate', pl.item ? this.itemFace(pl.item, null, 'ready') : null));
  }

  destroy(): void {
    for (const list of [this.pans, this.panBase, this.ovens, this.plates]) list.forEach((x) => x && this.scene.tweens.killTweensOf(x.img));
    for (const list of [this.pans, this.panBase, this.ovens, this.plates]) list.forEach((x) => x?.img.destroy());
    this.cups.forEach((c) => c.img.destroy());
    this.cups.clear();
    this.dying.forEach((d) => d.destroy());
    this.dying.clear();
  }

  /** Images fading out. Kept so a scene change can destroy them at once and nothing keeps animating. */
  private dying = new Set<Phaser.GameObjects.Image>();

  /** New food or a new step pops in (a small grow with a soft overshoot) instead of appearing. */
  private appear(img: Phaser.GameObjects.Image, finalScale: number): void {
    if (SaveSystem.reduceMotion()) return;
    img.setScale(finalScale * 0.72).setAlpha(0);
    this.scene.tweens.add({ targets: img, scale: finalScale, alpha: 1, duration: 170, ease: 'Back.Out' });
  }

  /** Remove an image with a short fade (no fade in reduced motion). */
  private release(img: Phaser.GameObjects.Image, ms = 120): void {
    this.scene.tweens.killTweensOf(img);
    if (SaveSystem.reduceMotion()) {
      img.destroy();
      return;
    }
    this.dying.add(img);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: ms,
      onComplete: () => {
        this.dying.delete(img);
        img.destroy();
      },
    });
  }

  /** Centre and size of a tap zone in logical pixels, for pointers, rings and flights. */
  spot(zone: TacoZone): { x: number; y: number; w: number; h: number } {
    const w = zone.width * this.bg.width;
    const h = zone.height * this.bg.height;
    return { x: this.bg.x + zone.x * this.bg.width + w / 2, y: this.bg.y + zone.y * this.bg.height + h / 2, w, h };
  }

  /** Where the plate's food sits, so flights land on it. */
  plateSpot(plate: number): { x: number; y: number } | null {
    const z = this.zones('plate').find((q) => q.index === plate);
    return z ? this.spot(z) : null;
  }

  /** Dim a plate's dish while the player carries it to a customer. */
  setCarried(plate: number, carried: boolean): void {
    const img = this.plates[plate]?.img;
    if (img) img.setAlpha(carried ? 0.35 : 1);
  }

  /** Tap feedback: the tapped food or appliance pops, and a soft ring spreads from the tap and fades. */
  tapFeedback(zone: TacoZone): void {
    if (SaveSystem.reduceMotion()) return;
    const sp = this.spot(zone);
    const list = zone.action === 'plate' ? this.plates : zone.action === 'pan' ? this.pans : zone.action === 'oven' ? this.ovens : null;
    const slot = list?.[zone.index ?? 0];
    if (slot) this.scene.tweens.add({ targets: slot.img, scaleX: slot.img.scaleX * 1.08, scaleY: slot.img.scaleY * 1.08, duration: 70, yoyo: true, ease: 'Sine.Out' });
    const r = Math.max(18, Math.min(sp.w, sp.h) * 0.42);
    const ring = this.scene.add.circle(sp.x, sp.y, r, 0xfff4dc, 0.12).setStrokeStyle(4, 0xfff4dc, 0.85).setDepth(45);
    this.scene.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  /** A piece of food flies from one spot to another and is gone: raw food to its pan, cooked food to the plate. */
  fly(texture: string, frame: number | undefined, from: { x: number; y: number }, to: { x: number; y: number }, size: number, ms = 300, height = 46, done?: () => void): void {
    if (SaveSystem.reduceMotion() || !this.scene.textures.exists(texture)) {
      done?.();
      return;
    }
    const img = this.scene.add.image(from.x, from.y, texture, frame).setDepth(48);
    img.setScale(size / Math.max(img.width, img.height));
    this.dying.add(img);
    arcTo(this.scene, img, to, ms, height, () => {
      this.dying.delete(img);
      img.destroy();
      done?.();
    });
  }

  /** The zone for an action (and optional arg or index), for flights that start or end at a station. */
  find(action: TacoZone['action'], match: { arg?: string; index?: number }): TacoZone | undefined {
    return this.s.taco.zones.find((z) => z.action === action && (match.arg === undefined || z.arg === match.arg) && (match.index === undefined || z.index === match.index));
  }

  /** Cups: a filling or full cup sits in its dispenser lane; an empty lane shows nothing. Tint/flicker is not needed: a cup never spoils. */
  private syncCups(): void {
    const s = this.s;
    for (const drink of s.taco.drinks) {
      s.pours[drink.id]?.forEach((p, lane) => {
        const key = `${drink.id}:${lane}`;
        const cur = this.cups.get(key);
        if (!p) {
          if (cur) {
            cur.img.destroy();
            this.cups.delete(key);
          }
          return;
        }
        const z = s.taco.zones.find((q) => q.action === 'cup' && q.arg === drink.id && q.index === lane);
        if (!z) return;
        const frame = cupFrame(drink.sheetRow, p.phase, p.t, drink.fillSeconds);
        let slot = cur;
        if (!slot) {
          // The cup's bottom-centre sits on the bottom-centre of its zone; its height is the zone's height.
          const img = this.scene.add.image(0, 0, sheetKey('drink_cups'), frame).setOrigin(0.5, 0.9854).setDepth(DEPTH);
          img.setScale((z.height * this.bg.height * 1.04) / img.height);
          img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height) * this.bg.height);
          slot = { img, key: String(frame) };
          this.cups.set(key, slot);
        } else if (slot.key !== String(frame)) {
          slot.img.setFrame(frame);
          slot.key = String(frame);
        }
      });
    }
  }

  /** What an item looks like: the finished dish sprite, or its build sheet frame (`forceFrame` overrides the frame). */
  private itemFace(it: TacoItem, forceFrame: number | null, phase: CookPhase): Face | null {
    const s = this.s;
    if (it.dish && forceFrame === null) {
      const d = s.dishDef(it.dish);
      return d ? { sprite: d.sprite, phase } : null;
    }
    const v = s.view(it);
    if (v.sheet) return { sheet: v.sheet, frame: forceFrame ?? v.frame ?? 0, phase };
    // Crispy tacos have no build sheet: show the shell until the dish is done.
    return { sheet: 'oven_taco_shell', frame: 3, phase };
  }

  private zones(kind: 'pan' | 'oven' | 'plate'): TacoZone[] {
    return this.s.taco.zones.filter((z) => z.action === kind);
  }

  /** Draw a whole pan (with the food in it) exactly over the kitchen's pan: top-left of the pan on the top-left of the tap zone. */
  private putPan(list: (Slot | null)[], i: number, z: TacoZone, name: string, frame: number, key: string, phase: CookPhase, flip: boolean): void {
    const meta = panMetas.get(name)!;
    const box = meta.panBox!;
    let slot = list[i];
    if (!slot || slot.key !== key) {
      // The old pan picture fades out while the new one fades in, so food browning in a pan changes smoothly and never flickers.
      if (slot) this.release(slot.img, 140);
      const img = this.scene.add.image(0, 0, sheetKey(name), frame)
        .setOrigin(0, 0)
        .setDepth(z.height > 0.075 ? DEPTH - 1 : DEPTH - 2)
        .setFlipX(flip);
      if (slot && !SaveSystem.reduceMotion()) {
        img.setAlpha(0);
        this.scene.tweens.add({ targets: img, alpha: 1, duration: 140 });
      }
      slot = { img, key };
      list[i] = slot;
    }
    const back = z.height <= 0.075;
    const scale = ((z.width * this.bg.width * PAN_WIDTH_PER_ZONE) / box.w) * (back ? BACK_PAN_SCALE : 1);
    const lift = back ? BACK_PAN_LIFT * this.bg.height : 0;
    slot.img.setScale(scale);
    // Mirrored pans line their right edge up with the zone's right edge, so the handle sticks out to the left.
    const left = flip ? this.bg.x + (z.x + z.width) * this.bg.width - (meta.frameWidth - box.x) * scale : this.bg.x + z.x * this.bg.width - box.x * scale;
    slot.img.setPosition(left, this.bg.y + z.y * this.bg.height - box.y * scale - lift);
    slot.img.setTint(phase === 'danger' ? 0xffb080 : 0xffffff);
  }

  private put(list: (Slot | null)[], i: number, kind: 'pan' | 'oven' | 'plate', face: Face | null): void {
    const cur = list[i];
    if (!face) {
      if (cur) {
        this.release(cur.img);
        list[i] = null;
      }
      return;
    }
    const key = face.sprite ? `s:${face.sprite}` : `h:${face.sheet}:${face.frame}`;
    const z = this.zones(kind).find((q) => q.index === i);
    if (!z) return;
    let slot = cur;
    if (!slot || slot.key !== key) {
      if (slot) this.release(slot.img);
      const img = face.sprite ? this.scene.add.image(0, 0, spriteKey(face.sprite)) : this.scene.add.image(0, 0, sheetKey(face.sheet!), face.frame);
      img.setDepth(DEPTH).setOrigin(0.5, 0.95);
      slot = { img, key };
      list[i] = slot;
      // Size to the zone. The food in a sheet frame fills about 75% of the frame width (the rest is steam room),
      // so pan and oven food is scaled until that part is about 68% of the zone width (the pan bowl is a little narrower than its zone); a plate item is 80% of the plate zone.
      const zw = z.width * this.bg.width;
      const scale = kind === 'plate' ? (zw * 0.8) / img.width : (zw * (kind === 'pan' && z.height > 0.075 ? 0.62 : 0.66)) / (img.width * 0.75);
      img.setScale(scale);
      this.appear(img, scale);
    }
    // Pan and oven food sits low-centre in the bowl; plate items sit near the bottom of their zone.
    const front = z.height > 0.075; // the two front pans are drawn bigger and lower than the back pair
    const baseline = kind === 'plate' ? 0.9 : kind === 'pan' && front ? 0.88 : 0.8;
    const lift = kind === 'pan' && !front ? BACK_PAN_LIFT : 0;
    slot.img.setDepth(kind === 'pan' && !front ? DEPTH - 1.5 : DEPTH);
    slot.img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height * baseline - lift) * this.bg.height);
    slot.img.setTint(face.phase === 'danger' ? 0xffb080 : 0xffffff);
  }
}

interface Face {
  sheet?: string;
  sprite?: string;
  frame?: number;
  phase: CookPhase;
}
