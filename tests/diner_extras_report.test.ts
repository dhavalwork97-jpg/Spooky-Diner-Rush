import { describe, expect, it } from 'vitest';
import { defaultExtras, type Extras } from '../src/game/extras';
import { dinerReport } from './helpers/dinerReport';

/** Prints the Lv 14 economy table between markers when DINER_REPORT=1 (before/after tool for the diner content work). */
describe('diner economy report (before/after tool)', () => {
  it('prints coins and time at Lv 14 when DINER_REPORT=1', () => {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined>; stdout?: { write(s: string): void } } }).process;
    if (env?.env?.DINER_REPORT !== '1') return;
    // MASTERY_FROM=16 reproduces the old start; the default is whatever data/extras.json says. Mastery is ON in both, like the real game.
    const from = Number(env.env.MASTERY_FROM ?? defaultExtras.mastery.fromLevel);
    const extras: Extras = { ...defaultExtras, mastery: { ...defaultExtras.mastery, fromLevel: from } };
    const table = `mastery from Lv ${from}\n` + dinerReport(14, 4200, undefined, extras);
    env.stdout?.write(`\n@@DINER\n${table}\n@@END\n`);
    expect(table).toContain('fast');
  }, 300000);
});
