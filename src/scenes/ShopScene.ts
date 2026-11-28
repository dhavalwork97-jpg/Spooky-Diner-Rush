import Phaser from 'phaser';
import { pick, pickedOption, slotUnlocked, slotsFor, withChoices, type ChoiceRestaurant } from '../game/choices';
import { CREAM, INK, LEAF, ORANGE } from '../art/builders';
import type { KitchenState } from '../game/KitchenState';
import { titleForLevel } from '../game/career';
import { buy, buyLabel, modsFor, tierOf } from '../game/shop';
import { buyDecor, decorLabel, perkText, withDecorPerks } from '../game/decor';
import { defaultTacoConfig } from '../game/taco/tacoConfig';
import { buyTaco, tacoBuyLabel, tacoEffectText, tacoModsFor, tacoTierOf } from '../game/taco/tacoShop';
import { defaultPizzaConfig } from '../game/pizza/pizzaConfig';
import { buyPizza, pizzaBuyLabel, pizzaEffectText, pizzaModsFor, pizzaTierOf } from '../game/pizza/pizzaShop';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const PANEL_W = 1040;
const ROW_H = 104;
/** Decor has up to seven rows, so they are shorter than the upgrade rows. */
const DECOR_ROW_H = 74;
const DECOR_BTN_H = 54;
const ROW_TOP = 118;
const BTN_W = 200;
const BTN_H = 92;
/** The panel fits five rows; more upgrades go on further pages. */
const PAGE_SIZE = 5;

/** What the Shop reads and writes. The diner's and the Taco Truck's kitchen states both fit: Lv, coins and upgrades are shared. */
export type ShopState = Pick<KitchenState, 'cfg' | 'level' | 'coins' | 'mods'>;

export interface ShopData {
  state: ShopState;
  /** Set by the Taco Truck: the Shop then shows the truck's own upgrades (own list, own save map), with tiers opening up as the menu grows. */
  taco?: { menuStep: number };
  /** Set by the Pizza Place: its own upgrades (own list, own save map `pizzaOwned`), tiers opening up with the Pizza menu step. */
  pizza?: { menuStep: number };
  /** Called after the shop closes (the game scene resumes itself here). */
  onClose: () => void;
}

/**
 * The Shop: a scene launched over the paused game. Buying goes through the pure `buy()` in
 * src/game/shop.ts; this scene only draws and passes the result back into the model and save.
 */
export class ShopScene extends Phaser.Scene {
  private state!: ShopState;
  private onClose!: () => void;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private closing = false;
  private tab: 'upgrades' | 'decor' | 'choices' = 'upgrades';
  private page = 0;
  private taco: ShopData['taco'];
  private pizza: ShopData['pizza'];

  constructor() {
    super('Shop');
  }

  init(data: ShopData): void {
    this.state = data.state;
    this.onClose = data.onClose;
    this.taco = data.taco;
    this.pizza = data.pizza;
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
    this.titleText.setText(this.taco ? `Taco Truck  ·  Lv ${s.level}` : this.pizza ? `Pizza Place  ·  Lv ${s.level}` : `Lv ${s.level}  ·  ${titleForLevel(s.cfg, s.level).title}`);
    this.coinText.setText(String(s.coins));

    // The truck has no Decor tab (decor belongs to the diner's walls), just its upgrades.
    (this.taco || this.pizza ? (['upgrades', 'choices'] as const) : (['upgrades', 'decor', 'choices'] as const)).forEach((t, i) => {
      const on = this.tab === t;
      const label = t === 'upgrades' ? 'Upgrades' : t === 'decor' ? 'Decor' : 'Choices';
      this.rows.push(this.makeButton(x0 + 280 + i * 146, 52, label, 140, 60, on ? ORANGE : 0x9aa7b5, () => {
        if (this.tab !== t) {
          this.tab = t;
          this.refresh();
        }
      }));
    });

    const pages = Math.max(1, Math.ceil((this.pizza ? defaultPizzaConfig.upgrades.length : s.cfg.upgrades.upgrades.length) / PAGE_SIZE));
    if (this.tab === 'upgrades' && pages > 1) {
      const next = (this.page + 1) % pages;
      this.rows.push(this.makeButton(x0 + 280 + 3 * 146, 52, this.page + 1 < pages ? 'More' : 'Back', 140, 60, 0x2ba6a0, () => {
        this.page = next;
        this.refresh();
      }));
    }

    if (this.tab === 'choices') this.drawChoiceRows(x0);
    else if (this.taco) this.drawTacoRows(x0, this.taco.menuStep);
    else if (this.pizza) this.drawPizzaRows(x0, this.pizza.menuStep);
    else if (this.tab === 'upgrades') this.drawUpgradeRows(x0);
    else this.drawDecorRows(x0);
  }

