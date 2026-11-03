import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app settings. The web files come from `npm run build:android` (folder `dist-android`).
 * appId is PROVISIONAL: it can never change after the first store upload, so the release-prep step confirms it before release.
 */
const config: CapacitorConfig = {
  appId: 'com.spookydinerrush.game',
  appName: 'Spooky Diner Rush',
  webDir: 'dist-android',
  backgroundColor: '#2B1B17',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
