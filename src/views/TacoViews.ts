import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { CookPhase } from '../game/cook';
import type { TacoItem, TacoKitchenState } from '../game/taco/TacoKitchenState';
import type { TacoConfig, TacoZone } from '../game/taco/tacoConfig';
import { SaveSystem } from '../systems/SaveSystem';
import { arcTo } from '../anim/fly';
import type { ParticlePool } from '../anim/ParticlePool';
import type { Ring } from './Ring';
import { TacoDispensers, dispenserBaseKey, type DispenserMeta } from './TacoDispensers';
import { ovenDoorTarget, TacoOvenDoor, type OvenDoorClips } from './TacoOvenDoor';

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
  /** Pan-with-food sheets: the stir loops. `clips[look][step]` is the sheet frame shown at loop step `step` (0..loop-1) while the food is in that look. */
  stir?: { looks: string[]; loop: number; fps: number; empty: number; clips: Record<string, number[]> };
  /** Oven door sheet: named clips of frames and their speeds (see TacoOvenDoor). */
  clips?: OvenDoorClips;
  clipFps?: { close?: number; open?: number };
  /** Pouring dispenser sheets (see TacoDispensers). */
  base?: string;
  fullFrame?: { width: number; height: number };
  bandTop?: number;
  lanes?: [number, number][];
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
    if (m.base) scene.load.image(dispenserBaseKey(m.key), `${ANIM_DIR}/${m.base}`); // pouring dispensers: the empty machine, drawn once
  }
  const sprites = new Set(cfg.dishes.map((d) => d.sprite));
  // Raw and cooked proteins are the food that flies between the griddle, the pans and the plates.
  for (const p of Object.keys(cfg.proteins)) {
    sprites.add(`raw_${p}`);
    sprites.add(`cooked_${p}`);
  }
  sprites.add('plate'); // the empty orange plate drawn under each pass-counter slot
  if (PRESS_PLATE_SPRITE) sprites.add(PRESS_PLATE_SPRITE);
  for (const s of sprites) scene.load.image(spriteKey(s), `${SPRITE_DIR}/${s}.webp`);
}

/** Cook sheet frame for a protein in a pan (0 raw, 1 sizzling, 2 browning, 4 ready, 5 burnt). */
export function cookFrame(phase: CookPhase, t: number, readyAfter: number): number {
  if (phase === 'burnt') return 5;
  if (phase === 'cooking') return t < readyAfter * 0.3 ? 0 : t < readyAfter * 0.65 ? 1 : 2;
  return 4;
}
/** The four pans (pan index 0 front-left, 1 front-right, 2 back-left, 3 back-right): red on the left, blue on the right. */
const PAN_COLOURS = ['red', 'blue', 'red', 'blue'];
/** The left-hand pans are mirrored so their handles point outward and never cross a neighbouring pan. */
const PAN_FLIPPED = [true, false, true, false];
/** Sheet that draws the pan itself when a pan has no sheet of its own (fallback only). */
const PAN_PROTEIN = 'chicken';
/** A pan with its handle is about this much wider than the pan's tap zone (which covers the bowl). */
const PAN_WIDTH_PER_ZONE = 1.23;
/** The two back pans are drawn a little smaller and higher, and behind the front pair, so pans and handles never cover each other. */
const BACK_PAN_SCALE = 0.9;
const BACK_PAN_LIFT = 0.025; // of the kitchen height
/** Cook timer rings (fractions of the kitchen height; radii in logical px). */
const RING_ABOVE = 0.035;
const RING_BELOW = 0.037;
const PAN_RING_R = 17;
const OVEN_RING_Y = 0.648;
const OVEN_RING_R = 18;
/** Sheet whose empty pan frame is used for every idle pan (a clean, dry pan). */
const EMPTY_PAN_SHEET = 'fish';
const panMetas = new Map<string, SheetMeta>(Object.values(metas).filter((m) => m.panBox).map((m) => [m.key, m]));

