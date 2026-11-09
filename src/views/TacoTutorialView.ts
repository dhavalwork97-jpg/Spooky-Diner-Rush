import Phaser from 'phaser';
import { CREAM, INK, MUSTARD } from '../art/builders';
import type { TacoHint } from '../game/taco/tacoTutorial';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { TutorialHand } from './TutorialHand';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const CAPTION_DEPTH = 940;
const GLOW_DEPTH = 930;

/** A spot on screen in logical pixels: the centre, and roughly how big the thing to tap is. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Shows a tutorial hint with the diner's own pointer (`TutorialHand`, same tap and drag animation and timing), a soft pulsing
 * highlight on the thing to tap, and a short instruction line. It never blocks taps: nothing here is interactive except the Skip pill.
 */
export class TacoTutorialView {
  private hand: TutorialHand;
  private glow: Phaser.GameObjects.Ellipse;
  private glowTween?: Phaser.Tweens.Tween;
  private caption: Phaser.GameObjects.Container;
  private captionBg: Phaser.GameObjects.Graphics;
  private captionText: Phaser.GameObjects.Text;
  private skip: Phaser.GameObjects.Container;
  private lastText = '';
  private lastGlowKey = '';

  constructor(private scene: Phaser.Scene, private w: number, h: number, onSkip: () => void) {
    this.hand = new TutorialHand(scene);
    this.glow = scene.add.ellipse(0, 0, 80, 80, 0xfff4dc, 0.16).setStrokeStyle(5, MUSTARD, 0.95).setDepth(GLOW_DEPTH).setVisible(false);
    this.captionText = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0.5);
    this.captionBg = scene.add.graphics();
    this.caption = scene.add.container(w / 2, h - 50, [this.captionBg, this.captionText]).setDepth(CAPTION_DEPTH).setVisible(false);
    // A small Skip pill, same cream-and-ink look as the other buttons. The Recipe Book still shows every recipe afterwards.
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.2).fillRoundedRect(-62, -16, 124, 44, 16);
    g.fillStyle(CREAM, 1).fillRoundedRect(-62, -22, 124, 44, 16);
    g.lineStyle(4, INK, 1).strokeRoundedRect(-62, -22, 124, 44, 16);
    const t = scene.add.text(0, 0, 'Skip', { fontFamily: FONT, fontSize: '24px', color: '#2B1B17' }).setOrigin(0.5);
    this.skip = scene.add.container(w - 90, h - 50, [g, t]).setDepth(CAPTION_DEPTH + 1).setSize(124, 56).setInteractive({ useHandCursor: true }).setVisible(false);
    this.skip.on('pointerup', () => {
      audio.play('click');
      onSkip();
    });
  }

  /** Show the pointer, highlight and caption for `hint` (null hides everything). `locate` turns a zone id into its screen spot. */
  show(hint: TacoHint | null, locate: (zone: string) => Spot | null, customerSpot: (id: number) => { x: number; y: number } | null): void {
    if (!hint) return this.hide();
    this.skip.setVisible(true);
    this.setCaption(hint.text);
    if (hint.kind === 'wait') {
      this.hand.hide();
      this.hideGlow();
      return;
    }
    if (hint.kind === 'tap') {
      const s = locate(hint.zone);
      if (!s) return this.hide();
      this.hand.point(hint.key, { x: s.x + 6, y: s.y + 8 });
      this.showGlow(hint.key, s);
      return;
    }
    const from = locate(hint.from);
    const to = customerSpot(hint.customer);
    if (!from || !to) return this.hide();
    this.hand.point(hint.key, { x: from.x + 6, y: from.y + 8 }, to);
    this.showGlow(hint.key, from);
  }

  hide(): void {
    this.hand.hide();
    this.hideGlow();
    this.caption.setVisible(false);
    this.skip.setVisible(false);
    this.lastText = '';
  }

  destroy(): void {
    this.hand.destroy();
    this.glowTween?.stop();
    this.glow.destroy();
    this.caption.destroy();
    this.skip.destroy();
  }

  private setCaption(text: string): void {
    if (text === this.lastText && this.caption.visible) return;
    this.lastText = text;
    this.captionText.setText(text);
    const w = Math.min(this.w - 280, Math.max(360, Math.ceil(this.captionText.width) + 56));
    const h = 54;
    this.captionBg.clear();
    this.captionBg.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 24);
    this.captionBg.fillStyle(CREAM, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    this.captionBg.lineStyle(5, INK, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
    this.caption.setVisible(true);
    if (!SaveSystem.reduceMotion()) {
      this.scene.tweens.killTweensOf(this.caption);
      this.caption.setScale(0.92).setAlpha(0.4);
      this.scene.tweens.add({ targets: this.caption, scale: 1, alpha: 1, duration: 170, ease: 'Back.Out' });
    } else this.caption.setScale(1).setAlpha(1);
  }

  private showGlow(key: string, s: Spot): void {
    if (key === this.lastGlowKey && this.glow.visible) return;
    this.lastGlowKey = key;
    this.glowTween?.stop();
    const d = Math.max(64, Math.min(150, Math.max(s.w, s.h) * 1.05));
    this.glow.setPosition(s.x, s.y).setSize(d, d).setDisplaySize(d, d).setScale(1).setAlpha(1).setVisible(true);
    if (SaveSystem.reduceMotion()) return;
    this.glowTween = this.scene.tweens.add({ targets: this.glow, scale: 1.14, alpha: 0.55, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  private hideGlow(): void {
    this.glowTween?.stop();
    this.glow.setVisible(false);
    this.lastGlowKey = '';
  }
}
