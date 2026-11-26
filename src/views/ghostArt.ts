import type Phaser from 'phaser';
import { CUSTOMER_LOOKS, LOOK_ART, type LookArt } from '../anim/customerMotion';
import { CUSTOMER_LOOK_MIN, LOOK_UNLOCK_LEVELS } from '../game/KitchenState';

/**
 * Background loading for the ghosts that join the diner after the mint ghost (the lilac ghost). Nothing here runs at boot: the art is
 * fetched while the player is one Lv away from meeting each one, so the first minutes download nothing extra (about 0.5 MB of files and 14 MB of texture
 * in all). Only the three looping clips are loaded here; the happy clip is requested by the customer view, like the mint ghost's leave clips.
 * A customer whose art has not arrived is drawn as the mint ghost (see `lookIsReady`), so a slow or failed download never breaks the game.
 */

/** Fetch each ghost this many Lv before it can first show up. */
export const LOOK_PREFETCH_LEVELS = 1;

const requested = new Set<string>();
const loops = (art: LookArt) => [art.calm, art.upset, art.angry];

/** True when every looping clip of this look is in memory. */
export const lookIsReady = (scene: Phaser.Scene, art: LookArt): boolean => loops(art).every((c) => scene.textures.exists(c.key));

/** Devices that report little memory (Chrome's `deviceMemory`, in GB) keep the mint ghost only. Browsers that do not report it get everything. */
export function extraLooksAllowed(): boolean {
  const mem = typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory;
  return mem === undefined || mem >= 4;
}

/** The extra looks (not the mint ghost) whose art should be in memory by this diner Lv, as keys of LOOK_ART. */
export function looksToLoad(level: number): string[] {
  const out: string[] = [];
  LOOK_UNLOCK_LEVELS.forEach((lv, i) => {
    if (i === 0 || level + LOOK_PREFETCH_LEVELS < lv) return;
    out.push(CUSTOMER_LOOKS[CUSTOMER_LOOK_MIN + i]);
  });
  return out;
}

/** Queue the looping clips of every extra look that is due at this Lv (once each) and start the loader if it is idle. */
export function loadGhostLooks(scene: Phaser.Scene, level: number): void {
  if (!extraLooksAllowed()) return;
  const mine: string[] = [];
  for (const name of looksToLoad(level)) {
    const art = LOOK_ART[name as keyof typeof LOOK_ART];
    if (!art) continue;
    for (const clip of loops(art)) {
      if (requested.has(clip.key) || scene.textures.exists(clip.key)) continue;
      requested.add(clip.key);
      mine.push(clip.key);
      scene.load.spritesheet(clip.key, clip.file, { frameWidth: clip.size, frameHeight: clip.size });
    }
  }
  if (mine.length === 0) return;
  // Leaving the scene mid-download (say, off to the Taco Truck) drops what has not arrived; forget those keys so the next visit asks for them again.
  scene.events.once('shutdown', () => {
    for (const k of mine) if (!scene.textures.exists(k)) requested.delete(k);
  });
  if (!scene.load.isLoading()) scene.load.start();
}
