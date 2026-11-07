import { isEdible } from '../../src/game/cook';
import { defaultConfig, type GameConfig } from '../../src/game/config';
import type { Mods } from '../../src/game/KitchenState';
import { TacoKitchenState, type TacoItem } from '../../src/game/taco/TacoKitchenState';
import { stepKind, unlockedDishes, type Protein } from '../../src/game/taco/tacoConfig';

/**
 * Bot for the Taco Truck simulation. Like the diner bot it does one tap per reaction time. Each tick it works out which dishes the
 * waiting customers still need, matches the plates in progress to them, and does the most urgent tap: serve, clean burnt food, collect,
 * finish a step, start proteins early, then start new dishes, shells and drinks.
 */
export function tacoBotStep(s: TacoKitchenState, onServe?: (dish: string) => void): boolean {
  const act = (fn: () => void): boolean => {
    const before = s.events.length;
    fn();
    return !s.events.slice(before).some((e) => e.type === 'invalid');
  };
  const freePlate = s.plates.some((p) => !p.item);

  // 1. serve finished dishes and full cups
  for (const p of s.plates) {
    const it = p.item;
    if (!it || it.building || !it.dish) continue;
    const c = s.customers.find((x) => x.mood === 'waiting' && x.items.some((k, i) => k === it.dish && !x.delivered[i]));
    if (c) {
      onServe?.(it.dish);
      return s.serve(p.index, c.id);
    }
  }
  for (const c of s.customers) {
    if (c.mood !== 'waiting') continue;
    for (const d of s.drinks) {
      if (!c.items.some((k, i) => k === d.id && !c.delivered[i])) continue;
      const lane = s.pours[d.id].findIndex((_, i) => s.pourReady(d.id, i));
      if (lane >= 0) return s.serveFromPour(d.id, lane, c.id);
    }
  }
  // 2. clean up burnt food
  const burntPan = s.pans.findIndex((p) => p?.phase === 'burnt');
  if (burntPan >= 0) return act(() => s.tapPan(burntPan));
  const burntOven = s.ovens.findIndex((o) => o?.phase === 'burnt');
  if (burntOven >= 0) return act(() => s.tapOven(burntOven));
  // 3. collect pressed burritos and ready oven items when a plate is free
  const readyPress = s.pans.findIndex((p) => p && isEdible(p.phase) && p.what.kind === 'press');
  if (readyPress >= 0 && freePlate) return act(() => s.tapPan(readyPress));
  const readyOven = s.ovens.findIndex((o) => o && isEdible(o.phase));
  if (readyOven >= 0 && freePlate) return act(() => s.tapOven(readyOven));

  // What do customers still want, and which plates are working towards it?
  const pending: string[] = [];
  for (const c of s.customers) if (c.mood === 'waiting') c.items.forEach((k, i) => !c.delivered[i] && s.dishDef(k) && pending.push(k));
  const drop = (pred: (id: string) => boolean) => {
    const i = pending.findIndex(pred);
    if (i >= 0) pending.splice(i, 1);
  };
  for (const p of s.plates) if (p.item && !p.item.building && p.item.dish) drop((id) => id === p.item!.dish);
  const inProgress: TacoItem[] = [...s.plates.flatMap((p) => (p.item?.building ? [p.item] : [])), ...s.pans.flatMap((p) => (p?.what.kind === 'press' ? [p.what.item] : [])), ...s.ovens.flatMap((o) => (o?.what.kind === 'melt' ? [o.what.item] : []))];
  const targetOf = new Map<TacoItem, string>();
  const dishes = unlockedDishes(s.taco, s.level);
  for (const it of inProgress) {
    const fits = (id: string) => s.dishDef(id)!.steps.slice(0, it.placed.length).join() === it.placed.join();
    const i = pending.findIndex(fits);
    const id = i >= 0 ? pending.splice(i, 1)[0] : dishes.find((d) => d.steps.slice(0, it.placed.length).join() === it.placed.join())?.id;
    if (id) targetOf.set(it, id);
  }
  for (const o of s.ovens) if (o?.what.kind === 'shell') drop((id) => s.dishDef(id)!.steps[0] === 'crispy_shell');

  const buildPlates = s.buildingPlates();
  // 4. a ready protein goes to the plate that needs it
  const readyProtein = s.pans.findIndex((p) => p && isEdible(p.phase) && p.what.kind === 'protein' && buildPlates.some((pl) => nextOf(pl.item!) === `protein:${(p.what as { protein: Protein }).protein}`));
  if (readyProtein >= 0) return act(() => s.tapPan(readyProtein));
  function nextOf(it: TacoItem): string | undefined {
    return s.dishDef(targetOf.get(it) ?? '')?.steps[it.placed.length];
  }
  // 5. actions that need a plate tap, and ingredients
  for (const pl of buildPlates) {
    const next = nextOf(pl.item!);
    if (!next) continue;
    const k = stepKind(next, pl.item!.placed.length);
    if (k === 'action' || (k === 'press' && s.pans.some((p) => !p)) || (k === 'melt' && s.ovens.some((o) => !o))) return act(() => s.tapPlate(pl.index));
  }
  for (const pl of buildPlates) {
    const next = nextOf(pl.item!);
    if (!next || stepKind(next, pl.item!.placed.length) !== 'ingredient') continue;
    if (s.buildingPlates().find((q) => nextOf(q.item!) === next) !== pl) continue; // the tap would go to an older plate
    return act(() => s.tapIngredient(next));
  }
  // 6. start proteins a little ahead of the plate that will need them
  for (const pl of buildPlates) {
    const it = pl.item!;
    const d = s.dishDef(targetOf.get(it) ?? '');
    if (!d) continue;
    const at = d.steps.findIndex((x) => x.startsWith('protein:'));
    if (at < it.placed.length || at - it.placed.length > 2) continue;
    const protein = d.steps[at].split(':')[1] as Protein;
    const coming = s.pans.filter((p) => p?.what.kind === 'protein' && p.what.protein === protein).length;
    const needing = buildPlates.filter((q) => {
      const dd = s.dishDef(targetOf.get(q.item!) ?? '');
      const a = dd ? dd.steps.findIndex((x) => x.startsWith('protein:')) : -1;
      return dd && dd.protein === protein && a >= q.item!.placed.length && a - q.item!.placed.length <= 2;
    }).length;
    if (coming < needing && s.pans.some((p) => !p)) return act(() => s.startProtein(protein));
  }
  // 7. a new dish for what is still wanted
  const want = pending.find((id) => s.dishDef(id));
  if (want) {
    const first = s.dishDef(want)!.steps[0];
    if (first === 'crispy_shell') {
      const slot = s.ovens.findIndex((o) => !o);
      if (slot >= 0) return act(() => s.tapOven(slot));
    } else if (freePlate) return act(() => s.tapIngredient(first));
  }
  // 8. drinks nobody has started yet
  const wantedDrinks: string[] = [];
  for (const c of s.customers) if (c.mood === 'waiting') c.items.forEach((k, i) => !c.delivered[i] && s.drinks.some((d) => d.id === k) && wantedDrinks.push(k));
  for (const d of s.drinks) {
    const have = s.pours[d.id].filter(Boolean).length;
    if (wantedDrinks.filter((x) => x === d.id).length > have) return act(() => s.tapDrinks(d.id));
  }
  return false;
}

