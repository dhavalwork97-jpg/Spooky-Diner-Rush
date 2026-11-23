import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig as P, unlockedIngredients } from '../src/game/pizza/pizzaConfig';
import { customChance, customDish, customId, customMaxToppings, isCustomId, isRealRecipe, parseCustom, rollCustom } from '../src/game/pizza/pizzaCustom';
import { makeRng } from '../src/game/rng';

const rngOf = (seed: number) => makeRng(seed);
const make = (step: number, seed: number) => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0 }, defaultConfig, undefined, seed);
  k.menuStep = step;
  for (const d of P.dishes) k.dishServes[d.id] = 9; // everything practised: no lessons or intro orders in the way
  return k;
};
/** Plays a kitchen until a customer asks for a custom pizza. */
const withCustom = (step: number, want: (toppings: number) => boolean = () => true) => {
  for (let seed = 1; seed < 400; seed++) {
    const k = make(step, seed);
    k.nextArrival = 0;
    for (let i = 0; i < 400; i++) {
      k.update(0.25);
      for (const c of k.customers) {
        const at = c.items.findIndex((x) => isCustomId(x));
        if (at >= 0 && want(parseCustom(c.items[at])!.toppings.length)) {
          k.nextArrival = 9999;
          return { k, c, at, id: c.items[at], r: parseCustom(c.items[at])! };
        }
      }
      if (k.closed) k.reopen();
    }
  }
  throw new Error(`no custom order at step ${step}`);
};
const steps = (r: { sauce: string; cheese: string; toppings: string[] }) => [`sauce:${r.sauce}`, `cheese:${r.cheese}`, ...r.toppings.map((t) => `topping:${t}`)];
const only = (k: PizzaKitchenState, c: PizzaCustomer) => {
  // Leave just this customer and make the order only the custom pizza, so serving is exact.
  k.customers.splice(0, k.customers.length, c);
  c.items = [c.items.find((x) => isCustomId(x))!];
  c.delivered = [false];
};

