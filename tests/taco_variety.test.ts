import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { defaultTacoConfig } from '../src/game/taco/tacoConfig';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { tacoRegulars } from '../src/game/taco/tacoExtras';
import { drinkChanceNow, emptyHistory, kindMult, NEUTRAL_VARIETY, pickOrderSize, recencyMult, recentDishKinds, recordOrder } from '../src/game/taco/tacoVariety';
import { learnedSave, learningRun, oldTacoConfig, simulateOrders } from './helpers/tacoVarietySim';

const V = defaultTacoConfig.variety!;
const N = 6000;

describe('taco variety: settings', () => {
  it('ship with sane numbers', () => {
    expect(V.recentDishes).toBeGreaterThanOrEqual(2);
    expect(V.recentDishes).toBeLessThanOrEqual(3);
    expect(V.recencyWeights.length).toBeLessThanOrEqual(V.recentDishes);
    for (const w of V.recencyWeights) expect(w).toBeGreaterThan(0); // a dish is never shut out
    expect([...V.recencyWeights].sort((a, b) => a - b)).toEqual(V.recencyWeights); // the more recent, the lower
    expect(V.kindMin).toBeGreaterThan(0);
    expect(V.kindMin).toBeLessThanOrEqual(1);
    expect(V.kindMax).toBeGreaterThanOrEqual(1);
    expect(V.drinkMin).toBeGreaterThan(0);
  });
  it('the big-order share starts small and never shrinks as the truck gets busier', () => {
    const shares = defaultTacoConfig.ramp.filter((r) => r.orderSize[1] - r.orderSize[0] >= 2).map((r) => r.bigOrderShare ?? 1 / 3);
    expect(shares[0]).toBeLessThanOrEqual(0.15);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    expect(Math.max(...shares)).toBeLessThanOrEqual(0.3);
  });
  it('the old config really is the plain random pick', () => {
    expect(oldTacoConfig.variety).toBeUndefined();
    expect(oldTacoConfig.ramp.every((r) => r.bigOrderShare === undefined)).toBe(true);
  });
});

describe('taco variety: helpers', () => {
  it('recencyMult: lower for newer dishes, 1 for a dish not remembered', () => {
    const recent = ['a', 'b', 'c'];
    expect(recencyMult(V, recent, 'a')).toBe(V.recencyWeights[0]);
    expect(recencyMult(V, recent, 'b')).toBe(V.recencyWeights[1]);
    expect(recencyMult(V, recent, 'c')).toBe(V.recencyWeights[2]);
    expect(recencyMult(V, recent, 'z')).toBe(1);
    expect(recencyMult(NEUTRAL_VARIETY, recent, 'a')).toBe(1);
  });
  it('kindMult: pushes over-used kinds down and under-used kinds up, within the limits', () => {
    const lots = ['burrito', 'burrito', 'burrito', 'burrito', 'burrito', 'burrito', 'soft_taco', 'nachos'];
    expect(kindMult(V, lots, 'burrito', 4)).toBe(V.kindMin);
    expect(kindMult(V, lots, 'crispy_taco', 4)).toBeGreaterThan(1);
    expect(kindMult(V, lots, 'crispy_taco', 4)).toBeLessThanOrEqual(V.kindMax);
    expect(kindMult(V, [], 'burrito', 4)).toBe(1);
    expect(kindMult(V, lots, 'burrito', 1)).toBe(1); // nothing to balance against
  });
  it('drinkChanceNow: down after many drinks, up after few, unchanged without history', () => {
    const base = defaultTacoConfig.settings.drinkChance;
    expect(drinkChanceNow(V, base, ['soft_taco', 'drink'])).toBe(base);
    expect(drinkChanceNow(V, base, ['drink', 'drink', 'drink', 'soft_taco', 'burrito', 'drink', 'nachos', 'drink'])).toBeLessThan(base);
    expect(drinkChanceNow(V, base, ['soft_taco', 'burrito', 'nachos', 'crispy_taco', 'soft_taco', 'burrito', 'nachos', 'crispy_taco'])).toBeGreaterThan(base);
    expect(drinkChanceNow(V, base, ['drink', 'drink', 'drink', 'drink'])).toBeGreaterThanOrEqual(base * V.drinkMin);
  });
  it('recordOrder keeps only the most recent dishes and items, newest first', () => {
    let h = emptyHistory();
    h = recordOrder(V, h, [{ id: 'd1', kind: 'soft_taco' }, { id: 'horchata', kind: 'drink' }]);
    h = recordOrder(V, h, [{ id: 'd2', kind: 'burrito' }]);
    expect(h.dishes).toEqual(['d2', 'd1']);
    expect(h.items).toEqual(['burrito', 'drink', 'soft_taco']);
    for (let i = 0; i < 20; i++) h = recordOrder(V, h, [{ id: `x${i}`, kind: 'nachos' }]);
    expect(h.dishes.length).toBe(V.recentDishes);
    expect(h.items.length).toBe(V.kindWindow);
    expect(recentDishKinds(V, ['drink', 'nachos', 'drink'])).toEqual(['nachos']);
  });
  it('pickOrderSize: the biggest size is as likely as the share, the rest are even; short ranges stay uniform', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const count: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 20000; i++) count[pickOrderSize([1, 3], 0.2, rng)]++;
    expect(count[3] / 20000).toBeGreaterThan(0.18);
    expect(count[3] / 20000).toBeLessThan(0.22);
    expect(Math.abs(count[1] - count[2]) / 20000).toBeLessThan(0.03);
    const two: Record<number, number> = { 1: 0, 2: 0 };
    for (let i = 0; i < 20000; i++) two[pickOrderSize([1, 2], 0.2, rng)]++;
    expect(Math.abs(two[1] - two[2]) / 20000).toBeLessThan(0.03);
  });
});

