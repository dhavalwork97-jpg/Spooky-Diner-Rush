import { describe, expect, it } from 'vitest';
import assetsJson from '../data/assets.json';

const files = Object.keys(import.meta.glob('/public/assets/intro/*', { query: '?url' }));
const existsSync = (p: string): boolean => files.includes(`/${p}`);

describe('title screen assets', () => {
  const list = (assetsJson as { assets: { key: string; file: string; lazy?: boolean }[] }).assets;

  it('lists the title art as lazy entries whose files exist', () => {
    for (const key of ['title_bg', 'title_logo', 'title_chef']) {
      const a = list.find((x) => x.key === key);
      expect(a, key).toBeDefined();
      expect(a?.lazy, `${key} is loaded by the title scene, not the boot scene`).toBe(true);
      expect(existsSync(`public/${a?.file}`), `${a?.file} exists`).toBe(true);
    }
  });

  it('ships the intro video', () => {
    expect(existsSync('public/assets/intro/intro.mp4')).toBe(true);
  });
});
