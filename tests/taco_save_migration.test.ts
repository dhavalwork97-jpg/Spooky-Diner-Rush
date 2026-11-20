import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import tacoJson from '../data/taco.json';
import { purchaseRestaurant, type RestaurantPrice } from '../src/game/restaurants';
import { defaultTacoConfig } from '../src/game/taco/tacoConfig';
import { seedLearned } from '../src/game/taco/tacoLearning';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { defaultSave, parseSave, SaveSystem } from '../src/systems/SaveSystem';

// How the Taco Truck's dish-learning counts (`tacoServed`) survive every way a save can arrive: new, old (no counts), half learned, fully learned,
// after a new dish joins the menu, after buying the truck, and after the browser is refreshed. Written for the Lv 10 unlock change (2026-11-20).

const P = defaultTacoConfig.learning.practiceServes;
const taco = defaultTacoConfig;
const dishesBefore = (step: number): string[] => taco.dishes.filter((d) => d.unlockStep < step).map((d) => d.id);
const kitchen = (save: ReturnType<typeof parseSave>, seed = 1): TacoKitchenState =>
  new TacoKitchenState({ level: save.level, xp: save.xp, coins: save.coins, menuStep: save.tacoStep, menuXp: save.tacoXp, tacoServed: save.tacoServed }, defaultConfig, taco, seed);
/** What TacoScene.saveNow writes back from the running truck. */
const saveBack = (save: ReturnType<typeof parseSave>, s: TacoKitchenState): ReturnType<typeof parseSave> => ({ ...save, level: s.level, xp: s.xp, coins: s.coins, tacoStep: s.menuStep, tacoXp: s.menuXp, tacoServed: { ...s.dishServes } });
const refresh = (save: ReturnType<typeof parseSave>): ReturnType<typeof parseSave> => parseSave(JSON.stringify(save));

describe('tacoServed: fresh save', () => {
  it('starts empty at menu step 1 and the first dish is brought in by an introduction', () => {
    const s = defaultSave();
    expect(s.tacoServed).toEqual({});
    expect(s.tacoLessons).toEqual({});
    expect(s.tacoStep).toBe(1);
    const k = kitchen(s);
    expect(k.learning).toBe(true);
    expect(k.introDue()?.id).toBe('veggies_soft_taco');
  });
  it('a brand new player with no save at all gets the same', () => {
    const s = parseSave(null);
    expect(s.tacoServed).toEqual({});
    expect(kitchen(s).introDue()?.id).toBe('veggies_soft_taco');
  });
});

describe('tacoServed: legacy save without it', () => {
  const legacy = (step: number) => ({ version: 2, level: 18, coins: 640, restaurants: ['burger_diner', 'taco_truck'], tacoStep: step, tacoXp: 30 });

  it('counts every dish from earlier steps as learned and leaves this step and later ones to be learned', () => {
    for (const step of [1, 2, 3, 5, 8, 10]) {
      const s = parseSave(JSON.stringify(legacy(step)));
      expect(Object.keys(s.tacoServed).sort(), `step ${step}`).toEqual(dishesBefore(step).sort());
      for (const d of dishesBefore(step)) {
        expect(s.tacoServed[d]).toBe(P);
        expect(s.tacoLessons[d]).toBeGreaterThan(0); // the pointer tutorial is not shown again for dishes they already know
      }
      const k = kitchen(s);
      for (const d of taco.dishes.filter((x) => x.unlockStep < step)) expect(k.familiarity(d.id), `${d.id} at step ${step}`).toBe('normal');
    }
  });
  it('does not bypass learning for dishes that arrive later: advancing the step brings the new dish in alone', () => {
    const s = parseSave(JSON.stringify(legacy(4)));
    const k = kitchen(s);
    expect(k.introDue()?.id).toBe('chicken_taco'); // step 4's own dishes still need their introduction
    const later = refresh({ ...s, tacoStep: 7 });
    expect(later.tacoServed.veggies_burrito).toBeUndefined(); // step 6 and 7 dishes were never seeded as learned
    expect(Object.keys(later.tacoServed).length).toBe(dishesBefore(4).length); // and nothing else was invented
  });
  it('a save from before menu steps (owns the truck, no step) maps the global Lv to a step the same way as always', () => {
    const s = parseSave(JSON.stringify({ level: 17, restaurants: ['burger_diner', 'taco_truck'] }));
    expect(s.tacoStep).toBe(3); // Lv 17 = step 3, independent of the new Lv 10 unlock
    expect(Object.keys(s.tacoServed).sort()).toEqual(dishesBefore(3).sort());
  });
  it('a player who does not own the truck gets nothing seeded', () => {
    const s = parseSave(JSON.stringify({ level: 18, coins: 5 }));
    expect(s.tacoStep).toBe(1);
    expect(s.tacoServed).toEqual({});
  });
  it('matches seedLearned exactly and keeps level, coins and ownership', () => {
    const s = parseSave(JSON.stringify(legacy(6)));
    expect(s.tacoServed).toEqual(seedLearned(taco, 6).served);
    expect(s.level).toBe(18);
    expect(s.coins).toBe(640);
    expect(s.restaurants).toEqual(['burger_diner', 'taco_truck']);
  });
});

