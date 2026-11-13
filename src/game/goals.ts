import type { GameEvent } from './KitchenState';
import type { ItemKind } from './config';
import { makeRng, randInt, type Rng } from './rng';

/**
 * Mini-goals: one small goal is always active ("Serve 3 fast in a row"), worth a little coin and XP. They give the mid-game a short
 * target every 30-45 seconds so players feel progress between level-ups. Pure logic (no Phaser): the scene feeds it the kitchen's events
 * and shows `current` in the HUD. Nothing here is saved; a goal in progress is simply replaced the next time the game opens.
 */

export type GoalKind = 'orders' | 'fastRow' | 'item' | 'coins' | 'combo';

export interface Goal {
  kind: GoalKind;
  /** How much counts as done (orders, a streak length, a number of items, coins, or a combo count). */
  target: number;
  progress: number;
  /** Only for 'item' goals. */
  item?: ItemKind;
  /** Short text for the HUD banner. */
  text: string;
  coins: number;
  xp: number;
}

/** What the picker needs to know about the current game; the scene builds it from the kitchen. */
export interface GoalEnv {
  level: number;
  /** Items on the menu at this level. */
  items: ItemKind[];
  itemName: (k: ItemKind) => string;
  maxCombo: number;
  /** Items waiting customers still want right now. An item goal is picked from these when there are any, so it is always something that can be served soon. */
  wanted?: ItemKind[];
}

/** First level with goals: Lv 1-2 have the pointing hand and must stay uncluttered. */
export const GOALS_FROM_LEVEL = 3;
/** A goal nobody is making progress on is swapped for another after this many seconds (no reward, no penalty). */
export const GOAL_STALE_SECONDS = 75;

/** Reward grows a little with the level, with a cap so goals never out-earn real orders. */
export const goalReward = (level: number): { coins: number; xp: number } => ({ coins: Math.min(40, 10 + 2 * level), xp: Math.min(30, 10 + level) });

/** The part of an event stream the tracker looks at, so tests need not build whole game events. */
export type GoalEvent = Pick<Extract<GameEvent, { type: 'orderDone' }>, 'type' | 'fast' | 'coins'> | { type: 'deliver'; item?: ItemKind } | { type: 'comboChanged'; combo: number } | { type: 'angryLeave' };

/**
 * Turn a kitchen event into what the tracker counts. A delivery event only names the customer and the order line, so the scene says what
 * item that was (`itemOf`); everything else is read straight from the event.
 */
export function toGoalEvent(e: GameEvent, itemOf: (customer: number, itemIndex: number) => ItemKind | undefined): GoalEvent | null {
  switch (e.type) {
    case 'orderDone':
      return { type: 'orderDone', fast: e.fast, coins: e.coins };
    case 'deliver':
      return { type: 'deliver', item: itemOf(e.customer, e.itemIndex) };
    case 'comboChanged':
      return { type: 'comboChanged', combo: e.combo };
    case 'angryLeave':
      return { type: 'angryLeave' };
    default:
      return null;
  }
}

export class GoalTracker {
  current: Goal | null = null;
  /** Goals finished this session (the only counter; not persisted). */
  completed = 0;
  private rng: Rng;
  private lastKind: GoalKind | null = null;
  private staleFor = 0;
  private fastRow = 0;
  /** After a skill goal (fast in a row, combo) went stale, the next few goals are plain ones: a slower player should not be handed another hard one. */
  private skillPause = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed);
  }

  /** Make sure a goal is active (picks one when none is). Call whenever goals are allowed to show. */
  ensure(env: GoalEnv): Goal {
    if (!this.current) this.current = this.pick(env);
    return this.current;
  }

  /** Time passes while goals are showing: a goal that makes no progress for a long time is replaced. */
  tick(dt: number, env: GoalEnv): void {
    if (!this.current) return;
    this.staleFor += dt;
    if (this.staleFor >= GOAL_STALE_SECONDS) {
      if (this.current.kind === 'fastRow' || this.current.kind === 'combo') this.skillPause = 3;
      this.current = this.pick(env);
    }
  }

  /** Count one kitchen event. Returns the goal that was just completed (a new one is already active), or null. */
  onEvent(e: GoalEvent, env: GoalEnv): Goal | null {
    const g = this.current;
    if (!g) return null;
    const before = g.progress;
    switch (g.kind) {
      case 'orders':
        if (e.type === 'orderDone') g.progress++;
        break;
      case 'fastRow':
        if (e.type === 'orderDone') {
          this.fastRow = e.fast ? this.fastRow + 1 : 0;
          g.progress = this.fastRow;
        } else if (e.type === 'angryLeave') {
          this.fastRow = 0;
          g.progress = 0;
        }
        break;
      case 'item':
        if (e.type === 'deliver' && e.item === g.item) g.progress++;
        break;
      case 'coins':
        if (e.type === 'orderDone') g.progress += e.coins;
        break;
      case 'combo':
        if (e.type === 'comboChanged') g.progress = Math.max(g.progress, e.combo);
        break;
    }
    if (g.progress !== before) this.staleFor = 0;
    if (g.progress < g.target) return null;
    this.completed++;
    this.current = this.pick(env);
    return g;
  }

  private pick(env: GoalEnv): Goal {
    this.staleFor = 0;
    this.fastRow = 0;
    const { coins, xp } = goalReward(env.level);
    const kinds: GoalKind[] = ['orders', 'coins'];
    if (this.skillPause > 0) this.skillPause--;
    else kinds.push('fastRow');
    if (env.items.length > 0) kinds.push('item', 'item'); // item goals are the most concrete, so they come up more often
    if (env.maxCombo >= 3 && this.skillPause === 0) kinds.push('combo');
    // Never the same kind twice in a row, so the banner always feels like something new.
    const pool = kinds.filter((k) => k !== this.lastKind);
    const kind = pool[randInt(this.rng, 0, pool.length - 1)];
    this.lastKind = kind;
    const lv = env.level;
    const g: Goal = { kind, target: 1, progress: 0, text: '', coins, xp };
    if (kind === 'orders') {
      g.target = Math.min(6, 3 + Math.floor(lv / 8));
      g.text = `Serve ${g.target} orders`;
    } else if (kind === 'fastRow') {
      g.target = Math.min(4, 2 + Math.floor(lv / 10));
      g.text = `Serve ${g.target} fast in a row`;
    } else if (kind === 'item') {
      const from = env.wanted && env.wanted.length > 0 ? env.wanted : env.items;
      g.item = from[randInt(this.rng, 0, from.length - 1)];
      g.target = Math.min(3, 1 + Math.floor(lv / 6));
      g.text = g.target === 1 ? `Serve ${env.itemName(g.item)}` : `Serve ${env.itemName(g.item)} x${g.target}`;
    } else if (kind === 'coins') {
      // About 40 seconds of orders: what a player earns in that time grows with the level.
      g.target = Math.round((70 + 10 * Math.min(lv, 20)) / 10) * 10;
      g.text = `Earn ${g.target} coins`;
    } else {
      g.target = Math.min(env.maxCombo, 3 + Math.floor(lv / 8));
      g.text = `Reach a x${g.target} combo`;
    }
    return g;
  }
}
