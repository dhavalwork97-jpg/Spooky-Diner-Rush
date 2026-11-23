import { describe, expect, it } from 'vitest';
import { GOAL_BANNER_TIMING as T, GoalBannerTimer, type GoalBannerInput } from '../src/game/goalBannerTiming';

const base: GoalBannerInput = { key: 'Serve 3 orders', progress: 0, completed: 0, blocked: false, reduceMotion: false };
const run = (t: GoalBannerTimer, ms: number, input: Partial<GoalBannerInput> = {}) => {
  let f = t.update(0, { ...base, ...input });
  for (let i = 0; i < ms / 100; i++) f = t.update(100, { ...base, ...input });
  return f;
};

describe('goal banner timing (pure)', () => {
  it('a new goal fades in, stays about 6 s, fades out over 0.6 s, then hides', () => {
    const t = new GoalBannerTimer();
    expect(t.update(0, base).visible).toBe(true);
    expect(run(t, 400).alpha).toBe(1);
    expect(run(t, T.initialMs - 600).visible).toBe(true);
    const mid = run(t, T.fadeMs / 2);
    expect(mid.visible).toBe(true);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(run(t, 1000)).toEqual({ visible: false, alpha: 0 });
  });
  it('fades in rather than popping', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    expect(t.update(100, base).alpha).toBeLessThan(1);
  });
  it('progress brings it back for about 3 s', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 8000);
    expect(t.update(100, { ...base, progress: 1 }).visible).toBe(true);
    expect(run(t, T.progressMs - 400, { progress: 1 }).visible).toBe(true);
    expect(run(t, 1500, { progress: 1 }).visible).toBe(false);
  });
  it('a progress change does not shorten the long first display', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 1000);
    run(t, 100, { progress: 1 });
    expect(run(t, 4000, { progress: 1 }).visible).toBe(true);
  });
  it('completion shows for about 3 s', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 8000);
    expect(t.update(100, { ...base, completed: 1, progress: 3 }).visible).toBe(true);
    expect(run(t, 2000, { completed: 1, progress: 3 }).visible).toBe(true);
    expect(run(t, 2000, { completed: 1, progress: 3 }).visible).toBe(false);
  });
  it('a replacement goal gets the 6 s display', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 8000);
    const next = { key: 'Earn 100 coins', progress: 0, completed: 1 };
    t.update(100, { ...base, ...next });
    expect(run(t, 5000, next).visible).toBe(true);
    expect(run(t, 2000, next).visible).toBe(false);
  });
  it('an overlay hides it at once and it returns when the overlay closes', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 8000);
    expect(t.update(100, { ...base, blocked: true })).toEqual({ visible: false, alpha: 0 });
    expect(run(t, 10000, { blocked: true }).visible).toBe(false);
    expect(t.update(100, base).visible).toBe(true);
    expect(run(t, 2000).visible).toBe(true);
    expect(run(t, 2000).visible).toBe(false);
  });
  it('tutorial, level-up card and Lv 1-2 tutorial all count as blocked: never visible while blocked', () => {
    const t = new GoalBannerTimer();
    for (let i = 0; i < 100; i++) expect(t.update(100, { ...base, blocked: true, progress: i }).visible).toBe(false);
  });
  it('hidden goals keep tracking: progress made while blocked still shows on return', () => {
    const t = new GoalBannerTimer();
    t.update(0, base);
    run(t, 8000);
    run(t, 500, { blocked: true });
    t.update(100, { ...base, blocked: true, progress: 2 });
    expect(t.update(100, { ...base, progress: 2 }).visible).toBe(true);
  });
  it('no goal means hidden, and the first goal after that shows for 6 s', () => {
    const t = new GoalBannerTimer();
    expect(t.update(100, { ...base, key: null }).visible).toBe(false);
    t.update(0, base);
    expect(run(t, 5000).visible).toBe(true);
  });
  it('reduced motion: never a fade, but shows and hides at the same times', () => {
    const a = new GoalBannerTimer();
    const b = new GoalBannerTimer();
    const rm = { reduceMotion: true };
    const seen: [boolean, boolean][] = [];
    for (let i = 0; i < 90; i++) {
      const fa = a.update(100, base);
      const fb = b.update(100, { ...base, ...rm });
      expect(fb.alpha === 0 || fb.alpha === 1).toBe(true);
      seen.push([fa.visible, fb.visible]);
    }
    expect(seen.every(([x, y]) => x === y)).toBe(true);
    expect(seen[0][1]).toBe(true);
    expect(seen[89][1]).toBe(false);
  });
});
