import { describe, expect, it } from 'vitest';
import assets from '../data/assets.json';

const LAZY_BURGER_KEYS = ['cheese', 'onion', 'pickle', 'cheeseburger_cooked', 'garden_burger_cooked', 'deluxe_burger_cooked'];

describe('Recovery 1.0 burger art loading', () => {
  const defs = (assets as { assets: { key: string; type: string; lazy?: boolean }[] }).assets;

  it('keeps Level 10 burger ingredient and dish images out of the initial eager load', () => {
    for (const key of LAZY_BURGER_KEYS) {
      const asset = defs.find((a) => a.key === key);
      expect(asset, key).toBeDefined();
      expect(asset?.type, key).toBe('image');
      expect(asset?.lazy, key).toBe(true);
    }
  });

  it('preloads the replacement toppings tray with the initial kitchen assets', () => {
    const tray = defs.find((a) => a.key === 'prep_toppings_tray');
    expect(tray).toBeDefined();
    expect(tray?.type).toBe('image');
    expect(tray?.lazy).toBe(false);
  });
});
