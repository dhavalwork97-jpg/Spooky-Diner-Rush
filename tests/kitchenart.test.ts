import { describe, expect, it } from 'vitest';
import restaurants from '../data/restaurants.json';
import assets from '../data/assets.json';
import { validateAssets } from '../src/data/validate';
import { coverChange } from '../src/game/lockcover';
import { defaultConfig } from '../src/game/config';
import { CONE, CONE_RING, CUP, DRINK_RING, VAT_FOOD_W, VAT_GLASS, BURNERS, FRY_FROM, OVENS, OVENS_LIT, SLOTS, SRC_H, SRC_W, VATS } from '../src/views/layout';

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

describe('four grill burners', () => {
  it('the game has as many burners as the art shows, each with a spot inside the grill zone', () => {
    expect(defaultConfig.recipes.settings.grillBurners).toBe(4);
    expect(BURNERS.length).toBe(4);
    BURNERS.forEach((p) => expect(inside(p, 'grill'), `burner ${p}`).toBe(true));
  });
  it('burner spots are at least 60 source pixels apart so patties never overlap', () => {
    for (let i = 0; i < BURNERS.length; i++)
      for (let j = i + 1; j < BURNERS.length; j++) expect(Math.hypot(BURNERS[i][0] - BURNERS[j][0], BURNERS[i][1] - BURNERS[j][1])).toBeGreaterThan(60);
  });
});

describe('lock cover changes', () => {
  it('locks and unlocks once per change and never restarts a running fade', () => {
    expect(coverChange(null, true)).toBe('lock');
    expect(coverChange(null, false)).toBe('unlock');
    expect(coverChange(true, false)).toBe('unlock');
    expect(coverChange(false, false)).toBe('none'); // the fade already started: do nothing
    expect(coverChange(true, true)).toBe('none');
    expect(coverChange(false, true)).toBe('lock');
  });
});

describe('food inside the vat glass', () => {
  it('fries and nuggets fit inside the lid glass with the sprite aspect ratios', () => {
    const glassW = VAT_GLASS.halfW * 2;
    const glassH = VAT_GLASS.bottom - VAT_GLASS.top;
    expect(VAT_FOOD_W.fries).toBeLessThan(glassW);
    expect(VAT_FOOD_W.nuggets).toBeLessThan(glassW);
    expect((VAT_FOOD_W.fries * 178) / 360).toBeLessThan(glassH); // fries_raw is 360 x 178
    expect((VAT_FOOD_W.nuggets * 360) / 322).toBeLessThan(glassH - 2); // nuggets_raw is 322 x 360
  });
  it('the glass is centred on the vat points', () => {
    VATS.forEach((v) => expect(Math.abs((VAT_GLASS.top + VAT_GLASS.bottom) / 2 - v[1])).toBeLessThanOrEqual(2));
  });
  it('puts the dispenser cup, the cone and their rings inside their own zones', () => {
    const box = (r: readonly number[]) => [[r[0], r[1]], [r[0] + r[2], r[1] + r[3]]];
    box(CUP).forEach((p) => expect(inside(p, 'drink_dispenser'), `cup ${p}`).toBe(true));
    box(CONE).forEach((p) => expect(inside(p, 'ice_cream_machine'), `cone ${p}`).toBe(true));
    expect(inside(DRINK_RING, 'drink_dispenser')).toBe(true);
    expect(inside(CONE_RING, 'ice_cream_machine')).toBe(true);
  });
});
