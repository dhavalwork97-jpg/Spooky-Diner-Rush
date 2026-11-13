import { describe, expect, it } from 'vitest';
import { defaultExtras, localDateKey } from '../src/game/extras';
import { LOGIN_REWARDS, checkLogin, dayNumber, rewardForStreak, tomorrowReward, type LoginState } from '../src/game/loginBonus';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

const st = (lastLoginDay: string, loginStreak: number): LoginState => ({ lastLoginDay, loginStreak });

describe('daily login bonus', () => {
  it('rewards 25 / 50 / 100 and starts the cycle again', () => {
    expect(LOGIN_REWARDS).toEqual([25, 50, 100]);
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => rewardForStreak(n).coins)).toEqual([25, 50, 100, 25, 50, 100, 25]);
    expect([1, 2, 3, 4].map((n) => rewardForStreak(n).day)).toEqual([1, 2, 3, 1]);
  });

  it('a brand-new player is recorded as day 1 with no reward and no popup', () => {
    const r = checkLogin(st('', 0), '2026-11-13', false);
    expect(r.reward).toBe(0);
    expect(r.next).toEqual(st('2026-11-13', 1));
  });

  it('the next day pays day 2 (+50)', () => {
    const r = checkLogin(st('2026-11-13', 1), '2026-11-14', true);
    expect(r).toEqual({ next: st('2026-11-14', 2), reward: 50, day: 2 });
  });

  it('day 3 pays 100, day 4 wraps to 25', () => {
    expect(checkLogin(st('2026-11-14', 2), '2026-11-15', true).reward).toBe(100);
    const r = checkLogin(st('2026-11-15', 3), '2026-11-16', true);
    expect(r.reward).toBe(25);
    expect(r.next.loginStreak).toBe(4);
  });

  it('a missed day restarts the streak at day 1', () => {
    const r = checkLogin(st('2026-11-14', 2), '2026-11-16', true);
    expect(r).toEqual({ next: st('2026-11-16', 1), reward: 25, day: 1 });
  });

  it('the same day pays nothing and changes nothing', () => {
    const s = st('2026-11-14', 2);
    const r = checkLogin(s, '2026-11-14', true);
    expect(r.reward).toBe(0);
    expect(r.next).toBe(s);
  });

  it('a clock that goes backwards pays nothing, keeps the saved day, and cannot be used to claim twice', () => {
    const s = st('2026-11-14', 2);
    const back = checkLogin(s, '2026-11-10', true);
    expect(back.reward).toBe(0);
    expect(back.next).toEqual(s);
    // going forward again to the same day still pays nothing
    expect(checkLogin(back.next, '2026-11-14', true).reward).toBe(0);
  });

  it('crosses month and year ends and a leap day', () => {
    expect(checkLogin(st('2026-12-31', 1), '2027-01-01', true).reward).toBe(50);
    expect(checkLogin(st('2028-02-28', 1), '2028-02-29', true).reward).toBe(50);
    expect(checkLogin(st('2028-02-29', 1), '2028-03-01', true).reward).toBe(50);
    expect(checkLogin(st('2026-02-28', 1), '2026-03-01', true).reward).toBe(50); // 2026 is not a leap year
  });

  it('a player with progress but no saved day (a save from before this feature) gets day 1', () => {
    const r = checkLogin(st('', 0), '2026-11-13', true);
    expect(r).toEqual({ next: st('2026-11-13', 1), reward: 25, day: 1 });
  });

  it('never throws on junk dates', () => {
    for (const bad of ['', 'x', '2026-13-40', '2026-02-30', '99999-01-01', '2026/11/13']) {
      expect(() => checkLogin(st('2026-11-13', 1), bad, true)).not.toThrow();
      expect(checkLogin(st('2026-11-13', 1), bad, true).reward).toBe(0);
      expect(() => checkLogin(st(bad, 3), '2026-11-13', true)).not.toThrow();
    }
    expect(dayNumber('2026-02-30')).toBeNull();
    expect(dayNumber('2026-11-13')).not.toBeNull();
  });

  it('a bad streak number is repaired, not trusted', () => {
    const r = checkLogin(st('2026-11-13', -5), '2026-11-14', true);
    expect(r.next.loginStreak).toBe(1);
  });

  it("tells tomorrow's reward for the teaser line", () => {
    expect(tomorrowReward(st('2026-11-13', 1))).toBe(50);
    expect(tomorrowReward(st('2026-11-13', 2))).toBe(100);
    expect(tomorrowReward(st('2026-11-13', 3))).toBe(25);
  });

  it('works with the same date helper as the Daily Special', () => {
    expect(dayNumber(localDateKey(new Date(2026, 10, 13)))).toBe(dayNumber('2026-11-13'));
    expect(dayNumber(localDateKey(new Date(2026, 10, 14)))! - dayNumber(localDateKey(new Date(2026, 10, 13)))!).toBe(1);
  });
});

describe('login fields in the save', () => {
  it('have defaults, so old saves load', () => {
    expect(defaultSave().lastLoginDay).toBe('');
    expect(defaultSave().loginStreak).toBe(0);
    const old = parseSave(JSON.stringify({ version: 2, level: 7, xp: 3, coins: 50 }));
    expect(old.level).toBe(7);
    expect(old.lastLoginDay).toBe('');
    expect(old.loginStreak).toBe(0);
  });
  it('round-trip, and bad values fall back', () => {
    const s = parseSave(JSON.stringify({ lastLoginDay: '2026-11-13', loginStreak: 2 }));
    expect([s.lastLoginDay, s.loginStreak]).toEqual(['2026-11-13', 2]);
    const bad = parseSave(JSON.stringify({ lastLoginDay: 'soon', loginStreak: 'many' }));
    expect([bad.lastLoginDay, bad.loginStreak]).toEqual(['', 0]);
    expect(parseSave(JSON.stringify({ loginStreak: -4 })).loginStreak).toBe(0);
    expect(parseSave(JSON.stringify({ loginStreak: 1e12 })).loginStreak).toBe(100000);
  });
});

describe('Daily Special level', () => {
  it('starts at Lv 3', () => expect(defaultExtras.dailySpecial.fromLevel).toBe(3));
});
