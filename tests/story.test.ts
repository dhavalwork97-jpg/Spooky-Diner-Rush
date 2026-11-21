import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { dueStory, seenAfter } from '../src/game/story';
import { validateStory } from '../src/data/validate';

const cfg = defaultConfig;
const cards = cfg.story.cards;

describe('story data', () => {
  it('passes validation', () => {
    expect(validateStory(cfg.story)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateStory({
      cards: [
        { id: 'a', level: 2, title: 'x'.repeat(40), text: 'ok' },
        { id: 'a', level: 1.5, title: '', text: 'y'.repeat(200) },
      ],
    }).join('\n');
    expect(errs).toMatch(/duplicate id/);
    expect(errs).toMatch(/whole number/);
    expect(errs).toMatch(/title must be/);
    expect(errs).toMatch(/text must be/);
    expect(errs).toMatch(/needs a card for Lv 1/);
    expect(validateStory({})).not.toEqual([]);
  });
});

describe('dueStory', () => {
  it('shows the intro card to a new player at Lv 1', () => {
    expect(dueStory(cfg, 1, [])?.id).toBe('intro');
  });
  it('shows nothing once the card for this level is seen', () => {
    expect(dueStory(cfg, 1, ['intro'])).toBeNull();
    expect(dueStory(cfg, 2, ['intro'])).toBeNull();
  });
  it('shows a card when its level is reached, and not before', () => {
    const lvl = cards[1].level;
    expect(dueStory(cfg, lvl - 1, ['intro'])).toBeNull();
    expect(dueStory(cfg, lvl, ['intro'])?.id).toBe(cards[1].id);
  });
  it('a returning player at a high level gets only the latest card, once', () => {
    const top = cards.filter((c) => c.level <= 12).at(-1)!;
    const first = dueStory(cfg, 12, [])!;
    expect(first.id).toBe(top.id);
    const seen = seenAfter(cfg, [], first);
    expect(dueStory(cfg, 12, seen)).toBeNull();
  });
  it('playing up level by level shows every card exactly once, in order', () => {
    let seen: string[] = [];
    const shown: string[] = [];
    for (let lv = 1; lv <= 60; lv++) {
      const c = dueStory(cfg, lv, seen);
      if (c) {
        shown.push(c.id);
        seen = seenAfter(cfg, seen, c);
      }
      expect(dueStory(cfg, lv, seen)).toBeNull();
    }
    expect(shown).toEqual(cards.map((c) => c.id));
  });
});

describe('seenAfter', () => {
  it('marks the card and everything below it, with no repeats, and does not mutate', () => {
    const seen = ['intro'];
    const out = seenAfter(cfg, seen, cards[2]);
    expect(seen).toEqual(['intro']);
    expect(out).toEqual(cards.filter((c) => c.level <= cards[2].level).map((c) => c.id));
    expect(new Set(out).size).toBe(out.length);
  });
  it('keeps ids from the save that the data no longer has', () => {
    expect(seenAfter(cfg, ['old_card'], cards[0])).toContain('old_card');
  });
});

describe('diner story cards (Lv 7, 8, 9, 14)', () => {
  const byLevel = (n: number) => defaultConfig.story.cards.filter((c) => c.level === n);
  it('there is one card at each of Lv 7, 8, 9 and 14, and the old cards are still there', () => {
    for (const n of [7, 8, 9, 14]) expect(byLevel(n)).toHaveLength(1);
    for (const n of [1, 3, 5, 10, 15, 20]) expect(byLevel(n).length).toBeGreaterThan(0);
  });
  it('each is true to the data: 3 seats at Lv 7, ice cream at Lv 8, Impatient at Lv 9, VIP at Lv 14', () => {
    const lv = (n: number) => defaultConfig.progression.levels[n - 1];
    expect(lv(7).maxCustomers).toBe(3);
    expect(lv(6).maxCustomers).toBe(2);
    expect(lv(8).items).toContain('icecream');
    expect(lv(7).items).not.toContain('icecream');
    expect(Object.keys(lv(9).types ?? {})).toContain('impatient');
    expect(Object.keys(lv(8).types ?? {})).not.toContain('impatient');
    expect(Object.keys(lv(14).types ?? {})).toContain('vip');
    expect(Object.keys(lv(13).types ?? {})).not.toContain('vip');
  });
  it('texts are 160 characters or fewer', () => {
    for (const n of [7, 8, 9, 14]) expect(byLevel(n)[0].text.length).toBeLessThanOrEqual(160);
  });
});
