import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { cookPhase } from '../src/game/cook';
import { CUSTOMER_LOOK_MIN } from '../src/game/KitchenState';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig as P } from '../src/game/pizza/pizzaConfig';
import { isPerfectBake, perfectTip } from '../src/game/pizza/pizzaPerfect';

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
/** Builds a cheese pizza, puts it in the oven, then sets its clock exactly (no time passes, so patience stays equal between runs). */
const bake = (k: PizzaKitchenState, t: number) => {
  const b = k.startPizza()!;
  k.addIngredient('sauce:tomato', b);
  k.addIngredient('cheese:mozzarella', b);
  k.finishPizza(b);
  k.sendToOven(b);
  const o = k.ovens[0]!;
  o.t = t;
  o.phase = cookPhase(t, P.timed.pizza.readyAfter, P.timed.pizza.burnWindow);
  return b;
};
const R = P.timed.pizza.readyAfter; // 9
const W = P.timed.pizza.burnWindow; // 6
const perfects = (k: PizzaKitchenState) => k.events.filter((e) => e.type === 'perfectBake');

describe('perfect bake boundaries (pure)', () => {
  it('first half of READY: starts at ready, ends before the half-way mark of the READY phase', () => {
    expect(isPerfectBake(R - 0.001, R, W)).toBe(false); // still cooking
    expect(isPerfectBake(R, R, W)).toBe(true); // the moment it is ready
    expect(isPerfectBake(R + 1.49, R, W)).toBe(true);
    expect(isPerfectBake(R + 1.5, R, W)).toBe(false); // exactly a quarter of the burn window: no longer perfect
    expect(isPerfectBake(R + 2.99, R, W)).toBe(false); // second half of READY
    expect(isPerfectBake(R + 3, R, W)).toBe(false); // warning
    expect(isPerfectBake(R + W, R, W)).toBe(false); // burnt
  });
  it('the perfect window sits inside the READY phase for every timed dish', () => {
    for (const d of [P.timed.pizza, P.timed.side, P.timed.fries, P.timed.wings]) {
      const end = d.readyAfter + d.burnWindow * 0.25;
      expect(cookPhase(end - 0.01, d.readyAfter, d.burnWindow)).toBe('ready');
      expect(isPerfectBake(end - 0.01, d.readyAfter, d.burnWindow)).toBe(true);
      expect(isPerfectBake(end, d.readyAfter, d.burnWindow)).toBe(false);
    }
  });
  it('tip is a small share of the price, at least 1 coin', () => {
    expect(perfectTip(60, 0.1)).toBe(6);
    expect(perfectTip(4, 0.1)).toBe(1);
    expect(perfectTip(60, 0.1, 1.5)).toBe(9);
  });
  it('cooking times in the data are unchanged by the feature', () => {
    expect(P.timed.pizza).toEqual({ readyAfter: 9, burnWindow: 6 });
    expect(P.timed.side).toEqual({ readyAfter: 6, burnWindow: 5 });
    expect(P.timed.fries).toEqual({ readyAfter: 5, burnWindow: 5 });
    expect(P.timed.wings).toEqual({ readyAfter: 8, burnWindow: 5 });
    expect(P.perfectBake).toEqual({ share: 0.5, tipFraction: 0.1 });
  });
});

describe('perfect bake in the kitchen', () => {
  const serveAt = (t: number) => {
    const k = make();
    const c = cust(k, ['cheese_pizza']);
    const b = bake(k, t);
    k.tapOven(0);
    const before = k.coins;
    k.serveBoard(b, c.id);
    return { k, gained: k.coins - before };
  };
  it('a perfect pizza earns the extra tip and a perfectBake event; a late one does not', () => {
    const perfect = serveAt(R + 0.5);
    const late = serveAt(R + 2);
    const price = perfect.k.dishDef('cheese_pizza')!.price;
    expect(perfects(perfect.k)).toHaveLength(1);
    expect(perfects(late.k)).toHaveLength(0);
    expect(perfect.gained - late.gained).toBe(perfectTip(price, P.perfectBake.tipFraction));
  });
  it('exact boundary: just inside is perfect, exactly on the mark is not', () => {
    expect(perfects(serveAt(R + 1.49).k)).toHaveLength(1);
    expect(perfects(serveAt(R + 1.5).k)).toHaveLength(0);
  });
  it('collecting late has no extra penalty: it is served for the normal pay and follows the overcook rules', () => {
    const late = serveAt(R + 3.5); // warning phase
    expect(late.gained).toBeGreaterThan(0);
    expect(late.k.events.some((e) => e.type === 'discard')).toBe(false);
    // burnt still has to be thrown away, with the existing penalty, and is never perfect
    const k = make();
    cust(k, ['cheese_pizza']);
    bake(k, R + W + 1);
    k.coins = 50;
    k.tapOven(0);
    expect(k.coins).toBe(Math.max(0, 50 - defaultConfig.recipes.settings.trashPenaltyCoins));
    expect(k.events.some((e) => e.type === 'discard')).toBe(true);
    expect(perfects(k)).toHaveLength(0);
  });
  it('taking it out while still cooking changes nothing', () => {
    const k = make();
    bake(k, R - 1);
    expect(k.tapOven(0)).toBe(false);
    expect(perfects(k)).toHaveLength(0);
    expect(k.ovens[0]!.t).toBe(R - 1);
  });
  it('a side from the small oven or fries from the fryer count too; ice cream never does', () => {
    const k = make();
    const c = cust(k, ['garlic_bread', 'fries', 'ice_cream']);
    k.startSide('garlic_bread');
    k.startFried('fries');
    k.startIce();
    k.smallOven[0]!.t = P.timed.side.readyAfter + 0.5;
    k.smallOven[0]!.phase = 'ready';
    k.fryer[0]!.t = P.timed.fries.readyAfter + 2; // second half of ready: not perfect
    k.fryer[0]!.phase = 'ready';
    k.ice[0]!.t = 99;
    k.ice[0]!.phase = 'ready';
    expect(k.serveTray('small', 0, c.id)).toBe(true);
    expect(k.serveTray('fryer', 0, c.id)).toBe(true);
    expect(k.serveIce(0, c.id)).toBe(true);
    expect(perfects(k)).toHaveLength(1);
    expect(perfects(k)[0]).toMatchObject({ where: 'small' });
    expect(c.perfectTips).toBe(perfectTip(k.dishDef('garlic_bread')!.price, P.perfectBake.tipFraction));
  });
  it('the cooking timers are untouched: a pizza still turns ready, warning and burnt at the same seconds', () => {
    const k = make();
    cust(k, ['cheese_pizza']);
    const b = k.startPizza()!;
    k.addIngredient('sauce:tomato', b);
    k.addIngredient('cheese:mozzarella', b);
    k.finishPizza(b);
    k.sendToOven(b);
    const seen: Record<string, number> = {};
    for (let i = 1; i <= 160; i++) {
      k.update(0.1);
      const ph = k.ovens[0]?.phase;
      if (ph && !(ph in seen)) seen[ph] = i / 10;
    }
    expect(seen.ready).toBeGreaterThanOrEqual(R - 0.2);
    expect(seen.ready).toBeLessThanOrEqual(R + 0.2);
    expect(seen.warning).toBeCloseTo(R + W * 0.5, 0);
    expect(seen.burnt).toBeCloseTo(R + W, 0);
  });
});
