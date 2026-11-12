import type { Pan, TacoItem, TacoKitchenState } from './TacoKitchenState';
import { stepKind, type DishDef, type Protein, type TacoConfig } from './tacoConfig';

/**
 * The Taco Truck's guided first dish. Like the diner's `nextHint`, it only READS the kitchen model and never changes it:
 * each call works out the one thing the player should do next, so the pointer follows the real recipe steps and the real station rules.
 * No Phaser here; the scene turns a hint into a pointer, a glow and a caption.
 */

/** Save id (in `seenStory`) once the guided dish is finished or skipped. */
export const TACO_TUTORIAL_ID = 'taco_tutorial_done';

export type TacoHint =
  /** Tap this zone. `key` changes whenever the pointer should restart (a new step or a new state of a pan or oven). */
  | { kind: 'tap'; zone: string; text: string; key: string }
  /** Drag the finished dish (or full cup) from this zone to a customer. */
  | { kind: 'drag'; from: string; customer: number; text: string; key: string }
  /** Nothing to tap right now (food is cooking, or no customer yet): caption only, pointer hidden. */
  | { kind: 'wait'; text: string; key: string };

/** Show the tutorial to a player who has not finished it and is still at the truck's first menu step (a returning player is never interrupted). */
export function tutorialDue(seen: readonly string[], menuStep: number): boolean {
  return !seen.includes(TACO_TUTORIAL_ID) && menuStep <= 1;
}

const zoneFor = (taco: TacoConfig, action: string, match: { arg?: string; index?: number }): string | null =>
  taco.zones.find((z) => z.action === action && (match.arg === undefined || z.arg === match.arg) && (match.index === undefined || z.index === match.index))?.id ?? null;

const say = (taco: TacoConfig, id: string): string => (taco.stepLabels[id] ?? id).replace(/^an? /, '');

/** Where a dish in progress is: on a plate, in a pan (pressing) or in an oven slot (melting). */
interface Progress {
  item: TacoItem;
  where: 'plate' | 'pan' | 'oven';
  index: number;
}

function progressOf(s: TacoKitchenState, dish: DishDef): Progress | null {
  const matches = (it: TacoItem) => it.building && it.placed.length > 0 && it.placed.length < dish.steps.length && it.placed.every((p, i) => dish.steps[i] === p);
  let best: Progress | null = null;
  const consider = (p: Progress) => {
    if (!best || p.item.placed.length > best.item.placed.length) best = p;
  };
  s.plates.forEach((pl, i) => pl.item && matches(pl.item) && consider({ item: pl.item, where: 'plate', index: i }));
  s.pans.forEach((p, i) => p?.what.kind === 'press' && matches(p.what.item) && consider({ item: p.what.item, where: 'pan', index: i }));
  s.ovens.forEach((o, i) => o?.what.kind === 'melt' && matches(o.what.item) && consider({ item: o.what.item, where: 'oven', index: i }));
  return best;
}

/** The pan (index) holding this protein, preferring a finished one. */
function panWith(pans: (Pan | null)[], protein: Protein): number {
  const mine = pans.map((p, i) => ({ p, i })).filter((x) => x.p?.what.kind === 'protein' && x.p.what.protein === protein);
  return (mine.find((x) => x.p!.phase !== 'cooking') ?? mine[0])?.i ?? -1;
}

