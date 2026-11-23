import Phaser from 'phaser';
import { DAILY_SERVES, type DailyProgress } from '../game/dailyGoal';
import { GoalBannerTimer } from '../game/goalBannerTiming';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const W = 330;
const H = 56;
const CREAM = 0xfff4dc;
const INK = 0x2b1b17;

/**
 * The small daily plate ("Serve 5 customers in each restaurant today"). Same fade rules as the mini-goal banner (Part C): it shows for a while when
 * a scene opens, comes back for a moment when a serve is counted or the reward is paid, and never sits under a popup.
 */
export class DailyGoalPlate {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private line: Phaser.GameObjects.Text;
  private timer = new GoalBannerTimer();
  private shown = '';

  constructor(scene: Phaser.Scene, x = 640, y = 116) {
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.22).fillRoundedRect(-W / 2 + 3, -H / 2 + 6, W, H, 16);
    bg.fillStyle(CREAM, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 16);
    bg.lineStyle(4, INK, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 16);
    this.title = scene.add.text(0, -11, '', { fontFamily: FONT, fontSize: '17px', color: '#2B1B17' }).setOrigin(0.5);
    this.line = scene.add.text(0, 12, '', { fontFamily: FONT, fontSize: '16px', color: '#6B3E12' }).setOrigin(0.5);
    this.box = scene.add.container(x, y, [bg, this.title, this.line]).setDepth(860).setVisible(false);
  }

  /** Call every frame. `claimed` rising (0 to 1) counts as a completed goal for the fade timer. */
  update(p: DailyProgress, ctx: { dtMs: number; claimed: boolean; blocked: boolean }): void {
    const frame = this.timer.update(ctx.dtMs, { key: p.rows.length > 0 ? 'daily' : null, progress: p.have, completed: ctx.claimed ? 1 : 0, blocked: ctx.blocked, reduceMotion: SaveSystem.reduceMotion() });
    if (p.rows.length === 0 || !frame.visible) {
      this.box.setVisible(false);
      return;
    }
    this.box.setVisible(true).setAlpha(frame.alpha);
    const text = ctx.claimed ? 'Daily goal done!' : `Serve ${DAILY_SERVES} customers in each restaurant today`;
    const line = p.rows.map((r) => `${r.short} ${r.count}/${DAILY_SERVES}`).join('   ');
    const key = `${text}|${line}`;
    if (key === this.shown) return;
    this.shown = key;
    this.title.setText(text).setScale(Math.min(1, (W - 20) / Math.max(1, this.title.width)));
    this.line.setText(line).setColor(ctx.claimed ? '#2E8B3E' : '#6B3E12').setScale(Math.min(1, (W - 20) / Math.max(1, this.line.width)));
  }

  get visible(): boolean {
    return this.box.visible;
  }
  get text(): string {
    return `${this.title.text} ${this.line.text}`;
  }
  destroy(): void {
    this.box.destroy();
  }
}
