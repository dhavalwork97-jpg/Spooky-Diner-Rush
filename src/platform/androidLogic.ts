/**
 * Decisions for the Android app, kept free of Phaser and Capacitor so they can be unit-tested.
 * The wiring that uses them is in `android.ts`.
 */

export interface BackContext {
  /** Shop, Recipe Book or restaurant list is open over the game. */
  panelOpen: boolean;
  /** The kitchen scene is the one running (not the title screen). */
  inGame: boolean;
  /** The game already shows the Paused screen. */
  paused: boolean;
  /** The restaurant is closed (Closed screen). */
  closed: boolean;
  /** An ad is on screen. */
  adActive: boolean;
}

export type BackAction = 'close-panel' | 'pause' | 'minimize' | 'ignore';

/**
 * What the Back button does. It never quits the game: the worst case is that the app goes to the background
 * with everything kept (the same as pressing Home), so a stray Back press cannot lose progress.
 */
export function decideBack(c: BackContext): BackAction {
  if (c.adActive) return 'ignore'; // an ad must not be skipped or interrupted by Back
  if (c.panelOpen) return 'close-panel';
  if (c.inGame && !c.paused && !c.closed) return 'pause';
  return 'minimize';
}
