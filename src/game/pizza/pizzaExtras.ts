import { defaultExtras, type Extras, type MasteryTier } from '../extras';
import type { DishDef } from './pizzaConfig';

// Pizza Place mastery and Daily Special, pure (no Phaser). The badge tiers and the special's bonus are the SAME numbers the Diner uses (data/extras.json);
// what is Pizza-only is what they count (the ten pizzas) and where the progress is saved (`pizzaMastery`, `pizzaSpecialDay`).

export const pizzaMasteryTiers = (extras: Extras = defaultExtras): MasteryTier[] => extras.mastery.tiers;

/** How many badge tiers a serve count has earned (0 to 3). */
export const pizzaTierFor = (count: number, tiers: readonly MasteryTier[] = pizzaMasteryTiers()): number => tiers.filter((t) => count >= t.serves).length;

export interface PizzaMasteryCell {
  dish: string;
  name: string;
  count: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  tier: number;
  next: { name: string; remaining: number } | null;
  onMenu: boolean;
}

export const PIZZA_MASTERY_COLUMNS = 5;

/** The ten pizzas as a grid, five to a row, in menu order. Sides, fried food and ice cream have no badges. */
export function pizzaMasteryGrid(dishes: readonly DishDef[], served: Readonly<Record<string, number>>, menuStep: number, tiers: readonly MasteryTier[] = pizzaMasteryTiers()): PizzaMasteryCell[][] {
  const pizzas = dishes.filter((d) => d.kind === 'pizza').sort((a, b) => a.unlockStep - b.unlockStep);
  const cells = pizzas.map((d): PizzaMasteryCell => {
    const count = Math.max(0, Math.floor(served[d.id] ?? 0));
    const tier = pizzaTierFor(count, tiers);
    return { dish: d.id, name: d.name, count, tier, next: tier < tiers.length ? { name: tiers[tier].name, remaining: tiers[tier].serves - count } : null, onMenu: d.unlockStep <= menuStep };
  });
  const rows: PizzaMasteryCell[][] = [];
  for (let i = 0; i < cells.length; i += PIZZA_MASTERY_COLUMNS) rows.push(cells.slice(i, i + PIZZA_MASTERY_COLUMNS));
  return rows;
}

export interface PizzaMasteryAward {
  dish: string;
  /** Tier reached: 1 bronze, 2 silver, 3 gold. */
  tier: number;
  name: string;
  coins: number;
}

/** Badges the serve counts have earned that `paid` (dish -> tiers already paid) does not yet cover. Only real pizzas count; lowest tier first. */
export function pizzaMasteryDue(dishes: readonly DishDef[], served: Readonly<Record<string, number>>, paid: Readonly<Record<string, number>>, tiers: readonly MasteryTier[] = pizzaMasteryTiers()): PizzaMasteryAward[] {
  const out: PizzaMasteryAward[] = [];
  for (const d of dishes) {
    if (d.kind !== 'pizza') continue;
    const have = pizzaTierFor(served[d.id] ?? 0, tiers);
    for (let t = (paid[d.id] ?? 0) + 1; t <= have; t++) out.push({ dish: d.id, tier: t, name: tiers[t - 1].name, coins: tiers[t - 1].coins });
  }
  return out.sort((a, b) => a.tier - b.tier || a.dish.localeCompare(b.dish));
}

/** The paid map after paying `awards`. Never goes down. */
export function pizzaPaidAfter(paid: Readonly<Record<string, number>>, awards: readonly PizzaMasteryAward[]): Record<string, number> {
  const out = { ...paid };
  for (const a of awards) out[a.dish] = Math.max(out[a.dish] ?? 0, a.tier);
  return out;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's pizza of the day: the same all day and on every device for the same menu, picked by date from `pool` (pizza ids, sorted here so order never matters). */
export function pizzaSpecialFor(dateKey: string, pool: readonly string[]): string | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort();
  return sorted[hashString(`chef-rush:pizza:${dateKey}`) % sorted.length];
}
