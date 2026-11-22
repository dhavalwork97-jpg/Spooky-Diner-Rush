import { comboBonus, isComboMeal } from './pizzaCombo';
import { isPerfectBake, perfectTip } from './pizzaPerfect';
import { customDish, isCustomId, rollCustom } from './pizzaCustom';
import { advanceCook, cookPhase, isEdible, type CookPhase } from '../cook';
import { defaultConfig, levelDef, xpForLevel, type EventDef, type GameConfig } from '../config';
import { CUSTOMER_LOOK_MIN, TACO_LOOK_MAX, type ActiveEvent, type SaveSlice } from '../KitchenState';
import { makeRng, randInt, randRange, type Rng } from '../rng';
import { tacoEventPool } from '../taco/tacoExtras';
import { emptyHistory, kindMult, NEUTRAL_VARIETY, pickOrderSize, recencyMult, recentDishKinds, recordOrder, type OrderHistory } from '../taco/tacoVariety';
import { familiarityOf, type Familiarity, type PizzaServed } from './pizzaLearning';
import { clampPizzaStep, MAX_PIZZA_STEP, pizzaLevelForStep, pizzaRampFor, pizzaStepXpNeeded } from './pizzaMenu';
import { candidatePizzas, finishedPizza, nextIngredients, stepKindOf } from './pizzaRecipes';
import { NO_PIZZA_MODS, type PizzaMods } from './pizzaShop';
import { defaultPizzaConfig, unlockedDishes, unlockedIngredients, type DishDef, type DishKind, type PizzaConfig } from './pizzaConfig';

/**
 * Gameplay state of the Pizza Place. No Phaser, no animation: views read it and play effects from its events.
 * Same pattern as `TacoKitchenState` (shared Lv, XP, coins, customer, combo, wave and event rules from `GameConfig`), with its own stations:
 *
 * - Three preparation boards. A board is reserved from the first dough until its pizza is served or thrown away (it keeps its id the whole time).
 * - Build: dough, one sauce, one cheese, then toppings in any order. Tap the pizza to finish it (it must match one unlocked recipe exactly).
 * - Brick oven, two slots: a finished pizza goes in the first free slot. When it is ready, only the player takes it out; it goes back to the board it came from.
 *   An overcooking pizza keeps its place and burns if left. A burnt pizza is thrown away with a small coin penalty.
 * - Small oven (two trays): garlic bread, cheesy breadsticks, cinnamon twists. Fryer (two baskets, own timelines): fries in basket 0, wings in basket 1.
 *   Ice cream machine (three lanes). Sides, fried food and ice cream are served by tapping them when ready: they go to the oldest waiting customer who wants them.
 */

export type BoardStatus = 'building' | 'built' | 'baking' | 'baked';

export interface PizzaItem {
  id: number;
  /** `dough`, then `sauce:*`, `cheese:*`, `topping:*` in the order placed. */
  placed: string[];
  status: BoardStatus;
  /** Set once the pizza is finished (matches a recipe). */
  dish: string | null;
  /** The cook phase of its bake, kept after it comes out (a pizza taken at 'warning' stays 'warning' for the views' tint). */
  bakedPhase: CookPhase | null;
  /** Oven slot while status is 'baking'. */
  oven: number | null;
  /** Taken out in the first half of its READY phase: earns a small extra tip when served. */
  perfect?: boolean;
}
export interface PizzaBoard {
  index: number;
  item: PizzaItem | null;
}
export interface PizzaOvenSlot {
  t: number;
  phase: CookPhase;
  /** The board this pizza came from and returns to. */
  board: number;
}
export interface TrayItem {
  t: number;
  phase: CookPhase;
  dish: string;
}
export interface IceLane {
  t: number;
  phase: CookPhase;
}
export interface PizzaCustomer {
  id: number;
  seat: number;
  look: number;
  items: string[];
  delivered: boolean[];
  price: number;
  patience: number;
  patienceMax: number;
  age: number;
  type: string;
  mood: 'waiting' | 'happy' | 'angry';
  leaveIn: number;
  /** Set once the combo meal bonus was paid, so it can never be paid twice for one order. */
  comboPaid?: boolean;
  /** Extra tip collected from perfect bakes among the items already delivered. */
  perfectTips?: number;
}

