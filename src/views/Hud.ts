import Phaser from 'phaser';
import { CREAM, INK, LEAF, MUSTARD, NAVY, ORANGE, TOMATO } from '../art/builders';
import type { Goal } from '../game/goals';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const D = 800;

/** What the HUD reads. The diner's `KitchenState` and the Taco Truck's `TacoKitchenState` both fit, so every restaurant shares this one HUD. */
export interface HudSource {
  level: number;
  xp: number;
  xpNeeded: number;
  coins: number;
  reputation: number;
  combo: number;
  comboMultiplier: number;
  cfg: { combo: { maxCombo: number } };
}

/** Level badge ("Lv N" only), XP bar, reputation bar, coin counter. Read-only view of the model. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private lvText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;
  readonly coinIcon: Phaser.GameObjects.Image;
  private xpShown = 0; // 0..1, eased
  private shownLevel: number;
  private coinsShown: number;
  private levelAnim = false;
  private comboText: Phaser.GameObjects.Text;
  private comboShown = 0;

  constructor(private scene: Phaser.Scene, state: HudSource) {
    this.g = scene.add.graphics().setDepth(D);
    this.shownLevel = state.level;
    this.coinsShown = state.coins;
    this.xpShown = state.xp / state.xpNeeded;
    this.lvText = scene.add
      .text(58, 54, `Lv ${state.level}`, { fontFamily: FONT, fontSize: '26px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(D + 2);
    scene.add
      .text(118, 84, 'Reputation', { fontFamily: FONT, fontSize: '18px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 4 })
      .setOrigin(0, 0.5)
      .setDepth(D + 2);
    this.comboText = scene.add
      .text(960, 80, '', { fontFamily: FONT, fontSize: '18px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 4 })
      .setOrigin(0, 0.5)
      .setDepth(D + 2)
      .setAlpha(0);
    this.coinIcon = scene.add.image(1158, 44, 'coin').setDepth(D + 2);
    this.coinIcon.setScale(44 / this.coinIcon.width);
    this.coinText = scene.add
      .text(1184, 44, String(state.coins), { fontFamily: FONT, fontSize: '28px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0, 0.5)
      .setDepth(D + 2);
  }

  /** Pop the combo label when it grows. */
  comboPop(combo: number): void {
    if (combo > this.comboShown && !SaveSystem.reduceMotion()) {
      this.scene.tweens.add({ targets: this.comboText, scale: 1.3, duration: 120, yoyo: true, ease: 'Back.Out' });
    }
    this.comboShown = combo;
  }

  /** Pop the badge when the level changes. */
  badgePop(): void {
    if (SaveSystem.reduceMotion()) return;
    this.scene.tweens.add({ targets: this.lvText, scale: 1.5, duration: 160, yoyo: true, ease: 'Back.Out' });
  }

  update(state: HudSource, dtSec: number): void {
    // XP bar fills smoothly; on a level change it fills to the end, then restarts
    const target = state.xp / state.xpNeeded;
    if (state.level !== this.shownLevel) {
      this.levelAnim = true;
      this.xpShown = Math.min(1, this.xpShown + dtSec * 1.6);
      if (this.xpShown >= 1) {
        this.shownLevel = state.level;
        this.xpShown = 0;
        this.levelAnim = false;
        this.lvText.setText(`Lv ${state.level}`);
      }
    } else {
      const k = 1 - Math.pow(0.0005, dtSec);
      this.xpShown += (target - this.xpShown) * k;
    }
    // coins count up
    if (this.coinsShown !== state.coins) {
      const diff = state.coins - this.coinsShown;
      this.coinsShown += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dtSec * 8)));
      if (Math.abs(state.coins - this.coinsShown) < 1) this.coinsShown = state.coins;
      this.coinText.setText(String(this.coinsShown));
    }

    const g = this.g;
    g.clear();
    // badge
    g.fillStyle(0x000000, 0.2).fillCircle(58, 60, 38);
    g.fillStyle(NAVY, 1).fillCircle(58, 54, 38);
    g.lineStyle(5, MUSTARD, 1).strokeCircle(58, 54, 38);
    g.lineStyle(3, INK, 1).strokeCircle(58, 54, 42);
    // xp bar
    this.bar(g, 104, 40, 220, 22, this.xpShown, ORANGE);
    // reputation bar
    const rep = state.reputation / 100;
    this.bar(g, 104, 68, 220, 8, 1, 0x000000, 0.0);
    this.bar(g, 104, 96, 220, 14, rep, rep > 0.5 ? LEAF : rep > 0.2 ? MUSTARD : TOMATO);
    // combo meter: one segment per step, with the current multiplier
    const comboOn = state.combo > 0;
    this.comboText.setAlpha(comboOn ? 1 : 0).setText(comboOn ? `Combo x${state.comboMultiplier.toFixed(1)}` : '');
    if (comboOn) {
      const max = state.cfg.combo.maxCombo;
      const segW = 190 / max;
      for (let i = 0; i < max; i++) {
        const on = i < state.combo;
        g.fillStyle(on ? ORANGE : 0x3b2a24, 1).fillRoundedRect(960 + i * segW + 1, 94, segW - 3, 10, 4);
        g.lineStyle(2, INK, 1).strokeRoundedRect(960 + i * segW + 1, 94, segW - 3, 10, 4);
      }
    }
    void this.levelAnim;
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number, alpha = 1): void {
    if (alpha === 0) return;
    g.fillStyle(0x000000, 0.25).fillRoundedRect(x, y + 3, w, h, h / 2);
    g.fillStyle(0x3b2a24, 1).fillRoundedRect(x, y, w, h, h / 2);
    const fw = Math.max(h, w * Math.max(0, Math.min(1, frac)));
    if (frac > 0.001) g.fillStyle(color, alpha).fillRoundedRect(x, y, fw, h, h / 2);
    g.lineStyle(3, INK, 1).strokeRoundedRect(x, y, w, h, h / 2);
  }
}

