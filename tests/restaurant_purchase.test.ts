import { describe, expect, it } from 'vitest';
import tacoJson from '../data/taco.json';
import { checkPurchase, purchaseRestaurant, type RestaurantPrice } from '../src/game/restaurants';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

const taco: RestaurantPrice = { id: tacoJson.restaurant.id, unlockLevel: tacoJson.restaurant.unlockLevel, cost: tacoJson.restaurant.cost };

describe('buying the Taco Truck', () => {
  it('uses the owner numbers: Lv 10 and 1,500 coins (2026-11-20; it was Lv 15 and 2,000)', () => {
    expect(taco).toEqual({ id: 'taco_truck', unlockLevel: 10, cost: 1500 });
  });
  it('is refused below Lv 10 even with plenty of coins, then below 1,500 coins, and costs nothing when refused', () => {
    const save = { level: 9, coins: 99999, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: false, reason: 'level' });
    expect(save).toEqual({ level: 9, coins: 99999, restaurants: ['burger_diner'] });
    const poor = { level: 10, coins: 1499, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, poor)).toEqual({ ok: false, reason: 'coins' });
    expect(poor).toEqual({ level: 10, coins: 1499, restaurants: ['burger_diner'] });
  });
  it('at Lv 10 with exactly 1,500 coins it succeeds once, spends 1,500 and cannot be bought again', () => {
    const save = { level: 10, coins: 1500, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: true });
    expect(save).toEqual({ level: 10, coins: 0, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 1, tacoXp: 0 }); // the truck starts at its first dishes
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: false, reason: 'owned' });
    expect(save.coins).toBe(0);
  });
  it('a player who bought under the old Lv 15 / 2,000 rules keeps the truck, their coins and their dish progress through a reload', () => {
    const old = { version: 2, level: 16, coins: 345, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 4, tacoXp: 120, tacoServed: { veggies_soft_taco: 5, chicken_soft_taco: 4 } };
    const s = parseSave(JSON.stringify(old));
    expect(s.restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(s.coins).toBe(345);
    expect(s.tacoStep).toBe(4);
    expect(s.tacoServed).toEqual({ veggies_soft_taco: 5, chicken_soft_taco: 4 });
    expect(purchaseRestaurant(taco, { level: 16, coins: 345, restaurants: s.restaurants })).toEqual({ ok: false, reason: 'owned' });
  });
  it('the truck is still owned if the player is below the new unlock Lv (a restored or edited save is never taken away)', () => {
    expect(parseSave(JSON.stringify({ level: 3, restaurants: ['burger_diner', 'taco_truck'] })).restaurants).toEqual(['burger_diner', 'taco_truck']);
  });
  it('checkPurchase never changes anything', () => {
    const owned = ['burger_diner'];
    expect(checkPurchase(taco, 20, 5000, owned)).toEqual({ ok: true });
    expect(owned).toEqual(['burger_diner']);
  });
});

describe('save: owned restaurants', () => {
  it('a new save owns only the diner, and an old save without the field loads with just the diner', () => {
    expect(defaultSave().restaurants).toEqual(['burger_diner']);
    expect(parseSave(JSON.stringify({ version: 1, level: 9, xp: 3, coins: 40 })).restaurants).toEqual(['burger_diner']);
  });
  it('keeps what the player bought, always includes the diner, and drops junk', () => {
    expect(parseSave(JSON.stringify({ restaurants: ['burger_diner', 'taco_truck'] })).restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(parseSave(JSON.stringify({ restaurants: ['taco_truck'] })).restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(parseSave(JSON.stringify({ restaurants: [1, '', 'taco_truck', 'taco_truck', null] })).restaurants).toEqual(['burger_diner', 'taco_truck']);
    expect(parseSave(JSON.stringify({ restaurants: 'taco_truck' })).restaurants).toEqual(['burger_diner']);
  });
  it('survives a save and load round trip', () => {
    const a = { ...defaultSave(), level: 16, coins: 5, restaurants: ['burger_diner', 'taco_truck'] };
    expect(parseSave(JSON.stringify(a))).toEqual(a);
  });
});
