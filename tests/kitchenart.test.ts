import { describe, expect, it } from 'vitest';
import restaurants from '../data/restaurants.json';
import assets from '../data/assets.json';
import { validateAssets } from '../src/data/validate';
import { BURNERS, FRY_FROM, OVENS, OVENS_LIT, SLOTS, SRC_H, SRC_W, VATS } from '../src/views/layout';

const diner = restaurants.restaurants[0];
const zone = (id: string) => {
  const z = diner.zones.find((q) => q.id === id)!;
  return { x: z.x * SRC_W, y: z.y * SRC_H, w: z.width * SRC_W, h: z.height * SRC_H };
};
const inside = (pt: readonly number[], id: string) => {
  const z = zone(id);
  return pt[0] >= z.x && pt[0] <= z.x + z.w && pt[1] >= z.y && pt[1] <= z.y + z.h;
};

describe('new kitchen art layout', () => {
  it('uses the new art size and keeps its aspect ratio', () => {
    expect(diner.backgroundSize).toEqual({ width: 2752, height: 1536 });
    expect(SRC_W / SRC_H).toBeCloseTo(2752 / 1536, 2);
  });
  it('puts every cooking spot inside the zone that owns it', () => {
    VATS.forEach((p) => expect(inside(p, 'fryer_vats'), `vat ${p}`).toBe(true));
    BURNERS.forEach((p) => expect(inside(p, 'grill'), `burner ${p}`).toBe(true));
    OVENS.forEach((p) => expect(inside(p, 'pizza_oven'), `oven ${p}`).toBe(true));
    OVENS_LIT.forEach((p) => expect(inside(p, 'pizza_oven'), `lit oven ${p}`).toBe(true));
  });
  it('starts fries and nuggets from the food painted in their own baskets', () => {
    expect(inside(FRY_FROM.fries, 'fries_bin')).toBe(true);
    expect(inside(FRY_FROM.nuggets, 'nuggets_bin')).toBe(true);
  });
  it('puts the plate slots on the plates: four on the serving counter, two on the side plates', () => {
    SLOTS.slice(0, 4).forEach((p) => expect(inside(p, 'serving_counter'), `slot ${p}`).toBe(true));
    expect(inside(SLOTS[4], 'side_plate')).toBe(true);
    expect(inside(SLOTS[5], 'side_tray')).toBe(true);
  });
});

describe('oven door sheet in the asset manifest', () => {
  it('is a lazy spritesheet with a frame size, and the manifest validates', () => {
    const door = assets.assets.find((a) => a.key === 'oven_door') as { type: string; lazy: boolean; frameWidth: number; frameHeight: number };
    expect(door).toMatchObject({ type: 'spritesheet', lazy: true, frameWidth: 258, frameHeight: 242 });
    expect(validateAssets(assets)).toEqual([]);
  });
  it('rejects a spritesheet without a frame size', () => {
    const errs = validateAssets({ assets: [{ key: 's', type: 'spritesheet', file: 'a.webp', scale: 1 }] });
    expect(errs.join('\n')).toMatch(/frameWidth and frameHeight/);
  });
});
