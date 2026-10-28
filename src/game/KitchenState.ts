import { burnWindowFor, cookPhase, isEdible, type CookPhase } from './cook';
import { defaultConfig, levelDef, xpForLevel, type FriedKind, type GameConfig, type ItemKind } from './config';
import { makeRng, randInt, randRange, type Rng } from './rng';

/**
 * All gameplay state lives here. It has no Phaser code and no animation code:
 * views read this state and play effects from the events it emits.
 *
 * Kitchen flow (mirrors the reference video):
 * - Fries: tap the fries bin (or an empty vat), they fry in a vat, tap the vat to put them on a side plate.
 * - Burger: tap the buns (a bun lands on a plate), tap the patty tray (a patty goes on the grill),
 *   flip it, tap it to put it on the burger, then add lettuce and tomato. The top bun closes it.
 * - Serve: drag a finished item to the customer who ordered it.
 */

export interface Fry {
  kind: FriedKind;
  t: number;
  phase: CookPhase;
}
export interface Oven {
  t: number;
  phase: CookPhase;
}
export interface Patty {
  side: 1 | 2;
  t: number;
  phase: CookPhase;
}
export interface SlotItem {
  id: number;
  kind: ItemKind;
  /** Burger layers placed so far (names from the recipe). Empty for fries. */
  placed: string[];
  /** True while a burger is still waiting for layers. */
  building: boolean;
}
export type SlotRow = 'plate' | 'side';
export interface Slot {
  index: number;
  row: SlotRow;
  item: SlotItem | null;
}
export interface Customer {
  id: number;
  seat: number;
  look: number;
  items: ItemKind[];
  delivered: boolean[];
  price: number;
  patience: number;
  patienceMax: number;
  age: number;
  mood: 'waiting' | 'happy' | 'angry';
  leaveIn: number; // seconds until removal once happy or angry
}

export type GameEvent =
  | { type: 'fryStart'; vat: number; kind: FriedKind }
  | { type: 'fryPhase'; vat: number; phase: CookPhase }
  | { type: 'ovenStart'; oven: number }
  | { type: 'ovenPhase'; oven: number; phase: CookPhase }
  | { type: 'pattyStart'; burner: number }
  | { type: 'pattyPhase'; burner: number; phase: CookPhase }
  | { type: 'pattyFlip'; burner: number }
  | { type: 'collect'; from: 'fryer' | 'oven'; index: number; slot: number }
  | { type: 'buildStart'; slot: number }
  | { type: 'layerAdded'; slot: number; layer: string; burner?: number }
  | { type: 'burgerDone'; slot: number }
  | { type: 'discard'; where: 'vat' | 'burner' | 'oven' | 'slot' | 'build'; index: number; penalty: boolean }
  | { type: 'burnt'; where: 'vat' | 'burner' | 'oven'; index: number }
  | { type: 'arrive'; customer: number }
  | { type: 'deliver'; customer: number; slot: number; itemIndex: number }
  | { type: 'wrongDrop'; slot: number; customer: number | null }
  | { type: 'orderDone'; customer: number; coins: number; tip: number; xp: number; fast: boolean }
  | { type: 'angryLeave'; customer: number }
  | { type: 'leave'; customer: number }
  | { type: 'levelUp'; level: number; coins: number; unlocks: string[] }
  | { type: 'closed' }
  | { type: 'reopened' }
  | { type: 'invalid'; message: string };

export interface SaveSlice {
  level: number;
  xp: number;
  coins: number;
}

const LEAVE_DELAY = 0.9;
const ARRIVE_GRACE = 0.7;
const LAYER_LABEL: Record<string, string> = {
  bun_bottom: 'the bun',
  patty: 'a patty',
  lettuce: 'lettuce',
  tomato: 'tomato',
  bun_top: 'the top bun',
};

export class KitchenState {
  readonly cfg: GameConfig;
  level: number;
  xp: number;
  coins: number;
  reputation: number;
  closed = false;
  vats: (Fry | null)[];
  burners: (Patty | null)[];
  ovens: (Oven | null)[];
  /** Plates first (burgers), then side slots (fries). */
  slots: Slot[];
  customers: Customer[] = [];
  events: GameEvent[] = [];
  served = 0;
  burgersServed = 0;
  /** How many times the player has closed at each level (drives quiet rubber-banding). */
  closesAtLevel = new Map<number, number>();

