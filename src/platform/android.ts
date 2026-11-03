import Phaser from 'phaser';
import { App } from '@capacitor/app';
import { audio } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import type { GameScene } from '../scenes/GameScene';
import { decideBack } from './androidLogic';

/**
 * Android app glue (Capacitor). Loaded ONLY by the Android build (`npm run build:android`), never by the browser or CrazyGames builds.
 * Native rotation (landscape), fullscreen and the system bars are set in the Android project itself.
 *  - App goes to the background: save, pause the kitchen, stop the sound.
 *  - App comes back: sound restarts unless the game itself paused it (the Paused screen stays until the player taps Resume).
 *  - Back button: closes an open panel, else pauses, else sends the app to the background. It never quits the game.
 */
const PANELS = ['Shop', 'RecipeBook', 'RestaurantSelect'] as const;

export function initAndroid(game: Phaser.Game): void {
  const gameScene = (): GameScene | undefined => (game.scene.getScene('Game') as GameScene | null) ?? undefined;

  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      SaveSystem.save();
      gameScene()?.pauseFromSystem();
      audio.suspendForBackground();
    } else {
      audio.resumeOnGesture();
    }
  });

  void App.addListener('backButton', () => {
    const g = gameScene();
    const openPanel = PANELS.find((key) => game.scene.isActive(key));
    const action = decideBack({
      panelOpen: openPanel !== undefined,
      inGame: !!g && game.scene.isActive('Game'),
      paused: g?.backState.paused ?? false,
      closed: g?.backState.closed ?? false,
      adActive: g?.backState.adActive ?? false,
    });
    if (action === 'close-panel' && openPanel) {
      // every panel closes on Esc
      game.scene.getScene(openPanel).input.keyboard?.emit('keydown-ESC');
    } else if (action === 'pause') {
      g?.pauseFromSystem();
    } else if (action === 'minimize') {
      void App.minimizeApp();
    }
  });
}
