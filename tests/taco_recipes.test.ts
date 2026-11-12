import { describe, expect, it } from 'vitest';
import { defaultTacoConfig as taco } from '../src/game/taco/tacoConfig';
import { tacoRecipeEntries, recipeStepText } from '../src/game/taco/tacoRecipes';

describe('Taco Truck Recipe Book entries', () => {
  const all = tacoRecipeEntries(taco, 10);
  it('lists all 16 dishes and both drinks', () => {
    expect(all.filter((e) => e.kind === 'dish')).toHaveLength(16);
    expect(all.filter((e) => e.kind === 'drink').map((e) => e.id).sort()).toEqual(['agua_de_jamaica', 'horchata']);
  });
  it('has one instruction per real recipe step, in the real order', () => {
    for (const d of taco.dishes) {
      const e = all.find((x) => x.id === d.id)!;
      expect(e.steps, d.id).toHaveLength(d.steps.length);
      d.steps.forEach((s, i) => expect(e.steps[i]).toBe(recipeStepText(taco, s, i)));
    }
  });
  it('shows prices and XP from the same data the kitchen pays', () => {
    for (const d of taco.dishes) {
      const e = all.find((x) => x.id === d.id)!;
      expect([e.price, e.xp]).toEqual([d.price, d.xp]);
    }
  });
  it('marks dishes not yet on the menu as locked, and unlocks everything at the last step', () => {
    expect(all.every((e) => !e.locked)).toBe(true);
    const first = tacoRecipeEntries(taco, 1);
    expect(first.filter((e) => !e.locked).map((e) => e.id)).toContain('veggies_soft_taco');
    expect(first.find((e) => e.id === 'chicken_nachos')!.locked).toBe(true);
  });
  it('lists the dishes on the menu first', () => {
    const first = tacoRecipeEntries(taco, 1);
    const firstLocked = first.findIndex((e) => e.locked);
    expect(first.slice(firstLocked).every((e) => e.locked)).toBe(true);
  });
  it('step text never shows a menu number', () => {
    for (const e of all) for (const t of e.steps) expect(t).not.toMatch(/\d/);
  });
});
