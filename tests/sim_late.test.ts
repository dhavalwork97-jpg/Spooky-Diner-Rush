import { describe, expect, it } from 'vitest';
import { closeRate, play } from './helpers/bot';

/**
 * Milestone 5 balance simulation: Lv 11 to 20 and the scaling after Lv 20.
 *
 * The bot never acts faster than its reaction time (0.8 s fast, 1.3 s average, 2.0 s casual) and buys
 * the cheapest upgrade it can afford. Runs are seeded, so the numbers below are exact for the current
 * data. Bounds were set from the measured runs with margin; if the data changes on purpose, rerun and
 * re-set them from the printed table. The measure that matters is closes per minute, not per level
 * (levels get longer, so per-level counts would hide the real ramp).
 *
 * Measured at the time of writing (5 seeds): fast bot Lv 20 at about 2170-2420 s, closes per minute
 * 0.37 (Lv 6-10), 0.56 (Lv 11-15), 0.70 (Lv 16-20), 0.82 (Lv 21-25). Average bot Lv 20 at about
 * 4460-5090 s, 0.64 / 0.86 / 0.89 / 0.93.
 */
const fast = [1, 2, 3, 4].map((seed) => play(seed, 0.8, 6500, { upgrades: true }));
const average = [1, 2, 3].map((seed) => play(seed, 1.3, 5700, { upgrades: true }));
const casual = [1, 2].map((seed) => play(seed, 2.0, 4800, { upgrades: true }));

const rates = (runs: typeof fast) => [closeRate(runs, 6, 10), closeRate(runs, 11, 15), closeRate(runs, 16, 20), closeRate(runs, 21, 25)];
const times = (runs: typeof fast, lv: number) => runs.map((r) => r.levelTimes[lv]);

describe('Lv 11-20 balance simulation', () => {
  it('prints the balance table', () => {
    const row = (name: string, runs: typeof fast) =>
      `${name.padEnd(8)} Lv15@${times(runs, 15).join('/')} Lv20@${times(runs, 20).join('/')} closes/min Lv6-10, 11-15, 16-20, 21-25: ${rates(runs).map((x) => (Number.isNaN(x) ? 'n/a' : x.toFixed(2))).join(', ')} final Lv ${runs.map((r) => r.s.level).join('/')}`;
    // eslint-disable-next-line no-console
    console.log('LATE BALANCE\n' + [row('fast', fast), row('average', average), row('casual', casual)].join('\n'));
    expect(true).toBe(true);
  });

  it('a fast bot reaches Lv 20 in 30 to 50 minutes', () => {
    for (const r of fast) {
      expect(r.levelTimes[20]).toBeDefined();
      expect(r.levelTimes[20]).toBeGreaterThan(1800);
      expect(r.levelTimes[20]).toBeLessThan(3000);
    }
  });

  it('the climb is gradual: close rate rises by bracket, but never more than 2.5x the Lv 6-10 rate by Lv 20', () => {
    for (const runs of [fast, average]) {
      const [a, b, c] = rates(runs);
      expect(b).toBeGreaterThanOrEqual(a - 0.05); // it does get a bit harder
      expect(b).toBeLessThanOrEqual(a * 2);
      expect(c).toBeGreaterThanOrEqual(b - 0.05);
      expect(c).toBeLessThanOrEqual(a * 2.5);
    }
  });

  it('a fast bot rarely closes: under 0.8 closes a minute at Lv 11-15 and under 1.0 at Lv 16-20', () => {
    const [, b, c] = rates(fast);
    expect(b).toBeLessThan(0.8);
    expect(c).toBeLessThan(1.0);
  });

  it('an average bot keeps progressing: Lv 15 inside 55 minutes, Lv 20 inside 95 minutes, under 1.1 closes a minute', () => {
    for (const r of average) {
      expect(r.levelTimes[15]).toBeLessThan(3300);
      expect(r.levelTimes[20]).toBeLessThan(5700);
    }
    const [, b, c] = rates(average);
    expect(b).toBeLessThan(1.0);
    expect(c).toBeLessThan(1.1);
  });

  it('a casual bot is slowed down but not shut out: Lv 12 inside 50 minutes, Lv 15 inside 80, under 1.1 closes a minute', () => {
    for (const r of casual) {
      expect(r.levelTimes[12]).toBeLessThan(3000);
      expect(r.levelTimes[15]).toBeDefined();
      expect(r.levelTimes[15]).toBeLessThan(4800);
    }
    expect(closeRate(casual, 6, 10)).toBeLessThan(1.1);
  });
});

describe('scaling after Lv 20', () => {
  it('a fast bot keeps levelling past Lv 25 inside 70 minutes', () => {
    for (const r of fast) {
      expect(r.levelTimes[25]).toBeDefined();
      expect(r.levelTimes[25]).toBeLessThan(4200);
    }
  });
  it('close rate at Lv 21-25 is at most 1.4x the rate at Lv 16-20 and stays under 1.1 a minute', () => {
    for (const runs of [fast]) {
      const [, , c, d] = rates(runs);
      expect(d).toBeLessThanOrEqual(c * 1.4);
      expect(d).toBeLessThan(1.1);
    }
  });
});
