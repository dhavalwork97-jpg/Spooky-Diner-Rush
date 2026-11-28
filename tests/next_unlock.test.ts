import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg, dinerLevelDef, xpForLevel } from '../src/game/config';
import { levelUpHints, nextUnlock, recipeProgress } from '../src/game/nextUnlock';
import { recipeEntries } from '../src/game/recipebook';

describe('nextUnlock (diner)', () => {
  it('finds the nearest Lv above with an unlock text, and how far away it is', () => {
    for (let lv = 1; lv <= 25; lv++) {
      const n = nextUnlock(cfg, lv);
      if (!n) continue;
      expect(n.level).toBeGreaterThan(lv);
      expect(n.levelsAway).toBe(n.level - lv);
      expect(dinerLevelDef(cfg, n.level).unlocks.length).toBeGreaterThan(0);
      // nothing with an unlock text is skipped
      for (let between = lv + 1; between < n.level; between++) expect(dinerLevelDef(cfg, between).unlocks, `Lv ${between}`).toEqual([]);
    }
  });
  it('points at the new dishes: Lv 9 sees the Cheeseburger at Lv 10, Lv 11 sees the Garden burger at Lv 12, Lv 12 the Deluxe burger at Lv 15', () => {
    expect(nextUnlock(cfg, 9)).toMatchObject({ level: 10, levelsAway: 1 });
    expect(nextUnlock(cfg, 9)!.text).toContain('Cheeseburger');
    expect(nextUnlock(cfg, 11)).toMatchObject({ level: 12 });
    expect(nextUnlock(cfg, 11)!.text).toContain('Garden burger');
    expect(nextUnlock(cfg, 12)).toMatchObject({ level: 14 });
    expect(nextUnlock(cfg, 14)!.text).toContain('Deluxe burger');
  });
  it('is undefined once the diner has nothing left to unlock', () => {
    expect(nextUnlock(cfg, 40)).toBeUndefined();
    expect(nextUnlock(cfg, 200)).toBeUndefined();
  });
});

describe('recipeProgress (diner)', () => {
  it('counts open dishes and names the next locked one', () => {
    const p1 = recipeProgress(cfg, 1);
    expect(p1.total).toBe(recipeEntries(cfg, 1).length);
    expect(p1.unlocked).toBeGreaterThanOrEqual(1);
    expect(p1.next).toBeTruthy();
    expect(p1.next!.unlockLevel).toBeGreaterThan(1);
    expect(p1.next!.levelsAway).toBe(p1.next!.unlockLevel - 1);
  });
  it('the next dish is the locked one with the lowest unlock Lv, and it is open exactly when its Lv is reached', () => {
    const e = recipeEntries(cfg, 1);
    for (let lv = 1; lv <= 22; lv++) {
      const p = recipeProgress(cfg, lv);
      expect(p.unlocked).toBe(e.filter((x) => x.unlockLevel <= lv).length);
      const locked = e.filter((x) => x.unlockLevel > lv);
      if (locked.length === 0) expect(p.next).toBeUndefined();
      else expect(p.next!.unlockLevel).toBe(Math.min(...locked.map((x) => x.unlockLevel)));
    }
  });
  it('every dish is open by Lv 15, so the book shows "all recipes" from then on', () => {
    expect(recipeProgress(cfg, 15).next).toBeUndefined();
    expect(recipeProgress(cfg, 15).unlocked).toBe(recipeProgress(cfg, 15).total);
  });
});

describe('levelUpHints', () => {
  it('names the next unlock and the XP for the next Lv', () => {
    const h = levelUpHints(cfg, 9);
    expect(h[0]).toMatch(/^Next at Lv 10: .*Cheeseburger/);
    expect(h[h.length - 1]).toBe(`${xpForLevel(cfg, 9)} XP to Lv 10`);
  });
  it('past the last unlock only the XP line is left', () => {
    expect(levelUpHints(cfg, 40)).toEqual([`${xpForLevel(cfg, 40)} XP to Lv 41`]);
  });
});
