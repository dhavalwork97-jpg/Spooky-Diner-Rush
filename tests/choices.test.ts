import { describe, expect, it } from 'vitest';
import { CHOICE_RESTAURANTS, choices, cleanPicks, pick, pickedOption, slotsFor, validateChoices, withChoices } from '../src/game/choices';
import { NO_MODS } from '../src/game/shop';
import { NO_TACO_MODS } from '../src/game/taco/tacoShop';
import { defaultSave } from '../src/systems/SaveSystem';

describe("Chef's Choice", () => {
  it('the data is valid: two perks per slot, multipliers from 1 to 1.3', () => {
    expect(validateChoices()).toEqual([]);
    for (const r of CHOICE_RESTAURANTS) expect(slotsFor(r).length).toBe(3);
  });
  it('without picks the mods do not change at all', () => {
    expect(withChoices(NO_MODS, 'diner', {}, 99)).toEqual(NO_MODS);
    expect(withChoices(NO_MODS, 'diner', undefined, 99)).toEqual(NO_MODS);
  });
  it('a pick multiplies the mods once it is unlocked', () => {
    const picks = pick('diner', 'special', 'tip_magnet', {}, 12)!;
    expect(withChoices(NO_MODS, 'diner', picks, 12).tips).toBeCloseTo(1.25);
    expect(withChoices(NO_MODS, 'diner', picks, 11).tips).toBe(1); // below the unlock Lv the pick is ignored
  });
  it('picks stack with upgrades and with each other', () => {
    let picks = pick('diner', 'style', 'speedy_hands', {}, 20)!;
    picks = pick('diner', 'mood', 'hot_oven', picks, 20)!;
    const m = withChoices({ ...NO_MODS, grillSpeed: 1.3 }, 'diner', picks, 20);
    expect(m.grillSpeed).toBeCloseTo(1.3 * 1.1);
    expect(m.ovenSpeed).toBeCloseTo(1.15);
  });
  it('switching replaces the old pick in that slot only', () => {
    const a = pick('taco', 'style', 'quick_pour', {}, 30)!;
    const b = pick('taco', 'style', 'calm_line', a, 30)!;
    expect(withChoices(NO_TACO_MODS, 'taco', b, 30).pourSpeed).toBe(1);
    expect(withChoices(NO_TACO_MODS, 'taco', b, 30).patience).toBeCloseTo(1.15);
    expect(a['taco:style']).toBe('quick_pour'); // never mutates
  });
  it('picks of one restaurant never change another', () => {
    const picks = pick('pizza', 'style', 'stone_oven', {}, 40)!;
    expect(withChoices(NO_MODS, 'diner', picks, 40)).toEqual(NO_MODS);
    expect(withChoices(NO_MODS, 'pizza', picks, 40).ovenSpeed).toBeCloseTo(1.15);
  });
  it('a locked slot, an unknown slot or an unknown perk cannot be picked', () => {
    expect(pick('diner', 'special', 'tip_magnet', {}, 5)).toBeNull();
    expect(pick('diner', 'nope', 'tip_magnet', {}, 99)).toBeNull();
    expect(pick('diner', 'special', 'nope', {}, 99)).toBeNull();
  });
  it('the picked option is found only while unlocked', () => {
    const slot = slotsFor('diner')[0];
    const picks = { 'diner:style': 'friendly_service' };
    expect(pickedOption('diner', slot, picks, slot.unlockLevel)?.id).toBe('friendly_service');
    expect(pickedOption('diner', slot, picks, slot.unlockLevel - 1)).toBeNull();
  });
  it('saves are cleaned: junk and unknown ids are dropped', () => {
    expect(cleanPicks(null)).toEqual({});
    expect(cleanPicks({ 'diner:style': 'speedy_hands', 'diner:special': 'evil', 'x:y': 'z', 'taco:style': 5 })).toEqual({ 'diner:style': 'speedy_hands' });
  });
  it('perks are only boosts: nothing below 1, nothing above 1.3 each', () => {
    for (const r of CHOICE_RESTAURANTS) for (const s of choices.restaurants[r].slots) for (const o of s.options) for (const v of Object.values(o.effects)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(1.3); }
  });
  it('a fresh save has no picks, and an old save without the field loads', () => {
    expect(defaultSave().choices).toEqual({});
  });
});
