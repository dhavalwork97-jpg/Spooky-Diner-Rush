import { describe, expect, it } from 'vitest';
import { nextStormDelay, STORM_FIRST_MIN, STORM_MAX_GAP, STORM_MIN_GAP, stormAllowed, THUNDER_OFFSET, STORM_LENGTH } from '../src/anim/roomFxMath';

describe('storm timing', () => {
  it('waits between the minimum and maximum gap', () => {
    expect(nextStormDelay(0, false)).toBe(STORM_MIN_GAP);
    expect(nextStormDelay(0.5, false)).toBeCloseTo((STORM_MIN_GAP + STORM_MAX_GAP) / 2);
    expect(nextStormDelay(1, false)).toBeLessThanOrEqual(STORM_MAX_GAP);
  });
  it('never sends the first storm too early', () => {
    expect(nextStormDelay(0, true)).toBeGreaterThanOrEqual(STORM_FIRST_MIN);
  });
  it('clamps a bad random number', () => {
    expect(nextStormDelay(-5, false)).toBe(STORM_MIN_GAP);
    expect(nextStormDelay(9, false)).toBeLessThanOrEqual(STORM_MAX_GAP);
  });
  it('starts the thunder inside the storm clip', () => {
    expect(THUNDER_OFFSET).toBeGreaterThan(0);
    expect(THUNDER_OFFSET).toBeLessThan(STORM_LENGTH);
  });
  it('allows a storm only when ready, not busy, not hidden and motion is on', () => {
    const ok = { ready: true, paused: false, reduced: false, hidden: false };
    expect(stormAllowed(ok)).toBe(true);
    for (const k of ['paused', 'reduced', 'hidden'] as const) expect(stormAllowed({ ...ok, [k]: true })).toBe(false);
    expect(stormAllowed({ ...ok, ready: false })).toBe(false);
  });
});
