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
  it('uses no banned wording', () => {
    const text = JSON.stringify(cfg.story).toLowerCase();
    for (const w of ['shift', 'stage', 'star']) expect(text).not.toMatch(new RegExp(`\\b${w}s?\\b`));
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
