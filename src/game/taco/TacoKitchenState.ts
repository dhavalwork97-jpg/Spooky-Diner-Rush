import { advanceCook, cookPhase, isEdible, type CookPhase } from '../cook';
import { defaultConfig, levelDef, xpForLevel, type EventDef, type GameConfig } from '../config';
import { CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, type ActiveEvent, type Mods, type SaveSlice } from '../KitchenState';
import { makeRng, randInt, randRange, type Rng } from '../rng';
import { clampStep, levelForStep, MAX_MENU_STEP, rampFor, stepFromLevel, stepXpNeeded } from './tacoMenu';
import {
  buildView,
  defaultTacoConfig,
  finishedDish,
  nextStepIds,
  stepKind,
  unlockedDishes,
  type DishDef,
  type DrinkDef,
  type Protein,
  type TacoConfig,
} from './tacoConfig';

/**
 * Gameplay state of the Taco Truck. No Phaser, no animation code: views read it and play effects from its events.
 * It is a second kitchen next to `KitchenState` and shares the same player (Lv, XP, coins), the same customer, combo, wave and
 * event rules (the normal `GameConfig`) and the same upgrade `Mods`. The burger kitchen is not touched.
 *
 * Flow:
 * - Proteins cook in a pan: tap a raw item, tap the pan when it is ready, and it lands on the oldest plate that needs it.
 * - A plate holds one dish in progress. It matches every unlocked dish that starts with the steps placed so far.
 * - Crispy shells bake in an oven slot, nachos melt in one; burritos are pressed in a pan.
 * - Serve: drag a finished dish (or a full cup from its dispenser) to the customer who ordered it.
 */

export interface TacoItem {
  id: number;
  /** Step ids placed so far. */
  placed: string[];
  building: boolean;
  /** Set once the last step is placed. */
  dish: string | null;
}
export interface TacoPlate {
  index: number;
  item: TacoItem | null;
}
export interface Pan {
  t: number;
  phase: CookPhase;
  what: { kind: 'protein'; protein: Protein } | { kind: 'press'; item: TacoItem };
}
export interface OvenSlot {
  t: number;
  phase: CookPhase;
  what: { kind: 'shell' } | { kind: 'melt'; item: TacoItem };
}
export interface Pour {
  t: number;
  phase: CookPhase;
}
export interface TacoCustomer {
  id: number;
  seat: number;
  look: number;
  /** Dish ids and drink ids. */
  items: string[];
  delivered: boolean[];
  price: number;
  patience: number;
  patienceMax: number;
  age: number;
  type: string;
  mood: 'waiting' | 'happy' | 'angry';
  leaveIn: number;
}

export type TacoEvent =
  | { type: 'proteinStart'; pan: number; protein: Protein }
  | { type: 'panPhase'; pan: number; phase: CookPhase }
  | { type: 'ovenStart'; slot: number; what: 'shell' | 'melt' }
  | { type: 'ovenPhase'; slot: number; phase: CookPhase }
  | { type: 'pressStart'; pan: number; plate: number }
  | { type: 'drinkStart'; drink: string; lane: number }
  | { type: 'drinkPhase'; drink: string; lane: number; phase: CookPhase }
  | { type: 'collect'; from: 'pan' | 'oven'; index: number; plate: number }
  | { type: 'buildStart'; plate: number }
  | { type: 'stepAdded'; plate: number; step: string; from?: { pan?: number; oven?: number } }
  | { type: 'dishDone'; plate: number; dish: string }
  | { type: 'discard'; where: 'pan' | 'oven' | 'plate' | 'build'; index: number; penalty: boolean }
  | { type: 'burnt'; where: 'pan' | 'oven'; index: number }
  | { type: 'arrive'; customer: number }
  | { type: 'deliver'; customer: number; plate: number; itemIndex: number; drink?: string; lane?: number }
  | { type: 'wrongDrop'; plate: number; customer: number | null; penalty?: boolean; drink?: string; lane?: number }
  | { type: 'comboChanged'; combo: number; max: number; broken: boolean }
  | { type: 'eventStart'; id: string; name: string; duration: number }
  | { type: 'eventEnd'; id: string }
  | { type: 'streakBonus'; xp: number }
  | { type: 'orderDone'; customer: number; coins: number; tip: number; xp: number; fast: boolean; rush: boolean; combo: number; mult: number }
  | { type: 'angryLeave'; customer: number }
  | { type: 'leave'; customer: number }
  | { type: 'levelUp'; level: number; coins: number; unlocks: string[] }
  | { type: 'menuGrew'; added: string[] }
  | { type: 'closed' }
  | { type: 'reopened' }
  | { type: 'invalid'; message: string };

