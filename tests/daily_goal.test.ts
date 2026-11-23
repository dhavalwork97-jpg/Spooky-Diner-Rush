import { describe, expect, it } from 'vitest';
import { DAILY_RESTAURANTS, DAILY_REWARD, DAILY_SERVES, dailyProgress, dailyRestaurants, emptyDailyGoal, recordDailyServe, rolloverDaily, type DailyGoalState } from '../src/game/dailyGoal';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

const ALL = ['burger_diner', 'taco_truck', 'pizza_place'];
const D1 = '2026-11-22';
const D2 = '2026-11-23';

/** Serve `n` customers in one restaurant, keeping the state and adding up the rewards. */
const serve = (s: DailyGoalState, id: string, n: number, owned: string[], day = D1) => {
  let reward = 0;
  for (let i = 0; i < n; i++) {
    const r = recordDailyServe(s, id, owned, day);
    s = r.next;
    reward += r.reward;
  }
  return { s, reward };
};

describe('daily goal: ownership', () => {
  it('lists only the restaurants the player owns, in plate order', () => {
    expect(dailyRestaurants(['burger_diner']).map((r) => r.id)).toEqual(['burger_diner']);
    expect(dailyRestaurants(['pizza_place', 'burger_diner']).map((r) => r.id)).toEqual(['burger_diner', 'pizza_place']);
    expect(dailyRestaurants([])).toEqual([]);
  });
  it('a restaurant that is not owned never counts', () => {
    const r = recordDailyServe(emptyDailyGoal(), 'taco_truck', ['burger_diner'], D1);
    expect(r.next.counts).toEqual({});
    expect(r.reward).toBe(0);
  });
  it('an unknown restaurant id never counts', () => {
    expect(recordDailyServe(emptyDailyGoal(), 'sushi', ['burger_diner', 'sushi'], D1).next.counts).toEqual({});
  });
  it('a diner-only player needs 5 diner serves and nothing else', () => {
    const { s, reward } = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner']);
    expect(dailyProgress(s, ['burger_diner'])).toMatchObject({ complete: true, have: 5, need: 5 });
    expect(reward).toBe(DAILY_REWARD);
  });
});

describe('daily goal: progress', () => {
  it('uses the spec numbers', () => {
    expect(DAILY_SERVES).toBe(5);
    expect(DAILY_REWARD).toBeGreaterThan(0);
    expect(DAILY_REWARD).toBeLessThanOrEqual(100);
    expect(DAILY_RESTAURANTS.map((r) => r.id)).toEqual(ALL);
  });
  it('counts each restaurant on its own and caps at 5', () => {
    const { s } = serve(serve(emptyDailyGoal(), 'burger_diner', 7, ALL).s, 'taco_truck', 2, ALL);
    const p = dailyProgress(s, ALL);
    expect(p.rows.map((r) => [r.id, r.count, r.done])).toEqual([['burger_diner', 5, true], ['taco_truck', 2, false], ['pizza_place', 0, false]]);
    expect(p.have).toBe(7);
    expect(p.need).toBe(15);
    expect(p.complete).toBe(false);
  });
  it('is not complete when nothing is owned', () => {
    expect(dailyProgress(emptyDailyGoal(), []).complete).toBe(false);
  });
  it('needs all three when all three are owned', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ALL);
    const b = serve(a.s, 'taco_truck', 5, ALL);
    expect(b.reward).toBe(0);
    expect(dailyProgress(b.s, ALL).complete).toBe(false);
    const c = serve(b.s, 'pizza_place', 5, ALL);
    expect(c.reward).toBe(DAILY_REWARD);
    expect(dailyProgress(c.s, ALL).complete).toBe(true);
  });
});

