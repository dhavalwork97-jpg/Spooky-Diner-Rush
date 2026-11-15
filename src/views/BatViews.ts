import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { BAT_BAND, batPosition, nextFlightDue, type BatFlight } from '../game/spooky';
import { dxKey, hasDinerArt } from './dinerArt';

/**
 * Bat Delivery: the bat sprite flies across the wall above the stools; tapping it asks the model for a coin bag (the scene decides what
 * that looks like). The position is a pure function of the event clock (see game/spooky.ts), so a paused game keeps the bat still.
 * Behind the customers (depth 295 < 299) so it never covers an order bubble. With reduced motion the bat does not fly: it appears
 * still for a few seconds at a fixed spot (a tap target all the same).
 */
const ANIM = 'dx_bat_flap';
const DEPTH = 295;
/** Display size of one frame (326 x 534 in the art) in logical pixels. */
const SCALE = 0.3;
/** Extra tap area around the bat, in texture pixels (about 18 logical px), because it moves. */
const TAP_PAD = 60;
const STILL_X = [0.3, 0.7];

export class BatFlyers {
  private plan: BatFlight[] = [];
  private started = 0;
  private bats = new Map<number, Phaser.GameObjects.Sprite>();

  constructor(private scene: Phaser.Scene, private width: number, private onTap: (x: number, y: number) => void) {}

  /** Start a new flight plan (the event just began). */
  start(plan: BatFlight[]): void {
    this.clear();
    this.plan = plan;
  }

  /** Move every bat for `elapsed` seconds into the event, and send the next one when its time has come. */
  update(elapsed: number): void {
    const due = nextFlightDue(this.plan, this.started, elapsed);
    if (due >= 0) {
      this.started++;
      this.launch(due);
    }
    const reduce = SaveSystem.reduceMotion();
    for (const [i, sprite] of this.bats) {
      const f = this.plan[i];
      const p = batPosition(f, elapsed, this.width);
      if (p.progress >= 1) {
        this.remove(i);
        continue;
      }
      if (reduce) {
        sprite.setPosition(this.width * STILL_X[i % STILL_X.length], BAT_BAND.top + (BAT_BAND.bottom - BAT_BAND.top) * 0.5);
        sprite.setAlpha(p.progress < 0.06 || p.progress > 0.94 ? 0 : 1);
      } else sprite.setPosition(p.x, p.y);
    }
  }

  private launch(i: number): void {
    if (!hasDinerArt(this.scene, 'bat_fly')) return; // the art is still loading (or failed): skip this flight
    if (!this.scene.anims.exists(ANIM)) this.scene.anims.create({ key: ANIM, frames: this.scene.anims.generateFrameNumbers(dxKey('bat_fly'), { frames: [0, 1, 2, 3, 2, 1] }), frameRate: 12, repeat: -1 });
    const f = this.plan[i];
    const sprite = this.scene.add.sprite(-200, -200, dxKey('bat_fly'), 0).setOrigin(0.5, 0.45).setScale(SCALE).setDepth(DEPTH).setFlipX(!f.fromLeft);
    if (!SaveSystem.reduceMotion()) sprite.play(ANIM);
    audio.play('flap'); // one flutter as the bat flies in (throttled, and silent when muted)
    sprite.setInteractive(new Phaser.Geom.Rectangle(-TAP_PAD, -TAP_PAD, sprite.width + TAP_PAD * 2, sprite.height + TAP_PAD * 2), Phaser.Geom.Rectangle.Contains);
    sprite.input!.cursor = 'pointer';
    sprite.on('pointerdown', () => this.onTap(sprite.x, sprite.y));
    sprite.once('destroy', () => sprite.off('pointerdown'));
    this.bats.set(i, sprite);
  }

  /** The bat that was tapped (the closest one to this point) flies off: a quick shrink and fade. */
  caught(x: number, y: number): void {
    let best = -1;
    let bestD = Infinity;
    for (const [i, s] of this.bats) {
      const d = Phaser.Math.Distance.Between(s.x, s.y, x, y);
      if (d < bestD) (best = i), (bestD = d);
    }
    const s = this.bats.get(best);
    if (!s) return;
    this.bats.delete(best);
    s.disableInteractive();
    if (SaveSystem.reduceMotion()) return s.destroy();
    this.scene.tweens.add({ targets: s, y: s.y - 60, scale: SCALE * 0.4, alpha: 0, duration: 380, ease: 'Quad.In', onComplete: () => s.destroy() });
  }

  private remove(i: number): void {
    this.bats.get(i)?.destroy();
    this.bats.delete(i);
  }

  /** The event ended (or the kitchen closed): every bat goes at once. */
  clear(): void {
    for (const s of this.bats.values()) s.destroy();
    this.bats.clear();
    this.plan = [];
    this.started = 0;
  }

  get flying(): number {
    return this.bats.size;
  }
  /** For tests and the debug hook: where each bat is. */
  positions(): { x: number; y: number }[] {
    return [...this.bats.values()].map((s) => ({ x: s.x, y: s.y }));
  }
  destroy(): void {
    this.clear();
  }
}
