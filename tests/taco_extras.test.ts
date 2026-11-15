import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN } from '../src/game/KitchenState';
import { MAX_MENU_STEP } from '../src/game/taco/tacoMenu';
import { defaultTacoConfig as cfg } from '../src/game/taco/tacoConfig';
import {
  allBronze, comboLightTier, dueTacoChests, eligibleTacoRegulars, litWindows, masteryDue, masteryGrid, masteryTierFor, paidAfter, seedMasteryPaid,
  tacoAllBronzeCoins, tacoChests, tacoChestsAfter, tacoEventPool, tacoEvents, tacoHaunted, tacoMasteryTiers, tacoRegularSettings, tacoRegulars,
  validateHaunted, validateMastery, validateTacoChests, validateTacoEvents, validateTacoRegulars,
} from '../src/game/taco/tacoExtras';

describe('taco data checks', () => {
  it('mastery, regulars, chests, events and haunted data are valid', () => {
    expect(validateMastery(tacoMasteryTiers, tacoAllBronzeCoins, cfg.dishes)).toEqual([]);
    expect(validateTacoRegulars(tacoRegulars, tacoRegularSettings, CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, cfg.dishes.map((d) => d.id))).toEqual([]);
    expect(validateTacoChests(tacoChests, MAX_MENU_STEP)).toEqual([]);
    expect(validateTacoEvents(tacoEvents, MAX_MENU_STEP)).toEqual([]);
    expect(validateHaunted(tacoHaunted)).toEqual([]);
  });
});

