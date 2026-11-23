import { DAILY_REWARD, dailyProgress, recordDailyServe, rolloverDaily, type DailyProgress } from '../game/dailyGoal';
import { localDateKey } from '../game/extras';
import { SaveSystem } from './SaveSystem';

/** The three-restaurant daily goal as the scenes use it: reads and writes SaveSystem.data.dailyGoal. The rules live in game/dailyGoal.ts. */
export const DailyGoalSystem = {
  /** Today's progress for the restaurants owned (starts a fresh day if the date changed). */
  progress(today: string = localDateKey()): DailyProgress {
    const d = SaveSystem.data;
    d.dailyGoal = rolloverDaily(d.dailyGoal, today);
    return dailyProgress(d.dailyGoal, d.restaurants);
  },
  /** Count one served customer. Returns the coins to give right now (0 when the goal is not finished by this serve). */
  record(restaurant: string, today: string = localDateKey()): number {
    const d = SaveSystem.data;
    const r = recordDailyServe(d.dailyGoal, restaurant, d.restaurants, today);
    d.dailyGoal = r.next;
    return r.reward;
  },
  /** Has today's reward been paid? */
  get claimed(): boolean {
    return SaveSystem.data.dailyGoal.claimed;
  },
  reward: DAILY_REWARD,
};
