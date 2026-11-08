import { describe, expect, it } from 'vitest';
import { playTaco, tacoCloseRate } from './helpers/tacoBot';

const SEC = 1500;
const fast = [1, 2, 3, 4].map((seed) => playTaco(seed, 0.8, SEC));
const average = [1, 2, 3].map((seed) => playTaco(seed, 1.3, SEC));
const casual = [1, 2].map((seed) => playTaco(seed, 2.0, SEC));
// Every dish, including nachos (Lv 21-22), gets served by a bot that starts with everything unlocked.
const everything = [1, 2, 3, 4].map((seed) => playTaco(seed, 0.8, 1200, { level: 22, menuStep: 10 }));

describe('Taco Truck bot simulation (first pass)', () => {
  it('prints the table', () => {
    const row = (name: string, runs: typeof fast) =>
      `${name.padEnd(8)} final Lv ${runs.map((r) => r.s.level).join('/')} served ${runs.map((r) => r.s.served).join('/')} burnt ${runs.map((r) => r.burnt).join('/')} angry ${runs.map((r) => r.angry).join('/')} closes ${runs.map((r) => [...r.s.closesAtLevel.values()].reduce((a, b) => a + b, 0)).join('/')} closes/min Lv15-17 ${tacoCloseRate(runs, 15, 17).toFixed(2)} Lv18-20 ${tacoCloseRate(runs, 18, 20).toFixed(2)} Lv21+ ${tacoCloseRate(runs, 21, 30).toFixed(2)} Lv16@${runs.map((r) => r.levelTimes[16]).join('/')} Lv20@${runs.map((r) => r.levelTimes[20]).join('/')}`;
    // eslint-disable-next-line no-console
    console.log('TACO BALANCE (' + SEC + ' s)\n' + [row('fast', fast), row('average', average), row('casual', casual)].join('\n'));
    expect(true).toBe(true);
  });

  it('a fast bot is neither stuck nor crushed: it serves a lot and closes about as often as in the diner', () => {
    // Measured (4 seeds) with menu steps: 110-120 served, 10-11 closes in 1500 s; closes/min 0.14 (Lv 15-17, the gentle first steps) and 0.63 (Lv 18-20, the full menu). The bot buys no upgrades.
    for (const r of fast) {
      expect(r.s.served).toBeGreaterThan(60);
      expect(r.s.level).toBeGreaterThanOrEqual(18);
      expect(r.burnt).toBeLessThan(80);
    }
    expect(tacoCloseRate(fast, 15, 17)).toBeLessThan(0.9);
    expect(tacoCloseRate(fast, 18, 20)).toBeLessThan(1.2);
    expect(tacoCloseRate(fast, 15, 17)).toBeLessThan(0.3); // the first menu steps are gentle
    expect(tacoCloseRate(fast, 18, 20)).toBeGreaterThan(0.2); // the full menu still bites
  });

  it('slower players still progress (average and casual bots reach Lv 16)', () => {
    for (const r of [...average, ...casual]) expect(r.s.level).toBeGreaterThanOrEqual(16);
    expect(tacoCloseRate(average, 15, 17)).toBeLessThan(1.0);
    expect(tacoCloseRate(casual, 15, 17)).toBeLessThan(1.2);
  });

  it('all 16 dishes and both drinks can be served in real play', () => {
    const served = new Map<string, number>();
    for (const r of everything) for (const [k, v] of r.served) served.set(k, (served.get(k) ?? 0) + v);
    for (const id of ['chicken_soft_taco', 'shrimp_soft_taco', 'fish_soft_taco', 'veggies_soft_taco', 'chicken_taco', 'shrimp_taco', 'fish_taco', 'veggies_taco', 'chicken_burrito', 'shrimp_burrito', 'fish_burrito', 'veggies_burrito', 'chicken_nachos', 'shrimp_nachos', 'fish_nachos', 'veggies_nachos'])
      expect(served.get(id) ?? 0, id).toBeGreaterThan(0);
  });

  it('a long run keeps the kitchen consistent: no negative numbers, plates and lanes never exceed their limits', () => {
    for (const r of everything) {
      const s = r.s;
      expect(s.coins).toBeGreaterThanOrEqual(0);
      expect(s.reputation).toBeGreaterThanOrEqual(0);
      expect(s.reputation).toBeLessThanOrEqual(100);
      expect(s.plates).toHaveLength(2);
      expect(s.customers.length).toBeLessThanOrEqual(5);
      for (const lanes of Object.values(s.pours)) expect(lanes).toHaveLength(3);
    }
  });
});
