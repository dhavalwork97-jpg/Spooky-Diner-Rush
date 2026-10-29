import type { UpgradeDef, UpgradeTier } from './config';
import type { Mods } from './KitchenState';

/** Upgrade id -> tier bought (0 or missing means none). */
export type Owned = Record<string, number>;

export type BuyBlock = 'unknown' | 'maxed' | 'locked' | 'coins';
export type BuyCheck = { ok: true; cost: number; tier: number } | { ok: false; reason: BuyBlock; cost?: number };
export type BuyResult =
  | { ok: true; owned: Owned; coins: number; cost: number; tier: number }
  | { ok: false; reason: BuyBlock };

export const NO_MODS: Mods = { fryerSpeed: 1, grillSpeed: 1, ovenSpeed: 1, patience: 1, tips: 1 };

export function find(upgrades: UpgradeDef[], id: string): UpgradeDef | undefined {
  return upgrades.find((u) => u.id === id);
}

/** Tier owned, clamped to what the data defines (a save from older data never overshoots). */
export function tierOf(upgrades: UpgradeDef[], owned: Owned, id: string): number {
  const def = find(upgrades, id);
  if (!def) return 0;
  const t = Math.floor(owned[id] ?? 0);
  return Math.max(0, Math.min(def.tiers.length, Number.isFinite(t) ? t : 0));
}

/** The tier that would be bought next, or null when maxed. */
export function nextTier(upgrades: UpgradeDef[], owned: Owned, id: string): UpgradeTier | null {
  const def = find(upgrades, id);
  if (!def) return null;
  return def.tiers[tierOf(upgrades, owned, id)] ?? null;
}

export function canBuy(upgrades: UpgradeDef[], owned: Owned, id: string, level: number, coins: number): BuyCheck {
  const def = find(upgrades, id);
  if (!def) return { ok: false, reason: 'unknown' };
  const have = tierOf(upgrades, owned, id);
  const next = def.tiers[have];
  if (!next) return { ok: false, reason: 'maxed' };
  if (level < def.unlockLevel) return { ok: false, reason: 'locked' };
  if (coins < next.cost) return { ok: false, reason: 'coins', cost: next.cost };
  return { ok: true, cost: next.cost, tier: have + 1 };
}

/** Pure purchase: returns the new owned map and coin total, never mutates its inputs. */
export function buy(upgrades: UpgradeDef[], owned: Owned, id: string, level: number, coins: number): BuyResult {
  const check = canBuy(upgrades, owned, id, level, coins);
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, owned: { ...owned, [id]: check.tier }, coins: coins - check.cost, cost: check.cost, tier: check.tier };
}

/** The mods for what is owned. Tier 0 leaves a mod at 1, so a fresh save changes nothing. */
export function modsFor(upgrades: UpgradeDef[], owned: Owned): Mods {
  const mods: Mods = { ...NO_MODS };
  for (const u of upgrades) {
    const t = tierOf(upgrades, owned, u.id);
    if (t > 0) mods[u.mod] = u.tiers[t - 1].value;
  }
  return mods;
}
