import Phaser from 'phaser';
import assetsJson from '../../data/assets.json';

interface LazyImageDef {
  key: string;
  type: string;
  file: string;
  lazy?: boolean;
}

const defs = new Map((assetsJson as { assets: LazyImageDef[] }).assets.map((a) => [a.key, a]));
const pendingByScene = new WeakMap<Phaser.Scene, Set<string>>();

/**
 * Load selected lazy manifest images in the background.
 * Callers should request art before the feature unlocks and use onReady for dependent visuals.
 */
export function loadLazyImages(scene: Phaser.Scene, keys: readonly string[], onReady?: () => void): void {
  let pending = pendingByScene.get(scene);
  if (!pending) {
    pending = new Set<string>();
    pendingByScene.set(scene, pending);
  }

  const queued: string[] = [];
  for (const key of keys) {
    if (scene.textures.exists(key) || pending.has(key)) continue;
    const def = defs.get(key);
    if (!def || def.type !== 'image' || !def.lazy) {
      console.error(`Lazy image manifest entry is missing or not marked lazy: ${key}`);
      continue;
    }
    pending.add(key);
    queued.push(key);
    scene.load.image(def.key, def.file);
  }

  if (queued.length === 0) {
    onReady?.();
    return;
  }

  const failed = (file: Phaser.Loader.File): void => console.error(`Missing lazy asset: ${file.key} (${file.url})`);
  scene.load.on('loaderror', failed);
  scene.load.once('complete', () => {
    scene.load.off('loaderror', failed);
    queued.forEach((key) => pending!.delete(key));
    if (scene.sys.isActive()) onReady?.();
  });
  if (!scene.load.isLoading()) scene.load.start();
}
