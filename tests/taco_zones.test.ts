import { describe, expect, it } from 'vitest';
import { defaultTacoConfig as cfg, stepKind } from '../src/game/taco/tacoConfig';
import { hitTestTaco, tapZone } from '../src/game/taco/tacoZones';
import { quiet, run, tacoAt } from './helpers/tacoBuild';

const zone = (id: string) => cfg.zones.find((z) => z.id === id)!;
const centre = (id: string) => {
  const z = zone(id);
  return [z.x + z.width / 2, z.y + z.height / 2] as const;
};

describe('taco zones data', () => {
  it('ids are unique and every rectangle lies inside the picture', () => {
    expect(new Set(cfg.zones.map((z) => z.id)).size).toBe(cfg.zones.length);
    for (const z of cfg.zones) {
      expect(z.width).toBeGreaterThan(0);
      expect(z.height).toBeGreaterThan(0);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.width).toBeLessThanOrEqual(1.0001);
      expect(z.y + z.height).toBeLessThanOrEqual(1.0001);
    }
  });
  it('every zone points at something the kitchen really has', () => {
    const s = tacoAt(10);
    for (const z of cfg.zones) {
      if (z.action === 'pan') expect(z.index).toBeLessThan(cfg.settings.pans);
      if (z.action === 'oven') expect(z.index).toBeLessThan(cfg.settings.ovenSlots);
      if (z.action === 'plate') expect(z.index).toBeLessThan(cfg.settings.plateSlots);
      if (z.action === 'cup') expect(z.index).toBeLessThan(cfg.settings.drinkLanes);
      if (z.action === 'protein') expect(cfg.proteins).toHaveProperty(z.arg!);
      if (z.action === 'drinks' || z.action === 'cup') expect(s.pours).toHaveProperty(z.arg!);
    }
  });
  it('has exactly one zone for each pan, oven slot, plate and protein, and one tap zone per dispenser', () => {
    const count = (a: string) => cfg.zones.filter((z) => z.action === a).length;
    expect([count('pan'), count('oven'), count('plate'), count('protein'), count('drinks'), count('cup'), count('trash')]).toEqual([4, 2, 2, 4, 2, 6, 1]);
  });
  it('every tortilla and ingredient used by a dish has a zone to tap', () => {
    const have = new Set(cfg.zones.filter((z) => z.action === 'ingredient').map((z) => z.arg));
    for (const d of cfg.dishes) d.steps.forEach((st, i) => ['base', 'ingredient'].includes(stepKind(st, i)) && expect(have.has(st), `${d.id}: ${st}`).toBe(true));
  });
  it('the customer window has the 5 seats, left to right, inside the band, with a serve area', () => {
    const w = cfg.customerWindow;
    expect(w.slots).toHaveLength(cfg.settings.seats);
    expect(w.slots.map((x) => x.x)).toEqual([...w.slots.map((x) => x.x)].sort((a, b) => a - b));
    for (const sl of w.slots) expect(sl.bottomY).toBeLessThanOrEqual(w.bandBottom + 0.0001);
    expect(w.dropZone.width).toBeGreaterThan(0.3);
    expect(cfg.art).toMatchObject({ back: 'kitchen_street_back', front: 'kitchen_front' });
  });
});

describe('taps by position', () => {
  it('the middle of each zone finds a zone of the same action (nearest centre wins where zones overlap)', () => {
    for (const z of cfg.zones) {
      const [x, y] = centre(z.id);
      const hit = hitTestTaco(cfg.zones, x, y)!;
      expect(hit, z.id).not.toBeNull();
      expect(hit.action, z.id).toBe(z.action);
    }
  });
  it('a cup inside its dispenser is the cup, the rest of the dispenser is the dispenser, and the empty wall is nothing', () => {
    const [cx, cy] = centre('drink_dispenser_agua_cup_2');
    expect(hitTestTaco(cfg.zones, cx, cy)?.id).toBe('drink_dispenser_agua_cup_2');
    const d = zone('drink_dispenser_agua');
    expect(hitTestTaco(cfg.zones, d.x + 0.02, d.y + 0.02)?.id).toBe('drink_dispenser_agua');
    expect(hitTestTaco(cfg.zones, 0.5, 0.02)).toBeNull();
  });
  it('slop only helps a tap that missed every zone', () => {
    const z = zone('trash_bin');
    expect(hitTestTaco(cfg.zones, z.x - 0.01, z.y + z.height / 2)).toBeNull();
    expect(hitTestTaco(cfg.zones, z.x - 0.01, z.y + z.height / 2, 0.025)?.id).toBe('trash_bin');
  });
});

describe('playing only by tapping zones', () => {
  it('a chicken soft taco is made from zone taps and served to the customer', () => {
    const s = quiet(tacoAt(2));
    const tap = (id: string) => tapZone(s, zone(id));
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['chicken_soft_taco'];
    c.delivered = [false];
    tap('tortilla_flour_tortillas');
    tap('griddle_raw_chicken');
    run(s, 8.2);
    tap('pan_1');
    for (const id of ['topping_lettuce', 'topping_tomato_slices', 'cooler_cheese']) tap(id);
    expect(s.plates[0].item?.dish).toBe('chicken_soft_taco');
    expect(s.serve(0, c.id)).toBe(true);
  });
  it('plates, oven and drinks work by zone too', () => {
    const s = quiet(tacoAt(10));
    const tap = (id: string) => tapZone(s, zone(id));
    tap('oven_slot_left');
    expect(s.ovens[0]?.what.kind).toBe('shell');
    tap('drink_dispenser_taco');
    expect(s.pours.agua_de_jamaica[0]).not.toBeNull();
    tap('drink_dispenser_taco_cup_1'); // a cup lane has no tap
    expect(s.pours.agua_de_jamaica.filter(Boolean)).toHaveLength(1);
    tap('tortilla_corn_tortillas');
    tap('trash_bin'); // the oldest unfinished plate goes in the bin for free
    expect(s.plates[0].item).toBeNull();
  });
});
