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
