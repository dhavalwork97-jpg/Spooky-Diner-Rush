import type { PizzaKitchenState } from './PizzaKitchenState';
import { defaultPizzaConfig, type DishDef, type PizzaConfig } from './pizzaConfig';
import { recipeSteps } from './pizzaRecipes';
import type { TacoHint } from '../taco/tacoTutorial';

/**
 * The Pizza Place's guided first pizza and per-recipe lessons. Like the Taco Truck's, it only READS the kitchen model and never changes it:
 * it names the next thing to tap (a zone id from data/pizza.json) and a short instruction. Hints use the Taco tutorial's hint shape so the same pointer view draws them.
 */
export const PIZZA_TUTORIAL_ID = 'pizza_tutorial_done';

/** Show the guided first pizza to a player who has not finished it and is still at the first menu step. */
export function pizzaTutorialDue(seen: readonly string[], menuStep: number): boolean {
  return !seen.includes(PIZZA_TUTORIAL_ID) && menuStep <= 1;
}

const zoneId = (p: PizzaConfig, action: string, match: { arg?: string; index?: number; prefix?: string }): string | null =>
  p.zones.find((z) => z.action === action && (match.arg === undefined || z.arg === match.arg) && (match.index === undefined || z.index === match.index) && (match.prefix === undefined || z.id.startsWith(match.prefix)))?.id ?? null;

const label = (p: PizzaConfig, step: string): string => (p.stepLabels[step] ?? step).replace(/^an? /, '');

/** Which station a dish is made at, in plain words (shown on the new-recipe card; the tutorial hand highlights the same station). */
export const pizzaStationName = (dish: DishDef): string => (dish.kind === 'pizza' ? 'brick oven' : dish.kind === 'side' ? 'small oven' : dish.kind === 'fried' ? 'fryer' : 'ice cream machine');

export function pizzaRecipeIntro(p: PizzaConfig, dish: DishDef): { title: string; text: string } {
  if (dish.kind !== 'pizza') {
    const how = dish.kind === 'side' ? 'Put it in the small oven, then tap it when it is ready.' : dish.kind === 'fried' ? 'Drop it in the fryer, then tap the basket when it is ready.' : 'Tap the ice cream machine, then tap the cone when it is full.';
    return { title: dish.name, text: `New on the menu!\nStation: ${pizzaStationName(dish)}.\n${how}` };
  }
  const parts = recipeSteps(dish).slice(1).map((id) => label(p, id));
  const first = parts.slice(0, 4).join(', ');
  return { title: dish.name, text: `New recipe! Dough, then ${first}${parts.length > 4 ? ' and more' : ''}.\nStation: ${pizzaStationName(dish)}. Follow the hand!` };
}

/** The customer a lesson is about: the first waiting customer who still wants this dish. */
export function pizzaLessonCustomer(s: PizzaKitchenState, dishId: string): number | null {
  return s.customers.find((c) => c.mood === 'waiting' && c.items.some((k, i) => k === dishId && !c.delivered[i]))?.id ?? null;
}

