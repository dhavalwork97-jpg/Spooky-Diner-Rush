import type { DishKind } from './pizzaConfig';

/** A combo meal is one order holding at least one pizza, one side and one ice cream. A side is anything from the small oven or the fryer. */
export function isComboMeal(kinds: DishKind[]): boolean {
  const has = (k: DishKind) => kinds.includes(k);
  return has('pizza') && (has('side') || has('fried')) && has('dessert');
}

export interface ComboBonus {
  coins: number;
  xp: number;
}

/** The extra coins and XP of a combo meal, on top of what the order already earned. Rounded, never negative. */
export function comboBonus(coins: number, xp: number, coinBonus: number, xpBonus: number): ComboBonus {
  return { coins: Math.max(0, Math.round(coins * coinBonus)), xp: Math.max(0, Math.round(xp * xpBonus)) };
}
