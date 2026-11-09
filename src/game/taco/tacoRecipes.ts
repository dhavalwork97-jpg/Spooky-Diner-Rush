import { stepKind, type DishDef, type DrinkDef, type TacoConfig } from './tacoConfig';

// Recipe Book entries for the Taco Truck. Pure: built from data/taco.json, the same recipes the kitchen model uses,
// so the book can never disagree with what the kitchen accepts.

export interface TacoRecipeEntry {
  id: string;
  name: string;
  kind: 'dish' | 'drink';
  /** Dish sprite name (dishes) or the drink's row in the cup sheet (drinks). */
  sprite?: string;
  sheetRow?: number;
  price: number;
  xp: number;
  /** Not on the menu yet. Shown greyed out without a number: the truck's menu step is never shown to the player. */
  locked: boolean;
  /** One short instruction per step, in order. */
  steps: string[];
}

/** The label of a step id from taco.json, without its leading "a ". */
function label(taco: TacoConfig, id: string): string {
  return (taco.stepLabels[id] ?? id).replace(/^an? /, '');
}

/** What the player does for one step of a dish, in plain words (Recipe Book wording). */
export function recipeStepText(taco: TacoConfig, id: string, index: number): string {
  switch (stepKind(id, index)) {
    case 'base':
      return `Start with ${label(taco, id)}`;
    case 'shell':
      return 'Bake a crispy shell in the oven';
    case 'protein':
      return `Add ${taco.stepLabels[id] ?? id}`;
    case 'ingredient':
      return `Add ${label(taco, id)}`;
    case 'action':
      return id === 'action:wrap' ? 'Wrap it' : 'Cut it';
    case 'press':
      return 'Press it in a pan';
    case 'melt':
      return 'Melt it in the oven';
  }
}

const dishEntry = (taco: TacoConfig, d: DishDef, step: number): TacoRecipeEntry => ({
  id: d.id,
  name: d.name,
  kind: 'dish',
  sprite: d.sprite,
  price: d.price,
  xp: d.xp,
  locked: d.unlockStep > step,
  steps: d.steps.map((s, i) => recipeStepText(taco, s, i)),
});

const drinkEntry = (dr: DrinkDef, step: number): TacoRecipeEntry => ({
  id: dr.id,
  name: dr.name,
  kind: 'drink',
  sheetRow: dr.sheetRow,
  price: dr.price,
  xp: dr.xp,
  locked: dr.unlockStep > step,
  steps: ['Tap the dispenser to fill a cup', 'Drag the full cup to the customer'],
});

/** Every dish and drink, on the menu first (in menu order), then the ones still to come. Locked entries stay listed. */
export function tacoRecipeEntries(taco: TacoConfig, menuStep: number): TacoRecipeEntry[] {
  const dishes = taco.dishes.map((d) => ({ unlock: d.unlockStep, e: dishEntry(taco, d, menuStep) }));
  const drinks = taco.drinks.map((d) => ({ unlock: d.unlockStep, e: drinkEntry(d, menuStep) }));
  return [...dishes, ...drinks].sort((a, b) => a.unlock - b.unlock).map((x) => x.e);
}

/** The short how-to shown under the Taco Truck recipes: the parts of the kitchen every dish shares. */
export const TACO_BOOK_TIPS = 'Tap a raw protein to cook it in a pan, then tap the pan when it is ready. Tap the plate for wrap, press, cut and melt steps. Drag a finished dish to the customer.';
