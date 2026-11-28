import Phaser from 'phaser';
import { audio } from '../systems/AudioSystem';
import { fitVideo } from './videoFit';
import { nextStormDelay, STORM_FADE, STORM_RETRY, stormAllowed, THUNDER_OFFSET } from './roomFxMath';

const CALM = 'room_calm';
const STORM = 'room_storm';
const URLS = {
  [CALM]: ['assets/room/spooky_room_calm_loop.webm', 'assets/room/spooky_room_calm_loop.mp4'],
  [STORM]: ['assets/room/spooky_room_storm.webm', 'assets/room/spooky_room_storm.mp4'],
};
/** Below the kitchen picture (depth 0) and the still of the room it covers, above nothing else. */
const D = { still: -3, calm: -2, storm: -1 };

type Rect = { x: number; y: number; width: number; height: number };

/**
 * The haunted room behind the kitchen: a still picture, a muted looping video over it, and now and then a short
 * storm clip (lightning plus thunder) faded in over the loop. The kitchen picture is transparent where the room
 * shows, so nothing here is interactive and no tap is ever blocked. If a video cannot load or play, the still stays.
 */
export class RoomFx {
  private calm?: Phaser.GameObjects.Video;
  private storm?: Phaser.GameObjects.Video;
  private timer?: Phaser.Time.TimerEvent;
  private stormTimer?: Phaser.Time.TimerEvent;
  private firstStorm = true;
  private stormReady = false;
  private hidden = false;
  private dead = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly area: Rect,
    private readonly opts: { reduced: boolean; isBusy: () => boolean },
  ) {
    const a = area;
    scene.add.image(a.x, a.y, 'room_still').setOrigin(0, 0).setDisplaySize(a.width, a.height).setDepth(D.still).setName('room_still');
    if (opts.reduced) return; // reduced motion: the still only, no video, no storms
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    scene.game.events.on(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    this.load();
  }

  /** The videos download in the background after the kitchen is up; the still covers the wait. */
  private load(): void {
    const s = this.scene;
    const ok = (key: string): boolean => s.cache.video.exists(key);
    s.load.video(CALM, URLS[CALM], true);
    s.load.video(STORM, URLS[STORM], true);
    s.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => {
      if (f.key === CALM || f.key === STORM) console.warn(`Room video unavailable: ${f.key}`);
    });
    s.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.dead) return;
      if (ok(CALM)) this.startCalm();
      if (ok(STORM)) {
        this.stormReady = true;
        audio.preloadThunder();
        void fetch(URLS[STORM][0]).catch(() => undefined); // warm the browser cache so the first storm starts at once
      }
      this.scheduleStorm();
    });
    s.load.start();
  }

  private startCalm(): void {
    const a = this.area;
    const v = this.scene.add.video(a.x, a.y, CALM).setOrigin(0, 0).setDepth(D.calm).setName('room_calm');
    fitVideo(this.scene, v, this.area, () => this.dead);
    v.setMute(true);
    v.play(true);
    this.calm = v;
  }

  private scheduleStorm(): void {
    if (this.dead) return;
    this.timer?.remove();
    // ?storm in the address bar makes a storm come every 8 seconds, for testing the lightning and thunder.
    const test = new URLSearchParams(location.search).has('storm');
    const wait = test ? 8 : nextStormDelay(Math.random(), this.firstStorm);
    this.timer = this.scene.time.delayedCall(wait * 1000, () => this.tryStorm());
  }

  private tryStorm(): void {
    if (this.dead) return;
    const ok = stormAllowed({ ready: this.stormReady && !!this.calm, paused: this.opts.isBusy(), reduced: this.opts.reduced, hidden: this.hidden });
    if (!ok) {
      this.timer = this.scene.time.delayedCall(STORM_RETRY * 1000, () => this.tryStorm());
      return;
    }
    this.firstStorm = false;
    this.playStorm();
  }

  private playStorm(): void {
    const a = this.area;
    const v = this.scene.add.video(a.x, a.y, STORM).setOrigin(0, 0).setDepth(D.storm).setAlpha(0).setName('room_storm');
    fitVideo(this.scene, v, this.area, () => this.dead);
    v.setMute(true);
    this.storm = v;
    v.once(Phaser.GameObjects.Events.VIDEO_COMPLETE, () => this.endStorm());
    v.once(Phaser.GameObjects.Events.VIDEO_ERROR, () => this.endStorm());
    // The clip is fetched when it first plays, so the fade and the thunder are counted from the moment it really starts.
    let started = false;
    v.once(Phaser.GameObjects.Events.VIDEO_PLAY, () => {
      started = true;
      this.scene.tweens.add({ targets: v, alpha: 1, duration: STORM_FADE * 1000 });
      this.stormTimer = this.scene.time.delayedCall(THUNDER_OFFSET * 1000, () => audio.playThunder());
    });
    v.play(false);
    // If it never starts (slow network), drop this storm quietly and try later.
    this.scene.time.delayedCall(5000, () => {
      if (!started && this.storm === v) this.endStorm();
    });
  }

  private endStorm(): void {
    const v = this.storm;
    if (!v || this.dead) return;
    this.storm = undefined;
    this.scene.tweens.add({
      targets: v,
      alpha: 0,
      duration: STORM_FADE * 1000,
      onComplete: () => v.destroy(),
    });
    this.scheduleStorm();
  }

  private onHidden(): void {
    this.hidden = true;
    this.calm?.setPaused(true);
    this.storm?.setPaused(true);
  }

  private onVisible(): void {
    this.hidden = false;
    this.calm?.setPaused(false);
    this.storm?.setPaused(false);
  }

  destroy(): void {
    this.dead = true;
    this.timer?.remove();
    this.stormTimer?.remove();
    this.scene.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.scene.game.events.off(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    this.calm?.destroy();
    this.storm?.destroy();
    this.calm = undefined;
    this.storm = undefined;
  }
}
