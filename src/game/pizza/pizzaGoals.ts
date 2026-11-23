// Pizza Place mini-goals. A small Pizza-specific picker (the diner's goals.ts is built around burger items, so it is left alone) that reuses the
// shared `Goal` shape and the shared GoalBanner, so the banner looks and fades exactly like the Diner's (Part C). Pure logic: no Phaser, nothing saved.
import { GOAL_STALE_SECONDS, goalReward, type Goal } from '../goals';
import { makeRng, randInt, type Rng } from '../rng';
import type { PizzaEvent } from './PizzaKitchenState';
import { isCustomId } from './pizzaCustom';

export type PizzaGoalId = 'fastRow' | 'bake' | 'comboMeal' | 'perfect' | 'custom';

/** Targets from the spec: 3 quickly in a row, bake 3, 2 combo meals, 3 perfect bakes, 3 custom pizzas. */
export const PIZZA_GOAL_TARGETS: Record<PizzaGoalId, number> = { fastRow: 3, bake: 3, comboMeal: 2, perfect: 3, custom: 3 };
const TEXT: Record<PizzaGoalId, string> = {
  fastRow: 'Serve 3 customers quickly in a row',
  bake: 'Bake 3 pizzas',
  comboMeal: 'Serve 2 combo meals',
  perfect: 'Make 3 perfect bakes',
  custom: 'Serve 3 custom pizzas',
};

/** What the picker needs to know; the scene builds it from the kitchen. */
export interface PizzaGoalEnv {
  level: number;
  /** A combo meal can be ordered (a pizza, a side or fried item and an ice cream are all on the menu). */
  comboPossible: boolean;
  /** Build-your-own pizzas are being ordered at this menu step. */
  customPossible: boolean;
}

/** The part of the event stream the tracker looks at. */
export type PizzaGoalEvent =
  | { type: 'orderDone'; fast: boolean }
  | { type: 'angryLeave' }
  | { type: 'collect'; phase: string }
  | { type: 'comboMeal' }
  | { type: 'perfectBake' }
  | { type: 'deliver'; dish: string };

export function toPizzaGoalEvent(e: PizzaEvent): PizzaGoalEvent | null {
  switch (e.type) {
    case 'orderDone':
      return { type: 'orderDone', fast: e.fast };
    case 'angryLeave':
      return { type: 'angryLeave' };
    case 'collect':
      return { type: 'collect', phase: e.phase };
    case 'comboMeal':
      return { type: 'comboMeal' };
    case 'perfectBake':
      return { type: 'perfectBake' };
    case 'deliver':
      return { type: 'deliver', dish: e.dish };
    default:
      return null;
  }
}

/** Which goals can be picked right now. Always the plain ones; combo and custom only when the menu can really produce them. */
export function pizzaGoalPool(env: PizzaGoalEnv): PizzaGoalId[] {
  const pool: PizzaGoalId[] = ['fastRow', 'bake', 'perfect'];
  if (env.comboPossible) pool.push('comboMeal');
  if (env.customPossible) pool.push('custom');
  return pool;
}

export class PizzaGoalTracker {
  current: Goal | null = null;
  /** Goals finished this session (the only counter; not saved). */
  completed = 0;
  private id: PizzaGoalId | null = null;
  private rng: Rng;
  private last: PizzaGoalId | null = null;
  private staleFor = 0;
  private row = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed);
  }

  ensure(env: PizzaGoalEnv): Goal {
    if (!this.current) this.current = this.pick(env);
    return this.current;
  }

  /** A goal nobody is making progress on is swapped for another after a while (no reward, no penalty), same time as the Diner's. */
  tick(dt: number, env: PizzaGoalEnv): void {
    if (!this.current) return;
    this.staleFor += dt;
    if (this.staleFor >= GOAL_STALE_SECONDS) this.current = this.pick(env);
  }

  /** Count one event. Returns the goal just completed (a new one is already active), or null. */
  onEvent(e: PizzaGoalEvent, env: PizzaGoalEnv): Goal | null {
    const g = this.current;
    if (!g || !this.id) return null;
    const before = g.progress;
    switch (this.id) {
      case 'fastRow':
        if (e.type === 'orderDone') g.progress = this.row = e.fast ? this.row + 1 : 0;
        else if (e.type === 'angryLeave') g.progress = this.row = 0;
        break;
      case 'bake':
        // A pizza taken out of the oven while it was good to eat (a burnt one is thrown away and does not count).
        if (e.type === 'collect' && e.phase !== 'cooking' && e.phase !== 'burnt') g.progress++;
        break;
      case 'comboMeal':
        if (e.type === 'comboMeal') g.progress++;
        break;
      case 'perfect':
        if (e.type === 'perfectBake') g.progress++;
        break;
      case 'custom':
        if (e.type === 'deliver' && isCustomId(e.dish)) g.progress++;
        break;
    }
    if (g.progress !== before) this.staleFor = 0;
    if (g.progress < g.target) return null;
    this.completed++;
    this.current = this.pick(env);
    return g;
  }

  private pick(env: PizzaGoalEnv): Goal {
    this.staleFor = 0;
    this.row = 0;
    const pool = pizzaGoalPool(env).filter((k) => k !== this.last);
    const id = pool[randInt(this.rng, 0, pool.length - 1)];
    this.id = id;
    this.last = id;
    const { coins, xp } = goalReward(env.level);
    return { kind: 'orders', target: PIZZA_GOAL_TARGETS[id], progress: 0, text: TEXT[id], coins, xp };
  }
}
