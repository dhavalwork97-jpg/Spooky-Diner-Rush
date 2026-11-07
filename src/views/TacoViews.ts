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
  private ovens: (Slot | null)[];
  private plates: (Slot | null)[];

  constructor(private scene: Phaser.Scene, private bg: BackgroundPlacement, private s: TacoKitchenState) {
    this.pans = s.pans.map(() => null);
    this.ovens = s.ovens.map(() => null);
    this.plates = s.plates.map(() => null);
  }

  sync(): void {
    const s = this.s;
    s.pans.forEach((p, i) => {
      if (!p) return this.put(this.pans, i, 'pan', null);
      if (p.what.kind === 'protein') {
        const def = s.taco.proteins[p.what.protein];
        this.put(this.pans, i, 'pan', { sheet: `cook_${p.what.protein}`, frame: cookFrame(p.phase, p.t, def.readyAfter), phase: p.phase });
      } else {
        const it = p.what.item;
        const ready = p.phase !== 'cooking';
        this.put(this.pans, i, 'pan', this.itemFace(it, ready ? 5 : 4, ready ? p.phase : 'cooking'));
      }
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
    for (const list of [this.pans, this.ovens, this.plates]) list.forEach((x) => x?.img.destroy());
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
      // Size to the zone. The food in a sheet frame fills about 70% of the frame width (the rest is steam room),
      // so pan and oven food is scaled until that part is about 80% of the pan; a plate item is 80% of the plate zone.
      const zw = z.width * this.bg.width;
      const scale = kind === 'plate' ? (zw * 0.8) / img.width : (zw * 0.8) / (img.width * 0.7);
      img.setScale(scale);
    }
    slot.img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height * 0.9) * this.bg.height);
    slot.img.setTint(face.phase === 'danger' ? 0xffb080 : 0xffffff);
  }
}

interface Face {
  sheet?: string;
  sprite?: string;
  frame?: number;
  phase: CookPhase;
}
