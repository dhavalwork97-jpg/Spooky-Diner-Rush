import Phaser from 'phaser';
import { CREAM, INK } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import type { Layout } from './layout';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const DEPTH = 640;

/**
 * Where the chef stands, in source-image pixels (1699 x 926). The cream strip right of the
 * grill holds no tap zone, and the bubble sits on the floor band above the grill (also no
 * zone), so neither covers a station. Nothing here is interactive: taps pass through.
 */
const CHEF_X = 1632;
const CHEF_BOTTOM = 560;
const CHEF_WIDTH = 130;
const BUBBLE_RIGHT = 1690;
const BUBBLE_BOTTOM = 402;
const MAX_TEXT_SRC = 380;

/** The chef and a speech bubble. Read-only view: it shows lines it is given and decides nothing. */
export class ChefBubble {
  private chef: Phaser.GameObjects.Image;
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private tailX: number;
  private msg = '';

  constructor(private scene: Phaser.Scene, layout: Layout) {
    this.chef = scene.add.image(layout.x(CHEF_X), layout.y(CHEF_BOTTOM), 'chef').setOrigin(0.5, 1).setDepth(DEPTH);
    layout.fit(this.chef, CHEF_WIDTH);
    this.tailX = layout.x(CHEF_X) - layout.x(BUBBLE_RIGHT);
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#2B1B17',
        align: 'center',
        wordWrap: { width: layout.s(MAX_TEXT_SRC) },
      })
      .setOrigin(0.5);
    this.box = scene.add.container(layout.x(BUBBLE_RIGHT), layout.y(BUBBLE_BOTTOM), [this.bg, this.label]).setDepth(DEPTH + 1).setVisible(false).setAlpha(0);
  }

  /** Show a line for `holdSec` seconds. A new line replaces the current one. */
  show(text: string, holdSec: number): void {
    this.msg = text;
    this.label.setText(text);
    const w = Math.ceil(this.label.width) + 36;
    const h = Math.ceil(this.label.height) + 22;
    // the box origin is its bottom-right corner, so the bubble grows left and up
    this.label.setPosition(-w / 2, -h / 2 - 4);
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(-w + 3, -h - 4 + 6, w, h, 16);
    g.fillStyle(CREAM, 1).fillRoundedRect(-w, -h - 4, w, h, 16);
    g.lineStyle(4, INK, 1).strokeRoundedRect(-w, -h - 4, w, h, 16);
    // tail pointing down at the chef; clamped so it stays on the bubble
    const tx = Math.max(-w + 24, Math.min(-12, this.tailX));
    g.fillStyle(CREAM, 1).fillTriangle(tx - 9, -6, tx + 9, -6, tx, 10);
    g.lineStyle(4, INK, 1).lineBetween(tx - 9, -4, tx, 10).lineBetween(tx + 9, -4, tx, 10);
    g.fillStyle(CREAM, 1).fillRect(tx - 7, -8, 14, 6);

    this.timer?.remove();
    this.scene.tweens.killTweensOf(this.box);
    this.box.setVisible(true).setAlpha(1);
    if (!SaveSystem.reduceMotion()) {
      this.box.setAlpha(0);
      this.scene.tweens.add({ targets: this.box, alpha: 1, duration: 120 });
    }
    this.timer = this.scene.time.delayedCall(holdSec * 1000, () => this.hide());
  }

  /** Show or hide the chef himself (hidden while a story card shows its own chef). */
  setChefVisible(visible: boolean): void {
    this.chef.setVisible(visible);
  }

  hide(): void {
    this.timer?.remove();
    this.scene.tweens.killTweensOf(this.box);
    if (SaveSystem.reduceMotion()) {
      this.box.setVisible(false).setAlpha(0);
      return;
    }
    this.scene.tweens.add({ targets: this.box, alpha: 0, duration: 160, onComplete: () => this.box.setVisible(false) });
  }

  get isShowing(): boolean {
    return this.box.visible && this.box.alpha > 0.01;
  }
  get text(): string {
    return this.isShowing ? this.msg : '';
  }
}
