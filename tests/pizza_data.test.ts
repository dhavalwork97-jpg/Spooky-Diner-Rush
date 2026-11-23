import { describe, expect, it } from 'vitest';
import pizzaJson from '../data/pizza.json';
import restaurantMenu from '../data/restaurant_menu.json';
import { validatePizza } from '../src/data/validate';
import { defaultPizzaConfig, unlockedDishes, unlockedIngredients } from '../src/game/pizza/pizzaConfig';
import { candidatePizzas, finishedPizza, nextIngredients, recipeSteps } from '../src/game/pizza/pizzaRecipes';
import { clampPizzaStep, pizzaRampFor, pizzaStepXpNeeded } from '../src/game/pizza/pizzaMenu';
import { defaultConfig } from '../src/game/config';

const cfg = defaultPizzaConfig;

describe('data/pizza.json', () => {
  it('passes the validator', () => {
    expect(validatePizza(pizzaJson)).toEqual([]);
  });
  it('the validator catches real problems', () => {
    const bad = JSON.parse(JSON.stringify(pizzaJson));
    bad.dishes[0].recipe.toppings = ['nope'];
    bad.zones[1].x = bad.zones[0].x;
    bad.zones[1].y = bad.zones[0].y;
    bad.dishes.find((d: { id: string }) => d.id === 'margherita_pizza').unlockStep = 1;
    const e = validatePizza(bad).join('\n');
    expect(e).toMatch(/unknown ingredient topping:nope/);
    expect(e).toMatch(/overlap/);
    expect(e).toMatch(/before it is on the menu/);
    expect(validatePizza(null)).not.toEqual([]);
  });
  it('the restaurant is Lv 30 for 3,000 coins and the old Lv 20 coming-soon card is gone', () => {
    expect(cfg.restaurant).toEqual({ id: 'pizza_place', name: 'Pizza Place', unlockLevel: 30, cost: 3000 });
    expect((restaurantMenu.comingSoon as { id: string }[]).some((r) => r.id === 'pizza_place')).toBe(false);
  });
  it('has the ten pizzas and the six extras, joining the menu in the approved order', () => {
    expect(cfg.dishes.filter((d) => d.kind === 'pizza').map((d) => d.id)).toEqual(['cheese_pizza', 'margherita_pizza', 'pepperoni_pizza', 'mushroom_pizza', 'veggie_pizza', 'hawaiian_pizza', 'bbq_chicken_pizza', 'spicy_pizza', 'supreme_pizza', 'white_pizza']);
    const byStep = (s: number) => cfg.dishes.filter((d) => d.unlockStep === s).map((d) => d.id);
    expect(byStep(1)).toEqual(['cheese_pizza']);
    expect(byStep(2)).toEqual(['margherita_pizza', 'garlic_bread']);
    expect(byStep(3)).toEqual(['pepperoni_pizza', 'fries']);
    expect(byStep(4)).toEqual(['mushroom_pizza', 'cheesy_breadsticks']);
    expect(byStep(5)).toEqual(['veggie_pizza', 'ice_cream']);
    expect(byStep(6)).toEqual(['hawaiian_pizza', 'chicken_wings']);
    expect(byStep(7)).toEqual(['bbq_chicken_pizza', 'cinnamon_twists']);
    expect(byStep(8)).toEqual(['spicy_pizza']);
    expect(byStep(9)).toEqual(['supreme_pizza']);
    expect(byStep(10)).toEqual(['white_pizza']);
  });
  it('the Lv 31-49 list is display only and never changes what is unlocked', () => {
    const m = cfg.levelProgression.milestones;
    expect(m[0]).toMatchObject({ lv: 30 });
    expect(m.map((x) => x.lv)).toEqual(Array.from({ length: 20 }, (_, i) => 30 + i));
    expect(unlockedDishes(cfg, 1).map((d) => d.id)).toEqual(['cheese_pizza']);
  });
  it('upgrades match the first-pass table (costs, values and steps)', () => {
    const u = Object.fromEntries(cfg.upgrades.map((x) => [x.id, x]));
    expect(u.brick_oven.tiers.map((t) => [t.value, t.cost, t.step])).toEqual([[1.1, 500, 1], [1.2, 900, 4], [1.3, 1400, 7], [1.4, 2000, 9]]);
    expect(u.fast_fryer.tiers.map((t) => t.cost)).toEqual([400, 800, 1300]);
    expect(u.burn_guard.tiers.map((t) => t.value)).toEqual([1.15, 1.3, 1.45]);
    expect(u.calm_kitchen.tiers.map((t) => t.step)).toEqual([4, 8]);
    expect(u.comfy_booths.tiers.map((t) => t.cost)).toEqual([400, 750, 1200, 1800]);
    expect(u.quick_scoop.tiers.map((t) => t.value)).toEqual([1.2, 1.4, 1.65]);
    expect(u.tip_jar.tiers.map((t) => t.value)).toEqual([1.25, 1.5, 2]);
  });
  it('the small oven has two trays, the brick oven two slots, three boards, two fryer baskets', () => {
    expect(cfg.settings).toMatchObject({ boards: 3, ovenSlots: 2, smallOvenSlots: 2, fryerBaskets: 2 });
  });
  it('seats grow from 3 to 5 and the table is no harder than the Taco Truck at the same step', () => {
    expect(cfg.ramp.map((r) => r.seats)).toEqual([3, 4, 4, 5, 5, 5, 5, 5, 5, 5]);
    expect(pizzaRampFor(cfg, 1).seats).toBe(3);
    expect(pizzaRampFor(cfg, 99).seats).toBe(5);
    expect(clampPizzaStep(0)).toBe(1);
    expect(clampPizzaStep(11)).toBe(10);
    expect(pizzaStepXpNeeded(defaultConfig, 1)).toBeGreaterThan(0);
  });
  it('tap zones: all inside the art, no overlaps, none in the HUD corner', () => {
    for (const z of cfg.zones) {
      expect(z.x + z.width).toBeLessThanOrEqual(1);
      expect(z.y).toBeGreaterThan(0.4); // below the window; the menu buttons sit at the top right
    }
  });
});

