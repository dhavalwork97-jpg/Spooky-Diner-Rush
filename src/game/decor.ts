import type { DecorDef, ModKey } from './config';
import type { Mods } from './KitchenState';
import type { BuyCheck, BuyLabel } from './shop';

/** The first three pieces are cosmetic only. Newer pieces may carry a small perk (see `perkTotals`): the total per mod is capped at +8 percent. */
export const DECOR_PERK_CAP = 0.08;
export const findDecor = (items: DecorDef[], id: string): DecorDef | undefined => items.find((d) => d.id === id);

export function canBuyDecor(items: DecorDef[], owned: readonly string[], id: string, level: number, coins: number): BuyCheck {
  const def = findDecor(items, id);
  if (!def || def.chestOnly) return { ok: false, reason: 'unknown' }; // chest prizes are never sold
  if (owned.includes(id)) return { ok: false, reason: 'maxed' };
  if (level < def.unlockLevel) return { ok: false, reason: 'locked' };
  if (coins < def.cost) return { ok: false, reason: 'coins', cost: def.cost };
  return { ok: true, cost: def.cost, tier: 1 };
}

export type BuyDecorResult = { ok: true; decor: string[]; coins: number; cost: number } | { ok: false; reason: 'unknown' | 'maxed' | 'locked' | 'coins' };

/** Pure purchase: returns the new owned list and coin total, never mutates its inputs. */
export function buyDecor(items: DecorDef[], owned: readonly string[], id: string, level: number, coins: number): BuyDecorResult {
  const check = canBuyDecor(items, owned, id, level, coins);
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, decor: [...owned, id], coins: coins - check.cost, cost: check.cost };
}

/** Owned decor ids that still exist in the data (an old save never breaks on removed items). */
export function ownedDecor(items: DecorDef[], owned: readonly string[]): DecorDef[] {
  return items.filter((d) => owned.includes(d.id));
}

export function decorLabel(items: DecorDef[], owned: readonly string[], id: string, level: number, coins: number): BuyLabel {
  const def = findDecor(items, id);
  const check = canBuyDecor(items, owned, id, level, coins);
  if (check.ok) return { text: `Buy ${check.cost}`, enabled: true };
  switch (check.reason) {
    case 'maxed':
      return { text: 'Placed', enabled: false };
    case 'locked':
      return { text: `Lv ${def?.unlockLevel ?? '?'}`, enabled: false };
    case 'coins':
      return { text: `${check.cost} coins`, enabled: false };
    default:
      return { text: '-', enabled: false };
  }
}

/** Extra fraction per mod from the decor on display, each mod capped at DECOR_PERK_CAP. */
export function perkTotals(items: DecorDef[], owned: readonly string[]): Partial<Record<ModKey, number>> {
  const sums: Partial<Record<ModKey, number>> = {};
  for (const d of ownedDecor(items, owned)) if (d.perk) sums[d.perk.mod] = (sums[d.perk.mod] ?? 0) + d.perk.pct;
  for (const k of Object.keys(sums) as ModKey[]) sums[k] = Math.min(DECOR_PERK_CAP, sums[k]!);
  return sums;
}

/** The mods with the decor perks multiplied in (a new object; `calm` divides the burn penalty, so a bigger value is a bonus there too). */
export function withDecorPerks(mods: Mods, items: DecorDef[], owned: readonly string[]): Mods {
  const out = { ...mods };
  const totals = perkTotals(items, owned);
  for (const k of Object.keys(totals) as ModKey[]) out[k] = mods[k] * (1 + totals[k]!);
  return out;
}

/** "+2% patience" style text for the shop. */
const MOD_WORDS: Record<ModKey, string> = { fryerSpeed: 'fryer speed', grillSpeed: 'grill speed', ovenSpeed: 'oven speed', patience: 'patience', tips: 'tips', burnWindow: 'burn time', calm: 'calm' };
export const perkText = (d: DecorDef): string => (d.perk ? `+${Math.round(d.perk.pct * 100)}% ${MOD_WORDS[d.perk.mod]}` : '');