export interface TacoRun {
  s: TacoKitchenState;
  levelTimes: Record<number, number>;
  burnt: number;
  angry: number;
  served: Map<string, number>;
  seconds: number;
}

export function playTaco(seed: number, reaction: number, seconds: number, opts: { level?: number; mods?: Partial<Mods>; cfg?: GameConfig } = {}): TacoRun {
  const s = new TacoKitchenState({ level: opts.level ?? 15, xp: 0, coins: 0 }, opts.cfg ?? defaultConfig, undefined, seed);
  Object.assign(s.mods, opts.mods);
  const run: TacoRun = { s, levelTimes: { [s.level]: 0 }, burnt: 0, angry: 0, served: new Map(), seconds };
  const dt = 0.1;
  let t = 0;
  let cooldown = 0;
  while (t < seconds) {
    s.update(dt);
    t += dt;
    cooldown -= dt;
    for (const e of s.drainEvents()) {
      if (e.type === 'burnt') run.burnt++;
      else if (e.type === 'angryLeave') run.angry++;
    }
    if (s.closed) {
      s.reopen();
      s.drainEvents();
      continue;
    }
    if (run.levelTimes[s.level] === undefined) run.levelTimes[s.level] = Math.round(t);
    if (cooldown <= 0 && tacoBotStep(s, (d) => run.served.set(d, (run.served.get(d) ?? 0) + 1))) cooldown = reaction;
  }
  return run;
}

/** Closes per minute while the player was in levels `from` to `to`. */
export function tacoCloseRate(runs: TacoRun[], from: number, to: number): number {
  let closes = 0;
  let minutes = 0;
  for (const r of runs) {
    const a = r.levelTimes[from];
    if (a === undefined) continue;
    const b = r.levelTimes[to + 1] ?? r.seconds;
    minutes += (b - a) / 60;
    for (let l = from; l <= to; l++) closes += r.s.closesAtLevel.get(l) ?? 0;
  }
  return minutes > 0 ? closes / minutes : NaN;
}
