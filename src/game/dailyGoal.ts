// Three-restaurant daily goal: "Serve 5 customers in each restaurant today". Pure logic (no Phaser, no save access).
// The day maths come from loginBonus (`dayNumber`), so the daily reset behaves exactly like the login bonus and the Daily Special.
import { dayNumber } from './loginBonus';

/** Customers to serve in EACH owned restaurant. */
export const DAILY_SERVES = 5;
/** Coins for finishing the goal, paid once a day. Small on purpose. */
export const DAILY_REWARD = 50;
/** The restaurants that count, in the order they are listed on the plate. */
export const DAILY_RESTAURANTS = [
  { id: 'burger_diner', short: 'Diner' },
  { id: 'taco_truck', short: 'Tacos' },
  { id: 'pizza_place', short: 'Pizza' },
] as const;

export interface DailyGoalState {
  /** Local calendar day (YYYY-MM-DD) the counts belong to, or '' for never. */
  day: string;
  /** Customers served today, per restaurant id. */
  counts: Record<string, number>;
  /** The reward was paid today. */
  claimed: boolean;
}

export const emptyDailyGoal = (): DailyGoalState => ({ day: '', counts: {}, claimed: false });

/**
 * The state for `today`. A new day starts from zero. The same day, or a clock that went backwards, keeps what is saved, so changing the clock can never
 * claim twice. An unreadable `today` changes nothing.
 */
export function rolloverDaily(state: DailyGoalState, today: string): DailyGoalState {
  const t = dayNumber(today);
  if (t === null) return state;
  const last = dayNumber(state.day);
  if (last === null || t > last) return { day: today, counts: {}, claimed: false };
  return state;
}

/** Restaurants that count right now: only the ones the player owns, in plate order. */
export const dailyRestaurants = (owned: readonly string[]): { id: string; short: string }[] => DAILY_RESTAURANTS.filter((r) => owned.includes(r.id));

export interface DailyProgress {
  rows: { id: string; short: string; count: number; done: boolean }[];
  /** Every owned restaurant has its serves (false when nothing is owned). */
  complete: boolean;
  /** Serves counted so far toward the target, each restaurant capped at DAILY_SERVES. */
  have: number;
  need: number;
}

export function dailyProgress(state: DailyGoalState, owned: readonly string[]): DailyProgress {
  const rows = dailyRestaurants(owned).map((r) => {
    const count = Math.min(DAILY_SERVES, Math.max(0, Math.floor(state.counts[r.id] ?? 0)));
    return { ...r, count, done: count >= DAILY_SERVES };
  });
  return { rows, complete: rows.length > 0 && rows.every((r) => r.done), have: rows.reduce((s, r) => s + r.count, 0), need: rows.length * DAILY_SERVES };
}

/** Nothing to show: the plate hides itself. */
export const NO_PROGRESS: DailyProgress = { rows: [], complete: false, have: 0, need: 0 };

export interface DailyRecord {
  next: DailyGoalState;
  /** Coins to give now (0 = none). */
  reward: number;
}

/** One customer served in `restaurant` on `today`. Counts only an owned restaurant; pays the reward once, the moment every owned restaurant is done. */
export function recordDailyServe(state: DailyGoalState, restaurant: string, owned: readonly string[], today: string): DailyRecord {
  const cur = rolloverDaily(state, today);
  if (!owned.includes(restaurant) || !DAILY_RESTAURANTS.some((r) => r.id === restaurant)) return { next: cur, reward: 0 };
  const next: DailyGoalState = { ...cur, counts: { ...cur.counts, [restaurant]: Math.min(DAILY_SERVES, (cur.counts[restaurant] ?? 0) + 1) } };
  if (!next.claimed && dailyProgress(next, owned).complete) return { next: { ...next, claimed: true }, reward: DAILY_REWARD };
  return { next, reward: 0 };
}
