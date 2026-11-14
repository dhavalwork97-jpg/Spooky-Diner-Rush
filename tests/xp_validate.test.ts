import { describe, expect, it } from 'vitest';
import xpJson from '../data/xp.json';
import { validateXp } from '../src/data/validate';

describe('validateXp', () => {
  it('accepts the shipped xp.json', () => expect(validateXp(xpJson)).toEqual([]));
  it('accepts a file without the early settings (old data)', () => expect(validateXp({ base: 100, perLevel: 80 })).toEqual([]));
  it('needs both early settings together', () => {
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 50 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, earlyUntilLevel: 8 })).toHaveLength(1);
  });
  it('rejects a steeper-than-normal, zero or non-number slope', () => {
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 90, earlyUntilLevel: 8 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 0, earlyUntilLevel: 8 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 'x', earlyUntilLevel: 8 })).toHaveLength(1);
  });
  it('keeps Lv 1-2 out of the early range', () => {
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 50, earlyUntilLevel: 2 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, earlyPerLevel: 50, earlyUntilLevel: 5.5 })).toHaveLength(1);
  });
  it('rejects junk', () => expect(validateXp(null)).toHaveLength(1));
  it('accepts firstLevelXp, and rejects a bad or harder-than-before value', () => {
    expect(validateXp({ base: 100, perLevel: 80, firstLevelXp: 100 })).toEqual([]);
    expect(validateXp({ base: 100, perLevel: 80, firstLevelXp: 0 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, firstLevelXp: 99.5 })).toHaveLength(1);
    expect(validateXp({ base: 100, perLevel: 80, firstLevelXp: 500 })).toHaveLength(1);
  });
});
