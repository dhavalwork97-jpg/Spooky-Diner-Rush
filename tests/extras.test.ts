import { describe, it, expect } from 'vitest';
import { defaultExtras, tiersEarned, masteryProgress, localDateKey, dailySpecialFor } from '../src/game/extras';

describe('mastery badges', () => {
  it('earn Bronze, Silver, Gold at 10, 40, 100', () => {
    expect([0, 9, 10, 39, 40, 99, 100, 500].map((n) => tiersEarned(defaultExtras, n))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('reports the best badge and what is next', () => {
    expect(masteryProgress(defaultExtras, 4)).toEqual({ badge: null, next: { name: 'Bronze', remaining: 6 } });
    expect(masteryProgress(defaultExtras, 10)).toEqual({ badge: 'Bronze', next: { name: 'Silver', remaining: 30 } });
    expect(masteryProgress(defaultExtras, 100)).toEqual({ badge: 'Gold', next: null });
  });
});

describe('daily special', () => {
  const menu = ['burger', 'fries', 'soda', 'shake', 'pie'] as never[];
  it('is the same for the same day and differs across days', () => {
    expect(dailySpecialFor('2026-11-08', menu)).toEqual(dailySpecialFor('2026-11-08', menu));
    const days = new Set(Array.from({ length: 20 }, (_, i) => dailySpecialFor(`2026-11-${10 + i}`, menu).join()));
    expect(days.size).toBeGreaterThan(3);
  });
  it('uses different items from the menu and shrinks on a small menu', () => {
    const s = dailySpecialFor('2026-11-08', menu);
    expect(new Set(s).size).toBe(3);
    s.forEach((i) => expect(menu).toContain(i));
    expect(dailySpecialFor('2026-11-08', menu.slice(0, 2))).toHaveLength(2);
    expect(dailySpecialFor('2026-11-08', [])).toEqual([]);
  });
  it('formats the local date', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
