// Pure cooking rules. No Phaser, no timers: callers pass elapsed seconds.

export type CookPhase = 'cooking' | 'ready' | 'warning' | 'danger' | 'burnt';

/**
 * Phases follow the spec examples (fries ready 5s, warning 7s, burnt 9s):
 * ready for the first half of the burn window, warning from 50 percent,
 * danger from 75 percent, burnt when the window ends.
 */
export function cookPhase(elapsed: number, readyAfter: number, burnWindow: number): CookPhase {
  if (elapsed < readyAfter) return 'cooking';
  const over = elapsed - readyAfter;
  if (over >= burnWindow) return 'burnt';
  if (over >= burnWindow * 0.75) return 'danger';
  if (over >= burnWindow * 0.5) return 'warning';
  return 'ready';
}

/** Early levels get a longer burn window so beginners are not punished. */
export function burnWindowFor(base: number, level: number, beginnerMaxLevel: number, bonus: number): number {
  return level <= beginnerMaxLevel ? base + bonus : base;
}

export const isEdible = (p: CookPhase): boolean => p === 'ready' || p === 'warning' || p === 'danger';
