import Phaser from 'phaser';
import { AnimGuard, RestValues } from './guard';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * Reusable animation helpers. They only move visuals and never decide gameplay state.
 * Each helper is keyed so a repeated trigger restarts the effect instead of stacking.
 * Reduced motion removes shake, scale and travel, and keeps simple fades.
 */
export const animGuard = new AnimGuard();
const rest = new RestValues<{ a: number; b: number }>();

type Target = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & { alpha: number; setAlpha(value?: number): unknown };

const keyOf = (t: Target, kind: string, id?: string) => `${id ?? t.name ?? 'obj'}:${kind}`;

function run(scene: Phaser.Scene, key: string, config: Phaser.Types.Tweens.TweenBuilderConfig, restore: () => void): void {
  animGuard.start(key, () => {
    const tween = scene.tweens.add({
      ...config,
      onComplete: () => {
        restore();
        animGuard.finish(key);
      },
    });
    return {
      stop: () => {
        tween.stop();
        restore();
      },
    };
  });
}

/** Quick scale pop, used for tap feedback and item appearing. */
export function pop(scene: Phaser.Scene, target: Target, id?: string, peak = 1.12, duration = 180): void {
  if (SaveSystem.reduceMotion()) return;
  const key = keyOf(target, 'pop', id);
  const { a: sx, b: sy } = rest.of(key, { a: target.scaleX, b: target.scaleY });
  run(scene, key, {
    targets: target,
    scaleX: sx * peak,
    scaleY: sy * peak,
    duration: duration / 2,
    yoyo: true,
    ease: 'Back.Out',
  }, () => {
    target.setScale(sx, sy);
    rest.clear(key);
  });
  rest.set(key, { a: sx, b: sy });
}

/** Vertical bounce, used for "ready" items. */
export function bounce(scene: Phaser.Scene, target: Target, id?: string, height = 10, duration = 300): void {
  if (SaveSystem.reduceMotion()) return;
  const key = keyOf(target, 'bounce', id);
  const y = rest.of(key, { a: target.y, b: 0 }).a;
  run(scene, key, {
    targets: target,
    y: y - height,
    duration: duration / 2,
    yoyo: true,
    ease: 'Quad.Out',
  }, () => {
    target.y = y;
    rest.clear(key);
  });
  rest.set(key, { a: y, b: 0 });
}

/** Horizontal shake, used for invalid drops and danger. Skipped in reduced motion. */
export function shake(scene: Phaser.Scene, target: Target, id?: string, distance = 6, duration = 240): void {
  if (SaveSystem.reduceMotion()) return;
  const key = keyOf(target, 'shake', id);
  const x = rest.of(key, { a: target.x, b: 0 }).a;
  run(scene, key, {
    targets: target,
    x: { from: x - distance, to: x + distance },
    duration: duration / 6,
    yoyo: true,
    repeat: 2,
    ease: 'Sine.InOut',
  }, () => {
    target.x = x;
    rest.clear(key);
  });
  rest.set(key, { a: x, b: 0 });
}

/** Alpha pulse used as a glow. Reduced motion shows a steady glow instead of pulsing. */
export function glow(scene: Phaser.Scene, target: Target, id?: string, duration = 400): void {
  if (SaveSystem.reduceMotion()) {
    target.setAlpha(1);
    return;
  }
  run(scene, keyOf(target, 'glow', id), {
    targets: target,
    alpha: { from: 0.55, to: 1 },
    duration: duration / 2,
    yoyo: true,
    ease: 'Sine.InOut',
  }, () => target.setAlpha(1));
}

/** Fade the target to a value, then optionally run a callback. */
export function fade(scene: Phaser.Scene, target: Target, to: number, duration = 200, id?: string, done?: () => void): void {
  const d = SaveSystem.reduceMotion() ? 0 : duration;
  const key = keyOf(target, 'fade', id);
  animGuard.start(key, () => {
    const tween = scene.tweens.add({
      targets: target,
      alpha: to,
      duration: d,
      ease: 'Quad.Out',
      onComplete: () => {
        animGuard.finish(key);
        done?.();
      },
    });
    return { stop: () => tween.stop() };
  });
}

/** Move to a point. Reduced motion jumps straight there. */
export function moveTo(scene: Phaser.Scene, target: Target, x: number, y: number, duration = 300, id?: string, done?: () => void): void {
  if (SaveSystem.reduceMotion()) {
    target.setPosition(x, y);
    done?.();
    return;
  }
  const key = keyOf(target, 'move', id);
  animGuard.start(key, () => {
    const tween = scene.tweens.add({
      targets: target,
      x,
      y,
      duration,
      ease: 'Quad.Out',
      onComplete: () => {
        animGuard.finish(key);
        done?.();
      },
    });
    return { stop: () => tween.stop() };
  });
}
