import Phaser from 'phaser';
import { TACO_WINDOW } from '../game/taco/tacoWindow';
import type { BackgroundPlacement } from '../kitchen/zones';
import { fitVideo } from './videoFit';

/** Depths: the old back layer is 0; the still 0.8 and the video 0.9 cover its window; haunted glows (2), customers (10) and the front frame (20) stay above. */
const STILL_DEPTH = 0.8;
const VIDEO_DEPTH = 0.9;

/**
 * The Taco Truck's window video. The still (loaded with the scene's other art) covers the old window right away; the muted loop downloads in the
 * background and plays over it. Reduced motion keeps the still only. The video pauses while the tab is hidden. Nothing here is tappable.
 */
export class WindowVideo {
  private video?: Phaser.GameObjects.Video;
  private dead = false;
  private readonly area: { x: number; y: number; width: number; height: number };

  constructor(private readonly scene: Phaser.Scene, bg: BackgroundPlacement, reduced: boolean) {
    const r = TACO_WINDOW.rect;
    this.area = { x: bg.x + r.x * bg.width, y: bg.y + r.y * bg.height, width: r.width * bg.width, height: r.height * bg.height };
    const a = this.area;
    scene.add.image(a.x, a.y, TACO_WINDOW.stillKey).setOrigin(0, 0).setDisplaySize(a.width, a.height).setDepth(STILL_DEPTH).setName(TACO_WINDOW.stillKey);
    if (reduced) return;
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    scene.game.events.on(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    scene.load.video(TACO_WINDOW.videoKey, [...TACO_WINDOW.videoFiles], true);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => this.start());
    scene.load.start();
  }

  private start(): void {
    if (this.dead || !this.scene.cache.video.exists(TACO_WINDOW.videoKey)) return;
    const a = this.area;
    const v = this.scene.add.video(a.x, a.y, TACO_WINDOW.videoKey).setOrigin(0, 0).setDepth(VIDEO_DEPTH).setName(TACO_WINDOW.videoKey);
    fitVideo(this.scene, v, a, () => this.dead);
    v.setMute(true);
    v.play(true);
    this.video = v;
  }

  private onHidden(): void {
    this.video?.setPaused(true);
  }

  private onVisible(): void {
    this.video?.setPaused(false);
  }

  destroy(): void {
    this.dead = true;
    this.scene.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.scene.game.events.off(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    this.video?.destroy();
    this.video = undefined;
  }
}