describe('tacoServed: valid stored progress is never overwritten', () => {
  it('half-learned dishes keep exactly their counts', () => {
    const stored = { veggies_soft_taco: 3, chicken_soft_taco: 3, shrimp_soft_taco: 1, fish_soft_taco: 2 };
    const s = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 3, tacoServed: stored }));
    expect(s.tacoServed).toEqual(stored);
    const k = kitchen(s);
    expect(k.familiarity('shrimp_soft_taco')).toBe('practice');
    expect(k.familiarity('fish_soft_taco')).toBe('practice');
    expect(k.familiarity('chicken_soft_taco')).toBe('normal');
  });
  it('an explicit empty record stays empty (a real player who has not served anything yet), it is not "fixed" by seeding', () => {
    const s = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 5, tacoServed: {} }));
    expect(s.tacoServed).toEqual({});
  });
  it('fully learned dishes stay learned and nothing is introduced again', () => {
    const all = Object.fromEntries(taco.dishes.map((d) => [d.id, P + 7]));
    const s = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 10, tacoServed: all }));
    expect(s.tacoServed).toEqual(all);
    const k = kitchen(s);
    expect(k.introDue()).toBeNull();
    for (const d of taco.dishes) expect(k.familiarity(d.id)).toBe('normal');
  });
  it('damaged counts are dropped one by one without taking good ones down', () => {
    const s = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 2, tacoServed: { veggies_soft_taco: 4.9, chicken_soft_taco: -3, shrimp_soft_taco: 'lots', fish_soft_taco: null, '': 2 } }));
    expect(s.tacoServed).toEqual({ veggies_soft_taco: 4 });
  });
  it('a corrupt tacoServed (not an object) does not crash and is not treated as missing', () => {
    for (const bad of ['text', 7, [1, 2], true]) expect(parseSave(JSON.stringify({ tacoStep: 3, restaurants: ['taco_truck'], tacoServed: bad })).tacoServed).toEqual({});
  });
});

describe('tacoServed: a new dish joins the menu', () => {
  it('an old learned dish stays learned, the new dish gets its introduction and the one after waits', () => {
    const served = Object.fromEntries(dishesBefore(4).map((d) => [d, P]));
    const k = kitchen(parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 4, tacoServed: served })));
    expect(k.introDue()?.id).toBe('chicken_taco');
    k.dishServes.chicken_taco = 1;
    expect(k.introDue()).toBeNull(); // veggies_taco waits until chicken_taco has been served twice
    k.dishServes.chicken_taco = 2;
    expect(k.introDue()?.id).toBe('veggies_taco');
    for (const d of dishesBefore(4)) expect(k.familiarity(d)).toBe('normal');
  });
  it('climbing a menu step in play keeps the counts, and they survive a refresh', () => {
    const base = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 1, tacoServed: { veggies_soft_taco: 3 }, tacoXp: 0 }));
    const k = kitchen(base);
    k.dishServes.chicken_soft_taco = 1;
    const written = saveBack(base, k);
    const back = refresh(written);
    expect(back.tacoServed).toEqual({ veggies_soft_taco: 3, chicken_soft_taco: 1 });
    const again = kitchen(back);
    expect(again.familiarity('veggies_soft_taco')).toBe('normal');
    expect(again.familiarity('chicken_soft_taco')).toBe('practice');
  });
});

