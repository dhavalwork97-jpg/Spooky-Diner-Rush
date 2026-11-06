import Phaser from 'phaser';
import { CREAM, INK, LEAF, ORANGE } from '../art/builders';
import type { KitchenState } from '../game/KitchenState';
import { titleForLevel } from '../game/career';
import { buy, buyLabel, modsFor, tierOf } from '../game/shop';
import { buyDecor, decorLabel } from '../game/decor';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const PANEL_W = 1040;
const ROW_H = 104;
const ROW_TOP = 118;
const BTN_W = 200;
const BTN_H = 92;
/** The panel fits five rows; more upgrades go on further pages. */
const PAGE_SIZE = 5;

export interface ShopData {
  state: KitchenState;
  /** Called after the shop closes (the game scene resumes itself here). */
  onClose: () => void;
}

/**
 * The Shop: a scene launched over the paused game. Buying goes through the pure `buy()` in
 * src/game/shop.ts; this scene only draws and passes the result back into the model and save.
 */
export class ShopScene extends Phaser.Scene {
  private state!: KitchenState;
  private onClose!: () => void;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private closing = false;
  private tab: 'upgrades' | 'decor' = 'upgrades';
  private page = 0;

  constructor() {
    super('Shop');
  }

  init(data: ShopData): void {
    this.state = data.state;
    this.onClose = data.onClose;
    this.closing = false;
    this.tab = 'upgrades';
    this.page = 0;
    this.rows = [];
  }

