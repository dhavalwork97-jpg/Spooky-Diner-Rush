import { describe, expect, it } from 'vitest';
import assets from '../data/assets.json';

const KEYS = ['cheese', 'onion', 'pickle', 'cheeseburger_cooked', 'garden_burger_cooked', 'deluxe_burger_cooked', 'prep_toppings_tray'];

describe('Recovery 1.0 lazy burger art', () => {
  it('keeps all seven Level 10 burger-variant images out of the initial eager load', () => {
    const defs = (assets as { assets: { key: string; type: string; lazy?: boolean }[] }).assets;
    for (const key of KEYS) {
      const asset = defs.find((a) => a.key === key);
      expect(asset, key).toBeDefined();
      expect(asset?.type, key).toBe('image');
      expect(asset?.lazy, key).toBe(true);
    }
  });
});