export type PizzaEvent =
  | { type: 'boardStart'; board: number }
  | { type: 'ingredient'; board: number; step: string }
  | { type: 'pizzaBuilt'; board: number; dish: string }
  | { type: 'ovenStart'; slot: number; board: number; dish: string }
  | { type: 'ovenPhase'; slot: number; phase: CookPhase }
  | { type: 'ovenFull' }
  | { type: 'collect'; slot: number; board: number; phase: CookPhase }
  | { type: 'trayStart'; where: 'small' | 'fryer'; index: number; dish: string }
  | { type: 'trayPhase'; where: 'small' | 'fryer'; index: number; phase: CookPhase }
  | { type: 'iceStart'; lane: number }
  | { type: 'icePhase'; lane: number; phase: CookPhase }
  | { type: 'wobble'; where: 'oven' | 'small' | 'fryer' | 'ice'; index: number }
  | { type: 'discard'; where: 'board' | 'oven' | 'small' | 'fryer'; index: number; penalty: boolean }
  | { type: 'burnt'; where: 'oven' | 'small' | 'fryer'; index: number }
  | { type: 'arrive'; customer: number }
  | { type: 'deliver'; customer: number; dish: string; itemIndex: number; from: 'board' | 'small' | 'fryer' | 'ice'; index: number }
  | { type: 'wrongDrop'; customer: number | null; penalty?: boolean }
  | { type: 'comboChanged'; combo: number; max: number; broken: boolean }
  | { type: 'eventStart'; id: string; name: string; duration: number }
  | { type: 'eventEnd'; id: string }
  | { type: 'streakBonus'; xp: number }
  | { type: 'customOrder'; customer: number; dish: string }
  | { type: 'perfectBake'; where: 'oven' | 'small' | 'fryer'; index: number }
  | { type: 'comboMeal'; customer: number; coins: number; xp: number }
  | { type: 'orderDone'; customer: number; coins: number; tip: number; xp: number; fast: boolean; rush: boolean; combo: number; mult: number }
  | { type: 'angryLeave'; customer: number }
  | { type: 'leave'; customer: number }
  | { type: 'levelUp'; level: number; coins: number; unlocks: string[] }
  | { type: 'menuGrew'; added: string[] }
  | { type: 'recipeServed'; dish: string; count: number; first: boolean; learned: boolean }
  | { type: 'closed' }
  | { type: 'reopened' }
  | { type: 'invalid'; message: string };

const LEAVE_DELAY = 0.9;
const ARRIVE_GRACE = 0.7;

export type PizzaSaveSlice = SaveSlice & {
  menuStep?: number;
  menuXp?: number;
  /** Times each dish was served. Left out (tests, bare callers) every dish counts as learned. */
  pizzaServed?: PizzaServed;
};

export class PizzaKitchenState {
  readonly cfg: GameConfig;
  readonly pizza: PizzaConfig;
  level: number;
  xp: number;
  coins: number;
  menuStep: number;
  menuXp: number;
  reputation: number;
  closed = false;
  boards: PizzaBoard[];
  /** The brick oven slots. */
  ovens: (PizzaOvenSlot | null)[];
  smallOven: (TrayItem | null)[];
  fryer: (TrayItem | null)[];
  ice: (IceLane | null)[];
  customers: PizzaCustomer[] = [];
  events: PizzaEvent[] = [];
  served = 0;
  closesAtLevel = new Map<number, number>();
  combo = 0;
  streak = 0;
  clock = 0;
  event: ActiveEvent | null = null;
  nextEventIn: number;
  mods: PizzaMods = { ...NO_PIZZA_MODS };
  dishServes: PizzaServed;
  readonly learning: boolean;
  nextArrival = 1;
  private history: OrderHistory = emptyHistory();
  private nextId = 1;
  private nextItemId = 1;
  private rng: Rng;

  constructor(save: PizzaSaveSlice = { level: 30, xp: 0, coins: 0 }, cfg: GameConfig = defaultConfig, pizza: PizzaConfig = defaultPizzaConfig, seed = Date.now()) {
    this.cfg = cfg;
    this.pizza = pizza;
    this.level = save.level;
    this.menuStep = clampPizzaStep(save.menuStep ?? 1);
    this.menuXp = Math.max(0, save.menuXp ?? 0);
    this.learning = save.pizzaServed !== undefined;
    this.dishServes = { ...(save.pizzaServed ?? {}) };
    this.xp = save.xp;
    this.coins = save.coins;
    this.reputation = cfg.xp.reputation.start;
    this.rng = makeRng(seed);
    this.nextEventIn = cfg.events.firstAfter;
    const s = pizza.settings;
    this.boards = Array.from({ length: s.boards }, (_, i): PizzaBoard => ({ index: i, item: null }));
    this.ovens = Array.from({ length: s.ovenSlots }, () => null);
    this.smallOven = Array.from({ length: s.smallOvenSlots }, () => null);
    this.fryer = Array.from({ length: s.fryerBaskets }, () => null);
    this.ice = Array.from({ length: s.iceLanes }, () => null);
  }

  // ----- info for views -----

