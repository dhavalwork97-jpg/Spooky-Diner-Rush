import { LESSON_DONE, type TacoServed, type TacoLessons } from '../taco/tacoLearning';
import type { PizzaConfig } from './pizzaConfig';

// Dish learning for the Pizza Place uses the same pure rules as the Taco Truck (familiarityOf, lessonMode, lessonShown, lessonDone in tacoLearning.ts);
// only the starting values differ.
export { familiarityOf, lessonDone, lessonMode, lessonShown, LESSON_DONE, LESSON_MAX_SHOWS } from '../taco/tacoLearning';
export type { Familiarity, TacoLessons as PizzaLessons, TacoServed as PizzaServed } from '../taco/tacoLearning';

/** Debug and tests: every dish that joined the menu before `menuStep` counts as learned. */
export function seedPizzaLearned(p: PizzaConfig, menuStep: number): { served: TacoServed; lessons: TacoLessons } {
  const served: TacoServed = {};
  const lessons: TacoLessons = {};
  for (const d of p.dishes) {
    if (d.unlockStep >= menuStep) continue;
    served[d.id] = p.learning.practiceServes;
    lessons[d.id] = LESSON_DONE;
  }
  return { served, lessons };
}
