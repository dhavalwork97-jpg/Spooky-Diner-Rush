import { describe, expect, it } from 'vitest';
import { tacoReport } from './helpers/tacoReport';

/** Prints the menu step 3 / 6 / 10 economy table between markers when TACO_REPORT=1 (before/after tool for the Taco Truck work). */
describe('Taco Truck economy report (before/after tool)', () => {
  it('prints time, coins and XP at menu steps 3, 6 and 10 when TACO_REPORT=1', () => {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined>; stdout?: { write(s: string): void } } }).process;
    if (env?.env?.TACO_REPORT !== '1') return;
    const table = tacoReport(Number(env.env.TACO_SECONDS ?? 3600));
    env.stdout?.write(`\n@@TACO\n${table}\n@@END\n`);
    expect(table).toContain('fast');
  }, 900000);
});
