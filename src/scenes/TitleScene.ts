import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const INTRO_URL = 'assets/intro/intro.mp4';
const ART = ['title_bg', 'title_logo', 'title_chef'] as const;

export interface TitleData {
  restaurantId: string;
}

/**
 * Title screen shown before every game: night diner, logo, chef with a ghost, "Tap to play".
 * The intro video starts by itself (muted if the browser refuses sound before a tap) as a DOM overlay
 * that can be skipped with a tap; any problem (load error, autoplay refusal, reduced motion) goes straight to the game.
 */
export class TitleScene extends Phaser.Scene {
  private d!: TitleData;
  private video: HTMLVideoElement | null = null;
  private starting = false;
  private introPlaying = false;

  constructor() {
    super('Title');
  }

  init(data: TitleData): void {
    this.d = data;
    this.starting = false;
    this.introPlaying = false;
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
    this.load.image('title_bg', 'assets/intro/title_bg.webp');
    this.load.image('title_logo', 'assets/intro/title_logo.webp');
    this.load.image('title_chef', 'assets/intro/title_chef.webp');
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (!ART.every((k) => this.textures.exists(k) && this.textures.get(k).key !== '__MISSING')) {
      this.begin(); // the art failed to load: never block the game on it
      return;
    }
    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    const reduce = SaveSystem.reduceMotion();

    // Slightly oversized and pushed past the bottom-right corner so the generator's corner watermark falls outside the frame.
    const bg = this.add.image(w + 60, h + 50, 'title_bg').setOrigin(1, 1);
    bg.setScale(Math.max(w / bg.width, h / bg.height) * 1.1);
    this.add.rectangle(w / 2, h / 2, w, h, 0x0a0714, 0.35);

    const logo = this.add.image(w / 2, 245, 'title_logo');
    logo.setScale(Math.min(640 / logo.width, 1));
    const chef = this.add.image(w - 190, h - 150, 'title_chef').setScale(0.6);
    const tap = this.add
      .text(w / 2, h - 70, 'Tap to play', { fontFamily: FONT, fontSize: '46px', fontStyle: '700', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 8 })
      .setOrigin(0.5);

    if (!reduce) {
      const base = logo.scale;
      logo.setScale(base * 0.2).setAlpha(0);
      this.tweens.add({ targets: logo, scale: base, alpha: 1, duration: 650, ease: 'Back.Out' });
      this.tweens.add({ targets: logo, y: 255, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 700 });
      this.tweens.add({ targets: chef, y: chef.y - 14, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: tap, scale: 1.08, alpha: 0.8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    this.prepareVideo(reduce);
    if (this.video) {
      this.startIntro(); // the intro starts by itself; a tap or key during it skips
    } else {
      this.input.once('pointerdown', this.onTap, this);
      this.input.keyboard?.once('keydown', this.onTap, this);
    }
  }

  /** Starts fetching the video while the player looks at the title; it stays hidden until the tap. */
  private prepareVideo(reduce: boolean): void {
    if (reduce || typeof document === 'undefined') return;
    try {
      const v = document.createElement('video');
      v.src = INTRO_URL;
      v.preload = 'auto';
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.muted = SaveSystem.data.settings.muted;
      Object.assign(v.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        background: '#000',
        zIndex: '5',
        display: 'none',
        opacity: '0',
        transition: 'opacity 400ms ease',
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(v);
      this.video = v;
    } catch {
      this.video = null;
    }
  }

  /** Only used when there is no video (reduced motion or setup failure): the title waits for a tap. */
  private onTap(): void {
    if (this.starting) return;
    audio.unlock();
    this.begin();
  }

  /**
   * Plays the intro at once. Browsers may refuse sound before the first tap, so a refused play() is retried muted
   * (muted autoplay is always allowed). Any error, or no playback within 5 s, goes straight to the game.
   */
  private startIntro(): void {
    const v = this.video;
    if (!v) return;
    this.introPlaying = true;
    const finish = (): void => this.begin();
    v.addEventListener('ended', finish, { once: true });
    v.addEventListener('error', finish, { once: true });
    // A tap or any key skips the intro.
    const skip = (): void => finish();
    v.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', skip));
    const watchdog = window.setTimeout(finish, 5000);
    v.addEventListener('playing', () => {
      window.clearTimeout(watchdog);
      v.style.display = 'block';
      void v.offsetHeight; // commit display before the fade
      v.style.opacity = '1';
    }, { once: true });
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(finish);
    });
  }

  /** Fades the video out (if any) and starts the game. */
  private begin(): void {
    if (this.starting) return;
    this.starting = true;
    const go = (): void => void this.scene.start('Game', { restaurantId: this.d.restaurantId });
    const v = this.video;
    if (v && this.introPlaying) {
      v.pause();
      v.style.opacity = '0';
      window.setTimeout(go, 400);
    } else {
      go();
    }
  }

  private cleanup(): void {
    const v = this.video;
    this.video = null;
    if (!v) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
  }
}
