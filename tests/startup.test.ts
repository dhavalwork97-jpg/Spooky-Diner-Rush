import { describe, expect, it } from 'vitest';
import { chooseFirstScene, hasSavedProgress } from '../src/game/startup';
import { defaultSave } from '../src/systems/SaveSystem';

describe('first scene after loading', () => {
  it('a new player sees the title screen', () => {
    expect(hasSavedProgress(defaultSave())).toBe(false);
    expect(chooseFirstScene({ debug: false, taco: false, returning: false })).toBe('Title');
  });
  it('the CrazyGames build skips the title for new players too, so play starts without an extra tap', () => {
    expect(chooseFirstScene({ debug: false, taco: false, returning: false, skipTitle: true })).toBe('Game');
    expect(chooseFirstScene({ debug: false, taco: false, returning: false, skipTitle: false })).toBe('Title');
  });
  it('a returning player goes straight into the game', () => {
    expect(chooseFirstScene({ debug: false, taco: false, returning: true })).toBe('Game');
  });
  it('?debug always goes straight in, and ?debug&taco opens the truck', () => {
    expect(chooseFirstScene({ debug: true, taco: false, returning: false })).toBe('Game');
    expect(chooseFirstScene({ debug: true, taco: true, returning: false })).toBe('Taco');
    expect(chooseFirstScene({ debug: true, taco: false, returning: true })).toBe('Game');
  });
  it('any saved progress counts as returning', () => {
    const s = defaultSave();
    expect(hasSavedProgress({ ...s, level: 2 })).toBe(true);
    expect(hasSavedProgress({ ...s, xp: 5 })).toBe(true);
    expect(hasSavedProgress({ ...s, coins: 1 })).toBe(true);
    expect(hasSavedProgress({ ...s, seenStory: ['intro'] })).toBe(true);
  });
});
