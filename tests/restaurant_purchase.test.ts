import { describe, expect, it } from 'vitest';
import tacoJson from '../data/taco.json';
import { checkPurchase, purchaseRestaurant, type RestaurantPrice } from '../src/game/restaurants';
import { defaultSave, parseSave } from '../src/systems/SaveSystem';

const taco: RestaurantPrice = { id: tacoJson.restaurant.id, unlockLevel: tacoJson.restaurant.unlockLevel, cost: tacoJson.restaurant.cost };

describe('buying the Taco Truck', () => {
  it('uses the owner numbers: Lv 15 and 2,000 coins', () => {
    expect(taco).toEqual({ id: 'taco_truck', unlockLevel: 15, cost: 2000 });
  });
  it('is refused below Lv 15 even with plenty of coins, then below 2,000 coins, and costs nothing when refused', () => {
    const save = { level: 14, coins: 99999, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: false, reason: 'level' });
    expect(save).toEqual({ level: 14, coins: 99999, restaurants: ['burger_diner'] });
    const poor = { level: 15, coins: 1999, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, poor)).toEqual({ ok: false, reason: 'coins' });
    expect(poor).toEqual({ level: 15, coins: 1999, restaurants: ['burger_diner'] });
  });
  it('at Lv 15 with exactly 2,000 coins it succeeds once, spends 2,000 and cannot be bought again', () => {
    const save = { level: 15, coins: 2000, restaurants: ['burger_diner'] };
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: true });
    expect(save).toEqual({ level: 15, coins: 0, restaurants: ['burger_diner', 'taco_truck'], tacoStep: 1, tacoXp: 0 }); // the truck starts at its first dishes
    expect(purchaseRestaurant(taco, save)).toEqual({ ok: false, reason: 'owned' });
    expect(save.coins).toBe(0);
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
