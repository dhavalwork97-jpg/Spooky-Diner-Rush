import { describe, expect, it } from 'vitest';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

describe('save v2', () => {
  it('defaults have the new fields empty', () => {
    const d = defaultSave();
    expect(d.version).toBe(2);
    expect(d.owned).toEqual({});
    expect(d.decor).toEqual([]);
    expect(d.seenStory).toEqual([]);
    expect(d.lastRestaurant).toBe('burger_diner');
  });

  it('loads an old v1 save and keeps its progress', () => {
    const v1 = JSON.stringify({
      version: 1,
      level: 9,
      xp: 120,
      coins: 340,
      settings: { reduceMotion: true, musicVolume: 0.3, sfxVolume: 0.5, muted: true },
    });
    const s = parseSave(v1);
    expect(s.version).toBe(2);
    expect(s.level).toBe(9);
    expect(s.xp).toBe(120);
    expect(s.coins).toBe(340);
    expect(s.settings.muted).toBe(true);
    expect(s.settings.reduceMotion).toBe(true);
    expect(s.owned).toEqual({});
    expect(s.decor).toEqual([]);
  });

  it('round-trips owned upgrades, decor and story ids', () => {
    const a = { ...defaultSave(), owned: { fryer_speed: 2, tips: 1 }, decor: ['plant', 'neon'], seenStory: ['intro'], lastRestaurant: 'burger_diner' };
    const b = parseSave(JSON.stringify(a));
    expect(b).toEqual(a);
  });

  it('drops bad owned entries', () => {
    const s = parseSave(
      JSON.stringify({ owned: { good: 2, zero: 0, neg: -1, text: 'x', nan: null, frac: 2.9, huge: 1000, '': 3 } }),
    );
    expect(s.owned).toEqual({ good: 2, frac: 2 });
  });

  it('owned that is not an object becomes empty', () => {
    expect(parseSave(JSON.stringify({ owned: [1, 2] })).owned).toEqual({});
    expect(parseSave(JSON.stringify({ owned: 'x' })).owned).toEqual({});
    expect(parseSave(JSON.stringify({ owned: null })).owned).toEqual({});
  });

  it('decor and story lists keep only unique short strings', () => {
    const long = 'x'.repeat(65);
    const s = parseSave(JSON.stringify({ decor: ['a', 'a', 5, '', long, 'b'], seenStory: 'nope' }));
    expect(s.decor).toEqual(['a', 'b']);
    expect(s.seenStory).toEqual([]);
  });

  it('caps list length', () => {
    const many = Array.from({ length: 500 }, (_, i) => `d${i}`);
    expect(parseSave(JSON.stringify({ decor: many })).decor.length).toBe(200);
  });

  it('falls back for a bad restaurant id', () => {
    expect(parseSave(JSON.stringify({ lastRestaurant: 7 })).lastRestaurant).toBe('burger_diner');
    expect(parseSave(JSON.stringify({ lastRestaurant: 'taco_stand' })).lastRestaurant).toBe('taco_stand');
  });

  it('still survives corrupt text', () => {
    expect(parseSave('{oops').owned).toEqual({});
    expect(parseSave(null).version).toBe(2);
  });
});
