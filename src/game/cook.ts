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

/**
 * Moves a cooking clock forward by `dt` real seconds.
 *
 * The clock counts "cook seconds". A speed upgrade (`cookRate` above 1) makes the food finish sooner, so it only
 * applies while the food is still cooking. Once the food is ready the clock runs at `afterRate` (1 unless an event
 * says otherwise), so the real time the player has between ready, warning, danger and burnt does not shrink
 * when cooking gets faster. Burn Guard is what lengthens that window.
 *
 * If one step crosses the ready line, the part of the step before it runs at `cookRate` and the rest at `afterRate`.
 */
export function advanceCook(t: number, dt: number, cookRate: number, readyAfter: number, afterRate = 1): number {
  if (!(cookRate > 0)) return t; // a stopped station stays where it is
  if (t >= readyAfter) return t + dt * afterRate;
  const toReady = readyAfter - t;
  const step = dt * cookRate;
  if (step < toReady) return t + step;
  return readyAfter + (dt - toReady / cookRate) * afterRate;
}

/** Early levels get a longer burn window so beginners are not punished. */
export function burnWindowFor(base: number, level: number, beginnerMaxLevel: number, bonus: number): number {
  return level <= beginnerMaxLevel ? base + bonus : base;
}

export const isEdible = (p: CookPhase): boolean => p === 'ready' || p === 'warning' || p === 'danger';
