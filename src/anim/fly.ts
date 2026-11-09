import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { pop } from './helpers';

/**
 * Shared flight animations, used by every restaurant scene so movement feels the same everywhere.
 * They only move visuals; the kitchen model has already decided what happened.
 */

/** Move `obj` to `to` along a gentle arc (a sine hump of `height` px) with smooth in-out easing. Reduced motion jumps straight there. */
export function arcTo(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Transform, to: { x: number; y: number }, ms: number, height: number, done?: () => void): void {
  if (SaveSystem.reduceMotion()) {
    obj.setPosition(to.x, to.y);
    done?.();
    return;
  }
  const x0 = obj.x;
  const y0 = obj.y;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: ms,
    ease: 'Sine.InOut',
    onUpdate: (t) => {
      const p = t.getValue() ?? 0;
      obj.setPosition(x0 + (to.x - x0) * p, y0 + (to.y - y0) * p - Math.sin(p * Math.PI) * height);
    },
    onComplete: () => {
      obj.setPosition(to.x, to.y);
      done?.();
    },
  });
}

/** A few coins arc from `from` into the HUD coin icon, which pops when the last one lands. */
export function flyCoins(scene: Phaser.Scene, coinIcon: Phaser.GameObjects.Image, from: { x: number; y: number }, count: number): void {
  const target = { x: coinIcon.x, y: coinIcon.y };
  for (let i = 0; i < count; i++) {
    scene.time.delayedCall(SaveSystem.reduceMotion() ? 0 : i * 70, () => {
      const coin = scene.add.image(from.x, from.y, 'coin').setDepth(1000);
      coin.setScale(30 / coin.width);
      arcTo(scene, coin, target, 480, 70, () => {
        coin.destroy();
        if (i === count - 1) pop(scene, coinIcon, 'coinicon', 1.25, 180);
      });
    });
  }
}
