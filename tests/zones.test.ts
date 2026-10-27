import { describe, expect, it } from 'vitest';
import restaurants from '../data/restaurants.json';
import assets from '../data/assets.json';
import { fitBackground, hitTestZone, logicalToNorm, normToLogical, rectsOverlap, undersizedZones, type ZoneDef } from '../src/kitchen/zones';
import { validateAssets, validateRestaurants } from '../src/data/validate';
import { AnimGuard } from '../src/anim/guard';
import { parseSave } from '../src/systems/SaveSystem';

const diner = restaurants.restaurants[0];
const zones = diner.zones as ZoneDef[];
const bg = fitBackground(1280, 698, diner.backgroundSize.width, diner.backgroundSize.height);

describe('coordinate conversion', () => {
  it('fits the background without distortion', () => {
    expect(bg.width / bg.height).toBeCloseTo(1699 / 926, 5);
    expect(bg.width).toBeLessThanOrEqual(1280 + 1e-6);
    expect(bg.height).toBeLessThanOrEqual(698 + 1e-6);
  });
  it('letterboxes a wider canvas and keeps zones aligned', () => {
    const wide = fitBackground(1600, 698, 1699, 926);
    expect(wide.x).toBeGreaterThan(0);
    const r = normToLogical({ x: 0.5, y: 0.5, width: 0, height: 0 }, wide);
    expect(r.x).toBeCloseTo(800, 3);
  });
  it('round-trips norm to logical to norm', () => {
    const r = normToLogical({ x: 0.3, y: 0.4, width: 0.1, height: 0.1 }, bg);
    const n = logicalToNorm(r.x, r.y, bg);
    expect(n.x).toBeCloseTo(0.3, 6);
    expect(n.y).toBeCloseTo(0.4, 6);
  });
});

describe('zone to station mapping', () => {
  const center = (id: string) => {
    const z = zones.find((q) => q.id === id)!;
    return { x: z.x + z.width / 2, y: z.y + z.height / 2 };
  };
  it('maps each zone center to its own zone', () => {
    for (const z of zones) {
      const c = center(z.id);
      expect(hitTestZone(zones, c.x, c.y)?.id).toBe(z.id);
    }
  });
  it('maps the key stations', () => {
    const c = center('fryer');
    expect(hitTestZone(zones, c.x, c.y)?.station).toBe('fryer');
    const g = center('grill');
    expect(hitTestZone(zones, g.x, g.y)?.station).toBe('grill');
  });
  it('returns null on empty space', () => {
    expect(hitTestZone(zones, 0.5, 0.05)).toBeNull();
  });
  it('picks the nearest center when zones overlap', () => {
    const a: ZoneDef = { id: 'a', station: 'fryer', unlockLevel: 1, x: 0, y: 0, width: 0.5, height: 1 };
    const b: ZoneDef = { id: 'b', station: 'grill', unlockLevel: 1, x: 0.4, y: 0, width: 0.5, height: 1 };
    expect(hitTestZone([a, b], 0.2, 0.5)?.id).toBe('a');
    expect(hitTestZone([a, b], 0.7, 0.5)?.id).toBe('b');
  });
  it('has no overlapping zones in the shipped layout', () => {
    for (let i = 0; i < zones.length; i++)
      for (let j = i + 1; j < zones.length; j++) expect(rectsOverlap(zones[i], zones[j])).toBe(false);
  });
});

describe('touch size report', () => {
  it('lists zones under 88 CSS px at the logical size', () => {
    const small = undersizedZones(zones, bg, 1);
    // The trash bin is physically narrow in the artwork; it is documented, not hidden.
    expect(small.map((s) => s.id)).toContain('trash_bin');
  });
});

describe('data validation', () => {
  it('accepts the shipped data', () => {
    expect(validateRestaurants(restaurants)).toEqual([]);
    expect(validateAssets(assets)).toEqual([]);
  });
  it('rejects bad zones', () => {
    const bad = { restaurants: [{ ...diner, zones: [{ ...zones[0], station: 'spaceship' }, { ...zones[0] }] }] };
    const errs = validateRestaurants(bad);
    expect(errs.some((e) => e.includes('unknown station'))).toBe(true);
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true);
  });
});

describe('AnimGuard', () => {
  it('restarts instead of stacking', () => {
    const g = new AnimGuard();
    let stopped = 0;
    g.start('k', () => ({ stop: () => stopped++ }));
    g.start('k', () => ({ stop: () => stopped++ }));
    expect(stopped).toBe(1);
    expect(g.size).toBe(1);
  });
  it('can ignore repeats and cleans up', () => {
    const g = new AnimGuard();
    expect(g.start('k', () => ({ stop() {} }), 'ignore')).toBe(true);
    expect(g.start('k', () => ({ stop() {} }), 'ignore')).toBe(false);
    g.finish('k');
    expect(g.size).toBe(0);
  });
});

describe('save parsing', () => {
  it('survives corrupt data', () => {
    expect(parseSave('{not json').level).toBe(1);
    expect(parseSave(JSON.stringify({ level: -5, coins: 'x' })).level).toBe(1);
    expect(parseSave(JSON.stringify({ level: 7, coins: 40 })).coins).toBe(40);
  });
});