/** Seconds one stir loop (rest, lift, up, peak, peak, falling, landing, rest) takes while the food cooks. */
const STIR_LOOP_S = 1.3;
/** Once the food is ready it is tossed only every READY_TOSS_EVERY seconds (one loop), and rests in between. */
const READY_TOSS_EVERY = 2.6;
/** Relative time each of the 8 loop steps stays on screen: the rest steps dwell longer than the toss steps (the clips all share this timeline). */
const STEP_WEIGHTS = [1.5, 0.8, 0.7, 0.7, 0.8, 0.8, 0.7, 1.3];
/** Loop step shown at `u` (0..1, the share of a loop that has passed) for a loop whose steps stay on screen for `weights` (relative times). */
function stepAt(weights: readonly number[], u: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = (((u % 1) + 1) % 1) * total;
  for (let i = 0; i < weights.length; i++) {
    if (x < weights[i]) return i;
    x -= weights[i];
  }
  return weights.length - 1;
}
/** Loop step of the 8-step stir loop at `u`. */
export function stirStep(u: number): number {
  return stepAt(STEP_WEIGHTS, u);
}
/** Seconds one press loop (rest, rest + steam, PRESSED, rest) takes while a burrito cooks in a pan. */
const PRESS_LOOP_S = 1.2;
/** The press loop's steps: the rest steps dwell longer than the pressed moment (step 2, steam puffs at the sides). */
const PRESS_WEIGHTS = [1.6, 1.2, 0.7, 1.5];
const PRESS_STEP = 2;
/** Loop step of the 4-step press loop at `u`. */
export function pressStep(u: number): number {
  return stepAt(PRESS_WEIGHTS, u);
}
/** How far a press plate is down (0 up .. 1 pressing) at `u` of a press loop: it comes down over the end of step 1, holds through step 2, and lifts at the start of step 3. */
export function pressDown(u: number): number {
  const total = PRESS_WEIGHTS.reduce((a, b) => a + b, 0);
  const x = (((u % 1) + 1) % 1) * total;
  const a = PRESS_WEIGHTS[0] + PRESS_WEIGHTS[1]; // start of the pressed step
  const b = a + PRESS_WEIGHTS[2]; // end of it
  if (x < a - 0.5 || x > b + 0.5) return 0;
  if (x < a) return smooth((x - (a - 0.5)) / 0.5);
  if (x <= b) return 1;
  return 1 - smooth((x - b) / 0.5);
}
/** Press looks in cooking order; cooking progress cross-fades pale > sear > golden at the same loop step. */
const PRESS_LOOK_NAMES = ['pale', 'sear', 'golden', 'burnt'];
const PRESS_LOOK_KEYS: readonly [number, number][] = [[0, 0], [0.4, 1], [1, 2]];
/** Sprite of a separate press plate (drawn over the pan, coming down in step with the press loop). null until that art exists. */
const PRESS_PLATE_SPRITE: string | null = null;
/** Looks of the stir clips in cooking order. Cooking progress (0..1) cross-fades raw > mid at 0.22-0.62 and mid > cooked at 0.62-1. */
const LOOK_NAMES = ['raw', 'mid', 'cooked', 'burnt'];
const LOOK_KEYS: readonly [number, number][] = [[0.22, 0], [0.62, 1], [1, 2]];
/** Cross-fade time (ms) when a pan changes picture (raw > sizzling > browning > ready, or back to empty). */
const PAN_FADE_MS = 320;
/** Seconds between steam puffs over a cooking pan, and over one whose food is ready. */
const STEAM_COOKING = 0.32;
const STEAM_READY = 0.9;
const STEAM_BURNT = 0.55;
/** A plate sprite is this much of its slot's width (the rest is the gap to the next plate). */
const PLATE_WIDTH_OF_SLOT = 0.94;

/** Smooth 0..1 ease so blends start and end gently instead of changing at a constant rate. */
const smooth = (x: number): number => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
interface Blend {
  a: number;
  b: number;
  /** How much of frame `b` is laid over frame `a` (0..1). */
  f: number;
}
/** Two neighbouring keyframes and the eased share between them for progress `x`, from keyframes [progress, frame] in order. */
function blendAt(keys: readonly [number, number][], x: number): Blend {
  if (x <= keys[0][0]) return { a: keys[0][1], b: keys[0][1], f: 0 };
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) return { a: keys[i - 1][1], b: keys[i][1], f: smooth((x - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])) };
  }
  const last = keys[keys.length - 1][1];
  return { a: last, b: last, f: 0 };
}
/** Seconds one melt loop (4 equal steps) takes while nachos melt (and while they sit ready or burnt). */
const MELT_LOOP_S = 0.9;
/** Looks of the nachos_melt sheet in order. While cooking, progress `u` (0..1 of readyAfter) turns raw > melting > melted between u 0.15 and 0.7;
 *  once ready, the burn fade turns melted > browned > burnt. */
