import { describe, expect, it } from 'vitest';
import { defaultConfig, type DecorDef } from '../src/game/config';
import { DECOR_PERK_CAP, buyDecor, canBuyDecor, perkText, perkTotals, withDecorPerks } from '../src/game/decor';
import { validateDecor } from '../src/data/validate';
import { defaultChests, validateChests } from '../src/game/chests';
import { modsFor } from '../src/game/shop';

const D = defaultConfig.decor.items;
const byId = (id: string) => D.find((d) => d.id === id)!;
const base = modsFor(defaultConfig.upgrades.upgrades, {});

describe('new decor (data)', () => {
  it('four shop pieces and three chest-only pieces, 10 in all', () => {
    expect(D).toHaveLength(10);
    expect(D.filter((d) => d.art && !d.chestOnly).map((d) => [d.id, d.unlockLevel])).toEqual([['cobweb', 5], ['jack_o_lantern', 6], ['candle_string', 8], ['bat_garland', 9]]);
    expect(D.filter((d) => d.chestOnly).map((d) => d.id)).toEqual(['lucky_lantern', 'haunted_portrait', 'golden_skeleton_plant']);
  });
  it('shop pieces cost 150 to 400', () => {
    for (const d of D.filter((x) => x.art && !x.chestOnly)) expect(d.cost).toBeGreaterThanOrEqual(150), expect(d.cost).toBeLessThanOrEqual(400);
  });
  it('passes validation', () => {
    expect(validateDecor(defaultConfig.decor)).toEqual([]);
  });
  it('the three oldest pieces have no perk', () => {
    for (const id of ['clock', 'bunting', 'runner']) expect(byId(id).perk).toBeUndefined();
  });
  it('every chest prize is a chest-only piece, and the chests give the three prizes in order', () => {
    expect(defaultChests.map((c) => c.decorId)).toEqual(['lucky_lantern', 'haunted_portrait', 'golden_skeleton_plant']);
    expect(validateChests(defaultChests, D.filter((d) => d.chestOnly).map((d) => d.id))).toEqual([]);
  });
  it('chest-only pieces cannot be bought', () => {
    expect(canBuyDecor(D, [], 'lucky_lantern', 99, 99999)).toEqual({ ok: false, reason: 'unknown' });
    expect(buyDecor(D, [], 'haunted_portrait', 99, 99999).ok).toBe(false);
  });
  it('shop pieces are locked below their Lv', () => {
    expect(canBuyDecor(D, [], 'cobweb', 4, 999)).toMatchObject({ ok: false, reason: 'locked' });
    expect(canBuyDecor(D, [], 'cobweb', 5, 999).ok).toBe(true);
  });
});

describe('decor perks', () => {
  it('use only existing mod keys', () => {
    for (const d of D) if (d.perk) expect(Object.keys(base)).toContain(d.perk.mod);
  });
  it('nothing on display changes nothing', () => {
    expect(withDecorPerks(base, D, [])).toEqual(base);
  });
  it('one piece adds its perk to its mod only', () => {
    const m = withDecorPerks(base, D, ['cobweb']);
    expect(m.patience).toBeCloseTo(base.patience * 1.02, 10);
    expect(m.tips).toBe(base.tips);
  });
  it('all pieces on display stay at or under the cap per mod', () => {
    const totals = perkTotals(D, D.map((d) => d.id));
    for (const v of Object.values(totals)) expect(v).toBeLessThanOrEqual(DECOR_PERK_CAP + 1e-9);
  });
  it('the cap is enforced even if the data adds up to more', () => {
    const many: DecorDef[] = Array.from({ length: 6 }, (_, i) => ({ ...byId('cobweb'), id: `w${i}`, perk: { mod: 'tips', pct: 0.03 } }));
    expect(perkTotals(many, many.map((d) => d.id)).tips).toBeCloseTo(DECOR_PERK_CAP, 10);
    expect(withDecorPerks(base, many, many.map((d) => d.id)).tips).toBeCloseTo(base.tips * 1.08, 10);
  });
  it('validation rejects data whose perks add up past the cap, and a bad mod or size', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ ...byId('cobweb'), id: `w${i}`, x: 440 + i * 120, perk: { mod: 'tips', pct: 0.02 } }));
    expect(validateDecor({ items }).some((e) => e.includes('cap is 8%'))).toBe(true);
    expect(validateDecor({ items: [{ ...byId('cobweb'), perk: { mod: 'luck', pct: 0.02 } }] }).some((e) => e.includes('perk.mod'))).toBe(true);
    expect(validateDecor({ items: [{ ...byId('cobweb'), perk: { mod: 'tips', pct: 0.5 } }] }).some((e) => e.includes('perk.pct'))).toBe(true);
  });
  it('shows perk text for the shop', () => {
    expect(perkText(byId('cobweb'))).toBe('+2% patience');
    expect(perkText(byId('clock'))).toBe('');
  });
  it('an unknown owned id is ignored (old saves)', () => {
    expect(withDecorPerks(base, D, ['gone'])).toEqual(base);
  });
});
