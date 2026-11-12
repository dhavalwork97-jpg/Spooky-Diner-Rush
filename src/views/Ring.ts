import Phaser from 'phaser';
import type { CookPhase } from '../game/cook';
import { INK, LEAF, MUSTARD, ORANGE, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * Radial progress indicator. It only draws what the model says:
 * orange while cooking, green with a tick when ready, then a pulsing
 * mustard (warning) and red (danger) ring. Hidden when the item is burnt, unless the ring was made with `showBurnt`
 * (the Taco Truck pans and ovens): then a burnt item shows a dark disc with a red cross, which no other phase looks like.
 */
export class Ring extends Phaser.GameObjects.Graphics {
  constructor(scene: Phaser.Scene, x: number, y: number, private radius = 22, private showBurnt = false) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.setDepth(600).setVisible(false);
  }

  show(phase: CookPhase | null, progress: number, now: number): void {
    if (phase === null || (phase === 'burnt' && !this.showBurnt)) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);
    this.clear();
    const r = this.radius;
    const reduce = SaveSystem.reduceMotion();
    if (phase === 'burnt') {
      // burnt: dark disc, solid red rim, cream cross (shape as well as colour; never looks like progress)
      this.fillStyle(INK, 0.94).fillCircle(0, 0, r + 6);
      this.lineStyle(7, TOMATO, 1).strokeCircle(0, 0, r);
      const k = r * 0.42;
      this.lineStyle(6, 0xfff4dc, 1).beginPath().moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k).strokePath();
      return;
    }
    this.fillStyle(0xfff4dc, 0.9).fillCircle(0, 0, r + 6);
    this.lineStyle(6, INK, 0.25).strokeCircle(0, 0, r);
    if (phase === 'cooking') {
      this.lineStyle(7, ORANGE, 1);
      this.beginPath();
      this.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, progress), false);
      this.strokePath();
      return;
    }
    const pulse = reduce ? 1 : 0.65 + 0.35 * Math.sin(now / (phase === 'danger' ? 90 : 220));
    const color = phase === 'ready' ? LEAF : phase === 'warning' ? MUSTARD : TOMATO;
    this.lineStyle(7, color, phase === 'ready' ? 1 : pulse).strokeCircle(0, 0, r);
    if (phase === 'ready') {
      this.lineStyle(6, LEAF, 1);
      this.beginPath().moveTo(-9, 1).lineTo(-2, 8).lineTo(10, -8).strokePath();
    } else {
      // exclamation mark: shape as well as color
      this.lineStyle(5, color, 1).beginPath().moveTo(0, -10).lineTo(0, 3).strokePath();
      this.fillStyle(color, 1).fillCircle(0, 10, 3);
    }
  }
}
