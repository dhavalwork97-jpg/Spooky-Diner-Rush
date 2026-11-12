import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { defaultTacoConfig as taco } from '../src/game/taco/tacoConfig';
import { LESSON_DONE, lessonDone, lessonMode, lessonShown, seedLearned } from '../src/game/taco/tacoLearning';
import { buyTaco, tacoBuyLabel, tacoEffectText, tacoModsFor } from '../src/game/taco/tacoShop';
import { tapZone } from '../src/game/taco/tacoZones';
import { nextTacoHint, recipeIntro } from '../src/game/taco/tacoTutorial';
import { parseSave } from '../src/systems/SaveSystem';

const ups = taco.upgrades;
const learningState = (step: number, served: Record<string, number> = {}, seed = 3) =>
  new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step, tacoServed: served }, defaultConfig, taco, seed);

describe('Taco Truck upgrades', () => {
  it('has five upgrades with several tiers, rising costs and rising menu requirements', () => {
    expect(ups.length).toBe(5);
    for (const u of ups) {
      expect(u.tiers.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < u.tiers.length; i++) {
        expect(u.tiers[i].cost).toBeGreaterThan(u.tiers[i - 1].cost);
        expect(u.tiers[i].value).toBeGreaterThan(u.tiers[i - 1].value);
        expect(u.tiers[i].step).toBeGreaterThanOrEqual(u.tiers[i - 1].step);
      }
    }
  });

  it('buys a tier, takes the coins, and never changes its inputs', () => {
    const owned = {};
    const r = buyTaco(ups, owned, 'hot_pans', 1, 1000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.owned).toEqual({ hot_pans: 1 });
      expect(r.coins).toBe(1000 - ups.find((u) => u.id === 'hot_pans')!.tiers[0].cost);
    }
    expect(owned).toEqual({});
  });

  it('refuses locked, too-expensive, maxed and unknown purchases', () => {
    expect(buyTaco(ups, {}, 'turbo_oven', 1, 99999)).toEqual({ ok: false, reason: 'locked' });
    expect(buyTaco(ups, {}, 'hot_pans', 1, 5)).toEqual({ ok: false, reason: 'coins' });
    expect(buyTaco(ups, { hot_pans: 4 }, 'hot_pans', 10, 99999)).toEqual({ ok: false, reason: 'maxed' });
    expect(buyTaco(ups, {}, 'nope', 10, 99999)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('a locked tier says which dishes unlock it, and never shows a step number', () => {
    const l = tacoBuyLabel(taco, {}, 'turbo_oven', 1, 99999);
    expect(l.enabled).toBe(false);
    expect(l.needs).toMatch(/^Unlocks with /);
    expect(l.needs).not.toMatch(/\d/);
  });

  it('effect text shows now and next', () => {
    expect(tacoEffectText(ups[0], 0)).toContain('→');
    expect(tacoEffectText(ups[0], ups[0].tiers.length)).not.toContain('→');
  });

  it('a fresh save changes nothing, and owned tiers set the mods', () => {
    const none = tacoModsFor(ups, {});
    expect(none.pourSpeed).toBe(1);
    expect(none.grillSpeed).toBe(1);
    const m = tacoModsFor(ups, { hot_pans: 2, quick_pour: 1, cozy_window: 1, turbo_oven: 1, burn_guard: 1 });
    expect(m.grillSpeed).toBeGreaterThan(1);
    expect(m.pourSpeed).toBeGreaterThan(1);
    expect(m.patience).toBeGreaterThan(1);
    expect(m.ovenSpeed).toBeGreaterThan(1);
    expect(m.burnWindow).toBeGreaterThan(1);
  });

  it('quick pour fills a cup faster', () => {
    const fill = (mult: number) => {
      const s = learningState(1);
      s.mods = { ...s.mods, pourSpeed: mult };
      s.spawnCustomer();
      const d = s.drinks[0];
      s.tapDrinks(d.id);
      let t = 0;
      while (!s.pourReady(d.id, 0) && t < 60) {
        s.update(0.05);
        t += 0.05;
      }
      return t;
    };
    expect(fill(1.65)).toBeLessThan(fill(1));
  });
});

describe('save fields', () => {
  it('an old save loads with learned older dishes and no upgrades', () => {
    const s = parseSave(JSON.stringify({ version: 2, level: 15, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 5, owned: { a: 2 } }));
    expect(s.tacoOwned).toEqual({});
    expect(s.owned).toEqual({ a: 2 });
    expect(s.tacoServed.veggies_soft_taco).toBeGreaterThanOrEqual(taco.learning.practiceServes);
    expect(s.tacoLessons.veggies_soft_taco).toBe(LESSON_DONE);
    expect(s.tacoServed.shrimp_taco).toBeUndefined(); // unlocked at step 5 = the current one: still new
  });

  it('new fields round-trip and corrupt ones are dropped', () => {
    const s = parseSave(JSON.stringify({ tacoOwned: { hot_pans: 2, bad: 'x' }, tacoServed: { a: 4 }, tacoLessons: { a: 9 } }));
    expect(s.tacoOwned).toEqual({ hot_pans: 2 });
    expect(s.tacoServed).toEqual({ a: 4 });
    expect(s.tacoLessons).toEqual({ a: 9 });
    expect(parseSave('{not json').tacoOwned).toEqual({});
  });
});

describe('lesson bookkeeping', () => {
  it('full, then one reminder, then never; done is forever', () => {
    let l = {};
    expect(lessonMode(l, 'x')).toBe('full');
    l = lessonShown(l, 'x');
    expect(lessonMode(l, 'x')).toBe('reminder');
    l = lessonShown(l, 'x');
    expect(lessonMode(l, 'x')).toBeNull();
    expect(lessonMode(lessonDone({}, 'y'), 'y')).toBeNull();
    expect(lessonMode(lessonShown(lessonDone({}, 'y'), 'y'), 'y')).toBeNull();
  });
  it('seedLearned only covers older dishes', () => {
    const { served, lessons } = seedLearned(taco, 4);
    expect(Object.keys(served).sort()).toEqual(taco.dishes.filter((d) => d.unlockStep < 4).map((d) => d.id).sort());
    expect(lessons.chicken_taco).toBeUndefined();
  });
});

describe('customer flow while learning', () => {
  it('legacy mode (no tacoServed) treats every dish as normal', () => {
    const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 4 }, defaultConfig, taco, 1);
    expect(s.learning).toBe(false);
    for (const d of s.dishes) expect(s.familiarity(d.id)).toBe('normal');
  });

  it('a new dish first arrives alone as a single-item order', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const older = Object.fromEntries(taco.dishes.filter((d) => d.unlockStep < 4).map((d) => [d.id, 5]));
      const s = learningState(4, older, seed);
      expect(s.dishes.some((d) => s.familiarity(d.id) === 'intro')).toBe(true);
      s.spawnCustomer();
      const c = s.customers[s.customers.length - 1];
      expect(c.items).toHaveLength(1);
      expect(s.familiarity(c.items[0])).toBe('intro');
      expect(['chicken_taco', 'veggies_taco']).toContain(c.items[0]);
    }
  });

  it('an order never holds two unfamiliar dishes, and unfamiliar dishes are never in big orders', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const older = Object.fromEntries(taco.dishes.filter((d) => d.unlockStep < 3).map((d) => [d.id, 5]));
      const s = learningState(3, { ...older, shrimp_soft_taco: 1, fish_soft_taco: 1 }, seed);
      for (let i = 0; i < 6; i++) {
        s.spawnCustomer();
        const c = s.customers[s.customers.length - 1];
        const unfamiliar = c.items.filter((k) => s.dishDef(k) && s.familiarity(k) !== 'normal');
        expect(unfamiliar.length).toBeLessThanOrEqual(1);
        if (unfamiliar.length) expect(c.items.length).toBeLessThanOrEqual(taco.learning.practiceMaxItems);
      }
    }
  });

  it('following the lesson pointer serves the dish, counts it, and the third serve fires the learned event', () => {
    const s = learningState(1, { veggies_soft_taco: taco.learning.practiceServes - 1 });
    s.mods.patience = 50;
    expect(s.familiarity('veggies_soft_taco')).toBe('practice');
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['veggies_soft_taco'];
    c.delivered = [false];
    let learned = false;
    for (let i = 0; i < 1500 && !learned; i++) {
      s.update(0.1);
      for (const e of s.drainEvents()) if (e.type === 'recipeServed' && e.dish === 'veggies_soft_taco') learned = e.learned;
      const h = nextTacoHint(s, 'veggies_soft_taco');
      if (h?.kind === 'tap') tapZone(s, taco.zones.find((x) => x.id === h.zone)!);
      else if (h?.kind === 'drag') s.serve(taco.zones.find((x) => x.id === h.from)!.index!, h.customer);
    }
    expect(learned).toBe(true);
    expect(s.dishServes.veggies_soft_taco).toBe(taco.learning.practiceServes);
    expect(s.familiarity('veggies_soft_taco')).toBe('normal');
  });

  it('the lesson hint stays on the lesson dish and waits when nobody ordered it', () => {
    const s = learningState(1);
    const h = nextTacoHint(s, 'chicken_soft_taco');
    expect(h?.kind).toBe('wait');
  });

  it('the recipe intro lists the real steps', () => {
    for (const d of taco.dishes) {
      const i = recipeIntro(taco, d);
      expect(i.title).toContain(d.name);
      expect(i.text.length).toBeGreaterThan(10);
    }
  });
});

describe('recipe pointer for every dish', () => {
  for (const d of taco.dishes) {
    it(`${d.id}: the pointer walks the real steps to a served order with no invalid tap`, () => {
      const s = learningState(10, {}, 5);
      s.mods.patience = 80;
      s.spawnCustomer();
      const c = s.customers[0];
      c.items = [d.id];
      c.delivered = [false];
      let served = false;
      for (let i = 0; i < 3000 && !served; i++) {
        s.update(0.1);
        for (const e of s.drainEvents()) {
          expect(e.type).not.toBe('invalid');
          if (e.type === 'recipeServed' && e.dish === d.id) served = true;
        }
        const h = nextTacoHint(s, d.id);
        if (h?.kind === 'tap') tapZone(s, taco.zones.find((x) => x.id === h.zone)!);
        else if (h?.kind === 'drag') s.serve(taco.zones.find((x) => x.id === h.from)!.index!, h.customer);
      }
      expect(served).toBe(true);
    });
  }
});