const LEAVE_DELAY = 0.9;
const ARRIVE_GRACE = 0.7;

/** What the Taco Truck needs from the save: the shared Lv, XP and coins, plus its own menu step (see tacoMenu.ts). Without a step it is worked out from Lv, as for saves from before menu steps. */
export type TacoSaveSlice = SaveSlice & { menuStep?: number; menuXp?: number };

export class TacoKitchenState {
  readonly cfg: GameConfig;
  readonly taco: TacoConfig;
  level: number;
  xp: number;
  coins: number;
  /** Which dishes are on the menu and how busy the truck is (1-10). Separate from the global Lv. */
  menuStep: number;
  /** XP earned towards the next menu step. */
  menuXp: number;
  reputation: number;
  closed = false;
  pans: (Pan | null)[];
  ovens: (OvenSlot | null)[];
  plates: TacoPlate[];
  /** Cups filling or full, per drink id (one entry per lane). */
  pours: Record<string, (Pour | null)[]>;
  customers: TacoCustomer[] = [];
  events: TacoEvent[] = [];
  served = 0;
  closesAtLevel = new Map<number, number>();
  combo = 0;
  streak = 0;
  clock = 0;
  event: ActiveEvent | null = null;
  nextEventIn: number;
  mods: Mods = { fryerSpeed: 1, grillSpeed: 1, ovenSpeed: 1, patience: 1, tips: 1, burnWindow: 1, calm: 1 };
  nextArrival = 1;

  private nextId = 1;
  private rng: Rng;

  constructor(save: TacoSaveSlice = { level: 15, xp: 0, coins: 0 }, cfg: GameConfig = defaultConfig, taco: TacoConfig = defaultTacoConfig, seed = Date.now()) {
    this.cfg = cfg;
    this.taco = taco;
    this.level = save.level;
    this.menuStep = clampStep(save.menuStep ?? stepFromLevel(save.level));
    this.menuXp = Math.max(0, save.menuXp ?? 0);
    this.xp = save.xp;
    this.coins = save.coins;
    this.reputation = cfg.xp.reputation.start;
    this.rng = makeRng(seed);
    this.nextEventIn = cfg.events.firstAfter;
    const s = taco.settings;
    this.pans = Array.from({ length: s.pans }, () => null);
    this.ovens = Array.from({ length: s.ovenSlots }, () => null);
    this.plates = Array.from({ length: s.plateSlots }, (_, i): TacoPlate => ({ index: i, item: null }));
    this.pours = Object.fromEntries(taco.drinks.map((d) => [d.id, Array.from({ length: s.drinkLanes }, () => null)]));
  }

