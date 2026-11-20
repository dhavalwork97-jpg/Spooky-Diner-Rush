import { defaultConfig } from '../../src/game/config';
import { defaultTacoConfig, type TacoConfig } from '../../src/game/taco/tacoConfig';
import { TacoKitchenState } from '../../src/game/taco/TacoKitchenState';

/**
 * Order-variety measurements for the Taco Truck. `simulateOrders` generates many customer orders at one menu step with every dish on that
 * step's menu already learned (the steady state), and measures how repetitive they are. `learningRun` plays a perfect server through a
 * step whose dishes are all new and records when each one is introduced and learned. `oldTacoConfig` is the same data without the variety
 * settings, i.e. the plain random pick the truck used before, so before and after run through the same code.
 */
export const oldTacoConfig: TacoConfig = (() => {
  const c = JSON.parse(JSON.stringify(defaultTacoConfig)) as TacoConfig;
  delete c.variety;
  for (const r of c.ramp) delete r.bigOrderShare;
  return c;
})();

export interface SimResult {
  step: number;
  dishesOnMenu: number;
  orders: number;
  items: number;
  avgSize: number;
  /** Share of orders with three items. */
  size3Pct: number;
  drinkPct: number;
  /** Share of all items by dish kind (soft_taco, crispy_taco, burrito, nachos, drink). */
  kindPct: Record<string, number>;
  /** Share of all items by dish. */
  dishPct: Record<string, number>;
  /** The least ordered dish's share divided by a fair share (1 = perfectly even, 0 = never ordered). */
  worstDishVsFair: number;
  /** Orders with the same dish twice, as a share of orders that hold a dish. */
  withinOrderDupPct: number;
  /** A customer's first dish equals the previous customer's first dish. */
  consecFirstSamePct: number;
  /** A customer orders any dish the previous customer ordered. */
  consecOverlapPct: number;
  /** Dish items that are the third (or later) in a row of the same kind, as a share of dish items. Only meaningful with two or more kinds. */
  sameKindRun3Pct: number;
  /** Regular customers as a share of orders, and how many different regulars showed up. */
  regularPct: number;
  regularsSeen: number;
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : +((100 * n) / d).toFixed(2));

export function learnedSave(taco: TacoConfig, step: number): Record<string, number> {
  const served: Record<string, number> = {};
  for (const d of taco.dishes) if (d.unlockStep <= step) served[d.id] = taco.learning.practiceServes;
  return served;
}

export function simulateOrders(taco: TacoConfig, step: number, n: number, seed: number): SimResult {
  const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: learnedSave(taco, step) }, defaultConfig, taco, seed);
  const kindOf = new Map(taco.dishes.map((d) => [d.id, d.kind as string]));
  const dishCount: Record<string, number> = {};
  const kindCount: Record<string, number> = {};
  let items = 0, drinks = 0, size3 = 0, ordersWithDish = 0, withinDup = 0, pairs = 0, firstSame = 0, overlap = 0, dishItems = 0, run3 = 0, regulars = 0;
  const regularIds = new Set<string>();
  let prev: string[] | null = null;
  const kindSeq: string[] = [];
  for (let i = 0; i < n; i++) {
    s.customers.length = 0;
    s.spawnCustomer();
    const c = s.customers[0];
    if (c.regular) {
      regulars++;
      regularIds.add(c.regular);
    }
    if (c.items.length === 3) size3++;
    const dishes = c.items.filter((k) => kindOf.has(k));
    if (dishes.length > 0) ordersWithDish++;
    if (new Set(dishes).size < dishes.length) withinDup++;
    for (const k of c.items) {
      items++;
      const kind = kindOf.get(k) ?? 'drink';
      kindCount[kind] = (kindCount[kind] ?? 0) + 1;
      if (kind === 'drink') drinks++;
      else {
        dishCount[k] = (dishCount[k] ?? 0) + 1;
        dishItems++;
        const m = kindSeq.length;
        if (m >= 2 && kindSeq[m - 1] === kind && kindSeq[m - 2] === kind) run3++;
        kindSeq.push(kind);
      }
    }
    if (prev) {
      pairs++;
      if (dishes.length > 0 && prev.length > 0 && dishes[0] === prev[0]) firstSame++;
      if (dishes.some((d) => prev!.includes(d))) overlap++;
    }
    prev = dishes;
  }
  const onMenu = taco.dishes.filter((d) => d.unlockStep <= step);
  const fair = dishItems / onMenu.length;
  return {
    step,
    dishesOnMenu: onMenu.length,
    orders: n,
    items,
    avgSize: +(items / n).toFixed(2),
    size3Pct: pct(size3, n),
    drinkPct: pct(drinks, items),
    kindPct: Object.fromEntries(Object.entries(kindCount).sort().map(([k, v]) => [k, pct(v, items)])),
    dishPct: Object.fromEntries(Object.entries(dishCount).sort().map(([k, v]) => [k, pct(v, items)])),
    worstDishVsFair: +(Math.min(...onMenu.map((d) => (dishCount[d.id] ?? 0) / fair))).toFixed(2),
    withinOrderDupPct: pct(withinDup, ordersWithDish),
    consecFirstSamePct: pct(firstSame, pairs),
    consecOverlapPct: pct(overlap, pairs),
    sameKindRun3Pct: pct(run3, dishItems),
    regularPct: pct(regulars, n),
    regularsSeen: regularIds.size,
  };
}

export interface LearningResult {
  step: number;
  newDishes: string[];
  /** Customer number (1-based) at which each new dish was first ordered, and at which it was served `practiceServes` times. */
  introducedAt: Record<string, number>;
  learnedAt: Record<string, number>;
  /** Orders that held a dish nobody has served yet next to another dish (should be none: introductions come alone). */
  introMixedOrders: number;
  /** Orders that held two dishes that were not learned yet (should be none). */
  twoUnfamiliarOrders: number;
  /** Introduction orders (a first-time dish, alone). */
  introOrders: number;
  customers: number;
}

/** A perfect server (every ordered dish is served at once) at the start of `step`: dishes of earlier steps are learned, this step's dishes are new. */
export function learningRun(taco: TacoConfig, step: number, customers: number, seed: number): LearningResult {
  const served = learnedSave(taco, step - 1);
  const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: { ...served } }, defaultConfig, taco, seed);
  const fresh = taco.dishes.filter((d) => d.unlockStep === step).map((d) => d.id);
  const introducedAt: Record<string, number> = {};
  const learnedAt: Record<string, number> = {};
  let introMixed = 0, twoUnfamiliar = 0, introOrders = 0;
  for (let i = 1; i <= customers; i++) {
    s.customers.length = 0;
    s.spawnCustomer();
    const items = s.customers[0].items;
    const dishes = items.filter((k) => taco.dishes.some((d) => d.id === k));
    const fams = dishes.map((k) => s.familiarity(k));
    if (fams.includes('intro') && items.length > 1) introMixed++;
    if (fams.filter((f) => f !== 'normal').length > 1) twoUnfamiliar++;
    if (fams.includes('intro') && items.length === 1) introOrders++;
    for (const k of dishes) {
      if (fresh.includes(k) && introducedAt[k] === undefined) introducedAt[k] = i;
      s.dishServes[k] = (s.dishServes[k] ?? 0) + 1;
      if (fresh.includes(k) && s.dishServes[k] >= taco.learning.practiceServes && learnedAt[k] === undefined) learnedAt[k] = i;
    }
  }
  return { step, newDishes: fresh, introducedAt, learnedAt, introMixedOrders: introMixed, twoUnfamiliarOrders: twoUnfamiliar, introOrders, customers };
}
