import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { CUSTOMER_LOOK_MIN } from '../src/game/KitchenState';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';
import { comboBonus, isComboMeal } from '../src/game/pizza/pizzaCombo';
import { defaultPizzaConfig } from '../src/game/pizza/pizzaConfig';

const make = () => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0 }, defaultConfig, undefined, 3);
  k.menuStep = 10;
  k.nextArrival = 9999;
  k.nextEventIn = 9999;
  return k;
};
const cust = (k: PizzaKitchenState, items: string[]): PizzaCustomer => {
  const c: PizzaCustomer = { id: 100 + k.customers.length, seat: k.customers.length, look: CUSTOMER_LOOK_MIN, items, delivered: items.map(() => false), price: 80, patience: 60, patienceMax: 60, age: 5, type: 'regular', mood: 'waiting', leaveIn: 0 };
  k.customers.push(c);
  return c;
};
const bakedCheese = (k: PizzaKitchenState) => {
  const b = k.startPizza()!;
  k.addIngredient('sauce:tomato', b);
  k.addIngredient('cheese:mozzarella', b);
  k.finishPizza(b);
  k.sendToOven(b);
  k.update(10);
  k.tapOven(0);
  return b;
};
const combos = (k: PizzaKitchenState) => k.events.filter((e) => e.type === 'comboMeal');

describe('combo meal rule (pure)', () => {
  it('needs a pizza, a side and an ice cream together', () => {
    expect(isComboMeal(['pizza', 'side', 'dessert'])).toBe(true);
    expect(isComboMeal(['pizza', 'fried', 'dessert'])).toBe(true);
    expect(isComboMeal(['pizza', 'side'])).toBe(false);
    expect(isComboMeal(['pizza', 'dessert'])).toBe(false);
    expect(isComboMeal(['side', 'fried', 'dessert'])).toBe(false);
    expect(isComboMeal(['pizza', 'pizza', 'side'])).toBe(false);
    expect(isComboMeal([])).toBe(false);
  });
  it('bonus maths: about 25%, rounded, never negative', () => {
    expect(comboBonus(100, 40, 0.25, 0.25)).toEqual({ coins: 25, xp: 10 });
    expect(comboBonus(0, 0, 0.25, 0.25)).toEqual({ coins: 0, xp: 0 });
    expect(comboBonus(10, 10, 0.25, 0.25)).toEqual({ coins: 3, xp: 3 });
  });
  it('first-pass values are in the data file', () => {
    expect(defaultPizzaConfig.comboMeal).toEqual({ coinBonus: 0.25, xpBonus: 0.25 });
  });
});

describe('combo meal in the kitchen', () => {
  it('a complete pizza + side + ice cream order pays the bonus once, about +25% coins and XP', () => {
    const k = make();
    const c = cust(k, ['cheese_pizza', 'garlic_bread', 'ice_cream']);
    const b = bakedCheese(k);
    k.startSide('garlic_bread');
    k.startIce();
    k.update(8);
    expect(k.serveTray('small', 0, c.id)).toBe(true);
    expect(k.serveIce(0, c.id)).toBe(true);
    expect(combos(k)).toHaveLength(0); // one item still missing
    const coins0 = k.coins;
    const xp0 = k.xp;
    expect(k.serveBoard(b, c.id)).toBe(true);
    const ev = combos(k);
    expect(ev).toHaveLength(1);
    const done = k.events.find((e) => e.type === 'orderDone') as Extract<(typeof k.events)[number], { type: 'orderDone' }>;
    const bonus = ev[0] as Extract<(typeof k.events)[number], { type: 'comboMeal' }>;
    expect(k.coins - coins0).toBe(done.coins);
    expect(k.xp - xp0).toBe(done.xp);
    expect(bonus.coins).toBeGreaterThan(0);
    expect(bonus.coins / (done.coins - bonus.coins)).toBeCloseTo(0.25, 1);
    expect(bonus.xp / (done.xp - bonus.xp)).toBeCloseTo(0.25, 1);
  });
  it('an incomplete order (2 of 3 served) gets no bonus', () => {
    const k = make();
    const c = cust(k, ['cheese_pizza', 'garlic_bread', 'ice_cream']);
    k.startSide('garlic_bread');
    k.startIce();
    k.update(8);
    k.serveTray('small', 0, c.id);
    k.serveIce(0, c.id);
    expect(c.delivered).toEqual([false, true, true]);
    expect(combos(k)).toHaveLength(0);
    expect(k.events.some((e) => e.type === 'orderDone')).toBe(false);
  });
  it('a customer who leaves unhappy with a partly served combo order gets no bonus', () => {
    const k = make();
    const c = cust(k, ['cheese_pizza', 'garlic_bread', 'ice_cream']);
    k.startSide('garlic_bread');
    k.update(8);
    k.serveTray('small', 0, c.id);
    k.update(300);
    expect(combos(k)).toHaveLength(0);
  });
  it('serving again after the order is complete never pays a second bonus', () => {
    const k = make();
    const c = cust(k, ['cheese_pizza', 'garlic_bread', 'ice_cream']);
    const b = bakedCheese(k);
    k.startSide('garlic_bread');
    k.startIce();
    k.update(8);
    k.serveTray('small', 0, c.id);
    k.serveIce(0, c.id);
    k.serveBoard(b, c.id);
    const coins = k.coins;
    expect(k.serveBoard(b, c.id)).toBe(false);
    expect(k.serveTray('small', 0, c.id)).toBe(false);
    expect(k.serveIce(0, c.id)).toBe(false);
    expect(combos(k)).toHaveLength(1);
    expect(k.coins).toBe(coins);
  });
  it('orders that are not pizza + side + ice cream get no bonus', () => {
    const k = make();
    const c = cust(k, ['garlic_bread', 'fries', 'ice_cream']);
    k.startSide('garlic_bread');
    k.startFried('fries');
    k.startIce();
    k.update(8);
    k.serveTray('small', 0, c.id);
    k.serveTray('fryer', 0, c.id);
    k.serveIce(0, c.id);
    expect(c.mood).toBe('happy');
    expect(combos(k)).toHaveLength(0);
  });
  it('a fries side counts as the side', () => {
    const k = make();
    const c = cust(k, ['cheese_pizza', 'fries', 'ice_cream']);
    const b = bakedCheese(k);
    k.startFried('fries');
    k.startIce();
    k.update(8);
    k.serveTray('fryer', 0, c.id);
    k.serveIce(0, c.id);
    k.serveBoard(b, c.id);
    expect(combos(k)).toHaveLength(1);
  });
});
