import type { TacoConfig, TacoLearning } from './tacoConfig';

// How the truck teaches a new dish. Pure helpers, no Phaser. The kitchen model uses `familiarityOf` to decide which orders may contain a dish;
// the scene uses the lesson bookkeeping to decide when the pointer tutorial runs. Both are driven by counts kept in the save, never by a timer.

/** Times each dish has been served (dish id -> count). */
export type TacoServed = Record<string, number>;
/** Lesson state per dish id: how many times its pointer tutorial was shown (1, 2), or LESSON_DONE once the player made it with the pointer's help. */
export type TacoLessons = Record<string, number>;

export const LESSON_DONE = 9;
/** A tutorial for one dish starts on its own at most this often (the full one, then one short reminder). */
export const LESSON_MAX_SHOWS = 2;

/** `intro`: never served, only ever ordered once on its own. `practice`: served a few times, ordered less often and never in a big order. `normal`: part of the usual rotation. */
export type Familiarity = 'intro' | 'practice' | 'normal';

export function familiarityOf(l: TacoLearning, served: number): Familiarity {
  if (served <= 0) return 'intro';
  return served < l.practiceServes ? 'practice' : 'normal';
}

/** For a save from before dish learning: every dish that joined the menu before the player's current step counts as learned (they already know it). */
export function seedLearned(taco: TacoConfig, menuStep: number): { served: TacoServed; lessons: TacoLessons } {
  const served: TacoServed = {};
  const lessons: TacoLessons = {};
  for (const d of taco.dishes) {
    if (d.unlockStep >= menuStep) continue;
    served[d.id] = taco.learning.practiceServes;
    lessons[d.id] = LESSON_DONE;
  }
  return { served, lessons };
}

/** Which pointer tutorial a dish gets the next time a customer orders it: the full one, the short reminder, or none (learned, or shown twice already). */
export function lessonMode(lessons: Readonly<TacoLessons>, dishId: string): 'full' | 'reminder' | null {
  const n = lessons[dishId] ?? 0;
  if (n >= LESSON_DONE) return null;
  if (n <= 0) return 'full';
  return n < LESSON_MAX_SHOWS ? 'reminder' : null;
}

/** Count one automatic showing of a dish's tutorial. */
export function lessonShown(lessons: Readonly<TacoLessons>, dishId: string): TacoLessons {
  const n = lessons[dishId] ?? 0;
  return n >= LESSON_DONE ? { ...lessons } : { ...lessons, [dishId]: Math.min(LESSON_MAX_SHOWS, n + 1) };
}

/** The player made the dish with the pointer's help: never show its tutorial on its own again. */
export function lessonDone(lessons: Readonly<TacoLessons>, dishId: string): TacoLessons {
  return { ...lessons, [dishId]: LESSON_DONE };
}
