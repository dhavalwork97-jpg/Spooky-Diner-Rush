/**
 * Google's OFFICIAL AdMob TEST ids (https://developers.google.com/admob/android/test-ads). They always serve test ads and can never earn
 * or put an account at risk. REAL ids are NOT added yet: the owner supplies them in a later step, and the app id must also be changed
 * in `android/app/src/main/AndroidManifest.xml` (meta-data `com.google.android.gms.ads.APPLICATION_ID`).
 */
export const ADMOB_TEST_IDS = {
  /** Test app id. Lives in AndroidManifest.xml; listed here so a test can check both match. */
  appId: 'ca-app-pub-3940256099942544~3347511713',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

/** Always ask for test ads until real ids are approved. */
export const ADMOB_TESTING = true;
