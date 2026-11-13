import { KitchenState, type GameEvent } from '../../src/game/KitchenState';
import { isEdible } from '../../src/game/cook';
import { defaultConfig, type GameConfig } from '../../src/game/config';
import { buy, modsFor, type Owned } from '../../src/game/shop';

/**
 * Bot for the Lv 11-20 balance simulation. `botStep` is the same bot as in `sim.test.ts` (kept as a
 * copy so the Milestone 3 test file stays untouched). `play` adds what a real player does between
 * orders: it spends coins on the cheapest upgrade it can afford (the default, unchanged), and it records when
 * each level was reached and at which level every close happened. For the upgrade balance work it also
 * counts burnt food, angry departures and the reputation lost to each, per level, logs every purchase, and
 * can follow other shopping plans (`UpgradePlan`) so results do not hang on one artificial shopping order.
 */
export function botStep(s: KitchenState, prepBun = false): boolean {
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
  // 3b. serve a ready cone or cup straight from its machine to whoever ordered it (a cone melts if it waits too long)
  for (const c of s.customers) {
    if (c.mood !== 'waiting') continue;
    for (const [kind, from, list] of [['icecream', 'icecream', s.cones], ['drink', 'dispenser', s.spouts]] as const) {
      if (!c.items.some((x, i) => x === kind && !c.delivered[i])) continue;
      const lane = list.findIndex((_, i) => s.pourReady(from, i));
      if (lane >= 0) return s.serveFromPour(from, lane, c.id);
    }
  }
  const wanted = (k: 'drink' | 'icecream') =>
    s.customers.filter((c) => c.mood === 'waiting').reduce((n, c) => n + c.items.filter((x, i) => x === k && !c.delivered[i]).length, 0);
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
  // A careful player puts the bun down while the patty cooks, so a finished patty always has a burger to land on.
  if (prepBun && s.level >= 2 && !build && s.burners.some(Boolean) && s.slots.filter((sl) => sl.row === 'plate' && sl.item).length < need('burger') && s.slots.some((sl) => sl.row === 'plate' && !sl.item)) return (s.tapBuns(), true);
  if (s.level >= 2 && need('burger') > haveBurgers && s.burners.some((p) => !p)) return (s.startPatty(), true);
  if (need('pizza') > s.slots.filter((sl) => sl.item?.kind === 'pizza').length + s.ovens.filter(Boolean).length && s.ovens.some((o) => !o)) return (s.startPizza(), true);
  if (s.level >= 6 && wanted('drink') > s.spouts.filter(Boolean).length && s.spouts.some((p) => !p)) return (s.tapDrinks(), true);
  if (s.level >= 12 && wanted('icecream') > s.cones.filter(Boolean).length && s.cones.some((p) => !p)) return (s.tapIceCream(), true);
  const onPlates = s.slots.filter((sl) => sl.row === 'plate' && sl.item).length;
  if (s.level >= 2 && !build && onPlates < need('burger') && s.slots.some((sl) => sl.row === 'plate' && !sl.item)) return (s.tapBuns(), true);
  return false;
}


/** How the bot shops. `upgrades: true` is the original plan: every upgrade, cheapest next tier first. */
export interface UpgradePlan {
  /** Only these upgrade ids may be bought (default: all of them). */
  allow?: string[];
  /** Tried before everything else, in this order; the rest follow cheapest first. The bot never saves up for one. */
  priority?: string[];
}

export interface PlayOptions {
  cfg?: GameConfig;
  upgrades?: boolean | UpgradePlan;
  /** The bot puts the bun down as soon as a patty is cooking (default: the original order, bun is the last thing it does). */
  prepBun?: boolean;
  /** Sees every event after the bot's own bookkeeping (used to run the mini-goal tracker next to the bot). */
  onEvent?: (e: GameEvent, s: KitchenState, t: number) => void;
}

/** What happened while the player was on one level. */
export interface LevelStats {
  burnt: number;
  angry: number;
  closes: number;
  /** Reputation lost to burnt food, and to everything else that costs reputation during update (angry departures). */
  lossBurn: number;
  lossAngry: number;
  /** Batches collected from a vat, burner (each side) or oven while still edible, and the seconds they sat ready first. */
  readyN: number;
  readyWait: number;
  /** Dishes handed to customers and orders completed. */
  delivered: number;
  orders: number;
  /** Burnt food by station. */
  burntVat: number;
  burntBurner: number;
  burntOven: number;
}
export type StatKey = keyof LevelStats;
export interface Purchase {
  t: number;
  id: string;
  tier: number;
  level: number;
}

function shoppingOrder(cfg: GameConfig, owned: Owned, plan: UpgradePlan) {
  const cost = (id: string, tiers: { cost: number }[]) => tiers[owned[id] ?? 0]?.cost ?? Infinity;
  const all = plan.allow ? cfg.upgrades.upgrades.filter((u) => plan.allow!.includes(u.id)) : cfg.upgrades.upgrades;
  const first = (plan.priority ?? []).map((id) => all.find((u) => u.id === id)).filter((u): u is (typeof all)[number] => !!u);
  const rest = all.filter((u) => !first.includes(u)).sort((x, y) => cost(x.id, x.tiers) - cost(y.id, y.tiers));
  return [...first, ...rest];
}