/** What to do next to make `dishId` (the guided first pizza when none is named). */
export function nextPizzaHint(s: PizzaKitchenState, dishId?: string, p: PizzaConfig = defaultPizzaConfig): TacoHint | null {
  const dish = s.dishDef(dishId ?? p.dishes.find((d) => d.unlockStep <= 1 && d.kind === 'pizza')?.id ?? 'cheese_pizza');
  if (!dish) return null;
  const tap = (zone: string | null, text: string, key: string): TacoHint => (zone ? { kind: 'tap', zone, text, key } : { kind: 'wait', text, key });
  const wait = (text: string, key: string): TacoHint => ({ kind: 'wait', text, key });
  if (!pizzaLessonCustomer(s, dish.id)) return wait(`Wait for a customer who wants ${dish.name}`, `w:${dish.id}`);

  if (dish.kind === 'pizza') {
    const boardZone = (i: number) => zoneId(p, 'board', { index: i });
    const mine = s.boards.map((b, i) => ({ b, i })).filter(({ b }) => b.item?.dish === dish.id || (b.item?.status === 'building' && s.candidates(b.item).some((d) => d.id === dish.id)));
    const baked = mine.find(({ b }) => b.item?.status === 'baked' && b.item.dish === dish.id);
    if (baked) return tap(boardZone(baked.i), 'Tap the pizza to serve it', `serve:${baked.b.item!.id}`);
    const ready = s.ovens.findIndex((o) => o && o.phase !== 'cooking' && o.phase !== 'burnt' && s.boards[o.board]?.item?.dish === dish.id);
    if (ready >= 0) return tap(zoneId(p, 'oven', { index: ready }), 'It is ready! Tap it to take it out', `out:${ready}:${s.ovens[ready]!.phase}`);
    const baking = s.ovens.some((o) => o && s.boards[o.board]?.item?.dish === dish.id);
    if (baking) return wait('Baking... wait for the green tick', `bake:${dish.id}`);
    const built = mine.find(({ b }) => b.item?.status === 'built' && b.item.dish === dish.id);
    if (built) return tap(boardZone(built.i), 'Tap the pizza to bake it in the oven', `oven:${built.b.item!.id}`);
    const building = mine.find(({ b }) => b.item?.status === 'building');
    if (building) {
      const item = building.b.item!;
      const need = ['sauce', 'cheese', 'topping'].flatMap((k) => (k === 'sauce' ? [`sauce:${dish.recipe!.sauce}`] : k === 'cheese' ? [`cheese:${dish.recipe!.cheese}`] : dish.recipe!.toppings.map((t) => `topping:${t}`))).find((st) => !item.placed.includes(st));
      if (need) return tap(zoneId(p, need.split(':')[0], { arg: need.split(':')[1] }), `Add ${label(p, need)}`, `add:${item.id}:${need}`);
      return tap(boardZone(building.i), 'Tap the pizza to finish it', `finish:${item.id}`);
    }
    return s.boards.some((b) => !b.item) ? tap(zoneId(p, 'dough', {}), 'Tap the dough to start a pizza', `dough:${dish.id}`) : wait('Serve a pizza first: the boards are full', 'full');
  }

  if (dish.kind === 'side') {
    const i = s.smallOven.findIndex((t) => t?.dish === dish.id);
    if (i >= 0) {
      const t = s.smallOven[i]!;
      return t.phase === 'cooking' ? wait('Baking... wait for the green tick', `side:${i}`) : tap(zoneId(p, 'small_oven', {}), 'It is ready! Tap the oven to serve it', `side:${i}:${t.phase}`);
    }
    return tap(zoneId(p, 'side', { arg: dish.id }), `Tap the ${dish.name.toLowerCase()} tray to bake it`, `tray:${dish.id}`);
  }

  if (dish.kind === 'fried') {
    const i = dish.basket ?? 0;
    const b = s.fryer[i];
    if (b) return b.phase === 'cooking' ? wait('Frying... wait for the green tick', `fry:${i}`) : tap(zoneId(p, 'fryer', { index: i, prefix: 'fryer_basket' }), 'It is ready! Tap the basket to serve it', `fry:${i}:${b.phase}`);
    return tap(zoneId(p, 'fryer', { index: i, prefix: 'tray_' }), `Tap the ${dish.name.toLowerCase()} to fry it`, `fryer:${dish.id}`);
  }

  const ice = zoneId(p, 'ice', {});
  const full = s.ice.some((l) => l && l.phase !== 'cooking');
  if (full) return tap(ice, 'It is full! Tap the cone to serve it', 'ice:full');
  if (s.ice.some((l) => l)) return wait('Filling... wait for the green tick', 'ice:fill');
  return tap(ice, 'Tap the ice cream machine', 'ice:start');
}