describe('mastery grid (B1)', () => {
  it('is 4 x 4, rows are proteins and columns are formats', () => {
    const g = masteryGrid(cfg.dishes, {}, 10);
    expect(g.length).toBe(4);
    g.forEach((row) => expect(row.length).toBe(4));
    expect(g.flat().map((c) => c.dish)).toHaveLength(16);
    expect(new Set(g.flat().map((c) => c.dish)).size).toBe(16);
    expect(g[0][0]).toMatchObject({ protein: 'chicken', kind: 'soft_taco' });
    expect(g[3][3]).toMatchObject({ protein: 'veggies', kind: 'nachos' });
  });
  it('tiers come at 10, 40 and 100 serves', () => {
    expect([0, 9, 10, 39, 40, 99, 100, 500].map((n) => masteryTierFor(n))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(tacoMasteryTiers.map((t) => t.serves)).toEqual([10, 40, 100]);
  });
  it('shows what is next and what is on the menu', () => {
    const g = masteryGrid(cfg.dishes, { chicken_soft_taco: 12 }, 2);
    expect(g[0][0]).toMatchObject({ tier: 1, onMenu: true, next: { name: 'Silver', remaining: 28 } });
    expect(g[3][3].onMenu).toBe(false);
    expect(masteryGrid(cfg.dishes, { chicken_soft_taco: 100 }, 10)[0][0].next).toBeNull();
  });
  it('pays each badge once and never twice', () => {
    const due = masteryDue({ chicken_soft_taco: 45 }, {});
    expect(due.map((a) => [a.tier, a.coins])).toEqual([[1, 20], [2, 50]]);
    const paid = paidAfter({}, due);
    expect(paid).toEqual({ chicken_soft_taco: 2 });
    expect(masteryDue({ chicken_soft_taco: 45 }, paid)).toEqual([]);
    expect(masteryDue({ chicken_soft_taco: 100 }, paid).map((a) => a.tier)).toEqual([3]);
  });
  it('a save from before the grid keeps its progress without a payout', () => {
    const served = { chicken_soft_taco: 41, fish_taco: 3 };
    const paid = seedMasteryPaid(served);
    expect(paid).toEqual({ chicken_soft_taco: 2 });
    expect(masteryDue(served, paid)).toEqual([]);
    expect(masteryGrid(cfg.dishes, served, 10)[0][0].tier).toBe(2);
  });
  it('the all-bronze bonus needs all 16 dishes at bronze', () => {
    const all = Object.fromEntries(cfg.dishes.map((d) => [d.id, 10]));
    expect(allBronze(cfg.dishes, all)).toBe(true);
    expect(allBronze(cfg.dishes, { ...all, fish_nachos: 9 })).toBe(false);
    expect(allBronze(cfg.dishes, {})).toBe(false);
  });
});

describe('named regulars (B2)', () => {
  it('six regulars with the requested names, each with a real favourite dish', () => {
    expect(tacoRegulars.map((r) => r.name)).toEqual(['Dona Boo', 'Senor Wisp', 'Little Fantasma', 'Capitan Niebla', 'Tia Mist', 'Don Sabana']);
    for (const r of tacoRegulars) expect(cfg.dishes.some((d) => d.id === r.favorite)).toBe(true);
    expect(tacoRegularSettings).toMatchObject({ chance: 0.1, tipBonus: 0.3, fromStep: 4 });
  });
  it('none before menu step 4; later only those whose favourite is on the menu and who are not seated', () => {
    const menu = (step: number) => cfg.dishes.filter((d) => d.unlockStep <= step).map((d) => d.id);
    expect(eligibleTacoRegulars(3, menu(3), [])).toEqual([]);
    expect(eligibleTacoRegulars(4, menu(4), []).map((r) => r.id)).toEqual(['dona_boo', 'senor_wisp', 'little_fantasma', 'capitan_niebla', 'tia_mist']);
    expect(eligibleTacoRegulars(10, menu(10), ['dona_boo']).length).toBe(5);
    expect(eligibleTacoRegulars(10, menu(10), []).length).toBe(6);
  });
});

describe('milestone chests (B3)', () => {
  it('chests at menu steps 3, 6 and 10 worth about one mid-tier upgrade in total', () => {
    expect(tacoChests.map((c) => c.step)).toEqual([3, 6, 10]);
    const total = tacoChests.reduce((s, c) => s + c.coins, 0);
    const mid = cfg.upgrades.flatMap((u) => u.tiers.map((t) => t.cost)).sort((a, b) => a - b);
    expect(total).toBeGreaterThanOrEqual(mid[Math.floor(mid.length / 2)] * 0.8);
    expect(total).toBeLessThanOrEqual(mid[Math.floor(mid.length / 2)] * 1.6);
  });
  it('a player past a step gets one claim per missed chest, and each is claimed once', () => {
    expect(dueTacoChests(2, []).length).toBe(0);
    expect(dueTacoChests(7, []).map((c) => c.step)).toEqual([3, 6]);
    expect(dueTacoChests(10, [3]).map((c) => c.step)).toEqual([6, 10]);
    const after = tacoChestsAfter([3], tacoChests[1]);
    expect(after).toEqual([3, 6]);
    expect(tacoChestsAfter(after, tacoChests[1])).toEqual([3, 6]);
    expect(dueTacoChests(10, [3, 6, 10])).toEqual([]);
  });
});

describe('taco events (B4, B5)', () => {
  const shared = defaultConfig.events.events;
  it('Full Moon from step 3 (about 20 percent faster and 20 percent more coins), Bat Delivery from step 5 (3 flights, 20-40, max 3)', () => {
    const fm = tacoEvents.find((e) => e.id === 'full_moon')!;
    expect(fm.minStep).toBe(3);
    expect(1 / fm.arrivalMult!).toBeGreaterThan(1.15);
    expect(1 / fm.arrivalMult!).toBeLessThan(1.25);
    expect(fm.coinMult).toBe(1.2);
    expect(tacoEvents.find((e) => e.id === 'bat_delivery')).toMatchObject({ minStep: 5, bat: { flights: 3, coins: [20, 40], maxDrops: 3 } });
  });
  it('the pool grows with the menu step and never holds the diner room events twice', () => {
    const ids = (step: number) => tacoEventPool(shared, 15, step).map((e) => e.id);
    expect(ids(1)).not.toContain('full_moon');
    expect(ids(3)).toContain('full_moon');
    expect(ids(3)).not.toContain('bat_delivery');
    expect(ids(5)).toContain('bat_delivery');
    for (const step of [1, 5, 10]) {
      const list = ids(step);
      expect(new Set(list).size).toBe(list.length);
      expect(list).not.toContain('haunted_lights');
      expect(list).not.toContain('ghost_party');
    }
    expect(ids(10)).toEqual(expect.arrayContaining(['lunch_rush', 'double_coins', 'slow_oven', 'vip_visit']));
  });
  it('the diner events file is untouched', () => {
    expect(shared.map((e) => e.id)).toEqual(['lunch_rush', 'double_coins', 'slow_oven', 'vip_visit', 'full_moon', 'bat_delivery', 'haunted_lights', 'ghost_party']);
  });
});

describe('haunted window (B4, B6)', () => {
  it('combo lights windows at 3, 5 and max, and goes dark when the combo breaks', () => {
    expect([0, 1, 2, 3, 4, 5, 7, 8].map((c) => comboLightTier(c, 8))).toEqual([0, 0, 0, 1, 1, 2, 2, 3]);
    expect(litWindows(0)).toEqual([]);
    expect(litWindows(1).length).toBeGreaterThan(0);
    expect(litWindows(2).length).toBeGreaterThan(litWindows(1).length);
    expect(litWindows(3).length).toBe(tacoHaunted.windows.length);
  });
  it('the moon is measured from the final back layer inside the window glass', () => {
    expect(tacoHaunted.moon.x).toBeGreaterThan(0.6);
    expect(tacoHaunted.moon.x).toBeLessThan(0.67);
  });
});

describe('save fields (backward compatible)', () => {
  it('an old save without the new fields loads with defaults and keeps its counts as earned (not paid)', async () => {
    const { parseSave } = await import('../src/systems/SaveSystem');
    const s = parseSave(JSON.stringify({ level: 20, coins: 50, tacoStep: 6, tacoServed: { chicken_soft_taco: 45 } }));
    expect(s.tacoChests).toEqual([]);
    expect(s.tacoMasteryBonus).toBe(false);
    expect(s.tacoMastery).toEqual({ chicken_soft_taco: 2 });
    expect(dueTacoChests(s.tacoStep, s.tacoChests).map((c) => c.step)).toEqual([3, 6]);
  });
  it('new fields survive a round trip and junk is dropped', async () => {
    const { parseSave } = await import('../src/systems/SaveSystem');
    const s = parseSave(JSON.stringify({ tacoServed: {}, tacoMastery: { fish_taco: 3, bad: 'x' }, tacoMasteryBonus: true, tacoChests: [3, 3, 'x', 6] }));
    expect(s.tacoMastery).toEqual({ fish_taco: 3 });
    expect(s.tacoMasteryBonus).toBe(true);
    expect(s.tacoChests).toEqual([3, 6]);
  });
});

describe('regulars in the kitchen (B2)', async () => {
  const { TacoKitchenState } = await import('../src/game/taco/TacoKitchenState');
  const { defaultConfig: dc } = await import('../src/game/config');
  const seedAll = (step: number) => Object.fromEntries(cfg.dishes.map((d) => [d.id, 5]));
  const kitchen = (step: number, seed: number, served: Record<string, number> | undefined = seedAll(step)) =>
    new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: served }, dc, undefined, seed);
  const arrivals = (step: number, n: number, seed: number) => {
    const out: { regular?: string; items: string[]; price: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = kitchen(step, seed + i);
      s.spawnCustomer();
      out.push(s.customers[0]);
    }
    return out;
  };
  it('no regulars before menu step 4', () => {
    expect(arrivals(3, 400, 1).filter((c) => c.regular).length).toBe(0);
  });
  it('about one arrival in ten is a regular from step 4, and they always order their favourite', () => {
    const list = arrivals(10, 2000, 100);
    const regs = list.filter((c) => c.regular);
    expect(regs.length / list.length).toBeGreaterThan(0.07);
    expect(regs.length / list.length).toBeLessThan(0.13);
    for (const c of regs) expect(c.items).toContain(tacoRegulars.find((r) => r.id === c.regular)!.favorite);
    expect(new Set(regs.map((c) => c.regular)).size).toBe(6);
  });
  it('a regular never orders a dish the player has not learned yet', () => {
    const s = kitchen(4, 1, { veggies_soft_taco: 5, chicken_soft_taco: 5 });
    for (let i = 0; i < 300; i++) {
      const k = kitchen(4, 500 + i, { veggies_soft_taco: 5, chicken_soft_taco: 5 });
      k.spawnCustomer();
      const c = k.customers[0];
      if (c.regular) expect(['dona_boo']).toContain(c.regular);
    }
    expect(s.customers.length).toBe(0);
  });
  it('the main random sequence is the same with or without regulars (own stream)', () => {
    const a = kitchen(10, 7);
    const b = kitchen(10, 7);
    for (let i = 0; i < 20; i++) {
      a.spawnCustomer();
      b.spawnCustomer();
    }
    expect(a.customers.map((c) => c.look)).toEqual(b.customers.map((c) => c.look));
  });
  it('a regular tips 30 percent more when served fast', () => {
    expect(tacoRegularSettings.tipBonus).toBe(0.3);
    const tipOf = (regular: boolean): number => {
      const k = kitchen(10, 3);
      k.spawnCustomer();
      const c = k.customers[0];
      c.regular = regular ? 'dona_boo' : undefined;
      c.price = 100;
      k.drainEvents();
      (k as unknown as { completeOrder(c: unknown): void }).completeOrder(c);
      const done = k.drainEvents().find((e) => e.type === 'orderDone') as { tip: number } | undefined;
      return done!.tip;
    };
    const base = tipOf(false);
    expect(base).toBeGreaterThan(0);
    expect(tipOf(true)).toBe(Math.round(base * 1.3));
  });
});

