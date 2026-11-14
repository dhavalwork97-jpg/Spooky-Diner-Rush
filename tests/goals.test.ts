import { describe, expect, it } from 'vitest';
import { defaultConfig, levelDef } from '../src/game/config';
import { GOALS_FROM_LEVEL, GOAL_STALE_SECONDS, GoalTracker, goalReward, goalsUnlocked, toGoalEvent, type GoalEnv, type GoalEvent } from '../src/game/goals';
import { KitchenState, type GameEvent } from '../src/game/KitchenState';
import { play } from './helpers/bot';

const cfg = defaultConfig;
const envFor = (level: number): GoalEnv => ({ level, items: levelDef(cfg, level).items, itemName: (k) => cfg.recipes.items[k].name, maxCombo: cfg.combo.maxCombo });
const done = (fast: boolean, coins = 30): GoalEvent => ({ type: 'orderDone', fast, coins });

/** A tracker whose first goal is of the wanted kind (seeds are tried until the picker lands on it). */
function trackerWith(kind: string, level = 5) {
  for (let seed = 1; seed < 400; seed++) {
    const t = new GoalTracker(seed);
    if (t.ensure(envFor(level)).kind === kind) return t;
  }
  throw new Error('no seed gives ' + kind);
}

describe('mini-goals: picking', () => {
  it('is deterministic for a seed', () => {
    const a = new GoalTracker(7);
    const b = new GoalTracker(7);
    for (let i = 0; i < 20; i++) {
      expect(a.ensure(envFor(6))).toEqual(b.ensure(envFor(6)));
      a.current = null;
      b.current = null;
    }
  });
  it('always has one goal once asked, and never repeats a kind back to back', () => {
    const t = new GoalTracker(3);
    let last = '';
    for (let i = 0; i < 60; i++) {
      t.current = null;
      const g = t.ensure(envFor(8));
      expect(g.target).toBeGreaterThan(0);
      expect(g.progress).toBe(0);
      expect(g.kind).not.toBe(last);
      last = g.kind;
    }
  });
  it('an item goal picks from what customers are waiting for when something is', () => {
    const t = new GoalTracker(5);
    for (let i = 0; i < 80; i++) {
      t.current = null;
      const g = t.ensure({ ...envFor(8), wanted: ['pizza'] });
      if (g.kind === 'item') expect(g.item).toBe('pizza');
    }
  });
  it('only asks for items on the menu at that level', () => {
    for (const level of [3, 4, 5, 8, 12]) {
      const allowed = levelDef(cfg, level).items;
      const t = new GoalTracker(level);
      for (let i = 0; i < 80; i++) {
        t.current = null;
        const g = t.ensure(envFor(level));
        if (g.kind === 'item') expect(allowed).toContain(g.item);
      }
    }
  });
  it('scales with the level and caps its reward', () => {
    expect(goalReward(3).coins).toBeLessThan(goalReward(10).coins);
    expect(goalReward(200)).toEqual({ coins: 40, xp: 30 });
    const t = trackerWith('orders', 3);
    const early = t.current!.target;
    const late = (() => {
      const l = new GoalTracker(1);
      for (let i = 0; i < 100; i++) {
        l.current = null;
        const g = l.ensure(envFor(30));
        if (g.kind === 'orders') return g.target;
      }
      return 0;
    })();
    expect(late).toBeGreaterThanOrEqual(early);
  });
  it('only combo goals within the combo limit', () => {
    const t = new GoalTracker(2);
    for (let i = 0; i < 80; i++) {
      t.current = null;
      const g = t.ensure({ ...envFor(30), maxCombo: 4 });
      if (g.kind === 'combo') expect(g.target).toBeLessThanOrEqual(4);
    }
    const few = new GoalTracker(2);
    for (let i = 0; i < 80; i++) {
      few.current = null;
      expect(few.ensure({ ...envFor(5), maxCombo: 2 }).kind).not.toBe('combo');
    }
  });
});

