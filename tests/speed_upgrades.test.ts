import { describe, expect, it } from 'vitest';
import { advanceCook, cookPhase } from '../src/game/cook';
import { defaultConfig } from '../src/game/config';
import { KitchenState } from '../src/game/KitchenState';
import { modsFor, NO_MODS } from '../src/game/shop';
import { bracketMean, bracketRate, type Run } from './helpers/bot';
import { runAll } from './helpers/scenarios';

const U = defaultConfig.upgrades.upgrades;
const items = defaultConfig.recipes.items;
const SPEED = modsFor(U, { fryer_speed: 3, grill_speed: 3, oven_speed: 3 });

describe('advanceCook', () => {
  it('without a speed-up it is plain time', () => {
    expect(advanceCook(0, 0.5, 1, 5)).toBeCloseTo(0.5);
    expect(advanceCook(6, 0.5, 1, 5)).toBeCloseTo(6.5);
  });
  it('a speed-up only works while the food is still cooking', () => {
    expect(advanceCook(0, 1, 1.5, 5)).toBeCloseTo(1.5); // cooking: faster
    expect(advanceCook(5, 1, 1.5, 5)).toBeCloseTo(6); // ready: real time
    expect(advanceCook(7, 1, 2, 5)).toBeCloseTo(8);
  });
  it('a step that crosses the ready line is split: cooking part at the speed, the rest in real time', () => {
    // 4 cook seconds left, speed x2: done after 2 real seconds, the remaining 1 s of a 3 s step is real time
    expect(advanceCook(1, 3, 2, 5)).toBeCloseTo(6);
  });
  it('after-ready rate is kept for events, and a stopped station stays put', () => {
    expect(advanceCook(6, 1, 1.5, 5, 0.7)).toBeCloseTo(6.7);
    expect(advanceCook(2, 1, 0, 5)).toBe(2);
  });
  it('the same total time however the seconds are sliced', () => {
    let a = 0;
    for (let i = 0; i < 100; i++) a = advanceCook(a, 0.1, 1.5, 5);
    const b = advanceCook(0, 10, 1.5, 5);
    expect(a).toBeCloseTo(b, 6);
  });
});

type Station = 'vat' | 'burner' | 'oven';
const cfgOf = { vat: { ready: items.fries.readyAfter!, window: items.fries.burnWindow }, burner: { ready: items.burger.sideSeconds!, window: items.burger.burnWindow }, oven: { ready: items.pizza.readyAfter!, window: items.pizza.burnWindow } };

/** Real seconds at which a station reaches each phase (Lv 8, so no beginner bonus). */
function timeline(mods: ReturnType<typeof modsFor>, station: Station, eventId?: string) {
  const s = new KitchenState({ level: 8, xp: 0, coins: 0 }, defaultConfig, 1);
  s.mods = mods;
  if (eventId) s.event = { def: defaultConfig.events.events.find((e) => e.id === eventId)!, remaining: 999 };
  if (station === 'vat') s.startFry('fries');
  else if (station === 'burner') s.startPatty();
  else s.startPizza();
  const at: Partial<Record<string, number>> = {};
  for (let t = 0; t < 40; t += 0.01) {
    s.update(0.01);
    const p = (station === 'vat' ? s.vats[0] : station === 'burner' ? s.burners[0] : s.ovens[0])?.phase;
    if (p && at[p] === undefined) at[p] = t + 0.01;
    if (p === 'burnt') break;
  }
  return at as Record<'ready' | 'warning' | 'danger' | 'burnt', number>;
}

describe.each(['vat', 'burner', 'oven'] as const)('speed upgrades at the %s', (station) => {
  const base = timeline(NO_MODS, station);
  const fast = timeline(SPEED, station);
  const speed = station === 'vat' ? SPEED.fryerSpeed : station === 'burner' ? SPEED.grillSpeed : SPEED.ovenSpeed;
  const { ready, window } = cfgOf[station];

  it('cook the food faster', () => {
    expect(base.ready).toBeCloseTo(ready, 1);
    expect(fast.ready).toBeCloseTo(ready / speed, 1);
    expect(fast.ready).toBeLessThan(base.ready * 0.8);
  });

  it('leave the real-time window from ready to burnt exactly as it was', () => {
    expect(base.burnt - base.ready).toBeCloseTo(window, 1);
    expect(fast.burnt - fast.ready).toBeCloseTo(window, 1);
  });

  it('keep warning at 50 percent and danger at 75 percent of that window, and still burn', () => {
    expect(fast.warning - fast.ready).toBeCloseTo(window * 0.5, 1);
    expect(fast.danger - fast.ready).toBeCloseTo(window * 0.75, 1);
    expect(fast.burnt).toBeDefined();
  });

  it('leave Burn Guard in charge of the window, whatever the speed', () => {
    const both = timeline({ ...SPEED, burnWindow: 1.45 }, station);
    expect(both.burnt - both.ready).toBeCloseTo(window * 1.45, 1);
    const guardOnly = timeline({ ...NO_MODS, burnWindow: 1.45 }, station);
    expect(both.burnt - both.ready).toBeCloseTo(guardOnly.burnt - guardOnly.ready, 1);
  });
});

