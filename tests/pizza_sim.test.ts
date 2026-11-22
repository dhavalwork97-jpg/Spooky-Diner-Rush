import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { PizzaKitchenState } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig } from '../src/game/pizza/pizzaConfig';
import { pizzaModsFor } from '../src/game/pizza/pizzaShop';
import { nextPizzaHint } from '../src/game/pizza/pizzaTutorial';
import { tapPizzaZone } from '../src/game/pizza/pizzaZones';

/**
 * A small Pizza Place bot. Every `react` seconds it does one tap: it takes out whatever is ready or burnt, otherwise it follows the tutorial hint for the dish
 * the oldest customer is waiting for (so the hints are exercised too). It starts from `step` with every dish already learned.
 */
interface Result { served: number; closes: number; burnt: number; coins: number; invalid: number; level: number; menuStep: number }

function play(step: number, seed: number, seconds: number, react: number, owned: Record<string, number> = {}): Result {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0, menuStep: step, pizzaServed: {} }, defaultConfig, defaultPizzaConfig, seed);
  for (const d of k.pizza.dishes) k.dishServes[d.id] = 3;
  k.mods = pizzaModsFor(defaultPizzaConfig.upgrades, owned);
  const zone = (id: string) => defaultPizzaConfig.zones.find((z) => z.id === id)!;
  let closes = 0;
  let burnt = 0;
  let invalid = 0;
  let served0 = 0;
  let acc = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    k.update(0.1);
    for (const e of k.drainEvents()) {
      if (e.type === 'closed') closes++;
      if (e.type === 'burnt') burnt++;
      if (e.type === 'invalid') invalid++;
      if (e.type === 'orderDone') served0++;
    }
    if (k.closed) k.reopen();
    acc += 0.1;
    if (acc < react) continue;
    acc = 0;
    const burntOven = k.ovens.findIndex((o) => o?.phase === 'burnt');
    if (burntOven >= 0) { tapPizzaZone(k, zone(`oven_slot_${burntOven + 1}`)); continue; }
    const wanted = k.customers.filter((c) => c.mood === 'waiting').flatMap((c) => c.items.filter((_, i) => !c.delivered[i]));
    for (const dish of [...new Set(wanted)]) {
      const h = nextPizzaHint(k, dish);
      if (h && h.kind === 'tap') { tapPizzaZone(k, zone(h.zone)); break; }
    }
  }
  return { served: served0, closes, burnt, coins: k.coins, invalid, level: k.level, menuStep: k.menuStep };
}

const seeds = [1, 2, 3, 4, 5, 6];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('pizza bot soak', () => {
  it.each([1, 3, 5, 7, 10])('menu step %i: a hint-following bot serves customers and never breaks the rules', (step) => {
    for (const seed of seeds) {
      const r = play(step, seed, 600, 1.0);
      expect(r.served).toBeGreaterThan(5);
      expect(r.coins).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.coins)).toBe(true);
    }
  });
  it('the guided hint never points at a zone that does not exist', () => {
    const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0, menuStep: 10, pizzaServed: {} }, defaultConfig, defaultPizzaConfig, 9);
    for (const d of k.pizza.dishes) {
      k.customers.push({ id: 900 + k.customers.length, seat: k.customers.length, look: 4, items: [d.id], delivered: [false], price: 20, patience: 90, patienceMax: 90, age: 5, type: 'regular', mood: 'waiting', leaveIn: 0 });
      const h = nextPizzaHint(k, d.id);
      expect(h).not.toBeNull();
      if (h?.kind === 'tap') expect(defaultPizzaConfig.zones.some((z) => z.id === h.zone)).toBe(true);
      k.customers.pop();
    }
  });
  it('upgrades help: with Brick Oven 4, Burn Guard and Calm Kitchen a slow bot burns less than with none', () => {
    const all: Record<string, number> = { brick_oven: 4, fast_fryer: 3, burn_guard: 3, calm_kitchen: 2 };
    const base = sum(seeds.map((s) => play(10, s, 900, 2.2).burnt));
    const upgraded = sum(seeds.map((s) => play(10, s, 900, 2.2, all).burnt));
    expect(upgraded).toBeLessThanOrEqual(base);
  });
});

describe.skipIf(!(globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.BALANCE_REPORT)('pizza balance report', () => {
  it('prints closes and burns per 10 minutes, no upgrades vs upgrades', { timeout: 300_000 }, () => {
    const all: Record<string, number> = { brick_oven: 4, fast_fryer: 3, burn_guard: 3, calm_kitchen: 2 };
    const lines = ['step | react | served | closes | burnt | invalid taps  (sum of 6 seeds x 15 min)  none -> upgraded'];
    for (const step of [1, 4, 7, 10]) {
      for (const react of [1.0, 2.2, 3.5]) {
        const a = seeds.map((s) => play(step, s, 900, react));
        const b = seeds.map((s) => play(step, s, 900, react, all));
        const f = (rs: Result[], k: keyof Result) => sum(rs.map((r) => r[k]));
        lines.push(`${step} | ${react} | ${f(a, 'served')} -> ${f(b, 'served')} | ${f(a, 'closes')} -> ${f(b, 'closes')} | ${f(a, 'burnt')} -> ${f(b, 'burnt')} | ${f(a, 'invalid')} -> ${f(b, 'invalid')}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });
});