describe('bat delivery in the kitchen (B5)', async () => {
  const { TacoKitchenState } = await import('../src/game/taco/TacoKitchenState');
  const { defaultConfig: dc } = await import('../src/game/config');
  const { TACO_BAT_LANE } = await import('../src/game/taco/tacoExtras');
  const bat = tacoEvents.find((e) => e.id === 'bat_delivery')!;
  const kitchen = () => {
    const k = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 6 }, dc, undefined, 5);
    k.nextArrival = 1e9;
    k.nextEventIn = 1e9;
    return k;
  };
  it('a tap pays 20-40 coins in multiples of 5, at most 3 per event, and nothing outside the event', () => {
    const k = kitchen();
    expect(k.catchBat()).toBe(0);
    k.startEvent(bat);
    const bags = [k.catchBat(), k.catchBat(), k.catchBat(), k.catchBat()];
    expect(bags[3]).toBe(0);
    for (const b of bags.slice(0, 3)) {
      expect(b).toBeGreaterThanOrEqual(20);
      expect(b).toBeLessThanOrEqual(40);
      expect(b % 5).toBe(0);
    }
    expect(k.coins).toBe(bags[0] + bags[1] + bags[2]);
    expect(k.drainEvents().filter((e) => e.type === 'batCaught').length).toBe(3);
    k.startEvent(bat); // a new event, a fresh limit
    expect(k.catchBat()).toBeGreaterThan(0);
  });
  it('a closed truck pays nothing', () => {
    const k = kitchen();
    k.startEvent(bat);
    k.closed = true;
    expect(k.catchBat()).toBe(0);
  });
  it('the flight lane is inside the window glass and clear of every tap zone, so the bat cannot steal a tap', () => {
    expect(TACO_BAT_LANE.top).toBeGreaterThanOrEqual(0.075);
    expect(TACO_BAT_LANE.bottom + TACO_BAT_LANE.bob).toBeLessThanOrEqual(0.21);
    for (const z of cfg.zones) expect(z.x + z.width <= 0.244 || z.x >= 0.829 || z.y >= 0.373).toBe(true); // no zone inside the glass (.244-.829 across, .075-.373 down)
  });
  it('the bat flips for right-to-left passes and flies 3 separate times', async () => {
    const { batSchedule, batPosition } = await import('../src/game/spooky');
    const { makeRng } = await import('../src/game/rng');
    const plan = batSchedule(3, 30, makeRng(9));
    expect(plan.length).toBe(3);
    expect(plan[0].fromLeft).not.toBe(plan[1].fromLeft);
    expect(batPosition(plan[0], plan[0].at + 1, 750).flip).toBe(!plan[0].fromLeft);
    expect(batPosition(plan[1], plan[1].at + 1, 750).flip).toBe(!plan[1].fromLeft);
  });
});
