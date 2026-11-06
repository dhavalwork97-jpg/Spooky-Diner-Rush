import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { KitchenState } from '../src/game/KitchenState';
import { buy, canBuy, modsFor, nextTier, NO_MODS, tierOf } from '../src/game/shop';
import { validateUpgrades } from '../src/data/validate';

const U = defaultConfig.upgrades.upgrades;
const fryer = U.find((u) => u.id === 'fryer_speed')!;

describe('upgrades data', () => {
  it('passes validation', () => {
    expect(validateUpgrades(defaultConfig.upgrades)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const bad = {
      upgrades: [
        { id: 'a', name: 'A', description: 'd', mod: 'nope', unlockLevel: 0, tiers: [{ cost: 10, value: 1.2 }, { cost: 5, value: 1.1 }] },
        { id: 'a', name: 'A', description: 'd', mod: 'tips', unlockLevel: 1, tiers: [] },
      ],
    };
    const errs = validateUpgrades(bad).join('\n');
    expect(errs).toMatch(/unknown mod/);
    expect(errs).toMatch(/unlockLevel/);
    expect(errs).toMatch(/cost must rise/);
    expect(errs).toMatch(/value must rise/);
    expect(errs).toMatch(/duplicate id/);
    expect(errs).toMatch(/at least one tier/);
    expect(validateUpgrades({})).not.toEqual([]);
  });
});

describe('buying', () => {
  it('rejects unknown ids, locked levels and short coins', () => {
    expect(canBuy(U, {}, 'nope', 10, 999)).toEqual({ ok: false, reason: 'unknown' });
    expect(canBuy(U, {}, 'fryer_speed', fryer.unlockLevel - 1, 999)).toEqual({ ok: false, reason: 'locked' });
    expect(canBuy(U, {}, 'fryer_speed', fryer.unlockLevel, fryer.tiers[0].cost - 1)).toEqual({
      ok: false,
      reason: 'coins',
      cost: fryer.tiers[0].cost,
    });
  });

  it('buys tier by tier and takes the coins', () => {
    let owned = {};
    let coins = 1000;
    for (let i = 0; i < fryer.tiers.length; i++) {
      const r = buy(U, owned, 'fryer_speed', 10, coins);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tier).toBe(i + 1);
      expect(r.cost).toBe(fryer.tiers[i].cost);
      expect(r.coins).toBe(coins - fryer.tiers[i].cost);
      owned = r.owned;
      coins = r.coins;
    }
    expect(tierOf(U, owned, 'fryer_speed')).toBe(fryer.tiers.length);
    expect(buy(U, owned, 'fryer_speed', 10, 99999)).toEqual({ ok: false, reason: 'maxed' });
    expect(nextTier(U, owned, 'fryer_speed')).toBeNull();
  });

  it('is pure: inputs are not changed and a failed buy changes nothing', () => {
    const owned = { tips: 1 };
    const r = buy(U, owned, 'fryer_speed', 10, 500);
    expect(owned).toEqual({ tips: 1 });
    expect(r.ok && r.owned).toEqual({ tips: 1, fryer_speed: 1 });
    expect(buy(U, owned, 'fryer_speed', 10, 0).ok).toBe(false);
    expect(owned).toEqual({ tips: 1 });
  });

  it('clamps a tier from an older save to what the data defines', () => {
    expect(tierOf(U, { fryer_speed: 50 }, 'fryer_speed')).toBe(fryer.tiers.length);
    expect(tierOf(U, { fryer_speed: -3 }, 'fryer_speed')).toBe(0);
    expect(tierOf(U, { gone: 2 }, 'gone')).toBe(0);
  });
});

describe('mods from owned upgrades', () => {
  it('a fresh save changes nothing', () => {
    expect(modsFor(U, {})).toEqual(NO_MODS);
  });
  it('sets each mod to the value of the tier owned', () => {
    const m = modsFor(U, { fryer_speed: 2, tips: 3, patience: 1 });
    expect(m.fryerSpeed).toBe(fryer.tiers[1].value);
    expect(m.tips).toBe(U.find((u) => u.id === 'tips')!.tiers[2].value);
    expect(m.patience).toBe(U.find((u) => u.id === 'patience')!.tiers[0].value);
    expect(m.grillSpeed).toBe(1);
    expect(m.ovenSpeed).toBe(1);
  });
  it('every upgrade only ever speeds things up or adds', () => {
    for (const u of U) for (const t of u.tiers) expect(t.value).toBeGreaterThan(1);
  });
});

