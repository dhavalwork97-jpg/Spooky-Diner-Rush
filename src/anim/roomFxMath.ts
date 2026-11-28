/** Timing for the haunted room's video layers and storms. Pure, so it is unit tested. */

/** Seconds between two storms: a random wait in [MIN, MAX]. Rare on purpose, so a storm stays a small surprise. */
export const STORM_MIN_GAP = 40;
export const STORM_MAX_GAP = 90;
/** When a storm is due but the moment is bad (a popup, an ad, the clip not loaded), try again after this many seconds. */
export const STORM_RETRY = 10;
/** The first storm never comes before this many seconds into a session. */
export const STORM_FIRST_MIN = 25;
/** Seconds into the storm clip when the thunder starts (the clip begins 0.55 s before the original thunder). */
export const THUNDER_OFFSET = 0.55;
/** Seconds to fade the storm clip in over the calm loop, and out again. */
export const STORM_FADE = 0.3;
/** Length of the storm clip in seconds. */
export const STORM_LENGTH = 2.25;

/** `rand` returns a number in [0, 1). `first` is true for the first storm of the session. */
export function nextStormDelay(rand: number, first: boolean): number {
  const r = Math.min(Math.max(rand, 0), 0.999999);
  const wait = STORM_MIN_GAP + r * (STORM_MAX_GAP - STORM_MIN_GAP);
  return first ? Math.max(wait, STORM_FIRST_MIN) : wait;
}

/** A storm may start only when nothing else has the player's attention and the clip is ready. */
export function stormAllowed(s: { ready: boolean; paused: boolean; reduced: boolean; hidden: boolean }): boolean {
  return s.ready && !s.paused && !s.reduced && !s.hidden;
}
