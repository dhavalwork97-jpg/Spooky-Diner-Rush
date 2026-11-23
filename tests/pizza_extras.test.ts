import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { defaultExtras } from '../src/game/extras';
import { CUSTOMER_LOOK_MIN } from '../src/game/KitchenState';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig as P } from '../src/game/pizza/pizzaConfig';
import { pizzaMasteryDue, pizzaMasteryGrid, pizzaMasteryTiers, pizzaPaidAfter, pizzaSpecialFor, pizzaTierFor } from '../src/game/pizza/pizzaExtras';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

const pizzas = P.dishes.filter((d) => d.kind === 'pizza');

describe('pizza mastery (pure)', () => {
  it('uses the shared bronze / silver / gold tiers from data/extras.json', () => {
    expect(pizzaMasteryTiers()).toBe(defaultExtras.mastery.tiers);
    expect(pizzaMasteryTiers().map((t) => [t.name, t.serves, t.coins])).toEqual([['Bronze', 10, 40], ['Silver', 40, 120], ['Gold', 100, 300]]);
  });
  it('tier boundaries are exact', () => {
    const at = (n: number) => pizzaTierFor(n);
    expect([0, 9, 10, 39, 40, 99, 100, 500].map(at)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('the grid holds exactly the ten pizzas, five to a row, in menu order; sides and ice cream have no badge', () => {
    const grid = pizzaMasteryGrid(P.dishes, { cheese_pizza: 12, garlic_bread: 500, ice_cream: 500 }, 3);
    expect(grid).toHaveLength(2);
    expect(grid.every((r) => r.length === 5)).toBe(true);
    expect(grid.flat().map((c) => c.dish)).toEqual(pizzas.map((d) => d.id));
    expect(grid[0][0]).toMatchObject({ dish: 'cheese_pizza', count: 12, tier: 1, onMenu: true, next: { name: 'Silver', remaining: 28 } });
    expect(grid[1][4]).toMatchObject({ dish: 'white_pizza', count: 0, tier: 0, onMenu: false });
  });
  it('a gold pizza has nothing next', () => {
    expect(pizzaMasteryGrid(P.dishes, { cheese_pizza: 100 }, 10)[0][0].next).toBeNull();
  });
  it('pays each tier once, lowest first, and never again', () => {
    const served = { cheese_pizza: 45, pepperoni_pizza: 10 };
    const first = pizzaMasteryDue(P.dishes, served, {});
    expect(first.map((a) => [a.dish, a.tier, a.coins])).toEqual([['cheese_pizza', 1, 40], ['pepperoni_pizza', 1, 40], ['cheese_pizza', 2, 120]]);
    const paid = pizzaPaidAfter({}, first);
    expect(paid).toEqual({ cheese_pizza: 2, pepperoni_pizza: 1 });
    expect(pizzaMasteryDue(P.dishes, served, paid)).toEqual([]);
    expect(pizzaMasteryDue(P.dishes, { cheese_pizza: 100 }, paid).map((a) => a.tier)).toEqual([3]);
  });
  it('paid never goes down; sides, ice cream and custom pizzas never earn badges', () => {
    expect(pizzaPaidAfter({ cheese_pizza: 3 }, [{ dish: 'cheese_pizza', tier: 1, name: 'Bronze', coins: 40 }])).toEqual({ cheese_pizza: 3 });
    expect(pizzaMasteryDue(P.dishes, { garlic_bread: 999, ice_cream: 999, 'custom:tomato:mozzarella:basil': 999 }, {})).toEqual([]);
  });
});

describe('pizza mastery saves', () => {
  it('is saved in its own field and survives a round trip', () => {
    const s = parseSave(JSON.stringify({ ...defaultSave(), pizzaMastery: { cheese_pizza: 2 }, pizzaSpecialDay: '2026-11-22' }));
    expect(s.pizzaMastery).toEqual({ cheese_pizza: 2 });
    expect(s.pizzaSpecialDay).toBe('2026-11-22');
  });
  it('old saves load: the new field defaults, and the Diner and Taco mastery fields are untouched', () => {
    const s = parseSave(JSON.stringify({ mastery: { burger: 12 }, specialDay: '2026-11-01', tacoMastery: { a: 1 } }));
    expect(s.pizzaSpecialDay).toBe('');
    expect(s.pizzaMastery).toEqual({});
    expect(s.mastery).toEqual({ burger: 12 });
    expect(s.specialDay).toBe('2026-11-01');
    expect(s.tacoMastery).toEqual({ a: 1 });
  });
  it('a bad special day is dropped', () => {
    expect(parseSave(JSON.stringify({ pizzaSpecialDay: 'tomorrow' })).pizzaSpecialDay).toBe('');
  });
});

describe('pizza of the day (pure)', () => {
  const pool = pizzas.map((d) => d.id);
  it('is the same all day, whatever order the pool is in', () => {
    expect(pizzaSpecialFor('2026-11-22', pool)).toBe(pizzaSpecialFor('2026-11-22', [...pool].reverse()));
    expect(pool).toContain(pizzaSpecialFor('2026-11-22', pool)!);
  });
  it('changes from day to day (every pizza shows up over a few months)', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 90; d++) seen.add(pizzaSpecialFor(`2026-${d <= 31 ? '10' : d <= 61 ? '11' : '12'}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`, pool)!);
    expect(seen.size).toBe(pool.length);
  });
  it('no pizzas, no special', () => {
    expect(pizzaSpecialFor('2026-11-22', [])).toBeNull();
  });
});

const make = (step: number, enable = true) => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0 }, defaultConfig, undefined, 5);
  k.menuStep = step;
  for (const d of P.dishes) k.dishServes[d.id] = 9;
  if (enable) k.enableSpecial('2026-11-22', false);
  k.nextArrival = 9999;
  k.nextEventIn = 9999;
  return k;
};
const order = (k: PizzaKitchenState, items: string[]): PizzaCustomer => {
  const c: PizzaCustomer = { id: 500 + k.customers.length + k.served, seat: k.customers.length, look: CUSTOMER_LOOK_MIN, items, delivered: items.map(() => false), price: 50, patience: 60, patienceMax: 60, age: 5, type: 'regular', mood: 'waiting', leaveIn: 0 };
  k.customers.push(c);
  return c;
};
/** Serve a plain order of ice cream (needs no cooking) so an order completes. */
const serveIceOrder = (k: PizzaKitchenState) => {
  const c = order(k, ['ice_cream']);
  k.startIce();
  k.update(8);
  expect(k.serveIce(0, c.id)).toBe(true);
};
const arrive = (k: PizzaKitchenState) => {
  k.customers.length = 0;
  k.nextArrival = 0;
  k.update(0.1);
  k.nextArrival = 9999;
  return k.customers[k.customers.length - 1];
};

