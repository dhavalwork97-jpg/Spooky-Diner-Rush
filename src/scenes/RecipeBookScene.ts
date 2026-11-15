import Phaser from 'phaser';
import { CREAM, INK } from '../art/builders';
import type { GameConfig, ItemKind } from '../game/config';
import { recipeEntries } from '../game/recipebook';
import { defaultExtras, masteryProgress } from '../game/extras';
import { audio } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { defaultBadges, progressOf } from '../game/badges';
import { dxKey, hasDinerArt, loadDinerArt } from '../views/dinerArt';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

/** One row of a generic Recipe Book (the Taco Truck's). The diner keeps its own rows, built from `cfg.recipes`. */
export interface BookRow {
  name: string;
  icon: { key: string; frame?: number };
  stats: string;
  steps: string[];
  locked: boolean;
}

/** One dish of a mastery grid (the Taco Truck's). */
export interface MasteryCellView {
  name: string;
  icon: { key: string; frame?: number };
  count: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  tier: number;
  /** "28 more for Silver", or "Gold!" once done. */
  next: string;
  onMenu: boolean;
}
export interface MasteryBookData {
  rowLabels: string[];
  colLabels: string[];
  cells: MasteryCellView[][];
  footer: string;
}

/** What the Recipe Book needs. The diner passes its state; another restaurant also passes its own `rows` (and an optional how-to line). */
export interface RecipeBookData {
  state: { cfg: GameConfig; level: number };
  onClose: () => void;
  rows?: BookRow[];
  tips?: string;
  /** A restaurant with a mastery grid adds a second tab for it. */
  mastery?: MasteryBookData;
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
  private recipeObjs: Phaser.GameObjects.GameObject[] = [];
  private badgeObjs: Phaser.GameObjects.GameObject[] = [];
  private tab: 'recipes' | 'badges' | 'mastery' = 'recipes';
  private tabChips: { recipes?: Phaser.GameObjects.Text; badges?: Phaser.GameObjects.Text } = {};
  private mastery?: MasteryBookData;
  private pagedShown: Phaser.GameObjects.GameObject[] = [];
  private pagedHidden = false;

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
    this.mastery = data.mastery;
    this.pagedShown = [];
    this.pagedHidden = false;
    this.tab = 'recipes';
    this.tabChips = {};
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

