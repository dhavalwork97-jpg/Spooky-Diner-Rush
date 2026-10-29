export interface PlayableRestaurant {
  id: string;
  name: string;
  unlockLevel: number;
  background: string;
}
export interface SoonRestaurant {
  id: string;
  name: string;
  unlockLevel: number;
}

/** open: can be played now. locked: playable but needs a higher Lv. soon: not built yet. */
export type RestaurantState = 'open' | 'locked' | 'soon';

export interface RestaurantCard {
  id: string;
  name: string;
  unlockLevel: number;
  state: RestaurantState;
  /** The one being played right now. */
  current: boolean;
  /** Art key for the thumbnail (playable restaurants only). */
  background?: string;
}

/** Playable restaurants first (in file order), then coming-soon ones. */
export function restaurantCards(playable: PlayableRestaurant[], soon: SoonRestaurant[], level: number, currentId: string): RestaurantCard[] {
  const open: RestaurantCard[] = playable.map((r) => ({
    id: r.id,
    name: r.name,
    unlockLevel: r.unlockLevel,
    state: level >= r.unlockLevel ? 'open' : 'locked',
    current: r.id === currentId,
    background: r.background,
  }));
  const later: RestaurantCard[] = soon.map((r) => ({ id: r.id, name: r.name, unlockLevel: r.unlockLevel, state: 'soon', current: false }));
  return [...open, ...later];
}

/** Which restaurant to start in: the last one played if it exists and is unlocked, else the first. */
export function pickStartRestaurant(playable: PlayableRestaurant[], lastId: string, level: number): string {
  const last = playable.find((r) => r.id === lastId);
  if (last && level >= last.unlockLevel) return last.id;
  return playable[0].id;
}
