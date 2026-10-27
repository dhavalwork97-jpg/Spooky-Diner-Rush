import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * Small pooled burst effect (sparkles, smoke puffs, coin pops).
 * Dots are reused, never created per burst once the pool is warm.
 */
export class ParticlePool {
  private free: Phaser.GameObjects.Arc[] = [];
  private active = 0;

  constructor(private scene: Phaser.Scene, private maxActive = 60) {}

  burst(x: number, y: number, color: number, count = 8, radius = 36, duration = 450): void {
    if (SaveSystem.reduceMotion()) return;
    for (let i = 0; i < count && this.active < this.maxActive; i++) {
      const dot = this.free.pop() ?? this.scene.add.circle(0, 0, 4, color).setDepth(1000);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      dot.setFillStyle(color).setPosition(x, y).setAlpha(1).setScale(1).setVisible(true).setActive(true);
      this.active++;
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        alpha: 0,
        scale: 0.3,
        duration,
        ease: 'Quad.Out',
        onComplete: () => {
          dot.setVisible(false).setActive(false);
          this.free.push(dot);
          this.active--;
        },
      });
    }
  }

  destroy(): void {
    for (const d of this.free) d.destroy();
    this.free = [];
  }
}
