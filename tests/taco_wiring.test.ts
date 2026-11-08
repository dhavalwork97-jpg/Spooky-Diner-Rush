import { describe, expect, it } from 'vitest';
import assets from '../data/assets.json';
import menu from '../data/restaurant_menu.json';
import { restaurantCards } from '../src/game/restaurants';
import { defaultTacoConfig } from '../src/game/taco/tacoConfig';

const files = import.meta.glob('../public/assets/taco/background/*.webp');
const has = (file: string) => Object.keys(files).some((k) => k.endsWith(`/${file}`));
const t = defaultTacoConfig;
const card = { id: t.restaurant.id, name: t.restaurant.name, unlockLevel: t.restaurant.unlockLevel, background: 'taco_thumb', cost: t.restaurant.cost };

describe('Taco Truck wiring', () => {
  it('background layers exist on disk (the scene adds .webp to the names in taco.json)', () => {
    expect(has(`${t.art.back}.webp`)).toBe(true);
    expect(has(`${t.art.front}.webp`)).toBe(true);
  });
  it('the select-card thumbnail is registered and exists', () => {
    const a = (assets as { assets: { key: string; file: string }[] }).assets.find((x) => x.key === 'taco_thumb');
    expect(a).toBeTruthy();
    expect(has(a!.file.split('/').pop()!)).toBe(true);
  });
  it('is no longer listed as coming soon', () => {
    expect(menu.comingSoon.some((c) => c.id === 'taco_truck')).toBe(false);
  });
  it('card is locked below Lv 15, buyable at Lv 15 until owned, then open', () => {
    const state = (lv: number, owned: string[]) => restaurantCards([card], [], lv, 'burger_diner', owned)[0].state;
    expect(state(14, ['burger_diner'])).toBe('locked');
    expect(state(15, ['burger_diner'])).toBe('buy');
    expect(state(15, ['burger_diner', 'taco_truck'])).toBe('open');
  });
});
