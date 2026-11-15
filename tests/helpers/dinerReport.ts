import { defaultConfig, type GameConfig } from '../../src/game/config';
import type { Extras } from '../../src/game/extras';
import { play } from './bot';

/**
 * Economy report for the diner content work (Lv 1-14): a bot at each reaction time plays the diner with no upgrades bought, so the coin
 * balance IS the coins earned. At the moment each seed reaches Lv 14 it records the time, the coins and the XP, then prints the median.
 * Run with `DINER_REPORT=1 npx vitest run tests/diner_extras_report.test.ts` and compare before and after a change.
 */
export const DINER_BOTS: [string, number][] = [['fast 0.8s', 0.8], ['average 1.5s', 1.5], ['casual 2.5s', 2.5]];
export const DINER_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

export interface AtLevel {
  time: number;
  coins: number;
  xp: number;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** What one bot run had when it reached `level` (undefined when it never got there in `seconds`). */
export function reachLevel(seed: number, reaction: number, level: number, seconds: number, cfg: GameConfig = defaultConfig, extras?: Extras): AtLevel | undefined {
  let at: AtLevel | undefined;
  play(seed, reaction, seconds, {
    cfg,
    extras,
    onEvent: (e, s, t) => {
      if (e.type === 'levelUp' && e.level === level && !at) at = { time: Math.round(t), coins: s.coins, xp: s.xp };
    },
  });
  return at;
}

export function dinerReport(level = 14, seconds = 1500, cfg: GameConfig = defaultConfig, extras?: Extras): string {
  const lines = [`bot            reached  median time   coins at Lv ${level}   (min..max)`];
  for (const [name, reaction] of DINER_BOTS) {
    const runs = DINER_SEEDS.map((seed) => reachLevel(seed, reaction, level, seconds, cfg, extras)).filter((r): r is AtLevel => r !== undefined);
    if (runs.length === 0) {
      lines.push(`${name.padEnd(14)} 0/${DINER_SEEDS.length}      -`);
      continue;
    }
    const coins = runs.map((r) => r.coins);
    lines.push(`${name.padEnd(14)} ${runs.length}/${DINER_SEEDS.length}      ${String(median(runs.map((r) => r.time))).padStart(5)} s      ${String(median(coins)).padStart(6)}          ${Math.min(...coins)}..${Math.max(...coins)}`);
  }
  return lines.join('\n');
}
