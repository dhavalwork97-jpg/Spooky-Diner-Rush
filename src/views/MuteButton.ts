import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
/** Where the music button sits, in logical pixels (above the three menu buttons). The same in every restaurant. */
export const MUTE_POS = { x: 1232, y: 112 };
export const MUTE_HIT = 88;

/** The round music on/off button. Shared by every restaurant scene so the HUD is identical everywhere. */
export class MuteButton {
  private btn: Phaser.GameObjects.Container;
  private line: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.2).fillCircle(0, 4, 24);
    g.fillStyle(0xfff4dc, 1).fillCircle(0, 0, 24);
    g.lineStyle(4, 0x2b1b17, 1).strokeCircle(0, 0, 24);
    const note = scene.add.text(0, -1, '♪', { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' }).setOrigin(0.5);
    this.line = scene.add.graphics();
    this.line.lineStyle(5, 0xd9382b, 1).beginPath().moveTo(-16, 16).lineTo(16, -16).strokePath();
    this.line.setVisible(SaveSystem.data.settings.muted);
    // 88 px hit area around a smaller visual
    this.btn = scene.add.container(MUTE_POS.x, MUTE_POS.y, [g, note, this.line]).setDepth(850).setSize(MUTE_HIT, MUTE_HIT).setInteractive({ useHandCursor: true });
    this.btn.on('pointerdown', () => {
      audio.unlock();
      audio.setMuted(!SaveSystem.data.settings.muted);
      this.line.setVisible(SaveSystem.data.settings.muted);
      audio.play('click');
    });
  }

  /** Test hook: the button's rectangle in logical pixels. */
  static rect(): { x: number; y: number; width: number; height: number } {
    return { x: MUTE_POS.x - MUTE_HIT / 2, y: MUTE_POS.y - MUTE_HIT / 2, width: MUTE_HIT, height: MUTE_HIT };
  }
}
