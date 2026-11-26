import { xpForLevel, type GameConfig } from '../config';
import { menuStepXp } from '../menuPace';
import type { TacoRamp } from '../taco/tacoConfig';
import type { PizzaConfig } from './pizzaConfig';

// The Pizza Place's own "menu step": which dishes are on the menu and how busy the shop is. Separate from the global Lv on purpose: someone who buys it at
// any Lv still starts at step 1. Global Lv, XP and coins are shared and untouched: the same XP counts for every restaurant.

export const MAX_PIZZA_STEP = 10;

/** The Pizza Place borrows the diner's customer table at 14 + step (Lv 15 to 24), the same gentle curve as the Taco Truck, so it never gets harder than the diner at Lv 30. */
export const PIZZA_LEVEL_BASE = 14;

export function clampPizzaStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.max(1, Math.min(MAX_PIZZA_STEP, Math.floor(step)));
}
export const pizzaLevelForStep = (step: number): number => PIZZA_LEVEL_BASE + clampPizzaStep(step);

/** XP to climb from this step to the next: the global curve's amount at the matching Lv, made smaller for the first steps (see menuPace.ts). */
export const pizzaStepXpNeeded = (cfg: GameConfig, step: number): number => menuStepXp(cfg, clampPizzaStep(step), pizzaLevelForStep(step));

export function pizzaRampFor(p: PizzaConfig, step: number): TacoRamp {
  const s = clampPizzaStep(step);
  return p.ramp.find((r) => r.step === s) ?? p.ramp[p.ramp.length - 1];
}

/** Display only: the Lv list shown on the restaurant unlock screen. It never unlocks anything. */
export function levelMilestones(p: PizzaConfig): { lv: number; text: string }[] {
  return p.levelProgression.milestones;
}

export interface PizzaMilestone {
  step: number;
  /** About which global Lv a player reaches this menu step, if they play only the Pizza Place from the Lv it unlocks at. */
  lv: number;
  dishes: string[];
}

/**
 * Display only, and worked out from the real XP curve so it cannot drift: the same XP fills the Pizza menu bar AND the global Lv bar, so the menu
 * is finished about six Lv after the shop opens (Lv 26 for an Lv 20 opening), not Lv 49. Nothing here unlocks anything; recipes unlock by menu step only.
 */
export function pizzaMilestones(cfg: GameConfig, p: PizzaConfig): PizzaMilestone[] {
  const out: PizzaMilestone[] = [];
  let lv = p.restaurant.unlockLevel;
  let into = 0; // XP already inside the current global Lv
  for (let step = 1; step <= MAX_PIZZA_STEP; step++) {
    out.push({ step, lv, dishes: p.dishes.filter((d) => d.unlockStep === step).map((d) => d.name) });
    const gain = pizzaStepXpNeeded(cfg, Math.min(step, MAX_PIZZA_STEP - 1));
    into += gain;
    while (into >= xpForLevel(cfg, lv)) {
      into -= xpForLevel(cfg, lv);
      lv++;
    }
  }
  return out;
}
