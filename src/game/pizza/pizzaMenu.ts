import { xpForLevel, type GameConfig } from '../config';
import type { TacoRamp } from '../taco/tacoConfig';
import type { PizzaConfig } from './pizzaConfig';

// The Pizza Place's own "menu step": which dishes are on the menu and how busy the shop is. Separate from the global Lv on purpose: someone who buys it at
// Lv 30 or more still starts at step 1. Global Lv, XP and coins are shared and untouched: the same XP counts for every restaurant.

export const MAX_PIZZA_STEP = 10;

/** The Pizza Place borrows the diner's customer table at 14 + step (Lv 15 to 24), the same gentle curve as the Taco Truck, so it never gets harder than the diner at Lv 30. */
export const PIZZA_LEVEL_BASE = 14;

export function clampPizzaStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.max(1, Math.min(MAX_PIZZA_STEP, Math.floor(step)));
}
export const pizzaLevelForStep = (step: number): number => PIZZA_LEVEL_BASE + clampPizzaStep(step);

/** XP to climb from this step to the next: the global curve's amount at the matching Lv. */
export const pizzaStepXpNeeded = (cfg: GameConfig, step: number): number => xpForLevel(cfg, pizzaLevelForStep(step));

export function pizzaRampFor(p: PizzaConfig, step: number): TacoRamp {
  const s = clampPizzaStep(step);
  return p.ramp.find((r) => r.step === s) ?? p.ramp[p.ramp.length - 1];
}

/** Display only: the Lv list shown on the restaurant unlock screen. It never unlocks anything. */
export function levelMilestones(p: PizzaConfig): { lv: number; text: string }[] {
  return p.levelProgression.milestones;
}
