import { describe, expect, it } from 'vitest';
import { pacingReport } from './helpers/pacing';

/** Prints the table to stdout between markers when PACING=1 (`PACING=1 npx vitest run tests/pacing_report.test.ts --reporter=basic`). */
describe('pacing report (before/after tool)', () => {
  it('prints the level-up table when PACING=1', () => {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined>; stdout?: { write(s: string): void } } }).process;
    if (env?.env?.PACING !== '1') return;
    const table = pacingReport(600);
    env.stdout?.write(`\n@@PACING\n${table}\n@@END\n`);
    expect(table).toContain('fast');
  }, 120000);
});
