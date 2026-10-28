import { describe, expect, it } from 'vitest';
import { KitchenState } from '../src/game/KitchenState';
import { isEdible } from '../src/game/cook';

/**
 * A simple bot that plays through the model API, one action per `reaction` seconds.
 * It is the first balance probe: how long levels take and whether play is manageable.
 */
function botStep(s: KitchenState): boolean {
  // 1. serve anything ready that a customer wants
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
  if (readyVat >= 0 && s.slots.some((sl) => !sl.item)) return (s.tapFryer(readyVat), true);
  // 4. burgers: finish a patty onto a waiting bun, flip, or place buns
  const building = s.slots.some((sl) => sl.item?.building);
  const burnerReady = s.burners.findIndex((p) => p && isEdible(p.phase));
  if (burnerReady >= 0) {
    if (s.burners[burnerReady]!.side === 1) return (s.tapGrill(burnerReady), true);
    if (building) return (s.tapGrill(burnerReady), true);
  }
  // 5. what is still needed beyond what is already in the pipeline?
  const need = (k: 'fries' | 'burger') =>
    s.customers.filter((c) => c.mood === 'waiting').reduce((n, c) => n + c.items.filter((x, i) => x === k && !c.delivered[i]).length, 0);
  const haveFries = s.slots.filter((sl) => sl.item?.kind === 'fries').length + s.vats.filter(Boolean).length;
  const haveBurgers = s.slots.filter((sl) => sl.item?.kind === 'burger').length + s.burners.filter(Boolean).length;
  if (need('fries') > haveFries) {
    const free = s.vats.findIndex((v) => !v);
    if (free >= 0) return (s.tapFryer(free), true);
  }
  if (need('burger') > haveBurgers) {
    const free = s.burners.findIndex((p) => !p);
    if (free >= 0) return (s.tapGrill(free), true);
  }
  const burgersNeedingBun = s.slots.filter((sl) => sl.item?.kind === 'burger').length + s.burners.filter(Boolean).length;
  if (s.level >= 2 && need('burger') > 0 && !building && burgersNeedingBun > 0 && s.slots.some((sl) => !sl.item)) {
    const onCounter = s.slots.filter((sl) => sl.item?.kind === 'burger').length;
    if (onCounter < need('burger')) return (s.tapBuns(), true);
  }
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
    expect(r.s.events.length).toBe(0);
    expect(r.s.slots.length).toBe(4);
    expect(r.s.vats.length).toBe(2);
  });
});
