import Phaser from 'phaser';
import type { GameConfig } from '../game/config';

/**
 * Code-drawn art in the style guide: flat cartoon, bold dark outline, warm palette.
 * Every texture is built once, cached by key, and drawn at 2x (display scale 0.5).
 * If a supplied file with the same key is already loaded, the builder skips it.
 */
export const INK = 0x2b1b17;
export const CREAM = 0xfff4dc;
export const ORANGE = 0xf28c28;
export const TOMATO = 0xd9382b;
export const MUSTARD = 0xf6c445;
export const LEAF = 0x4caf50;
export const NAVY = 0x1f2a44;
const OUT = 4; // outline width at 2x texture size

export const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
export const EXPRESSIONS = ['neutral', 'happy', 'impatient', 'angry'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

const line = (g: Phaser.GameObjects.Graphics) => g.lineStyle(OUT, INK, 1);

export function buildAllTextures(scene: Phaser.Scene, cfg: GameConfig): void {
  buildFood(scene);
  buildUi(scene);
  buildDecor(scene, cfg);
}

/** Texture key for a decor item. */
export const decorKey = (id: string): string => `decor_${id}`;

/** Decor is drawn at its source-pixel size (see data/decor.json). Unknown ids get a plain panel. */
function buildDecor(scene: Phaser.Scene, cfg: GameConfig): void {
  for (const d of cfg.decor.items) {
    if (d.art) continue; // supplied art (lazy-loaded), nothing to draw here
    const w = Math.round(d.width);
    const h = Math.round(d.height);
    make(scene, decorKey(d.id), w, h, (g) => {
      if (d.id === 'clock') {
        const r = Math.min(w, h) / 2 - 4;
        g.fillStyle(0x000000, 0.2).fillCircle(w / 2 + 2, h / 2 + 4, r);
        g.fillStyle(CREAM, 1).fillCircle(w / 2, h / 2, r);
        g.lineStyle(5, INK, 1).strokeCircle(w / 2, h / 2, r);
        g.lineStyle(4, ORANGE, 1).strokeCircle(w / 2, h / 2, r - 5);
        g.lineStyle(3, INK, 1);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.lineBetween(w / 2 + Math.cos(a) * (r - 11), h / 2 + Math.sin(a) * (r - 11), w / 2 + Math.cos(a) * (r - 6), h / 2 + Math.sin(a) * (r - 6));
        }
        g.lineStyle(5, INK, 1).lineBetween(w / 2, h / 2, w / 2, h / 2 - r * 0.55);
        g.lineStyle(4, TOMATO, 1).lineBetween(w / 2, h / 2, w / 2 + r * 0.45, h / 2 + r * 0.1);
        g.fillStyle(INK, 1).fillCircle(w / 2, h / 2, 4);
      } else if (d.id === 'bunting') {
        const colors = [TOMATO, MUSTARD, LEAF, ORANGE, 0x2ba6a0];
        const flags = Math.floor(w / 62);
        const step = w / flags;
        // string sags in the middle
        const sag = (x: number) => 6 + Math.sin((x / w) * Math.PI) * 6;
        g.lineStyle(3, INK, 1);
        for (let x = 0; x < w - 4; x += 4) g.lineBetween(x, sag(x), x + 4, sag(x + 4));
        for (let i = 0; i < flags; i++) {
          const cx = step * (i + 0.5);
          const top = sag(cx);
          g.fillStyle(colors[i % colors.length], 1).fillTriangle(cx - 22, top, cx + 22, top, cx, top + 28);
          g.lineStyle(3, INK, 1).strokeTriangle(cx - 22, top, cx + 22, top, cx, top + 28);
        }
      } else if (d.id === 'runner') {
        g.fillStyle(0x000000, 0.18).fillRoundedRect(2, 5, w - 4, h - 6, 10);
        g.fillStyle(TOMATO, 1).fillRoundedRect(0, 0, w - 4, h - 8, 10);
        g.lineStyle(4, INK, 1).strokeRoundedRect(0, 0, w - 4, h - 8, 10);
        g.lineStyle(3, MUSTARD, 1).strokeRoundedRect(8, 7, w - 20, h - 22, 6);
        g.fillStyle(MUSTARD, 1);
        for (let x = 40; x < w - 40; x += 60) g.fillRect(x, h / 2 - 6, 10, 6);
      } else {
        g.fillStyle(CREAM, 1).fillRoundedRect(0, 0, w, h, 8);
        g.lineStyle(4, INK, 1).strokeRoundedRect(0, 0, w, h, 8);
      }
    });
  }
}