    this.recipeObjs = [];
    this.badgeObjs = [];
    if (!this.extraRows || this.mastery) this.buildTabs(x0);
    const mark = this.children.length;
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
      if (!e.locked && this.level >= defaultExtras.mastery.fromLevel) {
        const p = masteryProgress(defaultExtras, SaveSystem.data.mastery[e.id] ?? 0);
        const line = p.next ? `${p.badge ? `${p.badge} badge  ·  ` : ''}${p.next.remaining} more quick serves for ${p.next.name}` : 'Gold badge';
        this.add.text(x0 + 160, y + 88, line, { fontFamily: FONT, fontSize: '18px', color: p.badge ? '#B8730F' : '#7a665e' });
      }
      const how = e.locked ? '' : e.steps.map((s, n) => `${n + 1}. ${s}`).join('\n');
      this.add.text(x0 + 470, y + 12, how, { fontFamily: FONT, fontSize: '20px', color: '#2B1B17', lineSpacing: 4, wordWrap: { width: PANEL_W - 470 - 50 + 20 } });
    });
    this.recipeObjs = this.children.list.slice(mark);

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
    if (!this.extraRows) loadDinerArt(this, 'badges', () => this.tab === 'badges' && this.showTab(x0, 'badges'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.close, this);
      this.input.keyboard?.off('keydown-R', this.close, this);
    });
  }

  /** Two tabs under the title: Recipes (the list below) and Badges (the lifetime goals). Only the diner has them. */
  private buildTabs(x0: number): void {
    const chip = (label: string, x: number, tab: 'recipes' | 'badges' | 'mastery'): Phaser.GameObjects.Text => {
      const t = this.add.text(x, 58, label, { fontFamily: FONT, fontSize: '26px', color: '#FFF4DC', backgroundColor: '#2BA6A0', padding: { x: 18, y: 6 }, stroke: '#2B1B17', strokeThickness: 4 }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        if (this.tab === tab) return;
        audio.play('click');
        this.showTab(x0, tab);
      });
      return t;
    };
    this.tabChips.recipes = chip('Recipes', x0 + 380, 'recipes');
    this.tabChips.badges = chip(this.extraRows ? 'Mastery' : 'Badges', x0 + 380 + 150, this.extraRows ? 'mastery' : 'badges');
    this.paintTabs();
  }

  private paintTabs(): void {
    this.tabChips.recipes?.setBackgroundColor(this.tab === 'recipes' ? '#F28C28' : '#2BA6A0');
    this.tabChips.badges?.setBackgroundColor(this.tab !== 'recipes' ? '#F28C28' : '#2BA6A0');
  }

  private showTab(x0: number, tab: 'recipes' | 'badges' | 'mastery'): void {
    this.tab = tab;
    this.paintTabs();
    this.pagedHidden = tab !== 'recipes';
    this.recipeObjs.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(tab === 'recipes'));
    this.pagedShown.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(tab === 'recipes'));
    this.badgeObjs.forEach((o) => o.destroy());
    this.badgeObjs = [];
    if (tab === 'badges') this.buildBadges(x0);
    if (tab === 'mastery' && this.mastery) this.buildMastery(x0, this.mastery);
  }

  /** The Mastery page: a 4 x 4 grid (row = protein, column = format). Each cell shows the dish, its serve count and the badge earned. */
  private buildMastery(x0: number, m: MasteryBookData): void {
    const mark = this.children.length;
    const labelW = 120;
    const cellW = (PANEL_W - 40 - labelW) / m.colLabels.length;
    const cellH = 108;
    const top = 150;
    const tierColor = [0x999999, 0xcd7f32, 0xb8c0c8, 0xf6c445];
    m.colLabels.forEach((c, i) => this.add.text(x0 + 20 + labelW + cellW * i + cellW / 2, 124, c, { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' }).setOrigin(0.5));
    m.cells.forEach((row, r) => {
      const y = top + r * (cellH + 6);
      this.add.text(x0 + 20 + labelW / 2, y + cellH / 2, m.rowLabels[r], { fontFamily: FONT, fontSize: '22px', color: '#2B1B17' }).setOrigin(0.5);
      row.forEach((c, i) => {
        const x = x0 + 20 + labelW + cellW * i;
        const g = this.add.graphics();
        g.fillStyle(c.onMenu ? 0xfaedd0 : 0xe6dcc4, 1).fillRoundedRect(x + 4, y, cellW - 8, cellH, 14);
        g.lineStyle(3, INK, c.onMenu ? 0.7 : 0.35).strokeRoundedRect(x + 4, y, cellW - 8, cellH, 14);
        const icon = this.add.image(x + 52, y + cellH / 2, c.icon.key, c.icon.frame);
        icon.setScale(72 / Math.max(icon.width, icon.height));
        if (!c.onMenu) icon.setTint(0x555555).setAlpha(0.55);
        this.add.circle(x + cellW - 28, y + 24, 14, tierColor[c.tier], 1).setStrokeStyle(3, INK, c.tier > 0 ? 1 : 0.4);
        this.add.text(x + 96, y + 20, c.onMenu ? `${c.count} served` : 'Not on the menu yet', { fontFamily: FONT, fontSize: '20px', color: '#2B1B17' });
        this.add.text(x + 96, y + 52, c.onMenu ? c.next : '', { fontFamily: FONT, fontSize: '16px', color: c.tier > 0 ? '#B8730F' : '#5a463e', wordWrap: { width: cellW - 110 } });
      });
    });
    this.add.text(x0 + PANEL_W / 2, 618, m.footer, { fontFamily: FONT, fontSize: '20px', color: '#5a463e', align: 'center', wordWrap: { width: PANEL_W - 80 } }).setOrigin(0.5, 0);
    this.badgeObjs = this.children.list.slice(mark);
  }

  /** The Badges page: 5 across, 2 down. Earned badges are in full colour; locked ones are greyed and show their goal and progress. */
  private buildBadges(x0: number): void {
    const mark = this.children.length;
    const stats = SaveSystem.data.stats;
    const have = SaveSystem.data.badges;
    const cols = 5;
    const cellW = (PANEL_W - 60) / cols;
    const cellH = 256;
    const done = defaultBadges.filter((b) => have.includes(b.id)).length;
    this.add.text(x0 + PANEL_W - 190, 100, `${done} / ${defaultBadges.length}`, { fontFamily: FONT, fontSize: '26px', color: '#5a463e' }).setOrigin(1, 0.5);
    defaultBadges.forEach((b, i) => {
      const cx = x0 + 30 + cellW * (i % cols) + cellW / 2;
      const top = 116 + Math.floor(i / cols) * (cellH + 10);
      const earned = have.includes(b.id);
      const card = this.add.graphics();
      card.fillStyle(earned ? 0xfaedd0 : 0xe6dcc4, 1).fillRoundedRect(cx - cellW / 2 + 6, top, cellW - 12, cellH, 16);
      card.lineStyle(3, INK, earned ? 0.8 : 0.4).strokeRoundedRect(cx - cellW / 2 + 6, top, cellW - 12, cellH, 16);
      if (hasDinerArt(this, b.art)) {
        const img = this.add.image(cx, top + 68, dxKey(b.art));
        img.setScale(108 / Math.max(img.width, img.height));
        if (!earned) img.setTint(0x555555).setAlpha(0.55);
      } else {
        this.add.circle(cx, top + 68, 46, earned ? 0xf6c445 : 0x999999, 1).setStrokeStyle(4, INK, 1);
      }
      this.add.text(cx, top + 134, b.name, { fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: earned ? '#2B1B17' : '#6b5a52', align: 'center', wordWrap: { width: cellW - 28 } }).setOrigin(0.5, 0);
      const p = progressOf(b, stats);
      const line = earned ? 'Earned!' : `${b.goal}\n${p.have.toLocaleString('en-US')} / ${p.target.toLocaleString('en-US')}`;
      this.add.text(cx, top + 162, line, { fontFamily: FONT, fontSize: '16px', color: earned ? '#B8730F' : '#5a463e', align: 'center', wordWrap: { width: cellW - 30 } }).setOrigin(0.5, 0);
    });
    this.badgeObjs = this.children.list.slice(mark);
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
      this.pagedShown = shown;
      if (this.pagedHidden) shown.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
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
