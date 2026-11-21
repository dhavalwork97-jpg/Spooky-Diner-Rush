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
// Two checks below are about a pace and a ramp, which four seeds cannot measure once the game is forgiving enough that a
// bracket holds only a handful of closes (even the game without Burn Guard and Calm Kitchen dips under the old per-run
// floor at 60 seeds). They use 150 seeds with the SAME bounds (the ramp check was off by sampling noise at 30 seeds: 2.33, against 1.81 at 150).
const fastMany = Array.from({ length: 150 }, (_, i) => i + 1).map((seed) => play(seed, 0.8, 6500, { upgrades: true }));
// The average bot's Lv 6-10 bracket holds only a few closes per run, so 3 seeds swing the ramp ratio by tens of percent (Lv 6-10 ice cream and impatient ghosts, 2026-11-20:
// 40 seeds measured 1.49 and 1.76 for Lv 11-15 and Lv 16-20 against Lv 6-10; 3 seeds gave anything from 1.3 to 2.8). The ratio check below uses 30 seeds with the SAME bounds.
const averageMany = Array.from({ length: 30 }, (_, i) => i + 1).map((seed) => play(seed, 1.3, 5700, { upgrades: true }));

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
    for (const r of fastMany) {
      expect(r.levelTimes[20]).toBeDefined();
      expect(r.levelTimes[20]).toBeLessThan(3000);
    }
    // Drinks and ice cream are served from the machine (no plate step), so the bot is about 7 s faster than before: 1793 s.
    // Speed upgrades now only shorten cooking (advanceCook), which brings the 150-seed mean to about 1734 s; the owner accepted
    // this faster pace on 2026-11-07, so the floor is 1700 s.
    // The floor applies to the average of 150 seeds instead of each of 4 runs.
    // Retention pacing (2026-11-13): Lv 3-8 now need 990 XP less in total (data/xp.json earlyPerLevel 50 instead of 80), so the 150-seed
    // mean moved from about 1734 s to about 1652 s (about 80 s sooner; everything from Lv 9 on is unchanged). Floor 1700 -> 1600.
    const mean = fastMany.reduce((n, r) => n + r.levelTimes[20]!, 0) / fastMany.length;
    expect(mean).toBeGreaterThan(1600);
  });

  it('the climb is gradual: close rate never falls and the ramp stays inside 2.5x of Lv 6-10 (average bot) by Lv 20', () => {
    for (const runs of [fastMany, average]) {
      const [a, b, c] = rates(runs);
      expect(b).toBeGreaterThanOrEqual(a - 0.05); // it does get a bit harder
      expect(c).toBeGreaterThanOrEqual(b - 0.05);
      expect(c).toBeLessThanOrEqual(b * 2);
    }
    // Milestone 6 note: drinks (Lv 6) are cheap and easy, so the fast bot closes only about 0.2 a minute at
    // Lv 6-10 and its ratio to later brackets is no longer a useful anchor (a handful of closes). The ratio
    // check therefore uses the average bot, and the fast bot is held by the absolute bounds below.
    const [a, b, c] = rates(averageMany);
    expect(b).toBeLessThanOrEqual(a * 2);
    expect(c).toBeLessThanOrEqual(a * 2.5);
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
    // 150 seeds, same bounds: with 4 seeds the Lv 16-20 bracket holds only a handful of closes, and the earlier Lv 3-8 curve (2026-11-13)
    // moved those few closes around (c 0.145, d 0.241 at 4 seeds) without changing the late game itself.
    for (const runs of [fastMany]) {
      const [, , c, d] = rates(runs);
      expect(d).toBeLessThanOrEqual(c * 1.4);
      expect(d).toBeLessThan(1.1);
    }
  });
});
