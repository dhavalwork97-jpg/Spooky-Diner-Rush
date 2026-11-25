import { type GameConfig } from '../config';
import { menuStepXp } from '../menuPace';
import type { TacoConfig, TacoRamp } from './tacoConfig';

// The Taco Truck's own "menu step": which dishes are on the menu and how busy the truck is.
// It is separate from the global Lv on purpose, so someone who buys the truck late still starts at the gentle beginning.
// Global Lv, XP and coins are untouched: the same XP counts for both. The player never sees the step as a number (see HANDOFF.md).

/** Last menu step: every dish is on the menu. */
export const MAX_MENU_STEP = 10;

/** The global Lv that matches menu step 1 in the difficulty tables: the step borrows the diner's tuned curve at 14 + step. */
export const MENU_LEVEL_BASE = 14;

/** Lv whose diner customer table (patience, arrival gaps, VIP and critic mix) a menu step borrows. */
export const levelForStep = (step: number): number => MENU_LEVEL_BASE + clampStep(step);

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.max(1, Math.min(MAX_MENU_STEP, Math.floor(step)));
}

/** A save from before menu steps: someone who already owns the truck keeps every dish they had. Lv 15 was step 1, Lv 24 and up is the last step. */
export function stepFromLevel(level: number): number {
  return clampStep(level - MENU_LEVEL_BASE);
}

/** XP to climb from this step to the next: the global curve's amount at Lv 15 onwards, made smaller for the first steps (see menuPace.ts). */
export function stepXpNeeded(cfg: GameConfig, step: number): number {
  return menuStepXp(cfg, clampStep(step), levelForStep(step));
}

export function rampFor(taco: TacoConfig, step: number): TacoRamp {
  const s = clampStep(step);
  return taco.ramp.find((r) => r.step === s) ?? taco.ramp[taco.ramp.length - 1];
}