  private nextId = 1;
  private nextArrival = 1; // first customer arrives at about second 1
  private rng: Rng;

  constructor(save: SaveSlice = { level: 1, xp: 0, coins: 0 }, cfg: GameConfig = defaultConfig, seed = Date.now()) {
    this.cfg = cfg;
    this.level = save.level;
    this.xp = save.xp;
    this.coins = save.coins;
    this.reputation = cfg.xp.reputation.start;
    this.rng = makeRng(seed);
    const s = cfg.recipes.settings;
    this.vats = Array.from({ length: s.fryVats }, () => null);
    this.burners = Array.from({ length: s.grillBurners }, () => null);
    this.ovens = Array.from({ length: s.ovens }, () => null);
    this.slots = [
      ...Array.from({ length: s.plateSlots }, (_, i): Slot => ({ index: i, row: 'plate', item: null })),
      ...Array.from({ length: s.sideSlots }, (_, i): Slot => ({ index: s.plateSlots + i, row: 'side', item: null })),
    ];
  }

  get xpNeeded(): number {
    return xpForLevel(this.cfg, this.level);
  }
  get levelInfo() {
    return levelDef(this.cfg, this.level);
  }
  get layers(): string[] {
    return this.cfg.recipes.items.burger.layers ?? [];
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private burnWindow(base: number): number {
    const s = this.cfg.recipes.settings;
    return burnWindowFor(base, this.level, s.beginnerMaxLevel, s.beginnerBurnBonus);
  }
  private emit(e: GameEvent) {
    this.events.push(e);
  }
  private invalid(message: string) {
    this.emit({ type: 'invalid', message });
  }
  private freeSlot(row: SlotRow): Slot | undefined {
    return this.slots.find((s) => s.row === row && s.item === null);
  }
  private nextLayer(item: SlotItem): string | undefined {
    return this.layers[item.placed.length];
  }
  /** Burgers that still need layers, oldest first. */
  buildingSlots(): Slot[] {
    return this.slots.filter((s) => s.item?.building);
  }

  // ----- time -----

  update(dt: number): void {
    if (this.closed) return;
    this.updateCooking(dt);
    this.updateCustomers(dt);
    this.updateArrivals(dt);
  }

  private updateCooking(dt: number): void {
    this.vats.forEach((v, i) => {
      if (!v) return;
      const fry = this.cfg.recipes.items[v.kind];
      v.t += dt;
      const phase = cookPhase(v.t, fry.readyAfter!, this.burnWindow(fry.burnWindow));
      if (phase !== v.phase) {
        v.phase = phase;
        this.emit({ type: 'fryPhase', vat: i, phase });
        if (phase === 'burnt') this.onBurnt('vat', i);
      }
    });
    const pizza = this.cfg.recipes.items.pizza;
    this.ovens.forEach((o, i) => {
      if (!o) return;
      o.t += dt;
      const phase = cookPhase(o.t, pizza.readyAfter!, this.burnWindow(pizza.burnWindow));
      if (phase !== o.phase) {
        o.phase = phase;
        this.emit({ type: 'ovenPhase', oven: i, phase });
        if (phase === 'burnt') this.onBurnt('oven', i);
      }
    });
    const burger = this.cfg.recipes.items.burger;
    this.burners.forEach((p, i) => {
      if (!p) return;
      p.t += dt;
      const phase = cookPhase(p.t, burger.sideSeconds!, this.burnWindow(burger.burnWindow));
      if (phase !== p.phase) {
        p.phase = phase;
        this.emit({ type: 'pattyPhase', burner: i, phase });
        if (phase === 'burnt') this.onBurnt('burner', i);
      }
    });
  }

  private onBurnt(where: 'vat' | 'burner' | 'oven', index: number): void {
    this.emit({ type: 'burnt', where, index });
    this.addReputation(-this.cfg.recipes.settings.burnReputationPenalty);
  }

  private updateCustomers(dt: number): void {
    for (const c of [...this.customers]) {
      c.age += dt;
      if (c.mood === 'waiting') {
        if (c.age > ARRIVE_GRACE) c.patience -= dt;
        if (c.patience <= 0) {
          c.patience = 0;
          c.mood = 'angry';
          c.leaveIn = LEAVE_DELAY;
          this.emit({ type: 'angryLeave', customer: c.id });
          this.addReputation(-this.cfg.xp.reputation.angryLeave);
          if (this.closed) return;
        }
      } else {
        c.leaveIn -= dt;
        if (c.leaveIn <= 0) {
          this.customers = this.customers.filter((x) => x.id !== c.id);
          this.emit({ type: 'leave', customer: c.id });
        }
      }
    }
  }

  private updateArrivals(dt: number): void {
    this.nextArrival -= dt;
    if (this.nextArrival > 0) return;
    const info = this.levelInfo;
    const active = this.customers.filter((c) => c.mood === 'waiting').length;
    if (active >= info.maxCustomers) {
      this.nextArrival = 1;
      return;
    }
    this.spawnCustomer();
    // Quiet rubber-banding: after repeated closes at this level, arrivals get slightly slower.
    const slow = 1 + 0.1 * Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    this.nextArrival = randRange(this.rng, info.arrivalGap[0], info.arrivalGap[1]) * slow;
  }

  private spawnCustomer(): void {
    const info = this.levelInfo;
    const used = new Set(this.customers.map((c) => c.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const size = randInt(this.rng, info.orderSize[0], info.orderSize[1]);
    const items: ItemKind[] = [];
    for (let i = 0; i < size; i++) {
      // The first burger is guaranteed soon after it unlocks so the tutorial can teach it.
      const wantBurger = this.level >= 2 && this.burgersServed === 0 && i === 0;
      items.push(wantBurger ? 'burger' : info.items[randInt(this.rng, 0, info.items.length - 1)]);
    }
    const price = items.reduce((sum, k) => sum + this.cfg.recipes.items[k].price, 0);
    const closes = Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const type = this.cfg.customers.types.regular;
    const patienceMax = info.patience * type.patienceMult * (1 + 0.1 * closes);
    const c: Customer = {
      id: this.nextId++,
      seat,
      look: randInt(this.rng, 0, 2), // three supplied customer looks for now
      items,
      delivered: items.map(() => false),
      price,
      patience: patienceMax,
      patienceMax,
      age: 0,
      mood: 'waiting',
      leaveIn: 0,
    };
    this.customers.push(c);
    this.emit({ type: 'arrive', customer: c.id });
  }

  // ----- fryer -----

  /** Put raw fries or nuggets from their bin into a free vat. */
  startFry(kind: FriedKind = 'fries'): void {
    if (this.closed) return;
    const def = this.cfg.recipes.items[kind];
    if (this.level < def.unlockLevel) return this.invalid(`${def.name} unlock at Lv ${def.unlockLevel}`);
    const i = this.vats.findIndex((v) => !v);
    if (i < 0) return this.invalid('The fryer is full');
    this.vats[i] = { kind, t: 0, phase: 'cooking' };
    this.emit({ type: 'fryStart', vat: i, kind });
  }

  /** Tap a vat: start fries if empty, otherwise collect or discard. */
  tapFryer(vat: number): void {
    if (this.closed) return;
    const v = this.vats[vat];
    if (!v) return this.invalid('Tap the fries or nuggets bin first');
    if (v.phase === 'cooking') return this.invalid('Not ready yet');
    if (v.phase === 'burnt') {
      this.vats[vat] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'vat', index: vat, penalty: true });
      return;
    }
    const slot = this.freeSlot('side');
    if (!slot) return this.invalid('The plate is full');
    this.vats[vat] = null;
    slot.item = { id: this.nextId++, kind: v.kind, placed: [], building: false };
    this.emit({ type: 'collect', from: 'fryer', index: vat, slot: slot.index });
  }

  // ----- oven -----

  /** Put a raw pizza (from the dough bases) into a free oven. */
  startPizza(): void {
    if (this.closed) return;
    const def = this.cfg.recipes.items.pizza;
    if (this.level < def.unlockLevel) return this.invalid('Pizza unlocks at Lv ' + def.unlockLevel);
    const i = this.ovens.findIndex((o) => !o);
    if (i < 0) return this.invalid('The oven is full');
    this.ovens[i] = { t: 0, phase: 'cooking' };
    this.emit({ type: 'ovenStart', oven: i });
  }

  /** Tap the oven: collect a ready pizza onto a plate, or throw away a burnt one. */
  tapOven(oven = 0): void {
    if (this.closed) return;
    const o = this.ovens[oven];
    if (!o) return this.invalid('Tap the dough first');
    if (o.phase === 'cooking') return this.invalid('Not ready yet');
    if (o.phase === 'burnt') {
      this.ovens[oven] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'oven', index: oven, penalty: true });
      return;
    }
    const slot = this.freeSlot('plate');
    if (!slot) return this.invalid('No free plate');
    this.ovens[oven] = null;
    slot.item = { id: this.nextId++, kind: 'pizza', placed: [], building: false };
    this.emit({ type: 'collect', from: 'oven', index: oven, slot: slot.index });
  }

  // ----- grill -----

  /** Put a raw patty from the tray on a free burner. */
  startPatty(burner?: number): void {
    if (this.closed) return;
    const def = this.cfg.recipes.items.burger;
    if (this.level < def.unlockLevel) return this.invalid('Burgers unlock at Lv ' + def.unlockLevel);
    const i = burner !== undefined && !this.burners[burner] ? burner : this.burners.findIndex((p) => !p);
    if (i < 0) return this.invalid('The grill is full');
    this.burners[i] = { side: 1, t: 0, phase: 'cooking' };
    this.emit({ type: 'pattyStart', burner: i });
  }

  /** Tap a burner: start a patty if empty, flip it, or put the finished patty on a burger. */
  tapGrill(burner: number): void {
    if (this.closed) return;
    const p = this.burners[burner];
    if (!p) return this.invalid('Tap the patties first');
    if (p.phase === 'cooking') return this.invalid('Not ready yet');
    if (p.phase === 'burnt') {
      this.burners[burner] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'burner', index: burner, penalty: true });
      return;
    }
    if (p.side === 1) {
      p.side = 2;
      p.t = 0;
      p.phase = 'cooking';
      this.emit({ type: 'pattyFlip', burner });
      return;
    }
    // Second side is done: the patty goes onto a burger that is waiting for it.
    const build = this.buildingSlots().find((s) => this.nextLayer(s.item!) === 'patty');
    if (!build) {
      return this.invalid(this.buildingSlots().length === 0 ? 'Tap the buns first' : this.waitingMessage());
    }
    this.burners[burner] = null;
    this.addLayer(build, 'patty', burner);
  }

  // ----- assembly -----

  tapBuns(): void {
    if (this.closed) return;
    if (this.level < this.cfg.recipes.items.burger.unlockLevel) return this.invalid('Burgers unlock at Lv 2');
    const slot = this.freeSlot('plate');
    if (!slot) return this.invalid('No free plate');
    slot.item = { id: this.nextId++, kind: 'burger', placed: ['bun_bottom'], building: true };
    this.emit({ type: 'buildStart', slot: slot.index });
  }

  tapTopping(layer: 'lettuce' | 'tomato'): void {
    if (this.closed) return;
    if (this.level < this.cfg.recipes.items.burger.unlockLevel) return this.invalid('Burgers unlock at Lv 2');
    const builds = this.buildingSlots();
    if (builds.length === 0) return this.invalid('Tap the buns first');
    const build = builds.find((s) => this.nextLayer(s.item!) === layer);
    if (!build) return this.invalid(this.waitingMessage());
    this.addLayer(build, layer);
  }

  /** What the oldest unfinished burger is waiting for, for the "wrong order" popup. */
  private waitingMessage(): string {
    const first = this.buildingSlots()[0]?.item;
    const next = first ? this.nextLayer(first) : undefined;
    return next ? `Add ${LAYER_LABEL[next] ?? next} first` : 'Nothing to add';
  }

  private addLayer(slot: Slot, layer: string, burner?: number): void {
    const item = slot.item!;
    item.placed.push(layer);
    this.emit({ type: 'layerAdded', slot: slot.index, layer, burner });
    // The top bun closes the burger as soon as everything under it is in place.
    if (this.nextLayer(item) === 'bun_top') {
      item.placed.push('bun_top');
      item.building = false;
      this.emit({ type: 'burgerDone', slot: slot.index });
    }
  }

  tapTrash(slotIndex?: number): void {
    if (this.closed) return;
    const target = slotIndex !== undefined ? this.slots[slotIndex] : this.buildingSlots()[0];
    if (!target || !target.item) return this.invalid('Nothing to throw away');
    const wasBuilding = target.item.building;
    target.item = null;
    if (!wasBuilding) this.discardPenalty();
    this.emit({ type: 'discard', where: wasBuilding ? 'build' : 'slot', index: target.index, penalty: !wasBuilding });
  }

  private discardPenalty(): void {
    this.coins = Math.max(0, this.coins - this.cfg.recipes.settings.trashPenaltyCoins);
  }

  // ----- serving -----

  /** Drop a finished item on a customer. Returns true if it was accepted. */
  serve(slotIndex: number, customerId: number): boolean {
    if (this.closed) return false;
    const slot = this.slots[slotIndex];
    const item = slot?.item;
    const c = this.customers.find((x) => x.id === customerId);
    if (!item || item.building || !c || c.mood !== 'waiting') {
      this.emit({ type: 'wrongDrop', slot: slotIndex, customer: c?.id ?? null });
      return false;
    }
    const need = c.items.findIndex((k, i) => k === item.kind && !c.delivered[i]);
    if (need < 0) {
      // Wrong customer: snap back, no penalty.
      this.emit({ type: 'wrongDrop', slot: slotIndex, customer: c.id });
      return false;
    }
    slot.item = null;
    c.delivered[need] = true;
    this.emit({ type: 'deliver', customer: c.id, slot: slotIndex, itemIndex: need });
    if (item.kind === 'burger') this.burgersServed++;
    if (c.delivered.every(Boolean)) this.completeOrder(c);
    return true;
  }

  private completeOrder(c: Customer): void {
    const frac = c.patience / c.patienceMax;
    const fast = frac >= this.cfg.xp.speedBonusPatienceFraction;
    const tip = fast ? Math.round(c.price * this.cfg.xp.tipFraction * frac) : 0;
    const baseXp = c.items.reduce((s, k) => s + this.cfg.recipes.items[k].xp, 0);
    const xp = baseXp + (fast ? this.cfg.xp.speedBonusXp : 0);
    c.mood = 'happy';
    c.leaveIn = LEAVE_DELAY;
    this.served++;
    this.coins += c.price + tip;
    this.addReputation(this.cfg.xp.reputation.serveGain);
    this.emit({ type: 'orderDone', customer: c.id, coins: c.price + tip, tip, xp, fast });
    this.addXp(xp);
  }

  private addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      const reward = this.cfg.xp.levelUpCoins.base + this.cfg.xp.levelUpCoins.perLevel * this.level;
      this.coins += reward;
      this.emit({ type: 'levelUp', level: this.level, coins: reward, unlocks: this.levelInfo.unlocks });
    }
  }

  // ----- reputation and closing -----

  private addReputation(delta: number): void {
    this.reputation = Math.max(0, Math.min(100, this.reputation + delta));
    if (this.reputation <= 0 && !this.closed) {
      this.closed = true;
      this.closesAtLevel.set(this.level, (this.closesAtLevel.get(this.level) ?? 0) + 1);
      this.emit({ type: 'closed' });
    }
  }

  /** Reopen after closing. The player keeps level, XP and coins; the kitchen starts fresh. */
  reopen(): void {
    if (!this.closed) return;
    this.closed = false;
    this.reputation = this.cfg.xp.reputation.reopenTo;
    this.vats = this.vats.map(() => null);
    this.burners = this.burners.map(() => null);
    this.ovens = this.ovens.map(() => null);
    this.slots.forEach((s) => (s.item = null));
    this.customers = [];
    this.nextArrival = 1;
    this.emit({ type: 'reopened' });
  }

  // ----- helpers for views and the tutorial -----

  /** True if any waiting customer still needs this kind of item. */
  isNeeded(kind: ItemKind): boolean {
    return this.customers.some((c) => c.mood === 'waiting' && c.items.some((k, i) => k === kind && !c.delivered[i]));
  }

  pattyEdible(i: number): boolean {
    const p = this.burners[i];
    return !!p && isEdible(p.phase);
  }
}
