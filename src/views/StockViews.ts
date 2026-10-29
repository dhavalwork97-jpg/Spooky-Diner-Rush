import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { Layout } from './layout';

/**
 * Stock sprites drawn on top of the static kitchen so the bins and trays look stocked
 * (raw fries, nuggets, buns, patties, lettuce, tomato). A station's stock appears once it is
 * unlocked and pops in the moment it unlocks. Looks only: the model decides what can be taken.
 */
interface StockDef {
  station: string;
  unlockLevel: number;
  /** Source-pixel centre, width and depth-order of each sprite. */
  sprites: { key: string; x: number; y: number; w: number; angle?: number }[];
}

const STOCK: StockDef[] = [
  {
    station: 'fries_bin',
    unlockLevel: 1,
    sprites: [
      { key: 'fries_raw', x: 438, y: 812, w: 120, angle: -6 },
      { key: 'fries_raw', x: 482, y: 822, w: 120, angle: 5 },
    ],
  },
  {
    station: 'nuggets_bin',
    unlockLevel: 4,
    sprites: [
      { key: 'nuggets_raw', x: 275, y: 808, w: 66, angle: -8 },
      { key: 'nuggets_raw', x: 332, y: 818, w: 66, angle: 10 },
      { key: 'nuggets_raw', x: 300, y: 836, w: 66, angle: 0 },
    ],
  },
  {
    station: 'buns',
    unlockLevel: 2,
    sprites: [
      { key: 'bun_top', x: 1095, y: 702, w: 112, angle: -4 },
      { key: 'bun_top', x: 1195, y: 700, w: 112, angle: 4 },
      { key: 'bun_top', x: 1145, y: 728, w: 112, angle: 0 },
    ],
  },
  {
    station: 'patty_tray',
    unlockLevel: 2,
    sprites: [
      { key: 'patty_raw', x: 1380, y: 722, w: 104, angle: -3 },
      { key: 'patty_raw', x: 1470, y: 722, w: 104, angle: 3 },
      { key: 'patty_raw', x: 1550, y: 724, w: 104, angle: -2 },
      { key: 'patty_raw', x: 1465, y: 748, w: 104, angle: 0 },
    ],
  },
  {
    station: 'lettuce',
    unlockLevel: 2,
    sprites: [
      { key: 'lettuce', x: 372, y: 455, w: 96, angle: -5 },
      { key: 'lettuce', x: 405, y: 462, w: 96, angle: 6 },
    ],
  },
  {
    station: 'tomato',
    unlockLevel: 2,
    sprites: [
      { key: 'tomato', x: 505, y: 455, w: 88, angle: -4 },
      { key: 'tomato', x: 535, y: 462, w: 88, angle: 5 },
    ],
  },
];

interface Group {
  def: StockDef;
  images: Phaser.GameObjects.Image[];
  shown: boolean;
}

export class StockViews {
  private groups: Group[] = [];

  constructor(private scene: Phaser.Scene, layout: Layout, level: number) {
    for (const def of STOCK) {
      const images = def.sprites.map((s) => {
        const im = scene.add.image(layout.x(s.x), layout.y(s.y), s.key).setDepth(250).setAngle(s.angle ?? 0).setVisible(false);
        im.setData('k', layout.s(s.w) / im.width);
        im.setScale(im.getData('k') as number);
        return im;
      });
      this.groups.push({ def, images, shown: false });
    }
    this.update(level, false);
  }

  /** Show the stock of every unlocked station. `animate` pops newly unlocked stock in. */
  update(level: number, animate = true): void {
    for (const g of this.groups) {
      const should = level >= g.def.unlockLevel;
      if (should === g.shown) continue;
      g.shown = should;
      g.images.forEach((im, i) => {
        im.setVisible(should);
        if (should && animate && !SaveSystem.reduceMotion()) {
          const k = im.getData('k') as number;
          im.setScale(0);
          this.scene.tweens.add({ targets: im, scale: k, duration: 260, delay: i * 70, ease: 'Back.Out' });
        }
      });
    }
  }

  /** Small squash when the station is tapped, so taking from the stock feels physical. */
  tap(station: string): void {
    if (SaveSystem.reduceMotion()) return;
    const g = this.groups.find((x) => x.def.station === station);
    if (!g || !g.shown) return;
    for (const im of g.images) {
      const k = im.getData('k') as number;
      this.scene.tweens.killTweensOf(im);
      im.setScale(k);
      this.scene.tweens.add({ targets: im, scaleX: k * 1.12, scaleY: k * 0.9, duration: 90, yoyo: true, ease: 'Quad.Out' });
    }
  }

  destroy(): void {
    for (const g of this.groups) g.images.forEach((im) => im.destroy());
    this.groups = [];
  }
}