const MELT_LOOKS = ['raw', 'melting', 'melted', 'browned', 'burnt'];
const MELT_COOK_KEYS: readonly [number, number][] = [[0.15, 0], [0.42, 1], [0.7, 2]];
const MELT_BURN_KEYS: readonly [number, number][] = [[0, 2], [0.5, 3], [1, 4]];
/**
 * Which two frames of the nachos_melt sheet to mix for nachos that are melting in an oven slot. `clips[look][step]` is the sheet frame, `burn` is the
 * share of the burn window used (0..1). The item is ONLY chips + cheese while it melts, so this never uses a protein or toppings frame of a nachos
 * dish sheet (the plate shows those later). With `still` (reduced motion) the loop holds its first step of the right look.
 */
export function meltBlend(clips: Record<string, number[]>, phase: CookPhase, t: number, readyAfter: number, burn: number, still: boolean): Blend {
  const step = still ? 0 : Math.min(3, Math.floor(((t % MELT_LOOP_S) / MELT_LOOP_S) * 4));
  const at = (look: number): number => clips[MELT_LOOKS[look]][step];
  if (phase === 'burnt') return { a: at(4), b: at(4), f: 0 };
  if (phase === 'cooking') {
    const bl = blendAt(MELT_COOK_KEYS, t / readyAfter);
    return { a: at(bl.a), b: at(bl.b), f: bl.f };
  }
  const bl = blendAt(MELT_BURN_KEYS, smooth((burn - BURN_FADE_FROM) / (1 - BURN_FADE_FROM)));
  return { a: at(bl.a), b: at(bl.b), f: bl.f };
}
const meltMeta = Object.values(metas).find((m) => m.key === 'nachos_melt');
const ovenDoorMeta = Object.values(metas).find((m) => m.key === 'oven_door_taco');
/** Oven shell: folded > warm > golden by cooking progress. Frames 1, 2, 3 of the oven sheet. */
const SHELL_KEYS: readonly [number, number][] = [[0.12, 1], [0.6, 2], [1, 3]];
/** Share of the burn window before the food starts to darken towards the burnt picture. */
const BURN_FADE_FROM = 0.35;
/** Ms for the picture of a station to cross-fade when it changes for another reason (a new step, a new sheet). */
const SWAP_MS = 260;

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

/** Makes one cook timer (the scene supplies it, so this file stays free of the Phaser runtime for tests). */
export type RingFactory = (x: number, y: number, radius: number) => Ring;

interface Slot {
  img: Phaser.GameObjects.Image;
  key: string;
  /** Second picture laid over `img` with `Face.over`, so a station changes continuously and never in steps. */
  over?: Phaser.GameObjects.Image;
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
  /** The empty plates themselves (they used to be painted into the background art). */
  private plateBase: Phaser.GameObjects.Image[] = [];
  /** Second pan picture blended over the base one (see `blendAt`). */
  private panOver: (Phaser.GameObjects.Image | null)[];
  private nextSteam: number[];
  /** Press plates over pans that press a burrito (only when PRESS_PLATE_SPRITE art exists). */
  private pressPlates: (Phaser.GameObjects.Image | null)[] = [];
  /** Cups in the dispensers, keyed `<drink>:<lane>`. */
  private cups = new Map<string, Slot>();
  /** The oven door (one body, both slots). Inactive when its sheet is missing. */
  private door: TacoOvenDoor;
  /** The pouring cold-drink dispensers (inactive for a machine whose art is missing). */
  private dispensers: TacoDispensers;
  /** One cook timer per pan and per oven slot (none on the griddle). They only read the slot's phase and `t`. */
  private panRings: (Ring | null)[] = [];
  private ovenRings: (Ring | null)[] = [];

  constructor(private scene: Phaser.Scene, private bg: BackgroundPlacement, private s: TacoKitchenState, private fx?: ParticlePool, private makeRing?: RingFactory) {
    this.pans = s.pans.map(() => null);
    this.panBase = s.pans.map(() => null);
    this.ovens = s.ovens.map(() => null);
    this.plates = s.plates.map(() => null);
    this.panOver = s.pans.map(() => null);
    this.nextSteam = s.pans.map(() => 0);
    this.buildPlateBase();
    this.door = new TacoOvenDoor(scene, bg, ovenDoorMeta);
    this.dispensers = new TacoDispensers(scene, bg, Object.values(metas).filter((m) => m.base && m.lanes) as unknown as DispenserMeta[]);
    this.buildRings();
  }

