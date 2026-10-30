import { KitchenState } from '../../src/game/KitchenState';
import { isEdible } from '../../src/game/cook';
import { defaultConfig, type GameConfig } from '../../src/game/config';
import { buy, modsFor, type Owned } from '../../src/game/shop';

/**
 * Bot for the Lv 11-20 balance simulation. `botStep` is the same bot as in `sim.test.ts` (kept as a
 * copy so the Milestone 3 test file stays untouched). `play` adds what a real player does between
 * orders: it spends coins on the cheapest upgrade it can afford, and it records when each level was
 * reached and at which level every close happened.
 */
export function botStep(s: KitchenState): boolean {
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
  if (readyOven >= 0 && s.slots.some((sl) => sl.row === 'plate' && !sl.item)) return (s.tapOven(readyOven), true);
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


export interface PlayOptions {
  cfg?: GameConfig;
  upgrades?: boolean;
}

export function play(seed: number, reaction: number, seconds: number, opts: PlayOptions = {}) {
  const cfg = opts.cfg ?? defaultConfig;
  const s = new KitchenState({ level: 1, xp: 0, coins: 0 }, cfg, seed);
  const levelTimes: Record<number, number> = {};
  const closeLevels: number[] = [];
  let owned: Owned = {};
  let t = 0;
  let cooldown = 0;
  let shopCool = 0;
  const dt = 0.1;
  while (t < seconds) {
    s.update(dt);
    t += dt;
    cooldown -= dt;
    shopCool -= dt;
    for (const e of s.drainEvents()) {
      if (e.type === 'levelUp') levelTimes[e.level] = Math.round(t);
      if (e.type === 'closed') closeLevels.push(s.level);
    }
    if (s.closed) {
      s.reopen();
      s.drainEvents();
    }
    if (opts.upgrades && shopCool <= 0) {
      shopCool = 5;
      const cost = (id: string, tiers: { cost: number }[]) => tiers[owned[id] ?? 0]?.cost ?? Infinity;
      const order = [...cfg.upgrades.upgrades].sort((x, y) => cost(x.id, x.tiers) - cost(y.id, y.tiers));
      for (const u of order) {
        const r = buy(cfg.upgrades.upgrades, owned, u.id, s.level, s.coins);
        if (r.ok) {
          owned = r.owned;
          s.coins = r.coins;
          s.mods = modsFor(cfg.upgrades.upgrades, owned);
          break;
        }
      }
    }
    if (cooldown <= 0 && botStep(s)) cooldown = reaction;
  }
  return { s, levelTimes, closeLevels, owned, t };
}

export type Run = ReturnType<typeof play>;

/** Closes per minute while the level was in [from, to], over the runs that got through the whole bracket. */
export function closeRate(runs: Run[], from: number, to: number): number {
  let closes = 0;
  let secs = 0;
  for (const r of runs) {
    const t0 = from <= 1 ? 0 : r.levelTimes[from];
    const t1 = r.levelTimes[to + 1];
    if (t0 === undefined || t1 === undefined) continue;
    secs += t1 - t0;
    closes += r.closeLevels.filter((l) => l >= from && l <= to).length;
  }
  return secs > 0 ? (closes / secs) * 60 : NaN;
}
