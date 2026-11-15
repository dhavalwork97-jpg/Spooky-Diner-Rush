import { TacoKitchenState } from '../../src/game/taco/TacoKitchenState';
import { tacoBotStep } from './tacoBot';

/**
 * Economy report for the Taco Truck work: a bot at each reaction time plays the truck from menu step 1 with no upgrades bought, so the coin
 * balance IS the coins earned. When each seed first reaches a menu step it records the time, the coins and the XP; the median is printed.
 * Run with `TACO_REPORT=1 npx vitest run tests/taco_midnight_report.test.ts` and compare before and after a change.
 */
export const TACO_BOTS: [string, number][] = [['fast 0.8s', 0.8], ['average 1.3s', 1.3], ['casual 2.0s', 2.0]];
export const TACO_SEEDS = [1, 2, 3, 4, 5, 6];
export const REPORT_STEPS = [3, 6, 10];

export interface AtStep {
  time: number;
  coins: number;
  xp: number;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** What one bot run had when it first reached each menu step in `steps` (a step it never reached in `seconds` is missing). */
export function reachSteps(seed: number, reaction: number, steps: number[], seconds: number): Map<number, AtStep> {
  const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: 1 }, undefined, undefined, seed);
  const out = new Map<number, AtStep>();
  const dt = 0.1;
  let t = 0;
  let cooldown = 0;
  while (t < seconds && out.size < steps.length) {
    s.update(dt);
    t += dt;
    cooldown -= dt;
    s.drainEvents();
    if (s.closed) {
      s.reopen();
      s.drainEvents();
      continue;
    }
    for (const st of steps) if (s.menuStep >= st && !out.has(st)) out.set(st, { time: Math.round(t), coins: s.coins, xp: s.xp });
    if (cooldown <= 0 && tacoBotStep(s)) cooldown = reaction;
  }
  return out;
}

export function tacoReport(seconds = 3600, steps = REPORT_STEPS): string {
  const lines: string[] = [];
  for (const step of steps) {
    lines.push(`menu step ${step}: bot            reached  median time   median coins (min..max)   median XP`);
    for (const [name, reaction] of TACO_BOTS) {
      const runs = TACO_SEEDS.map((seed) => reachSteps(seed, reaction, [step], seconds).get(step)).filter((r): r is AtStep => r !== undefined);
      if (runs.length === 0) {
        lines.push(`  ${name.padEnd(14)} 0/${TACO_SEEDS.length}      -`);
        continue;
      }
      const coins = runs.map((r) => r.coins);
      lines.push(`  ${name.padEnd(14)} ${runs.length}/${TACO_SEEDS.length}      ${String(median(runs.map((r) => r.time))).padStart(5)} s     ${String(median(coins)).padStart(6)} (${Math.min(...coins)}..${Math.max(...coins)})      ${median(runs.map((r) => r.xp))}`);
    }
  }
  return lines.join('\n');
}
