import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { recipeEntries } from '../src/game/recipebook';
import { validateRecipeBook } from '../src/data/validate';

const cfg = defaultConfig;
const ids = Object.keys(cfg.recipes.items);

describe('recipe book data', () => {
  it('passes validation and covers every menu item', () => {
    expect(validateRecipeBook(cfg.recipebook, ids)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateRecipeBook({ entries: [{ id: 'fries', steps: [] }, { id: 'fries', steps: ['x'.repeat(90)] }, { id: 'soup', steps: ['ok'] }] }, ids).join('\n');
    expect(errs).toMatch(/needs 1 to 5 steps/);
    expect(errs).toMatch(/duplicate id/);
    expect(errs).toMatch(/over 80/);
    expect(errs).toMatch(/not a menu item/);
    expect(errs).toMatch(/missing from recipebook/);
    expect(validateRecipeBook({}, ids)).not.toEqual([]);
  });
});

describe('recipeEntries', () => {
  it('lists every item with its steps, easiest first', () => {
    const e = recipeEntries(cfg, 1);
    expect(e.map((x) => x.id).sort()).toEqual([...ids].sort());
    expect(e.map((x) => x.unlockLevel)).toEqual([...e.map((x) => x.unlockLevel)].sort((a, b) => a - b));
    for (const x of e) expect(x.steps.length).toBeGreaterThan(0);
  });
  it('locks items above the player level and unlocks them at their level', () => {
    const burger = cfg.recipes.items.burger.unlockLevel;
    expect(recipeEntries(cfg, burger - 1).find((x) => x.id === 'burger')!.locked).toBe(true);
    expect(recipeEntries(cfg, burger).find((x) => x.id === 'burger')!.locked).toBe(false);
    expect(recipeEntries(cfg, 1).find((x) => x.id === 'fries')!.locked).toBe(false);
  });
  it('carries price and xp from recipes.json', () => {
    const f = recipeEntries(cfg, 99).find((x) => x.id === 'fries')!;
    expect(f.price).toBe(cfg.recipes.items.fries.price);
    expect(f.xp).toBe(cfg.recipes.items.fries.xp);
  });
});