describe('upgrades change the model', () => {
  const phaseAt = (mods: ReturnType<typeof modsFor>, seconds: number) => {
    const s = new KitchenState({ level: 2, xp: 0, coins: 0 }, defaultConfig, 1);
    s.mods = mods;
    s.startFry('fries');
    for (let t = 0; t < seconds; t += 0.1) s.update(0.1);
    return s.vats[0]?.phase;
  };
  it('a faster fryer has fries ready sooner', () => {
    const top = modsFor(U, { fryer_speed: fryer.tiers.length });
    // readyAfter is 5 s; at x1.5 that is about 3.4 s of real time
    expect(phaseAt(NO_MODS, 3.6)).toBe('cooking');
    expect(phaseAt(top, 3.6)).toBe('ready');
  });
  it('more patience gives customers a longer wait', () => {
    const wait = (mods: ReturnType<typeof modsFor>) => {
      const s = new KitchenState({ level: 2, xp: 0, coins: 0 }, defaultConfig, 1);
      s.mods = mods;
      s.spawnCustomer();
      return s.customers[0].patienceMax;
    };
    const plus = wait(modsFor(U, { patience: 3 }));
    expect(plus).toBeGreaterThan(wait(NO_MODS));
    expect(plus / wait(NO_MODS)).toBeCloseTo(U.find((u) => u.id === 'patience')!.tiers[2].value, 5);
  });
});

describe('buyLabel', () => {
  it('says what the button should show', async () => {
    const { buyLabel } = await import('../src/game/shop');
    const t0 = fryer.tiers[0].cost;
    expect(buyLabel(U, {}, 'fryer_speed', 10, t0)).toEqual({ text: `Buy ${t0}`, enabled: true });
    expect(buyLabel(U, {}, 'fryer_speed', 10, t0 - 1)).toEqual({ text: `${t0} coins`, enabled: false });
    expect(buyLabel(U, {}, 'fryer_speed', 1, 999)).toEqual({ text: `Lv ${fryer.unlockLevel}`, enabled: false });
    expect(buyLabel(U, { fryer_speed: fryer.tiers.length }, 'fryer_speed', 10, 9999)).toEqual({ text: 'Max', enabled: false });
    expect(buyLabel(U, {}, 'nope', 10, 99).enabled).toBe(false);
  });
});

describe('Burn Guard and Calm Kitchen', () => {
  const guard = U.find((u) => u.id === 'burn_guard')!;
  const calm = U.find((u) => u.id === 'calm_kitchen')!;

  it('are in the shop with the agreed levels, tiers and prices', () => {
    expect(guard.unlockLevel).toBe(7);
    expect(guard.tiers.map((t) => t.cost)).toEqual([150, 300, 500]);
    expect(guard.tiers.map((t) => t.value)).toEqual([1.25, 1.5, 1.75]);
    expect(calm.unlockLevel).toBe(11);
    expect(calm.tiers.map((t) => t.cost)).toEqual([250, 450]);
  });

  it('an older save without them changes nothing', () => {
    const m = modsFor(U, { fryer_speed: 2, tips: 1 });
    expect(m.burnWindow).toBe(1);
    expect(m.calm).toBe(1);
  });

  const fryAt = (mods: ReturnType<typeof modsFor>, seconds: number) => {
    const s = new KitchenState({ level: 8, xp: 0, coins: 0 }, defaultConfig, 1);
    s.mods = mods;
    s.startFry('fries');
    for (let t = 0; t < seconds; t += 0.1) s.update(0.1);
    return s;
  };

  it('Burn Guard gives food more time before it burns', () => {
    // fries are ready at 5 s with a 4 s burn window: burnt at about 9 s. At x1.75 the window is 7 s: burnt at about 12 s.
    const top = modsFor(U, { burn_guard: 3 });
    expect(fryAt(NO_MODS, 9.6).vats[0]?.phase).toBe('burnt');
    expect(fryAt(top, 9.6).vats[0]?.phase).not.toBe('burnt');
    expect(fryAt(top, 12.6).vats[0]?.phase).toBe('burnt');
  });

  it('Calm Kitchen lowers the reputation lost to a burn: 8, then 6, then 4', () => {
    const lost = (owned: Record<string, number>) => {
      const s = fryAt(modsFor(U, owned), 0);
      const rep = s.reputation;
      for (let t = 0; t < 14; t += 0.1) s.update(0.1);
      expect(s.vats[0]?.phase).toBe('burnt');
      return rep - s.reputation;
    };
    expect(lost({})).toBe(defaultConfig.recipes.settings.burnReputationPenalty);
    expect(lost({ calm_kitchen: 1 })).toBe(6);
    expect(lost({ calm_kitchen: 2 })).toBe(4);
  });

  it('do not touch the Reopen reputation', () => {
    expect(defaultConfig.xp.reputation.reopenTo).toBe(55);
  });
});
