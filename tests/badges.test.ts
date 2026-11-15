import { describe, expect, it } from 'vitest';
import { defaultBadges, newlyEarned, progressOf, track, validateBadges, type Stats } from '../src/game/badges';
import { dinerArtRows } from '../src/views/dinerArt';
import { parseSave } from '../src/systems/SaveSystem';

const art = dinerArtRows('badges').map((r) => r.key.replace(/^dx_/, ''));
const serve = (over: Partial<{ rush: boolean; atMaxCombo: boolean; duringMoon: boolean; regular: boolean }> = {}) => ({ type: 'serve' as const, rush: false, atMaxCombo: false, duringMoon: false, regular: false, ...over });
const run = (s: Stats, ev: Parameters<typeof track>[1], n: number): Stats => {
  for (let i = 0; i < n; i++) s = track(s, ev);
  return s;
};
const earned = (s: Stats) => newlyEarned(defaultBadges, s, []).map((b) => b.id);

describe('badges (data)', () => {
  it('ten badges with the agreed names and targets', () => {
    expect(defaultBadges.map((b) => [b.id, b.target])).toEqual([
      ['clean_kitchen', 50], ['speed_demon', 25], ['combo_master', 1], ['first_bronze', 1], ['moon_chef', 10],
      ['bat_catcher', 10], ['regular_friend', 5], ['party_host', 3], ['chest_hunter', 3], ['coin_collector', 5000],
    ]);
  });
  it('pass validation and every badge has its art', () => {
    expect(validateBadges(defaultBadges, art)).toEqual([]);
    expect(art).toEqual(expect.arrayContaining(defaultBadges.map((b) => b.art)));
  });
  it('validation catches bad data', () => {
    const errs = validateBadges([{ id: 'a', name: '', goal: '', stat: '', target: 0, art: 'nope' }, { id: 'a', name: 'x', goal: 'y', stat: 's', target: 1, art: 'clean_kitchen' }], art);
    for (const part of ['duplicate id', 'name', 'goal', 'stat', 'target', 'art nope']) expect(errs.some((e) => e.includes(part)), part).toBe(true);
  });
});

describe('badge counters', () => {
  it('Clean Kitchen needs 50 serves in a row and a burn starts it over', () => {
    let s = run({}, serve(), 49);
    expect(earned(s)).not.toContain('clean_kitchen');
    s = track(s, { type: 'burn' });
    s = run(s, serve(), 49);
    expect(earned(s)).not.toContain('clean_kitchen');
    s = track(s, serve());
    expect(earned(s)).toContain('clean_kitchen');
  });
  it('Speed Demon counts Rush serves only', () => {
    expect(earned(run({}, serve(), 100))).not.toContain('speed_demon');
    expect(earned(run({}, serve({ rush: true }), 25))).toContain('speed_demon');
    expect(earned(run({}, serve({ rush: true }), 24))).not.toContain('speed_demon');
  });
  it('Combo Master once at the top combo, Moon Chef only in a Full Moon, Regular Friend 5 favourites', () => {
    expect(earned(track({}, serve({ atMaxCombo: true })))).toContain('combo_master');
    expect(earned(run({}, serve({ duringMoon: true }), 10))).toContain('moon_chef');
    expect(earned(run({}, serve({ duringMoon: true }), 9))).not.toContain('moon_chef');
    expect(earned(run({}, serve({ regular: true }), 5))).toContain('regular_friend');
  });
  it('First Bronze, Bat Catcher, Party Host, Chest Hunter', () => {
    expect(earned(track({}, { type: 'mastery' }))).toContain('first_bronze');
    expect(earned(run({}, { type: 'bat' }, 10))).toContain('bat_catcher');
    expect(earned(run({}, { type: 'bat' }, 9))).not.toContain('bat_catcher');
    expect(earned(run({}, { type: 'party' }, 3))).toContain('party_host');
    expect(earned(run({}, { type: 'chest' }, 3))).toContain('chest_hunter');
  });
  it('Coin Collector at 5,000 coins in total', () => {
    expect(earned(track({}, { type: 'coins', amount: 4999 }))).not.toContain('coin_collector');
    expect(earned(track({ coinsEarned: 4999 }, { type: 'coins', amount: 1 }))).toContain('coin_collector');
    expect(track({}, { type: 'coins', amount: -5 })).toEqual({});
  });
  it('an earned badge is never offered again, and the old counters are not changed in place', () => {
    const s = run({}, { type: 'bat' }, 10);
    expect(newlyEarned(defaultBadges, s, ['bat_catcher'])).toEqual([]);
    const before: Stats = { bats: 2 };
    track(before, { type: 'bat' });
    expect(before).toEqual({ bats: 2 });
  });
  it('progress is capped at the target', () => {
    const b = defaultBadges.find((x) => x.id === 'bat_catcher')!;
    expect(progressOf(b, { bats: 4 })).toEqual({ have: 4, target: 10 });
    expect(progressOf(b, { bats: 99 })).toEqual({ have: 10, target: 10 });
    expect(progressOf(b, {})).toEqual({ have: 0, target: 10 });
  });
});

describe('badges in the save', () => {
  it('an old save without them loads with empty defaults', () => {
    const d = parseSave(JSON.stringify({ version: 2, level: 3, xp: 0, coins: 5 }));
    expect(d.badges).toEqual([]);
    expect(d.stats).toEqual({});
    expect(d.chestsOpened).toEqual([]);
  });
  it('bad values are cleaned, good ones kept', () => {
    const d = parseSave(JSON.stringify({ level: 3, badges: ['bat_catcher', 5, 'bat_catcher'], stats: { bats: 4.7, bad: 'x', neg: -3 } }));
    expect(d.badges).toEqual(['bat_catcher']);
    expect(d.stats).toEqual({ bats: 4 });
  });
});
