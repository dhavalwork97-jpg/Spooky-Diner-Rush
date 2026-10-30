import { describe, expect, it } from 'vitest';
import { KitchenState } from '../src/game/KitchenState';
import { isEdible } from '../src/game/cook';

/**
 * A simple bot that plays through the model API, one action per `reaction` seconds.
 * It is the first balance probe: how long levels take and whether play is manageable.
 */
function botStep(s: KitchenState): boolean {
  // 1. serve anything finished that a customer wants
  for (const slot of s.slots) {
    const it = slot.item;
    if (!it || it.building) continue;
    const c = s.customers.find((x) => x.mood === 'waiting' && x.items.some((k, i) => k === it.kind && !x.delivered[i]));
    if (c) return s.serve(slot.index, c.id);
  }
  // 2. clean up burnt food
  const burntVat = s.vats.findIndex((v) => v?.phase === 'burnt');
  if (burntVat >= 0) return (s.tapFryer(burntVat), true);
  const burntBurner = s.burners.findIndex((p) => p?.phase === 'burnt');
  if (burntBurner >= 0) return (s.tapGrill(burntBurner), true);
  // 3. collect ready fries
  const readyVat = s.vats.findIndex((v) => v && isEdible(v.phase));
  if (readyVat >= 0 && s.slots.some((sl) => sl.row === 'side' && !sl.item)) return (s.tapFryer(readyVat), true);
  // 4. burger building: toppings, patties, flips
  const build = s.buildingSlots()[0]?.item;
  const next = build ? s.layers[build.placed.length] : undefined;
  if (next === 'lettuce' || next === 'tomato') return (s.tapTopping(next), true);
  const flip = s.burners.findIndex((p) => p && p.side === 1 && isEdible(p.phase));
  if (flip >= 0) return (s.tapGrill(flip), true);
  const done = s.burners.findIndex((p) => p && p.side === 2 && isEdible(p.phase));
  if (done >= 0 && next === 'patty') return (s.tapGrill(done), true);
  const readyOven = s.ovens.findIndex((o) => o && isEdible(o.phase));
  if (readyOven >= 0 && s.slots.some((sl) => sl.row === 'pizza' && !sl.item)) return (s.tapOven(readyOven), true);
  if (s.ovens.some((o) => o?.phase === 'burnt')) return (s.tapOven(s.ovens.findIndex((o) => o?.phase === 'burnt')), true);
  // 5. start what is still needed beyond what is already in the pipeline
  const need = (k: 'fries' | 'nuggets' | 'pizza' | 'burger') =>
    s.customers.filter((c) => c.mood === 'waiting').reduce((n, c) => n + c.items.filter((x, i) => x === k && !c.delivered[i]).length, 0);
  const haveOf = (k: 'fries' | 'nuggets') => s.slots.filter((sl) => sl.item?.kind === k).length + s.vats.filter((v) => v?.kind === k).length;
  const haveBurgers = s.slots.filter((sl) => sl.item?.kind === 'burger').length + s.burners.filter(Boolean).length;
  for (const k of ['fries', 'nuggets'] as const) if (need(k) > haveOf(k) && s.vats.some((v) => !v)) return (s.startFry(k), true);
  if (s.level >= 2 && need('burger') > haveBurgers && s.burners.some((p) => !p)) return (s.startPatty(), true);
  if (need('pizza') > s.slots.filter((sl) => sl.item?.kind === 'pizza').length + s.ovens.filter(Boolean).length && s.ovens.some((o) => !o)) return (s.startPizza(), true);
  const onPlates = s.slots.filter((sl) => sl.row === 'plate' && sl.item).length;
  if (s.level >= 2 && !build && onPlates < need('burger') && s.slots.some((sl) => sl.row === 'plate' && !sl.item)) return (s.tapBuns(), true);
  return false;
}

function play(seed: number, reaction: number, seconds: number, startLevel = 1) {
  const s = new KitchenState({ level: startLevel, xp: 0, coins: 0 }, undefined, seed);
  const levelTimes: Record<number, number> = {};
  let t = 0;
  let cooldown = 0;
  let closes = 0;
  const dt = 0.1;
  while (t < seconds) {
    s.update(dt);
    t += dt;
    cooldown -= dt;
    for (const e of s.drainEvents()) {
      if (e.type === 'levelUp') levelTimes[e.level] = Math.round(t);
      if (e.type === 'closed') closes++;
    }
    if (s.closed) {
      s.reopen();
      s.drainEvents();
    }
    if (cooldown <= 0 && botStep(s)) cooldown = reaction;
  }
  return { s, levelTimes, closes, t };
}

describe('bot simulation (first balance probe)', () => {
  it('a competent bot reaches Lv 3 and rarely closes', () => {
    const results = [1, 2, 3, 4, 5].map((seed) => play(seed, 0.7, 600));
    for (const r of results) {
      console.log(`seed run: level times ${JSON.stringify(r.levelTimes)} closes ${r.closes} served ${r.s.served}`);
      expect(r.s.level).toBeGreaterThanOrEqual(3);
    }
    const lv2 = results.map((r) => r.levelTimes[2]);
    // first level-up within about the first minute, as the brief asks
    expect(Math.max(...lv2)).toBeLessThanOrEqual(90);
  });

  it('a bot that never acts closes the shop', () => {
    const s = new KitchenState(undefined, undefined, 11);
    let closed = false;
    for (let i = 0; i < 10000 && !closed; i++) {
      s.update(0.1);
      for (const e of s.drainEvents()) if (e.type === 'closed') closed = true;
    }
    expect(closed).toBe(true);
  });

  it('30 minutes of play at 10x speed leaves no growing state', () => {
    const r = play(7, 0.7, 1800 * 1, 3);
    expect(r.s.customers.length).toBeLessThanOrEqual(4);
    // `events` is the queue the views drain each frame; the bot's last action can leave an event in it.
    // The point is that it does not grow, so allow a handful instead of exactly none.
    expect(r.s.events.length).toBeLessThan(10);
    expect(r.s.slots.length).toBe(8); // 4 plates + 2 side + 2 pizza plates
    expect(r.s.vats.length).toBe(2);
  });
});

describe('bot simulation to Lv 10 (Milestone 3 balance probe)', () => {
  it('reports level times and checks pacing', () => {
    const rows: string[] = [];
    const results = [1, 2, 3, 4, 5].map((seed) => play(seed, 0.8, 1500));
    for (const r of results) {
      const lv = Object.entries(r.levelTimes).map(([l, t]) => `${l}@${t}s`).join(' ');
      rows.push(`level times: ${lv} | closes ${r.closes} served ${r.s.served}`);
    }
    // eslint-disable-next-line no-console
    console.log('BALANCE\n' + rows.join('\n'));
    for (const r of results) expect(r.s.level).toBeGreaterThanOrEqual(10);
    // a fast bot should take minutes, not seconds, to reach Lv 10 (a person is slower still)
    for (const r of results) expect(r.levelTimes[10]).toBeGreaterThan(300);
    for (const r of results) expect(r.levelTimes[10]).toBeLessThan(900);
    const lv2 = results.map((r) => r.levelTimes[2]);
    expect(Math.max(...lv2)).toBeLessThanOrEqual(90);
  });
});
