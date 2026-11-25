import { xpForLevel, type GameConfig } from './config';

// The Taco Truck and the Pizza Place each have a "menu step" bar. The early steps only add one or two dishes, so the original cost (1300 XP and up)
// made the player cook the same dish dozens of times. The first steps now cost a fraction of that; from the fifth step the cost is unchanged.
// Only the menu bar changes: the global Lv curve, coins, XP gained per order, the diner and ads are untouched.

/** Fraction of the normal cost for menu step 1, 2, 3 ... Steps beyond the list cost the full amount. */
export const EARLY_STEP_XP_SCALE: readonly number[] = [0.3, 0.5, 0.7, 0.85, 1];

/** XP to climb from `step` to the next step, where `level` is the diner Lv whose curve the step borrows (14 + step). */
export function menuStepXp(cfg: GameConfig, step: number, level: number): number {
  const scale = EARLY_STEP_XP_SCALE[step - 1] ?? 1;
  return Math.max(1, Math.round(xpForLevel(cfg, level) * scale));
}
