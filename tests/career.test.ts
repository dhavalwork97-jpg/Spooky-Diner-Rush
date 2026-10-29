import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { nextTitle, titleEarnedAt, titleForLevel } from '../src/game/career';
import { validateCareer } from '../src/data/validate';

const cfg = defaultConfig;
const bands = cfg.career.titles;

describe('career data', () => {
  it('passes validation', () => {
    expect(validateCareer(cfg.career)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateCareer({ titles: [{ minLevel: 2, title: 'A' }, { minLevel: 2, title: '' }, { minLevel: 1.5, title: 'x'.repeat(30) }] }).join('\n');
    expect(errs).toMatch(/first band must start at Lv 1/);
    expect(errs).toMatch(/minLevel must rise/);
    expect(errs).toMatch(/1 to 24 characters/);
    expect(errs).toMatch(/whole number/);
    expect(validateCareer({})).not.toEqual([]);
  });
});

describe('titleForLevel', () => {
  it('starts with the first band', () => {
    expect(titleForLevel(cfg, 1).title).toBe(bands[0].title);
  });
  it('changes exactly on a band edge', () => {
    for (let i = 1; i < bands.length; i++) {
      expect(titleForLevel(cfg, bands[i].minLevel - 1).title).toBe(bands[i - 1].title);
      expect(titleForLevel(cfg, bands[i].minLevel).title).toBe(bands[i].title);
    }
  });
  it('keeps the top title forever', () => {
    expect(titleForLevel(cfg, 9999).title).toBe(bands[bands.length - 1].title);
  });
});

describe('nextTitle and titleEarnedAt', () => {
  it('nextTitle points at the next band and is null at the top', () => {
    expect(nextTitle(cfg, 1)?.minLevel).toBe(bands[1].minLevel);
    expect(nextTitle(cfg, bands[1].minLevel)?.minLevel).toBe(bands[2].minLevel);
    expect(nextTitle(cfg, bands[bands.length - 1].minLevel)).toBeNull();
  });
  it('titleEarnedAt fires only on a band edge, never at Lv 1', () => {
    expect(titleEarnedAt(cfg, 1)).toBeNull();
    expect(titleEarnedAt(cfg, bands[1].minLevel)?.title).toBe(bands[1].title);
    expect(titleEarnedAt(cfg, bands[1].minLevel + 1)).toBeNull();
    const edges = [...Array(60).keys()].map((i) => i + 1).filter((l) => titleEarnedAt(cfg, l));
    expect(edges).toEqual(bands.slice(1).map((b) => b.minLevel));
  });
});
