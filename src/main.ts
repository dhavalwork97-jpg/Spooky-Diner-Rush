import Phaser from 'phaser';
import { BootScene, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ShopScene } from './scenes/ShopScene';
import { RecipeBookScene } from './scenes/RecipeBookScene';
import { RestaurantSelectScene } from './scenes/RestaurantSelectScene';
import { TacoScene } from './scenes/TacoScene';
import { CrazyGames } from './sdk/crazygames';
import { initOrientation } from './systems/Orientation';
import { audio } from './systems/AudioSystem';

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
    scene: [BootScene, TitleScene, GameScene, ShopScene, RecipeBookScene, RestaurantSelectScene, TacoScene],
  });

initOrientation(); // phones: the first tap enters fullscreen and locks landscape

// iOS: sound the browser stopped (call, lock screen) can only restart inside a tap.
for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(type, () => audio.resumeOnGesture(), { passive: true });
}

// The CrazyGames SDK must be ready before the save data is read in BootScene.
void CrazyGames.init().then(() => {
  CrazyGames.loadingStart();
  start();
});