describe('the Slow oven event is unchanged', () => {
  it('still slows both the bake and the time before it burns', () => {
    const slow = timeline(NO_MODS, 'oven', 'slow_oven');
    const rate = defaultConfig.events.events.find((e) => e.id === 'slow_oven')!.ovenSpeed!;
    expect(slow.ready).toBeCloseTo(items.pizza.readyAfter! / rate, 1);
    expect(slow.burnt - slow.ready).toBeCloseTo(items.pizza.burnWindow / rate, 1);
  });
  it('and an oven speed upgrade only speeds up the bake during the event', () => {
    const slow = timeline(NO_MODS, 'oven', 'slow_oven');
    const upgraded = timeline(SPEED, 'oven', 'slow_oven');
    expect(upgraded.ready).toBeLessThan(slow.ready);
    expect(upgraded.burnt - upgraded.ready).toBeCloseTo(slow.burnt - slow.ready, 1);
  });
});

describe('cookPhase itself is unchanged', () => {
  it('fries (ready 5 s, window 4 s): ready, warning at 7 s, danger at 8 s, burnt at 9 s', () => {
    const at = (t: number) => cookPhase(t, 5, 4);
    expect([4.9, 5, 6.9, 7, 7.9, 8, 8.9, 9].map(at)).toEqual(['cooking', 'ready', 'ready', 'warning', 'warning', 'danger', 'danger', 'burnt']);
  });
});

/**
 * The simulation checks. Before the fix, buying only speed upgrades gave far MORE closes than buying nothing
 * (fast bot x1.6, average bot x1.24 over Lv 6-20) because the same multiplier shortened the real-time window before food burns.
 * Seeds 1-40, identical for every scenario, so the numbers repeat exactly.
 */
describe('speed upgrades in the simulation', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  const closes = (runs: Run[]) => bracketRate(runs, 'closes', 6, 20);
  const burnt = (runs: Run[]) => bracketRate(runs, 'burnt', 6, 15);
  const lv20 = (runs: Run[]) => runs.reduce((n, r) => n + r.levelTimes[20]!, 0) / runs.length;
  const fast = { none: runAll('none', 'fast', seeds), speed: runAll('speed only', 'fast', seeds), fryer: runAll('fryer speed only', 'fast', seeds), oven: runAll('oven speed only', 'fast', seeds) };
  const average = { none: runAll('none', 'average', seeds), speed: runAll('speed only', 'average', seeds) };
  const careful = { none: runAll('none', 'fast', seeds, true), speed: runAll('speed only', 'fast', seeds, true) };

  it('fryer and oven upgrades are neutral for closes', () => {
    expect(closes(fast.fryer) / closes(fast.none)).toBeLessThan(1.1);
    expect(closes(fast.oven) / closes(fast.none)).toBeLessThan(1.1);
  });

  it('all three do not push closes up the way they used to (fast and average bot)', () => {
    expect(closes(fast.speed) / closes(fast.none)).toBeLessThan(1.4);
    expect(closes(average.speed) / closes(average.none)).toBeLessThan(1.15);
  });

  it('a player who puts the bun down while the patty cooks gets no more closes from speed upgrades', () => {
    expect(closes(careful.speed) / closes(careful.none)).toBeLessThan(1.05);
  });

  it('food sits ready for about as long before it is collected (it used to drop by a third)', () => {
    expect(bracketMean(fast.speed, 'readyWait', 'readyN', 6, 15) / bracketMean(fast.none, 'readyWait', 'readyN', 6, 15)).toBeGreaterThan(0.85);
  });

  it('they still bring a measurable benefit: Lv 20 comes at least 3 percent sooner', () => {
    expect(lv20(fast.speed) / lv20(fast.none)).toBeLessThan(0.97);
    expect(lv20(average.speed) / lv20(average.none)).toBeLessThan(0.99);
  });

  it('food still burns with every speed upgrade (burn risk is not removed)', () => {
    expect(burnt(fast.speed) / burnt(fast.none)).toBeGreaterThan(0.8);
    expect(burnt(average.speed) / burnt(average.none)).toBeGreaterThan(0.8);
  });
});