describe('taco variety: orders at each menu step (new against the old plain random pick)', () => {
  const steps = [3, 5, 7, 10];
  const before = Object.fromEntries(steps.map((st) => [st, simulateOrders(oldTacoConfig, st, N, 100 + st)]));
  const after = Object.fromEntries(steps.map((st) => [st, simulateOrders(defaultTacoConfig, st, N, 100 + st)]));

  it('a customer is much less likely to order what the customer before ordered', () => {
    for (const st of steps) {
      expect(after[st].consecOverlapPct, `step ${st}`).toBeLessThan(before[st].consecOverlapPct * 0.7);
      expect(after[st].consecFirstSamePct, `step ${st}`).toBeLessThan(before[st].consecFirstSamePct * 0.6);
    }
  });
  it('one customer rarely gets the same dish twice while there is something else to offer', () => {
    for (const st of steps) expect(after[st].withinOrderDupPct, `step ${st}`).toBeLessThan(2);
    for (const st of steps) expect(after[st].withinOrderDupPct).toBeLessThan(before[st].withinOrderDupPct);
  });
  it('the same kind of dish does not run on and on', () => {
    for (const st of [5, 7, 10]) expect(after[st].sameKindRun3Pct, `step ${st}`).toBeLessThan(before[st].sameKindRun3Pct);
  });
  it('every dish on the menu stays in the rotation: none is shut out or left far behind', () => {
    for (const st of steps) {
      expect(after[st].worstDishVsFair, `step ${st}`).toBeGreaterThan(0.6);
      for (const d of defaultTacoConfig.dishes.filter((x) => x.unlockStep <= st)) expect(after[st].dishPct[d.id] ?? 0, `${d.id} at step ${st}`).toBeGreaterThan(0);
    }
  });
  it('drinks stay about as common as the setting says', () => {
    for (const st of steps) {
      expect(Math.abs(after[st].drinkPct - defaultTacoConfig.settings.drinkChance * 100), `step ${st}`).toBeLessThan(4);
    }
  });
  it('three-item orders are rarer than a uniform draw and grow gradually with the step', () => {
    expect(after[3].size3Pct).toBeLessThan(18);
    expect(after[5].size3Pct).toBeLessThan(before[5].size3Pct * 0.85);
    expect(after[3].size3Pct).toBeLessThanOrEqual(after[10].size3Pct);
    expect(after[10].size3Pct).toBeLessThan(32);
  });
  it('never offers a dish or drink that is not on the menu at that step', () => {
    for (const st of [1, 2, 3, 4, 6, 9]) {
      const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: st, tacoServed: learnedSave(defaultTacoConfig, st) }, defaultConfig, defaultTacoConfig, 5 + st);
      const ok = new Set([...defaultTacoConfig.dishes.filter((d) => d.unlockStep <= st).map((d) => d.id), ...defaultTacoConfig.drinks.filter((d) => d.unlockStep <= st).map((d) => d.id)]);
      for (let i = 0; i < 1500; i++) {
        s.customers.length = 0;
        s.spawnCustomer();
        for (const k of s.customers[0].items) expect(ok.has(k), `step ${st}: ${k}`).toBe(true);
      }
    }
  });
  it('without a learned menu (no dish counts, as in older callers) the truck still never offers a locked dish', () => {
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 4 }, defaultConfig, defaultTacoConfig, 9);
    const ok = new Set(defaultTacoConfig.dishes.filter((d) => d.unlockStep <= 4).map((d) => d.id));
    for (let i = 0; i < 1000; i++) {
      s.customers.length = 0;
      s.spawnCustomer();
      for (const k of s.customers[0].items) if (defaultTacoConfig.dishes.some((d) => d.id === k)) expect(ok.has(k)).toBe(true);
    }
  });
  it('the oven and press limits still hold when customers are waiting (a regular\'s favourite dish is the one existing exception, and stays bounded)', () => {
    const L = defaultTacoConfig.learning;
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 10, tacoServed: learnedSave(defaultTacoConfig, 10) }, defaultConfig, defaultTacoConfig, 21);
    const kind = (id: string) => defaultTacoConfig.dishes.find((d) => d.id === id)?.kind;
    for (let i = 0; i < 6000; i++) {
      if (s.customers.length >= 4) s.customers.length = 0;
      s.spawnCustomer();
      const waiting = s.customers.flatMap((c) => c.items);
      const oven = waiting.filter((k) => kind(k) === 'crispy_taco' || kind(k) === 'nachos').length;
      const press = waiting.filter((k) => kind(k) === 'burrito').length;
      const extra = s.customers.some((c) => c.regular) ? 2 : 0; // a regular's favourite replaces an item without looking at the stations (unchanged from before)
      expect(oven).toBeLessThanOrEqual(L.ovenItemCap + extra);
      expect(press).toBeLessThanOrEqual(L.pressItemCap + extra);
    }
  });
  it('a closed truck that reopens starts with no memory of the last service', () => {
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 3, tacoServed: learnedSave(defaultTacoConfig, 3) }, defaultConfig, defaultTacoConfig, 3);
    s.spawnCustomer();
    s.closed = true;
    s.reopen();
    expect((s as unknown as { history: { dishes: string[]; items: string[] } }).history).toEqual({ dishes: [], items: [] });
  });
});

