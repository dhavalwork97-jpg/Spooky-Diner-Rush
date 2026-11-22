/**
 * Perfect bake: food taken out during the FIRST HALF of its READY phase.
 * READY runs from `readyAfter` until the burn window is half used (see `cookPhase` in game/cook.ts), so the first half of it is the first
 * quarter of the burn window. This only reads the clock; it never changes how long anything cooks.
 * The start counts (taken the moment it is ready is perfect), the end does not (exactly at the half-way mark is no longer perfect).
 */
export function isPerfectBake(t: number, readyAfter: number, burnWindow: number, share = 0.5): boolean {
  const over = t - readyAfter;
  return over >= 0 && over < burnWindow * 0.5 * share;
}

/** The extra tip for one perfect item: a share of its price, rounded, at least 1 coin. */
export function perfectTip(price: number, tipFraction: number, tipMult = 1): number {
  return Math.max(1, Math.round(price * tipFraction * tipMult));
}
