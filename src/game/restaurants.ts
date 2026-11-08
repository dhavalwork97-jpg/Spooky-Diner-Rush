export interface PlayableRestaurant {
  id: string;
  name: string;
  unlockLevel: number;
  background: string;
  /** Coins to buy it. Missing or 0 means it is free (the diner). */
  cost?: number;
}
export interface SoonRestaurant {
  id: string;
  name: string;
  unlockLevel: number;
}

/** open: can be played now. locked: playable but needs a higher Lv. buy: Lv reached but not bought yet. soon: not built yet. */
export type RestaurantState = 'open' | 'locked' | 'buy' | 'soon';

export interface RestaurantCard {
  id: string;
  name: string;
  unlockLevel: number;
  state: RestaurantState;
  /** The one being played right now. */
  current: boolean;
  /** Art key for the thumbnail (playable restaurants only). */
  background?: string;
  /** Coins to buy it (only on 'buy' and 'locked' cards of restaurants that cost something). */
  cost?: number;
}

/** Playable restaurants first (in file order), then coming-soon ones. */
export function restaurantCards(playable: PlayableRestaurant[], soon: SoonRestaurant[], level: number, currentId: string, owned?: readonly string[]): RestaurantCard[] {
  const open: RestaurantCard[] = playable.map((r) => {
    // `owned` is optional: without it every playable restaurant counts as owned (the old behaviour).
    const needsBuying = !!owned && (r.cost ?? 0) > 0 && !owned.includes(r.id);
    const state: RestaurantState = level < r.unlockLevel ? 'locked' : needsBuying ? 'buy' : 'open';
    return { id: r.id, name: r.name, unlockLevel: r.unlockLevel, state, current: r.id === currentId, background: r.background, ...(needsBuying ? { cost: r.cost } : {}) };
  });
  const later: RestaurantCard[] = soon.map((r) => ({ id: r.id, name: r.name, unlockLevel: r.unlockLevel, state: 'soon', current: false }));
  return [...open, ...later];
}

/** Which restaurant to start in: the last one played if it exists and is unlocked, else the first. */
export function pickStartRestaurant(playable: PlayableRestaurant[], lastId: string, level: number): string {
  const last = playable.find((r) => r.id === lastId);
  if (last && level >= last.unlockLevel) return last.id;
  return playable[0].id;
}

/** What it takes to own a restaurant. The diner is always owned (cost 0). */
export interface RestaurantPrice {
  id: string;
  unlockLevel: number;
  cost: number;
}
export type PurchaseCheck = { ok: true } | { ok: false; reason: 'owned' | 'level' | 'coins' };

/** Can this restaurant be bought right now? Level is checked before coins so a low-level player sees the Lv first. */
export function checkPurchase(price: RestaurantPrice, level: number, coins: number, owned: readonly string[]): PurchaseCheck {
  if (owned.includes(price.id)) return { ok: false, reason: 'owned' };
  if (level < price.unlockLevel) return { ok: false, reason: 'level' };
  if (coins < price.cost) return { ok: false, reason: 'coins' };
  return { ok: true };
}

/** Buy a restaurant: spends the coins once and adds it to the owned list. Changes `save` only when the purchase is allowed. */
export function purchaseRestaurant(price: RestaurantPrice, save: { level: number; coins: number; restaurants: string[]; tacoStep?: number; tacoXp?: number }): PurchaseCheck {
  const check = checkPurchase(price, save.level, save.coins, save.restaurants);
  if (!check.ok) return check;
  save.coins -= price.cost;
  save.restaurants = [...save.restaurants, price.id];
  // A new truck starts with its first dishes whatever the global Lv is, so a late buyer gets the gentle start too.
  if (price.id === 'taco_truck') {
    save.tacoStep = 1;
    save.tacoXp = 0;
  }
  return check;
}
