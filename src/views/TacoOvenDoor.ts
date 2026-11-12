import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { CookPhase } from '../game/cook';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * The Taco Truck oven door. One oven body holds both oven slots, so one door serves both. The clips come from the supplied
 * Gemini oven video (`oven_door_taco` sheet, built by tools/make_oven_door_sheet.py): close, closed-idle, open, open-hold.
 *
 * This is a view: it only reads what the kitchen model's oven slots are doing. It never decides when anything is done.
 *  - door OPEN while the player places or collects (no oven, or any oven that is no longer 'cooking');
 *  - door CLOSED while every occupied oven is still 'cooking' (play `close`, hold `closed-idle`);
 *  - when something finishes the door plays `open`, then holds `open-hold` so the food can be collected.
 * If the sheet is missing nothing here runs and the old painted oven stays as it was.
 */
export const OVEN_DOOR_SHEET = 'tacosheet_oven_door_taco';
export interface OvenDoorClips {
  close: number[];
  'closed-idle': number[];
  open: number[];
  'open-hold': number[];
}
export type DoorState = 'open' | 'closing' | 'closed' | 'opening';

/** Where the 258 x 242 video frame sits on the kitchen art, as fractions of the kitchen picture (tray lines up with the two oven tap zones). */
export const OVEN_DOOR_BOX = { x: 0.3624, y: 0.7012, w: 0.1874 };
const DEPTH = 20; // above the kitchen art, below the oven food (25) and the plates

/** Where the door should be, from the model's oven slots only. */
export function ovenDoorTarget(ovens: ReadonlyArray<{ phase: CookPhase } | null>): 'open' | 'closed' {
  const used = ovens.filter((o): o is { phase: CookPhase } => !!o);
  return used.length > 0 && used.every((o) => o.phase === 'cooking') ? 'closed' : 'open';
}

/** Sheet frame for a state `elapsedMs` after it started, and how far through the move it is (0..1; 1 for the held states). */
export function doorFrame(clips: OvenDoorClips, state: DoorState, elapsedMs: number, closeFps: number, openFps: number): { frame: number; progress: number } {
  if (state === 'open') return { frame: clips['open-hold'][0], progress: 1 };
  if (state === 'closed') return { frame: clips['closed-idle'][0], progress: 1 };
  const list = state === 'closing' ? clips.close : clips.open;
  const fps = state === 'closing' ? closeFps : openFps;
  const progress = Math.min(1, Math.max(0, (elapsedMs / 1000) * fps) / list.length);
  return { frame: list[Math.min(list.length - 1, Math.floor((elapsedMs / 1000) * fps))], progress };
}

export class TacoOvenDoor {
  private img?: Phaser.GameObjects.Image;
  private clips?: OvenDoorClips;
  private closeFps = 14;
  private openFps = 14;
  state: DoorState = 'open';
  private since = 0;
  private placed = false;

  constructor(scene: Phaser.Scene, bg: BackgroundPlacement, meta?: { clips?: OvenDoorClips; clipFps?: { close?: number; open?: number } }) {
    if (!meta?.clips || !scene.textures.exists(OVEN_DOOR_SHEET)) return;
    this.clips = meta.clips;
    this.closeFps = meta.clipFps?.close ?? 14;
    this.openFps = meta.clipFps?.open ?? 14;
    const b = OVEN_DOOR_BOX;
    this.img = scene.add.image(bg.x + b.x * bg.width, bg.y + b.y * bg.height, OVEN_DOOR_SHEET, meta.clips['open-hold'][0]).setOrigin(0, 0).setDepth(DEPTH);
    this.img.setScale((b.w * bg.width) / this.img.width);
  }

  /** True when the door art exists (otherwise the old painted oven is what the player sees). */
  get active(): boolean {
    return !!this.img;
  }

  /** Move the door toward `target`. Returns true while the oven food may be drawn (the tray is showing). */
  update(target: 'open' | 'closed', now: number): boolean {
    if (!this.img || !this.clips) return true;
    if (!this.placed) {
      // first frame: show the right resting state at once, no move
      this.placed = true;
      this.state = target;
    } else if (SaveSystem.reduceMotion()) {
      if (this.state !== target) this.state = target;
    } else if (this.state === 'open' && target === 'closed') this.start('closing', now);
    else if (this.state === 'closed' && target === 'open') this.start('opening', now);
    const f = doorFrame(this.clips, this.state, now - this.since, this.closeFps, this.openFps);
    if (f.progress >= 1 && (this.state === 'closing' || this.state === 'opening')) {
      this.state = this.state === 'closing' ? 'closed' : 'open';
      return this.update(target, now);
    }
    if (String(this.img.frame.name) !== String(f.frame)) this.img.setFrame(f.frame);
    if (this.state === 'open') return true;
    if (this.state === 'opening') return f.progress > 0.7;
    return false;
  }

  private start(s: DoorState, now: number): void {
    this.state = s;
    this.since = now;
  }

  destroy(): void {
    this.img?.destroy();
    this.img = undefined;
  }
}
