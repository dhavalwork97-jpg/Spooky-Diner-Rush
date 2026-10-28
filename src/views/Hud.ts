import Phaser from 'phaser';
import type { KitchenState } from '../game/KitchenState';
import { INK, LEAF, MUSTARD, NAVY, ORANGE, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const D = 800;

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

  constructor(private scene: Phaser.Scene, state: KitchenState) {
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
    this.coinIcon = scene.add.image(1158, 44, 'coin').setScale(0.75).setDepth(D + 2);
    this.coinText = scene.add
      .text(1184, 44, String(state.coins), { fontFamily: FONT, fontSize: '28px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0, 0.5)
      .setDepth(D + 2);
  }

  /** Pop the badge when the level changes. */
  badgePop(): void {
    if (SaveSystem.reduceMotion()) return;
    this.scene.tweens.add({ targets: this.lvText, scale: 1.5, duration: 160, yoyo: true, ease: 'Back.Out' });
  }

  update(state: KitchenState, dtSec: number): void {
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