describe('pizza Daily Special in the kitchen', () => {
  it('is off unless enabled, and before its menu step', () => {
    expect(make(5, false).special).toBeNull();
    expect(make(1).special).toBeNull();
    const k = make(2);
    expect(k.special).not.toBeNull();
    expect(k.dishDef(k.special!.dish)!.kind).toBe('pizza');
  });
  it('only picks a pizza on the menu that has been learned', () => {
    const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0, pizzaServed: {} }, defaultConfig, undefined, 5);
    k.menuStep = 4;
    k.enableSpecial('2026-11-22', false);
    expect(k.special).toBeNull(); // nothing served yet, so nothing is learned
  });
  it('after 3 served orders the next customer asks for the pizza of the day', () => {
    const k = make(6);
    for (let i = 0; i < 2; i++) serveIceOrder(k);
    expect(arrive(k).special).toBeUndefined();
    serveIceOrder(k);
    const c = arrive(k);
    expect(c.special).toBe(true);
    expect(c.items).toEqual([k.special!.dish]);
  });
  it('pays +50% coins once, then the special is done for the day', () => {
    const k = make(6, true);
    const dish = k.special!.dish;
    for (let i = 0; i < 3; i++) serveIceOrder(k);
    const c = arrive(k);
    const b = k.startPizza()!;
    const r = P.dishes.find((d) => d.id === dish)!.recipe!;
    for (const st of [`sauce:${r.sauce}`, `cheese:${r.cheese}`, ...r.toppings.map((t) => `topping:${t}`)]) k.addIngredient(st, b);
    expect(k.finishPizza(b)).toBe(true);
    k.sendToOven(b);
    k.update(10);
    k.tapOven(0);
    const coins0 = k.coins;
    k.events.length = 0;
    expect(k.serveBoard(b, c.id)).toBe(true);
    const done = k.events.find((e) => e.type === 'orderDone') as Extract<(typeof k.events)[number], { type: 'orderDone' }>;
    const sp = k.events.find((e) => e.type === 'specialDone') as Extract<(typeof k.events)[number], { type: 'specialDone' }>;
    expect(sp.bonus).toBe(Math.round(done.coins * defaultExtras.dailySpecial.bonus));
    expect(k.coins - coins0).toBe(done.coins + sp.bonus);
    expect(k.special!.done).toBe(true);
    // never again today
    k.events.length = 0;
    for (let i = 0; i < 6; i++) serveIceOrder(k);
    expect(arrive(k).special).toBeUndefined();
    expect(k.events.filter((e) => e.type === 'specialDone')).toHaveLength(0);
  });
  it('already done today: it never appears', () => {
    const k = make(6, false);
    k.enableSpecial('2026-11-22', true);
    for (let i = 0; i < 6; i++) serveIceOrder(k);
    expect(arrive(k).special).toBeUndefined();
  });
  it('a missed special comes back with the next customer', () => {
    const k = make(6);
    for (let i = 0; i < 3; i++) serveIceOrder(k);
    const c = arrive(k);
    expect(c.special).toBe(true);
    c.patience = 0.01;
    k.update(1);
    expect(c.mood).toBe('angry');
    expect(arrive(k).special).toBe(true);
  });
});