  /** Where each timer sits: back pans above the pan (on the stove rail), front pans below it (over the knobs, so no ring sits on another pan), ovens above the oven body. */
  private buildRings(): void {
    if (!this.makeRing) return;
    const make = this.makeRing;
    const at = (z: TacoZone, fy: number, r: number): Ring => make(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + fy * this.bg.height, r);
    for (const z of this.zones('pan')) {
      const front = z.height > 0.075;
      this.panRings[z.index ?? 0] = at(z, front ? z.y + z.height + RING_BELOW : z.y - RING_ABOVE - BACK_PAN_LIFT, PAN_RING_R);
    }
    for (const z of this.zones('oven')) this.ovenRings[z.index ?? 0] = at(z, OVEN_RING_Y, OVEN_RING_R);
  }

  /** Timers from the model: progress is `t / readyAfter` of the item's own configured time; phase is the model's phase. */
  private syncRings(): void {
    const s = this.s;
    const now = this.scene.time.now;
    s.pans.forEach((p, i) => {
      const ring = this.panRings[i];
      if (!ring) return;
      if (!p) return ring.show(null, 0, now);
      const readyAfter = p.what.kind === 'protein' ? s.taco.proteins[p.what.protein].readyAfter : s.taco.timed.press.readyAfter;
      ring.show(p.phase, p.t / readyAfter, now);
    });
    s.ovens.forEach((o, i) => {
      const ring = this.ovenRings[i];
      if (!ring) return;
      if (!o) return ring.show(null, 0, now);
      const readyAfter = o.what.kind === 'shell' ? s.taco.timed.crispy_shell.readyAfter : s.taco.timed.melt.readyAfter;
      ring.show(o.phase, o.t / readyAfter, now);
    });
  }