describe('mini-goals: counting', () => {
  it('orders: counts every finished order and pays out once', () => {
    const t = trackerWith('orders');
    const target = t.current!.target;
    for (let i = 0; i < target - 1; i++) expect(t.onEvent(done(false), envFor(5))).toBeNull();
    const g = t.onEvent(done(false), envFor(5));
    expect(g?.kind).toBe('orders');
    expect(t.completed).toBe(1);
    expect(t.current).not.toBe(g); // the next goal is already active
    expect(t.current!.progress).toBe(0);
  });
  it('fast in a row: a slow order or an angry customer starts it over', () => {
    const t = trackerWith('fastRow');
    const target = t.current!.target;
    t.onEvent(done(true), envFor(5));
    t.onEvent(done(false), envFor(5));
    expect(t.current!.progress).toBe(0);
    t.onEvent(done(true), envFor(5));
    t.onEvent({ type: 'angryLeave' }, envFor(5));
    expect(t.current!.progress).toBe(0);
    let got = null;
    for (let i = 0; i < target; i++) got = t.onEvent(done(true), envFor(5));
    expect(got?.kind).toBe('fastRow');
  });
  it('item: only deliveries of that item count', () => {
    const t = trackerWith('item');
    const item = t.current!.item!;
    const other = levelDef(cfg, 5).items.find((k) => k !== item)!;
    t.onEvent({ type: 'deliver', item: other }, envFor(5));
    t.onEvent({ type: 'deliver' }, envFor(5));
    expect(t.current!.progress).toBe(0);
    const target = t.current!.target;
    let got = null;
    for (let i = 0; i < target && !got; i++) got = t.onEvent({ type: 'deliver', item }, envFor(5));
    expect(got?.item).toBe(item);
  });
  it('coins: adds up what orders pay', () => {
    const t = trackerWith('coins');
    const target = t.current!.target;
    expect(t.onEvent(done(false, target - 1), envFor(5))).toBeNull();
    expect(t.onEvent(done(false, 1), envFor(5))?.kind).toBe('coins');
  });
  it('combo: reaching the combo count completes it, a lower combo does not', () => {
    const t = trackerWith('combo');
    const target = t.current!.target;
    expect(t.onEvent({ type: 'comboChanged', combo: target - 1 }, envFor(5))).toBeNull();
    expect(t.onEvent({ type: 'comboChanged', combo: target }, envFor(5))?.kind).toBe('combo');
  });
  it('ignores events with no goal active', () => {
    expect(new GoalTracker(1).onEvent(done(true), envFor(5))).toBeNull();
  });
  it('a goal nobody progresses on is swapped after a while, without a reward', () => {
    const t = new GoalTracker(4);
    const first = t.ensure(envFor(5));
    t.tick(GOAL_STALE_SECONDS - 1, envFor(5));
    expect(t.current).toBe(first);
    t.tick(2, envFor(5));
    expect(t.current).not.toBe(first);
    expect(t.completed).toBe(0);
  });
  it('after a stale skill goal the next picks are plain ones', () => {
    const t = trackerWith('fastRow');
    t.tick(GOAL_STALE_SECONDS + 1, envFor(5));
    for (let i = 0; i < 3; i++) {
      expect(['fastRow', 'combo']).not.toContain(t.current!.kind);
      t.current = null;
      t.ensure(envFor(5));
    }
  });
  it('progress resets the stale timer', () => {
    const t = trackerWith('orders');
    const first = t.current!;
    t.tick(GOAL_STALE_SECONDS - 5, envFor(5));
    t.onEvent(done(false), envFor(5));
    t.tick(GOAL_STALE_SECONDS - 5, envFor(5));
    expect(t.current).toBe(first);
  });
});

