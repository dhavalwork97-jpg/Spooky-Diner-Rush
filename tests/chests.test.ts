import { describe, expect, it } from 'vitest';
import { defaultChests, dueChests, openedAfter, validateChests, type ChestDef } from '../src/game/chests';

describe('milestone chests (data)', () => {
  it('are at Lv 5, 10 and 14 and pay 100, 200 and 350 coins', () => {
    expect(defaultChests.map((c) => [c.level, c.coins])).toEqual([[5, 100], [10, 200], [14, 350]]);
  });
  it('pass validation', () => {
    expect(validateChests(defaultChests, defaultConfig.decor.items.filter((d) => d.chestOnly).map((d) => d.id))).toEqual([]);
  });
  it('validation catches bad data', () => {
    const bad: ChestDef[] = [
      { id: 'a', level: 5, title: 'Chest', coins: 100 },
      { id: 'a', level: 5, title: '', coins: 0 },
      { id: 'b', level: 1, title: 'Chest', coins: 50, decorId: 'nope' },
    ];
    const errs = validateChests(bad);
    expect(errs.some((e) => e.includes('duplicate id'))).toBe(true);
    expect(errs.some((e) => e.includes('already has a chest'))).toBe(true);
    expect(errs.some((e) => e.includes('title'))).toBe(true);
    expect(errs.some((e) => e.includes('coins'))).toBe(true);
    expect(errs.some((e) => e.includes('level must'))).toBe(true);
    expect(errs.some((e) => e.includes('decorId'))).toBe(true);
  });
});

describe('which chests are due', () => {
  it('none below Lv 5', () => {
    expect(dueChests(defaultChests, 4, [])).toEqual([]);
  });
  it('one at Lv 5, and not again once claimed', () => {
    expect(dueChests(defaultChests, 5, []).map((c) => c.level)).toEqual([5]);
    expect(dueChests(defaultChests, 5, [5])).toEqual([]);
  });
  it('a player already at Lv 12 gets one claim per missed chest, lowest first', () => {
    expect(dueChests(defaultChests, 12, []).map((c) => c.level)).toEqual([5, 10]);
    expect(dueChests(defaultChests, 12, [5]).map((c) => c.level)).toEqual([10]);
  });
  it('Lv 14 gives all three to a brand new save at Lv 14', () => {
    expect(dueChests(defaultChests, 14, []).map((c) => c.level)).toEqual([5, 10, 14]);
  });
  it('openedAfter never repeats a Lv and stays sorted', () => {
    expect(openedAfter([10], defaultChests[0])).toEqual([5, 10]);
    expect(openedAfter([5], defaultChests[0])).toEqual([5]);
  });
});

import { KitchenState } from '../src/game/KitchenState';
import { defaultConfig } from '../src/game/config';

describe('awardChest (model)', () => {
  it('adds the coins and nothing else', () => {
    const k = new KitchenState({ level: 5, xp: 7, coins: 20 }, undefined, 1);
    const before = { xp: k.xp, level: k.level, rep: k.reputation };
    k.awardChest(100);
    expect(k.coins).toBe(120);
    expect({ xp: k.xp, level: k.level, rep: k.reputation }).toEqual(before);
  });
  it('ignores zero and negative amounts', () => {
    const k = new KitchenState({ level: 5, xp: 0, coins: 20 }, undefined, 1);
    k.awardChest(0);
    k.awardChest(-50);
    expect(k.coins).toBe(20);
  });
});