function buildFood(scene: Phaser.Scene): void {
  make(scene, 'plate', 200, 124, (g) => {
    g.fillStyle(0x000000, 0.18).fillEllipse(100, 70, 188, 96);
    g.fillStyle(0xffffff, 1).fillEllipse(100, 60, 188, 96);
    line(g).strokeEllipse(100, 60, 188, 96);
    g.fillStyle(0xe7e2d6, 1).fillEllipse(100, 62, 126, 58);
  });

  const fries = (key: string, color: number, spots: boolean) =>
    make(scene, key, 144, 144, (g) => {
      // sticks
      g.fillStyle(color, 1);
      line(g);
      for (let i = 0; i < 6; i++) {
        const x = 28 + i * 17;
        const top = 14 + (i % 2) * 10;
        g.fillRoundedRect(x, top, 15, 70, 4).strokeRoundedRect(x, top, 15, 70, 4);
      }
      if (spots) {
        g.fillStyle(0x000000, 0.85);
        [[40, 40], [70, 28], [96, 52], [58, 62], [110, 36]].forEach(([x, y]) => g.fillCircle(x, y, 5));
      }
      // carton
      g.fillStyle(TOMATO, 1).fillRoundedRect(24, 76, 96, 58, 8);
      line(g).strokeRoundedRect(24, 76, 96, 58, 8);
      g.fillStyle(CREAM, 1).fillRoundedRect(46, 92, 52, 22, 6);
    });
  fries('fries_raw', 0xf3e2a8, false);
  fries('fries_cooked', 0xf6c445, false);
  fries('fries_burnt', 0x4a3320, true);

  // Drink: a lidded cup with a straw. Code-drawn (the supplied cup art is loaded lazily and not used yet).
  make(scene, 'drink_cooked', 144, 144, (g) => {
    g.lineStyle(OUT, INK, 1);
    g.lineStyle(7, INK, 1).lineBetween(84, 6, 92, 44);
    g.lineStyle(4, TOMATO, 1).lineBetween(84, 6, 92, 44);
    g.fillStyle(CREAM, 1).fillRoundedRect(30, 38, 84, 12, 5);
    line(g).strokeRoundedRect(30, 38, 84, 12, 5);
    g.fillStyle(0x6b3b1f, 1).fillTriangle(36, 50, 108, 50, 98, 134).fillTriangle(36, 50, 98, 134, 46, 134);
    g.fillStyle(CREAM, 1).fillRect(38, 50, 68, 12);
    line(g);
    g.lineBetween(36, 50, 46, 134).lineBetween(108, 50, 98, 134).lineBetween(46, 134, 98, 134);
    g.fillStyle(TOMATO, 1).fillRoundedRect(52, 82, 40, 26, 6);
    line(g).strokeRoundedRect(52, 82, 40, 26, 6);
  });

  // Ice cream: a waffle cone with two scoops.
  make(scene, 'icecream_cooked', 144, 144, (g) => {
    g.fillStyle(0xe6b563, 1).fillTriangle(40, 70, 104, 70, 72, 138);
    line(g).strokeTriangle(40, 70, 104, 70, 72, 138);
    g.lineStyle(3, 0xa8741f, 1);
    g.lineBetween(50, 78, 82, 118);
    g.lineBetween(94, 78, 62, 118);
    g.fillStyle(0xf7b6c8, 1).fillCircle(72, 56, 30);
    line(g).strokeCircle(72, 56, 30);
    g.fillStyle(CREAM, 1).fillCircle(72, 28, 22);
    line(g).strokeCircle(72, 28, 22);
    g.fillStyle(TOMATO, 1).fillCircle(72, 8, 7);
    line(g).strokeCircle(72, 8, 7);
  });

  const patty = (key: string, fill: number, spots: boolean, rawLook = false) =>
    make(scene, key, 160, 76, (g) => {
      g.fillStyle(fill, 1).fillRoundedRect(10, 12, 140, 52, 22);
      line(g).strokeRoundedRect(10, 12, 140, 52, 22);
      g.fillStyle(0xffffff, 0.22).fillRoundedRect(24, 18, 62, 10, 5);
      if (rawLook) g.fillStyle(0xe58a8a, 0.8).fillCircle(60, 40, 8).fillCircle(100, 36, 7);
      if (spots) g.fillStyle(0x000000, 0.9).fillCircle(48, 40, 6).fillCircle(90, 34, 6).fillCircle(120, 42, 5);
    });
  patty('patty_raw', 0xd77a7a, false, true);
  patty('patty_cooked', 0x7a3e22, false);
  patty('patty_burnt', 0x2e1d14, true);

  make(scene, 'bun_bottom', 160, 56, (g) => {
    g.fillStyle(0xd9923b, 1).fillRoundedRect(10, 8, 140, 40, { tl: 6, tr: 6, bl: 20, br: 20 });
    line(g).strokeRoundedRect(10, 8, 140, 40, { tl: 6, tr: 6, bl: 20, br: 20 });
  });
  make(scene, 'bun_top', 160, 80, (g) => {
    g.fillStyle(0xd9923b, 1).fillRoundedRect(10, 8, 140, 64, { tl: 60, tr: 60, bl: 12, br: 12 });
    line(g).strokeRoundedRect(10, 8, 140, 64, { tl: 60, tr: 60, bl: 12, br: 12 });
    g.fillStyle(CREAM, 1).fillEllipse(52, 30, 12, 7).fillEllipse(84, 22, 12, 7).fillEllipse(112, 32, 12, 7);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(30, 14, 50, 8, 4);
  });
}