describe('custom orders (pure)', () => {
  it('ids are stable: topping order never matters, and they parse back', () => {
    const a = customId({ sauce: 'tomato', cheese: 'mozzarella', toppings: ['olive', 'basil'] });
    const b = customId({ sauce: 'tomato', cheese: 'mozzarella', toppings: ['basil', 'olive'] });
    expect(a).toBe(b);
    expect(parseCustom(a)).toEqual({ sauce: 'tomato', cheese: 'mozzarella', toppings: ['basil', 'olive'] });
    expect(parseCustom('cheese_pizza')).toBeNull();
    expect(isCustomId(a)).toBe(true);
  });
  it('a recipe equal to a real pizza is not a custom order', () => {
    expect(isRealRecipe(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['mushroom'] })).toBe(true);
    expect(isRealRecipe(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['pepperoni'] })).toBe(true);
    expect(isRealRecipe(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['basil'] })).toBe(false);
    expect(isRealRecipe(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['mushroom', 'pepperoni', 'bell_pepper'] })).toBe(true); // supreme, any order
  });
  it('no custom orders, and no random numbers used, before the custom step', () => {
    let calls = 0;
    for (let step = 1; step < P.custom.fromStep; step++) {
      expect(customMaxToppings(P, step)).toBe(0);
      expect(rollCustom(P, step, () => (calls++, 0))).toBeNull();
    }
    expect(calls).toBe(0);
  });
  it('starts with one topping and grows: 1 at steps 5-6, up to 2 at 7-8, up to 3 at 9-10', () => {
    expect([5, 6, 7, 8, 9, 10].map((s) => customMaxToppings(P, s))).toEqual([1, 1, 2, 2, 3, 3]);
    const seen: Record<number, Set<number>> = {};
    for (let step = 5; step <= 10; step++) {
      seen[step] = new Set();
      const rng = rngOf(step);
      for (let i = 0; i < 4000; i++) {
        const r = rollCustom(P, step, rng);
        if (r) seen[step].add(r.toppings.length);
      }
    }
    expect([...seen[5]]).toEqual([1]);
    expect([...seen[6]]).toEqual([1]);
    expect(Math.max(...seen[7])).toBe(2);
    expect(Math.max(...seen[8])).toBe(2);
    expect(Math.max(...seen[9])).toBe(3);
    expect(Math.max(...seen[10])).toBe(3);
    expect(customChance(P, 5)).toBeLessThan(customChance(P, 10));
  });
  it('only uses ingredients on the menu at that step, never fresh mozzarella, never a real recipe, one sauce and one cheese', () => {
    for (let step = 5; step <= 10; step++) {
      const on = new Set(unlockedIngredients(P, step));
      const rng = rngOf(100 + step);
      for (let i = 0; i < 3000; i++) {
        const r = rollCustom(P, step, rng);
        if (!r) continue;
        expect(on.has(`sauce:${r.sauce}`) && on.has(`cheese:${r.cheese}`)).toBe(true);
        expect(r.toppings.every((t) => on.has(`topping:${t}`) && t !== 'fresh_mozzarella')).toBe(true);
        expect(new Set(r.toppings).size).toBe(r.toppings.length);
        expect(r.toppings.length).toBeGreaterThanOrEqual(1);
        expect(r.toppings.length).toBeLessThanOrEqual(3);
        expect(isRealRecipe(P, r)).toBe(false);
      }
    }
  });
  it('reward maths: price and XP grow with every topping and for a special sauce or cheese', () => {
    const base = customDish(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['basil'] });
    expect(base.price).toBe(P.custom.basePrice + P.custom.toppingPrice);
    expect(base.xp).toBe(P.custom.xpBase + P.custom.xpPerTopping);
    const two = customDish(P, { sauce: 'tomato', cheese: 'mozzarella', toppings: ['basil', 'olive'] });
    expect(two.price - base.price).toBe(P.custom.toppingPrice);
    expect(two.xp - base.xp).toBe(P.custom.xpPerTopping);
    const bbq = customDish(P, { sauce: 'bbq', cheese: 'mozzarella', toppings: ['basil'] });
    expect(bbq.price - base.price).toBe(P.custom.sauceExtra);
    const white = customDish(P, { sauce: 'tomato', cheese: 'white', toppings: ['basil'] });
    expect(white.price - base.price).toBe(P.custom.cheeseExtra);
    expect(base.kind).toBe('pizza');
  });
});

