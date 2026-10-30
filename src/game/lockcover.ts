/**
 * What a station's "Lv N" cover should do when the level is checked. `prev` is what the cover
 * was last told (null before the first check). It only reacts to a change, so a fade that is
 * already running is never restarted.
 */
export type CoverChange = 'lock' | 'unlock' | 'none';

export function coverChange(prev: boolean | null, locked: boolean): CoverChange {
  if (prev === locked) return 'none';
  return locked ? 'lock' : 'unlock';
}
