import { describe, expect, it } from 'vitest';
import { decideBack, type BackContext } from '../src/platform/androidLogic';
import { IS_ANDROID_BUILD } from '../src/build/target';
import capacitorConfig from '../capacitor.config';

const ctx = (over: Partial<BackContext> = {}): BackContext => ({ panelOpen: false, inGame: true, paused: false, closed: false, adActive: false, ...over });
// Raw text of the project files (Vite resolves these at test time, so no Node types are needed).
const files = {
  ...import.meta.glob('../{vite.config.ts,package.json,.gitignore}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../android/{.gitignore,app/build.gradle,app/src/main/AndroidManifest.xml}', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;
const read = (p: string): string => {
  const text = files[`../${p}`];
  if (text === undefined) throw new Error(`${p} not found`);
  return text;
};

describe('Android Back button', () => {
  it('closes an open panel first', () => {
    expect(decideBack(ctx({ panelOpen: true }))).toBe('close-panel');
  });
  it('pauses a running game instead of leaving', () => {
    expect(decideBack(ctx())).toBe('pause');
  });
  it('sends the app to the background (never quits) from the title, the Paused screen and the Closed screen', () => {
    expect(decideBack(ctx({ inGame: false }))).toBe('minimize');
    expect(decideBack(ctx({ paused: true }))).toBe('minimize');
    expect(decideBack(ctx({ closed: true }))).toBe('minimize');
  });
  it('ignores Back while an ad is on screen, even with a panel flag', () => {
    expect(decideBack(ctx({ adActive: true }))).toBe('ignore');
    expect(decideBack(ctx({ adActive: true, panelOpen: true }))).toBe('ignore');
  });
});

describe('Android project setup', () => {
  it('the normal and test builds are not the Android build', () => {
    expect(IS_ANDROID_BUILD).toBe(false);
  });
  it('Capacitor serves the folder that `vite build --mode android` writes', () => {
    expect(capacitorConfig.webDir).toBe('dist-android');
    expect(read('vite.config.ts')).toContain("'dist-android'");
    expect(read('package.json')).toContain('vite build --mode android');
  });
  it('the app is locked to landscape and the app id matches the Gradle project', () => {
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain('android:screenOrientation="sensorLandscape"');
    expect(read('android/app/build.gradle')).toContain(`applicationId "${capacitorConfig.appId}"`);
  });
  it('the Android build removes the CrazyGames SDK script (browser ads only)', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('drop-crazygames-script');
    expect(cfg).toMatch(/android \? \[dropCrazyGamesScript\]/);
  });
  it('no signing secrets are part of the project', () => {
    const ignore = read('.gitignore') + read('android/.gitignore');
    expect(ignore).toContain('local.properties');
    expect(read('android/app/build.gradle')).not.toMatch(/storePassword|keyPassword|signingConfigs/);
  });
});
