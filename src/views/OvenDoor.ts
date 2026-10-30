import Phaser from 'phaser';
import assetsJson from '../../data/assets.json';
import type { CookPhase } from '../game/cook';
import { SaveSystem } from '../systems/SaveSystem';
import type { Layout } from './layout';

/**
 * The pizza-oven door. It plays frames cut from the supplied oven clip (`oven_door` sheet:
 * 14 closing frames, then 21 opening frames) over the oven in the kitchen art. The clip's first
 * frame is the art itself, so the sprite is only shown while the door is moving or closed and
 * the static art is what the player sees at rest.
 *
 * This is a view: the model's oven phase is the only input. The door never decides when a pizza
 * is done. If the sheet has not loaded (or failed to load) nothing here runs and the oven works
 * exactly as before, just without a door.
 */
export const OVEN_SHEET = 'oven_door';
const CLOSE_FRAMES = 14;
const OPEN_FRAMES = 21;
const CLOSE_MS = 1000;
const OPEN_MS = 1050;
const FADE_MS = 250;

/** Where the 258 x 242 clip frame sits on the kitchen art, in source pixels (found by image matching). */
const FRAME_X = 601.3;
const FRAME_Y = 590;
const FRAME_W = 349.6;

type DoorState = 'open' | 'closing' | 'closed' | 'opening' | 'lit';

/** Start loading the sheet in the background (after the scene is up), so gameplay never waits for it. */
export function loadOvenSheet(scene: Phaser.Scene): void {
  if (scene.textures.exists(OVEN_SHEET)) return;
  const def = (assetsJson as { assets: { key: string; file: string; frameWidth?: number; frameHeight?: number }[] }).assets.find((a) => a.key === OVEN_SHEET);
  if (!def || !def.frameWidth || !def.frameHeight) return;
  scene.load.once(`loaderror`, (f: Phaser.Loader.File) => {
    if (f.key === OVEN_SHEET) console.error(`Missing asset: ${f.key} (${f.url}); the oven door animation is off`);
  });
  scene.load.spritesheet(OVEN_SHEET, def.file, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
  if (!scene.load.isLoading()) scene.load.start();
}

export class OvenDoor {
  private sprite?: Phaser.GameObjects.Sprite;
  state: DoorState = 'open';
  private since = 0;
  private fadeStart = -1;

  constructor(private scene: Phaser.Scene, private layout: Layout) {}

  /** True once the sheet is loaded and the door can be shown. */
  get ready(): boolean {
    return !!this.sprite;
  }
  /** 0 while the door is open, rising to 1 as it closes. */
  get closeProgress(): number {
    if (this.state === 'open') return 0;
    if (this.state === 'closing') return Math.min(1, (this.now - this.since) / CLOSE_MS);
    return 1;
  }
  /** 0 until the door starts opening, 1 once it is fully open. */
  get openProgress(): number {
    if (this.state === 'lit') return 1;
    if (this.state === 'opening') return Math.min(1, (this.now - this.since) / OPEN_MS);
    return 0;
  }
  private now = 0;

  private attach(): void {
    if (this.sprite || !this.scene.textures.exists(OVEN_SHEET)) return;
    const s = this.scene.add.sprite(this.layout.x(FRAME_X), this.layout.y(FRAME_Y), OVEN_SHEET, 0).setOrigin(0, 0).setDepth(450).setVisible(false);
    s.setScale(this.layout.s(FRAME_W) / s.width);
    this.sprite = s;
  }

  /**
   * `phase` is the model's oven phase (null = empty). `holdUntil` is when the raw pizza lands, so
   * the door waits for it before closing.
   */
  update(phase: CookPhase | null, now: number, holdUntil: number): void {
    this.now = now;
    this.attach();
    const s = this.sprite;
    if (!s) return;
    const instant = SaveSystem.reduceMotion();
    const want = phase === null ? 'open' : phase === 'cooking' ? 'closed' : 'lit';

    if (want === 'open') {
      if (this.state !== 'open') {
        this.state = 'open';
        this.fadeStart = now;
      }
      if (this.fadeStart >= 0) {
        const t = instant ? 1 : (now - this.fadeStart) / FADE_MS;
        if (t >= 1) {
          s.setVisible(false);
          this.fadeStart = -1;
        } else s.setAlpha(1 - t);
      }
      return;
    }

    if (want === 'closed') {
      if (this.state === 'open') {
        if (now < holdUntil) return; // the pizza is still flying in
        this.fadeStart = -1;
        s.setVisible(true).setAlpha(1).setFrame(0);
        this.state = 'closing';
        this.since = now;
        if (instant) this.state = 'closed';
      } else if (this.state === 'lit' || this.state === 'opening') {
        this.state = 'closed';
      }
    } else if (this.state === 'open') {
      // Done without the door ever closing (very fast debug speed): start from the closed door.
      this.fadeStart = -1;
      s.setVisible(true).setAlpha(1);
      this.state = 'closed';
    }

    if (this.state === 'closing') {
      const p = (now - this.since) / CLOSE_MS;
      if (p >= 1) this.state = 'closed';
      else s.setFrame(Math.min(CLOSE_FRAMES - 1, Math.floor(p * CLOSE_FRAMES)));
    }
    if (this.state === 'closed') {
      s.setFrame(CLOSE_FRAMES - 1);
      if (want === 'lit') {
        this.state = instant ? 'lit' : 'opening';
        this.since = now;
      }
    }
    if (this.state === 'opening') {
      const p = (now - this.since) / OPEN_MS;
      if (p >= 1) this.state = 'lit';
      else s.setFrame(CLOSE_FRAMES + Math.min(OPEN_FRAMES - 1, Math.floor(p * OPEN_FRAMES)));
    }
    if (this.state === 'lit') s.setFrame(CLOSE_FRAMES + OPEN_FRAMES - 1);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = undefined;
  }
}
