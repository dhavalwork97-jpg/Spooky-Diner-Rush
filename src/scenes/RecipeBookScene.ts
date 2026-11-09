import Phaser from 'phaser';
import { CREAM, INK } from '../art/builders';
import type { GameConfig, ItemKind } from '../game/config';
import { recipeEntries } from '../game/recipebook';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

/** One row of a generic Recipe Book (the Taco Truck's). The diner keeps its own rows, built from `cfg.recipes`. */
export interface BookRow {
  name: string;
  icon: { key: string; frame?: number };
  stats: string;
  steps: string[];
  locked: boolean;
}

/** What the Recipe Book needs. The diner passes its state; another restaurant also passes its own `rows` (and an optional how-to line). */
export interface RecipeBookData {
  state: { cfg: GameConfig; level: number };
  onClose: () => void;
  rows?: BookRow[];
  tips?: string;
}

const ROWS_PER_PAGE = 5;
const PAGED_ROW_H = 96;
const PAGED_ROW_TOP = 108;

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const PANEL_W = 1040;
const ROW_H = 130;
const ROW_TOP = 100;

/** Icon texture per menu item (supplied art where it exists, code-drawn otherwise). */
const ICON: Record<ItemKind, string> = { fries: 'fries_cooked', burger: 'icon_burger', nuggets: 'nuggets_cooked', pizza: 'pizza_cooked', drink: 'drink_cooked', icecream: 'icecream_cooked' };

/** The Recipe Book: how each menu item is made, with locked items shown as "Lv N". Read-only. */
export class RecipeBookScene extends Phaser.Scene {
  private onClose!: () => void;
  private closing = false;
  private cfg!: GameConfig;
  private level = 1;
  private extraRows?: BookRow[];
  private tips = '';

  constructor() {
    super('RecipeBook');
  }

  init(data: RecipeBookData): void {
    this.closing = false;
    this.onClose = data.onClose;
    this.cfg = data.state.cfg;
    this.level = data.state.level;
    this.extraRows = data.rows;
    this.tips = data.tips ?? '';
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
    this.add.text(x0 + 32, 44, 'Recipe Book', { fontFamily: FONT, fontSize: '44px', color: '#F28C28', stroke: '#2B1B17', strokeThickness: 7 }).setOrigin(0, 0.5);

    if (this.extraRows) this.pagedRows(x0, this.extraRows);
    else recipeEntries(this.cfg, this.level).forEach((e, i) => {
      const y = ROW_TOP + i * ROW_H;
      const row = this.add.graphics();
      row.fillStyle(e.locked ? 0xe6dcc4 : i % 2 ? 0xf3e3bd : 0xfaedd0, 1).fillRoundedRect(x0 + 20, y, PANEL_W - 40, ROW_H - 8, 16);
      row.lineStyle(3, INK, 0.6).strokeRoundedRect(x0 + 20, y, PANEL_W - 40, ROW_H - 8, 16);
      const icon = this.add.image(x0 + 90, y + (ROW_H - 8) / 2, ICON[e.id]);
      icon.setScale(84 / Math.max(icon.width, icon.height));
      if (e.locked) icon.setTint(0x777777).setAlpha(0.7);
      this.add.text(x0 + 160, y + 14, e.name, { fontFamily: FONT, fontSize: '32px', color: '#2B1B17' });
      const stats = e.locked ? `Unlocks at Lv ${e.unlockLevel}` : `${e.price} coins  ·  ${e.xp} XP`;
      this.add.text(x0 + 160, y + 56, stats, { fontFamily: FONT, fontSize: '22px', color: '#5a463e' });
      const how = e.locked ? '' : e.steps.map((s, n) => `${n + 1}. ${s}`).join('\n');
      this.add.text(x0 + 470, y + 12, how, { fontFamily: FONT, fontSize: '20px', color: '#2B1B17', lineSpacing: 4, wordWrap: { width: PANEL_W - 470 - 50 + 20 } });
    });

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-75, -25, 150, 60, 18);
    bg.fillStyle(0x2ba6a0, 1).fillRoundedRect(-75, -30, 150, 60, 18);
    bg.lineStyle(4, INK, 1).strokeRoundedRect(-75, -30, 150, 60, 18);
    const t = this.add.text(0, -2, 'Close', { fontFamily: FONT, fontSize: '26px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 }).setOrigin(0.5);
    const btn = this.add.container(x0 + PANEL_W - 96, 58, [bg, t]).setSize(150, 60).setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => {
      audio.play('click');
      this.close();
    });
    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.input.keyboard?.on('keydown-R', this.close, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.close, this);
      this.input.keyboard?.off('keydown-R', this.close, this);
    });
  }

  /** Rows of another restaurant, five to a page with Prev and Next, and a short how-to line under them. */
  private pagedRows(x0: number, rows: BookRow[]): void {
    const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    let page = 0;
    let shown: Phaser.GameObjects.GameObject[] = [];
    const pageText = this.add.text(x0 + PANEL_W / 2, 662, '', { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' }).setOrigin(0.5);
    if (this.tips) this.add.text(x0 + PANEL_W / 2, 598, this.tips, { fontFamily: FONT, fontSize: '18px', color: '#5a463e', align: 'center', wordWrap: { width: PANEL_W - 80 } }).setOrigin(0.5, 0);
    const draw = (): void => {
      shown.forEach((o) => o.destroy());
      shown = [];
      rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE).forEach((e, i) => {
        const y = PAGED_ROW_TOP + i * PAGED_ROW_H;
        const row = this.add.graphics();
        row.fillStyle(e.locked ? 0xe6dcc4 : i % 2 ? 0xf3e3bd : 0xfaedd0, 1).fillRoundedRect(x0 + 20, y, PANEL_W - 40, PAGED_ROW_H - 8, 16);
        row.lineStyle(3, INK, 0.6).strokeRoundedRect(x0 + 20, y, PANEL_W - 40, PAGED_ROW_H - 8, 16);
        const icon = this.add.image(x0 + 80, y + (PAGED_ROW_H - 8) / 2, e.icon.key, e.icon.frame);
        icon.setScale(70 / Math.max(icon.width, icon.height));
        if (e.locked) icon.setTint(0x777777).setAlpha(0.7);
        const name = this.add.text(x0 + 130, y + 12, e.name, { fontFamily: FONT, fontSize: '28px', color: '#2B1B17' });
        const stats = this.add.text(x0 + 130, y + 50, e.stats, { fontFamily: FONT, fontSize: '20px', color: '#5a463e' });
        const how = e.locked ? '' : e.steps.map((t, n) => `${n + 1}. ${t}`).join('   ');
        const steps = this.add.text(x0 + 400, y + 10, how, { fontFamily: FONT, fontSize: '17px', color: '#2B1B17', lineSpacing: 3, wordWrap: { width: PANEL_W - 400 - 40 } });
        shown.push(row, icon, name, stats, steps);
      });
      pageText.setText(`${page + 1} / ${pages}`);
    };
    const nav = (label: string, x: number, delta: number): void => {
      const t = this.add.text(x, 662, label, { fontFamily: FONT, fontSize: '26px', color: '#FFF4DC', backgroundColor: '#2BA6A0', padding: { x: 18, y: 6 }, stroke: '#2B1B17', strokeThickness: 4 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        const next = Phaser.Math.Clamp(page + delta, 0, pages - 1);
        if (next === page) return;
        page = next;
        audio.play('click');
        draw();
      });
    };
    if (pages > 1) {
      nav('< Prev', x0 + 140, -1);
      nav('Next >', x0 + PANEL_W - 140, 1);
    }
    draw();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.onClose();
  }
}
