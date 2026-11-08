import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { CookPhase } from '../game/cook';
import type { TacoItem, TacoKitchenState } from '../game/taco/TacoKitchenState';
import type { TacoConfig, TacoZone } from '../game/taco/tacoConfig';

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
const panMetas = new Map<string, SheetMeta>(Object.values(metas).filter((m) => m.panBox).map((m) => [m.key, m]));

/** Oven shell frame (1 folded, 2 warm, 3 golden ready, 4 burnt). */
export function shellFrame(phase: CookPhase, t: number, readyAfter: number): number {
  if (phase === 'burnt') return 4;
  if (phase === 'cooking') return t < readyAfter * 0.5 ? 1 : 2;
  return 3;
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
    s.plates.forEach((pl, i) => this.put(this.plates, i, 'plate', pl.item ? this.itemFace(pl.item, null, 'ready') : null));
  }

  destroy(): void {
    for (const list of [this.pans, this.panBase, this.ovens, this.plates]) list.forEach((x) => x?.img.destroy());
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
      slot?.img.destroy();
      const img = this.scene.add.image(0, 0, sheetKey(name), frame)
        .setOrigin(0, 0)
        .setDepth(DEPTH - 1)
        .setFlipX(flip);
      slot = { img, key };
      list[i] = slot;
    }
    const scale = (z.width * this.bg.width * PAN_WIDTH_PER_ZONE) / box.w;
    slot.img.setScale(scale);
    // Mirrored pans line their right edge up with the zone's right edge, so the handle sticks out to the left.
    const left = flip ? this.bg.x + (z.x + z.width) * this.bg.width - (meta.frameWidth - box.x) * scale : this.bg.x + z.x * this.bg.width - box.x * scale;
    slot.img.setPosition(left, this.bg.y + z.y * this.bg.height - box.y * scale);
    slot.img.setTint(phase === 'danger' ? 0xffb080 : 0xffffff);
  }

  private put(list: (Slot | null)[], i: number, kind: 'pan' | 'oven' | 'plate', face: Face | null): void {
    const cur = list[i];
    if (!face) {
      if (cur) {
        cur.img.destroy();
        list[i] = null;
      }
      return;
    }
    const key = face.sprite ? `s:${face.sprite}` : `h:${face.sheet}:${face.frame}`;
    const z = this.zones(kind).find((q) => q.index === i);
    if (!z) return;
    let slot = cur;
    if (!slot || slot.key !== key) {
      slot?.img.destroy();
      const img = face.sprite ? this.scene.add.image(0, 0, spriteKey(face.sprite)) : this.scene.add.image(0, 0, sheetKey(face.sheet!), face.frame);
      img.setDepth(DEPTH).setOrigin(0.5, 0.95);
      slot = { img, key };
      list[i] = slot;
      // Size to the zone. The food in a sheet frame fills about 75% of the frame width (the rest is steam room),
      // so pan and oven food is scaled until that part is about 68% of the zone width (the pan bowl is a little narrower than its zone); a plate item is 80% of the plate zone.
      const zw = z.width * this.bg.width;
      const scale = kind === 'plate' ? (zw * 0.8) / img.width : (zw * (kind === 'pan' && z.height > 0.075 ? 0.62 : 0.66)) / (img.width * 0.75);
      img.setScale(scale);
    }
    // Pan and oven food sits low-centre in the bowl; plate items sit near the bottom of their zone.
    const front = z.height > 0.075; // the two front pans are drawn bigger and lower than the back pair
    const baseline = kind === 'plate' ? 0.9 : kind === 'pan' && front ? 0.88 : 0.8;
    slot.img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height * baseline) * this.bg.height);
    slot.img.setTint(face.phase === 'danger' ? 0xffb080 : 0xffffff);
  }
}

interface Face {
  sheet?: string;
  sprite?: string;
  frame?: number;
  phase: CookPhase;
}