describe('daily goal: reward claims', () => {
  it('pays exactly once, even if serving carries on', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner']);
    expect(a.s.claimed).toBe(true);
    const more = serve(a.s, 'burger_diner', 10, ['burger_diner']);
    expect(more.reward).toBe(0);
  });
  it('buying a restaurant after claiming does not pay a second time that day', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner']);
    const b = serve(a.s, 'taco_truck', 5, ['burger_diner', 'taco_truck']);
    expect(b.reward).toBe(0);
  });
  it('pays again on the next day', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner'], D1);
    const b = serve(a.s, 'burger_diner', 5, ['burger_diner'], D2);
    expect(b.reward).toBe(DAILY_REWARD);
  });
});

describe('daily goal: date changes', () => {
  it('a new day starts from zero and unclaimed', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner']).s;
    expect(rolloverDaily(a, D2)).toEqual({ day: D2, counts: {}, claimed: false });
  });
  it('the same day keeps the counts', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 3, ['burger_diner']).s;
    expect(rolloverDaily(a, D1)).toBe(a);
  });
  it('a clock set backwards keeps the saved day, so the reward cannot be claimed twice', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 5, ['burger_diner'], D2).s;
    expect(rolloverDaily(a, D1)).toBe(a);
    expect(serve(a, 'burger_diner', 5, ['burger_diner'], D1).reward).toBe(0);
  });
  it('an unreadable date changes nothing and never throws', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 3, ['burger_diner']).s;
    expect(rolloverDaily(a, 'nonsense')).toBe(a);
    expect(rolloverDaily(a, '2026-13-45')).toBe(a);
  });
  it('serving on a new day rolls over first', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 4, ALL).s;
    const r = recordDailyServe(a, 'burger_diner', ALL, D2);
    expect(r.next).toEqual({ day: D2, counts: { burger_diner: 1 }, claimed: false });
  });
  it('does not change the state it was given', () => {
    const a = serve(emptyDailyGoal(), 'burger_diner', 2, ALL).s;
    const copy = JSON.parse(JSON.stringify(a));
    recordDailyServe(a, 'burger_diner', ALL, D2);
    expect(a).toEqual(copy);
  });
});

describe('daily goal: save compatibility', () => {
  it('a new save starts empty', () => {
    expect(defaultSave().dailyGoal).toEqual({ day: '', counts: {}, claimed: false });
  });
  it('an old save without the field loads with an empty goal and keeps everything else', () => {
    const s = parseSave(JSON.stringify({ version: 2, level: 12, coins: 345, restaurants: ['burger_diner'], lastLoginDay: D1, loginStreak: 2 }));
    expect(s.dailyGoal).toEqual({ day: '', counts: {}, claimed: false });
    expect(s.level).toBe(12);
    expect(s.coins).toBe(345);
    expect(s.loginStreak).toBe(2);
  });
  it('survives a save and reload', () => {
    const a = { ...defaultSave(), dailyGoal: { day: D1, counts: { burger_diner: 5, taco_truck: 2 }, claimed: false } };
    expect(parseSave(JSON.stringify(a)).dailyGoal).toEqual(a.dailyGoal);
  });
  it('junk becomes an empty goal', () => {
    for (const junk of ['x', 7, null, [], { day: 5 }, { day: '2026-99-99' }, { day: 'nope', counts: { a: 1 } }]) {
      expect(parseSave(JSON.stringify({ dailyGoal: junk })).dailyGoal).toEqual({ day: '', counts: {}, claimed: false });
    }
  });
  it('bad counts are cleaned and a non-true claimed flag is false', () => {
    const s = parseSave(JSON.stringify({ dailyGoal: { day: D1, counts: { burger_diner: 'a', taco_truck: 3.9 }, claimed: 'yes' } }));
    expect(s.dailyGoal).toEqual({ day: D1, counts: { taco_truck: 3 }, claimed: false });
  });
  it('does not touch the login bonus fields', () => {
    const s = parseSave(JSON.stringify({ lastLoginDay: D1, loginStreak: 3, dailyGoal: { day: D2, counts: {}, claimed: true } }));
    expect(s.lastLoginDay).toBe(D1);
    expect(s.loginStreak).toBe(3);
  });
});
