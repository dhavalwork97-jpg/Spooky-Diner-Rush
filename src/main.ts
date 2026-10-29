import Phaser from 'phaser';
import { BootScene, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { ShopScene } from './scenes/ShopScene';
import { RecipeBookScene } from './scenes/RecipeBookScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  backgroundColor: '#2B1B17',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, GameScene, ShopScene, RecipeBookScene],
});
