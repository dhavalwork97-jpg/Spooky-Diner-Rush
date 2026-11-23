import type { TacoVariety } from './tacoConfig';
import { randInt, type Rng } from '../rng';

// Order variety for the Taco Truck. Pure helpers, no Phaser. The kitchen model asks them how likely a dish is right now, given what was ordered lately.
// Everything is a soft multiplier on the usual weighted random pick: no dish is ever shut out, nothing runs in a fixed order, customers stay unpredictable.

/** Every effect off: the old plain weighted random pick. */
export const NEUTRAL_VARIETY: TacoVariety = {
  recentDishes: 0,
  recencyWeights: [],
  kindWindow: 0,
  kindStrength: 0,
  kindMin: 1,
  kindMax: 1,
  drinkStrength: 0,
  drinkMin: 1,
  drinkMax: 1,
  avoidDuplicateInOrder: false,
};

/** What was ordered lately, most recent first. `dishes` are dish ids; `items` are `drink` or a dish kind, one per ordered item. */
export interface OrderHistory {
  dishes: string[];
  items: string[];
}
export const emptyHistory = (): OrderHistory => ({ dishes: [], items: [] });

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Chance multiplier for a dish by how recently it was ordered. `recent` is most recent first and may start with the dishes already in this order. */
export function recencyMult(v: TacoVariety, recent: readonly string[], dishId: string): number {
  const i = recent.indexOf(dishId);
  return i < 0 ? 1 : (v.recencyWeights[i] ?? 1);
}

/** Dish kinds among the last items (drinks left out), most recent first, at most `kindWindow` items looked at. */
export function recentDishKinds(v: TacoVariety, items: readonly string[]): string[] {
  return items.slice(0, v.kindWindow).filter((k) => k !== 'drink');
}

/** Chance multiplier for a dish kind: below 1 when that kind is more than its fair share of the recent dishes, above 1 when it is less. `kindsInPlay` is how many kinds could be picked now. */
export function kindMult(v: TacoVariety, recentKinds: readonly string[], kind: string, kindsInPlay: number): number {
  if (v.kindStrength <= 0 || kindsInPlay <= 1 || recentKinds.length === 0) return 1;
  const expected = 1 / kindsInPlay;
  const share = recentKinds.filter((k) => k === kind).length / recentKinds.length;
  return clamp(1 + (v.kindStrength * (expected - share)) / expected, v.kindMin, v.kindMax);
}

/** The drink chance for the next item: `base` nudged down after lots of drinks and up after few. Needs a few items of history before it moves at all. */
export function drinkChanceNow(v: TacoVariety, base: number, items: readonly string[]): number {
  const recent = items.slice(0, v.kindWindow);
  if (v.drinkStrength <= 0 || base <= 0 || recent.length < 4) return base;
  const share = recent.filter((k) => k === 'drink').length / recent.length;
  return base * clamp(1 + (v.drinkStrength * (base - share)) / base, v.drinkMin, v.drinkMax);
}

/** Remember an order (items in the order they were asked for). Keeps only what the settings need. */
export function recordOrder(v: TacoVariety, h: OrderHistory, items: readonly { id: string; kind: string }[]): OrderHistory {
  const dishes = [...h.dishes];
  const kinds = [...h.items];
  for (const it of items) {
    if (it.kind !== 'drink') dishes.unshift(it.id);
    kinds.unshift(it.kind);
  }
  return { dishes: dishes.slice(0, Math.max(0, v.recentDishes)), items: kinds.slice(0, Math.max(0, v.kindWindow)) };
}

/** How many items an order has. When the step's range spans three or more sizes and has a `bigShare`, the biggest size is that likely and the others share the rest evenly; otherwise every size is equally likely. */
export function pickOrderSize(range: readonly [number, number], bigShare: number | undefined, rng: Rng): number {
  const [lo, hi] = range;
  if (bigShare === undefined || hi - lo < 2) return randInt(rng, lo, hi);
  return rng() < bigShare ? hi : randInt(rng, lo, hi - 1);
}
