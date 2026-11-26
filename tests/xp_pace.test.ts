import { describe, it } from 'vitest';
import { defaultConfig, type GameConfig } from '../src/game/config';
import { play } from './helpers/bot';

/**
 * XP pace report (Recovery M2). `XP_REPORT=1 npx vitest run tests/xp_pace.test.ts` prints, for each bot,
 * the mean seconds to reach a Lv and the coins the player holds at that moment (they matter for buying a restaurant).
 * XP_SECONDS sets the length of each run, XP_SEEDS the number of seeds. Runs are seeded, so numbers repeat exactly.
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const BOTS: Record<string, number> = { fast: 0.8, average: 1.3, casual: 2.0 };
const LEVELS = [3, 5, 8, 9, 10, 12, 15, 20, 25, 30];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function paceTable(cfg: GameConfig, upgrades: boolean, seconds: number, seeds: number[]): string[] {
  const lines: string[] = [];
  for (const [bot, reaction] of Object.entries(BOTS)) {
    const times: Record<number, number[]> = {};
    const coins: Record<number, number[]> = {};
    for (const seed of seeds) {
      const run = play(seed, reaction, seconds, {
        cfg,
        upgrades,
        onEvent: (e, s, t) => {
          if (e.type === 'levelUp') {
            (times[e.level] ??= []).push(t);
            (coins[e.level] ??= []).push(s.coins);
          }
        },
      });
      void run;
    }
    const f = (x: number) => (Number.isNaN(x) ? '  n/a' : (x / 60).toFixed(1).padStart(5));
    lines.push(`${bot.padEnd(8)} min to Lv ${LEVELS.map((l) => `${l}:${f(mean(times[l] ?? []))}(${(times[l] ?? []).length})`).join('  ')}`);
    lines.push(`${''.padEnd(8)} coins at Lv ${LEVELS.map((l) => `${l}:${String(Math.round(mean(coins[l] ?? []))).padStart(5)}`).join('  ')}`);
  }
  return lines;
}

describe.skipIf(!env.XP_REPORT)('xp pace report', () => {
  it('prints time-to-level and coins', { timeout: 900_000 }, () => {
    const seconds = Number(env.XP_SECONDS ?? 5400);
    const seeds = Array.from({ length: Number(env.XP_SEEDS ?? 4) }, (_, i) => i + 1);
    for (const upgrades of [false, true]) {
      (globalThis as unknown as { process: { stdout: { write: (x: string) => void } } }).process.stdout.write(`\n=== ${upgrades ? 'with shop upgrades' : 'no upgrades'}, ${seeds.length} seeds, ${seconds} s ===\n` + paceTable(defaultConfig, upgrades, seconds, seeds).join('\n') + '\n');
    }
  });
});