describe('taco variety: regulars (named customers with a favourite dish)', () => {
  it('still arrive with their favourite in the order, about one customer in ten, and several different ones turn up', () => {
    const st = 10;
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: st, tacoServed: learnedSave(defaultTacoConfig, st) }, defaultConfig, defaultTacoConfig, 77);
    const fav: Record<string, string> = Object.fromEntries(tacoRegulars.map((r) => [r.id, r.favorite]));
    let regulars = 0;
    const seen: Record<string, number> = {};
    const n = 4000;
    for (let i = 0; i < n; i++) {
      s.customers.length = 0;
      s.spawnCustomer();
      const c = s.customers[0];
      if (!c.regular) continue;
      regulars++;
      seen[c.regular] = (seen[c.regular] ?? 0) + 1;
      expect(c.items, c.regular).toContain(fav[c.regular]);
    }
    expect(regulars / n).toBeGreaterThan(0.07);
    expect(regulars / n).toBeLessThan(0.13);
    expect(Object.keys(seen).length).toBe(6);
    const counts = Object.values(seen);
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(2.2); // no favourite dominates
  });
});

describe('taco variety: learning a new dish', () => {
  it('a new dish is first ordered alone, never next to another unfamiliar dish, and the next new dish waits its turn', () => {
    for (const step of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const r = learningRun(defaultTacoConfig, step, 160, 40 + step);
      expect(r.introMixedOrders, `step ${step}`).toBe(0);
      expect(r.twoUnfamiliarOrders, `step ${step}`).toBe(0);
      expect(r.introOrders, `step ${step}`).toBe(r.newDishes.length);
      const order = [...r.newDishes].sort((a, b) => r.introducedAt[a] - r.introducedAt[b]);
      for (let i = 1; i < order.length; i++) {
        // The next first-time dish needs the one before it served at least introNeedsServes times.
        expect(r.introducedAt[order[i]], `step ${step} ${order[i]}`).toBeGreaterThan(r.introducedAt[order[i - 1]] + defaultTacoConfig.learning.introNeedsServes - 1);
      }
    }
  });
  it('every dish of a step is introduced and learned within a reasonable number of customers', () => {
    for (const step of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const r = learningRun(defaultTacoConfig, step, 200, 60 + step);
      for (const d of r.newDishes) {
        expect(r.introducedAt[d], `step ${step} ${d} introduced`).toBeDefined();
        expect(r.learnedAt[d], `step ${step} ${d} learned`).toBeDefined();
        expect(r.learnedAt[d], `step ${step} ${d}`).toBeLessThan(120);
      }
    }
  });
  it('learning progress carries over: a truck restored from the counts does not introduce a learned dish again', () => {
    const step = 4;
    const served = { ...learnedSave(defaultTacoConfig, step - 1), chicken_taco: 1, veggies_taco: 3 }; // partway through the step
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: served }, defaultConfig, defaultTacoConfig, 5);
    expect(s.familiarity('veggies_taco')).toBe('normal');
    expect(s.familiarity('chicken_taco')).toBe('practice');
    expect(s.familiarity('veggies_soft_taco')).toBe('normal');
    expect(s.introDue()).toBeNull(); // nothing is brand new; the half-learned dish just keeps being practised
    const again = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: { ...s.dishServes } }, defaultConfig, defaultTacoConfig, 6);
    expect(again.familiarity('chicken_taco')).toBe('practice');
  });
});

describe('taco variety: report (before and after)', () => {
  it('prints the distribution tables between markers when TACO_VARIETY_REPORT=1', () => {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined>; stdout?: { write(s: string): void } } }).process;
    if (env?.env?.TACO_VARIETY_REPORT !== '1') return;
    const n = Number(env.env.TACO_VARIETY_ORDERS ?? 40000);
    const out: unknown[] = [];
    for (const st of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) out.push({ before: simulateOrders(oldTacoConfig, st, n, 900 + st), after: simulateOrders(defaultTacoConfig, st, n, 900 + st) });
    const learn = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((st) => learningRun(defaultTacoConfig, st, 200, 700 + st));
    env.stdout?.write(`\n@@VARIETY\n${JSON.stringify({ n, out, learn })}\n@@END\n`);
    expect(out.length).toBe(10);
  }, 900000);
});