describe('mini-goals: kitchen events', () => {
  it('maps the events it needs and ignores the rest', () => {
    const itemOf = () => 'burger' as const;
    const deliver: GameEvent = { type: 'deliver', customer: 1, slot: 0, itemIndex: 0 };
    expect(toGoalEvent(deliver, itemOf)).toEqual({ type: 'deliver', item: 'burger' });
    expect(toGoalEvent({ type: 'comboChanged', combo: 3, max: 8, broken: false }, itemOf)).toEqual({ type: 'comboChanged', combo: 3 });
    expect(toGoalEvent({ type: 'angryLeave', customer: 1 }, itemOf)).toEqual({ type: 'angryLeave' });
    expect(toGoalEvent({ type: 'closed' }, itemOf)).toBeNull();
    expect(toGoalEvent({ type: 'streakBonus', xp: 5 }, itemOf)).toBeNull();
  });
  it('awardGoal pays coins and XP and touches nothing else', () => {
    const s = new KitchenState({ level: 5, xp: 0, coins: 100 }, cfg, 1);
    s.combo = 3;
    s.streak = 4;
    const rep = s.reputation;
    s.awardGoal(25, 12);
    expect(s.coins).toBe(125);
    expect(s.xp).toBe(12);
    expect([s.combo, s.streak, s.reputation]).toEqual([3, 4, rep]);
  });
  it('awardGoal can level the player up like any other XP', () => {
    const s = new KitchenState({ level: 5, xp: 0, coins: 0 }, cfg, 1);
    s.awardGoal(0, s.xpNeeded + 1);
    expect(s.level).toBe(6);
    expect(s.drainEvents().some((e) => e.type === 'levelUp')).toBe(true);
  });
  it('goals are off in the tutorial levels', () => {
    expect(GOALS_FROM_LEVEL).toBeGreaterThanOrEqual(3);
  });
  it('goalsUnlocked: never at Lv 1, at Lv 2 only after its tutorial, always from Lv 3', () => {
    expect(goalsUnlocked(1, true)).toBe(false);
    expect(goalsUnlocked(1, false)).toBe(false);
    expect(goalsUnlocked(2, true)).toBe(false);
    expect(goalsUnlocked(2, false)).toBe(true);
    expect(goalsUnlocked(3, true)).toBe(true);
    expect(goalsUnlocked(3, false)).toBe(true);
    expect(goalsUnlocked(12, false)).toBe(true);
  });
  it('the first goals at Lv 2 are plain ones (orders, coins or one item), never fast-in-a-row or combo', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = new GoalTracker(seed);
      const g = t.ensure(envFor(2));
      expect(['orders', 'coins', 'item']).toContain(g.kind);
      // Finish several goals in a row: every goal that follows is a plain one too.
      for (let done = 0; done < 6; done++) {
        const before = t.completed;
        for (let i = 0; i < 12 && t.completed === before; i++) {
          t.onEvent({ type: 'deliver', item: t.current!.item ?? 'fries' }, envFor(2));
          t.onEvent({ type: 'orderDone', fast: false, coins: 60 }, envFor(2));
        }
        expect(t.completed).toBe(before + 1);
        expect(['orders', 'coins', 'item']).toContain(t.current!.kind);
      }
    }
  });
});

describe('mini-goals: pace with a bot (no upgrades, Lv 3-8)', () => {
  it('a goal is finished about every 25-70 seconds for average and casual bots', () => {
    for (const [reaction, name] of [[1.5, 'average'], [2.5, 'casual']] as const) {
      let total = 0;
      let count = 0;
      for (const seed of [1, 2, 3]) {
        const tracker = new GoalTracker(seed);
        let lastAt = -1;
        const gaps: number[] = [];
        play(seed, reaction, 480, {
          onEvent: (e, s, t) => {
            if (s.level < GOALS_FROM_LEVEL) return;
            if (lastAt < 0) lastAt = t;
            const env = { ...envFor(s.level), wanted: s.customers.filter((c) => c.mood === 'waiting').flatMap((c) => c.items.filter((_, i) => !c.delivered[i])) };
            tracker.ensure(env);
            const ge = toGoalEvent(e, (c, i) => s.customers.find((x) => x.id === c)?.items[i]);
            if (ge && tracker.onEvent(ge, env)) {
              gaps.push(t - lastAt);
              lastAt = t;
            }
          },
        });
        total += gaps.reduce((a, b) => a + b, 0);
        count += gaps.length;
      }
      const mean = total / Math.max(1, count);
      expect(count, name).toBeGreaterThan(6);
      expect(mean, name).toBeGreaterThan(22);
      expect(mean, name).toBeLessThan(70);
    }
  }, 120000);
});
