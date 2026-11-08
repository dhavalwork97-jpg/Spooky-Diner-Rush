import Phaser from 'phaser';
import { CREAM, INK, MUSTARD, ORANGE } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import type { ParticlePool } from '../anim/ParticlePool';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';

const panel = (scene: Phaser.Scene, w: number, h: number) => {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 24);
  g.fillStyle(CREAM, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 24);
  g.lineStyle(5, INK, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
  return g;
};

/** Short "invalid action" popup (1.5s, no penalty). One at a time. */
export class Toast {
  private box: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private bg?: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.text = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0.5);
    this.box = scene.add.container(x, y).setDepth(950).setAlpha(0);
    this.box.add(this.text);
    this.resize(340);
  }

  /** Redraw the cream panel at `w` wide, behind the text. */
  private resize(w: number): void {
    this.bg?.destroy();
    this.bg = panel(this.scene, w, 58);
    this.box.addAt(this.bg, 0);
  }

  show(message: string): void {
    this.text.setText(message);
    this.resize(Math.max(340, Math.ceil(this.text.width) + 56)); // the panel always fits the message
    this.box.setAlpha(1).setScale(1);
    this.scene.tweens.killTweensOf(this.box);
    if (!SaveSystem.reduceMotion()) {
      this.box.setScale(0.85);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 160, ease: 'Back.Out' });
    }
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(1500, () => {
      this.scene.tweens.add({ targets: this.box, alpha: 0, duration: SaveSystem.reduceMotion() ? 0 : 200 });
    });
  }

  get visible(): boolean {
    return this.box.alpha > 0.01;
  }
  get message(): string {
    return this.text.text;
  }
}

/** Level-up card with unlock lines. 2 to 3 seconds, tap to skip, never blocks play. */
export class LevelUpCard {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private queue: { level: number; coins: number; unlocks: string[]; title?: string }[] = [];
  private showing = false;

  constructor(private scene: Phaser.Scene, private fx: ParticlePool, x: number, y: number, private onDone?: () => void) {
    this.title = scene.add
      .text(0, -52, '', { fontFamily: FONT, fontSize: '56px', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 8 })
      .setOrigin(0.5);
    this.lines = scene.add.text(0, 30, '', { fontFamily: FONT, fontSize: '28px', color: '#2B1B17', align: 'center' }).setOrigin(0.5);
    this.box = scene.add.container(x, y).setDepth(960).setAlpha(0).setVisible(false);
    const p = panel(scene, 420, 210);
    this.box.add([p, this.title, this.lines]);
    this.box.setSize(420, 210).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.hide());
  }

  /** `title` is the new career title when this level crosses into one. */
  show(level: number, coins: number, unlocks: string[], title?: string): void {
    this.queue.push({ level, coins, unlocks, title });
    if (!this.showing) this.next();
  }

  private next(): void {
    const item = this.queue.splice(0, 1)[0];
    if (!item) {
      const wasShowing = this.showing;
      this.showing = false;
      if (wasShowing) this.onDone?.(); // the last card is gone: a calm moment
      return;
    }
    this.showing = true;
    this.title.setText(`Lv ${item.level}!`);
    const unlockLines = item.unlocks.map((u) => `New: ${u}`);
    const titleLine = item.title ? [`New title: ${item.title}`] : [];
    this.lines.setText([...titleLine, ...unlockLines, `+${item.coins} coins`].join('\n'));
    this.box.setVisible(true).setAlpha(1).setScale(1);
    this.scene.tweens.killTweensOf(this.box);
    audio.play('levelUp');
    if (!SaveSystem.reduceMotion()) {
      this.box.setScale(0.4);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 320, ease: 'Back.Out' });
      this.fx.burst(this.box.x, this.box.y - 40, MUSTARD, 14, 120, 700);
      this.fx.burst(this.box.x, this.box.y - 40, ORANGE, 10, 90, 600);
    }
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(2600, () => this.hide());
  }

  private hide(): void {
    this.timer?.remove();
    this.scene.tweens.killTweensOf(this.box);
    this.scene.tweens.add({
      targets: this.box,
      alpha: 0,
      duration: SaveSystem.reduceMotion() ? 0 : 180,
      onComplete: () => {
        this.box.setVisible(false);
        this.next();
      },
    });
  }

  get isShowing(): boolean {
    return this.box.visible && this.box.alpha > 0.01;
  }
}

/** Full-screen overlay used for "Closed" (with a Reopen button) and "Paused". */
export class Overlay {
  private root: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private button: Phaser.GameObjects.Container;
  private buttonText: Phaser.GameObjects.Text;
  private onPress: (() => void) | null = null;
  private extra: Phaser.GameObjects.Container;
  private extraText: Phaser.GameObjects.Text;
  private onExtra: (() => void) | null = null;