export function play(seed: number, reaction: number, seconds: number, opts: PlayOptions = {}) {
  const cfg = opts.cfg ?? defaultConfig;
  const s = new KitchenState({ level: 1, xp: 0, coins: 0 }, cfg, seed);
  const levelTimes: Record<number, number> = {};
  const closeLevels: number[] = [];
  const levelStats: Record<number, LevelStats> = {};
  const stat = (lv: number): LevelStats => (levelStats[lv] ??= { burnt: 0, angry: 0, closes: 0, lossBurn: 0, lossAngry: 0, readyN: 0, readyWait: 0, delivered: 0, orders: 0, burntVat: 0, burntBurner: 0, burntOven: 0 });
  const purchases: Purchase[] = [];
  // How long each batch sits edible before the player takes it (a batch ends when it is no longer edible and not burnt).
  const readySince = new Map<string, number>();
  const scan = () => {
    const stations: [string, string | undefined][] = [
      ...s.vats.map((v, i): [string, string | undefined] => [`v${i}`, v?.phase]),
      ...s.ovens.map((o, i): [string, string | undefined] => [`o${i}`, o?.phase]),
      ...s.burners.map((p, i): [string, string | undefined] => [`b${i}`, p?.phase]),
    ];
    for (const [key, phase] of stations) {
      const edible = phase !== undefined && isEdible(phase as never);
      const since = readySince.get(key);
      if (edible && since === undefined) readySince.set(key, t);
      else if (!edible && since !== undefined) {
        readySince.delete(key);
        if (phase !== 'burnt') {
          stat(s.level).readyN += 1;
          stat(s.level).readyWait += t - since;
        }
      }
    }
  };
  const plan: UpgradePlan | null = opts.upgrades ? (opts.upgrades === true ? {} : opts.upgrades) : null;
  let owned: Owned = {};
  let t = 0;
  let cooldown = 0;
  let shopCool = 0;
  const dt = 0.1;
  while (t < seconds) {
    const repBefore = s.reputation;
    const lvBefore = s.level;
    s.update(dt);
    t += dt;
    cooldown -= dt;
    shopCool -= dt;
    // Inside update() reputation can only fall (serving, which adds to it, happens in botStep).
    const lost = Math.max(0, repBefore - s.reputation);
    let burntNow = 0;
    for (const e of s.drainEvents()) {
      opts.onEvent?.(e, s, t);
      if (e.type === 'levelUp') levelTimes[e.level] = Math.round(t);
      if (e.type === 'closed') {
        closeLevels.push(s.level);
        stat(s.level).closes += 1;
      }
      if (e.type === 'burnt') {
        burntNow += 1;
        stat(lvBefore).burnt += 1;
        if (e.where === 'vat') stat(lvBefore).burntVat += 1;
        else if (e.where === 'burner') stat(lvBefore).burntBurner += 1;
        else stat(lvBefore).burntOven += 1;
      }
      if (e.type === 'angryLeave') stat(lvBefore).angry += 1;
      if (e.type === 'deliver') stat(lvBefore).delivered += 1;
      if (e.type === 'orderDone') stat(lvBefore).orders += 1;
    }
    scan();
    if (lost > 0) {
      const burnLoss = Math.min(lost, burntNow * Math.round(cfg.recipes.settings.burnReputationPenalty / s.mods.calm));
      stat(lvBefore).lossBurn += burnLoss;
      stat(lvBefore).lossAngry += lost - burnLoss;
    }
    if (s.closed) {
      s.reopen();
      s.drainEvents();
      readySince.clear();
    }
    if (plan && shopCool <= 0) {
      shopCool = 5;
      for (const u of shoppingOrder(cfg, owned, plan)) {
        const r = buy(cfg.upgrades.upgrades, owned, u.id, s.level, s.coins);
        if (r.ok) {
          owned = r.owned;
          s.coins = r.coins;
          s.mods = modsFor(cfg.upgrades.upgrades, owned);
          purchases.push({ t: Math.round(t), id: u.id, tier: r.tier, level: s.level });
          break;
        }
      }
    }
    if (cooldown <= 0 && botStep(s, opts.prepBun)) {
      cooldown = reaction;
      scan();
    }
  }
  return { s, levelTimes, closeLevels, levelStats, purchases, owned, t };
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

/** Total of one counter and the seconds it was counted over, for the runs that got through the whole bracket [from, to]. */
export function bracketTotals(runs: Run[], key: StatKey, from: number, to: number): { total: number; secs: number } {
  let total = 0;
  let secs = 0;
  for (const r of runs) {
    const t0 = from <= 1 ? 0 : r.levelTimes[from];
    const t1 = r.levelTimes[to + 1];
    if (t0 === undefined || t1 === undefined) continue;
    secs += t1 - t0;
    for (let lv = from; lv <= to; lv++) total += r.levelStats[lv]?.[key] ?? 0;
  }
  return { total, secs };
}

/** Per-minute rate of one counter while the level was in [from, to], over the runs that got through the whole bracket. */
export function bracketRate(runs: Run[], key: StatKey, from: number, to: number): number {
  const { total, secs } = bracketTotals(runs, key, from, to);
  return secs > 0 ? (total / secs) * 60 : NaN;
}

/** Average of numKey per denKey (for example seconds ready per batch collected) over the runs that got through [from, to]. */
export function bracketMean(runs: Run[], numKey: StatKey, denKey: StatKey, from: number, to: number): number {
  const n = bracketTotals(runs, numKey, from, to).total;
  const d = bracketTotals(runs, denKey, from, to).total;
  return d > 0 ? n / d : NaN;
}
