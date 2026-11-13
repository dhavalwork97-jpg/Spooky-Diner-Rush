import { defaultConfig, type GameConfig } from '../../src/game/config';
import { play } from './bot';

/**
 * Pacing report for the retention work: a bot at each reaction time plays `seconds` of the diner (no upgrades bought) over several seeds.
 * Shows when each level-up happens (median over the seeds; "-" = not reached by that seed), plus closes and serves, so a pacing change can be
 * compared before and after. Run with `PACING=1 npx vitest run tests/pacing_report.test.ts`.
 */
export const REACTIONS: [string, number][] = [['fast 0.8s', 0.8], ['average 1.5s', 1.5], ['casual 2.5s', 2.5]];
export const SEEDS = [1, 2, 3, 4, 5];

const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

export function pacingReport(seconds = 600, cfg: GameConfig = defaultConfig, maxLevel = 10): string {
  const head = ['bot', ...Array.from({ length: maxLevel - 1 }, (_, i) => `Lv${i + 2}`), 'closes', 'served'];
  const rows: string[][] = [head];
  for (const [name, reaction] of REACTIONS) {
    const runs = SEEDS.map((seed) => play(seed, reaction, seconds, { cfg }));
    const cells = Array.from({ length: maxLevel - 1 }, (_, i) => {
      const lv = i + 2;
      const reached = runs.map((r) => r.levelTimes[lv]).filter((x): x is number => x !== undefined);
      const m = median(reached);
      return m === undefined ? '-' : `${m}s${reached.length < runs.length ? ` (${reached.length}/${runs.length})` : ''}`;
    });
    const closes = runs.reduce((a, r) => a + r.closeLevels.length, 0) / runs.length;
    const served = runs.reduce((a, r) => a + r.s.served, 0) / runs.length;
    rows.push([name, ...cells, closes.toFixed(1), served.toFixed(0)]);
  }
  const widths = head.map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return `Pacing: ${seconds}s, seeds ${SEEDS.join(',')}, median level-up time, closes/served = mean per run\n` + rows.map((r) => r.map((x, c) => x.padEnd(widths[c])).join('  ')).join('\n');
}
