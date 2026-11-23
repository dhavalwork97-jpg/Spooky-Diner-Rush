import { describe, expect, it } from 'vitest';
import { goalReward, GOAL_STALE_SECONDS } from '../src/game/goals';
import { PIZZA_GOAL_TARGETS, PizzaGoalTracker, pizzaGoalPool, toPizzaGoalEvent, type PizzaGoalEnv, type PizzaGoalEvent } from '../src/game/pizza/pizzaGoals';

const env: PizzaGoalEnv = { level: 30, comboPossible: true, customPossible: true };

/** A tracker whose current goal is the one with this text. */
function trackerFor(text: string, e: PizzaGoalEnv = env): PizzaGoalTracker {
  for (let seed = 1; seed < 400; seed++) {
    const t = new PizzaGoalTracker(seed);
    if (t.ensure(e).text === text) return t;
  }
  throw new Error(`no seed gives ${text}`);
}
const feed = (t: PizzaGoalTracker, events: PizzaGoalEvent[], e = env) => events.map((ev) => t.onEvent(ev, e));

describe('pizza goals: the picker', () => {
  it('targets are the spec numbers', () => {
    expect(PIZZA_GOAL_TARGETS).toEqual({ fastRow: 3, bake: 3, comboMeal: 2, perfect: 3, custom: 3 });
  });
  it('combo and custom goals only come up when the menu can make them', () => {
    expect(pizzaGoalPool({ level: 30, comboPossible: false, customPossible: false })).toEqual(['fastRow', 'bake', 'perfect']);
    expect(pizzaGoalPool(env)).toEqual(['fastRow', 'bake', 'perfect', 'comboMeal', 'custom']);
  });
  it('every kind comes up eventually and never the same kind twice in a row', () => {
    const seen = new Set<string>();
    const t = new PizzaGoalTracker(7);
    let last = '';
    for (let i = 0; i < 60; i++) {
      const g = t.ensure(env);
      expect(g.text).not.toBe(last);
      last = g.text;
      seen.add(g.text);
      t.current = null; // force a new pick
    }
    expect(seen.size).toBe(5);
  });
  it('rewards use the shared goal reward for the level', () => {
    const g = new PizzaGoalTracker(3).ensure(env);
    expect({ coins: g.coins, xp: g.xp }).toEqual(goalReward(30));
  });
  it('goal text is plain words with no level wording at all', () => {
    for (const text of ['Serve 3 customers quickly in a row', 'Bake 3 pizzas', 'Serve 2 combo meals', 'Make 3 perfect bakes', 'Serve 3 custom pizzas']) {
      expect(trackerFor(text).current!.text).toBe(text);
      expect(text).not.toMatch(/\b(Lv|level)\b/i);
    }
  });
});

describe('pizza goals: counting', () => {
  it('quick serves in a row: 3 fast serves complete it, a slow one resets, an angry leave resets', () => {
    const t = trackerFor('Serve 3 customers quickly in a row');
    feed(t, [{ type: 'orderDone', fast: true }, { type: 'orderDone', fast: true }]);
    expect(t.current!.progress).toBe(2);
    feed(t, [{ type: 'orderDone', fast: false }]);
    expect(t.current!.progress).toBe(0);
    feed(t, [{ type: 'orderDone', fast: true }, { type: 'angryLeave' }]);
    expect(t.current!.progress).toBe(0);
    const done = feed(t, [1, 2, 3].map(() => ({ type: 'orderDone', fast: true }) as PizzaGoalEvent));
    expect(done[2]?.text).toBe('Serve 3 customers quickly in a row');
    expect(t.completed).toBe(1);
  });
  it('bake 3 counts pizzas taken out good to eat, not burnt ones', () => {
    const t = trackerFor('Bake 3 pizzas');
    feed(t, [{ type: 'collect', phase: 'ready' }, { type: 'collect', phase: 'burnt' }, { type: 'collect', phase: 'cooking' }, { type: 'collect', phase: 'warning' }]);
    expect(t.current!.progress).toBe(2);
    expect(feed(t, [{ type: 'collect', phase: 'ready' }])[0]).not.toBeNull();
  });
  it('combo meals', () => {
    const t = trackerFor('Serve 2 combo meals');
    expect(feed(t, [{ type: 'comboMeal' }, { type: 'comboMeal' }])[1]).not.toBeNull();
  });
  it('perfect bakes', () => {
    const t = trackerFor('Make 3 perfect bakes');
    const out = feed(t, [{ type: 'perfectBake' }, { type: 'perfectBake' }, { type: 'perfectBake' }]);
    expect(out.map((o) => !!o)).toEqual([false, false, true]);
  });
  it('custom pizzas count only build-your-own deliveries', () => {
    const t = trackerFor('Serve 3 custom pizzas');
    feed(t, [{ type: 'deliver', dish: 'cheese_pizza' }, { type: 'deliver', dish: 'custom:sauce:tomato+cheese:mozzarella' }]);
    expect(t.current!.progress).toBe(1);
  });
  it('events for other goals change nothing', () => {
    const t = trackerFor('Bake 3 pizzas');
    feed(t, [{ type: 'comboMeal' }, { type: 'perfectBake' }, { type: 'orderDone', fast: true }]);
    expect(t.current!.progress).toBe(0);
  });
  it('after a goal is completed a different one is active, with no progress', () => {
    const t = trackerFor('Serve 2 combo meals');
    feed(t, [{ type: 'comboMeal' }, { type: 'comboMeal' }]);
    expect(t.current!.text).not.toBe('Serve 2 combo meals');
    expect(t.current!.progress).toBe(0);
  });
  it('a goal nobody progresses is swapped after the shared stale time; progress holds it', () => {
    const t = trackerFor('Make 3 perfect bakes');
    t.tick(GOAL_STALE_SECONDS - 1, env);
    expect(t.current!.text).toBe('Make 3 perfect bakes');
    feed(t, [{ type: 'perfectBake' }]);
    t.tick(GOAL_STALE_SECONDS - 1, env);
    expect(t.current!.text).toBe('Make 3 perfect bakes');
    t.tick(2, env);
    expect(t.current!.text).not.toBe('Make 3 perfect bakes');
  });
  it('uses the shared goal shape so the shared banner can draw it', () => {
    const g = new PizzaGoalTracker(1).ensure(env);
    expect(g).toMatchObject({ kind: 'orders', progress: 0 });
    expect(g.target).toBeGreaterThan(0);
  });
});

describe('pizza goals: event translation', () => {
  it('keeps only the events the goals use', () => {
    expect(toPizzaGoalEvent({ type: 'comboMeal', customer: 1, coins: 3, xp: 1 })).toEqual({ type: 'comboMeal' });
    expect(toPizzaGoalEvent({ type: 'collect', slot: 0, board: 0, phase: 'ready' })).toEqual({ type: 'collect', phase: 'ready' });
    expect(toPizzaGoalEvent({ type: 'perfectBake', where: 'oven', index: 0 })).toEqual({ type: 'perfectBake' });
    expect(toPizzaGoalEvent({ type: 'wobble', where: 'oven', index: 0 })).toBeNull();
    expect(toPizzaGoalEvent({ type: 'ticketDone', ticket: 1, coins: 1, xp: 1 })).toBeNull();
  });
});
