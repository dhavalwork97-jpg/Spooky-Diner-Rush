import Phaser from 'phaser';
import { coverChange } from '../game/lockcover';
import { SaveSystem } from '../systems/SaveSystem';
import type { KitchenState } from '../game/KitchenState';
import { Layout, SLOTS } from './layout';

/**
 * The new kitchen art already shows every ingredient stocked (fries, nuggets, buns, patties,
 * lettuce, tomato are painted into the background), so no stock sprites are drawn on top: that
 * would duplicate the food. What the old stock sprites also told the player was "this station
 * is not open yet", so a locked station gets a dim "Lv N" cover over its painted food and the
 * cover fades away the moment the station unlocks. Looks only: the model decides what can be taken.
 */
interface LockDef {
  station: string;
  unlockLevel: number;
  /** Source-pixel rectangle over the painted food (x, y, width, height). */
  rect: [number, number, number, number];
}

const LOCKS: LockDef[] = [
  { station: 'fries_bin', unlockLevel: 1, rect: [380, 758, 142, 120] },
  { station: 'nuggets_bin', unlockLevel: 4, rect: [248, 758, 142, 120] },
  { station: 'buns', unlockLevel: 2, rect: [1066, 628, 240, 106] },
  { station: 'patty_tray', unlockLevel: 2, rect: [1356, 668, 210, 108] },
  { station: 'lettuce', unlockLevel: 2, rect: [330, 394, 132, 100] },
  { station: 'tomato', unlockLevel: 2, rect: [474, 368, 124, 144] },
  { station: 'drinks', unlockLevel: 6, rect: [105, 356, 196, 92] },
  { station: 'ice_cream', unlockLevel: 12, rect: [34, 682, 185, 100] },
];

interface Cover {
  def: LockDef;
  box: Phaser.GameObjects.Container;
  locked: boolean | null;
}

export class StockViews {
  private covers: Cover[] = [];
  private dough: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, layout: Layout, level: number) {
    for (const def of LOCKS) {
      const [sx, sy, sw, sh] = def.rect;
      const w = layout.s(sw);
      const h = layout.s(sh);
      const g = scene.add.graphics();
      g.fillStyle(0x1f2a44, 0.62).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.lineStyle(3, 0x2b1b17, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      const label = scene.add
        .text(0, 0, `Lv ${def.unlockLevel}`, { fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif', fontSize: '22px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
        .setOrigin(0.5);
      const box = scene.add.container(layout.x(sx) + w / 2, layout.y(sy) + h / 2, [g, label]).setDepth(250).setVisible(false);
      this.covers.push({ def, box, locked: null });
    }
    // Raw dough sits on each pizza plate until a cooked pizza takes its place.
    for (const [sx, sy] of SLOTS.slice(-2)) {
      const im = scene.add.image(layout.x(sx), layout.y(sy) - 6, 'pizza_raw').setDepth(300).setVisible(false);
      im.setScale(layout.s(112) / im.width);
      this.dough.push(im);
    }
    this.update(level, false);
  }

  /** Show raw dough on every pizza plate that has no cooked pizza, once pizza is unlocked. */
  updateDough(state: KitchenState): void {
    const plates = state.slots.filter((x) => x.row === 'pizza');
    const open = state.level >= state.cfg.recipes.items.pizza.unlockLevel;
    this.dough.forEach((im, i) => im.setVisible(open && !!plates[i] && !plates[i].item));
  }

  /** Cover every station that is still locked. `animate` fades a newly unlocked cover away. */
  update(level: number, animate = true): void {
    for (const c of this.covers) {
      const locked = level < c.def.unlockLevel;
      const change = coverChange(c.locked, locked);
      if (change === 'none') continue; // never restart a fade that is already running
      c.locked = locked;
      this.scene.tweens.killTweensOf(c.box);
      if (change === 'lock') {
        c.box.setVisible(true).setAlpha(1);
      } else if (animate && !SaveSystem.reduceMotion()) {
        this.scene.tweens.add({ targets: c.box, alpha: 0, duration: 420, onComplete: () => c.box.setVisible(false) });
      } else {
        c.box.setVisible(false);
      }
    }
  }

  destroy(): void {
    for (const c of this.covers) {
      this.scene.tweens.killTweensOf(c.box);
      c.box.destroy();
    }
    this.covers = [];
    this.dough.forEach((d) => d.destroy());
    this.dough = [];
  }
}
