import { describe, expect, it } from 'vitest';
import restaurantsJson from '../data/restaurants.json';
import { defaultIntros, dueIntros, introText, introsSeededFor, seenAfterIntro, validateIntros, INTRO_GLOW_MS } from '../src/game/intros';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';
import type { RestaurantDef } from '../src/data/validate';

const zones = (restaurantsJson as { restaurants: RestaurantDef[] }).restaurants.find((r) => r.id === 'burger_diner')!.zones;

describe('station intro cards: data', () => {
  it('the shipped cards match the diner zones exactly', () => expect(validateIntros(defaultIntros, zones)).toEqual([]));
  it('cards exist for Lv 2, 4, 5, 6, 10 and 12', () => expect(defaultIntros.map((c) => c.level)).toEqual([2, 4, 5, 6, 10, 12]));
  it('every station that unlocks after Lv 1 is in exactly one card', () => {
    const late = zones.filter((z) => z.unlockLevel > 1).map((z) => z.id).sort();
    expect(defaultIntros.flatMap((c) => c.zones).sort()).toEqual(late);
  });
  it('the validator catches a wrong Lv, an unknown zone, a missing card and a duplicate', () => {
    const bad = [{ id: 'a', level: 3, name: 'X', zones: ['pizza_oven'] }, { id: 'a', level: 5, name: '', zones: ['nope'] }];
    const errors = validateIntros(bad, zones);
    expect(errors.some((e) => e.includes('unlocks at Lv 5, not Lv 3'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown zone nope'))).toBe(true);
    expect(errors.some((e) => e.includes('duplicate id'))).toBe(true);
    expect(errors.some((e) => e.includes('has no intro card'))).toBe(true);
  });
  it('the text uses the station name from the data', () => expect(introText(defaultIntros[2])).toBe('New: Pizza oven!'));
  it('the glow lasts about 4 seconds', () => expect(INTRO_GLOW_MS).toBe(4000));
});

describe('station intro cards: showing once', () => {
  it('a card is due once its Lv is reached and not seen', () => {
    expect(dueIntros(defaultIntros, 1, []).length).toBe(0);
    expect(dueIntros(defaultIntros, 2, []).map((c) => c.id)).toEqual(['lv2_burger']);
    expect(dueIntros(defaultIntros, 6, ['lv2_burger']).map((c) => c.level)).toEqual([4, 5, 6]);
  });
  it('a card never shows twice', () => {
    let seen: string[] = [];
    seen = seenAfterIntro(seen, 'lv2_burger');
    seen = seenAfterIntro(seen, 'lv2_burger');
    expect(seen).toEqual(['lv2_burger']);
    expect(dueIntros(defaultIntros, 2, seen)).toEqual([]);
  });
  it('seeding marks every unlock at or below the Lv as seen', () => {
    expect(introsSeededFor(defaultIntros, 1)).toEqual([]);
    expect(introsSeededFor(defaultIntros, 5)).toEqual(['lv2_burger', 'lv4_nuggets', 'lv5_pizza']);
    expect(dueIntros(defaultIntros, 5, introsSeededFor(defaultIntros, 5))).toEqual([]);
  });
});

describe('station intro cards: saves', () => {
  it('a new save starts with none seen', () => expect(defaultSave().seenIntros).toEqual([]));
  it('an old save without the field has every unlock up to its Lv marked seen, so nothing pops up on first load', () => {
    const s = parseSave(JSON.stringify({ version: 2, level: 11, xp: 5, coins: 100 }));
    expect(s.seenIntros).toEqual(['lv2_burger', 'lv4_nuggets', 'lv5_pizza', 'lv6_drinks', 'lv10_prep']);
    expect(dueIntros(defaultIntros, 11, s.seenIntros)).toEqual([]);
  });
  it('a save that has the field keeps it (cleaned) and later unlocks still show', () => {
    const s = parseSave(JSON.stringify({ level: 12, seenIntros: ['lv2_burger', 7, 'lv2_burger', ''] }));
    expect(s.seenIntros).toEqual(['lv2_burger']);
    expect(dueIntros(defaultIntros, 12, s.seenIntros).length).toBe(5);
  });
  it('a brand new Lv 1 player has nothing seeded', () => expect(parseSave(JSON.stringify({ level: 1 })).seenIntros).toEqual([]));
});
