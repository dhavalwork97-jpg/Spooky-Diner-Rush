import { describe, expect, it } from 'vitest';
import manifest from '../android/app/src/main/AndroidManifest.xml?raw';
import gitignore from '../.gitignore?raw';
import envExample from '../.env.example?raw';
import { KitchenState } from '../src/game/KitchenState';
import { AD_GAP_MS } from '../src/ads/timing';
import { AD_GAP_MS as CG_GAP_MS } from '../src/sdk/crazygames';

/** Every source file of the game as text (Vite `?raw`, so no Node types are needed). Keys look like `src/ads/index.ts`. */
const files = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const code = new Map<string, string>(Object.entries(files).map(([k, v]) => [k.replace('../', ''), v]));
const where = (test: (text: string) => boolean): string[] => [...code].filter(([, text]) => test(text)).map(([path]) => path).sort();
const text = (path: string): string => code.get(path) ?? '';

describe('reward economy is unchanged', () => {
  const closed = (): KitchenState => {
    const s = new KitchenState();
    (s as unknown as { addReputation(d: number): void }).addReputation(-1000);
    return s;
  };
  it('a normal Reopen gives 55 reputation', () => {
    const s = closed();
    s.reopen();
    expect(s.reputation).toBe(55);
  });
  it('a rewarded Reopen gives 100 reputation', () => {
    const s = closed();
    s.reopen(true);
    expect(s.reputation).toBe(100);
  });
  it('the mid-game ad spacing is 180 s on both platforms, from one constant', () => {
    expect(AD_GAP_MS).toBe(180_000);
    expect(CG_GAP_MS).toBe(AD_GAP_MS);
  });
  it('the reward is granted in one place only, after the ad result (GameScene)', () => {
    expect(where((t) => /\.reopen\(true\)/.test(t))).toEqual(['src/scenes/GameScene.ts']);
    expect(text('src/scenes/GameScene.ts')).toMatch(/if \(finished\) this\.state\.reopen\(true\)/);
    // the ad code only reports "earned or not": it never touches reputation or reopen
    const adCode = [...code].filter(([p]) => p.startsWith('src/ads/')).map(([, t]) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
    expect(adCode.length).toBeGreaterThan(3);
    for (const t of adCode) expect(/reopen|reputation/i.test(t)).toBe(false);
  });
});

describe('LevelPlay stays out of the browser and CrazyGames builds', () => {
  it('only src/ads/levelplayAds.ts imports the plugin', () => {
    expect(where((t) => t.includes('capacitor-levelplay-ads'))).toEqual(['src/ads/levelplayAds.ts']);
  });
  it('levelplayAds is only reached through a dynamic import behind the android mode check', () => {
    expect(where((t) => /from ['"]\.\/levelplayAds['"]|import\(['"]\.\/levelplayAds['"]\)/.test(t))).toEqual(['src/ads/index.ts']);
    const index = text('src/ads/index.ts');
    expect(index).not.toMatch(/^import .*levelplayAds/m); // no static import
    expect(index).toMatch(/import\.meta\.env\.MODE === 'android'[\s\S]*import\('\.\/levelplayAds'\)/);
  });
  it('the LevelPlay ids are read in one Android-only file', () => {
    expect(where((t) => t.includes('VITE_LEVELPLAY_'))).toEqual(['src/ads/levelplayConfig.ts']);
    expect(where((t) => t.includes("./levelplayConfig"))).toEqual(['src/ads/levelplayAds.ts']);
  });
  it('the CrazyGames wrapper knows nothing about LevelPlay or AdMob', () => {
    expect(/levelplay|admob/i.test(text('src/sdk/crazygames.ts'))).toBe(false);
  });
  it('AdMob is gone from the code and the manifest', () => {
    expect(where((t) => /admob|ca-app-pub/i.test(t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))).toEqual([]);
    expect(manifest).not.toMatch(/ca-app-pub|APPLICATION_ID/);
  });
});

describe('configuration and permissions', () => {
  it('local env files are git-ignored and the example holds only placeholders', () => {
    expect(gitignore).toMatch(/^\.env\.\*\.local$/m);
    expect(gitignore).toMatch(/^\.env\.local$/m);
    for (const k of ['APP_KEY', 'REWARDED_ID', 'INTERSTITIAL_ID', 'BANNER_ID']) expect(envExample).toMatch(new RegExp(`VITE_LEVELPLAY_${k}=YOUR_`));
  });
  it('the manifest declares the advertising id permission LevelPlay needs, and nothing else new', () => {
    expect(manifest).toContain('com.google.android.gms.permission.AD_ID');
    const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(perms).toEqual(['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID']);
  });
});
