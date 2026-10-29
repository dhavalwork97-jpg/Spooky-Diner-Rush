import { describe, expect, it } from 'vitest';
import { KitchenState, type GameEvent } from '../src/game/KitchenState';
import { defaultConfig, type GameConfig } from '../src/game/config';

const run = (s: KitchenState, seconds: number, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) s.update(step);
};
const types = (e: GameEvent[]) => e.map((x) => x.type);

/** A state with one waiting customer who wants one fries, and fries on side plate 4. */
function friesCase(level = 3, seed = 1, cfg: GameConfig = defaultConfig) {
  const s = new KitchenState({ level, xp: 0, coins: 0 }, cfg, seed);
  s.nextEventIn = 1e9; // keep random events out of the way
  s.spawnCustomer();
  const c = s.customers[0];
  c.items = ['fries'];
  c.delivered = [false];
  c.price = 12;
  s.slots[4].item = { id: 900, kind: 'fries', placed: [], building: false };
  return { s, c };
}
/** Serve one fast fries order. */
function fastServe(s: KitchenState) {
  s.spawnCustomer();
  const c = s.customers[s.customers.length - 1];
  c.items = ['fries'];
  c.delivered = [false];
  c.price = 12;
  s.slots[4].item = { id: 901 + s.served, kind: 'fries', placed: [], building: false };
  expect(s.serve(4, c.id)).toBe(true);
  return c;
}

describe('combo', () => {
  it('builds on consecutive fast serves, scales rewards, and caps the multiplier', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 2);
    s.nextEventIn = 1e9;
    const cfg = defaultConfig.combo;
    const mults: number[] = [];
    for (let i = 0; i < 10; i++) {
      s.customers = [];
      s.reputation = 50;
      fastServe(s);
      mults.push(s.comboMultiplier);
    }
    expect(s.combo).toBe(cfg.maxCombo);
    expect(mults[0]).toBe(1);
    expect(mults[2]).toBeCloseTo(1.2, 5);
    expect(Math.max(...mults)).toBeLessThanOrEqual(cfg.maxMultiplier);
  });
  it('pays more coins on a higher combo', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 2);
    s.nextEventIn = 1e9;
    fastServe(s);
    const first = s.coins;
    s.customers = [];
    fastServe(s);
    fastServe(s);
    fastServe(s);
    const before = s.coins;
    fastServe(s);
    expect(s.coins - before).toBeGreaterThan(first);
  });
  it('a slow serve ends the combo', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 2);
    s.nextEventIn = 1e9;
    fastServe(s);
    fastServe(s);
    expect(s.combo).toBe(2);
    s.spawnCustomer();
    const c = s.customers[s.customers.length - 1];
    c.items = ['fries'];
    c.delivered = [false];
    c.patience = c.patienceMax * 0.3;
    s.slots[4].item = { id: 950, kind: 'fries', placed: [], building: false };
    s.drainEvents();
    s.serve(4, c.id);
    expect(s.combo).toBe(0);
    expect(s.drainEvents().some((e) => e.type === 'comboChanged' && e.broken)).toBe(true);
  });
  it('an angry customer leaving breaks the combo and the streak', () => {
    const { s, c } = friesCase();
    s.combo = 4;
    s.streak = 6;
    c.patience = 0.01;
    run(s, 2);
    expect(s.combo).toBe(0);
    expect(s.streak).toBe(0);
  });
  it('a long streak with no burns and no angry customers pays a rare XP bonus', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 2);
    s.nextEventIn = 1e9;
    const events: GameEvent[] = [];
    for (let i = 0; i < defaultConfig.combo.streak.servesNeeded; i++) {
      s.customers = [];
      s.reputation = 50;
      fastServe(s);
      events.push(...s.drainEvents());
    }
    expect(types(events)).toContain('streakBonus');
    expect(s.streak).toBe(0);
  });
});

describe('rush tag and tips', () => {
  it('shows while patience is high and goes away as it drops', () => {
    const { s, c } = friesCase();
    expect(s.isRush(c)).toBe(true);
    c.patience = c.patienceMax * 0.6;
    expect(s.isRush(c)).toBe(false);
  });
  it('a rush serve tips more than a merely fast serve', () => {
    const a = friesCase();
    const b = friesCase();
    b.c.patience = b.c.patienceMax * 0.6; // fast, not rush
    a.s.serve(4, a.c.id);
    b.s.serve(4, b.c.id);
    const tipA = a.s.coins - 12;
    const tipB = b.s.coins - 12;
    expect(a.s.drainEvents().some((e) => e.type === 'orderDone' && e.rush)).toBe(true);
    expect(tipA).toBeGreaterThan(tipB);
  });
  it('no tip when served slowly', () => {
    const { s, c } = friesCase();
    c.patience = c.patienceMax * 0.2;
    s.serve(4, c.id);
    expect(s.coins).toBe(12);
  });
});

describe('wrong item', () => {
  it('snaps back, costs patience, and costs no coins or reputation', () => {
    const { s, c } = friesCase();
    c.items = ['burger'];
    c.delivered = [false];
    const rep = s.reputation;
    const before = c.patience;
    expect(s.serve(4, c.id)).toBe(false);
    expect(c.patience).toBeCloseTo(before - c.patienceMax * defaultConfig.combo.wrongItemPatiencePenalty, 5);
    expect(s.reputation).toBe(rep);
    expect(s.coins).toBe(0);
    expect(s.slots[4].item).not.toBeNull();
  });
});

