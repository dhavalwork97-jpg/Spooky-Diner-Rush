import pizzaJson from '../../../data/pizza.json';
import type { TacoLearning, TacoRamp, TacoUpgradeTier, TacoVariety, TimedDef } from '../taco/tacoConfig';

// Types, defaults and pure helpers for the Pizza Place kitchen. No Phaser. Same shape as the Taco Truck's config (data/taco.json), with its own stations:
// three preparation boards, a two-slot brick oven, a two-tray small oven, a two-basket fryer and the ice cream machine.

export type DishKind = 'pizza' | 'side' | 'fried' | 'dessert';
export type PizzaModKey = 'ovenSpeed' | 'fryerSpeed' | 'burnWindow' | 'calm' | 'patience' | 'pourSpeed' | 'tips';

export interface PizzaSettings {
  boards: number;
  ovenSlots: number;
  smallOvenSlots: number;
  fryerBaskets: number;
  iceLanes: number;
  seats: number;
  maxOrderSize: number;
  arrivalGapMult: number;
}
export interface PizzaLearning extends TacoLearning {
  pizzaItemCap: number;
  sideItemCap: number;
  friedItemCap: number;
}
export interface Recipe {
  sauce: string;
  cheese: string;
  toppings: string[];
}
export interface DishDef {
  id: string;
  name: string;
  kind: DishKind;
  /** Menu step (1-10) at which the dish joins the menu. Not the global Lv. */
  unlockStep: number;
  price: number;
  xp: number;
  icon: string;
  /** Pizzas only. */
  recipe?: Recipe;
  /** Fried items only: which fryer basket cooks it (0 fries, 1 wings). */
  basket?: number;
}
export interface IngredientDef {
  id: string;
  name: string;
  unlockStep: number;
}
export type ZoneAction = 'dough' | 'sauce' | 'cheese' | 'topping' | 'board' | 'oven' | 'small_oven' | 'side' | 'fryer' | 'ice' | 'trash';
/** A tap area on the kitchen art, as a 0-1 rectangle of the background image. */
export interface PizzaZone {
  id: string;
  action: ZoneAction;
  arg?: string;
  index?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PizzaUpgradeDef {
  id: string;
  name: string;
  description: string;
  mod: PizzaModKey;
  tiers: TacoUpgradeTier[];
}
export interface PizzaConfig {
  restaurant: { id: string; name: string; unlockLevel: number; cost: number };
  settings: PizzaSettings;
  /** Display only: which Lv shows which unlock. Recipes really unlock by menu step. */
  levelProgression: { note: string; milestones: { lv: number; text: string }[] };
  learning: PizzaLearning;
  variety: TacoVariety;
  /** How likely each dish category is when an order item is picked (only categories with an unlocked dish count). */
  kindWeights: Record<DishKind, number>;
  timed: { pizza: TimedDef; side: TimedDef; fries: TimedDef; wings: TimedDef };
  ice: { fillSeconds: number };
  /** First-pass values: extra share of the coins and XP of an order that holds a pizza, a side and an ice cream. */
  /** First-pass values: how much of the READY phase counts as perfect (0.5 = the first half) and the extra tip as a share of the item price. */
  /** First-pass values for build-your-own orders: they start at menu step `fromStep`, one topping first, and grow. Indexed from `fromStep`. */
  custom: {
    fromStep: number;
    chance: number[];
    maxToppings: number[];
    /** For a max of 1, 2 or 3 toppings: how likely 1, 2 or 3 toppings are. */
    countWeights: number[][];
    basePrice: number;
    toppingPrice: number;
    sauceExtra: number;
    cheeseExtra: number;
    xpBase: number;
    xpPerTopping: number;
    /** Toppings never asked for: fresh_mozzarella has no supplied icon yet, so a bubble could not show it. */
    excludeToppings: string[];
  };
  /** The Pizza Place Daily Special starts at this menu step (the bonus and the serves it waits for are the shared ones in data/extras.json). */
  dailySpecial: { fromStep: number };
  perfectBake: { share: number; tipFraction: number };
  comboMeal: { coinBonus: number; xpBonus: number };
  oven: { doorMinGap: number; openSeconds: number; closeSeconds: number; slotXFractions: number[]; slotYFraction: number };
  upgrades: PizzaUpgradeDef[];
  ramp: TacoRamp[];
  ingredients: { sauces: IngredientDef[]; cheeses: IngredientDef[]; toppings: IngredientDef[] };
  stepLabels: Record<string, string>;
  dishes: DishDef[];
  art: { folder: string; back: string; front: string; width: number; height: number };
  customerWindow: {
    slots: { id: string; x: number; bottomY: number }[];
    bandTop: number;
    bandBottom: number;
    bubbleY: number;
    dropZone: { x: number; y: number; width: number; height: number };
  };
  zones: PizzaZone[];
  /** Where each animated station sprite sits, in pixels of the 1679 x 937 background (x, y = top left; width = display width of the whole sprite). */
  stations: Record<'ovenBig' | 'ovenSmall' | 'fryerFries' | 'fryerWings' | 'iceMachine', { sheet: string; x: number; y: number; width: number; half?: 'left' | 'right' }>;
  events: Record<string, { name: string; minStep: number; duration: number; tickets: [number, number]; coinMult: number; note?: string }>;
}

export const defaultPizzaConfig: PizzaConfig = pizzaJson as unknown as PizzaConfig;

export const PIZZA_ID = 'pizza_place';

export function unlockedDishes(cfg: PizzaConfig, step: number): DishDef[] {
  return cfg.dishes.filter((d) => d.unlockStep <= step);
}
export const dishById = (cfg: PizzaConfig, id: string): DishDef | undefined => cfg.dishes.find((d) => d.id === id);

/** Every ingredient on the menu at this step as step ids (`sauce:tomato`, `cheese:mozzarella`, `topping:basil`). */
export function unlockedIngredients(cfg: PizzaConfig, step: number): string[] {
  const { sauces, cheeses, toppings } = cfg.ingredients;
  return [...sauces.map((i) => ['sauce', i] as const), ...cheeses.map((i) => ['cheese', i] as const), ...toppings.map((i) => ['topping', i] as const)]
    .filter(([, i]) => i.unlockStep <= step)
    .map(([k, i]) => `${k}:${i.id}`);
}
