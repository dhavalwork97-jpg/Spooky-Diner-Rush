import { describe, expect, it } from 'vitest';
import { defaultConfig, xpForLevel } from '../src/game/config';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { defaultTacoConfig } from '../src/game/taco/tacoConfig';
import { clampStep, levelForStep, MAX_MENU_STEP, rampFor, stepFromLevel, stepXpNeeded } from '../src/game/taco/tacoMenu';
import { purchaseRestaurant } from '../src/game/restaurants';
import { parseSave } from '../src/systems/SaveSystem';
import { buildDish, quiet, tacoAt } from './helpers/tacoBuild';

describe('menu step helpers', () => {
  it('clamp to 1-10 and map old Lv to the step that had the same dishes (Lv 15 = step 1)', () => {
    expect([clampStep(0), clampStep(1), clampStep(10), clampStep(99), clampStep(NaN)]).toEqual([1, 1, 10, 10, 1]);
    expect([stepFromLevel(1), stepFromLevel(15), stepFromLevel(20), stepFromLevel(30)]).toEqual([1, 1, 6, 10]);
  });
  it('a step costs the same XP as the global curve at 14 + step, so the pace is unchanged', () => {
    expect(levelForStep(1)).toBe(15);
    expect(stepXpNeeded(defaultConfig, 1)).toBe(xpForLevel(defaultConfig, 15));
    expect(stepXpNeeded(defaultConfig, 9)).toBe(xpForLevel(defaultConfig, 23));
  });
  it('every step has a ramp, getting busier and never shrinking', () => {
    let seats = 0;
    for (let step = 1; step <= MAX_MENU_STEP; step++) {
      const r = rampFor(defaultTacoConfig, step);
      expect(r.step).toBe(step);
      expect(r.seats).toBeGreaterThanOrEqual(seats);
      seats = r.seats;
    }
  });
  it('the schedule matches the plan: 16 dishes, 2 drinks, one new family at a time', () => {
    const at = (step: number) => defaultTacoConfig.dishes.filter((d) => d.unlockStep === step).map((d) => d.id);
    expect(at(1)).toEqual(['veggies_soft_taco']);
    expect(at(2)).toEqual(['chicken_soft_taco']);
    expect(at(6)).toEqual(['veggies_burrito']);
    expect(at(10).sort()).toEqual(['fish_nachos', 'shrimp_nachos']);
    expect(defaultTacoConfig.drinks.map((d) => [d.id, d.unlockStep])).toEqual([['horchata', 1], ['agua_de_jamaica', 2]]);
  });
});

describe('menu growth', () => {
  it('serving earns the same XP for the global Lv and the menu, and a new step announces its dishes by name', () => {
    const s = quiet(tacoAt(1, 1, 30));
    const events: string[] = [];
    s.menuXp = s.menuXpNeeded - 1; // one XP short
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['veggies_soft_taco'];
    c.delivered = [false];
    const plate = buildDish(s, 'veggies_soft_taco');
    const xpBefore = s.xp;
    expect(s.serve(plate, c.id)).toBe(true);
    expect(s.xp).toBeGreaterThan(xpBefore); // global XP still counts
    expect(s.menuStep).toBe(2);
    const grew = s.drainEvents().find((e) => e.type === 'menuGrew');
    expect(grew).toMatchObject({ type: 'menuGrew', added: ['Chicken soft taco', 'Agua de jamaica'] });
    expect(JSON.stringify(grew)).not.toMatch(/Lv|step|rank/i);
    void events;
  });
  it('the last step stops collecting menu XP', () => {
    const s = tacoAt(MAX_MENU_STEP);
    expect(s.menuXpNeeded).toBe(0);
    expect(s.dishes).toHaveLength(16);
  });
  it('a late buyer at Lv 40 gets the first dishes and gentle customers, not the whole menu', () => {
    const late = new TacoKitchenState({ level: 40, xp: 0, coins: 0, menuStep: 1 });
    expect(late.dishes).toHaveLength(1);
    expect(late.levelInfo.maxCustomers).toBe(3);
  });
});

describe('saves', () => {
  it('a save from before menu steps that already owns the truck keeps its dishes (step worked out from Lv)', () => {
    const old = parseSave(JSON.stringify({ version: 2, level: 22, xp: 5, coins: 900, restaurants: ['burger_diner', 'taco_truck'] }));
    expect(old.tacoStep).toBe(8);
    expect(old.level).toBe(22);
    expect(old.coins).toBe(900);
  });
  it('a save without the truck starts at step 1, and bad values are repaired', () => {
    expect(parseSave(JSON.stringify({ level: 30 })).tacoStep).toBe(1);
    expect(parseSave(JSON.stringify({ level: 30, tacoStep: 99, tacoXp: -5, restaurants: ['burger_diner', 'taco_truck'] }))).toMatchObject({ tacoStep: 10, tacoXp: 0 });
    expect(parseSave('not json').tacoStep).toBe(1);
  });
  it('buying the truck sets step 1 whatever the Lv is, and never touches Lv, XP or the diner', () => {
    const save = { level: 40, coins: 5000, restaurants: ['burger_diner'], tacoStep: 7, tacoXp: 12 };
    expect(purchaseRestaurant({ id: 'taco_truck', unlockLevel: 15, cost: 2000 }, save)).toEqual({ ok: true });
    expect(save).toMatchObject({ level: 40, coins: 3000, tacoStep: 1, tacoXp: 0 });
    expect(save.restaurants).toEqual(['burger_diner', 'taco_truck']);
  });
  it('a failed purchase changes nothing', () => {
    const save = { level: 10, coins: 5000, restaurants: ['burger_diner'], tacoStep: 5, tacoXp: 3 };
    expect(purchaseRestaurant({ id: 'taco_truck', unlockLevel: 15, cost: 2000 }, save).ok).toBe(false);
    expect(save).toMatchObject({ coins: 5000, tacoStep: 5, tacoXp: 3 });
  });
});