function buildUi(scene: Phaser.Scene): void {
  make(scene, 'coin', 48, 48, (g) => {
    g.fillStyle(MUSTARD, 1).fillCircle(24, 24, 20);
    line(g).strokeCircle(24, 24, 20);
    g.lineStyle(3, 0xc99a1f, 1).strokeCircle(24, 24, 12);
  });
  make(scene, 'card', 176, 240, (g) => {
    g.fillStyle(0x000000, 0.18).fillRoundedRect(8, 12, 160, 220, 24);
    g.fillStyle(CREAM, 1).fillRoundedRect(4, 4, 160, 220, 24);
    line(g).strokeRoundedRect(4, 4, 160, 220, 24);
  });
  make(scene, 'icon_fries', 64, 64, (g) => {
    g.fillStyle(MUSTARD, 1);
    line(g);
    [14, 26, 38].forEach((x, i) => g.fillRoundedRect(x, 6 + (i % 2) * 5, 11, 30, 3).strokeRoundedRect(x, 6 + (i % 2) * 5, 11, 30, 3));
    g.fillStyle(TOMATO, 1).fillRoundedRect(10, 30, 44, 28, 6);
    line(g).strokeRoundedRect(10, 30, 44, 28, 6);
  });
  make(scene, 'icon_burger', 64, 64, (g) => {
    g.fillStyle(0xd9923b, 1).fillRoundedRect(8, 8, 48, 24, { tl: 22, tr: 22, bl: 4, br: 4 });
    line(g).strokeRoundedRect(8, 8, 48, 24, { tl: 22, tr: 22, bl: 4, br: 4 });
    g.fillStyle(0x7a3e22, 1).fillRoundedRect(8, 32, 48, 10, 4);
    line(g).strokeRoundedRect(8, 32, 48, 10, 4);
    g.fillStyle(0xd9923b, 1).fillRoundedRect(8, 42, 48, 14, { tl: 2, tr: 2, bl: 10, br: 10 });
    line(g).strokeRoundedRect(8, 42, 48, 14, { tl: 2, tr: 2, bl: 10, br: 10 });
  });
  make(scene, 'hand', 96, 120, (g) => {
    g.fillStyle(0xffffff, 1);
    line(g);
    g.fillRoundedRect(30, 6, 24, 70, 12).strokeRoundedRect(30, 6, 24, 70, 12);
    g.fillRoundedRect(20, 52, 56, 52, 18).strokeRoundedRect(20, 52, 56, 52, 18);
    g.fillRoundedRect(52, 48, 22, 30, 10).strokeRoundedRect(52, 48, 22, 30, 10);
    g.fillRoundedRect(20, 52, 56, 52, 18);
  });
  make(scene, 'ring_dot', 8, 8, (g) => g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4));
}

