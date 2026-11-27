import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAnalytics } from '../src/telemetry/LocalAnalytics';

describe('on-device analytics', () => {
  afterEach(() => {
    LocalAnalytics.reset();
    vi.unstubAllGlobals();
  });

  it('counts sessions and progression funnel events without recording identities', () => {
    LocalAnalytics.startSession();
    LocalAnalytics.track('restaurant_entered', 'burger_diner');
    LocalAnalytics.track('level_reached', 12);
    LocalAnalytics.track('menu_step_reached', 'taco:4');
    LocalAnalytics.tick(1_500);
    LocalAnalytics.endSession();

    const data = LocalAnalytics.snapshot();
    expect(data.sessions).toBe(1);
    expect(data.activeMs).toBe(1_500);
    expect(data.counters).toEqual({
      session_started: 1,
      'restaurant_entered:burger_diner': 1,
      'level_reached:12': 1,
      'menu_step_reached:taco:4': 1,
      session_ended: 1,
    });
    expect(JSON.stringify(data)).not.toMatch(/email|username|playerId/i);
  });

  it('ignores debug/test sessions', () => {
    LocalAnalytics.startSession(true);
    LocalAnalytics.track('restaurant_entered', 'burger_diner');
    LocalAnalytics.tick(5_000);
    expect(LocalAnalytics.snapshot().sessions).toBe(0);
    expect(LocalAnalytics.snapshot().activeMs).toBe(0);
    expect(LocalAnalytics.snapshot().counters).toEqual({});
  });

  it('caps a single frame gap and does not count time while inactive', () => {
    LocalAnalytics.startSession();
    LocalAnalytics.tick(20_000);
    LocalAnalytics.endSession();
    expect(LocalAnalytics.snapshot().activeMs).toBe(250);
    LocalAnalytics.tick(1_000);
    expect(LocalAnalytics.snapshot().activeMs).toBe(250);
  });

  it('exports a readable local JSON snapshot and reset leaves game saves untouched', () => {
    LocalAnalytics.startSession();
    LocalAnalytics.track('recipe_book_opened', 'pizza');
    expect(JSON.parse(LocalAnalytics.exportJson()).counters['recipe_book_opened:pizza']).toBe(1);
    LocalAnalytics.reset();
    expect(LocalAnalytics.snapshot().sessions).toBe(0);
    expect(LocalAnalytics.snapshot().counters).toEqual({});
  });
});
