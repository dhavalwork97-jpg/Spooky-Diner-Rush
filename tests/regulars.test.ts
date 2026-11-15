import { describe, expect, it } from 'vitest';
import { KitchenState, CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, type Customer } from '../src/game/KitchenState';
import { defaultConfig } from '../src/game/config';
import { defaultRegulars, defaultRegularSettings, eligibleRegulars, regularTip, validateRegulars } from '../src/game/regulars';

const unlock = Object.fromEntries(Object.entries(defaultConfig.recipes.items).map(([k, v]) => [k, v.unlockLevel]));
const make = (level: number, seed = 1) => new KitchenState({ level, xp: 0, coins: 0 }, undefined, seed);

describe('named regulars (data)', () => {
  it('six regulars with the agreed names, from Lv 8, about 10 percent of arrivals, +30 percent tip', () => {
    expect(defaultRegulars.map((r) => r.name)).toEqual(['Mr. Wispy', 'Miss Mist', 'Old Sheet', 'Little Boo', 'Captain Fog', 'Dame Dusk']);
    expect(defaultRegulars.every((r) => r.fromLevel === 8)).toBe(true);
    expect(defaultRegularSettings).toEqual({ chance: 0.1, tipBonus: 0.3 });
  });
  it('pass validation, and every look is an existing ghost look', () => {
    expect(validateRegulars(defaultRegulars, defaultRegularSettings, CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, unlock)).toEqual([]);
    expect(defaultRegulars.every((r) => r.look >= CUSTOMER_LOOK_MIN && r.look < CUSTOMER_LOOK_COUNT)).toBe(true);
  });
  it('validation catches bad data', () => {
    const bad = [
      { id: 'a', name: 'A very long name indeed', look: 3, favorite: 'fries' as const, fromLevel: 8 },
      { id: 'a', name: 'A very long name indeed', look: 99, favorite: 'soup' as never, fromLevel: 1 },
    ];
    const errs = validateRegulars(bad, { chance: 0.9, tipBonus: 2 }, CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, unlock);
    for (const part of ['chance', 'tipBonus', 'duplicate id', 'name must', 'duplicate name', 'look', 'unknown favourite', 'fromLevel']) expect(errs.some((e) => e.includes(part)), part).toBe(true);
  });
});

describe('who can arrive', () => {
  it('nobody below Lv 8', () => {
    expect(eligibleRegulars(defaultRegulars, 7, ['fries', 'burger', 'nuggets', 'pizza', 'drink'], [])).toEqual([]);
  });
  it('only regulars whose favourite dish is on the menu, and not one already seated', () => {
    const menu = ['fries', 'burger', 'nuggets', 'pizza', 'drink'] as const;
    const names = eligibleRegulars(defaultRegulars, 8, menu, ['mr_wispy']).map((r) => r.id);
    expect(names).not.toContain('mr_wispy');
    expect(names).not.toContain('dame_dusk'); // ice cream is not unlocked yet
    expect(names).toContain('miss_mist');
  });
  it('the tip bonus is +30 percent and 0 stays 0', () => {
    expect(regularTip(10, 0.3)).toBe(13);
    expect(regularTip(0, 0.3)).toBe(0);
  });
});

describe('regulars in the model', () => {
  function arrivals(level: number, seed: number, n: number): Customer[] {
    const k = make(level, seed);
    const out: Customer[] = [];
    for (let i = 0; i < n; i++) {
      k.customers.length = 0;
      k.spawnCustomer();
      out.push({ ...k.customers[0] });
    }
    return out;
  }
  it('none below Lv 8', () => {
    expect(arrivals(7, 5, 300).some((c) => c.regular)).toBe(false);
  });
  it('about 10 percent of arrivals from Lv 8, and they always order their favourite', () => {
    let regs = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const c of arrivals(10, seed, 200)) {
        total++;
        if (!c.regular) continue;
        regs++;
        const def = defaultRegulars.find((r) => r.id === c.regular)!;
        expect(c.items).toContain(def.favorite);
        expect(c.look).toBe(def.look);
      }
    }
    expect(regs / total).toBeGreaterThan(0.07);
    expect(regs / total).toBeLessThan(0.13);
  });
  it('the main random sequence is the same with or without regulars (regulars use their own stream)', () => {
    const run = (chance: number) => {
      const saved = defaultRegularSettings.chance;
      (defaultRegularSettings as { chance: number }).chance = chance;
      try {
        const k = make(10, 9);
        const items: string[][] = [];
        for (let i = 0; i < 120; i++) {
          k.customers.length = 0;
          k.spawnCustomer();
          items.push(k.customers[0].items.slice(1)); // a regular may swap the FIRST item only
        }
        return { items, next: (k as unknown as { rng: () => number }).rng() };
      } finally {
        (defaultRegularSettings as { chance: number }).chance = saved;
      }
    };
    const without = run(0);
    const withRegulars = run(0.1);
    expect(withRegulars.next).toBe(without.next); // same number of main draws
    expect(withRegulars.items).toEqual(without.items); // every other item identical
  });
  it('a fast serve of a regular tips 30 percent more than the same order from an ordinary customer', () => {
    const k = make(10, 2);
    k.spawnCustomer();
    const c = k.customers[0];
    c.patience = c.patienceMax;
    c.delivered = c.items.map(() => true);
    const plain = (k as unknown as { completeOrder(c: Customer): void });
    plain.completeOrder(c);
    const base = (k.drainEvents().find((e) => e.type === 'orderDone') as { tip: number }).tip;
    const k2 = make(10, 2);
    k2.spawnCustomer();
    const r = k2.customers[0];
    r.regular = 'mr_wispy';
    r.patience = r.patienceMax;
    r.delivered = r.items.map(() => true);
    (k2 as unknown as { completeOrder(c: Customer): void }).completeOrder(r);
    const tip = (k2.drainEvents().find((e) => e.type === 'orderDone') as { tip: number }).tip;
    expect(tip).toBe(regularTip(base, 0.3));
  });
  it('a party guest or the Daily Special customer is never a regular', () => {
    const k = make(10, 4);
    k.nextEventIn = 1e9;
    k.nextArrival = 1e9;
    for (let i = 0; i < 80; i++) {
      k.customers.length = 0;
      k.startEvent(defaultConfig.events.events.find((e) => e.id === 'ghost_party')!);
      k.update(0.25);
      expect(k.customers.every((c) => c.regular === undefined)).toBe(true);
      k.event = null;
    }
  });
});
