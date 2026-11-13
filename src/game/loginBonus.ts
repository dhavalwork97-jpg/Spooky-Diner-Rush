/**
 * Daily login bonus. A player who comes back on a new day gets a small coin gift; coming back on consecutive days walks through a
 * 3-day cycle (25 / 50 / 100 coins) and then starts the cycle again. Pure logic: the scene passes in today's date key
 * (from `localDateKey`, the same helper the Daily Special uses), so tests can use any date.
 */

/** Coins for day 1, 2 and 3 of the cycle. */
export const LOGIN_REWARDS = [25, 50, 100] as const;
/** The bonus (and its popup) waits until Lv 3: Lv 1-2 are the guided tutorial. */
export const LOGIN_FROM_LEVEL = 3;

export interface LoginState {
  /** Local calendar day (YYYY-MM-DD) of the last visit that counted, or '' for never. */
  lastLoginDay: string;
  /** Consecutive days in a row up to and including that visit (0 = never). */
  loginStreak: number;
}

export interface LoginResult {
  /** The state to save. Equal to the input when nothing changed. */
  next: LoginState;
  /** Coins to give now (0 = no popup). */
  reward: number;
  /** 1-3: which day of the cycle the reward is for (0 when there is no reward). */
  day: number;
}

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days since 1970 for a YYYY-MM-DD key, or null when it is not a real date. UTC maths, so daylight saving never moves a day. */
export function dayNumber(key: string): number | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return Math.floor(ms / 86_400_000);
}

/** Cycle position (1-3) and coins for a streak length. */
export function rewardForStreak(streak: number): { day: number; coins: number } {
  const day = ((Math.max(1, Math.floor(streak)) - 1) % LOGIN_REWARDS.length) + 1;
  return { day, coins: LOGIN_REWARDS[day - 1] };
}

/** What tomorrow's visit would pay if the player comes back (for the "Come back tomorrow" line). */
export const tomorrowReward = (state: LoginState): number => rewardForStreak(state.loginStreak + 1).coins;

/**
 * Work out what a visit on `today` earns.
 * - A brand-new player (`hasProgress` false, never visited): today is recorded as day 1 with NO reward, so there is no popup on the very first launch.
 * - Same day: nothing. A date earlier than the last visit (the clock went backwards): nothing, and the saved day is kept, so changing the clock cannot be used to claim again.
 * - The day after the last visit: streak + 1. Any longer gap: streak restarts at 1.
 * - Anything unreadable (a bad saved day or a bad `today`) is treated as "never visited" / "no change" and never throws.
 */
export function checkLogin(state: LoginState, today: string, hasProgress: boolean): LoginResult {
  const none: LoginResult = { next: state, reward: 0, day: 0 };
  const t = dayNumber(today);
  if (t === null) return none;
  const last = dayNumber(state.lastLoginDay);
  if (last === null) {
    if (!hasProgress) return { next: { lastLoginDay: today, loginStreak: 1 }, reward: 0, day: 0 };
    const r = rewardForStreak(1);
    return { next: { lastLoginDay: today, loginStreak: 1 }, reward: r.coins, day: r.day };
  }
  if (t <= last) return none;
  const streak = t - last === 1 ? Math.max(0, state.loginStreak) + 1 : 1;
  const r = rewardForStreak(streak);
  return { next: { lastLoginDay: today, loginStreak: streak }, reward: r.coins, day: r.day };
}
