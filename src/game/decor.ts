import type { DecorDef } from './config';
import type { BuyCheck, BuyLabel } from './shop';

/** Decor is cosmetic only: it never changes cooking, patience, tips or any other number. */
export const findDecor = (items: DecorDef[], id: string): DecorDef | undefined => items.find((d) => d.id === id);

export function canBuyDecor(items: DecorDef[], owned: readonly string[], id: string, level: number, coins: number): BuyCheck {
  const def = findDecor(items, id);
  if (!def) return { ok: false, reason: 'unknown' };
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