export function nextTacoHint(s: TacoKitchenState): TacoHint | null {
  if (s.closed) return null;
  const taco = s.taco;
  const waiting = s.customers.filter((c) => c.mood === 'waiting');
  if (waiting.length === 0) return { kind: 'wait', text: 'A customer is on the way', key: 'no_customer' };

  // 1. Something finished that a waiting customer ordered: drag it over.
  for (const pl of s.plates) {
    const it = pl.item;
    if (!it || it.building || !it.dish) continue;
    const c = waiting.find((x) => x.items.some((k, i) => k === it.dish && !x.delivered[i]));
    const from = zoneFor(taco, 'plate', { index: pl.index });
    if (c && from) return { kind: 'drag', from, customer: c.id, text: 'Drag the finished dish to the customer', key: `drag:${pl.index}:${c.id}` };
  }
  for (const dr of s.drinks) {
    const lanes = s.pours[dr.id] ?? [];
    for (let lane = 0; lane < lanes.length; lane++) {
      if (!s.pourReady(dr.id, lane)) continue;
      const c = waiting.find((x) => x.items.some((k, i) => k === dr.id && !x.delivered[i]));
      const from = zoneFor(taco, 'cup', { arg: dr.id, index: lane });
      if (c && from) return { kind: 'drag', from, customer: c.id, text: 'Drag the full cup to the customer', key: `cup:${dr.id}:${lane}:${c.id}` };
    }
  }

  // 2. Guide the first thing the first waiting customer still wants. Dishes first: they are the recipes the tutorial teaches.
  const want = waiting[0].items.find((k, i) => !waiting[0].delivered[i] && s.dishDef(k)) ?? waiting[0].items.find((k, i) => !waiting[0].delivered[i]);
  if (!want) return null;
  const drink = s.drinks.find((d) => d.id === want);
  if (drink) {
    const lanes = s.pours[drink.id] ?? [];
    if (lanes.some((p) => p)) return { kind: 'wait', text: `Filling the ${drink.name}...`, key: `fill:${drink.id}` };
    const z = zoneFor(taco, 'drinks', { arg: drink.id });
    return z ? { kind: 'tap', zone: z, text: `Tap the dispenser to pour ${drink.name}`, key: `drink:${drink.id}` } : null;
  }
  const dish = s.dishDef(want);
  if (!dish) return null;

  const prog = progressOf(s, dish);
  if (prog && prog.where === 'pan') {
    const pan = s.pans[prog.index]!;
    const zone = zoneFor(taco, 'pan', { index: prog.index });
    if (!zone) return null;
    return pan.phase === 'cooking'
      ? { kind: 'wait', text: 'Pressing... wait for it to finish', key: `press:${prog.index}` }
      : { kind: 'tap', zone, text: 'Tap the pan to put it back on a plate', key: `presspan:${prog.index}:${pan.phase}` };
  }
  if (prog && prog.where === 'oven') {
    const oven = s.ovens[prog.index]!;
    const zone = zoneFor(taco, 'oven', { index: prog.index });
    if (!zone) return null;
    return oven.phase === 'cooking'
      ? { kind: 'wait', text: 'Melting... wait for it to finish', key: `melt:${prog.index}` }
      : { kind: 'tap', zone, text: 'Tap the oven to take it out', key: `meltoven:${prog.index}:${oven.phase}` };
  }

  const placed = prog?.item.placed.length ?? 0;
  const step = dish.steps[placed];
  if (step === undefined) return null;
  const kind = stepKind(step, placed);
  const base = `${dish.id}:${placed}`;

  if (kind === 'base' || kind === 'ingredient') {
    const zone = zoneFor(taco, 'ingredient', { arg: step });
    if (!zone) return null;
    return { kind: 'tap', zone, text: kind === 'base' ? `Tap the ${say(taco, step)} to start your ${dish.name}` : `Add ${say(taco, step)}`, key: `${base}:${step}` };
  }
  if (kind === 'action' || kind === 'press' || kind === 'melt') {
    const zone = zoneFor(taco, 'plate', { index: prog!.index });
    const text = kind === 'action' ? (step === 'action:wrap' ? 'Tap the plate to wrap it' : 'Tap the plate to cut it') : kind === 'press' ? 'Tap the plate to press it in a pan' : 'Tap the plate to melt it in the oven';
    return zone ? { kind: 'tap', zone, text, key: `${base}:${step}` } : null;
  }
  if (kind === 'shell') {
    const ready = s.ovens.findIndex((o) => o?.what.kind === 'shell' && o.phase !== 'cooking');
    if (ready >= 0) return { kind: 'tap', zone: zoneFor(taco, 'oven', { index: ready })!, text: 'Tap the oven to take the crispy shell out', key: `${base}:shellready:${ready}` };
    if (s.ovens.some((o) => o?.what.kind === 'shell')) return { kind: 'wait', text: 'The shell is baking...', key: `${base}:shellbake` };
    const free = s.ovens.findIndex((o) => !o);
    return free >= 0 ? { kind: 'tap', zone: zoneFor(taco, 'oven', { index: free })!, text: 'Tap an oven slot to bake a crispy shell', key: `${base}:shell` } : null;
  }
  // kind === 'protein'
  const protein = step.slice('protein:'.length) as Protein;
  const pan = panWith(s.pans, protein);
  if (pan >= 0) {
    const p = s.pans[pan]!;
    const zone = zoneFor(taco, 'pan', { index: pan })!;
    if (p.phase === 'cooking') return { kind: 'wait', text: `Cooking the ${protein}... wait until it is ready`, key: `${base}:cooking:${pan}` };
    if (p.phase === 'burnt') return { kind: 'tap', zone, text: 'It burnt! Tap the pan to throw it away', key: `${base}:burnt:${pan}` };
    // Collecting needs a plate that wants it; with none, point at the base first.
    const hasPlate = s.plates.some((pl) => pl.item?.building && pl.item.placed.length === placed);
    if (hasPlate) return { kind: 'tap', zone, text: `The ${protein} is ready! Tap the pan to add it to your plate`, key: `${base}:collect:${pan}:${p.phase}` };
    const start = dish.steps[0];
    const sz = zoneFor(taco, 'ingredient', { arg: start });
    return sz ? { kind: 'tap', zone: sz, text: `Tap the ${say(taco, start)} to start your ${dish.name}`, key: `${base}:startplate` } : null;
  }
  const raw = zoneFor(taco, 'protein', { arg: protein });
  return raw ? { kind: 'tap', zone: raw, text: `Tap the raw ${protein} to start cooking it`, key: `${base}:raw:${protein}` } : null;
}
