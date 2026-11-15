import Phaser from 'phaser';
import { CREAM, INK, MUSTARD } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { INTRO_GLOW_MS } from '../game/intros';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';

/** "New: <station>!" card. Not interactive and it never pauses the game: it fades by itself. */
export class IntroCard {
  private box: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private bg?: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.text = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '32px', fontStyle: '700', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 5 }).setOrigin(0.5);
    this.box = scene.add.container(x, y).setDepth(940).setAlpha(0);
    this.box.add(this.text);
  }

  private resize(w: number): void {
    this.bg?.destroy();
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 3, -30 + 6, w, 64, 22);
    g.fillStyle(CREAM, 1).fillRoundedRect(-w / 2, -32, w, 64, 22);
    g.lineStyle(5, INK, 1).strokeRoundedRect(-w / 2, -32, w, 64, 22);
    this.bg = g;
    this.box.addAt(g, 0);
  }

  show(message: string, ms = INTRO_GLOW_MS): void {
    this.text.setText(message);
    this.resize(Math.max(300, Math.ceil(this.text.width) + 64));
    this.scene.tweens.killTweensOf(this.box);
    this.box.setAlpha(1).setScale(1);
    if (!SaveSystem.reduceMotion()) {
      this.box.setScale(0.8);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 220, ease: 'Back.Out' });
    }
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(ms, () => this.scene.tweens.add({ targets: this.box, alpha: 0, duration: SaveSystem.reduceMotion() ? 0 : 300 }));
  }

  get visible(): boolean {
    return this.box.alpha > 0.01;
  }
  get message(): string {
    return this.text.text;
  }
  destroy(): void {
    this.timer?.remove();
    this.box.destroy();
  }
}

/** Soft pulsing outline around newly unlocked stations. Ends after `INTRO_GLOW_MS` or when the player taps one of them. */
export class IntroGlow {
  private g: Phaser.GameObjects.Graphics;
  private rects = new Map<string, Phaser.Geom.Rectangle>();
  private timer?: Phaser.Time.TimerEvent;
  private startedAt = 0;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(590).setVisible(false);
  }

  show(zones: { id: string; rect: { x: number; y: number; width: number; height: number } }[], ms = INTRO_GLOW_MS): void {
    this.rects.clear();
    for (const z of zones) this.rects.set(z.id, new Phaser.Geom.Rectangle(z.rect.x, z.rect.y, z.rect.width, z.rect.height));
    if (this.rects.size === 0) return;
    this.startedAt = this.scene.time.now;
    this.g.setVisible(true);
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(ms, () => this.hide());
    this.draw();
  }

  /** The player tapped a station: its glow goes (all of them when it was one of the glowing ones, which keeps the screen calm). */
  tapped(zoneId: string): void {
    if (this.rects.has(zoneId)) this.hide();
  }

  hide(): void {
    this.timer?.remove();
    this.rects.clear();
    this.g.clear().setVisible(false);
  }

  get active(): boolean {
    return this.rects.size > 0;
  }

  /** Redraw the pulse. Call every frame while `active` (a static ring when motion is reduced). */
  update(now: number): void {
    if (this.rects.size > 0) this.draw(now);
  }

  private draw(now = this.scene.time.now): void {
    const pulse = SaveSystem.reduceMotion() ? 1 : 0.6 + 0.4 * Math.sin((now - this.startedAt) / 220);
    this.g.clear();
    for (const r of this.rects.values()) {
      this.g.lineStyle(10, MUSTARD, 0.28 * pulse).strokeRoundedRect(r.x - 6, r.y - 6, r.width + 12, r.height + 12, 18);
      this.g.lineStyle(5, MUSTARD, 0.95 * pulse).strokeRoundedRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4, 14);
    }
  }

  destroy(): void {
    this.timer?.remove();
    this.g.destroy();
  }
}