  create(): void {
    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    this.add.rectangle(w / 2, h / 2, w, h, 0x1a0f0c, 0.78).setInteractive();
    const g = this.add.graphics();
    const x0 = (w - PANEL_W) / 2;
    g.fillStyle(0x000000, 0.25).fillRoundedRect(x0 + 4, 14, PANEL_W, h - 24, 24);
    g.fillStyle(CREAM, 1).fillRoundedRect(x0, 8, PANEL_W, h - 24, 24);
    g.lineStyle(5, INK, 1).strokeRoundedRect(x0, 8, PANEL_W, h - 24, 24);

    this.add.text(x0 + 32, 40, 'Shop', { fontFamily: FONT, fontSize: '44px', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 7 }).setOrigin(0, 0.5);
    this.titleText = this.add.text(x0 + 32, 84, '', { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' }).setOrigin(0, 0.5);
    const coin = this.add.image(x0 + PANEL_W - 360, 46, 'coin');
    coin.setScale(44 / coin.width);
    this.coinText = this.add.text(x0 + PANEL_W - 330, 46, '', { fontFamily: FONT, fontSize: '32px', color: '#2B1B17' }).setOrigin(0, 0.5);
    this.note = this.add
      .text(w / 2, ROW_TOP + 5 * ROW_H + 26, '', { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' })
      .setOrigin(0.5);

    this.makeButton(x0 + PANEL_W - 96, 58, 'Close', 150, 60, 0x2ba6a0, () => this.close());
    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.input.keyboard?.on('keydown-B', this.close, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.close, this);
      this.input.keyboard?.off('keydown-B', this.close, this);
    });
    this.refresh();
  }

  private makeButton(x: number, y: number, label: string, w: number, h: number, color: number, onPress: () => void, enabled = true): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    const fill = enabled ? color : 0x9aa7b5;
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 18);
    bg.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    bg.lineStyle(4, INK, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    const t = this.add
      .text(0, -2, label, { fontFamily: FONT, fontSize: h > 70 ? '30px' : '26px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0.5);
    const c = this.add.container(x, y, [bg, t]).setSize(w, h);
    if (enabled) {
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => c.setScale(0.95));
      c.on('pointerout', () => c.setScale(1));
      c.on('pointerup', () => {
        c.setScale(1);
        audio.play('click');
        onPress();
      });
    }
    return c;
  }

  /** Rebuild the tabs, rows and header from the model. */
  private refresh(): void {
    for (const o of this.rows) o.destroy();
    this.rows = [];
    const s = this.state;
    const x0 = (LOGICAL_WIDTH - PANEL_W) / 2;
    this.titleText.setText(`Lv ${s.level}  ·  ${titleForLevel(s.cfg, s.level).title}`);
    this.coinText.setText(String(s.coins));

    (['upgrades', 'decor'] as const).forEach((t, i) => {
      const on = this.tab === t;
      const label = t === 'upgrades' ? 'Upgrades' : 'Decor';
      this.rows.push(this.makeButton(x0 + 280 + i * 146, 52, label, 140, 60, on ? ORANGE : 0x9aa7b5, () => {
        if (this.tab !== t) {
          this.tab = t;
          this.refresh();
        }
      }));
    });

    const pages = Math.max(1, Math.ceil(s.cfg.upgrades.upgrades.length / PAGE_SIZE));
    if (this.tab === 'upgrades' && pages > 1) {
      const next = (this.page + 1) % pages;
      this.rows.push(this.makeButton(x0 + 280 + 2 * 146, 52, this.page + 1 < pages ? 'More' : 'Back', 140, 60, 0x2ba6a0, () => {
        this.page = next;
        this.refresh();
      }));
    }

    if (this.tab === 'upgrades') this.drawUpgradeRows(x0);
    else this.drawDecorRows(x0);
  }

  private rowBase(i: number, x0: number): { y: number; g: Phaser.GameObjects.Graphics } {
    const y = ROW_TOP + i * ROW_H;
    const g = this.add.graphics();
    g.fillStyle(i % 2 ? 0xf3e3bd : 0xfaedd0, 1).fillRoundedRect(x0 + 20, y, PANEL_W - 40, ROW_H - 8, 16);
    g.lineStyle(3, INK, 0.6).strokeRoundedRect(x0 + 20, y, PANEL_W - 40, ROW_H - 8, 16);
    return { y, g };
  }

  private drawDecorRows(x0: number): void {
    const s = this.state;
    const items = s.cfg.decor.items;
    const owned = SaveSystem.data.decor;
    items.forEach((d, i) => {
      const { y, g } = this.rowBase(i, x0);
      const label = decorLabel(items, owned, d.id, s.level, s.coins);
      const name = this.add.text(x0 + 40, y + 12, d.name, { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' });
      const desc = this.add.text(x0 + 40, y + 48, d.description, { fontFamily: FONT, fontSize: '20px', color: '#5a463e' });
      const mark = owned.includes(d.id) ? this.add.text(x0 + 600, y + 40, 'On display', { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0, 0.5) : null;
      const btn = this.makeButton(x0 + PANEL_W - 20 - 24 - BTN_W / 2, y + (ROW_H - 8) / 2, label.text, BTN_W, BTN_H, ORANGE, () => this.tryBuyDecor(d.id), label.enabled);
      this.rows.push(g, name, desc, btn);
      if (mark) this.rows.push(mark);
    });
    const hint = this.add.text(LOGICAL_WIDTH / 2, ROW_TOP + items.length * ROW_H + 18, 'Decor is just for looks. It never changes the game.', { fontFamily: FONT, fontSize: '22px', color: '#5a463e' }).setOrigin(0.5);
    this.rows.push(hint);
  }

  private drawUpgradeRows(x0: number): void {
    const s = this.state;
    const ups = s.cfg.upgrades.upgrades;
    const owned = SaveSystem.data.owned;
    ups.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).forEach((u, i) => {
      const { y, g } = this.rowBase(i, x0);
      const tier = tierOf(ups, owned, u.id);
      const label = buyLabel(ups, owned, u.id, s.level, s.coins);
      // tier pips: filled when owned (shape and color, not color alone)
      u.tiers.forEach((_, ti) => {
        const px = x0 + 390 + ti * 30;
        const py = y + 28;
        if (ti < tier) g.fillStyle(LEAF, 1).fillCircle(px, py, 10).lineStyle(3, INK, 1).strokeCircle(px, py, 10);
        else g.lineStyle(3, INK, 0.7).strokeCircle(px, py, 10);
      });
      const name = this.add.text(x0 + 40, y + 12, u.name, { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' });
      const desc = this.add.text(x0 + 40, y + 48, u.description, { fontFamily: FONT, fontSize: '20px', color: '#5a463e' });
      const nowVal = tier > 0 ? u.tiers[tier - 1].value : 1;
      const next = u.tiers[tier];
      const effect = this.add
        .text(x0 + 600, y + 40, next ? `x${nowVal.toFixed(2)}  →  x${next.value.toFixed(2)}` : `x${nowVal.toFixed(2)}`, { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' })
        .setOrigin(0, 0.5);
      const btn = this.makeButton(x0 + PANEL_W - 20 - 24 - BTN_W / 2, y + (ROW_H - 8) / 2, label.text, BTN_W, BTN_H, ORANGE, () => this.tryBuy(u.id), label.enabled);
      this.rows.push(g, name, desc, effect, btn);
    });
  }

  private tryBuyDecor(id: string): void {
    const s = this.state;
    const items = s.cfg.decor.items;
    const r = buyDecor(items, SaveSystem.data.decor, id, s.level, s.coins);
    if (!r.ok) {
      this.flash('Cannot buy that right now');
      return;
    }
    s.coins = r.coins;
    SaveSystem.data.decor = r.decor;
    SaveSystem.data.coins = r.coins;
    SaveSystem.save();
    audio.play('levelUp');
    this.flash(`${items.find((d) => d.id === id)?.name ?? id} is up!`);
    this.refresh();
  }

  private tryBuy(id: string): void {
    const s = this.state;
    const ups = s.cfg.upgrades.upgrades;
    const r = buy(ups, SaveSystem.data.owned, id, s.level, s.coins);
    if (!r.ok) {
      this.flash('Cannot buy that right now');
      return;
    }
    s.coins = r.coins;
    SaveSystem.data.owned = r.owned;
    SaveSystem.data.coins = r.coins;
    s.mods = modsFor(ups, r.owned);
    SaveSystem.save();
    audio.play('levelUp');
    const name = ups.find((u) => u.id === id)?.name ?? id;
    this.flash(`${name} upgraded!`);
    this.refresh();
  }

  private flash(text: string): void {
    this.note.setText(text);
    this.time.delayedCall(1800, () => this.note.setText(''));
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    SaveSystem.save();
    this.scene.stop();
    this.onClose();
  }
}