  /** One empty plate under every plate slot, sized from the slot so any number of plates lines up. */
  private buildPlateBase(): void {
    if (!this.scene.textures.exists(spriteKey('plate'))) return;
    for (const z of this.zones('plate')) {
      const img = this.scene.add.image(0, 0, spriteKey('plate')).setOrigin(0.5, 1).setDepth(DEPTH - 3);
      img.setScale((z.width * this.bg.width * PLATE_WIDTH_OF_SLOT) / img.width);
      // The plate's bottom edge sits near the bottom of its slot; the dish stands on it.
      img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height * 0.97) * this.bg.height);
      this.plateBase[z.index ?? 0] = img;
    }
  }

  sync(): void {
    const s = this.s;
    s.pans.forEach((p, i) => {
      const zone = this.zones('pan').find((q) => q.index === i);
      let baseFrame = 0;
      let blend: Blend = { a: 0, b: 0, f: 0 };
      let phase: CookPhase = 'cooking';
      let food: Face | null = null;
      let panProtein = PAN_PROTEIN; // whole-pan art for this protein, when a sheet exists in this pan's colour
      if (p) {
        phase = p.phase;
        if (p.what.kind === 'protein') {
          const def = s.taco.proteins[p.what.protein];
          const stir = panMetas.get(`pan_${PAN_COLOURS[i] ?? 'red'}_${p.what.protein}`)?.stir;
          if (stir) {
            panProtein = p.what.protein;
            blend = this.panBlend(stir, p.phase, p.t, def.readyAfter, def.burnWindow);
            baseFrame = blend.a;
          } else food = { sheet: `cook_${p.what.protein}`, frame: cookFrame(p.phase, p.t, def.readyAfter), phase: p.phase };
        } else {
          const press = panMetas.get(`pan_${PAN_COLOURS[i] ?? 'red'}_press`)?.stir;
          if (press) {
            // a burrito in a pan: the whole pan with the burrito is one picture (one sheet for all four fillings)
            panProtein = 'press';
            blend = this.pressBlend(press, p.phase, p.t, s.taco.timed.press.readyAfter, s.taco.timed.press.burnWindow);
            baseFrame = blend.a;
          } else {
            const ready = p.phase !== 'cooking';
            food = this.itemFace(p.what.item, ready ? 5 : 4, ready ? p.phase : 'cooking');
          }
        }
      }
      if (baseFrame === 0) panProtein = EMPTY_PAN_SHEET;
      const panName = `pan_${PAN_COLOURS[i] ?? 'red'}_${panProtein}`;
      if (zone) this.putPan(this.panBase, i, zone, panName, baseFrame, `${i}:${panProtein}`, phase, PAN_FLIPPED[i] ?? false);
      this.updatePanOver(i, panName, blend);
      this.updatePressPlate(i, zone, p && p.what.kind === 'press' && p.phase !== 'burnt' ? p.t : null);
      this.put(this.pans, i, 'pan', food);
      this.steam(i, zone, p ? p.phase : null, baseFrame > 0 || (!!p && p.what.kind !== 'protein'));
    });
    s.ovens.forEach((o, i) => {
      if (!o) return this.put(this.ovens, i, 'oven', null);
      if (o.what.kind === 'shell') {
        const def = s.taco.timed.crispy_shell;
        let bl: Blend;
        if (o.phase === 'burnt') bl = { a: 4, b: 4, f: 0 };
        else if (o.phase === 'cooking') bl = blendAt(SHELL_KEYS, o.t / def.readyAfter);
        else bl = { a: 3, b: 4, f: smooth((s.burnFraction(o.t, def.readyAfter, def.burnWindow) - BURN_FADE_FROM) / (1 - BURN_FADE_FROM)) };
        this.put(this.ovens, i, 'oven', { sheet: 'oven_taco_shell', frame: bl.a, phase: o.phase, over: bl.f > 0.01 ? { frame: bl.b, alpha: bl.f } : undefined, blend: true });
      } else if (meltMeta?.stir) {
        // Nachos melting: chips + cheese only (the nachos_melt sheet), never the finished-with-protein picture of the dish sheet.
        const def = s.taco.timed.melt;
        const bl = meltBlend(meltMeta.stir.clips, o.phase, o.t, def.readyAfter, s.burnFraction(o.t, def.readyAfter, def.burnWindow), SaveSystem.reduceMotion());
        this.put(this.ovens, i, 'oven', { sheet: 'nachos_melt', frame: bl.a, phase: o.phase, over: bl.f > 0.01 ? { frame: bl.b, alpha: bl.f } : undefined, blend: true });
      } else {
        this.put(this.ovens, i, 'oven', this.itemFace(o.what.item, 3, o.phase));
      }
    });
    // The door only follows the oven slots; oven food is drawn on the open tray and hidden while the door is closed.
    const trayShown = this.door.update(ovenDoorTarget(s.ovens), this.scene.time.now);
    this.ovens.forEach((o) => {
      if (!o) return;
      o.img.setVisible(trayShown);
      if (!trayShown) o.over?.setVisible(false);
    });
    this.syncRings();
    this.dispensers.sync(s);
    this.syncCups();
    s.plates.forEach((pl, i) => this.put(this.plates, i, 'plate', pl.item ? this.itemFace(pl.item, null, 'ready') : null));
  }

  destroy(): void {
    for (const list of [this.pans, this.panBase, this.ovens, this.plates]) list.forEach((x) => x && this.scene.tweens.killTweensOf(x.img));
    for (const list of [this.pans, this.panBase, this.ovens, this.plates]) list.forEach((x) => { x?.img.destroy(); x?.over?.destroy(); });
    this.door.destroy();
    this.dispensers.destroy();
    this.panRings.forEach((r) => r?.destroy());
    this.ovenRings.forEach((r) => r?.destroy());
    this.plateBase.forEach((x) => x?.destroy());
    this.plateBase = [];
    this.panOver.forEach((x) => x?.destroy());
    this.pressPlates.forEach((x) => x?.destroy());
    this.pressPlates = [];
    this.cups.forEach((c) => { c.img.destroy(); c.over?.destroy(); });
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
      if (this.dispensers.has(drink.id)) continue; // the pour art draws these cups itself
      s.pours[drink.id]?.forEach((p, lane) => {
        const key = `${drink.id}:${lane}`;
        const cur = this.cups.get(key);
        if (!p) {
          if (cur) {
            cur.img.destroy();
            cur.over?.destroy();
            this.cups.delete(key);
          }
          return;
        }
        const z = s.taco.zones.find((q) => q.action === 'cup' && q.arg === drink.id && q.index === lane);
        if (!z) return;
        // The liquid rises continuously: the level below and the level above are mixed by how far the fill has got.
        const lv = p.phase === 'cooking' ? 1 + Math.min(2.999, (p.t / drink.fillSeconds) * 3) : 4;
        const lo = Math.floor(lv);
        const frame = drink.sheetRow * 5 + lo;
        const upper = lo < 4 ? { frame: drink.sheetRow * 5 + lo + 1, alpha: smooth(lv - lo) } : undefined;
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
        if (upper && p.phase === 'cooking') {
          if (!slot.over) slot.over = this.scene.add.image(0, 0, sheetKey('drink_cups'), upper.frame).setOrigin(0.5, 0.9854);
          if (String(slot.over.frame.name) !== String(upper.frame)) slot.over.setFrame(upper.frame);
          slot.over.setVisible(true).setPosition(slot.img.x, slot.img.y).setScale(slot.img.scaleX, slot.img.scaleY).setDepth(DEPTH + 0.1).setAlpha(upper.alpha);
        } else slot.over?.setVisible(false);
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
      // The new pan picture fades in OVER the old one, which stays fully visible until the fade ends and is then removed.
      // (Fading both at once let the empty pan behind show through in the middle of the change.)
      const old = slot?.img;
      const img = this.scene.add.image(0, 0, sheetKey(name), frame)
        .setOrigin(0, 0)
        .setDepth(z.height > 0.075 ? DEPTH - 1 : DEPTH - 2)
        .setFlipX(flip);
      if (old) {
        if (SaveSystem.reduceMotion()) old.destroy();
        else {
          this.dying.add(old);
          img.setAlpha(0);
          this.scene.tweens.add({
            targets: img,
            alpha: 1,
            duration: PAN_FADE_MS,
            ease: 'Sine.InOut',
            onComplete: () => {
              this.dying.delete(old);
              old.destroy();
            },
          });
        }
      }
      slot = { img, key };
      list[i] = slot;
    }
    if (String(slot.img.frame.name) !== String(frame)) slot.img.setFrame(frame);
    const back = z.height <= 0.075;
    const scale = ((z.width * this.bg.width * PAN_WIDTH_PER_ZONE) / box.w) * (back ? BACK_PAN_SCALE : 1);
    const lift = back ? BACK_PAN_LIFT * this.bg.height : 0;
    slot.img.setScale(scale);
    // Mirrored pans line their right edge up with the zone's right edge, so the handle sticks out to the left.
    const left = flip ? this.bg.x + (z.x + z.width) * this.bg.width - (meta.frameWidth - box.x) * scale : this.bg.x + z.x * this.bg.width - box.x * scale;
    slot.img.setPosition(left, this.bg.y + z.y * this.bg.height - box.y * scale - lift);
    slot.img.setTint(phase === 'danger' ? 0xffb080 : 0xffffff);
  }

  /**
   * Which two pan pictures to mix right now. The picture is a stir loop: `t` (seconds cooked, so it follows the game clock and stops with it) picks
   * the loop step, and the cooking progress cross-fades the neighbouring looks at the SAME step, so the food changes colour without the pan or the toss jumping.
   * Ready food is tossed only now and then; after that it darkens towards the burnt picture. Burnt food rests. With reduced motion the pan holds its rest step.
   */
  private panBlend(stir: NonNullable<SheetMeta['stir']>, phase: CookPhase, t: number, readyAfter: number, burnWindow: number): Blend {
    const still = SaveSystem.reduceMotion();
    const at = (look: string, step: number): number => stir.clips[look][step];
    if (phase === 'burnt') return { a: at('burnt', 0), b: at('burnt', 0), f: 0 };
    if (phase === 'cooking') {
      const bl = blendAt(LOOK_KEYS, t / readyAfter);
      const step = still ? 0 : stirStep((t % STIR_LOOP_S) / STIR_LOOP_S);
      return { a: at(LOOK_NAMES[bl.a], step), b: at(LOOK_NAMES[bl.b], step), f: bl.f };
    }
    const fade = smooth((this.s.burnFraction(t, readyAfter, burnWindow) - BURN_FADE_FROM) / (1 - BURN_FADE_FROM));
    const since = (t - readyAfter) % READY_TOSS_EVERY;
    const step = still || fade > 0 || since >= STIR_LOOP_S ? 0 : stirStep(since / STIR_LOOP_S);
    return { a: at('cooked', step), b: at('burnt', 0), f: fade };
  }

  /**
   * Which two pan pictures to mix for a burrito in the press. Same idea as `panBlend`: `t` picks the step of the 4-step press loop (rest, rest + steam,
   * pressed, rest) and the cooking progress cross-fades pale > sear > golden at the SAME step. Ready: the golden loop with steam but no pressing,
   * darkening to the burnt look by `burnFraction`. Burnt: the burnt loop (smoke), never pressed. Reduced motion holds step 0.
   */
  private pressBlend(stir: NonNullable<SheetMeta['stir']>, phase: CookPhase, t: number, readyAfter: number, burnWindow: number): Blend {
    const still = SaveSystem.reduceMotion();
    const at = (look: string, step: number): number => stir.clips[look][step];
    const loopStep = still ? 0 : pressStep((t % PRESS_LOOP_S) / PRESS_LOOP_S);
    const noPress = loopStep === PRESS_STEP ? 1 : loopStep; // done food is not pressed any more
    if (phase === 'burnt') return { a: at('burnt', noPress), b: at('burnt', noPress), f: 0 };
    if (phase === 'cooking') {
      const bl = blendAt(PRESS_LOOK_KEYS, t / readyAfter);
      return { a: at(PRESS_LOOK_NAMES[bl.a], loopStep), b: at(PRESS_LOOK_NAMES[bl.b], loopStep), f: bl.f };
    }
    const fade = smooth((this.s.burnFraction(t, readyAfter, burnWindow) - BURN_FADE_FROM) / (1 - BURN_FADE_FROM));
    return { a: at('golden', noPress), b: at('burnt', noPress), f: fade };
  }

  /** The second pan picture, laid exactly over the base pan with the blend's share as its alpha. */
  private updatePanOver(i: number, name: string, bl: Blend): void {
    const base = this.panBase[i]?.img;
    let img = this.panOver[i];
    if (!base || bl.f < 0.01 || !panMetas.has(name)) {
      if (img) img.setVisible(false);
      return;
    }
    const tex = sheetKey(name);
    if (!img) {
      img = this.scene.add.image(0, 0, tex, bl.b).setOrigin(0, 0);
      this.panOver[i] = img;
    }
    if (img.texture.key !== tex) img.setTexture(tex, bl.b);
    else if (String(img.frame.name) !== String(bl.b)) img.setFrame(bl.b);
    img.setVisible(true).setPosition(base.x, base.y).setScale(base.scaleX, base.scaleY).setFlipX(base.flipX).setDepth(base.depth + 0.1);
    img.setTint(base.tintTopLeft).setAlpha(bl.f * base.alpha);
  }

  /**
   * Hook for a separate press plate: it comes down over the pan at the pressed step of the press loop, holds a moment and lifts (see `pressDown`).
   * Does nothing until PRESS_PLATE_SPRITE names a sprite that is loaded (the art does not exist yet). `t` is the cooked time, or null when no burrito is pressing.
   */
  private updatePressPlate(i: number, z: TacoZone | undefined, t: number | null): void {
    if (!PRESS_PLATE_SPRITE || !z || !this.scene.textures.exists(spriteKey(PRESS_PLATE_SPRITE))) return;
    let img = this.pressPlates[i];
    const base = this.panBase[i]?.img;
    if (t === null || !base) return void img?.setVisible(false);
    if (!img) {
      img = this.scene.add.image(0, 0, spriteKey(PRESS_PLATE_SPRITE));
      this.pressPlates[i] = img;
    }
    const down = SaveSystem.reduceMotion() ? 0 : pressDown((t % PRESS_LOOP_S) / PRESS_LOOP_S);
    const sp = this.spot(z);
    img.setVisible(down > 0.01).setDepth(base.depth + 0.2).setScale((sp.w * 0.8) / img.width).setPosition(sp.x, sp.y - (1 - down) * sp.h * 0.6).setAlpha(down);
  }

  /** Soft steam puffs over a pan: often while it cooks, now and then when the food is ready. */
  private steam(i: number, z: TacoZone | undefined, phase: CookPhase | null, hasFood: boolean): void {
    if (!this.fx || !z || !phase || !hasFood) return;
    const now = this.scene.time.now / 1000;
    if (now < this.nextSteam[i]) return;
    this.nextSteam[i] = now + (phase === 'cooking' ? STEAM_COOKING : phase === 'burnt' ? STEAM_BURNT : STEAM_READY) * (0.8 + Math.random() * 0.5);
    const sp = this.spot(z);
    const x = sp.x + (Math.random() - 0.5) * sp.w * 0.5;
    // burnt food smokes: dark, slower puffs (the burnt pictures themselves carry no smoke)
    if (phase === 'burnt') return void this.fx.rise(x, sp.y - sp.h * 0.1, 0x3a3a3a, 0.36, 7 + Math.random() * 5, 30 + Math.random() * 18, 1100 + Math.random() * 500, (Math.random() - 0.5) * 16);
    this.fx.rise(x, sp.y - sp.h * 0.1, 0xffffff, phase === 'cooking' ? 0.3 : 0.22, 5 + Math.random() * 4, 26 + Math.random() * 16, 800 + Math.random() * 400, (Math.random() - 0.5) * 14);
  }

  private put(list: (Slot | null)[], i: number, kind: 'pan' | 'oven' | 'plate', face: Face | null): void {
    const cur = list[i];
    if (!face) {
      if (cur) {
        this.release(cur.img);
        if (cur.over) this.release(cur.over);
        list[i] = null;
      }
      return;
    }
    // A continuous blend keeps one slot for the whole cooking time; other faces get a new picture per frame.
    const key = face.sprite ? `s:${face.sprite}` : face.blend ? `b:${face.sheet}` : `h:${face.sheet}:${face.frame}`;
    const z = this.zones(kind).find((q) => q.index === i);
    if (!z) return;
    let slot = cur;
    if (!slot || slot.key !== key) {
      const old = slot?.img;
      if (slot?.over) this.release(slot.over, SWAP_MS);
      const img = face.sprite ? this.scene.add.image(0, 0, spriteKey(face.sprite)) : this.scene.add.image(0, 0, sheetKey(face.sheet!), face.frame);
      img.setDepth(DEPTH).setOrigin(0.5, 0.95);
      slot = { img, key };
      list[i] = slot;
      // Size to the zone. The food in a sheet frame fills about 75% of the frame width (the rest is steam room),
      // so pan and oven food is scaled until that part is about 68% of the zone width (the pan bowl is a little narrower than its zone); a plate item is 80% of the plate zone.
      const zw = z.width * this.bg.width;
      const scale = kind === 'plate' ? (zw * 0.8) / img.width : (zw * (kind === 'pan' && z.height > 0.075 ? 0.62 : 0.66)) / (img.width * 0.75);
      img.setScale(scale);
      if (!old) this.appear(img, scale);
      else this.swap(old, img, scale, kind === 'plate');
    }
    if (face.blend && !face.sprite && String(slot.img.frame.name) !== String(face.frame)) slot.img.setFrame(face.frame ?? 0);
    // Pan and oven food sits low-centre in the bowl; plate items sit near the bottom of their zone.
    const front = z.height > 0.075; // the two front pans are drawn bigger and lower than the back pair
    const baseline = kind === 'plate' ? 0.8 : kind === 'pan' && front ? 0.88 : 0.8;
    const lift = kind === 'pan' && !front ? BACK_PAN_LIFT : 0;
    slot.img.setDepth(kind === 'pan' && !front ? DEPTH - 1.5 : DEPTH);
    slot.img.setPosition(this.bg.x + (z.x + z.width / 2) * this.bg.width, this.bg.y + (z.y + z.height * baseline - lift) * this.bg.height);
    slot.img.setTint(face.phase === 'danger' ? 0xffb080 : 0xffffff);
    this.syncOver(slot, face);
  }

  /** The new picture fades in over the old one (which is removed when the fade ends), with a small bump when a step lands on a plate. */
  private swap(old: Phaser.GameObjects.Image, img: Phaser.GameObjects.Image, scale: number, bump: boolean): void {
    this.scene.tweens.killTweensOf(old);
    if (SaveSystem.reduceMotion()) {
      old.destroy();
      return;
    }
    this.dying.add(old);
    img.setAlpha(0);
    if (bump) img.setScale(scale * 1.07);
    this.scene.tweens.add({ targets: img, alpha: 1, scale, duration: SWAP_MS, ease: 'Sine.Out' });
    this.scene.tweens.add({
      targets: old,
      alpha: { from: old.alpha, to: 0 },
      duration: SWAP_MS,
      ease: 'Sine.In',
      onComplete: () => {
        this.dying.delete(old);
        old.destroy();
      },
    });
  }

  /** The second picture of a blend, laid over the slot's image with the same place and size. */
  private syncOver(slot: Slot, face: Face): void {
    if (!face.over || !face.sheet) {
      slot.over?.setVisible(false);
      return;
    }
    if (!slot.over) slot.over = this.scene.add.image(0, 0, sheetKey(face.sheet), face.over.frame).setOrigin(0.5, 0.95);
    const o = slot.over;
    if (String(o.frame.name) !== String(face.over.frame)) o.setFrame(face.over.frame);
    o.setVisible(true).setPosition(slot.img.x, slot.img.y).setScale(slot.img.scaleX, slot.img.scaleY).setDepth(slot.img.depth + 0.1);
    o.setTint(face.phase === 'danger' ? 0xffb080 : 0xffffff).setAlpha(face.over.alpha * slot.img.alpha);
  }
}

interface Face {
  sheet?: string;
  sprite?: string;
  frame?: number;
  phase: CookPhase;
  /** Lay this frame of the same sheet over `frame` at this alpha (continuous cooking look). */
  over?: { frame: number; alpha: number };
  /** The face is a continuous blend: its slot is not re-made when the frame changes. */
  blend?: boolean;
}
