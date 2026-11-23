import { unlockedIngredients } from './pizzaConfig';
import type { DishDef, PizzaConfig, Recipe } from './pizzaConfig';

// Build-your-own pizza orders. A custom order is NOT a new recipe system: it is a "virtual recipe" made of the same sauce, cheese and toppings,
// handed to the build/finish rules the real recipes use. Pure: no Phaser, no kitchen state.

export const CUSTOM_PREFIX = 'custom:';
export const isCustomId = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);

/** `custom:tomato:mozzarella:mushroom+olive`, toppings sorted so the same pizza always has the same id (topping ORDER never matters). */
export function customId(r: Recipe): string {
  return `${CUSTOM_PREFIX}${r.sauce}:${r.cheese}:${[...r.toppings].sort().join('+')}`;
}

export function parseCustom(id: string): Recipe | null {
  if (!isCustomId(id)) return null;
  const [sauce, cheese, tops] = id.slice(CUSTOM_PREFIX.length).split(':');
  if (!sauce || !cheese || !tops) return null;
  return { sauce, cheese, toppings: tops.split('+') };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** True when this recipe is already one of the ten real pizzas (then it is just that pizza, not a custom order). */
export const isRealRecipe = (cfg: PizzaConfig, r: Recipe): boolean => cfg.dishes.some((d) => d.recipe && d.recipe.sauce === r.sauce && d.recipe.cheese === r.cheese && sameSet(d.recipe.toppings, r.toppings));

/** The virtual pizza for a custom recipe: same shape as a menu dish, so the existing code can treat it like one. */
export function customDish(cfg: PizzaConfig, r: Recipe): DishDef {
  const c = cfg.custom;
  const price = c.basePrice + c.toppingPrice * r.toppings.length + (r.sauce !== 'tomato' ? c.sauceExtra : 0) + (r.cheese !== 'mozzarella' ? c.cheeseExtra : 0);
  const xp = c.xpBase + c.xpPerTopping * r.toppings.length;
  return { id: customId(r), name: 'Custom pizza', kind: 'pizza', unlockStep: 1, price, xp, icon: 'custom', recipe: r };
}

/** Most toppings a custom order may ask for at this menu step: 0 means no custom orders yet. Grows slowly. */
export function customMaxToppings(cfg: PizzaConfig, step: number): number {
  const c = cfg.custom;
  if (step < c.fromStep) return 0;
  return c.maxToppings[Math.min(c.maxToppings.length - 1, step - c.fromStep)] ?? 1;
}
export function customChance(cfg: PizzaConfig, step: number): number {
  const c = cfg.custom;
  if (step < c.fromStep) return 0;
  return c.chance[Math.min(c.chance.length - 1, step - c.fromStep)] ?? 0;
}

/**
 * Roll a custom recipe for this menu step, or null. `rng` is only used from `fromStep` on, so earlier steps play exactly as before.
 * Only ingredients on the menu at this step are used; a recipe equal to a real pizza is re-rolled.
 */
export function rollCustom(cfg: PizzaConfig, step: number, rng: () => number): Recipe | null {
  const max = customMaxToppings(cfg, step);
  if (max === 0 || rng() >= customChance(cfg, step)) return null;
  const on = new Set(unlockedIngredients(cfg, step));
  const sauces = cfg.ingredients.sauces.filter((s) => on.has(`sauce:${s.id}`));
  const cheeses = cfg.ingredients.cheeses.filter((s) => on.has(`cheese:${s.id}`));
  const tops = cfg.ingredients.toppings.filter((s) => on.has(`topping:${s.id}`) && !cfg.custom.excludeToppings.includes(s.id));
  if (sauces.length === 0 || cheeses.length === 0 || tops.length === 0) return null;
  const pickWeighted = <T>(list: T[], w: (x: T) => number): T => {
    const total = list.reduce((n, x) => n + w(x), 0);
    let r = rng() * total;
    for (const x of list) {
      r -= w(x);
      if (r <= 0) return x;
    }
    return list[list.length - 1];
  };
  const counts = (cfg.custom.countWeights[max - 1] ?? [1]).map((w, i) => ({ n: i + 1, w }));
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = pickWeighted(counts, (c) => c.w).n;
    const sauce = pickWeighted(sauces, (x) => (x.id === 'tomato' ? 2 : 1)).id;
    const cheese = pickWeighted(cheeses, (x) => (x.id === 'mozzarella' ? 3 : 1)).id;
    const pool = [...tops];
    const chosen: string[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
    const r: Recipe = { sauce, cheese, toppings: chosen };
    if (!isRealRecipe(cfg, r)) return r;
  }
  return null;
}
