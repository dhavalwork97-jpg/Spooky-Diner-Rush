import { describe, expect, it } from 'vitest';
import { makeThrottle } from '../src/systems/throttle';
import { SFX_GAPS } from '../src/systems/AudioSystem';

describe('sound throttle', () => {
  it('lets the first play through and blocks a repeat inside the gap', () => {
    const ok = makeThrottle({ flap: 0.35 });
    expect(ok('flap', 10)).toBe(true);
    expect(ok('flap', 10.2)).toBe(false);
    expect(ok('flap', 10.36)).toBe(true);
  });
  it('a blocked play does not push the next allowed time further out', () => {
    const ok = makeThrottle({ flap: 1 });
    expect(ok('flap', 0)).toBe(true);
    expect(ok('flap', 0.9)).toBe(false);
    expect(ok('flap', 1.0)).toBe(true);
  });
  it('sounds are throttled separately, and unlisted sounds always play', () => {
    const ok = makeThrottle({ flap: 1 });
    expect(ok('flap', 0)).toBe(true);
    expect(ok('chest', 0)).toBe(true);
    expect(ok('coin', 0)).toBe(true);
    expect(ok('coin', 0)).toBe(true);
  });
  it('the new sounds all have a gap and the old ones are untouched', () => {
    expect(Object.keys(SFX_GAPS).sort()).toEqual(['badge', 'chest', 'flap', 'moon', 'party']);
    for (const old of ['tap', 'ding', 'coin', 'burn', 'levelUp', 'click', 'drop', 'wrong', 'pop', 'close']) expect(SFX_GAPS[old]).toBeUndefined();
  });
});
