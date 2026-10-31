import { burnWindowFor, cookPhase, isEdible, type CookPhase } from './cook';
import { defaultConfig, levelDef, xpForLevel, type EventDef, type FriedKind, type GameConfig, type ItemKind } from './config';
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
/** A cup filling at the dispenser, or a cone swirling in the ice cream machine. */
export interface Pour {
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
export type SlotRow = 'plate' | 'side' | 'pizza';
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
  type: string;
  mood: 'waiting' | 'happy' | 'angry';
  leaveIn: number; // seconds until removal once happy or angry
}

export type GameEvent =
  | { type: 'fryStart'; vat: number; kind: FriedKind }
  | { type: 'fryPhase'; vat: number; phase: CookPhase }
  | { type: 'ovenStart'; oven: number }
  | { type: 'ovenPhase'; oven: number; phase: CookPhase }
  | { type: 'drinkStart'; spout: number }
  | { type: 'drinkPhase'; spout: number; phase: CookPhase }
  | { type: 'coneStart'; machine: number }
  | { type: 'conePhase'; machine: number; phase: CookPhase }
  | { type: 'melted'; machine: number }
  | { type: 'pattyStart'; burner: number }
  | { type: 'pattyPhase'; burner: number; phase: CookPhase }
  | { type: 'pattyFlip'; burner: number }
  | { type: 'collect'; from: 'fryer' | 'oven' | 'dispenser' | 'icecream'; index: number; slot: number }
  | { type: 'buildStart'; slot: number }
  | { type: 'layerAdded'; slot: number; layer: string; burner?: number }
  | { type: 'burgerDone'; slot: number }
  | { type: 'discard'; where: 'vat' | 'burner' | 'oven' | 'slot' | 'build'; index: number; penalty: boolean }
  | { type: 'burnt'; where: 'vat' | 'burner' | 'oven'; index: number }
  | { type: 'arrive'; customer: number }
  | { type: 'deliver'; customer: number; slot: number; itemIndex: number }
  | { type: 'wrongDrop'; slot: number; customer: number | null; penalty?: boolean }
  | { type: 'comboChanged'; combo: number; max: number; broken: boolean }
  | { type: 'eventStart'; id: string; name: string; duration: number }
  | { type: 'eventEnd'; id: string }
  | { type: 'streakBonus'; xp: number }
  | { type: 'orderDone'; customer: number; coins: number; tip: number; xp: number; fast: boolean; rush: boolean; combo: number; mult: number }
  | { type: 'angryLeave'; customer: number }
  | { type: 'leave'; customer: number }
  | { type: 'levelUp'; level: number; coins: number; unlocks: string[] }
  | { type: 'closed' }
  | { type: 'reopened' }
  | { type: 'invalid'; message: string };

