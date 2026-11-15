import Phaser from 'phaser';
import { CREAM, INK, MUSTARD } from '../art/builders';
import type { ParticlePool } from '../anim/ParticlePool';
import type { ChestDef } from '../game/chests';
import { audio, type Sfx } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { dxKey, hasDinerArt } from './dinerArt';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const W = 440;
const H = 340;
/** After the chest is open the card waits this long before it closes by itself (a tap closes it sooner). */
export const CHEST_AUTO_CLOSE_MS = 3200;

/**
 * Milestone chest card. The game keeps running behind it (it never pauses). Tap the closed chest: it opens (glow, sparkles, coin burst),
 * the coins are paid through `onOpen`, and the card closes by itself after a moment or on a tap, then `onDone` runs.
 * Without the chest art (not loaded yet) a code-drawn chest stands in, so a claim can never get stuck.
 */
export class ChestCard {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private reward: Phaser.GameObjects.Text;
  private glow: Phaser.GameObjects.Ellipse;
  private img?: Phaser.GameObjects.Image;
  private fallback: Phaser.GameObjects.Graphics;
  private state: 'hidden' | 'closed' | 'open' = 'hidden';
  private def?: ChestDef;
  private onOpen?: (c: ChestDef) => string[];
  private onDone?: () => void;
  private timer?: Phaser.Time.TimerEvent;

  constructor(private scene: Phaser.Scene, private fx: ParticlePool, private x: number, private y: number, private sfx: Sfx = 'chest') {
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-W / 2 + 4, -H / 2 + 10, W, H, 26);
    bg.fillStyle(CREAM, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 26);
    bg.lineStyle(6, INK, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 26);
    this.title = scene.add.text(0, -H / 2 + 38, '', { fontFamily: FONT, fontSize: '38px', fontStyle: '700', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5);
    this.glow = scene.add.ellipse(0, 20, 300, 200, 0xffd45a, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.fallback = scene.add.graphics().setVisible(false);
    this.prompt = scene.add.text(0, H / 2 - 36, 'Tap to open!', { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' }).setOrigin(0.5);
    this.reward = scene.add.text(0, H / 2 - 46, '', { fontFamily: FONT, fontSize: '28px', fontStyle: '700', color: '#B8730F', align: 'center' }).setOrigin(0.5).setVisible(false);
    this.box = scene.add.container(x, y, [bg, this.glow, this.fallback, this.title, this.prompt, this.reward]).setDepth(965).setVisible(false).setAlpha(0);
    this.box.setSize(W, H).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tapped());
  }

  /** Shows the chest. `onOpen` pays the reward and returns the lines to show (for example "+100 coins"). `onDone` runs when the card is gone. */
  show(def: ChestDef, onOpen: (c: ChestDef) => string[], onDone: () => void): void {
    this.def = def;
    this.onOpen = onOpen;
    this.onDone = onDone;
    this.state = 'closed';
    this.timer?.remove();
    this.title.setText(def.title);
    this.prompt.setVisible(true);
    this.reward.setVisible(false);
    this.glow.setFillStyle(0xffd45a, 0);
    this.setChestArt(false);
    this.scene.tweens.killTweensOf([this.box, this.glow]);
    this.box.setVisible(true).setAlpha(1).setScale(1);
    audio.play('click');
    if (!SaveSystem.reduceMotion()) {
      this.box.setScale(0.6);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 300, ease: 'Back.Out' });
      this.glow.setFillStyle(0xffd45a, 0.10);
      this.scene.tweens.add({ targets: this.glow, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
    } else {
      this.glow.setFillStyle(0xffd45a, 0.10);
    }
  }

  private setChestArt(open: boolean): void {
    const name = open ? 'chest_open' : 'chest_closed';
    if (hasDinerArt(this.scene, name)) {
      this.fallback.setVisible(false);
      if (!this.img) {
        this.img = this.scene.add.image(0, 78, dxKey(name)).setOrigin(0.5, 1);
        this.box.addAt(this.img, 3);
      }
      this.img.setTexture(dxKey(name));
      this.img.setScale((open ? 150 : 150) / this.img.height).setVisible(true);
    } else {
      this.img?.setVisible(false);
      this.fallback.clear().setVisible(true);
      this.fallback.fillStyle(0x8a4b1f, 1).fillRoundedRect(-80, open ? 10 : 20, 160, 80, 12);
      this.fallback.fillStyle(MUSTARD, 1).fillRect(-8, open ? 10 : 20, 16, 80);
      this.fallback.lineStyle(5, INK, 1).strokeRoundedRect(-80, open ? 10 : 20, 160, 80, 12);
    }
  }

  private tapped(): void {
    if (this.state === 'closed') this.open();
    else if (this.state === 'open') this.close();
  }

  private open(): void {
    if (!this.def || !this.onOpen) return;
    this.state = 'open';
    const lines = this.onOpen(this.def);
    this.setChestArt(true);
    this.prompt.setVisible(false);
    this.reward.setText(lines.join('\n')).setVisible(true);
    audio.play(this.sfx);
    const gx = this.x;
    const gy = this.y + 20;
    if (!SaveSystem.reduceMotion()) {
      this.glow.setFillStyle(0xffd45a, 0.22);
      this.scene.tweens.killTweensOf(this.glow);
      this.scene.tweens.add({ targets: this.glow, alpha: { from: 1, to: 0.7 }, scale: { from: 1.15, to: 1 }, duration: 500 });
      this.fx.burst(gx, gy, 0xfff1b8, 16, 120, 800);
      this.fx.burst(gx, gy, MUSTARD, 14, 90, 650);
      if (this.img) this.scene.tweens.add({ targets: this.img, scaleX: this.img.scaleX * 1.06, scaleY: this.img.scaleY * 1.06, duration: 140, yoyo: true });
    }
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(CHEST_AUTO_CLOSE_MS, () => this.close());
  }

  private close(): void {
    if (this.state !== 'open') return;
    this.state = 'hidden';
    this.timer?.remove();
    this.scene.tweens.killTweensOf([this.box, this.glow]);
    const done = this.onDone;
    this.scene.tweens.add({
      targets: this.box,
      alpha: 0,
      duration: SaveSystem.reduceMotion() ? 0 : 200,
      onComplete: () => {
        this.box.setVisible(false);
        done?.();
      },
    });
  }

  get isShowing(): boolean {
    return this.state !== 'hidden';
  }
  get opened(): boolean {
    return this.state === 'open';
  }
  /** The tap target's centre, for tests and the debug hook. */
  get center(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
  /** Same as tapping the card (used by the debug hook). */
  tap(): void {
    this.tapped();
  }
  destroy(): void {
    this.timer?.remove();
    this.box.destroy();
  }
}
