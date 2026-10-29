import { describe, expect, it } from 'vitest';
import { ChefTalk } from '../src/game/chef';
import { defaultConfig, type ChefConfig } from '../src/game/config';
import type { GameEvent } from '../src/game/KitchenState';
import { makeRng } from '../src/game/rng';
import { validateChef } from '../src/data/validate';

const cfg = defaultConfig.chef;
const talk = (c: ChefConfig = cfg, seed = 1) => new ChefTalk(c, makeRng(seed));
const order = (rush = false): GameEvent => ({ type: 'orderDone', customer: 1, coins: 10, tip: 0, xp: 20, fast: true, rush, combo: 1, mult: 1 });
const burnt: GameEvent = { type: 'burnt', where: 'vat', index: 0 };

describe('chef data', () => {
  it('passes validation', () => {
    expect(validateChef(cfg)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateChef({ cooldown: -1, triggerCooldown: 5, hold: 'x', triggers: { burn: { lines: [''] }, nope: { lines: ['a'] } } }).join('\n');
    expect(errs).toMatch(/cooldown must be/);
    expect(errs).toMatch(/hold must be/);
    expect(errs).toMatch(/missing trigger/);
    expect(errs).toMatch(/unknown trigger nope/);
    expect(errs).toMatch(/empty or over 60/);
    expect(validateChef({})).not.toEqual([]);
  });
});

describe('ChefTalk', () => {
  it('the first order says the first-serve line, once only', () => {
    const t = talk();
    expect(t.onEvent(order(), 0)?.trigger).toBe('first_serve');
    expect(t.onEvent(order(), 1000)).toBeNull(); // second plain order says nothing
    const t2 = talk();
    t2.say('first_serve', 0);
    expect(t2.say('first_serve', 5000)).toBeNull();
  });

  it('a rush order after the first one says the rush line', () => {
    const t = talk();
    t.onEvent(order(), 0);
    expect(t.onEvent(order(true), 100)?.trigger).toBe('rush');
  });

  it('respects the global cooldown, then speaks again', () => {
    const t = talk();
    expect(t.onEvent(burnt, 0)?.trigger).toBe('burn');
    expect(t.onEvent({ type: 'angryLeave', customer: 1 }, cfg.cooldown - 0.1)).toBeNull();
    expect(t.onEvent({ type: 'angryLeave', customer: 1 }, cfg.cooldown)?.trigger).toBe('angry');
  });

  it('respects the per-trigger cooldown', () => {
    const t = talk();
    expect(t.onEvent(burnt, 0)).not.toBeNull();
    expect(t.onEvent(burnt, cfg.cooldown + 1)).toBeNull();
    expect(t.onEvent(burnt, cfg.triggerCooldown)).not.toBeNull();
  });

  it('a level-up (priority) speaks even during cooldown', () => {
    const t = talk();
    t.onEvent(burnt, 0);
    expect(t.onEvent({ type: 'levelUp', level: 2, coins: 30, unlocks: [] }, 1)?.trigger).toBe('level_up');
  });

  it('never repeats the same line twice in a row for a trigger', () => {
    const c: ChefConfig = { ...cfg, cooldown: 0, triggerCooldown: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const t = talk(c, seed);
      let prev = '';
      for (let i = 0; i < 30; i++) {
        const l = t.say('burn', i);
        expect(l).not.toBeNull();
        expect(l!.text).not.toBe(prev);
        prev = l!.text;
      }
    }
  });

  it('a trigger with one line may repeat it', () => {
    const c: ChefConfig = { cooldown: 0, triggerCooldown: 0, hold: 2, triggers: { burn: { lines: ['Oops'] } } };
    const t = talk(c);
    expect(t.say('burn', 0)?.text).toBe('Oops');
    expect(t.say('burn', 1)?.text).toBe('Oops');
  });

  it('combo speaks at 3 and at the max, not when broken or in between', () => {
    const c: ChefConfig = { ...cfg, cooldown: 0, triggerCooldown: 0 };
    const t = talk(c);
    const ev = (combo: number, broken = false): GameEvent => ({ type: 'comboChanged', combo, max: 8, broken });
    expect(t.onEvent(ev(2), 0)).toBeNull();
    expect(t.onEvent(ev(3), 1)?.trigger).toBe('combo');
    expect(t.onEvent(ev(5), 2)).toBeNull();
    expect(t.onEvent(ev(8), 3)?.trigger).toBe('combo');
    expect(t.onEvent(ev(0, true), 4)).toBeNull();
  });

  it('returns the hold time from data, and ignores unknown triggers and events', () => {
    const t = talk();
    expect(t.say('burn', 0)?.hold).toBe(cfg.hold);
    expect(t.say('nope', 100)).toBeNull();
    expect(t.onEvent({ type: 'reopened' }, 200)).toBeNull();
  });

  it('is repeatable for a given seed', () => {
    const run = (seed: number) => {
      const t = talk({ ...cfg, cooldown: 0, triggerCooldown: 0 }, seed);
      return Array.from({ length: 6 }, (_, i) => t.say('combo', i)!.text);
    };
    expect(run(7)).toEqual(run(7));
  });
});
