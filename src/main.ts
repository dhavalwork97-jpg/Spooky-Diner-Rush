import Phaser from 'phaser';
import { BootScene, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ShopScene } from './scenes/ShopScene';
import { RecipeBookScene } from './scenes/RecipeBookScene';
import { RestaurantSelectScene } from './scenes/RestaurantSelectScene';
import { TacoScene } from './scenes/TacoScene';
import { PizzaScene } from './scenes/PizzaScene';
import { Portal } from './sdk/portal';
import { initOrientation } from './systems/Orientation';
import { audio } from './systems/AudioSystem';
import { IS_POKI_BUILD } from './build/target';
import { isScrollKey, stripDevParams } from './build/devParams';

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
    scene: [BootScene, TitleScene, GameScene, ShopScene, RecipeBookScene, RestaurantSelectScene, TacoScene, PizzaScene],
  });

if (IS_POKI_BUILD) {
  // Poki rules: no debug code in the shipped game, and the page must not scroll while playing.
  const clean = stripDevParams(location.search);
  if (clean !== location.search) history.replaceState(null, '', location.pathname + clean + location.hash);
  window.addEventListener('keydown', (e) => { if (isScrollKey(e)) e.preventDefault(); }, { capture: true });
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}

initOrientation(); // phones: the first tap enters fullscreen and locks landscape

// iOS: sound the browser stopped (call, lock screen) can only restart inside a tap.
for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(type, () => audio.resumeOnGesture(), { passive: true });
}

// The CrazyGames SDK must be ready before the save data is read in BootScene.
void Portal.init().then(() => {
  Portal.loadingStart();
  start();
});
