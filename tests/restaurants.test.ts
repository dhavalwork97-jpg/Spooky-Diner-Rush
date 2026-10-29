import { describe, expect, it } from 'vitest';
import restaurantsJson from '../data/restaurants.json';
import { defaultConfig } from '../src/game/config';
import { pickStartRestaurant, restaurantCards, type PlayableRestaurant } from '../src/game/restaurants';
import { validateRestaurantMenu } from '../src/data/validate';

const playable = restaurantsJson.restaurants as PlayableRestaurant[];
const soon = defaultConfig.restaurantMenu.comingSoon;
const ids = playable.map((r) => r.id);

describe('restaurant menu data', () => {
  it('passes validation', () => {
    expect(validateRestaurantMenu(defaultConfig.restaurantMenu, ids)).toEqual([]);
  });
  it('validator catches bad data', () => {
    const errs = validateRestaurantMenu({ comingSoon: [{ id: ids[0], name: 'A', unlockLevel: 5 }, { id: 'x', name: '', unlockLevel: 1.5 }, { id: 'x', name: 'B', unlockLevel: 2 }] }, ids).join('\n');
    expect(errs).toMatch(/id already used/);
    expect(errs).toMatch(/name must be/);
    expect(errs).toMatch(/whole number/);
    expect(validateRestaurantMenu({}, ids)).not.toEqual([]);
  });
});

describe('restaurantCards', () => {
  it('lists playable first, then coming soon, and marks the current one', () => {
    const c = restaurantCards(playable, soon, 1, ids[0]);
    expect(c.slice(0, playable.length).map((x) => x.id)).toEqual(ids);
    expect(c.slice(playable.length).every((x) => x.state === 'soon')).toBe(true);
    expect(c[0].current).toBe(true);
    expect(c[0].state).toBe('open');
    expect(c.filter((x) => x.current).length).toBe(1);
  });
  it('a playable restaurant above the level is locked', () => {
    const fake: PlayableRestaurant[] = [{ id: 'a', name: 'A', unlockLevel: 1, background: 'k' }, { id: 'b', name: 'B', unlockLevel: 8, background: 'k' }];
    expect(restaurantCards(fake, [], 7, 'a').map((x) => x.state)).toEqual(['open', 'locked']);
    expect(restaurantCards(fake, [], 8, 'a').map((x) => x.state)).toEqual(['open', 'open']);
  });
  it('coming-soon cards are never open and carry no background', () => {
    for (const c of restaurantCards(playable, soon, 999, ids[0]).filter((x) => x.state === 'soon')) {
      expect(c.background).toBeUndefined();
      expect(c.current).toBe(false);
    }
  });
});

describe('pickStartRestaurant', () => {
  const fake: PlayableRestaurant[] = [{ id: 'a', name: 'A', unlockLevel: 1, background: 'k' }, { id: 'b', name: 'B', unlockLevel: 8, background: 'k' }];
  it('uses the last one played when it is unlocked', () => {
    expect(pickStartRestaurant(fake, 'b', 8)).toBe('b');
  });
  it('falls back to the first for unknown, locked or empty ids', () => {
    expect(pickStartRestaurant(fake, 'b', 7)).toBe('a');
    expect(pickStartRestaurant(fake, 'taco_truck', 20)).toBe('a');
    expect(pickStartRestaurant(fake, '', 1)).toBe('a');
  });
  it('works with the shipped data and a default save', () => {
    expect(pickStartRestaurant(playable, 'burger_diner', 1)).toBe('burger_diner');
  });
});
