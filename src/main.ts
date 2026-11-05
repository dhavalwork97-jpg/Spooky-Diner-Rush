import Phaser from 'phaser';
import { BootScene, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ShopScene } from './scenes/ShopScene';
import { RecipeBookScene } from './scenes/RecipeBookScene';
import { RestaurantSelectScene } from './scenes/RestaurantSelectScene';
import { CrazyGames } from './sdk/crazygames';
import { initAds } from './ads';
import { initOrientation } from './systems/Orientation';
import { audio } from './systems/AudioSystem';
import { IS_ANDROID_BUILD } from './build/target';

const start = (): Phaser.Game =>
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    backgroundColor: '#2B1B17',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, TitleScene, GameScene, ShopScene, RecipeBookScene, RestaurantSelectScene],
  });

// Browser phones: the first tap enters fullscreen and locks landscape. The Android app is locked to landscape natively.
if (!IS_ANDROID_BUILD) initOrientation();

// iOS: sound the browser stopped (call, lock screen) can only restart inside a tap.
for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(type, () => audio.resumeOnGesture(), { passive: true });
}

// The CrazyGames SDK must be ready before the save data is read in BootScene.
void CrazyGames.init().then(() => {
  CrazyGames.loadingStart();
  const game = start();
  // Written with the literal `import.meta.env.MODE` so Vite removes this branch (and the Capacitor files) outside the Android build.
  if (import.meta.env.MODE === 'android') void import('./platform/android').then((m) => m.initAndroid(game));
  void initAds(); // Android: starts LevelPlay; browser and CrazyGames: nothing to start (the CrazyGames SDK was initialised above)
});