  private rowBase(i: number, x0: number, rowH = ROW_H): { y: number; g: Phaser.GameObjects.Graphics } {
    const y = ROW_TOP + i * rowH;
    const g = this.add.graphics();
    g.fillStyle(i % 2 ? 0xf3e3bd : 0xfaedd0, 1).fillRoundedRect(x0 + 20, y, PANEL_W - 40, rowH - 8, 16);
    g.lineStyle(3, INK, 0.6).strokeRoundedRect(x0 + 20, y, PANEL_W - 40, rowH - 8, 16);
    return { y, g };
  }

  private drawDecorRows(x0: number): void {
    const s = this.state;
    const owned = SaveSystem.data.decor;
    // Chest prizes are listed only once the player has them (they cannot be bought).
    const items = s.cfg.decor.items.filter((d) => !d.chestOnly || owned.includes(d.id));
    items.forEach((d, i) => {
      const { y, g } = this.rowBase(i, x0, DECOR_ROW_H);
      const label = decorLabel(items, owned, d.id, s.level, s.coins);
      const name = this.add.text(x0 + 40, y + 6, d.name, { fontFamily: FONT, fontSize: '28px', color: '#2B1B17' });
      const perk = perkText(d);
      const desc = this.add.text(x0 + 40, y + 40, perk ? `${d.description}  ${perk}` : d.description, { fontFamily: FONT, fontSize: '19px', color: perk ? '#2f7d4f' : '#5a463e' });
      const mark = owned.includes(d.id) ? this.add.text(x0 + 600, y + 33, 'On display', { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0, 0.5) : null;
      const btn = this.makeButton(x0 + PANEL_W - 20 - 24 - BTN_W / 2, y + (DECOR_ROW_H - 8) / 2, label.text, BTN_W, DECOR_BTN_H, ORANGE, () => this.tryBuyDecor(d.id), label.enabled);
      this.rows.push(g, name, desc, btn);
      if (mark) this.rows.push(mark);
    });
    const hint = this.add.text(LOGICAL_WIDTH / 2, ROW_TOP + items.length * DECOR_ROW_H + 14, 'The first pieces are just for looks. Newer pieces give a small bonus (at most +8% each kind).', { fontFamily: FONT, fontSize: '22px', color: '#5a463e' }).setOrigin(0.5);
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

  /** The Taco Truck's upgrade rows: same layout as the diner's, with the effect in percent and a locked tier saying what has to join the menu. */
  private drawTacoRows(x0: number, menuStep: number): void {
    const s = this.state;
    const ups = defaultTacoConfig.upgrades;
    const owned = SaveSystem.data.tacoOwned;
    ups.forEach((u, i) => {
      const { y, g } = this.rowBase(i, x0);
      const tier = tacoTierOf(ups, owned, u.id);
      const label = tacoBuyLabel(defaultTacoConfig, owned, u.id, menuStep, s.coins);
      u.tiers.forEach((_, ti) => {
        const px = x0 + 390 + ti * 30;
        const py = y + 28;
        if (ti < tier) g.fillStyle(LEAF, 1).fillCircle(px, py, 10).lineStyle(3, INK, 1).strokeCircle(px, py, 10);
        else g.lineStyle(3, INK, 0.7).strokeCircle(px, py, 10);
      });
      const name = this.add.text(x0 + 40, y + 12, u.name, { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' });
      const desc = this.add.text(x0 + 40, y + 48, u.description, { fontFamily: FONT, fontSize: '20px', color: '#5a463e' });
      const note = label.needs
        ? this.add.text(x0 + 600, y + 40, label.needs, { fontFamily: FONT, fontSize: '19px', color: '#8a3b1f', wordWrap: { width: 185 }, align: 'left' }).setOrigin(0, 0.5)
        : this.add.text(x0 + 600, y + 40, tacoEffectText(u, tier), { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0, 0.5);
      const btn = this.makeButton(x0 + PANEL_W - 20 - 24 - BTN_W / 2, y + (ROW_H - 8) / 2, label.text, BTN_W, BTN_H, ORANGE, () => this.tryBuyTaco(u.id), label.enabled);
      this.rows.push(g, name, desc, note, btn);
    });
    this.rows.push(this.add.text(LOGICAL_WIDTH / 2, ROW_TOP + ups.length * ROW_H + 14, 'Faster cooking never shortens the time before food burns.', { fontFamily: FONT, fontSize: '20px', color: '#5a463e' }).setOrigin(0.5));
  }

  private tryBuyTaco(id: string): void {
    const s = this.state;
    const ups = defaultTacoConfig.upgrades;
    const r = buyTaco(ups, SaveSystem.data.tacoOwned, id, this.taco?.menuStep ?? 1, s.coins);
    if (!r.ok) {
      this.flash('Cannot buy that right now');
      return;
    }
    s.coins = r.coins;
    SaveSystem.data.tacoOwned = r.owned;
    SaveSystem.data.coins = r.coins;
    s.mods = withChoices(tacoModsFor(ups, r.owned), 'taco', SaveSystem.data.choices, s.level);
    SaveSystem.save();
    audio.play('levelUp');
    this.flash(`${ups.find((u) => u.id === id)?.name ?? id} upgraded!`);
    this.refresh();
  }

  /** The Pizza Place's upgrade rows: same layout as the diner's, with the effect in percent and a locked tier saying what has to join the menu. */
  private drawPizzaRows(x0: number, menuStep: number): void {
    const s = this.state;
    const ups = defaultPizzaConfig.upgrades;
    const owned = SaveSystem.data.pizzaOwned;
    ups.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).forEach((u, i) => {
      const { y, g } = this.rowBase(i, x0);
      const tier = pizzaTierOf(ups, owned, u.id);
      const label = pizzaBuyLabel(defaultPizzaConfig, owned, u.id, menuStep, s.coins);
      u.tiers.forEach((_, ti) => {
        const px = x0 + 390 + ti * 30;
        const py = y + 28;
        if (ti < tier) g.fillStyle(LEAF, 1).fillCircle(px, py, 10).lineStyle(3, INK, 1).strokeCircle(px, py, 10);
        else g.lineStyle(3, INK, 0.7).strokeCircle(px, py, 10);
      });
      const name = this.add.text(x0 + 40, y + 12, u.name, { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' });
      const desc = this.add.text(x0 + 40, y + 48, u.description, { fontFamily: FONT, fontSize: '20px', color: '#5a463e' });
      const note = label.needs
        ? this.add.text(x0 + 600, y + 40, label.needs, { fontFamily: FONT, fontSize: '19px', color: '#8a3b1f', wordWrap: { width: 185 }, align: 'left' }).setOrigin(0, 0.5)
        : this.add.text(x0 + 600, y + 40, pizzaEffectText(u, tier), { fontFamily: FONT, fontSize: '26px', color: '#2B1B17' }).setOrigin(0, 0.5);
      const btn = this.makeButton(x0 + PANEL_W - 20 - 24 - BTN_W / 2, y + (ROW_H - 8) / 2, label.text, BTN_W, BTN_H, ORANGE, () => this.tryBuyPizza(u.id), label.enabled);
      this.rows.push(g, name, desc, note, btn);
    });
    this.rows.push(this.add.text(LOGICAL_WIDTH / 2, ROW_TOP + Math.min(PAGE_SIZE, ups.length) * ROW_H + 14, 'Faster cooking never shortens the time before food burns.', { fontFamily: FONT, fontSize: '20px', color: '#5a463e' }).setOrigin(0.5));
  }

  private tryBuyPizza(id: string): void {
    const s = this.state;
    const ups = defaultPizzaConfig.upgrades;
    const r = buyPizza(ups, SaveSystem.data.pizzaOwned, id, this.pizza?.menuStep ?? 1, s.coins);
    if (!r.ok) {
      this.flash('Cannot buy that right now');
      return;
    }
    s.coins = r.coins;
    SaveSystem.data.pizzaOwned = r.owned;
    SaveSystem.data.coins = r.coins;
    s.mods = withChoices(pizzaModsFor(ups, r.owned), 'pizza', SaveSystem.data.choices, s.level);
    SaveSystem.save();
    audio.play('levelUp');
    this.flash(`${ups.find((u) => u.id === id)?.name ?? id} upgraded!`);
    this.refresh();
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
    s.mods = withChoices(withDecorPerks(modsFor(s.cfg.upgrades.upgrades, SaveSystem.data.owned), items, r.decor), 'diner', SaveSystem.data.choices, s.level);
    SaveSystem.data.coins = r.coins;
    SaveSystem.save();
    audio.play('levelUp');
    this.flash(`${items.find((d) => d.id === id)?.name ?? id} is up!`);
    this.refresh();
  }

  /** Chef's Choice: one row per slot with two perk cards; tap a card to pick it (free, and you can switch at any time). */
  private drawChoiceRows(x0: number): void {
    const s = this.state;
    const rest: ChoiceRestaurant = this.taco ? 'taco' : this.pizza ? 'pizza' : 'diner';
    const picks = SaveSystem.data.choices;
    slotsFor(rest).forEach((slot, i) => {
      const { y, g } = this.rowBase(i, x0);
      const open = slotUnlocked(slot, s.level);
      const chosen = pickedOption(rest, slot, picks, s.level);
      this.rows.push(g, this.add.text(x0 + 40, y + 12, slot.title, { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' }));
      if (!open) {
        this.rows.push(this.add.text(x0 + 40, y + 52, `Opens at Lv ${slot.unlockLevel}. Then pick one of two perks.`, { fontFamily: FONT, fontSize: '22px', color: '#5a463e' }));
        return;
      }
      this.rows.push(this.add.text(x0 + 40, y + 52, chosen ? 'Tap the other perk to switch.' : 'Pick one perk.', { fontFamily: FONT, fontSize: '20px', color: '#5a463e' }));
      slot.options.forEach((o, oi) => {
        const on = chosen?.id === o.id;
        const cx = x0 + 440 + oi * 290;
        const cy = y + (ROW_H - 8) / 2;
        const card = this.makeButton(cx, cy, '', 270, BTN_H, on ? LEAF : 0x9aa7b5, () => this.tryPick(rest, slot.id, o.id));
        const name = this.add.text(cx, cy - 22, on ? `${o.name}  ✓` : o.name, { fontFamily: FONT, fontSize: '26px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 }).setOrigin(0.5);
        const desc = this.add.text(cx, cy + 4, o.description, { fontFamily: FONT, fontSize: '16px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 3, wordWrap: { width: 244 }, align: 'center' }).setOrigin(0.5, 0);
        this.rows.push(card, name, desc);
      });
    });
    this.rows.push(this.add.text(LOGICAL_WIDTH / 2, ROW_TOP + 3 * ROW_H + 14, 'Perks are small boosts that stack with your upgrades. They never cost coins.', { fontFamily: FONT, fontSize: '19px', color: '#5a463e' }).setOrigin(0.5, 0));
  }

  private tryPick(rest: ChoiceRestaurant, slotId: string, optionId: string): void {
    const s = this.state;
    const next = pick(rest, slotId, optionId, SaveSystem.data.choices, s.level);
    if (!next) {
      this.flash('That perk is not open yet');
      return;
    }
    SaveSystem.data.choices = next;
    s.mods = this.modsNow(rest);
    SaveSystem.save();
    audio.play('levelUp');
    this.flash('Perk picked!');
    this.refresh();
  }

  /** The mods for this restaurant from what is owned plus the picked perks. */
  private modsNow(rest: ChoiceRestaurant): typeof this.state.mods {
    const s = this.state;
    const d = SaveSystem.data;
    const choices = d.choices;
    if (rest === 'taco') return withChoices(tacoModsFor(defaultTacoConfig.upgrades, d.tacoOwned), 'taco', choices, s.level);
    if (rest === 'pizza') return withChoices(pizzaModsFor(defaultPizzaConfig.upgrades, d.pizzaOwned), 'pizza', choices, s.level);
    return withChoices(withDecorPerks(modsFor(s.cfg.upgrades.upgrades, d.owned), s.cfg.decor.items, d.decor), 'diner', choices, s.level);
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
    s.mods = withChoices(withDecorPerks(modsFor(ups, r.owned), s.cfg.decor.items, SaveSystem.data.decor), 'diner', SaveSystem.data.choices, s.level);
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
