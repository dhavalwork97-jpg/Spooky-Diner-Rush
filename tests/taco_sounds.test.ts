import { describe, expect, it } from 'vitest';
import { sfxFor } from '../src/views/TacoSounds';

describe('sfxFor', () => {
  it('rings only when something becomes ready, not while it cooks', () => {
    expect(sfxFor({ type: 'panPhase', pan: 0, phase: 'ready' })).toBe('ding');
    expect(sfxFor({ type: 'panPhase', pan: 0, phase: 'cooking' })).toBeNull();
  });
  it('maps key moments to existing sounds', () => {
    expect(sfxFor({ type: 'burnt', where: 'pan', index: 0 })).toBe('burn');
    expect(sfxFor({ type: 'orderDone', customer: 1, coins: 5, tip: 0, xp: 1, fast: false, rush: false, combo: 1, mult: 1 })).toBe('coin');
    expect(sfxFor({ type: 'wrongDrop', plate: 0, customer: null })).toBe('wrong');
    expect(sfxFor({ type: 'closed' })).toBe('close');
  });
  it('stays silent for bookkeeping events', () => {
    expect(sfxFor({ type: 'comboChanged', combo: 1, max: 1, broken: false })).toBeNull();
    expect(sfxFor({ type: 'reopened' })).toBeNull();
  });
});

describe('taco night sounds (B7)', () => {
  const done = { type: 'orderDone', customer: 1, coins: 5, tip: 0, xp: 1, fast: true, rush: false, combo: 1, mult: 1 } as const;
  it('a regular gets their own ding, everyone else keeps the coin sound', () => {
    expect(sfxFor({ ...done, regular: 'dona_boo' })).toBe('regular_ding');
    expect(sfxFor(done)).toBe('coin');
  });
  it('the ghosts giggle from combo 3, not before and not when it breaks', () => {
    expect(sfxFor({ type: 'comboChanged', combo: 2, max: 8, broken: false })).toBeNull();
    expect(sfxFor({ type: 'comboChanged', combo: 3, max: 8, broken: false })).toBe('ghost_giggle');
    expect(sfxFor({ type: 'comboChanged', combo: 0, max: 8, broken: true })).toBeNull();
  });
  it('Full Moon howls, Bat Delivery creaks, a new menu step hoots; other events stay silent', () => {
    expect(sfxFor({ type: 'eventStart', id: 'full_moon', name: 'Full Moon', duration: 30 })).toBe('wolf_howl');
    expect(sfxFor({ type: 'eventStart', id: 'bat_delivery', name: 'Bat Delivery', duration: 30 })).toBe('creak');
    expect(sfxFor({ type: 'eventStart', id: 'lunch_rush', name: 'Lunch rush', duration: 25 })).toBeNull();
    expect(sfxFor({ type: 'menuGrew', added: ['x'] })).toBe('owl_hoot');
  });
  it('every new sound has a throttle, so none can stack or spam', async () => {
    const { TACO_SFX_GAPS } = await import('../src/systems/AudioSystem');
    expect(Object.keys(TACO_SFX_GAPS).sort()).toEqual(['bat_flap', 'chest_open', 'creak', 'ghost_giggle', 'owl_hoot', 'regular_ding', 'wolf_howl']);
    for (const g of Object.values(TACO_SFX_GAPS)) expect(g).toBeGreaterThan(0);
  });
});
