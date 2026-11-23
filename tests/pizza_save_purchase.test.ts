import { describe, expect, it } from 'vitest';
import { checkPurchase, purchaseRestaurant, type RestaurantPrice } from '../src/game/restaurants';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

// Owner numbers: Lv 30 and 3,000 coins. (A2 moves these into data/pizza.json and a test there ties the two together.)
const pizza: RestaurantPrice = { id: 'pizza_place', unlockLevel: 30, cost: 3000 };
const owned = ['burger_diner'];

describe('buying the Pizza Place', () => {
  it('Lv 29 cannot buy, even with plenty of coins, and nothing changes', () => {
    const save = { level: 29, coins: 99999, restaurants: [...owned] };
    expect(purchaseRestaurant(pizza, save)).toEqual({ ok: false, reason: 'level' });
    expect(save).toEqual({ level: 29, coins: 99999, restaurants: owned });
  });
  it('Lv 30 with too few coins is refused', () => {
    const save = { level: 30, coins: 2999, restaurants: [...owned] };
    expect(purchaseRestaurant(pizza, save)).toEqual({ ok: false, reason: 'coins' });
    expect(save).toEqual({ level: 30, coins: 2999, restaurants: owned });
  });
  it('Lv 30 with exactly 3,000 coins succeeds once and spends exactly 3,000', () => {
    const save = { level: 30, coins: 3000, restaurants: [...owned] };
    expect(purchaseRestaurant(pizza, save)).toEqual({ ok: true });
    expect(save.coins).toBe(0);
    expect(save.restaurants).toEqual(['burger_diner', 'pizza_place']);
  });
  it('buying again is refused and charges nothing', () => {
    const save = { level: 40, coins: 5000, restaurants: ['burger_diner', 'pizza_place'] };
    expect(purchaseRestaurant(pizza, save)).toEqual({ ok: false, reason: 'owned' });
    expect(save.coins).toBe(5000);
  });
  it('starts at menu step 1 with no progress whatever the global Lv is', () => {
    const save = { level: 45, coins: 4000, restaurants: [...owned], pizzaStep: 7, pizzaXp: 99 };
    expect(purchaseRestaurant(pizza, save)).toEqual({ ok: true });
    expect(save.pizzaStep).toBe(1);
    expect(save.pizzaXp).toBe(0);
  });
  it('does not touch the Taco Truck fields', () => {
    const save = { level: 30, coins: 3000, restaurants: [...owned, 'taco_truck'], tacoStep: 6, tacoXp: 40 };
    purchaseRestaurant(pizza, save);
    expect(save.tacoStep).toBe(6);
    expect(save.tacoXp).toBe(40);
  });
  it('the Taco Truck purchase still resets only the taco fields (starter reset preserved)', () => {
    const save = { level: 10, coins: 1500, restaurants: [...owned], tacoStep: 5, tacoXp: 9, pizzaStep: 3, pizzaXp: 4 };
    purchaseRestaurant({ id: 'taco_truck', unlockLevel: 10, cost: 1500 }, save);
    expect(save).toMatchObject({ coins: 0, tacoStep: 1, tacoXp: 0, pizzaStep: 3, pizzaXp: 4 });
  });
  it('checkPurchase never changes anything', () => {
    const list = [...owned];
    expect(checkPurchase(pizza, 30, 3000, list)).toEqual({ ok: true });
    expect(list).toEqual(owned);
  });
});

describe('save: Pizza Place fields', () => {
  it('a new save starts at step 1 with empty maps', () => {
    expect(defaultSave()).toMatchObject({ pizzaStep: 1, pizzaXp: 0, pizzaOwned: {}, pizzaServed: {}, pizzaLessons: {}, pizzaMastery: {}, pizzaGoal: {}, pizzaStats: {} });
  });
  it('an old save loads exactly as before and gets safe Pizza defaults', () => {
    const old = { version: 2, level: 33, xp: 12, coins: 800, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 6, tacoXp: 10, tacoServed: { veggies_soft_taco: 5 } };
    const s = parseSave(JSON.stringify(old));
    expect(s.level).toBe(33);
    expect(s.coins).toBe(800);
    expect(s.restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(s.tacoStep).toBe(6);
    expect(s.tacoServed).toEqual({ veggies_soft_taco: 5 });
    expect(s.pizzaStep).toBe(1);
    expect(s.pizzaXp).toBe(0);
    expect(s.pizzaOwned).toEqual({});
    expect(s.pizzaServed).toEqual({});
  });
  it('survives a save and reload', () => {
    const a = {
      ...defaultSave(),
      level: 31,
      coins: 7,
      restaurants: ['burger_diner', 'pizza_place'],
      pizzaStep: 4,
      pizzaXp: 55,
      pizzaOwned: { brick_oven: 2 },
      pizzaServed: { cheese_pizza: 6 },
      pizzaLessons: { cheese_pizza: 9 },
      pizzaMastery: { cheese_pizza: 1 },
      pizzaGoal: { bake3: 2 },
      pizzaStats: { baked: 12 },
    };
    expect(parseSave(JSON.stringify(a))).toEqual(a);
  });
  it('tolerates junk: out-of-range step, wrong types, bad maps', () => {
    const s = parseSave(JSON.stringify({ pizzaStep: 99, pizzaXp: -5, pizzaOwned: 'x', pizzaServed: { a: 'b', c: 3.7 }, pizzaLessons: [1], pizzaGoal: null }));
    expect(s.pizzaStep).toBe(10);
    expect(s.pizzaXp).toBe(0);
    expect(s.pizzaOwned).toEqual({});
    expect(s.pizzaServed).toEqual({ c: 3 });
    expect(s.pizzaLessons).toEqual({});
    expect(s.pizzaGoal).toEqual({});
    expect(parseSave(JSON.stringify({ pizzaStep: 0 })).pizzaStep).toBe(1);
  });
  it('pizzaOwned is separate from the diner and truck upgrade maps', () => {
    const s = parseSave(JSON.stringify({ owned: { a: 1 }, tacoOwned: { b: 2 }, pizzaOwned: { c: 3 } }));
    expect(s.owned).toEqual({ a: 1 });
    expect(s.tacoOwned).toEqual({ b: 2 });
    expect(s.pizzaOwned).toEqual({ c: 3 });
  });
});
