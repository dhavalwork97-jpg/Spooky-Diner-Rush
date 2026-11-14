/**
 * Which scene follows loading. Pure, so the rule is unit-tested.
 * - ?debug always starts straight in (the test scripts expect that); with ?taco it opens the Taco Truck.
 * - A returning player (any saved progress) goes straight into the game: the title screen and its intro are only for new players.
 * - A new player sees the title screen first, except in the CrazyGames build (`skipTitle`): CrazyGames wants players in gameplay at once,
 *   and without the intro video the title would only be an extra "Tap to play" click before the first minute of play counts.
 */
export type FirstScene = 'Title' | 'Game' | 'Taco';

/** The parts of the save that say a player has played before. */
export interface ProgressSave {
  level: number;
  xp: number;
  coins: number;
  seenStory: readonly string[];
}

export const hasSavedProgress = (s: ProgressSave): boolean => s.level > 1 || s.xp > 0 || s.coins > 0 || s.seenStory.length > 0;

export function chooseFirstScene(opts: { debug: boolean; taco: boolean; returning: boolean; skipTitle?: boolean }): FirstScene {
  if (opts.debug) return opts.taco ? 'Taco' : 'Game';
  return opts.returning || opts.skipTitle ? 'Game' : 'Title';
}