  get xpNeeded(): number {
    return xpForLevel(this.cfg, this.level);
  }
  /** XP needed for the next menu step (0 once every dish is on the menu). */
  get menuXpNeeded(): number {
    return this.menuStep >= MAX_MENU_STEP ? 0 : stepXpNeeded(this.cfg, this.menuStep);
  }
  /** Customer table for the current menu step: the diner's tuned curve at 14 + step, with this truck's own seats, order size and patience bonus. */
  get levelInfo() {
    const base = levelDef(this.cfg, levelForStep(this.menuStep));
    const ramp = rampFor(this.taco, this.menuStep);
    return { ...base, maxCustomers: Math.min(base.maxCustomers, ramp.seats), orderSize: ramp.orderSize };
  }
  drainEvents(): TacoEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  /** Dishes the player can make now. */
  get dishes(): DishDef[] {
    return unlockedDishes(this.taco, this.menuStep);
  }
  get drinks(): DrinkDef[] {
    return this.taco.drinks.filter((d) => d.unlockStep <= this.menuStep);
  }
  dishDef(id: string): DishDef | undefined {
    return this.taco.dishes.find((d) => d.id === id);
  }
  /** What to draw for the dish on a plate (sheet, frame) while it is being built. */
  view(item: TacoItem) {
    return buildView(this.taco, this.menuStep, item.placed);
  }

  private emit(e: TacoEvent) {
    this.events.push(e);
  }
  private invalid(message: string) {
    this.emit({ type: 'invalid', message });
  }
  private burnWindow(base: number): number {
    return base * this.mods.burnWindow;
  }
  private label(step: string): string {
    return this.taco.stepLabels[step] ?? step;
  }
  private freePlate(): TacoPlate | undefined {
    return this.plates.find((p) => p.item === null);
  }
  /** Plates with a dish still being built, oldest first (plate order). */
  buildingPlates(): TacoPlate[] {
    return this.plates.filter((p) => p.item?.building);
  }
  private nextSteps(item: TacoItem): string[] {
    return nextStepIds(this.taco, this.menuStep, item.placed);
  }
  /** The oldest plate whose dish can take this step next. */
  private acceptor(step: string): TacoPlate | undefined {
    return this.buildingPlates().find((p) => this.nextSteps(p.item!).includes(step));
  }
  private waitingMessage(): string {
    const first = this.buildingPlates()[0]?.item;
    const next = first ? this.nextSteps(first)[0] : undefined;
    return next ? `Add ${this.label(next)} first` : 'Nothing to add';
  }
  private startOf(step: string): boolean {
    return this.dishes.some((d) => d.steps[0] === step);
  }

  // ----- time -----

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
  isRush(c: TacoCustomer): boolean {
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
    this.pans.forEach((p, i) => {
      if (!p) return;
      const def = p.what.kind === 'protein' ? this.taco.proteins[p.what.protein] : this.taco.timed.press;
      p.t = advanceCook(p.t, dt, this.mods.grillSpeed, def.readyAfter);
      const phase = cookPhase(p.t, def.readyAfter, this.burnWindow(def.burnWindow));
      if (phase !== p.phase) {
        p.phase = phase;
        this.emit({ type: 'panPhase', pan: i, phase });
        if (phase === 'burnt') this.onBurnt('pan', i);
      }
    });
    this.ovens.forEach((o, i) => {
      if (!o) return;
      const def = o.what.kind === 'shell' ? this.taco.timed.crispy_shell : this.taco.timed.melt;
      const eventRate = this.event?.def.ovenSpeed ?? 1; // the Slow oven event slows the whole bake
      o.t = advanceCook(o.t, dt, this.mods.ovenSpeed * eventRate, def.readyAfter, eventRate);
      const phase = cookPhase(o.t, def.readyAfter, this.burnWindow(def.burnWindow));
      if (phase !== o.phase) {
        o.phase = phase;
        this.emit({ type: 'ovenPhase', slot: i, phase });
        if (phase === 'burnt') this.onBurnt('oven', i);
      }
    });
    // A cup fills and then waits; it never spoils.
    for (const drink of this.taco.drinks) {
      this.pours[drink.id].forEach((p, lane) => {
        if (!p) return;
        p.t += dt;
        const phase = p.t < drink.fillSeconds ? 'cooking' : 'ready';
        if (phase !== p.phase) {
          p.phase = phase;
          this.emit({ type: 'drinkPhase', drink: drink.id, lane, phase });
        }
      });
    }
  }

