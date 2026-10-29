import Phaser from 'phaser';
import { CREAM, INK, LEAF, ORANGE } from '../art/builders';
import type { RestaurantDef } from '../data/validate';
import { restaurantCards } from '../game/restaurants';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';
import type { ShopData } from './ShopScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const PANEL_W = 1040;
const CARD_W = 300;
const CARD_H = 420;
const GAP = 40;

export interface RestaurantSelectData extends ShopData {
  /** Called with the id of another open restaurant the player picked; the game scene restarts in it. */
  onPick: (id: string) => void;
  current: string;
}

/**
 * Restaurant select: one card per restaurant. Open ones can be picked, locked ones show "Lv N",
 * and not-yet-built ones show "Coming soon". Only burger_diner is playable today.
 */
export class RestaurantSelectScene extends Phaser.Scene {
  private d!: RestaurantSelectData;
  private closing = false;

  constructor() {
    super('RestaurantSelect');
  }

  init(data: RestaurantSelectData): void {
    this.d = data;
    this.closing = false;
  }

  create(): void {
    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    this.add.rectangle(w / 2, h / 2, w, h, 0x1a0f0c, 0.78).setInteractive();
    const x0 = (w - PANEL_W) / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(x0 + 4, 14, PANEL_W, h - 24, 24);
    g.fillStyle(CREAM, 1).fillRoundedRect(x0, 8, PANEL_W, h - 24, 24);
    g.lineStyle(5, INK, 1).strokeRoundedRect(x0, 8, PANEL_W, h - 24, 24);
    this.add.text(x0 + 32, 44, 'Restaurants', { fontFamily: FONT, fontSize: '44px', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 7 }).setOrigin(0, 0.5);

    const playable = this.registry.get('restaurants') as RestaurantDef[];
    const cards = restaurantCards(playable, this.d.state.cfg.restaurantMenu.comingSoon, this.d.state.level, this.d.current);
    const total = cards.length * CARD_W + (cards.length - 1) * GAP;
    const left = (w - total) / 2;
    cards.forEach((c, i) => {
      const cx = left + i * (CARD_W + GAP) + CARD_W / 2;
      const top = 110;
      const art = this.add.graphics();
      const live = c.state === 'open';
      art.fillStyle(0x000000, 0.2).fillRoundedRect(cx - CARD_W / 2 + 3, top + 6, CARD_W, CARD_H, 20);
      art.fillStyle(live ? 0xfaedd0 : 0xe6dcc4, 1).fillRoundedRect(cx - CARD_W / 2, top, CARD_W, CARD_H, 20);
      art.lineStyle(c.current ? 6 : 4, c.current ? LEAF : INK, 1).strokeRoundedRect(cx - CARD_W / 2, top, CARD_W, CARD_H, 20);
      // thumbnail: the kitchen picture for playable restaurants, a plain panel otherwise
      if (c.background && this.textures.exists(c.background)) {
        const img = this.add.image(cx, top + 110, c.background);
        img.setScale((CARD_W - 28) / img.width);
        if (!live) img.setTint(0x777777).setAlpha(0.7);
      } else {
        art.fillStyle(0x3b2a24, 1).fillRoundedRect(cx - CARD_W / 2 + 14, top + 14, CARD_W - 28, 190, 12);
        this.add.text(cx, top + 110, '?', { fontFamily: FONT, fontSize: '96px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 8 }).setOrigin(0.5);
      }
      this.add.text(cx, top + 240, c.name, { fontFamily: FONT, fontSize: '32px', color: '#2B1B17' }).setOrigin(0.5);
      const status = c.state === 'soon' ? 'Coming soon' : c.state === 'locked' ? `Unlocks at Lv ${c.unlockLevel}` : c.current ? 'Playing now' : 'Ready';
      this.add.text(cx, top + 282, status, { fontFamily: FONT, fontSize: '22px', color: '#5a463e' }).setOrigin(0.5);
      if (live) {
        const label = c.current ? 'Continue' : 'Play';
        this.makeButton(cx, top + 352, label, 220, 92, ORANGE, () => this.pick(c.id, c.current));
      }
    });

    this.makeButton(x0 + PANEL_W - 96, 58, 'Close', 150, 60, 0x2ba6a0, () => this.close());
    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.input.keyboard?.on('keydown-T', this.close, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.close, this);
      this.input.keyboard?.off('keydown-T', this.close, this);
    });
  }

  private makeButton(x: number, y: number, label: string, w: number, h: number, color: number, onPress: () => void): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 18);
    bg.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    bg.lineStyle(4, INK, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    const t = this.add.text(0, -2, label, { fontFamily: FONT, fontSize: h > 70 ? '30px' : '26px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 }).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, t]).setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.95));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      audio.play('click');
      onPress();
    });
  }

  private pick(id: string, current: boolean): void {
    if (this.closing) return;
    this.closing = true;
    SaveSystem.data.lastRestaurant = id;
    SaveSystem.save();
    this.scene.stop();
    if (current) this.d.onClose();
    else this.d.onPick(id);
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.d.onClose();
  }
}
