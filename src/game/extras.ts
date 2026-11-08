import extrasData from '../../data/extras.json';
import { makeRng, randInt, type Rng } from './rng';
import type { ItemKind } from './config';

// Optional extras for players who want more from the diner: Mastery badges and the Daily Special.
// Neither blocks anything: they only add small coin rewards and give a reason to cook well. Rules and numbers live in data/extras.json.

export interface MasteryTier {
  id: string;
  name: string;
  /** Items served quickly (the same "fast" the tip bonus uses) to earn this badge. */
  serves: number;
  coins: number;
}
export interface Extras {
  mastery: { fromLevel: number; tiers: MasteryTier[] };
  dailySpecial: { fromLevel: number; bonus: number; afterServes: number; size: number };
}
export const defaultExtras: Extras = extrasData as Extras;

/** How many badge tiers a count has earned (0 to 3). */
export function tiersEarned(extras: Extras, count: number): number {
  return extras.mastery.tiers.filter((t) => count >= t.serves).length;
}

export interface MasteryProgress {
  /** Name of the best badge earned so far, or null. */
  badge: string | null;
  /** The next badge and how many more fast serves it needs, or null once Gold is earned. */
  next: { name: string; remaining: number } | null;
}
export function masteryProgress(extras: Extras, count: number): MasteryProgress {
  const tiers = extras.mastery.tiers;
  const n = tiersEarned(extras, count);
  return { badge: n > 0 ? tiers[n - 1].name : null, next: n < tiers.length ? { name: tiers[n].name, remaining: tiers[n].serves - count } : null };
}

/** The player's calendar day on this device, as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Today's special order: a fixed mix of different items from the player's menu, the same all day and on every device.
 * `available` is the menu at the player's Lv; fewer items than the special's size give a smaller order.
 */
export function dailySpecialFor(dateKey: string, available: readonly ItemKind[], size: number = defaultExtras.dailySpecial.size): ItemKind[] {
  const rng: Rng = makeRng(hashString(`chef-rush:${dateKey}`));
  const pool = [...available];
  const out: ItemKind[] = [];
  while (out.length < size && pool.length > 0) out.push(pool.splice(randInt(rng, 0, pool.length - 1), 1)[0]);
  return out;
}
