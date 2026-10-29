import { describe, expect, it } from 'vitest';
import restaurants from '../data/restaurants.json';
import { defaultConfig } from '../src/game/config';
import { buyDecor, canBuyDecor, decorLabel, ownedDecor } from '../src/game/decor';
import { validateDecor } from '../src/data/validate';

const D = defaultConfig.decor.items;
const W = 1699;
const H = 926;
type R = { x: number; y: number; width: number; height: number };
const overlap = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('decor data', () => {
  it('passes validation', () => {
    expect(validateDecor(defaultConfig.decor)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateDecor({
      items: [
        { id: 'a', name: 'A', description: 'd', cost: 0, unlockLevel: 0, x: 0, y: 0, width: 10, height: 10 },
        { id: 'a', name: 'A', description: 'd', cost: 5, unlockLevel: 1, x: 1690, y: 900, width: 50, height: 50 },
        { id: 'b', name: 'B', description: 'd', cost: 5, unlockLevel: 1 },
      ],
    }).join('\n');
    expect(errs).toMatch(/cost must be/);
    expect(errs).toMatch(/unlockLevel/);
    expect(errs).toMatch(/duplicate id/);
    expect(errs).toMatch(/inside the 1699/);
    expect(errs).toMatch(/needs x, y, width and height/);
    expect(validateDecor({})).not.toEqual([]);
  });
  it('uses no banned wording', () => {
    const text = JSON.stringify(defaultConfig.decor).toLowerCase();
    for (const w of ['shift', 'stage', 'star']) expect(text).not.toMatch(new RegExp(`\\b${w}s?\\b`));
  });
  it('no decor covers a tap zone, and no two decor items overlap', () => {
    const zones = restaurants.restaurants.flatMap((r) => r.zones).map((z) => ({ id: z.id, x: z.x * W, y: z.y * H, width: z.width * W, height: z.height * H }));
    for (const d of D) {
      for (const z of zones) expect(overlap(d, z), `${d.id} overlaps zone ${z.id}`).toBe(false);
    }
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) expect(overlap(D[i], D[j]), `${D[i].id} overlaps ${D[j].id}`).toBe(false);
  });
});

describe('buying decor', () => {
  const d = D[0];
  it('rejects unknown, locked, owned and short-of-coins', () => {
    expect(canBuyDecor(D, [], 'nope', 10, 999)).toEqual({ ok: false, reason: 'unknown' });
    expect(canBuyDecor(D, [], d.id, d.unlockLevel - 1, 999)).toEqual({ ok: false, reason: 'locked' });
    expect(canBuyDecor(D, [d.id], d.id, 10, 999)).toEqual({ ok: false, reason: 'maxed' });
    expect(canBuyDecor(D, [], d.id, 10, d.cost - 1)).toEqual({ ok: false, reason: 'coins', cost: d.cost });
  });
  it('is pure and takes the coins', () => {
    const owned = ['x'];
    const r = buyDecor(D, owned, d.id, 10, d.cost + 5);
    expect(owned).toEqual(['x']);
    expect(r).toEqual({ ok: true, decor: ['x', d.id], coins: 5, cost: d.cost });
    expect(buyDecor(D, owned, d.id, 10, 0).ok).toBe(false);
  });
  it('labels and ownedDecor', () => {
    expect(decorLabel(D, [], d.id, 10, d.cost)).toEqual({ text: `Buy ${d.cost}`, enabled: true });
    expect(decorLabel(D, [d.id], d.id, 10, 999)).toEqual({ text: 'Placed', enabled: false });
    expect(decorLabel(D, [], d.id, 1, 999).text).toBe(`Lv ${d.unlockLevel}`);
    expect(ownedDecor(D, [d.id, 'gone']).map((x) => x.id)).toEqual([d.id]);
  });
});
