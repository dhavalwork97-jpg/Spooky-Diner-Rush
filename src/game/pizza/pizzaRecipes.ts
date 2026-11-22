import { unlockedDishes, type DishDef, type PizzaConfig } from './pizzaConfig';

// Pizza building rules, pure. A pizza is built on a board in this order: dough, one sauce, one cheese, then toppings in any order.
// It is finished by tapping it: if the layers match exactly one unlocked recipe it can go to the oven (so a cheese pizza and a margherita can share a start).

export interface Layers {
  /** `sauce:tomato`, `cheese:mozzarella`, `topping:basil` ... in the order placed (dough is implied). */
  placed: string[];
}

const split = (id: string): [string, string] => {
  const i = id.indexOf(':');
  return [id.slice(0, i), id.slice(i + 1)];
};

export const sauceOf = (placed: readonly string[]): string | undefined => placed.find((s) => s.startsWith('sauce:'))?.slice(6);
export const cheeseOf = (placed: readonly string[]): string | undefined => placed.find((s) => s.startsWith('cheese:'))?.slice(7);
export const toppingsOf = (placed: readonly string[]): string[] => placed.filter((s) => s.startsWith('topping:')).map((s) => s.slice(8));

/** Unlocked pizzas whose recipe still fits what is placed (same sauce and cheese, toppings so far all part of the recipe). */
export function candidatePizzas(cfg: PizzaConfig, step: number, placed: readonly string[]): DishDef[] {
  const sauce = sauceOf(placed);
  const cheese = cheeseOf(placed);
  const tops = toppingsOf(placed);
  return unlockedDishes(cfg, step).filter((d) => {
    const r = d.recipe;
    if (!r) return false;
    if (sauce !== undefined && r.sauce !== sauce) return false;
    if (cheese !== undefined && r.cheese !== cheese) return false;
    return tops.every((t) => r.toppings.includes(t)) && new Set(tops).size === tops.length;
  });
}

/** The pizza these layers make exactly (sauce, cheese and every topping), if any. */
export function finishedPizza(cfg: PizzaConfig, step: number, placed: readonly string[]): DishDef | undefined {
  const sauce = sauceOf(placed);
  const cheese = cheeseOf(placed);
  if (sauce === undefined || cheese === undefined) return undefined;
  const tops = toppingsOf(placed);
  return candidatePizzas(cfg, step, placed).find((d) => d.recipe!.toppings.length === tops.length);
}

/** Step ids that could come next after `placed`, in menu order. Sauce first, then cheese, then toppings. */
export function nextIngredients(cfg: PizzaConfig, step: number, placed: readonly string[]): string[] {
  const c = candidatePizzas(cfg, step, placed);
  const out: string[] = [];
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  if (sauceOf(placed) === undefined) c.forEach((d) => add(`sauce:${d.recipe!.sauce}`));
  else if (cheeseOf(placed) === undefined) c.forEach((d) => add(`cheese:${d.recipe!.cheese}`));
  else {
    const have = toppingsOf(placed);
    c.forEach((d) => d.recipe!.toppings.filter((t) => !have.includes(t)).forEach((t) => add(`topping:${t}`)));
  }
  return out;
}

/** Ingredient ids of a recipe in build order (for the recipe book and tutorials). */
export function recipeSteps(d: DishDef): string[] {
  if (!d.recipe) return [];
  return ['dough', `sauce:${d.recipe.sauce}`, `cheese:${d.recipe.cheese}`, ...d.recipe.toppings.map((t) => `topping:${t}`)];
}

export const stepKindOf = (id: string): 'dough' | 'sauce' | 'cheese' | 'topping' => (id === 'dough' ? 'dough' : (split(id)[0] as 'sauce' | 'cheese' | 'topping'));
