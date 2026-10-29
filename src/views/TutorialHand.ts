import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * Pointer hand for the tutorial. It taps in place, or drags from an item to a customer.
 * It only follows hints computed from the model and never changes gameplay.
 */
export class TutorialHand {
  private hand: Phaser.GameObjects.Image;
  private tween?: Phaser.Tweens.Tween;
  private current = '';

  constructor(private scene: Phaser.Scene) {
    this.hand = scene.add.image(0, 0, 'hand').setScale(0.5).setOrigin(0.3, 0.05).setDepth(1200).setVisible(false);
  }

  hide(): void {
    this.hand.setVisible(false);
    this.tween?.stop();
    this.current = '';
  }

  /** Point at a spot (tap) or move between two spots (drag). */
  point(key: string, from: { x: number; y: number }, to?: { x: number; y: number }): void {
    if (key === this.current) return;
    this.current = key;
    this.tween?.stop();
    this.hand.setVisible(true).setAlpha(1).setPosition(from.x, from.y);
    if (SaveSystem.reduceMotion()) {
      if (to) this.hand.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2);
      return;
    }
    if (to) {
      this.tween = this.scene.tweens.add({
        targets: this.hand,
        x: to.x,
        y: to.y,
        duration: 1100,
        hold: 350,
        repeat: -1,
        ease: 'Sine.InOut',
        onRepeat: () => this.hand.setPosition(from.x, from.y),
      });
    } else {
      this.tween = this.scene.tweens.add({
        targets: this.hand,
        y: from.y + 16,
        scale: 0.44,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
  }

  destroy(): void {
    this.tween?.stop();
    this.hand.destroy();
  }
}