/** Upgrade hooks. The Shop (Milestone 4) changes these; the game already reads them. */
export interface Mods {
  fryerSpeed: number;
  grillSpeed: number;
  ovenSpeed: number;
  patience: number;
  tips: number;
}
export interface ActiveEvent {
  def: EventDef;
  remaining: number;
}

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
  spouts: (Pour | null)[];
  cones: (Pour | null)[];
  /** Plates first (burgers), then side slots (fries). */
  slots: Slot[];
  customers: Customer[] = [];
  events: GameEvent[] = [];
  served = 0;
  burgersServed = 0;
  /** How many times the player has closed at each level (drives quiet rubber-banding). */
  closesAtLevel = new Map<number, number>();
  combo = 0;
  /** Serves in a row with no burn and no angry customer; pays a rare XP bonus. */
  streak = 0;
  clock = 0;
  event: ActiveEvent | null = null;
  nextEventIn: number;
  mods: Mods = { fryerSpeed: 1, grillSpeed: 1, ovenSpeed: 1, patience: 1, tips: 1 };

  private nextId = 1;
  nextArrival = 1; // first customer arrives at about second 1
  private rng: Rng;

  constructor(save: SaveSlice = { level: 1, xp: 0, coins: 0 }, cfg: GameConfig = defaultConfig, seed = Date.now()) {
    this.cfg = cfg;
    this.level = save.level;
    this.xp = save.xp;
    this.coins = save.coins;
    this.reputation = cfg.xp.reputation.start;
    this.rng = makeRng(seed);
    this.nextEventIn = cfg.events.firstAfter;
    const s = cfg.recipes.settings;
    this.vats = Array.from({ length: s.fryVats }, () => null);
    this.burners = Array.from({ length: s.grillBurners }, () => null);
    this.ovens = Array.from({ length: s.ovens }, () => null);
    this.spouts = Array.from({ length: s.drinkSpouts }, () => null);
    this.cones = Array.from({ length: s.iceCreamMachines }, () => null);
    this.slots = [
      ...Array.from({ length: s.plateSlots }, (_, i): Slot => ({ index: i, row: 'plate', item: null })),
      ...Array.from({ length: s.sideSlots }, (_, i): Slot => ({ index: s.plateSlots + i, row: 'side', item: null })),
      ...Array.from({ length: s.pizzaSlots }, (_, i): Slot => ({ index: s.plateSlots + s.sideSlots + i, row: 'pizza', item: null })),
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

  /** Current wave of play (calm, build, rush, calm), driven by data. */
  get wave(): { name: string; gapMult: number } {
    const phases = this.cfg.waves.phases;
    const cycle = phases.reduce((n, p) => n + p.seconds, 0);
    let t = this.clock % cycle;
    for (const p of phases) {
      if (t < p.seconds) return p;
      t -= p.seconds;
    }
    return phases[0];
  }
  get comboMultiplier(): number {
    const c = this.cfg.combo;
    return this.combo > 0 ? Math.min(c.maxMultiplier, 1 + c.multiplierPerStep * (this.combo - 1)) : 1;
  }
  /** True while a waiting customer is still fast enough to earn the Rush tag. */
  isRush(c: Customer): boolean {
    return c.mood === 'waiting' && c.patience / c.patienceMax >= this.cfg.combo.rush.patienceFraction && c.delivered.some((d) => !d);
  }

  update(dt: number): void {
    if (this.closed) return;
    this.clock += dt;
    this.updateEvents(dt);
    this.updateCooking(dt);
    this.updateCustomers(dt);
    this.updateArrivals(dt);
  }

  private updateCooking(dt: number): void {
    this.vats.forEach((v, i) => {
      if (!v) return;
      const fry = this.cfg.recipes.items[v.kind];
      v.t += dt * this.mods.fryerSpeed;
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
      o.t += dt * this.mods.ovenSpeed * (this.event?.def.ovenSpeed ?? 1);
      const phase = cookPhase(o.t, pizza.readyAfter!, this.burnWindow(pizza.burnWindow));
      if (phase !== o.phase) {
        o.phase = phase;
        this.emit({ type: 'ovenPhase', oven: i, phase });
        if (phase === 'burnt') this.onBurnt('oven', i);
      }
    });
    // Drinks fill and then wait (they never spoil); a ready cone melts, which costs nothing.
    const drink = this.cfg.recipes.items.drink;
    this.spouts.forEach((p, i) => {
      if (!p) return;
      p.t += dt;
      const phase = p.t < drink.readyAfter! ? 'cooking' : 'ready';
      if (phase !== p.phase) {
        p.phase = phase;
        this.emit({ type: 'drinkPhase', spout: i, phase });
      }
    });
    const cone = this.cfg.recipes.items.icecream;
    this.cones.forEach((p, i) => {
      if (!p) return;
      p.t += dt;
      const phase = cookPhase(p.t, cone.readyAfter!, cone.burnWindow);
      if (phase === 'burnt') {
        this.cones[i] = null;
        this.emit({ type: 'melted', machine: i });
        return;
      }
      if (phase !== p.phase) {
        p.phase = phase;
        this.emit({ type: 'conePhase', machine: i, phase });
      }
    });
    const burger = this.cfg.recipes.items.burger;
    this.burners.forEach((p, i) => {
      if (!p) return;
      p.t += dt * this.mods.grillSpeed;
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
    this.streak = 0;
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
          this.streak = 0;
          this.breakCombo();
          this.addReputation(-this.cfg.xp.reputation.angryLeave * this.cfg.customers.types[c.type].repMult);
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
    const gap = randRange(this.rng, info.arrivalGap[0], info.arrivalGap[1]);
    this.nextArrival = gap * slow * this.wave.gapMult * (this.event?.def.arrivalMult ?? 1);
  }

  private pickType(): string {
    const weights = this.levelInfo.types ?? { regular: 1 };
    const entries = Object.entries(weights).filter(([k, w]) => w > 0 && this.cfg.customers.types[k]);
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let r = this.rng() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return 'regular';
  }

  spawnCustomer(forceType?: string): void {
    const info = this.levelInfo;
    const typeKey = forceType && this.cfg.customers.types[forceType] ? forceType : this.pickType();
    const type = this.cfg.customers.types[typeKey];
    const used = new Set(this.customers.map((c) => c.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const size = Math.min(3, randInt(this.rng, info.orderSize[0], info.orderSize[1]) + type.extraItems);
    const items: ItemKind[] = [];
    for (let i = 0; i < size; i++) {
      // The first burger is guaranteed soon after it unlocks so the tutorial can teach it.
      const wantBurger = this.level >= 2 && this.burgersServed === 0 && i === 0;
      items.push(wantBurger ? 'burger' : info.items[randInt(this.rng, 0, info.items.length - 1)]);
    }
    const price = Math.round(items.reduce((sum, k) => sum + this.cfg.recipes.items[k].price, 0) * type.payMult);
    const closes = Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const patienceMax = info.patience * type.patienceMult * this.mods.patience * (1 + 0.1 * closes);
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
      type: typeKey,
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

  /** Tap the oven: collect a ready pizza onto a pizza plate, or throw away a burnt one. */
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
    // A pizza has its own plates (the dough bases): burgers and drinks can never keep it in the oven to burn.
    const slot = this.freeSlot('pizza');
    if (!slot) return this.invalid('Serve a pizza first: the pizza plates are full');
    this.ovens[oven] = null;
    slot.item = { id: this.nextId++, kind: 'pizza', placed: [], building: false };
    this.emit({ type: 'collect', from: 'oven', index: oven, slot: slot.index });
  }

  // ----- drinks and ice cream -----

  /** A drink or cone goes on a free side slot, or on a free plate when the side is full. */
  private freeServeSlot(): Slot | undefined {
    return this.freeSlot('side') ?? this.freeSlot('plate');
  }

  /** Tap the dispenser: collect a full cup if one is waiting, otherwise start filling one. */
  tapDrinks(): void {
    if (this.closed) return;
    const def = this.cfg.recipes.items.drink;
    if (this.level < def.unlockLevel) return this.invalid(`Drinks unlock at Lv ${def.unlockLevel}`);
    const full = this.spouts.findIndex((p) => p?.phase === 'ready');
    if (full >= 0) {
      const slot = this.freeServeSlot();
      if (!slot) return this.invalid('The plate is full');
      this.spouts[full] = null;
      slot.item = { id: this.nextId++, kind: 'drink', placed: [], building: false };
      this.emit({ type: 'collect', from: 'dispenser', index: full, slot: slot.index });
      return;
    }
    const i = this.spouts.findIndex((p) => !p);
    if (i < 0) return this.invalid('Cups are still filling');
    this.spouts[i] = { t: 0, phase: 'cooking' };
    this.emit({ type: 'drinkStart', spout: i });
  }

  /** Tap the machine: collect a ready cone, or start swirling one in a free lane (there are `iceCreamMachines` lanes). */
  tapIceCream(): void {
    if (this.closed) return;
    const def = this.cfg.recipes.items.icecream;
    if (this.level < def.unlockLevel) return this.invalid(`Ice cream unlocks at Lv ${def.unlockLevel}`);
    const ready = this.cones.findIndex((p) => p && p.phase !== 'cooking');
    if (ready >= 0) {
      const slot = this.freeServeSlot();
      if (!slot) return this.invalid('The plate is full');
      this.cones[ready] = null;
      slot.item = { id: this.nextId++, kind: 'icecream', placed: [], building: false };
      this.emit({ type: 'collect', from: 'icecream', index: ready, slot: slot.index });
      return;
    }
    const i = this.cones.findIndex((p) => !p);
    if (i < 0) return this.invalid('Every cone is still swirling');
    this.cones[i] = { t: 0, phase: 'cooking' };
    this.emit({ type: 'coneStart', machine: i });
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
      // Wrong item: it snaps back and the customer loses a little patience. No coin or reputation cost.
      c.patience = Math.max(0, c.patience - c.patienceMax * this.cfg.combo.wrongItemPatiencePenalty);
      this.emit({ type: 'wrongDrop', slot: slotIndex, customer: c.id, penalty: true });
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
    const cc = this.cfg.combo;
    const type = this.cfg.customers.types[c.type];
    const frac = c.patience / c.patienceMax;
    const fast = frac >= this.cfg.xp.speedBonusPatienceFraction;
    const rush = frac >= cc.rush.patienceFraction;
    // Consecutive fast serves build the combo; a slow serve ends it.
    if (fast) {
      this.combo = Math.min(cc.maxCombo, this.combo + 1);
      this.emit({ type: 'comboChanged', combo: this.combo, max: cc.maxCombo, broken: false });
    } else this.breakCombo();
    const mult = this.comboMultiplier;
    const coinMult = this.event?.def.coinMult ?? 1;
    const tip = fast ? Math.round(c.price * this.cfg.xp.tipFraction * frac * type.tipMult * (rush ? cc.rush.tipMultiplier : 1) * this.mods.tips) : 0;
    const coins = Math.round((c.price + tip) * mult * coinMult);
    const baseXp = c.items.reduce((s, k) => s + this.cfg.recipes.items[k].xp, 0);
    const xp = Math.round((baseXp + (fast ? this.cfg.xp.speedBonusXp : 0) + (rush ? cc.rush.bonusXp : 0)) * mult);
    c.mood = 'happy';
    c.leaveIn = LEAVE_DELAY;
    this.served++;
    this.coins += coins;
    this.addReputation(this.cfg.xp.reputation.serveGain + (this.combo >= cc.comboReputationFrom ? cc.comboReputationGain : 0));
    this.emit({ type: 'orderDone', customer: c.id, coins, tip, xp, fast, rush, combo: this.combo, mult });
    this.addXp(xp);
    this.streak++;
    if (this.streak >= cc.streak.servesNeeded) {
      this.streak = 0;
      this.emit({ type: 'streakBonus', xp: cc.streak.bonusXp });
      this.addXp(cc.streak.bonusXp);
    }
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    this.combo = 0;
    this.emit({ type: 'comboChanged', combo: 0, max: this.cfg.combo.maxCombo, broken: true });
  }

  // ----- events -----

  private updateEvents(dt: number): void {
    if (this.event) {
      this.event.remaining -= dt;
      if (this.event.remaining <= 0) {
        this.emit({ type: 'eventEnd', id: this.event.def.id });
        this.event = null;
        this.nextEventIn = randRange(this.rng, this.cfg.events.gap[0], this.cfg.events.gap[1]);
      }
      return;
    }
    this.nextEventIn -= dt;
    if (this.nextEventIn > 0) return;
    // Events start at calm moments only: at most one customer waiting.
    if (this.customers.filter((c) => c.mood === 'waiting').length > 1) {
      this.nextEventIn = 1;
      return;
    }
    const pool = this.cfg.events.events.filter((e) => e.minLevel <= this.level);
    if (pool.length === 0) {
      this.nextEventIn = 10;
      return;
    }
    this.startEvent(pool[randInt(this.rng, 0, pool.length - 1)]);
  }

  /** Start an event now (also used by the debug hook and tests). */
  startEvent(def: EventDef): void {
    this.event = { def, remaining: def.duration };
    this.emit({ type: 'eventStart', id: def.id, name: def.name, duration: def.duration });
    if (def.spawnType && this.customers.length < 4 && this.customers.filter((c) => c.mood === 'waiting').length < this.levelInfo.maxCustomers + 1) {
      this.spawnCustomer(def.spawnType);
    }
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
    this.spouts = this.spouts.map(() => null);
    this.cones = this.cones.map(() => null);
    this.slots.forEach((s) => (s.item = null));
    this.customers = [];
    this.nextArrival = 1;
    this.combo = 0;
    this.streak = 0;
    this.event = null;
    this.nextEventIn = this.cfg.events.firstAfter;
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