describe('pizza recipes', () => {
  it('step 1 offers only tomato sauce, then mozzarella, and a bare cheese pizza is finished', () => {
    expect(nextIngredients(cfg, 1, [])).toEqual(['sauce:tomato']);
    expect(nextIngredients(cfg, 1, ['sauce:tomato'])).toEqual(['cheese:mozzarella']);
    expect(nextIngredients(cfg, 1, ['sauce:tomato', 'cheese:mozzarella'])).toEqual([]);
    expect(finishedPizza(cfg, 1, ['sauce:tomato', 'cheese:mozzarella'])?.id).toBe('cheese_pizza');
  });
  it('at step 2 a cheese base can still become a margherita, in either topping order', () => {
    const base = ['sauce:tomato', 'cheese:mozzarella'];
    expect(nextIngredients(cfg, 2, base).sort()).toEqual(['topping:basil', 'topping:fresh_mozzarella']);
    expect(finishedPizza(cfg, 2, base)?.id).toBe('cheese_pizza');
    expect(finishedPizza(cfg, 2, [...base, 'topping:basil'])).toBeUndefined();
    expect(finishedPizza(cfg, 2, [...base, 'topping:basil', 'topping:fresh_mozzarella'])?.id).toBe('margherita_pizza');
    expect(finishedPizza(cfg, 2, [...base, 'topping:fresh_mozzarella', 'topping:basil'])?.id).toBe('margherita_pizza');
  });
  it('a wrong ingredient fits no recipe', () => {
    expect(candidatePizzas(cfg, 3, ['sauce:tomato', 'cheese:mozzarella', 'topping:mushroom'])).toEqual([]);
    expect(finishedPizza(cfg, 10, ['sauce:garlic', 'cheese:white', 'topping:spinach', 'topping:fresh_mozzarella'])?.id).toBe('white_pizza');
  });
  it('ingredients appear with their recipes and not before', () => {
    expect(unlockedIngredients(cfg, 1)).toEqual(['sauce:tomato', 'cheese:mozzarella']);
    expect(unlockedIngredients(cfg, 10)).toContain('cheese:white');
    expect(unlockedIngredients(cfg, 6)).not.toContain('sauce:bbq');
    expect(unlockedIngredients(cfg, 7)).toContain('sauce:bbq');
  });
  it('every pizza can be built from its own recipe steps', () => {
    for (const d of cfg.dishes.filter((x) => x.kind === 'pizza')) {
      const placed = recipeSteps(d).slice(1);
      expect(finishedPizza(cfg, 10, placed)?.id).toBe(d.id);
    }
  });
});

import { pizzaMilestones } from '../src/game/pizza/pizzaMenu';
import { pizzaRecipeIntro, pizzaStationName } from '../src/game/pizza/pizzaTutorial';

describe('Pizza Lv display (derived from the real XP curve)', () => {
  const rows = pizzaMilestones(defaultConfig, cfg);
  it('lists every dish once, starts at the unlock Lv and never goes down', () => {
    expect(rows).toHaveLength(10);
    expect(rows[0].lv).toBe(cfg.restaurant.unlockLevel);
    expect(rows.flatMap((r) => r.dishes).sort()).toEqual(cfg.dishes.map((d) => d.name).sort());
    for (let i = 1; i < rows.length; i++) expect(rows[i].lv).toBeGreaterThanOrEqual(rows[i - 1].lv);
  });
  it('matches the XP maths: the same XP feeds the menu and the global Lv, so the menu ends well before Lv 49', () => {
    expect(rows[9].lv).toBeGreaterThanOrEqual(34);
    expect(rows[9].lv).toBeLessThanOrEqual(36);
  });
  it('is display only: global Lv cannot skip menu steps', () => {
    expect(unlockedDishes(cfg, 1).map((d) => d.id)).toEqual(['cheese_pizza']);
    expect(unlockedDishes(cfg, 1)).toHaveLength(1);
  });
  it('the new-recipe card names the station and ingredients', () => {
    for (const d of cfg.dishes) {
      const t = pizzaRecipeIntro(cfg, d);
      expect(t.text).toContain(pizzaStationName(d));
      expect(t.title).toBe(d.name);
    }
    expect(pizzaRecipeIntro(cfg, cfg.dishes[0]).text).toMatch(/Dough, then/);
  });
});