  constructor(private scene: Phaser.Scene, w: number, h: number) {
    const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x1a0f0c, 0.72).setInteractive();
    this.title = scene.add
      .text(w / 2, h / 2 - 110, '', { fontFamily: FONT, fontSize: '72px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 10 })
      .setOrigin(0.5);
    this.sub = scene.add.text(w / 2, h / 2 - 40, '', { fontFamily: FONT, fontSize: '28px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5, align: 'center' }).setOrigin(0.5);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-150, -38, 300, 92, 20);
    g.fillStyle(0xc4661a, 1).fillRoundedRect(-150, -44, 300, 92, 20);
    g.fillStyle(ORANGE, 1).fillRoundedRect(-150, -48, 300, 88, 20);
    g.lineStyle(5, INK, 1).strokeRoundedRect(-150, -48, 300, 88, 20);
    this.buttonText = scene.add.text(0, -4, '', { fontFamily: FONT, fontSize: '40px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5);
    this.button = scene.add.container(w / 2, h / 2 + 70, [g, this.buttonText]).setSize(300, 92).setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', () => {
      this.button.setScale(0.94);
    });
    this.button.on('pointerup', () => {
      this.button.setScale(1);
      audio.play('click');
      this.onPress?.();
    });
    this.button.on('pointerout', () => this.button.setScale(1));
    // Optional second button (a rewarded ad offer): wider, calmer colour, only shown when `show` is given one.
    const eg = scene.add.graphics();
    eg.fillStyle(0x000000, 0.25).fillRoundedRect(-230, -30, 460, 80, 18);
    eg.fillStyle(0x2f7d4f, 1).fillRoundedRect(-230, -36, 460, 76, 18);
    eg.lineStyle(5, INK, 1).strokeRoundedRect(-230, -36, 460, 76, 18);
    this.extraText = scene.add.text(0, 2, '', { fontFamily: FONT, fontSize: '30px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 }).setOrigin(0.5);
    this.extra = scene.add.container(w / 2, h / 2 + 190, [eg, this.extraText]).setSize(460, 76).setInteractive({ useHandCursor: true }).setVisible(false);
    this.extra.on('pointerdown', () => this.extra.setScale(0.96));
    this.extra.on('pointerout', () => this.extra.setScale(1));
    this.extra.on('pointerup', () => {
      this.extra.setScale(1);
      audio.play('click');
      this.onExtra?.();
    });
    this.root = scene.add.container(0, 0, [dim, this.title, this.sub, this.button, this.extra]).setDepth(1500).setVisible(false);
  }

  show(title: string, sub: string, buttonLabel: string, onPress: () => void, extra?: { label: string; onPress: () => void }): void {
    this.extra.setVisible(!!extra);
    if (extra) {
      this.extraText.setText(extra.label);
      this.onExtra = extra.onPress;
    }
    this.title.setText(title);
    this.sub.setText(sub);
    this.buttonText.setText(buttonLabel);
    this.onPress = onPress;
    this.root.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: SaveSystem.reduceMotion() ? 0 : 250 });
  }

  setSub(text: string): void {
    this.sub.setText(text);
  }

  hide(): void {
    this.root.setVisible(false);
  }

  get visible(): boolean {
    return this.root.visible;
  }
}

/** Banner for the running event (lunch rush, double coins...) with a countdown bar. */
export class EventBanner {
  private box: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private total = 1;
  private active = false;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.title = scene.add.text(0, -8, '', { fontFamily: FONT, fontSize: '19px', color: '#2B1B17' }).setOrigin(0.5);
    this.bar = scene.add.graphics();
    this.box = scene.add.container(x, y).setDepth(860).setAlpha(0);
    this.box.add([panel(scene, 146, 50), this.title, this.bar]);
  }

  show(name: string, duration: number): void {
    this.total = duration;
    this.active = true;
    this.title.setText(name);
    this.scene.tweens.killTweensOf(this.box);
    this.box.setAlpha(1).setScale(1);
    if (!SaveSystem.reduceMotion()) {
      this.box.setScale(0.7);
      this.scene.tweens.add({ targets: this.box, scale: 1, duration: 260, ease: 'Back.Out' });
    }
    this.draw(duration);
  }

  update(remaining: number): void {
    if (this.active) this.draw(remaining);
  }

  hide(): void {
    this.active = false;
    this.scene.tweens.killTweensOf(this.box);
    this.scene.tweens.add({ targets: this.box, alpha: 0, duration: SaveSystem.reduceMotion() ? 0 : 250 });
  }

  get visible(): boolean {
    return this.active;
  }
  get text(): string {
    return this.title.text;
  }

  private draw(remaining: number): void {
    const g = this.bar;
    g.clear();
    const w = 112;
    const frac = Math.max(0, Math.min(1, remaining / this.total));
    g.fillStyle(0x3b2a24, 1).fillRoundedRect(-w / 2, 6, w, 9, 4);
    g.fillStyle(MUSTARD, 1).fillRoundedRect(-w / 2, 6, Math.max(8, w * frac), 9, 4);
    g.lineStyle(2, INK, 1).strokeRoundedRect(-w / 2, 6, w, 9, 4);
  }
}

/** Seconds a story card ignores taps after it opens, so quick kitchen taps do not skip it. */
const STORY_INPUT_DELAY_MS = 700;

/**
 * Story card: the chef tells a short story at a level. A full-screen dim blocks the kitchen
 * (same as the Closed overlay) and the game model is paused while it is up. Close with the
 * Continue button, or Enter or Space. Read-only view; the scene decides when to show it.
 */
export class StoryCard {
  private root: Phaser.GameObjects.Container;
  private card: Phaser.GameObjects.Container;
  private titleText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private button: Phaser.GameObjects.Container;
  private ready = false;
  private readyTimer?: Phaser.Time.TimerEvent;
  private onClose?: () => void;
  private cardId = '';

  constructor(private scene: Phaser.Scene, w: number, h: number) {
    const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x1a0f0c, 0.6).setInteractive();
    // Failsafe: a tap on the dim also closes the card once it is ready, so it can never trap the player.
    dim.on('pointerup', () => this.close());
    const chef = scene.add.image(-258, 24, 'chef');
    chef.setScale(220 / chef.height);
    this.titleText = scene.add
      .text(-130, -118, '', { fontFamily: FONT, fontSize: '36px', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 6, wordWrap: { width: 460 } })
      .setOrigin(0, 0.5);
    this.bodyText = scene.add
      .text(-130, -80, '', { fontFamily: FONT, fontSize: '26px', color: '#2B1B17', lineSpacing: 6, wordWrap: { width: 460 } })
      .setOrigin(0, 0);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-120, -34, 240, 88, 20);
    g.fillStyle(0xc4661a, 1).fillRoundedRect(-120, -40, 240, 88, 20);
    g.fillStyle(ORANGE, 1).fillRoundedRect(-120, -44, 240, 84, 20);
    g.lineStyle(5, INK, 1).strokeRoundedRect(-120, -44, 240, 84, 20);
    const label = scene.add.text(0, -2, 'Continue', { fontFamily: FONT, fontSize: '34px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5);
    this.button = scene.add.container(150, 112, [g, label]).setSize(240, 88).setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', () => this.ready && this.button.setScale(0.94));
    this.button.on('pointerout', () => this.button.setScale(1));
    this.button.on('pointerup', () => {
      this.button.setScale(1);
      this.close();
    });
    this.card = scene.add.container(w / 2, h / 2 - 10, [panel(scene, 700, 320), chef, this.titleText, this.bodyText, this.button]);
    this.root = scene.add.container(0, 0, [dim, this.card]).setDepth(1450).setVisible(false);
    scene.input.keyboard?.on('keydown-ENTER', this.onKey, this);
    scene.input.keyboard?.on('keydown-SPACE', this.onKey, this);
  }

  show(card: { id: string; title: string; text: string }, onClose?: () => void): void {
    this.cardId = card.id;
    this.onClose = onClose;
    this.titleText.setText(card.title);
    this.bodyText.setText(card.text);
    this.ready = false;
    this.readyTimer?.remove();
    this.readyTimer = this.scene.time.delayedCall(STORY_INPUT_DELAY_MS, () => (this.ready = true));
    this.scene.tweens.killTweensOf([this.root, this.card]);
    this.root.setVisible(true).setAlpha(1);
    this.card.setScale(1);
    if (!SaveSystem.reduceMotion()) {
      this.root.setAlpha(0);
      this.card.setScale(0.9);
      this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 220, onComplete: () => this.root.setAlpha(1) });
      this.scene.tweens.add({ targets: this.card, scale: 1, duration: 280, ease: 'Back.Out', onComplete: () => this.card.setScale(1) });
    }
  }

  private onKey(): void {
    if (this.isShowing) this.close();
  }

  private close(): void {
    if (!this.ready || !this.root.visible) return;
    audio.play('click');
    this.readyTimer?.remove();
    this.root.setVisible(false);
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-ENTER', this.onKey, this);
    this.scene.input.keyboard?.off('keydown-SPACE', this.onKey, this);
    this.readyTimer?.remove();
  }

  get isShowing(): boolean {
    return this.root.visible;
  }
  get id(): string {
    return this.isShowing ? this.cardId : '';
  }
}
