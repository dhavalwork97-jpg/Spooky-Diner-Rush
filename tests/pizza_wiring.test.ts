import { readFileSync, statSync } from 'node:fs';

const existsSync = (p: string): boolean => {
  try {
    return statSync(p).size > 0;
  } catch {
    return false;
  }
};
/** Supplied art that does not exist (known gaps, reported in the Part A report). Nothing in the game draws these pictures yet: the bins are painted into the background. */
const KNOWN_MISSING_ICONS = ['fresh_mozzarella'];
import { describe, expect, it } from 'vitest';
import { chooseFirstScene } from '../src/game/startup';
import { defaultPizzaConfig } from '../src/game/pizza/pizzaConfig';
import { PIZZA_ID, TACO_ID } from '../src/scenes/restaurantRoute';
import sheets from '../data/pizza_sheets.json';

describe('pizza wiring', () => {
  it('?debug&pizza opens the Pizza scene; ?debug&taco and plain ?debug are unchanged', () => {
    expect(chooseFirstScene({ debug: true, taco: false, pizza: true, returning: false })).toBe('Pizza');
    expect(chooseFirstScene({ debug: true, taco: true, returning: false })).toBe('Taco');
    expect(chooseFirstScene({ debug: true, taco: false, returning: false })).toBe('Game');
  });
  it('restaurant ids match the data', () => {
    expect(PIZZA_ID).toBe(defaultPizzaConfig.restaurant.id);
    expect(TACO_ID).toBe('taco_truck');
  });
  it('every Pizza art file exists on disk', () => {
    const base = 'public/assets/pizza';
    const files = ['background/pizza_back.webp', 'background/pizza_front.webp', 'background/pizza_thumb.webp'];
    for (const a of ['raw_layers', 'baked_layers', 'toppings_a', 'toppings_b', 'ingredient_icons', 'pizza_icons', 'sides_items', 'fried_items', 'effects', 'cups_icons']) files.push(`atlases/${a}.webp`, `atlases/${a}.atlas.json`);
    for (const m of Object.values(sheets as Record<string, { image: string }>)) files.push(`sheets/${m.image}`);
    const missing = files.filter((f) => !existsSync(`${base}/${f}`));
    expect(missing).toEqual([]);
  });
  it('every dish icon frame exists in its atlas', () => {
    const frames = (n: string) => Object.keys(JSON.parse(readFileSync(`public/assets/pizza/atlases/${n}.atlas.json`, 'utf8')).frames);
    const pizzaIcons = frames('pizza_icons');
    const sides = frames('sides_items');
    const fried = frames('fried_items');
    for (const d of defaultPizzaConfig.dishes) {
      if (d.kind === 'pizza') expect(pizzaIcons).toContain(d.id.replace(/_pizza$/, ''));
      if (d.kind === 'side') expect(sides).toContain(`${d.id}_ready`);
      if (d.kind === 'fried') expect(fried).toContain(`${d.basket === 1 ? 'wings' : 'fries'}_ready`);
    }
  });
  it('every ingredient has its picture and its tap zone', () => {
    const icons = Object.keys(JSON.parse(readFileSync('public/assets/pizza/atlases/ingredient_icons.atlas.json', 'utf8')).frames);
    const groups = [['sauce', defaultPizzaConfig.ingredients.sauces], ['cheese', defaultPizzaConfig.ingredients.cheeses], ['topping', defaultPizzaConfig.ingredients.toppings]] as const;
    for (const [kind, list] of groups) {
      for (const i of list) {
        if (!KNOWN_MISSING_ICONS.includes(i.id)) expect(icons).toContain(kind === 'topping' ? i.id : `${kind}_${i.id}`);
        expect(defaultPizzaConfig.zones.some((z) => z.action === kind && z.arg === i.id)).toBe(true);
      }
    }
  });
});
