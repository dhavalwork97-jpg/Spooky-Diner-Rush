import { describe, it, expect } from 'vitest';
import { KitchenState, type Customer, type GameEvent } from '../src/game/KitchenState';
import { defaultExtras } from '../src/game/extras';

function make(level = defaultExtras.mastery.fromLevel, seed = 1) {
  const k = new KitchenState({ level, xp: 0, coins: 0 }, undefined, seed);
  return k;
}
/** Serve a customer fast by filling every delivery directly through the same path the game uses. */
function finish(k: KitchenState, c: Customer, fast: boolean) {
  c.patience = fast ? c.patienceMax : c.patienceMax * 0.05;
  c.delivered = c.items.map(() => true);
  (k as unknown as { completeOrder(c: Customer): void }).completeOrder(c);
}
const evs = (k: KitchenState) => k.drainEvents();

describe('extras are off by default', () => {
  it('no mastery or special events without enableExtras', () => {
    const k = make();
    k.spawnCustomer();
    finish(k, k.customers[0], true);
    expect(evs(k).some((e) => e.type === 'masteryUp' || e.type === 'specialDone')).toBe(false);
    expect(k.mastery).toEqual({});
  });
});

describe('mastery badges', () => {
  it('count fast serves only and pay the tier coins once', () => {
    const k = make();
    k.enableExtras({}, '2026-11-08', true);
    k.spawnCustomer();
    const c = k.customers[0];
    const item = c.items[0];
    finish(k, c, false);
    expect(k.mastery[item] ?? 0).toBe(0);
    k.mastery[item] = 9; // one fast serve from Bronze
    k.customers.length = 0;
    k.spawnCustomer();
    const c2 = k.customers[0];
    c2.items = [item];
    const coinsBefore = k.coins;
    finish(k, c2, true);
    const up = evs(k).filter((e): e is Extract<GameEvent, { type: 'masteryUp' }> => e.type === 'masteryUp');
    expect(up).toHaveLength(1);
    expect(up[0]).toMatchObject({ item, tier: 'Bronze', coins: 40 });
    expect(k.coins - coinsBefore).toBeGreaterThanOrEqual(40);
  });
  it('do not count below the starting level', () => {
    // Mastery starts at Lv 6 since the diner content work (data/extras.json, was Lv 16): the level below the start is taken from the data.
    const k = make(defaultExtras.mastery.fromLevel - 1);
    k.enableExtras({}, '2026-11-08', true);
    k.spawnCustomer();
    finish(k, k.customers[0], true);
    expect(k.mastery).toEqual({});
  });
});

describe('daily special', () => {
  it('appears after 3 serves, pays +50 percent once, and is not repeated', () => {
    const k = make();
    k.enableExtras({}, '2026-11-08', false);
    expect(k.special?.items.length).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      k.customers.length = 0;
      k.spawnCustomer();
      expect(k.customers[0].special).toBeUndefined();
      finish(k, k.customers[0], true);
    }
    k.customers.length = 0;
    k.spawnCustomer();
    const sp = k.customers[0];
    expect(sp.special).toBe(true);
    expect(sp.items).toEqual(k.special!.items);
    evs(k);
    finish(k, sp, true);
    const done = evs(k).filter((e) => e.type === 'specialDone');
    expect(done).toHaveLength(1);
    expect(k.special!.done).toBe(true);
    k.customers.length = 0;
    k.spawnCustomer();
    expect(k.customers[0].special).toBeUndefined();
  });
  it('comes back if the special customer leaves angry', () => {
    const k = make();
    k.enableExtras({}, '2026-11-08', false);
    for (let i = 0; i < 3; i++) {
      k.customers.length = 0;
      k.spawnCustomer();
      finish(k, k.customers[0], true);
    }
    k.customers.length = 0;
    k.spawnCustomer();
    expect(k.customers[0].special).toBe(true);
    k.customers[0].patience = 0.01;
    (k as unknown as { updateCustomers(dt: number): void }).updateCustomers(1);
    k.customers.length = 0;
    k.spawnCustomer();
    expect(k.customers[0].special).toBe(true);
  });
  it('is skipped when already done today or below its level', () => {
    const a = make();
    a.enableExtras({}, '2026-11-08', true);
    expect(a.special?.done).toBe(true);
    // Retention pacing (2026-11-13): the Daily Special starts at Lv 3 (data/extras.json dailySpecial.fromLevel, was 15), so Lv 2 is still without one.
    const b = make(2);
    b.enableExtras({}, '2026-11-08', false);
    expect(b.special).toBeNull();
    const c = make(3);
    c.enableExtras({}, '2026-11-08', false);
    expect(c.special?.items.length).toBeGreaterThan(0);
    expect(c.special?.items.every((k) => c.levelInfo.items.includes(k))).toBe(true);
  });
});

describe('random sequence is unchanged by extras', () => {
  it('same customers with extras on, before the special is due', () => {
    const a = make(16, 7);
    const b = make(16, 7);
    b.enableExtras({}, '2026-11-08', true);
    for (let i = 0; i < 4; i++) {
      a.customers.length = 0;
      b.customers.length = 0;
      a.spawnCustomer();
      b.spawnCustomer();
      expect(b.customers[0].items).toEqual(a.customers[0].items);
    }
  });
});