describe('tacoServed: buying and switching restaurants', () => {
  it('buying the truck starts it at step 1 with no learned dishes and touches nothing else', () => {
    const save = { level: 10, coins: 1500, restaurants: ['burger_diner'] as string[], tacoStep: 6, tacoXp: 99 };
    const price: RestaurantPrice = { id: tacoJson.restaurant.id, unlockLevel: tacoJson.restaurant.unlockLevel, cost: tacoJson.restaurant.cost };
    expect(purchaseRestaurant(price, save).ok).toBe(true);
    expect(save).toMatchObject({ level: 10, coins: 0, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 1, tacoXp: 0 });
    const s = parseSave(JSON.stringify({ ...defaultSave(), ...save }));
    expect(s.tacoServed).toEqual({});
    expect(kitchen(s).introDue()?.id).toBe('veggies_soft_taco');
  });
  it('leaving for the diner and coming back keeps the learning counts (the diner saves the whole record unchanged)', () => {
    const base = parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'], tacoStep: 3, tacoServed: { veggies_soft_taco: 3, chicken_soft_taco: 3, shrimp_soft_taco: 2 } }));
    const dinerSide = refresh({ ...base, level: base.level + 1, coins: base.coins + 120, lastRestaurant: 'burger_diner' });
    expect(dinerSide.tacoServed).toEqual(base.tacoServed);
    expect(dinerSide.tacoStep).toBe(3);
    expect(dinerSide.restaurants).toEqual(['burger_diner', 'taco_truck']);
  });
});

describe('tacoServed: refresh in the browser', () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    SaveSystem.data = defaultSave();
  });

  it('save() then load() brings back counts, step, lessons, coins and ownership exactly', () => {
    SaveSystem.data = {
      ...defaultSave(),
      level: 12,
      coins: 777,
      restaurants: ['burger_diner', 'taco_truck'],
      tacoStep: 5,
      tacoXp: 41,
      tacoServed: { veggies_soft_taco: 9, chicken_soft_taco: 4, shrimp_soft_taco: 3, fish_soft_taco: 3, chicken_taco: 3, veggies_taco: 1 },
      tacoLessons: { veggies_soft_taco: 2, chicken_soft_taco: 2 },
    };
    const before = JSON.parse(JSON.stringify(SaveSystem.data));
    SaveSystem.save();
    SaveSystem.data = defaultSave(); // the page was reloaded
    const loaded = SaveSystem.load();
    expect(loaded.tacoServed).toEqual(before.tacoServed);
    expect(loaded.tacoLessons).toEqual(before.tacoLessons);
    expect(loaded.tacoStep).toBe(5);
    expect(loaded.tacoXp).toBe(41);
    expect(loaded.coins).toBe(777);
    expect(loaded.restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(kitchen(loaded).familiarity('veggies_taco')).toBe('practice');
  });
  it('a second refresh changes nothing (loading never rewrites valid progress)', () => {
    SaveSystem.data = { ...defaultSave(), restaurants: ['burger_diner', 'taco_truck'], tacoStep: 2, tacoServed: { veggies_soft_taco: 5 } };
    SaveSystem.save();
    const first = JSON.stringify(SaveSystem.load());
    SaveSystem.save();
    const second = JSON.stringify(SaveSystem.load());
    expect(second).toBe(first);
  });
  it('a save written by the previous version (old key, no tacoServed) loads once with the seeded counts, then is written under the new key', () => {
    store.set('chef-rush-save', JSON.stringify({ version: 2, level: 20, coins: 90, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 4 }));
    const loaded = SaveSystem.load();
    expect(Object.keys(loaded.tacoServed).sort()).toEqual(dishesBefore(4).sort());
    SaveSystem.save();
    expect(JSON.parse(store.get('spooky-diner-rush-save')!).tacoServed).toEqual(loaded.tacoServed);
  });
});