  get xpNeeded(): number {
    return xpForLevel(this.cfg, this.level);
  }
  get menuXpNeeded(): number {
    return this.menuStep >= MAX_PIZZA_STEP ? 0 : pizzaStepXpNeeded(this.cfg, this.menuStep);
  }
  get levelInfo() {
    const base = levelDef(this.cfg, pizzaLevelForStep(this.menuStep));
    const ramp = pizzaRampFor(this.pizza, this.menuStep);
    return { ...base, maxCustomers: ramp.seats, orderSize: ramp.orderSize };
  }
  drainEvents(): PizzaEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  get dishes(): DishDef[] {
    return unlockedDishes(this.pizza, this.menuStep);
  }
  /** Ingredient step ids on the menu now. */
  get ingredients(): string[] {
    return unlockedIngredients(this.pizza, this.menuStep);
  }
  dishDef(id: string): DishDef | undefined {
    return this.pizza.dishes.find((d) => d.id === id) ?? this.customDishes.get(id);
  }
  /** Virtual recipes of custom orders seen so far. Not saved, never on the menu or in the Recipe Book. */
  private customDishes = new Map<string, DishDef>();
  /** The recipe list the build rules see: the menu plus the custom pizzas a waiting customer or a board still needs. */
  private recipeCfg(): PizzaConfig {
    const active = new Set<string>();
    for (const c of this.customers) c.items.forEach((id, i) => isCustomId(id) && !c.delivered[i] && active.add(id));
    for (const b of this.boards) if (b.item?.dish && isCustomId(b.item.dish)) active.add(b.item.dish);
    if (active.size === 0) return this.pizza;
    const extra = [...active].map((id) => this.customDishes.get(id)).filter((d): d is DishDef => !!d);
    return { ...this.pizza, dishes: [...this.pizza.dishes, ...extra] };
  }
  private emit(e: PizzaEvent) {
    this.events.push(e);
  }
  private invalid(message: string) {
    this.emit({ type: 'invalid', message });
  }
  private burnWindow(base: number): number {
    return base * this.mods.burnWindow;
  }
  burnFraction(t: number, readyAfter: number, baseBurnWindow: number): number {
    const w = this.burnWindow(baseBurnWindow);
    return w > 0 ? Math.max(0, Math.min(1, (t - readyAfter) / w)) : 0;
  }
  /** What the next ingredient taps may be for this pizza (empty once nothing more fits). */
  nextFor(item: PizzaItem): string[] {
    return nextIngredients(this.recipeCfg(), this.menuStep, item.placed.filter((s) => s !== 'dough'));
  }
  /** Pizzas that could still come out of what is on the board. */
  candidates(item: PizzaItem): DishDef[] {
    return candidatePizzas(this.recipeCfg(), this.menuStep, item.placed.filter((s) => s !== 'dough'));
  }
  private layers(item: PizzaItem): string[] {
    return item.placed.filter((s) => s !== 'dough');
  }
  private firstFree<T>(a: (T | null)[]): number {
    return a.findIndex((x) => x === null);
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
  isRush(c: PizzaCustomer): boolean {
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
    const eventRate = this.event?.def.ovenSpeed ?? 1;
    const T = this.pizza.timed;
    this.ovens.forEach((o, i) => {
      if (!o) return;
      o.t = advanceCook(o.t, dt, this.mods.ovenSpeed * eventRate, T.pizza.readyAfter, eventRate);
      const phase = cookPhase(o.t, T.pizza.readyAfter, this.burnWindow(T.pizza.burnWindow));
      if (phase !== o.phase) {
        o.phase = phase;
        this.emit({ type: 'ovenPhase', slot: i, phase });
        if (phase === 'burnt') this.onBurnt('oven', i);
      }
    });
    this.smallOven.forEach((s, i) => {
      if (!s) return;
      s.t = advanceCook(s.t, dt, this.mods.ovenSpeed * eventRate, T.side.readyAfter, eventRate);
      const phase = cookPhase(s.t, T.side.readyAfter, this.burnWindow(T.side.burnWindow));
      if (phase !== s.phase) {
        s.phase = phase;
        this.emit({ type: 'trayPhase', where: 'small', index: i, phase });
        if (phase === 'burnt') this.onBurnt('small', i);
      }
    });
    this.fryer.forEach((s, i) => {
      if (!s) return;
      const def = this.dishDef(s.dish)?.basket === 1 ? T.wings : T.fries;
      s.t = advanceCook(s.t, dt, this.mods.fryerSpeed, def.readyAfter);
      const phase = cookPhase(s.t, def.readyAfter, this.burnWindow(def.burnWindow));
      if (phase !== s.phase) {
        s.phase = phase;
        this.emit({ type: 'trayPhase', where: 'fryer', index: i, phase });
        if (phase === 'burnt') this.onBurnt('fryer', i);
      }
    });
    // A scoop of ice cream fills and then waits; it never spoils.
    this.ice.forEach((p, lane) => {
      if (!p) return;
      p.t += dt * this.mods.pourSpeed;
      const phase: CookPhase = p.t < this.pizza.ice.fillSeconds ? 'cooking' : 'ready';
      if (phase !== p.phase) {
        p.phase = phase;
        this.emit({ type: 'icePhase', lane, phase });
      }
    });
  }

  private onBurnt(where: 'oven' | 'small' | 'fryer', index: number): void {
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
    if (active >= this.seatLimit() || this.customers.length >= this.pizza.settings.seats) {
      this.nextArrival = 1;
      return;
    }
    this.spawnCustomer();
    const slow = 1 + 0.1 * Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const gap = randRange(this.rng, info.arrivalGap[0], info.arrivalGap[1]);
    this.nextArrival = gap * slow * this.learningGapMult() * this.pizza.settings.arrivalGapMult * this.wave.gapMult * (this.event?.def.arrivalMult ?? 1);
  }

  // ----- learning -----

  familiarity(dishId: string): Familiarity {
    if (isCustomId(dishId)) return 'normal'; // a custom order is built from known ingredients, so it never needs a lesson
    return this.learning ? familiarityOf(this.pizza.learning, this.dishServes[dishId] ?? 0) : 'normal';
  }
  unfamiliarDishes(): DishDef[] {
    return this.dishes.filter((d) => this.familiarity(d.id) !== 'normal');
  }
  private waitingItems(): string[] {
    return this.customers.filter((c) => c.mood === 'waiting').flatMap((c) => c.items.filter((_, i) => !c.delivered[i]));
  }
  /** The earliest dish nobody has served yet, due its first (single-dish) order. */
  introDue(): DishDef | null {
    if (!this.learning) return null;
    const wanted = this.waitingItems();
    const fresh = this.dishes.filter((d) => this.familiarity(d.id) === 'intro');
    if (fresh.length === 0 || fresh.some((d) => wanted.includes(d.id))) return null;
    if (this.dishes.some((d) => (this.dishServes[d.id] ?? 0) > 0 && (this.dishServes[d.id] ?? 0) < this.pizza.learning.introNeedsServes)) return null;
    return [...fresh].sort((a, b) => a.unlockStep - b.unlockStep)[0];
  }
  introInFlight(): boolean {
    if (!this.learning) return false;
    const wanted = this.waitingItems();
    return this.dishes.some((d) => this.familiarity(d.id) === 'intro' && wanted.includes(d.id));
  }
  seatLimit(): number {
    const L = this.pizza.learning;
    let limit = Math.min(this.levelInfo.maxCustomers, this.pizza.settings.seats);
    if (!this.learning) return limit;
    if (this.unfamiliarDishes().length > 0) limit = Math.max(Math.min(limit, 2), limit - 1);
    if (this.introInFlight() || this.introDue()) limit = Math.min(limit, L.introSeats);
    return limit;
  }
  private learningGapMult(): number {
    if (!this.learning) return 1;
    const L = this.pizza.learning;
    return 1 + L.gapPerUnfamiliar * Math.min(this.unfamiliarDishes().length, L.gapMaxUnfamiliar);
  }

  // ----- orders -----

  private get variety() {
    return this.pizza.variety ?? NEUTRAL_VARIETY;
  }
  private kindOf(id: string): DishKind {
    return this.dishDef(id)?.kind ?? 'pizza';
  }
  /** How many waiting items (plus `extra`) need the brick oven, the small oven and the fryer. */
  private stationLoad(extra: readonly string[] = []): Record<'pizza' | 'side' | 'fried', number> {
    const load = { pizza: 0, side: 0, fried: 0 };
    for (const id of [...this.waitingItems(), ...extra]) {
      const k = this.dishDef(id)?.kind;
      if (k === 'pizza' || k === 'side' || k === 'fried') load[k]++;
    }
    return load;
  }

  /**
   * One dish for an order. The kind is weighted by `kindWeights` (a kind's weight is shared between its eligible dishes), practised dishes count half and
   * only once per order, first-time dishes never (they have their own order). A dish that would pile onto a busy station is skipped while there is a choice,
   * recently ordered dishes and kinds are softly less likely, and one customer does not get the same dish twice while another can be offered.
   * Each rule is dropped only when it would leave nothing to pick.
   */
  private pickDish(chosen: readonly string[]): DishDef {
    const L = this.pizza.learning;
    const V = this.variety;
    const dishes = this.dishes;
    const load = this.stationLoad(chosen);
    const unfamiliarChosen = chosen.some((id) => this.familiarity(id) !== 'normal');
    const recent = [...[...chosen].reverse(), ...this.history.dishes];
    const recentKinds = recentDishKinds(V, [...chosen.map((id) => this.kindOf(id)).reverse(), ...this.history.items]);
    const caps: Record<string, number> = { pizza: L.pizzaItemCap, side: L.sideItemCap, fried: L.friedItemCap };
    const base = (d: DishDef, relaxed: boolean): number => {
      const fam = this.familiarity(d.id);
      if (fam === 'intro' && !relaxed) return 0;
      let w = fam === 'practice' ? L.practiceWeight : 1;
      if (fam !== 'normal' && unfamiliarChosen && !relaxed) return 0;
      if (!relaxed && d.kind !== 'dessert' && load[d.kind] >= caps[d.kind]) w = 0;
      return w;
    };
    const kindsInPlay = new Set(dishes.filter((d) => base(d, false) > 0).map((d) => d.kind)).size;
    const tiers = [
      { dup: false, relaxed: false },
      { dup: true, relaxed: false },
      { dup: true, relaxed: true },
    ];
    for (const t of tiers) {
      if (!t.dup && !V.avoidDuplicateInOrder) continue;
      const eligible = dishes.filter((d) => base(d, t.relaxed) > 0 && (t.dup || !chosen.includes(d.id)));
      const perKind = new Map<string, number>();
      eligible.forEach((d) => perKind.set(d.kind, (perKind.get(d.kind) ?? 0) + 1));
      const weights = dishes.map((d) => {
        if (!eligible.includes(d)) return 0;
        let w = base(d, t.relaxed) * (this.pizza.kindWeights[d.kind] / (perKind.get(d.kind) ?? 1));
        if (!t.relaxed) w *= recencyMult(V, recent, d.id) * kindMult(V, recentKinds, d.kind, kindsInPlay);
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let r = this.rng() * total;
      for (let i = 0; i < dishes.length; i++) {
        r -= weights[i];
        if (r <= 0 && weights[i] > 0) return dishes[i];
      }
      return dishes[dishes.length - 1];
    }
    return dishes[randInt(this.rng, 0, dishes.length - 1)];
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

  private pickItems(size: number): string[] {
    const items: string[] = [];
    for (let i = 0; i < size; i++) items.push(this.pickDish(items).id);
    const cap = this.pizza.learning.practiceMaxItems;
    const at = items.findIndex((k) => this.familiarity(k) !== 'normal');
    if (at >= 0 && items.length > cap) {
      const keep = new Set<number>([at]);
      for (let i = 0; i < items.length && keep.size < cap; i++) keep.add(i);
      return items.filter((_, i) => keep.has(i));
    }
    return items;
  }

  spawnCustomer(forceType?: string): void {
    if (this.dishes.length === 0) return this.invalid(`The ${this.pizza.restaurant.name} opens at Lv ${this.pizza.restaurant.unlockLevel}`);
    const info = this.levelInfo;
    const intro = forceType ? null : this.introDue();
    const typeKey = forceType && this.cfg.customers.types[forceType] ? forceType : intro && this.cfg.customers.types.regular ? 'regular' : this.pickType();
    const type = this.cfg.customers.types[typeKey];
    const used = new Set(this.customers.map((c) => c.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const size = Math.min(this.pizza.settings.maxOrderSize, pickOrderSize(info.orderSize, pizzaRampFor(this.pizza, this.menuStep).bigOrderShare, this.rng) + type.extraItems);
    const items: string[] = intro ? [intro.id] : this.pickItems(size);
    const custom = intro || forceType ? null : this.makeCustom(items);
    this.history = recordOrder(this.variety, this.history, items.map((id) => ({ id, kind: this.kindOf(id) })));
    const price = Math.round(items.reduce((sum, k) => sum + this.itemDef(k).price, 0) * type.payMult);
    const closes = Math.min(this.closesAtLevel.get(this.level) ?? 0, 3);
    const patienceMax = info.patience * pizzaRampFor(this.pizza, this.menuStep).patienceMult * type.patienceMult * this.mods.patience * (1 + 0.1 * closes) * (intro ? this.pizza.learning.introPatienceMult : 1);
    const c: PizzaCustomer = {
      id: this.nextId++,
      seat,
      look: randInt(this.rng, CUSTOMER_LOOK_MIN, TACO_LOOK_MAX),
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
    if (custom) this.emit({ type: 'customOrder', customer: c.id, dish: custom });
  }

  /** From the custom-orders step on, sometimes swap ONE ordinary pizza of the order for a build-your-own pizza. Returns its id, or null. */
  private makeCustom(items: string[]): string | null {
    const at = items.findIndex((id) => this.kindOf(id) === 'pizza' && this.familiarity(id) === 'normal');
    if (at < 0) return null;
    const r = rollCustom(this.pizza, this.menuStep, () => this.rng());
    if (!r) return null;
    const d = customDish(this.pizza, r);
    this.customDishes.set(d.id, d);
    items[at] = d.id;
    return d.id;
  }

  private itemDef(id: string): DishDef {
    const d = this.dishDef(id);
    if (!d) throw new Error(`unknown pizza item ${id}`);
    return d;
  }

  // ----- boards: dough, ingredients, finishing -----

  /** Tap the dough tray: dough goes on the given board (or the first empty one). */
  startPizza(board?: number): number | null {
    if (this.closed) return null;
    const b = board !== undefined ? this.boards[board] : this.boards.find((x) => !x.item);
    if (!b) {
      this.invalid('All the boards are busy');
      return null;
    }
    if (b.item) {
      this.invalid('That board is in use');
      return null;
    }
    b.item = { id: this.nextItemId++, placed: ['dough'], status: 'building', dish: null, bakedPhase: null, oven: null };
    this.emit({ type: 'boardStart', board: b.index });
    return b.index;
  }

  /** The board an ingredient goes to when none is named: the oldest building board that can take it. */
  private acceptor(step: string): PizzaBoard | undefined {
    return this.boards.find((b) => b.item?.status === 'building' && this.nextFor(b.item).includes(step));
  }

  /** Tap a sauce, cheese or topping (`sauce:tomato`...). Goes to the named board, or the oldest board that needs it. */
  addIngredient(step: string, board?: number): boolean {
    if (this.closed) return false;
    if (!this.ingredients.includes(step)) {
      this.invalid(`${this.pizza.stepLabels[step] ?? step} is not on the menu yet`);
      return false;
    }
    const target = board !== undefined ? this.boards[board] : this.acceptor(step);
    const item = target?.item;
    if (!target || !item || item.status !== 'building') {
      const anyBuilding = this.boards.some((b) => b.item?.status === 'building');
      this.invalid(anyBuilding ? this.waitingMessage() : 'Start with the dough');
      return false;
    }
    if (!this.nextFor(item).includes(step)) {
      this.invalid(this.waitingMessage(item));
      return false;
    }
    item.placed.push(step);
    this.emit({ type: 'ingredient', board: target.index, step });
    return true;
  }

  private waitingMessage(item?: PizzaItem): string {
    const it = item ?? this.boards.find((b) => b.item?.status === 'building')?.item;
    if (!it) return 'Start with the dough';
    const kind = it.placed.some((s) => s.startsWith('cheese:')) ? 'topping' : it.placed.some((s) => s.startsWith('sauce:')) ? 'cheese' : 'sauce';
    const next = this.nextFor(it)[0];
    if (!next) return 'This pizza is complete: tap it to finish';
    return `Add ${kind === 'topping' ? 'a topping that belongs' : `the ${kind}`} first`;
  }

  /** Tap a building pizza to finish it. It needs sauce, cheese and every topping of exactly one unlocked recipe. */
  finishPizza(board: number): boolean {
    if (this.closed) return false;
    const item = this.boards[board]?.item;
    if (!item || item.status !== 'building') return false;
    const d = finishedPizza(this.recipeCfg(), this.menuStep, this.layers(item));
    if (!d) {
      this.invalid('That is not a recipe yet');
      return false;
    }
    item.status = 'built';
    item.dish = d.id;
    this.emit({ type: 'pizzaBuilt', board, dish: d.id });
    return true;
  }

  /** Put a finished pizza into the brick oven (the first free slot, or the named one). "Oven full" when there is none. */
  sendToOven(board: number, slot?: number): boolean {
    if (this.closed) return false;
    const item = this.boards[board]?.item;
    if (!item || item.status !== 'built' || !item.dish) return false;
    const s = slot !== undefined ? (this.ovens[slot] ? -1 : slot) : this.firstFree(this.ovens);
    if (s < 0 || s >= this.ovens.length) {
      this.emit({ type: 'ovenFull' });
      this.invalid('Oven full');
      return false;
    }
    this.ovens[s] = { t: 0, phase: 'cooking', board };
    item.status = 'baking';
    item.oven = s;
    this.emit({ type: 'ovenStart', slot: s, board, dish: item.dish });
    return true;
  }

  /**
   * Tap a board. Building: finish it. Built: into the oven. Baking: only a wobble. Baked: serve it to the oldest customer who ordered it.
   */
  tapBoard(board: number): boolean {
    const item = this.boards[board]?.item;
    if (!item) return false;
    if (item.status === 'building') return this.finishPizza(board);
    if (item.status === 'built') return this.sendToOven(board);
    if (item.status === 'baking') {
      this.emit({ type: 'wobble', where: 'oven', index: item.oven ?? 0 });
      return false;
    }
    return this.serveBoard(board);
  }

  // ----- brick oven -----

  /** Tap an oven slot. Cooking: only a wobble. Ready or overcooking: the player takes the pizza out and it goes back to its board. Burnt: thrown away. */
  tapOven(slot: number): boolean {
    if (this.closed) return false;
    const o = this.ovens[slot];
    if (!o) return false;
    const item = this.boards[o.board]?.item;
    if (o.phase === 'cooking') {
      this.emit({ type: 'wobble', where: 'oven', index: slot });
      return false;
    }
    this.ovens[slot] = null;
    if (o.phase === 'burnt') {
      if (item) this.boards[o.board].item = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where: 'oven', index: slot, penalty: true });
      return true;
    }
    if (item) {
      item.status = 'baked';
      item.oven = null;
      item.bakedPhase = o.phase;
      item.perfect = this.perfectNow(o.t, this.pizza.timed.pizza);
    }
    this.emit({ type: 'collect', slot, board: o.board, phase: o.phase });
    if (item?.perfect) this.emit({ type: 'perfectBake', where: 'oven', index: slot });
    return true;
  }

  // ----- small oven, fryer, ice cream -----

  /** A side tray (garlic bread, cheesy breadsticks, cinnamon twists) goes into the first free small-oven tray. */
  startSide(dishId: string): boolean {
    if (this.closed) return false;
    const d = this.dishDef(dishId);
    if (!d || d.kind !== 'side' || d.unlockStep > this.menuStep) {
      this.invalid(`${d?.name ?? dishId} is not on the menu yet`);
      return false;
    }
    const i = this.firstFree(this.smallOven);
    if (i < 0) {
      this.invalid('The small oven is full');
      return false;
    }
    this.smallOven[i] = { t: 0, phase: 'cooking', dish: dishId };
    this.emit({ type: 'trayStart', where: 'small', index: i, dish: dishId });
    return true;
  }

  /** Fries and wings each have their own basket. */
  startFried(dishId: string): boolean {
    if (this.closed) return false;
    const d = this.dishDef(dishId);
    if (!d || d.kind !== 'fried' || d.basket === undefined || d.unlockStep > this.menuStep) {
      this.invalid(`${d?.name ?? dishId} is not on the menu yet`);
      return false;
    }
    if (this.fryer[d.basket]) {
      this.invalid('That basket is busy');
      return false;
    }
    this.fryer[d.basket] = { t: 0, phase: 'cooking', dish: dishId };
    this.emit({ type: 'trayStart', where: 'fryer', index: d.basket, dish: dishId });
    return true;
  }

  /** Tap the ice cream machine: start filling the first free lane. */
  startIce(): boolean {
    if (this.closed) return false;
    if (!this.dishes.some((d) => d.kind === 'dessert')) {
      this.invalid('Ice cream is not on the menu yet');
      return false;
    }
    const i = this.firstFree(this.ice);
    if (i < 0) {
      this.invalid('All the cones are full');
      return false;
    }
    this.ice[i] = { t: 0, phase: 'cooking' };
    this.emit({ type: 'iceStart', lane: i });
    return true;
  }

  tapSmallOven(index: number): boolean {
    return this.tapTray('small', index);
  }
  tapFryer(index: number): boolean {
    return this.tapTray('fryer', index);
  }
  /** Tap a tray or basket: cooking only wobbles, burnt is thrown away, ready goes to the oldest customer who ordered it. */
  private tapTray(where: 'small' | 'fryer', index: number): boolean {
    return this.serveTray(where, index);
  }
  /** Serve a ready tray or basket. With `customerId` (a drag) that customer gets it, or loses patience if they did not order it. */
  serveTray(where: 'small' | 'fryer', index: number, customerId?: number): boolean {
    if (this.closed) return false;
    const list = where === 'small' ? this.smallOven : this.fryer;
    const t = list[index];
    if (!t) return false;
    if (t.phase === 'cooking') {
      this.emit({ type: 'wobble', where, index });
      return false;
    }
    if (t.phase === 'burnt') {
      list[index] = null;
      this.discardPenalty();
      this.emit({ type: 'discard', where, index, penalty: true });
      return true;
    }
    const c = this.receiver(t.dish, customerId);
    if (!c) return false;
    list[index] = null;
    const def = where === 'small' ? this.pizza.timed.side : this.dishDef(t.dish)?.basket === 1 ? this.pizza.timed.wings : this.pizza.timed.fries;
    this.deliverTo(c, t.dish, where, index, this.perfectNow(t.t, def));
    return true;
  }

  tapIce(lane: number): boolean {
    return this.serveIce(lane);
  }
  /** Serve a full cone (to the oldest customer who ordered ice cream, or to the one it was dragged to). */
  serveIce(lane: number, customerId?: number): boolean {
    if (this.closed) return false;
    const p = this.ice[lane];
    if (!p) return false;
    if (p.phase === 'cooking') {
      this.emit({ type: 'wobble', where: 'ice', index: lane });
      return false;
    }
    const dessert = this.dishes.find((d) => d.kind === 'dessert');
    const c = dessert ? this.receiver(dessert.id, customerId) : undefined;
    if (!dessert || !c) return false;
    this.ice[lane] = null;
    this.deliverTo(c, dessert.id, 'ice', lane);
    return true;
  }

  /**
   * Who gets a dish. No customer named (a tap): the oldest one who ordered it, "Nobody ordered that" when there is none.
   * A customer named (a drag): that one, or a wrong-drop with the usual patience penalty when they did not order it.
   */
  private receiver(dish: string, customerId?: number): PizzaCustomer | undefined {
    if (customerId === undefined) {
      const c = this.oldestNeeding(dish);
      if (!c) this.invalid('Nobody ordered that');
      return c;
    }
    const c = this.customers.find((x) => x.id === customerId);
    if (!c || c.mood !== 'waiting') {
      this.emit({ type: 'wrongDrop', customer: c?.id ?? null });
      return undefined;
    }
    if (!c.items.some((k, i) => k === dish && !c.delivered[i])) {
      c.patience = Math.max(0, c.patience - c.patienceMax * this.cfg.combo.wrongItemPatiencePenalty);
      this.emit({ type: 'wrongDrop', customer: c.id, penalty: true });
      return undefined;
    }
    return c;
  }

  // ----- trash -----

  /**
   * The trash bin. A board that is only dough and ingredients, or a pizza not yet baked, costs nothing. A baked pizza costs the usual penalty.
   * A pizza inside the oven cannot be thrown away from here: take it out first (burnt ones are cleared by tapping them).
   */
  discardBoard(board: number): boolean {
    if (this.closed) return false;
    const item = this.boards[board]?.item;
    if (!item) {
      this.invalid('Nothing to throw away');
      return false;
    }
    if (item.status === 'baking') {
      this.invalid('Take it out of the oven first');
      return false;
    }
    const penalty = item.status === 'baked';
    this.boards[board].item = null;
    if (penalty) this.discardPenalty();
    this.emit({ type: 'discard', where: 'board', index: board, penalty });
    return true;
  }

  private discardPenalty(): void {
    this.coins = Math.max(0, this.coins - this.cfg.recipes.settings.trashPenaltyCoins);
  }

  // ----- serving -----

  /** The longest-waiting customer who still needs this dish. */
  oldestNeeding(dishId: string): PizzaCustomer | undefined {
    return this.customers.find((c) => c.mood === 'waiting' && c.items.some((k, i) => k === dishId && !c.delivered[i]));
  }

  /** Serve a baked pizza from its board to a customer (the oldest one who ordered it when none is named). */
  serveBoard(board: number, customerId?: number): boolean {
    if (this.closed) return false;
    const item = this.boards[board]?.item;
    if (!item || item.status !== 'baked' || !item.dish) {
      this.emit({ type: 'wrongDrop', customer: customerId ?? null });
      return false;
    }
    const c = customerId !== undefined ? this.customers.find((x) => x.id === customerId) : this.oldestNeeding(item.dish);
    if (!c || c.mood !== 'waiting') {
      if (customerId === undefined) this.invalid('Nobody ordered that');
      this.emit({ type: 'wrongDrop', customer: c?.id ?? null });
      return false;
    }
    const need = c.items.findIndex((k, i) => k === item.dish && !c.delivered[i]);
    if (need < 0) {
      c.patience = Math.max(0, c.patience - c.patienceMax * this.cfg.combo.wrongItemPatiencePenalty);
      this.emit({ type: 'wrongDrop', customer: c.id, penalty: true });
      return false;
    }
    this.boards[board].item = null;
    this.deliverTo(c, item.dish, 'board', board, !!item.perfect);
    return true;
  }

  /** Perfect only counts while the food is READY; the cook clock and the burn rules are never touched. */
  private perfectNow(t: number, def: { readyAfter: number; burnWindow: number }): boolean {
    return isPerfectBake(t, def.readyAfter, this.burnWindow(def.burnWindow), this.pizza.perfectBake.share);
  }

  private deliverTo(c: PizzaCustomer, dish: string, from: 'board' | 'small' | 'fryer' | 'ice', index: number, perfect = false): void {
    const need = c.items.findIndex((k, i) => k === dish && !c.delivered[i]);
    c.delivered[need] = true;
    if (perfect) {
      c.perfectTips = (c.perfectTips ?? 0) + perfectTip(this.itemDef(dish).price, this.pizza.perfectBake.tipFraction, this.mods.tips);
      if (from !== 'board') this.emit({ type: 'perfectBake', where: from === 'small' ? 'small' : 'fryer', index });
    }
    this.emit({ type: 'deliver', customer: c.id, dish, itemIndex: need, from, index });
    if (!isCustomId(dish)) this.countServe(dish); // custom pizzas are not recipes: nothing to learn or save
    if (c.delivered.every(Boolean)) this.completeOrder(c);
  }

  private countServe(dish: string): void {
    const count = (this.dishServes[dish] ?? 0) + 1;
    this.dishServes[dish] = count;
    this.emit({ type: 'recipeServed', dish, count, first: count === 1, learned: count === this.pizza.learning.practiceServes });
  }

  private completeOrder(c: PizzaCustomer): void {
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
    // Perfect bakes add a small flat tip on top (not multiplied by the streak, so it stays small and predictable).
    const perfectExtra = c.perfectTips ?? 0;
    let coins = Math.round((c.price + tip) * mult * coinMult) + perfectExtra;
    const baseXp = c.items.reduce((s, k) => s + this.itemDef(k).xp, 0);
    let xp = Math.round((baseXp + (fast ? this.cfg.xp.speedBonusXp : 0) + (rush ? cc.rush.bonusXp : 0)) * mult);
    // Combo meal: only a COMPLETE order with a pizza, a side and an ice cream, paid once.
    let combo: { coins: number; xp: number } | null = null;
    if (!c.comboPaid && isComboMeal(c.items.map((k) => this.kindOf(k)))) {
      c.comboPaid = true;
      combo = comboBonus(coins, xp, this.pizza.comboMeal.coinBonus, this.pizza.comboMeal.xpBonus);
      coins += combo.coins;
      xp += combo.xp;
    }
    c.mood = 'happy';
    c.leaveIn = LEAVE_DELAY;
    this.served++;
    this.coins += coins;
    this.addReputation(this.cfg.xp.reputation.serveGain + (this.combo >= cc.comboReputationFrom ? cc.comboReputationGain : 0));
    if (combo) this.emit({ type: 'comboMeal', customer: c.id, coins: combo.coins, xp: combo.xp });
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

  // ----- events (shared, non-room events only) -----

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
    const pool = tacoEventPool(this.cfg.events.events, this.level, this.menuStep, []);
    if (pool.length === 0) {
      this.nextEventIn = 10;
      return;
    }
    this.startEvent(pool[randInt(this.rng, 0, pool.length - 1)]);
  }

  startEvent(def: EventDef): void {
    this.event = { def, remaining: def.duration };
    this.emit({ type: 'eventStart', id: def.id, name: def.name, duration: def.duration });
    const seats = Math.min(this.levelInfo.maxCustomers, this.pizza.settings.seats);
    if (def.spawnType && this.customers.length < this.pizza.settings.seats && this.customers.filter((c) => c.mood === 'waiting').length < seats + 1) {
      this.spawnCustomer(def.spawnType);
    }
  }

  // ----- XP, menu steps, reputation -----

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

  private addMenuXp(amount: number): void {
    if (this.menuStep >= MAX_PIZZA_STEP) return;
    this.menuXp += amount;
    while (this.menuStep < MAX_PIZZA_STEP && this.menuXp >= this.menuXpNeeded) {
      this.menuXp -= this.menuXpNeeded;
      this.menuStep++;
      this.emit({ type: 'menuGrew', added: this.pizza.dishes.filter((d) => d.unlockStep === this.menuStep).map((d) => d.name) });
      if (this.learning) this.nextArrival = Math.max(this.nextArrival, this.pizza.learning.introDelay);
    }
    if (this.menuStep >= MAX_PIZZA_STEP) this.menuXp = 0;
  }

  private addReputation(delta: number): void {
    this.reputation = Math.max(0, Math.min(100, this.reputation + delta));
    if (this.reputation <= 0 && !this.closed) {
      this.closed = true;
      this.closesAtLevel.set(this.level, (this.closesAtLevel.get(this.level) ?? 0) + 1);
      this.emit({ type: 'closed' });
    }
  }

  /** Reopen after closing: Reopen 55 reputation, 100 after a rewarded ad (same rule as the diner and the truck). The kitchen starts fresh. */
  reopen(full = false): void {
    if (!this.closed) return;
    this.closed = false;
    this.reputation = full ? 100 : this.cfg.xp.reputation.reopenTo;
    this.boards.forEach((b) => (b.item = null));
    this.ovens = this.ovens.map(() => null);
    this.smallOven = this.smallOven.map(() => null);
    this.fryer = this.fryer.map(() => null);
    this.ice = this.ice.map(() => null);
    this.customers = [];
    this.history = emptyHistory();
    this.nextArrival = 1;
    this.combo = 0;
    this.streak = 0;
    this.event = null;
    this.nextEventIn = this.cfg.events.firstAfter;
    this.emit({ type: 'reopened' });
  }

  // ----- helpers for views and bots -----

  isNeeded(id: string): boolean {
    return this.customers.some((c) => c.mood === 'waiting' && c.items.some((k, i) => k === id && !c.delivered[i]));
  }
  ovenEdible(slot: number): boolean {
    const o = this.ovens[slot];
    return !!o && isEdible(o.phase);
  }
  /** Which kind of step an ingredient id is (for views that colour their buttons). */
  stepKind(id: string) {
    return stepKindOf(id);
  }
}