const GOAL_W = 290;
const GOAL_H = 54;

/**
 * The active mini-goal as a compact cream plate in the empty top-middle strip, between the event banner (to its left) and the combo
 * meter (to its right), so it never covers order bubbles or station buttons. Read-only: it shows what `GoalTracker` says.
 */
export class GoalBanner {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private shownKey = '';
  private shownProgress = -1;

  constructor(private scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.22).fillRoundedRect(-GOAL_W / 2 + 3, -GOAL_H / 2 + 6, GOAL_W, GOAL_H, 18);
    bg.fillStyle(CREAM, 1).fillRoundedRect(-GOAL_W / 2, -GOAL_H / 2, GOAL_W, GOAL_H, 18);
    bg.lineStyle(4, INK, 1).strokeRoundedRect(-GOAL_W / 2, -GOAL_H / 2, GOAL_W, GOAL_H, 18);
    this.title = scene.add.text(0, -8, '', { fontFamily: FONT, fontSize: '21px', color: '#2B1B17' }).setOrigin(0.5);
    this.bar = scene.add.graphics();
    this.box = scene.add.container(795, 42, [bg, this.title, this.bar]).setDepth(861).setVisible(false);
  }

  /** Show `goal` (null hides the banner). Cheap to call every frame: it only redraws when the goal or its progress changes. */
  update(goal: Goal | null): void {
    if (!goal) {
      this.box.setVisible(false);
      this.shownKey = '';
      return;
    }
    const key = `${goal.text}`;
    const progress = Math.min(goal.progress, goal.target);
    if (key === this.shownKey && progress === this.shownProgress && this.box.visible) return;
    const fresh = key !== this.shownKey || !this.box.visible;
    this.shownKey = key;
    this.shownProgress = progress;
    this.box.setVisible(true);
    this.title.setText(goal.kind === 'fastRow' || goal.kind === 'item' || goal.kind === 'orders' ? `${goal.text}  ${progress}/${goal.target}` : goal.text);
    // Long texts shrink to fit the plate instead of spilling over its edge.
    this.title.setScale(Math.min(1, (GOAL_W - 28) / Math.max(1, this.title.width)));
    this.bar.clear();
    const bw = GOAL_W - 44;
    const frac = Math.max(0, Math.min(1, progress / goal.target));
    this.bar.fillStyle(0x3b2a24, 1).fillRoundedRect(-bw / 2, 10, bw, 9, 4.5);
    if (frac > 0.001) this.bar.fillStyle(ORANGE, 1).fillRoundedRect(-bw / 2, 10, Math.max(9, bw * frac), 9, 4.5);
    this.bar.lineStyle(2, INK, 1).strokeRoundedRect(-bw / 2, 10, bw, 9, 4.5);
    if (fresh && !SaveSystem.reduceMotion()) {
      this.scene.tweens.killTweensOf(this.box);
      this.box.setScale(0.85);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 180, ease: 'Back.Out' });
    }
  }

  get visible(): boolean {
    return this.box.visible;
  }
  get text(): string {
    return this.title.text;
  }

  destroy(): void {
    this.box.destroy();
  }
}
