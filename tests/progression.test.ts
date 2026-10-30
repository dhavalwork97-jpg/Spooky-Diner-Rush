import { describe, expect, it } from 'vitest';
import { defaultConfig, levelDef, xpForLevel } from '../src/game/config';
import { KitchenState } from '../src/game/KitchenState';
import { SEATS_X } from '../src/views/layout';

const cfg = defaultConfig;
const levels = cfg.progression.levels;
const after = cfg.progression.afterLast;

describe('progression data, Lv 1 to 20', () => {
  it('has one entry for every level from 1 to 20, in order', () => {
    expect(levels.map((l) => l.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  it('never seats more customers than there are seats, and the count never drops', () => {
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i].maxCustomers).toBeLessThanOrEqual(SEATS_X.length);
      if (i > 0) expect(levels[i].maxCustomers).toBeGreaterThanOrEqual(levels[i - 1].maxCustomers);
    }
    expect(levels[19].maxCustomers).toBe(SEATS_X.length);
  });
  it('arrival gaps are valid, and only loosen in the level that adds a customer', () => {
    for (let i = 0; i < levels.length; i++) {
      const [lo, hi] = levels[i].arrivalGap;
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThan(lo);
      if (i === 0) continue;
      const [pl, ph] = levels[i - 1].arrivalGap;
      if (lo > pl || hi > ph) expect(levels[i].maxCustomers, `Lv ${levels[i].level}`).toBeGreaterThan(levels[i - 1].maxCustomers);
    }
  });
  it('patience never rises and never goes under the floor', () => {
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i].patience).toBeGreaterThanOrEqual(after.patienceFloor);
      if (i > 0) expect(levels[i].patience).toBeLessThanOrEqual(levels[i - 1].patience);
    }
  });
  it('orders fit on the plates, and recipes only get added', () => {
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i].orderSize[0]).toBeGreaterThanOrEqual(1);
      expect(levels[i].orderSize[1]).toBeGreaterThanOrEqual(levels[i].orderSize[0]);
      expect(levels[i].orderSize[1]).toBeLessThanOrEqual(cfg.recipes.settings.plateSlots);
      if (i > 0) for (const k of levels[i - 1].items) expect(levels[i].items).toContain(k);
    }
  });
  it('customer type weights name real types, and regular customers stay the biggest group', () => {
    for (const l of levels) {
      if (!l.types) continue;
      const entries = Object.entries(l.types);
      for (const [k, w] of entries) {
        expect(cfg.customers.types[k], `Lv ${l.level}: ${k}`).toBeDefined();
        expect(w).toBeGreaterThanOrEqual(0);
      }
      const total = entries.reduce((n, [, w]) => n + w, 0);
      expect(total).toBeGreaterThan(0);
      expect((l.types.regular ?? 0) / total).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('introduces impatient customers at Lv 11, VIPs at Lv 14 and critics at Lv 16, and never takes one away', () => {
    const first = (type: string) => levels.find((l) => (l.types?.[type] ?? 0) > 0)?.level;
    expect(first('impatient')).toBe(11);
    expect(first('vip')).toBe(14);
    expect(first('critic')).toBe(16);
    for (let i = 1; i < levels.length; i++) {
      for (const [k, w] of Object.entries(levels[i - 1].types ?? {})) if (k !== 'regular' && w > 0) expect(levels[i].types?.[k] ?? 0).toBeGreaterThan(0);
    }
    for (const l of levels.slice(0, 10)) expect(l.types).toBeUndefined(); // Lv 1-10 stay regular only
  });
  it('announces each new customer type and the fourth seat in the unlock text', () => {
    const text = (n: number) => levels[n - 1].unlocks.join(' ').toLowerCase();
    expect(text(11)).toContain('impatient');
    expect(text(13)).toContain('four');
    expect(text(14)).toContain('vip');
    expect(text(16)).toContain('critic');
  });
});

describe('scaling after Lv 20', () => {
  const last = levels[levels.length - 1];
  it('keeps types and order size, and clears the unlock text', () => {
    const d = levelDef(cfg, 35);
    expect(d.types).toEqual(last.types);
    expect(d.orderSize).toEqual(last.orderSize);
    expect(d.maxCustomers).toBe(last.maxCustomers);
    expect(d.unlocks).toEqual([]);
  });
  it('shrinks arrival gaps a little each level, down to the floor and no further', () => {
    const [fLo, fHi] = after.arrivalGapFloor!;
    expect(levelDef(cfg, 20).arrivalGap).toEqual(last.arrivalGap);
    for (let n = 21; n < 200; n++) {
      const a = levelDef(cfg, n - 1).arrivalGap;
      const b = levelDef(cfg, n).arrivalGap;
      expect(b[0]).toBeLessThanOrEqual(a[0]);
      expect(b[1]).toBeLessThanOrEqual(a[1]);
      expect(b[0]).toBeGreaterThanOrEqual(fLo);
      expect(b[1]).toBeGreaterThanOrEqual(fHi);
      expect(b[1]).toBeGreaterThan(b[0]);
    }
    expect(levelDef(cfg, 200).arrivalGap).toEqual([fLo, fHi]);
    expect(levelDef(cfg, 21).arrivalGap[0]).toBeLessThan(last.arrivalGap[0]);
  });
  it('never tightens patience below the floor', () => {
    for (const n of [21, 40, 200]) expect(levelDef(cfg, n).patience).toBeGreaterThanOrEqual(after.patienceFloor);
  });
  it('leaves Lv 1-20 untouched when the gap setting is missing', () => {
    const bare = { ...cfg, progression: { ...cfg.progression, afterLast: { patienceStepPerLevel: -0.5, patienceFloor: 30 } } };
    expect(levelDef(bare, 30).arrivalGap).toEqual(last.arrivalGap);
    expect(levelDef(bare, 7)).toEqual(levelDef(cfg, 7));
  });
});

describe('xp curve for the later levels', () => {
  it('keeps rising by a fixed step', () => {
    for (let n = 1; n < 40; n++) expect(xpForLevel(cfg, n + 1) - xpForLevel(cfg, n)).toBe(cfg.xp.perLevel);
  });
});

describe('the model draws customer types from the level weights', () => {
  const draw = (level: number, n = 400) => {
    const seen: Record<string, number> = {};
    for (let seed = 1; seed <= n; seed++) {
      const s = new KitchenState({ level, xp: 0, coins: 0 }, cfg, seed);
      s.spawnCustomer();
      const c = s.customers[s.customers.length - 1];
      seen[c.type] = (seen[c.type] ?? 0) + 1;
    }
    return seen;
  };
  it('Lv 10 has regular customers only', () => {
    expect(Object.keys(draw(10))).toEqual(['regular']);
  });
  it('Lv 12 has regular and impatient customers, never VIPs or critics', () => {
    const seen = draw(12);
    expect(seen.impatient).toBeGreaterThan(0);
    expect(seen.vip).toBeUndefined();
    expect(seen.critic).toBeUndefined();
  });
  it('Lv 20 has all four types, with regular customers the largest group', () => {
    const seen = draw(20, 600);
    for (const k of ['regular', 'impatient', 'vip', 'critic']) expect(seen[k], k).toBeGreaterThan(0);
    expect(seen.regular).toBeGreaterThan(seen.impatient);
    // close to the data: 64 / 18 / 10 / 8 percent, with room for sampling noise
    expect(seen.regular / 600).toBeGreaterThan(0.55);
    expect(seen.regular / 600).toBeLessThan(0.73);
    expect(seen.critic / 600).toBeLessThan(0.14);
  });
  it('past Lv 20 the same mix applies', () => {
    const seen = draw(40, 300);
    expect(seen.vip).toBeGreaterThan(0);
    expect(seen.critic).toBeGreaterThan(0);
  });
});
