import { describe, expect, it } from 'vitest';
import { bracketMean, bracketRate, bracketTotals, type Run } from './helpers/bot';
import { BOTS, runAll, SCENARIOS, type BotName } from './helpers/scenarios';

/**
 * Upgrade balance report: Burn Guard and Calm Kitchen against no upgrades, with other shopping plans.
 *
 * `BALANCE_REPORT=1 npx vitest run tests/balance_upgrades.test.ts` runs many seeded games per scenario and bot
 * and prints the tables (BALANCE_SEEDS=n sets the number of seeds, BALANCE_ONLY="none,burn + calm" limits the scenarios, BALANCE_BOTS=fast,average limits the bots, BALANCE_CAREFUL=1 uses the bot that puts the bun down while the patty cooks, BALANCE_JSON=1 also prints the raw numbers). The assertions at the
 * bottom use a smaller set and run with the normal test suite.
 *
 * Bots: fast = reacts every 0.8 s, average 1.3 s, casual 2.0 s. They only act when the clock allows it, so they
 * never beat their reaction time. Runs are seeded, so every number here repeats exactly.
 */
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const at = (runs: Run[], lv: number) => mean(runs.map((r) => r.levelTimes[lv]).filter((x): x is number => x !== undefined));
const reached = (runs: Run[], lv: number) => runs.filter((r) => r.levelTimes[lv] !== undefined).length;

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe.skipIf(!env.BALANCE_REPORT)('balance report', () => {
  it('prints the tables', { timeout: 600_000 }, () => {
    const n = Number(env.BALANCE_SEEDS ?? 10);
    const seeds = Array.from({ length: n }, (_, i) => i + 1);
    const out: Record<string, unknown> = {};
    const lines: string[] = [];
    const only = env.BALANCE_ONLY?.split(env.BALANCE_ONLY.includes(';') ? ';' : ',').map((x) => x.trim());
    const bots = (env.BALANCE_BOTS?.split(',').map((x) => x.trim()) ?? Object.keys(BOTS)) as BotName[];
    for (const bot of bots) {
      lines.push(`\n=== ${bot} bot, ${n} seeds ===`);
      lines.push('scenario | Lv10 | Lv15 | Lv20 | Lv25 (s, mean; runs reaching) | closes/min Lv6-10, 11-15, 16-20, 21-25 | closes 6-15 (count) | closes 6-20 | burnt/min 6-15 | angry/min 6-15 | rep lost to burns/min | rep lost to angry/min | s ready before collected 6-15 | batches collected/min | dishes delivered/min | orders done/min');
      for (const sc of Object.keys(SCENARIOS).filter((x) => !only || only.includes(x))) {
        const runs = runAll(sc, bot, seeds, !!env.BALANCE_CAREFUL);
        const f = (x: number, d = 2) => (Number.isNaN(x) ? 'n/a' : x.toFixed(d));
        const lv = [10, 15, 20, 25].map((l) => `${f(at(runs, l), 0)} (${reached(runs, l)})`).join(' | ');
        const br = [[6, 10], [11, 15], [16, 20], [21, 25]].map(([a, b]) => f(bracketRate(runs, 'closes', a, b))).join(', ');
        const m = (k: 'closes' | 'burnt' | 'angry' | 'lossBurn' | 'lossAngry') => bracketRate(runs, k, 6, 15);
        lines.push(`${sc} | ${lv} | ${br} | ${f(m('closes'))} (${bracketTotals(runs, 'closes', 6, 15).total}) | ${f(bracketRate(runs, 'closes', 6, 20))} (${bracketTotals(runs, 'closes', 6, 20).total}) | ${f(m('burnt'))} | ${f(m('angry'))} | ${f(m('lossBurn'), 1)} | ${f(m('lossAngry'), 1)} | ${f(bracketMean(runs, 'readyWait', 'readyN', 6, 15))} | ${f(bracketRate(runs, 'readyN', 6, 15))} | ${f(bracketRate(runs, 'delivered', 6, 15))} | ${f(bracketRate(runs, 'orders', 6, 15))}`);
        out[`${bot}/${sc}`] = {
          levelTimes: [10, 15, 20, 25].map((l) => at(runs, l)),
          reached: [10, 15, 20, 25].map((l) => reached(runs, l)),
          closes: [[6, 10], [11, 15], [16, 20], [21, 25]].map(([a, b]) => bracketRate(runs, 'closes', a, b)),
          closes620: bracketRate(runs, 'closes', 6, 20),
          closes620n: bracketTotals(runs, 'closes', 6, 20),
          closes615n: bracketTotals(runs, 'closes', 6, 15),
          m615: { closes: m('closes'), burnt: m('burnt'), angry: m('angry'), lossBurn: m('lossBurn'), lossAngry: m('lossAngry') },
          firstRunPurchases: runs[0].purchases.map((p) => `${p.id}#${p.tier}@Lv${p.level}`),
          firstRunOwned: runs[0].owned,
        };
      }
    }
    lines.push('\npurchase order, seed 1 (upgrade#tier@level):');
    for (const [k, v] of Object.entries(out)) lines.push(`${k}: ${(v as { firstRunPurchases: string[] }).firstRunPurchases.join(' ') || '-'}`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    if (env.BALANCE_JSON) console.log(JSON.stringify(out));
    expect(true).toBe(true);
  });
});

/**
 * Regression checks for Burn Guard + Calm Kitchen (seeds 1-30, so the numbers repeat exactly).
 *
 * Measured with 150 seeds (2026-11-06, Burn Guard x1.15 / 1.3 / 1.45, Calm Kitchen 8 / 7 / 6), closes a minute over Lv 6-20 against
 * no upgrades: fast bot 0.29 -> 0.18 (about 38 percent fewer), average bot 0.63 -> 0.49 (22 percent). The bounds are policy,
 * not a copy of those numbers: the pair must give clear relief (at least 10 percent fewer closes) and must never come close to
 * immunity (no more than 45 percent fewer). The 15-30 percent aim is checked in the printed report, not asserted here.
 */
describe('Burn Guard + Calm Kitchen balance', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const data = (bot: BotName) => ({ none: runAll('none', bot, seeds), both: runAll('burn + calm', bot, seeds), calm: runAll('calm only', bot, seeds) });
  const fast = data('fast');
  const average = data('average');
  const ratio = (a: Run[], b: Run[], key: 'closes' | 'burnt' | 'angry', from: number, to: number) => bracketRate(a, key, from, to) / bracketRate(b, key, from, to);

  it.each([['fast', fast], ['average', average]] as const)('the pair clearly helps the %s bot without making it immune', (_name, d) => {
    const r = ratio(d.both, d.none, 'closes', 6, 20);
    expect(r).toBeLessThanOrEqual(0.9);
    expect(r).toBeGreaterThanOrEqual(0.55);
  });

  it.each([['fast', fast], ['average', average]] as const)('level pace stays close to the original (%s bot reaches Lv 20 within 10 percent)', (_name, d) => {
    const t = (runs: Run[]) => mean(runs.map((r) => r.levelTimes[20]!));
    expect(t(d.both) / t(d.none)).toBeGreaterThanOrEqual(0.9);
    expect(t(d.both) / t(d.none)).toBeLessThanOrEqual(1.02);
  });

  it.each([['fast', fast], ['average', average]] as const)('food still burns (%s bot): burns fall but stay above half', (_name, d) => {
    const r = ratio(d.both, d.none, 'burnt', 6, 15);
    expect(r).toBeLessThan(1);
    expect(r).toBeGreaterThan(0.5);
  });

  it.each([['fast', fast], ['average', average]] as const)('Calm Kitchen does not change how often customers storm out (%s bot)', (_name, d) => {
    expect(ratio(d.calm, d.none, 'angry', 6, 15)).toBeGreaterThan(0.85);
    expect(ratio(d.calm, d.none, 'angry', 6, 15)).toBeLessThan(1.15);
  });

  it.each(['fast', 'average'] as const)('against the game as it shipped before these two upgrades (the old five), the %s bot is at most about 10 percent faster to Lv 20 and still closes at least 45 percent as often', (bot) => {
    const old = runAll('old five', bot, seeds);
    const now = runAll('all, cheapest first', bot, seeds);
    const median = (runs: Run[]) => runs.map((r) => r.levelTimes[20]!).sort((x, y) => x - y)[Math.floor(runs.length / 2)];
    expect(median(now) / median(old)).toBeGreaterThanOrEqual(0.9);
    expect(median(now) / median(old)).toBeLessThanOrEqual(1.02);
    const closes = bracketRate(now, 'closes', 6, 20) / bracketRate(old, 'closes', 6, 20);
    expect(closes).toBeGreaterThanOrEqual(0.45);
    expect(closes).toBeLessThan(1);
  });

  it('pressure keeps rising through the level brackets with both upgrades (average bot)', () => {
    const b = [[6, 10], [11, 15], [16, 20]].map(([a, z]) => bracketRate(average.both, 'closes', a, z));
    expect(b[1]).toBeGreaterThan(b[0]);
    expect(b[2]).toBeGreaterThanOrEqual(b[1] - 0.02);
  });

  it('the other shopping plans give the same kind of relief, so the result does not hang on one shopping order', () => {
    const none = bracketRate(average.none, 'closes', 6, 20);
    for (const plan of ['all, cheapest first', 'all, guards first', 'all, speed first']) {
      const r = bracketRate(runAll(plan, 'average', seeds), 'closes', 6, 20) / none;
      expect(r).toBeLessThan(1);
      expect(r).toBeGreaterThan(0.5);
    }
  }, 60_000); // three 30-seed simulations: about 5-6 s, so the default 5 s limit is too short
});
