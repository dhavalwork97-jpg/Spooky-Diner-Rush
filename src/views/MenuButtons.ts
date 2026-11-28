import Phaser from 'phaser';
import { CREAM, INK, MUSTARD, ORANGE, TOMATO } from '../art/builders';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';

const DEPTH = 850;
const Y = 190;
const XS = [1244, 1176, 1108];
const HIT = 68;
const R = 28;

export type MenuKind = 'shop' | 'book' | 'restaurants';

/**
 * Three round buttons (Shop, Recipe Book, Restaurants) in the free band right of the seats and
 * below the mute button. They cover no tap zone. Keys B, R and T do the same.
 */
export class MenuButtons {
  private buttons: Phaser.GameObjects.Container[] = [];
  private bookBadge?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private onPress: (kind: MenuKind) => void, hasNewRecipes = false) {
    (['shop', 'book', 'restaurants'] as MenuKind[]).forEach((kind, i) => {
      const g = scene.add.graphics();
      g.fillStyle(0x000000, 0.2).fillCircle(0, 4, R);
      g.fillStyle(CREAM, 1).fillCircle(0, 0, R);
      g.lineStyle(4, INK, 1).strokeCircle(0, 0, R);
      const icon = scene.add.graphics();
      this.drawIcon(icon, kind);
      const c = scene.add.container(XS[i], Y, [g, icon]).setDepth(DEPTH).setSize(HIT, HIT).setInteractive({ useHandCursor: true });
      if (kind === 'book') {
        this.bookBadge = scene.add.text(19, -22, 'NEW', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#FFF4DC', backgroundColor: '#D94B35', padding: { x: 5, y: 3 }, stroke: '#2B1B17', strokeThickness: 2 }).setOrigin(0.5).setVisible(hasNewRecipes);
        c.add(this.bookBadge);
      }
      c.setName(`menu_${kind}`);
      c.on('pointerdown', () => !SaveSystem.reduceMotion() && c.setScale(0.92));
      c.on('pointerout', () => c.setScale(1));
      c.on('pointerup', () => {
        c.setScale(1);
        audio.play('click');
        this.onPress(kind);
      });
      this.buttons.push(c);
    });
  }

  /** Update the Recipe Book's NEW marker when a fresh dish or menu step unlocks. */
  setNewBadge(visible: boolean): void {
    this.bookBadge?.setVisible(visible);
  }

  private drawIcon(g: Phaser.GameObjects.Graphics, kind: MenuKind): void {
    g.lineStyle(3, INK, 1);
    if (kind === 'shop') {
      // a coin stack
      g.fillStyle(MUSTARD, 1).fillEllipse(0, 6, 28, 10).strokeEllipse(0, 6, 28, 10);
      g.fillStyle(MUSTARD, 1).fillEllipse(0, 0, 28, 10).strokeEllipse(0, 0, 28, 10);
      g.fillStyle(MUSTARD, 1).fillEllipse(0, -6, 28, 10).strokeEllipse(0, -6, 28, 10);
    } else if (kind === 'book') {
      // an open book
      g.fillStyle(ORANGE, 1).fillRoundedRect(-17, -13, 34, 26, 4).strokeRoundedRect(-17, -13, 34, 26, 4);
      g.fillStyle(CREAM, 1).fillRect(-14, -10, 13, 20).fillRect(1, -10, 13, 20);
      g.lineBetween(0, -13, 0, 13);
    } else {
      // a little shop front with an awning
      g.fillStyle(CREAM, 1).fillRect(-14, -2, 28, 15).strokeRect(-14, -2, 28, 15);
      g.fillStyle(TOMATO, 1).fillTriangle(-18, -2, 18, -2, 0, -15).strokeTriangle(-18, -2, 18, -2, 0, -15);
      g.fillStyle(ORANGE, 1).fillRect(-4, 3, 8, 10).strokeRect(-4, 3, 8, 10);
    }
  }

  /** Test hook: where each button is, in logical pixels. */
  positions(): { kind: string; x: number; y: number; hit: number }[] {
    return this.buttons.map((b) => ({ kind: b.name.replace('menu_', ''), x: b.x, y: b.y, hit: HIT }));
  }
}

/** Hit rectangles of the buttons in logical pixels, for the "covers no tap zone" test. */
export const MENU_BUTTON_RECTS = XS.map((x) => ({ x: x - HIT / 2, y: Y - HIT / 2, width: HIT, height: HIT }));
