import { describe, expect, it } from 'vitest';
import { defaultExtras, masteryProgress, tiersEarned, type Extras } from '../src/game/extras';
import { KitchenState, type Customer, type GameEvent } from '../src/game/KitchenState';
import { reachLevel } from './helpers/dinerReport';

const finish = (k: KitchenState, c: Customer, fast: boolean) => {
  c.patience = fast ? c.patienceMax : c.patienceMax * 0.05;
  c.delivered = c.items.map(() => true);
  (k as unknown as { completeOrder(c: Customer): void }).completeOrder(c);
};
const serveOne = (k: KitchenState, item: 'fries' | 'burger'): void => {
  k.customers.length = 0;
  k.spawnCustomer();
  k.customers[0].items = [item];
  finish(k, k.customers[0], true);
};

describe('early mastery (Lv 6)', () => {
  it('starts at Lv 6 and keeps the tiers: 10, 40 and 100 serves for 40, 120 and 300 coins', () => {
    expect(defaultExtras.mastery.fromLevel).toBe(6);
    expect(defaultExtras.mastery.tiers.map((t) => [t.name, t.serves, t.coins])).toEqual([['Bronze', 10, 40], ['Silver', 40, 120], ['Gold', 100, 300]]);
  });
  it('Lv 5 counts nothing, Lv 6 counts', () => {
    const low = new KitchenState({ level: 5, xp: 0, coins: 0 }, undefined, 1);
    low.enableExtras({}, '2026-11-14', true);
    serveOne(low, 'fries');
    expect(low.mastery).toEqual({});
    const at = new KitchenState({ level: 6, xp: 0, coins: 0 }, undefined, 1);
    at.enableExtras({}, '2026-11-14', true);
    serveOne(at, 'fries');
    expect(at.mastery.fries).toBe(1);
  });
  it('a player who is already past Lv 6 keeps the saved counts and earns the next tier from them', () => {
    const k = new KitchenState({ level: 20, xp: 0, coins: 0 }, undefined, 1);
    k.enableExtras({ fries: 39, burger: 7 }, '2026-11-14', true);
    const before = k.coins;
    serveOne(k, 'fries');
    expect(k.mastery).toMatchObject({ fries: 40, burger: 7 });
    const up = k.drainEvents().filter((e): e is Extract<GameEvent, { type: 'masteryUp' }> => e.type === 'masteryUp');
    expect(up.map((e) => e.tier)).toEqual(['Silver']);
    expect(k.coins - before).toBeGreaterThanOrEqual(120);
  });
  it('earlier counts are never lost when the start level moves', () => {
    const old: Extras = { ...defaultExtras, mastery: { ...defaultExtras.mastery, fromLevel: 16 } };
    expect(masteryProgress(old, 12)).toEqual(masteryProgress(defaultExtras, 12));
    expect(tiersEarned(old, 45)).toBe(tiersEarned(defaultExtras, 45));
  });
  it('costs the economy no more than 10 percent of the coins a fast player has at Lv 14', () => {
    const old: Extras = { ...defaultExtras, mastery: { ...defaultExtras.mastery, fromLevel: 16 } };
    for (const seed of [1, 2, 3]) {
      const before = reachLevel(seed, 0.8, 14, 1500, undefined, old)!;
      const after = reachLevel(seed, 0.8, 14, 1500, undefined, defaultExtras)!;
      expect(after.time).toBe(before.time); // mastery pays coins only: the level-up pace does not move
      expect(after.coins).toBeGreaterThan(before.coins);
      expect(after.coins).toBeLessThanOrEqual(before.coins * 1.1);
    }
  }, 120000);
});
