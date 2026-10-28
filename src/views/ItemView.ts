import Phaser from 'phaser';
import type { ItemKind } from '../game/config';
import { MUSTARD } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';

const S = 0.42;

/**
 * A finished (or building) item resting on a counter plate. Draggable.
 * Looks only: whether it is cooked or served is decided by the model.
 */
export class ItemView extends Phaser.GameObjects.Container {
  readonly itemId: number;
  readonly kind: ItemKind;
  slotIndex: number;
  leaving = false;
  dragging = false;
  home = { x: 0, y: 0 };
  private glow: Phaser.GameObjects.Arc;
  private sel: Phaser.GameObjects.Arc;
  private shadow: Phaser.GameObjects.Ellipse;
  private art: Phaser.GameObjects.Container;
  private bob?: Phaser.Tweens.Tween;
  private stage = 0; // burger layers placed: 1 bun, 2 patty, 3 top bun

  constructor(scene: Phaser.Scene, x: number, y: number, itemId: number, kind: ItemKind, slotIndex: number) {
    super(scene, x, y);
    this.itemId = itemId;
    this.kind = kind;
    this.slotIndex = slotIndex;
    this.home = { x, y };
    this.shadow = scene.add.ellipse(0, 24, 66, 16, 0x000000, 0.2);
    this.glow = scene.add.circle(0, 0, 46, MUSTARD, 0).setStrokeStyle(0);
    this.sel = scene.add.circle(0, 0, 50).setStrokeStyle(5, 0xffffff, 1).setFillStyle(0, 0).setVisible(false);
    this.art = scene.add.container(0, 0);
    this.add([this.shadow, this.glow, this.art, this.sel]);
    this.setSize(92, 92).setDepth(700);
    scene.add.existing(this);
    this.setInteractive({ useHandCursor: true, draggable: true });
    scene.input.setDraggable(this);
  }

  // ----- fries -----
  showFries(): void {
    this.art.add(this.scene.add.image(0, -4, 'fries_cooked').setScale(0.44));
    this.markReady(true);
  }

  // ----- burger assembly: each layer drops on with a small bounce -----
  addBun(): void {
    this.stage = 1;
    this.drop(this.scene.add.image(0, 12, 'bun_bottom').setScale(S), 12, 'bun');
  }

  /** Patty lands, then the top bun, then a squish. Calls done when finished. */
  finishBurger(done?: () => void): void {
    this.stage = 2;
    this.drop(this.scene.add.image(0, 0, 'patty_cooked').setScale(S), 0, 'patty');
    const delay = SaveSystem.reduceMotion() ? 0 : 260;
    this.scene.time.delayedCall(delay, () => {
      if (!this.scene || !this.active) return;
      this.stage = 3;
      this.drop(this.scene.add.image(0, -14, 'bun_top').setScale(S), -14, 'bun');
      this.scene.time.delayedCall(delay, () => {
        if (!this.scene || !this.active) return;
        this.squish();
        this.markReady(true);
        done?.();
      });
    });
  }

  /** Show a burger that is already complete (used when restoring state). */
  showBurgerComplete(): void {
    this.art.add([
      this.scene.add.image(0, 12, 'bun_bottom').setScale(S),
      this.scene.add.image(0, 0, 'patty_cooked').setScale(S),
      this.scene.add.image(0, -14, 'bun_top').setScale(S),
    ]);
    this.stage = 3;
    this.markReady(false);
  }

  private drop(img: Phaser.GameObjects.Image, toY: number, sound: 'bun' | 'patty'): void {
    this.art.add(img);
    audio.play('drop');
    if (SaveSystem.reduceMotion()) return;
    img.setY(toY - 70).setAlpha(0);
    this.scene.tweens.add({ targets: img, y: toY, alpha: 1, duration: 260, ease: 'Bounce.Out' });
    void sound;
  }

  private squish(): void {
    if (SaveSystem.reduceMotion()) return;
    this.scene.tweens.add({ targets: this.art, scaleX: 1.12, scaleY: 0.88, duration: 110, yoyo: true, ease: 'Sine.InOut' });
  }

  /** Glow and a gentle bounce while the item waits to be served. */
  markReady(bounce: boolean): void {
    const reduce = SaveSystem.reduceMotion();
    this.glow.setFillStyle(MUSTARD, 0.28);
    if (reduce) return;
    this.scene.tweens.add({ targets: this.glow, alpha: { from: 0.5, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (bounce) this.scene.tweens.add({ targets: this.art, y: -12, duration: 150, yoyo: true, ease: 'Quad.Out' });
    this.bob?.stop();
    this.bob = this.scene.tweens.add({ targets: this.art, y: -3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: Math.random() * 400 });
  }

  setSelected(on: boolean): void {
    this.sel.setVisible(on);
  }

  setDragging(on: boolean): void {
    this.dragging = on;
    this.setDepth(on ? 1100 : 700);
    this.setScale(on ? 1.1 : 1);
    this.setAngle(on && !SaveSystem.reduceMotion() ? 6 : 0);
    this.shadow.setAlpha(on ? 0.4 : 0.2).setY(on ? 34 : 24);
  }

  get stageCount(): number {
    return this.stage;
  }

  override destroy(fromScene?: boolean): void {
    this.bob?.stop();
    this.scene?.tweens.killTweensOf([this, this.art, this.glow]);
    super.destroy(fromScene);
  }
}