describe('customer types', () => {
  it('uses data weights, and every type exists in data', () => {
    for (const t of ['regular', 'impatient', 'vip', 'critic']) expect(defaultConfig.customers.types[t]).toBeDefined();
    const cfg: GameConfig = JSON.parse(JSON.stringify(defaultConfig));
    cfg.progression.levels[2].types = { impatient: 1 };
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, cfg, 4);
    s.nextEventIn = 1e9;
    s.spawnCustomer();
    expect(s.customers[0].type).toBe('impatient');
  });
  it('impatient has short patience, VIP pays double with a bigger order, critic costs more reputation', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 5);
    s.nextEventIn = 1e9;
    s.spawnCustomer('impatient');
    s.spawnCustomer('vip');
    const [imp, vip] = s.customers;
    const base = s.levelInfo.patience;
    expect(imp.patienceMax).toBeCloseTo(base * 0.6, 5);
    const single = vip.items.reduce((n, k) => n + defaultConfig.recipes.items[k].price, 0);
    expect(vip.price).toBe(single * 2);
    const s2 = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 5);
    s2.nextEventIn = 1e9;
    s2.spawnCustomer('critic');
    s2.customers[0].patience = 0.01;
    run(s2, 2);
    expect(s2.reputation).toBeCloseTo(defaultConfig.xp.reputation.start - defaultConfig.xp.reputation.angryLeave * 1.5, 5);
  });
});

describe('events', () => {
  const def = (id: string) => defaultConfig.events.events.find((e) => e.id === id)!;
  it('starts at a calm moment after the first delay, one at a time, then ends and repeats', () => {
    const s = new KitchenState({ level: 6, xp: 0, coins: 0 }, undefined, 7);
    s.customers = [];
    s.nextArrival = 1e9; // no customers: always calm
    const log: string[] = [];
    for (let t = 0; t < 900; t += 0.5) {
      s.update(0.5);
      for (const e of s.drainEvents()) {
        if (e.type === 'eventStart') log.push('start:' + e.id);
        if (e.type === 'eventEnd') log.push('end:' + e.id);
      }
      s.customers = [];
    }
    expect(log.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < log.length; i++) expect(log[i].startsWith(i % 2 === 0 ? 'start' : 'end')).toBe(true);
  });
  it('waits while two or more customers are waiting', () => {
    const s = new KitchenState({ level: 6, xp: 0, coins: 0 }, undefined, 7);
    s.nextEventIn = 0;
    s.spawnCustomer();
    s.spawnCustomer();
    s.update(0.1);
    expect(s.event).toBeNull();
  });
  it('respects the level an event unlocks at', () => {
    const s = new KitchenState({ level: 1, xp: 0, coins: 0 }, undefined, 7);
    s.nextEventIn = 0;
    s.update(0.1);
    expect(s.event).toBeNull();
  });
  it('double coins doubles the payout', () => {
    const a = friesCase();
    const b = friesCase();
    b.s.startEvent(def('double_coins'));
    a.c.patience = a.c.patienceMax * 0.2;
    b.c.patience = b.c.patienceMax * 0.2;
    a.s.serve(4, a.c.id);
    b.s.serve(4, b.c.id);
    expect(b.s.coins).toBe(a.s.coins * 2);
  });
  it('slow oven slows baking', () => {
    const s = new KitchenState({ level: 5, xp: 0, coins: 0 }, undefined, 1);
    s.nextEventIn = 1e9;
    s.startEvent(def('slow_oven'));
    s.startPizza();
    run(s, 8.5); // normally ready at 8s
    expect(s.ovens[0]?.phase).toBe('cooking');
  });
  it('lunch rush shortens the gap between arrivals', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 3);
    s.nextEventIn = 1e9;
    s.update(1.2);
    const base = s.nextArrival;
    const t = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 3);
    t.nextEventIn = 1e9;
    t.startEvent(def('lunch_rush'));
    t.update(1.2);
    expect(t.nextArrival).toBeLessThan(base);
  });
  it('VIP visit brings a VIP customer', () => {
    const s = new KitchenState({ level: 6, xp: 0, coins: 0 }, undefined, 3);
    s.nextEventIn = 1e9;
    s.startEvent(def('vip_visit'));
    expect(s.customers.some((c) => c.type === 'vip')).toBe(true);
  });
});

describe('waves', () => {
  it('cycles calm, build, rush, calm and scales arrivals', () => {
    const s = new KitchenState(undefined, undefined, 1);
    const names: string[] = [];
    for (let t = 0; t < 120; t += 1) {
      s.clock = t;
      const n = s.wave.name;
      if (names[names.length - 1] !== n) names.push(n);
    }
    expect(names).toEqual(['calm', 'build', 'rush', 'calm']);
    s.clock = 70;
    expect(s.wave.gapMult).toBeLessThan(1);
  });
});

describe('upgrade hooks (Shop in Milestone 4)', () => {
  it('fryer speed makes frying faster', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.mods.fryerSpeed = 2;
    s.startFry();
    run(s, 2.6);
    expect(s.vats[0]?.phase).toBe('ready');
  });
  it('tip and patience upgrades apply', () => {
    const a = friesCase();
    const b = friesCase();
    b.s.mods.tips = 2;
    a.s.serve(4, a.c.id);
    b.s.serve(4, b.c.id);
    expect(b.s.coins).toBeGreaterThan(a.s.coins);
    const p = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 1);
    p.mods.patience = 1.5;
    p.spawnCustomer();
    expect(p.customers[0].patienceMax).toBeCloseTo(p.levelInfo.patience * 1.5, 5);
  });
});
