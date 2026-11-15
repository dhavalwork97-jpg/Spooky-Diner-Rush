import Phaser from 'phaser';
import assetsJson from '../../data/assets.json';

/**
 * The diner extras art (decor pieces, the bat, chests, badges) is lazy: each group is fetched only when a feature needs it.
 * Keys are `dx_<name>` (see data/assets.json). Until a texture arrives (or if it fails) views simply do not draw it.
 */
export type DinerArtGroup = 'decor' | 'bat' | 'chest' | 'badges';

interface AssetRow {
  key: string;
  type: string;
  file: string;
  frameWidth?: number;
  frameHeight?: number;
  width?: number;
  height?: number;
}
const ROOT = 'assets/diner_extras/';
const rows = (): AssetRow[] => (assetsJson as { assets: AssetRow[] }).assets.filter((a) => a.file.startsWith(ROOT));

export const dxKey = (name: string): string => `dx_${name}`;
export const dinerArtRows = (group: DinerArtGroup): AssetRow[] => rows().filter((a) => a.file.startsWith(`${ROOT}${group}/`));
export const hasDinerArt = (scene: Phaser.Scene, name: string): boolean => scene.textures.exists(dxKey(name));

/** Load a group in the background; `onReady` runs once everything queued is loaded (at once when nothing was missing). */
export function loadDinerArt(scene: Phaser.Scene, group: DinerArtGroup, onReady?: () => void): void {
  let queued = false;
  for (const a of dinerArtRows(group)) {
    if (scene.textures.exists(a.key)) continue;
    if (a.type === 'spritesheet') scene.load.spritesheet(a.key, a.file, { frameWidth: a.frameWidth ?? 0, frameHeight: a.frameHeight ?? 0 });
    else scene.load.image(a.key, a.file);
    queued = true;
  }
  if (!queued) {
    onReady?.();
    return;
  }
  const failed = (f: Phaser.Loader.File): void => console.error(`Missing asset: ${f.key} (${f.url})`);
  scene.load.on('loaderror', failed);
  scene.load.once('complete', () => {
    scene.load.off('loaderror', failed);
    onReady?.();
  });
  if (!scene.load.isLoading()) scene.load.start();
}
