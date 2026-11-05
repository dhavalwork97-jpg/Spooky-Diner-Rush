/**
 * Ad timing shared by BOTH platforms. One place, so the browser (CrazyGames) and the Android app (LevelPlay) can never drift apart.
 * The reward numbers are NOT here: they stay in the game model (`KitchenState.reopen`: normal 55 reputation, rewarded 100).
 */

/** Our own spacing between mid-game ads (180 s). Each ad network enforces its own limits on top of this. */
export const AD_GAP_MS = 180_000;
/** An ad that never reports back must not freeze the game. */
export const AD_TIMEOUT_MS = 90_000;