describe('custom orders in the kitchen', () => {
  it('none appear before the custom step', () => {
    for (let step = 1; step <= 4; step++) {
      const k = make(step, step);
      k.nextArrival = 0;
      for (let i = 0; i < 3000; i++) {
        k.update(0.25);
        expect(k.customers.every((c) => c.items.every((x) => !isCustomId(x)))).toBe(true);
        if (k.closed) k.reopen();
      }
    }
  });
  it('exact ingredients make the pizza, it bakes, serves and pays at least its price', () => {
    const { k, c, r } = withCustom(5);
    only(k, c);
    const b = k.startPizza()!;
    for (const s of steps(r)) expect(k.addIngredient(s, b)).toBe(true);
    expect(k.finishPizza(b)).toBe(true);
    expect(k.sendToOven(b)).toBe(true);
    k.update(10);
    expect(k.tapOven(0)).toBe(true);
    const coins0 = k.coins;
    const xp0 = k.xp;
    expect(k.serveBoard(b, c.id)).toBe(true);
    const done = k.events.find((e) => e.type === 'orderDone') as Extract<(typeof k.events)[number], { type: 'orderDone' }>;
    expect(done).toBeTruthy();
    const dish = customDish(P, r);
    expect(k.coins - coins0).toBe(done.coins);
    expect(done.coins).toBeGreaterThanOrEqual(c.price);
    expect(k.xp - xp0).toBeGreaterThanOrEqual(dish.xp);
  });
  it('missing ingredients: an unfinished pizza cannot be finished', () => {
    const { k, c, r } = withCustom(5);
    only(k, c);
    const b = k.startPizza()!;
    k.addIngredient(`sauce:${r.sauce}`, b);
    k.addIngredient(`cheese:${r.cheese}`, b);
    // sauce and cheese only is a plain cheese pizza, never the custom one
    expect(k.finishPizza(b)).toBe(true);
    expect(k.boards[b]!.item!.dish).toBe('cheese_pizza');
    k.sendToOven(b);
    k.update(10);
    k.tapOven(0);
    expect(k.serveBoard(b, c.id)).toBe(false); // not what this customer ordered
    expect(c.delivered).toEqual([false]);
  });
  it('incorrect ingredients are refused, and the right ones still finish the pizza', () => {
    // At step 5 a one-topping custom order is basil, bell pepper, olive or red onion on tomato and mozzarella: pepperoni and mushroom never fit.
    const { k, c, r } = withCustom(5);
    only(k, c);
    const b = k.startPizza()!;
    k.addIngredient(`sauce:${r.sauce}`, b);
    k.addIngredient(`cheese:${r.cheese}`, b);
    k.addIngredient(`topping:${r.toppings[0]}`, b);
    expect(k.addIngredient('topping:pepperoni', b)).toBe(false);
    expect(k.addIngredient('topping:mushroom', b)).toBe(false);
    expect(k.addIngredient('sauce:bbq', b)).toBe(false); // not on the menu yet, and a second sauce is never allowed
    expect(k.boards[b]!.item!.placed).toEqual(['dough', ...steps(r)]);
    expect(k.finishPizza(b)).toBe(true);
    expect(k.boards[b]!.item!.dish).toBe(customId(r));
  });
  it('a different real pizza is not accepted for a custom order', () => {
    const { k, c } = withCustom(5);
    only(k, c);
    const b = k.startPizza()!;
    for (const s of ['sauce:tomato', 'cheese:mozzarella', 'topping:mushroom']) k.addIngredient(s, b);
    expect(k.finishPizza(b)).toBe(true);
    expect(k.boards[b]!.item!.dish).toBe('mushroom_pizza');
    k.sendToOven(b);
    k.update(10);
    k.tapOven(0);
    expect(k.serveBoard(b, c.id)).toBe(false);
  });
  it('custom pizzas are not recipes: not on the menu, not saved, no lesson', () => {
    const { k, c, r } = withCustom(6);
    only(k, c);
    expect(k.dishes.some((d) => isCustomId(d.id))).toBe(false);
    const b = k.startPizza()!;
    steps(r).forEach((s) => k.addIngredient(s, b));
    k.finishPizza(b);
    k.sendToOven(b);
    k.update(10);
    k.tapOven(0);
    k.serveBoard(b, c.id);
    expect(Object.keys(k.dishServes).some(isCustomId)).toBe(false);
    expect(k.events.some((e) => e.type === 'recipeServed' && isCustomId((e as { dish: string }).dish))).toBe(false);
    expect(k.familiarity(c.items[0])).toBe('normal');
  });
  it('the custom recipe is only accepted while someone still needs it', () => {
    const { k, c, r } = withCustom(5);
    only(k, c);
    k.customers.length = 0; // the customer left
    const b = k.startPizza()!;
    steps(r).forEach((s) => k.addIngredient(s, b));
    expect(k.finishPizza(b)).toBe(false);
  });
  it('multi-topping orders work in any topping order (step 10)', () => {
    const { k, c, r } = withCustom(10, (n) => n >= 2);
    only(k, c);
    const b = k.startPizza()!;
    k.addIngredient(`sauce:${r.sauce}`, b);
    k.addIngredient(`cheese:${r.cheese}`, b);
    for (const t of [...r.toppings].reverse()) expect(k.addIngredient(`topping:${t}`, b)).toBe(true);
    expect(k.finishPizza(b)).toBe(true);
    expect(k.boards[b]!.item!.dish).toBe(customId(r));
  });
});
