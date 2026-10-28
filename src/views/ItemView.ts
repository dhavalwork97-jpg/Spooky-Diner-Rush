import Phaser from 'phaser';
import type { ItemKind } from '../game/config';
import { MUSTARD } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';

/** Vertical offset (in units of item width) of each burger layer, bottom to top. */
const LAYER_Y: Record<string, number> = { bun_bottom: 0.14, patty: 0.05, lettuce: -0.04, tomato: -0.12, bun_top: -0.22 };

/**
 * A finished (or building) item resting on a plate. Draggable.
 * Looks only: whether it is cooked, complete or served is decided by the model.
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
  private drawn = 0;
  private ready = false;

  /** `w` is the item's on-screen width in logical pixels. */
  constructor(scene: Phaser.Scene, x: number, y: number, itemId: number, kind: ItemKind, slotIndex: number, private itemW: number) {
    super(scene, x, y);
    this.itemId = itemId;
    this.kind = kind;
    this.slotIndex = slotIndex;
    this.home = { x, y };
    this.shadow = scene.add.ellipse(0, itemW * 0.3, itemW * 0.95, itemW * 0.22, 0x000000, 0.2);
    this.glow = scene.add.circle(0, 0, itemW * 0.62, MUSTARD, 0).setStrokeStyle(0);
    this.sel = scene.add.circle(0, 0, itemW * 0.68).setStrokeStyle(5, 0xffffff, 1).setFillStyle(0, 0).setVisible(false);
    this.art = scene.add.container(0, 0);
    this.add([this.shadow, this.glow, this.art, this.sel]);
    this.setSize(Math.max(88, itemW * 1.3), Math.max(88, itemW * 1.3)).setDepth(700);
    scene.add.existing(this);
    this.setInteractive({ useHandCursor: true, draggable: true });
    scene.input.setDraggable(this);
  }

  private img(key: string, y: number): Phaser.GameObjects.Image {
    const im = this.scene.add.image(0, y, key);
    im.setScale(this.itemW / im.width);
    return im;
  }

  showFries(): void {
    this.art.add(this.img('fries_cooked', -this.itemW * 0.05));
    this.markReady(true);
  }

  /** Make the stack match the placed layers. New layers drop on with a bounce. */
  syncLayers(placed: string[], building: boolean, animate: boolean): void {
    for (let i = this.drawn; i < placed.length; i++) {
      const layer = placed[i];
      const toY = (LAYER_Y[layer] ?? 0) * this.itemW;
      const im = this.img(layer === 'patty' ? 'patty_cooked' : layer, toY);
      this.art.add(im);
      if (animate) {
        audio.play('drop');
        if (!SaveSystem.reduceMotion()) {
          im.setY(toY - this.itemW * 0.7).setAlpha(0);
          this.scene.tweens.add({ targets: im, y: toY, alpha: 1, duration: 260, ease: 'Bounce.Out' });
        }
      }
    }
    this.drawn = placed.length;
    if (!building && !this.ready) {
      this.squish();
      this.markReady(animate);
    }
  }

  private squish(): void {
    if (SaveSystem.reduceMotion()) return;
    this.scene.tweens.add({ targets: this.art, scaleX: 1.12, scaleY: 0.88, duration: 110, yoyo: true, ease: 'Sine.InOut' });
  }

  /** Glow and a gentle bounce while the item waits to be served. */
  markReady(bounce: boolean): void {
    this.ready = true;
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
    this.shadow.setAlpha(on ? 0.4 : 0.2).setY(on ? this.itemW * 0.45 : this.itemW * 0.3);
  }

  get layerCount(): number {
    return this.drawn;
  }

  override destroy(fromScene?: boolean): void {
    this.bob?.stop();
    this.scene?.tweens.killTweensOf([this, this.art, this.glow]);
    super.destroy(fromScene);
  }
}
