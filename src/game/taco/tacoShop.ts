import type { Mods } from '../KitchenState';
import { NO_MODS } from '../shop';
import type { TacoConfig, TacoModKey, TacoUpgradeDef, TacoUpgradeTier } from './tacoConfig';

// The Taco Truck's own upgrades. Pure rules, no Phaser, no save access: the Shop scene passes the numbers in and writes the answer back.
// They are separate from the Spooky Diner's upgrades on purpose (own list, own save map `tacoOwned`), so a maxed diner never makes the truck easy
// and a new kitchen starts from its own beginning. Tiers are gated by the truck's menu step, so the upgrades arrive together with the difficulty.

/** The kitchen settings the truck reads: the diner's shared set plus the truck's own `pourSpeed` (how fast cups fill). */
export type TacoMods = Mods & { pourSpeed: number };
export const NO_TACO_MODS: TacoMods = { ...NO_MODS, pourSpeed: 1 };

/** Upgrade id -> tier bought (0 or missing means none). */
export type TacoOwned = Record<string, number>;

export type TacoBuyBlock = 'unknown' | 'maxed' | 'locked' | 'coins';
export type TacoBuyCheck = { ok: true; cost: number; tier: number } | { ok: false; reason: TacoBuyBlock; cost?: number; step?: number };
export type TacoBuyResult = { ok: true; owned: TacoOwned; coins: number; cost: number; tier: number } | { ok: false; reason: TacoBuyBlock };

const find = (upgrades: readonly TacoUpgradeDef[], id: string): TacoUpgradeDef | undefined => upgrades.find((u) => u.id === id);

/** Tier owned, clamped to what the data defines (a save from older data never overshoots). */
export function tacoTierOf(upgrades: readonly TacoUpgradeDef[], owned: TacoOwned, id: string): number {
  const def = find(upgrades, id);
  if (!def) return 0;
  const t = Math.floor(owned[id] ?? 0);
  return Math.max(0, Math.min(def.tiers.length, Number.isFinite(t) ? t : 0));
}

/** The tier that would be bought next, or null when maxed. */
export function tacoNextTier(upgrades: readonly TacoUpgradeDef[], owned: TacoOwned, id: string): TacoUpgradeTier | null {
  return find(upgrades, id)?.tiers[tacoTierOf(upgrades, owned, id)] ?? null;
}

export function canBuyTaco(upgrades: readonly TacoUpgradeDef[], owned: TacoOwned, id: string, menuStep: number, coins: number): TacoBuyCheck {
  const def = find(upgrades, id);
  if (!def) return { ok: false, reason: 'unknown' };
  const have = tacoTierOf(upgrades, owned, id);
  const next = def.tiers[have];
  if (!next) return { ok: false, reason: 'maxed' };
  if (menuStep < next.step) return { ok: false, reason: 'locked', step: next.step };
  if (coins < next.cost) return { ok: false, reason: 'coins', cost: next.cost };
  return { ok: true, cost: next.cost, tier: have + 1 };
}

/** Pure purchase: returns the new owned map and coin total, never mutates its inputs. */
export function buyTaco(upgrades: readonly TacoUpgradeDef[], owned: TacoOwned, id: string, menuStep: number, coins: number): TacoBuyResult {
  const check = canBuyTaco(upgrades, owned, id, menuStep, coins);
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, owned: { ...owned, [id]: check.tier }, coins: coins - check.cost, cost: check.cost, tier: check.tier };
}

/** The kitchen settings for what is owned. Tier 0 leaves a setting at 1, so a fresh save changes nothing. Only the truck's own upgrades count. */
export function tacoModsFor(upgrades: readonly TacoUpgradeDef[], owned: TacoOwned): TacoMods {
  const mods: TacoMods = { ...NO_TACO_MODS };
  for (const u of upgrades) {
    const t = tacoTierOf(upgrades, owned, u.id);
    if (t > 0) mods[u.mod as TacoModKey] = u.tiers[t - 1].value;
  }
  return mods;
}

/** The dishes that join the menu at a step, as words for the player ("Shrimp soft taco and Fish soft taco"). The step number itself is never shown. */
export function menuNeedText(taco: TacoConfig, step: number): string {
  const names = taco.dishes.filter((d) => d.unlockStep === step).map((d) => d.name);
  if (names.length === 0) return 'more recipes';
  return names.length <= 2 ? names.join(' and ') : `${names[0]} and ${names.length - 1} more`;
}

export interface TacoBuyLabel {
  text: string;
  enabled: boolean;
  /** Why it is locked, in words, when it is. */
  needs?: string;
}

/** What a Buy button says and whether it can be pressed. A locked tier says what has to join the menu first. */
export function tacoBuyLabel(taco: TacoConfig, owned: TacoOwned, id: string, menuStep: number, coins: number): TacoBuyLabel {
  const check = canBuyTaco(taco.upgrades, owned, id, menuStep, coins);
  if (check.ok) return { text: `Buy ${check.cost}`, enabled: true };
  switch (check.reason) {
    case 'maxed':
      return { text: 'Max', enabled: false };
    case 'locked':
      return { text: 'Locked', enabled: false, needs: `Unlocks with ${menuNeedText(taco, check.step!)}` };
    case 'coins':
      return { text: `${check.cost} coins`, enabled: false };
    default:
      return { text: '-', enabled: false };
  }
}

const pct = (value: number): string => `+${Math.round((value - 1) * 100)}%`;

/** "+10%  →  +20%": what the upgrade does now and after the next tier. */
export function tacoEffectText(def: TacoUpgradeDef, tier: number): string {
  const now = tier > 0 ? def.tiers[tier - 1].value : 1;
  const next = def.tiers[tier];
  return next ? `${pct(now)}  →  ${pct(next.value)}` : pct(now);
}
