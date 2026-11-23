import { DAILY_REWARD, dailyProgress, recordDailyServe, rolloverDaily, type DailyProgress } from '../game/dailyGoal';
import { localDateKey } from '../game/extras';
import { SaveSystem } from './SaveSystem';

/** The three-restaurant daily goal as the scenes use it: reads and writes SaveSystem.data.dailyGoal. The rules live in game/dailyGoal.ts. */
let cached: { at: number; value: DailyProgress } | null = null;
/** The scenes ask every frame; the answer only changes when a customer is served or the date changes, so it is worked out at most twice a second. */
const REFRESH_MS = 500;

export const DailyGoalSystem = {
  /** Today's progress for the restaurants owned (starts a fresh day if the date changed). */
  progress(today?: string): DailyProgress {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (today === undefined && cached && now - cached.at < REFRESH_MS) return cached.value;
    const d = SaveSystem.data;
    d.dailyGoal = rolloverDaily(d.dailyGoal, today ?? localDateKey());
    const value = dailyProgress(d.dailyGoal, d.restaurants);
    if (today === undefined) cached = { at: now, value };
    return value;
  },
  /** Count one served customer. Returns the coins to give right now (0 when the goal is not finished by this serve). */
  record(restaurant: string, today: string = localDateKey()): number {
    const d = SaveSystem.data;
    const r = recordDailyServe(d.dailyGoal, restaurant, d.restaurants, today);
    d.dailyGoal = r.next;
    cached = null; // the next frame shows the new count straight away
    return r.reward;
  },
  /** Has today's reward been paid? */
  get claimed(): boolean {
    return SaveSystem.data.dailyGoal.claimed;
  },
  reward: DAILY_REWARD,
};
