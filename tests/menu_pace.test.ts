import { describe, expect, it } from 'vitest';
import { defaultConfig, xpForLevel } from '../src/game/config';
import { EARLY_STEP_XP_SCALE, menuStepXp } from '../src/game/menuPace';
import { stepXpNeeded } from '../src/game/taco/tacoMenu';
import { pizzaStepXpNeeded } from '../src/game/pizza/pizzaMenu';

describe('early menu steps are faster (Taco Truck and Pizza Place)', () => {
  it('the early steps cost less, getting dearer step by step, and never more than before', () => {
    let prev = 0;
    for (let step = 1; step <= 9; step++) {
      const now = stepXpNeeded(defaultConfig, step);
      expect(now).toBeLessThanOrEqual(xpForLevel(defaultConfig, 14 + step));
      expect(now).toBeGreaterThan(prev);
      prev = now;
    }
  });
  it('the first step is about a third of the old cost', () => {
    expect(stepXpNeeded(defaultConfig, 1)).toBeLessThan(xpForLevel(defaultConfig, 15) / 3 + 5);
    expect(stepXpNeeded(defaultConfig, 1)).toBeGreaterThan(200);
  });
  it('both restaurants use the same pace', () => {
    for (let step = 1; step <= 9; step++) expect(pizzaStepXpNeeded(defaultConfig, step)).toBe(stepXpNeeded(defaultConfig, step));
  });
  it('steps past the list cost the full amount and the scale is sane', () => {
    expect(menuStepXp(defaultConfig, 8, 22)).toBe(xpForLevel(defaultConfig, 22));
    for (const f of EARLY_STEP_XP_SCALE) expect(f).toBeGreaterThan(0.2), expect(f).toBeLessThanOrEqual(1);
  });
  it('the global Lv curve is untouched', () => {
    expect(xpForLevel(defaultConfig, 15)).toBe(1300);
    expect(xpForLevel(defaultConfig, 30)).toBe(2500);
  });
});