  private onBurnt(where: 'pan' | 'oven', index: number): void {
    this.emit({ type: 'burnt', where, index });
    this.streak = 0;
    this.addReputation(-Math.round(this.cfg.recipes.settings.burnReputationPenalty / this.mods.calm));
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
    if (active >= Math.min(info.maxCustomers, this.taco.settings.seats)) {
      this.nextArrival = 1;
      return;
    }
    this.spawnCustomer();
    const slow = 1 + 0.1 * Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const gap = randRange(this.rng, info.arrivalGap[0], info.arrivalGap[1]);
    this.nextArrival = gap * slow * this.taco.settings.arrivalGapMult * this.wave.gapMult * (this.event?.def.arrivalMult ?? 1);
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

  private itemDef(id: string): { price: number; xp: number } {
    const d = this.dishDef(id) ?? this.taco.drinks.find((x) => x.id === id);
    if (!d) throw new Error(`unknown taco item ${id}`);
    return d;
  }

  spawnCustomer(forceType?: string): void {
    const dishes = this.dishes;
    if (dishes.length === 0) return this.invalid(`The ${this.taco.restaurant.name} opens at Lv ${this.taco.restaurant.unlockLevel}`);
    const info = this.levelInfo;
    const typeKey = forceType && this.cfg.customers.types[forceType] ? forceType : this.pickType();
    const type = this.cfg.customers.types[typeKey];
    const used = new Set(this.customers.map((c) => c.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const size = Math.min(this.taco.settings.maxOrderSize, randInt(this.rng, info.orderSize[0], info.orderSize[1]) + type.extraItems);
    const drinks = this.drinks;
    const items: string[] = [];
    for (let i = 0; i < size; i++) {
      if (drinks.length > 0 && this.rng() < this.taco.settings.drinkChance) items.push(drinks[randInt(this.rng, 0, drinks.length - 1)].id);
      else items.push(dishes[randInt(this.rng, 0, dishes.length - 1)].id);
    }
    const price = Math.round(items.reduce((sum, k) => sum + this.itemDef(k).price, 0) * type.payMult);
    const closes = Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const patienceMax = info.patience * rampFor(this.taco, this.menuStep).patienceMult * type.patienceMult * this.mods.patience * (1 + 0.1 * closes);
    const c: TacoCustomer = {
      id: this.nextId++,
      seat,
      look: randInt(this.rng, CUSTOMER_LOOK_MIN, CUSTOMER_LOOK_COUNT - 1),
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

  // ----- pans -----

  /** Put a raw protein from the griddle into the first free pan. */
  startProtein(protein: Protein): void {
    if (this.closed) return;
    const unlock = Math.min(...this.taco.dishes.filter((d) => d.protein === protein).map((d) => d.unlockStep));
    if (this.menuStep < unlock) return this.invalid(`${this.label(`protein:${protein}`)} is not on the menu yet`);
    const i = this.pans.findIndex((p) => !p);
    if (i < 0) return this.invalid('All the pans are busy');
    this.pans[i] = { t: 0, phase: 'cooking', what: { kind: 'protein', protein } };
    this.emit({ type: 'proteinStart', pan: i, protein });
  }

  /** Tap a pan: throw away burnt food, or move the finished protein (or the pressed burrito) onto a plate. */
  tapPan(index: number): void {
    if (this.closed) return;
    const p = this.pans[index];
    if (!p) return this.invalid('Tap a raw item on the griddle first');
    if (p.phase === 'cooking') return this.invalid('Not ready yet');
    if (p.phase === 'burnt') {
      this.pans[index] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'pan', index, penalty: true });
      return;
    }
    if (p.what.kind === 'protein') {
      const step = `protein:${p.what.protein}`;
      const target = this.acceptor(step);
      if (!target) return this.invalid(this.buildingPlates().length === 0 ? 'Start a dish on a plate first' : this.waitingMessage());
      this.pans[index] = null;
      this.addStep(target, step, { pan: index });
      return;
    }
    const plate = this.freePlate();
    if (!plate) return this.invalid('Serve a dish first: the plates are full');
    this.pans[index] = null;
    plate.item = p.what.item;
    this.emit({ type: 'collect', from: 'pan', index, plate: plate.index });
    this.addStep(plate, 'pan:press', { pan: index });
  }

  // ----- oven -----

  /** Tap an oven slot: an empty one bakes a crispy shell; a ready one moves its shell or nachos onto a plate; a burnt one is thrown away. */
  tapOven(index: number): void {
    if (this.closed) return;
    const o = this.ovens[index];
    if (!o) {
      if (!this.startOf('crispy_shell')) {
        return this.invalid('Crispy shells are not on the menu yet');
      }
      this.ovens[index] = { t: 0, phase: 'cooking', what: { kind: 'shell' } };
      this.emit({ type: 'ovenStart', slot: index, what: 'shell' });
      return;
    }
    if (o.phase === 'cooking') return this.invalid('Not ready yet');
    if (o.phase === 'burnt') {
      this.ovens[index] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'oven', index, penalty: true });
      return;
    }
    const plate = this.freePlate();
    if (!plate) return this.invalid('Serve a dish first: the plates are full');
    this.ovens[index] = null;
    if (o.what.kind === 'shell') {
      plate.item = { id: this.nextId++, placed: ['crispy_shell'], building: true, dish: null };
      this.emit({ type: 'collect', from: 'oven', index, plate: plate.index });
      this.emit({ type: 'buildStart', plate: plate.index });
      this.afterStep(plate);
      return;
    }
    plate.item = o.what.item;
    this.emit({ type: 'collect', from: 'oven', index, plate: plate.index });
    this.addStep(plate, 'oven:melt', { oven: index });
  }

  // ----- drinks -----

  /** Tap a dispenser: start filling a cup in a free lane. A full cup stays in its lane until it is dragged to a customer. */
  tapDrinks(drinkId: string): void {
    if (this.closed) return;
    const def = this.taco.drinks.find((d) => d.id === drinkId);
    if (!def) return;
    if (this.menuStep < def.unlockStep) return this.invalid(`${def.name} is not on the menu yet`);
    const lanes = this.pours[def.id];
    const lane = lanes.findIndex((p) => !p);
    if (lane < 0) return this.invalid(lanes.some((p) => p?.phase === 'ready') ? `Drag the full ${def.name} to a customer` : 'Cups are still filling');
    lanes[lane] = { t: 0, phase: 'cooking' };
    this.emit({ type: 'drinkStart', drink: def.id, lane });
  }

  // ----- assembly -----

  /** Tap a tortilla or ingredient. A tortilla (or chips) starts a new dish on a free plate; anything else goes on the oldest plate that wants it next. */
  tapIngredient(id: string): void {
    if (this.closed) return;
    if (this.startOf(id)) {
      const plate = this.freePlate();
      if (!plate) return this.invalid('No free plate');
      plate.item = { id: this.nextId++, placed: [id], building: true, dish: null };
      this.emit({ type: 'buildStart', plate: plate.index });
      this.afterStep(plate);
      return;
    }
    const builds = this.buildingPlates();
    if (builds.length === 0) return this.invalid('Start a dish on a plate first');
    const target = this.acceptor(id);
    if (!target) return this.invalid(this.waitingMessage());
    this.addStep(target, id);
  }

  /** Tap a plate: do its next action (wrap, cut), or move it into a pan (press) or an oven slot (melt). */
  tapPlate(index: number): void {
    if (this.closed) return;
    const plate = this.plates[index];
    const item = plate?.item;
    if (!item) return this.invalid('Nothing on this plate');
    if (!item.building) return this.invalid('Drag it to a customer');
    const pos = item.placed.length;
    const step = this.nextSteps(item).find((s) => ['action', 'press', 'melt'].includes(stepKind(s, pos)));
    if (!step) return this.invalid(this.waitingMessage());
    const kind = stepKind(step, pos);
    if (kind === 'action') return this.addStep(plate, step);
    if (kind === 'press') {
      const i = this.pans.findIndex((p) => !p);
      if (i < 0) return this.invalid('All the pans are busy');
      plate.item = null;
      this.pans[i] = { t: 0, phase: 'cooking', what: { kind: 'press', item } };
      this.emit({ type: 'pressStart', pan: i, plate: plate.index });
      return;
    }
    const i = this.ovens.findIndex((o) => !o);
    if (i < 0) return this.invalid('Both oven slots are busy');
    plate.item = null;
    this.ovens[i] = { t: 0, phase: 'cooking', what: { kind: 'melt', item } };
    this.emit({ type: 'ovenStart', slot: i, what: 'melt' });
  }

  private addStep(plate: TacoPlate, step: string, from?: { pan?: number; oven?: number }): void {
    const item = plate.item!;
    item.placed.push(step);
    this.emit({ type: 'stepAdded', plate: plate.index, step, from });
    this.afterStep(plate);
  }

  private afterStep(plate: TacoPlate): void {
    const item = plate.item!;
    const done = finishedDish(this.taco, this.menuStep, item.placed);
    if (done) {
      item.building = false;
      item.dish = done.id;
      this.emit({ type: 'dishDone', plate: plate.index, dish: done.id });
    }
  }

  tapTrash(plateIndex?: number): void {
    if (this.closed) return;
    const target = plateIndex !== undefined ? this.plates[plateIndex] : this.buildingPlates()[0];
    if (!target || !target.item) return this.invalid('Nothing to throw away');
    const wasBuilding = target.item.building;
    target.item = null;
    if (!wasBuilding) this.discardPenalty();
    this.emit({ type: 'discard', where: wasBuilding ? 'build' : 'plate', index: target.index, penalty: !wasBuilding });
  }

  private discardPenalty(): void {
    this.coins = Math.max(0, this.coins - this.cfg.recipes.settings.trashPenaltyCoins);
  }

  // ----- serving -----

  serve(plateIndex: number, customerId: number): boolean {
    if (this.closed) return false;
    const plate = this.plates[plateIndex];
    const item = plate?.item;
    const c = this.customers.find((x) => x.id === customerId);
    if (!item || item.building || !item.dish || !c || c.mood !== 'waiting') {
      this.emit({ type: 'wrongDrop', plate: plateIndex, customer: c?.id ?? null });
      return false;
    }
    const need = c.items.findIndex((k, i) => k === item.dish && !c.delivered[i]);
    if (need < 0) {
      c.patience = Math.max(0, c.patience - c.patienceMax * this.cfg.combo.wrongItemPatiencePenalty);
      this.emit({ type: 'wrongDrop', plate: plateIndex, customer: c.id, penalty: true });
      return false;
    }
    plate.item = null;
    c.delivered[need] = true;
    this.emit({ type: 'deliver', customer: c.id, plate: plateIndex, itemIndex: need });
    if (c.delivered.every(Boolean)) this.completeOrder(c);
    return true;
  }

  pourReady(drinkId: string, lane: number): boolean {
    const p = this.pours[drinkId]?.[lane];
    return !!p && p.phase !== 'cooking';
  }

  /** Drop a full cup straight from its dispenser on a customer. */
  serveFromPour(drinkId: string, lane: number, customerId: number): boolean {
    if (this.closed) return false;
    const c = this.customers.find((x) => x.id === customerId);
    if (!this.pourReady(drinkId, lane) || !c || c.mood !== 'waiting') {
      this.emit({ type: 'wrongDrop', plate: -1, customer: c?.id ?? null, drink: drinkId, lane });
      return false;
    }
    const need = c.items.findIndex((k, i) => k === drinkId && !c.delivered[i]);
    if (need < 0) {
      c.patience = Math.max(0, c.patience - c.patienceMax * this.cfg.combo.wrongItemPatiencePenalty);
      this.emit({ type: 'wrongDrop', plate: -1, customer: c.id, penalty: true, drink: drinkId, lane });
      return false;
    }
    this.pours[drinkId][lane] = null;
    c.delivered[need] = true;
    this.emit({ type: 'deliver', customer: c.id, plate: -1, itemIndex: need, drink: drinkId, lane });
    if (c.delivered.every(Boolean)) this.completeOrder(c);
    return true;
  }

  private completeOrder(c: TacoCustomer): void {
    const cc = this.cfg.combo;
    const type = this.cfg.customers.types[c.type];
    const frac = c.patience / c.patienceMax;
    const fast = frac >= this.cfg.xp.speedBonusPatienceFraction;
    const rush = frac >= cc.rush.patienceFraction;
    if (fast) {
      this.combo = Math.min(cc.maxCombo, this.combo + 1);
      this.emit({ type: 'comboChanged', combo: this.combo, max: cc.maxCombo, broken: false });
    } else this.breakCombo();
    const mult = this.comboMultiplier;
    const coinMult = this.event?.def.coinMult ?? 1;
    const tip = fast ? Math.round(c.price * this.cfg.xp.tipFraction * frac * type.tipMult * (rush ? cc.rush.tipMultiplier : 1) * this.mods.tips) : 0;
    const coins = Math.round((c.price + tip) * mult * coinMult);
    const baseXp = c.items.reduce((s, k) => s + this.itemDef(k).xp, 0);
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

  startEvent(def: EventDef): void {
    this.event = { def, remaining: def.duration };
    this.emit({ type: 'eventStart', id: def.id, name: def.name, duration: def.duration });
    const seats = Math.min(this.levelInfo.maxCustomers, this.taco.settings.seats);
    if (def.spawnType && this.customers.length < this.taco.settings.seats && this.customers.filter((c) => c.mood === 'waiting').length < seats + 1) {
      this.spawnCustomer(def.spawnType);
    }
  }

  private addXp(amount: number): void {
    this.addMenuXp(amount);
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      const reward = this.cfg.xp.levelUpCoins.base + this.cfg.xp.levelUpCoins.perLevel * this.level;
      this.coins += reward;
      this.emit({ type: 'levelUp', level: this.level, coins: reward, unlocks: [] });
    }
  }

  /** The same XP also moves the truck's menu forward. New dishes are announced by name, never by a number. */
  private addMenuXp(amount: number): void {
    if (this.menuStep >= MAX_MENU_STEP) return;
    this.menuXp += amount;
    while (this.menuStep < MAX_MENU_STEP && this.menuXp >= this.menuXpNeeded) {
      this.menuXp -= this.menuXpNeeded;
      this.menuStep++;
      const added = [...this.taco.dishes.filter((d) => d.unlockStep === this.menuStep).map((d) => d.name), ...this.taco.drinks.filter((d) => d.unlockStep === this.menuStep).map((d) => d.name)];
      this.emit({ type: 'menuGrew', added });
    }
    if (this.menuStep >= MAX_MENU_STEP) this.menuXp = 0;
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

  /** Reopen after closing: same rules as the diner (Reopen 55 reputation, 100 after a rewarded ad). The kitchen starts fresh. */
  reopen(full = false): void {
    if (!this.closed) return;
    this.closed = false;
    this.reputation = full ? 100 : this.cfg.xp.reputation.reopenTo;
    this.pans = this.pans.map(() => null);
    this.ovens = this.ovens.map(() => null);
    this.plates.forEach((p) => (p.item = null));
    for (const k of Object.keys(this.pours)) this.pours[k] = this.pours[k].map(() => null);
    this.customers = [];
    this.nextArrival = 1;
    this.combo = 0;
    this.streak = 0;
    this.event = null;
    this.nextEventIn = this.cfg.events.firstAfter;
    this.emit({ type: 'reopened' });
  }

  // ----- helpers for views and bots -----

  /** True if any waiting customer still needs this dish or drink. */
  isNeeded(id: string): boolean {
    return this.customers.some((c) => c.mood === 'waiting' && c.items.some((k, i) => k === id && !c.delivered[i]));
  }
  panEdible(i: number): boolean {
    const p = this.pans[i];
    return !!p && isEdible(p.phase);
  }
}
