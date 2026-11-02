import { randRange, type Rng } from '../game/rng';

/**
 * Pure numbers for the night atmosphere (no Phaser), so they can be tested.
 * Positions are in source-image pixels (1699 x 948, see `views/layout.ts`); `Layout` maps them to the canvas.
 */

/** Colour multiplied over the static kitchen art: dusk blue-violet. Also used to tint art drawn above the grade. */
export const NIGHT_GRADE = 0x9298d2;
/** Colour multiplied over the window glass: deep blue-purple night sky. */
export const NIGHT_SKY = 0x3c40a0;
/** How far the grade sits in the depth order: above the background, decor and painted machines, below customers. */
export const GRADE_DEPTH = 255;

export interface BoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The three window panes of the painted kitchen. */
export const WINDOW_PANES: BoxPx[] = [
  { x: 391, y: 44, w: 267, h: 133 },
  { x: 680, y: 44, w: 344, h: 133 },
  { x: 1047, y: 44, w: 311, h: 133 },
];
/** Sky pinpoints stay above the plants that stand in the windows. */
export const STAR_BOX: BoxPx = { x: 400, y: 52, w: 950, h: 62 };
export const MOON = { x: 930, y: 98, r: 23 };
/** The two painted pendant lamps (where the light comes out under each shade), plus one extra lamp the code draws. */
export const LAMPS: { x: number; y: number; glow: number; drawn: boolean }[] = [
  { x: 483, y: 70, glow: 300, drawn: false },
  { x: 841, y: 58, glow: 280, drawn: true },
  { x: 1179, y: 70, glow: 300, drawn: false },
];
/** The strip of floor between the stools and the counters: fog never leaves it. */
export const FLOOR: BoxPx = { x: 340, y: 322, w: 1240, h: 44 };
/** The room above the counters, where wisps and motes drift (kept off the customers' order bubbles by depth, not position). */
export const AIR: BoxPx = { x: 330, y: 120, w: 1260, h: 250 };

export interface AtmosphereQuality {
  pinpoints: number;
  motes: number;
  maxFog: number;
  maxWisps: number;
}
export const QUALITY_DESKTOP: AtmosphereQuality = { pinpoints: 30, motes: 10, maxFog: 2, maxWisps: 2 };
export const QUALITY_MOBILE: AtmosphereQuality = { pinpoints: 18, motes: 6, maxFog: 2, maxWisps: 1 };

/** Fog patch picture height / width: low and wide, so it hugs the floor. */
export const FOG_ASPECT = 0.38;

/** Seconds to wait before the next fog patch / wisp (randomised so nothing looks scheduled). */
export const FOG_GAP: [number, number] = [8, 18];
export const WISP_GAP: [number, number] = [14, 30];

export function nextDelay(rng: Rng, range: [number, number]): number {
  return randRange(rng, range[0], range[1]);
}

/**
 * Lamp brightness factor, about 1: two slow sines (a few percent) and a rare soft dip (up to 6 percent).
 * Smooth in `t`, never a flash.
 */
export function lampIntensity(t: number, phase: number): number {
  const breathe = 0.025 * Math.sin(t * 1.1 + phase) + 0.015 * Math.sin(t * 2.7 + phase * 2.3);
  const s = Math.sin(t * 0.23 + phase * 3.1);
  const dip = s > 0 ? Math.pow(s, 30) * 0.06 : 0;
  return 1 + breathe - dip;
}

/** Twinkle alpha of a sky pinpoint between `lo` and `hi`. */
export function twinkle(t: number, phase: number, lo = 0.25, hi = 0.9): number {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * (0.8 + (phase % 1)) + phase * 6));
}

export interface FogSpec {
  x: number;
  y: number;
  width: number;
  drift: number;
  peakAlpha: number;
  life: number;
  variant: number;
}

/** One small floor patch: low, wide, translucent, drifting slowly sideways. Always inside `FLOOR`. */
export function fogSpec(rng: Rng): FogSpec {
  const width = randRange(rng, 150, 250);
  const x = randRange(rng, FLOOR.x + width / 2, FLOOR.x + FLOOR.w - width / 2);
  const y = randRange(rng, FLOOR.y + 10, FLOOR.y + FLOOR.h - 6);
  const dir = rng() < 0.5 ? -1 : 1;
  return {
    x,
    y,
    width,
    drift: dir * randRange(rng, 40, 90),
    peakAlpha: randRange(rng, 0.17, 0.28),
    life: randRange(rng, 10, 16),
    variant: Math.floor(rng() * 3),
  };
}

export interface WispSpec {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  peakAlpha: number;
  size: number;
}

/** A small ghostly wisp crossing the room, 7 to 11 seconds, never bright. */
export function wispSpec(rng: Rng): WispSpec {
  const dir = rng() < 0.5 ? -1 : 1;
  const span = randRange(rng, 220, 420);
  const x0 = randRange(rng, AIR.x + (dir > 0 ? 0 : span), AIR.x + AIR.w - (dir > 0 ? span : 0));
  return {
    x: x0,
    y: randRange(rng, AIR.y, AIR.y + AIR.h * 0.75),
    dx: dir * span,
    dy: randRange(rng, -40, 30),
    life: randRange(rng, 7, 11),
    peakAlpha: randRange(rng, 0.28, 0.45),
    size: randRange(rng, 38, 60),
  };
}

export interface MoteSpec {
  x: number;
  y: number;
  rise: number;
  sway: number;
  life: number;
  peakAlpha: number;
  size: number;
  color: number;
}
const MOTE_COLORS = [0x6fe6f0, 0x7aa8ff, 0xb48cff];

/** A tiny glowing dot (cyan, blue or purple) that floats up slowly and fades. */
export function moteSpec(rng: Rng): MoteSpec {
  return {
    x: randRange(rng, AIR.x, AIR.x + AIR.w),
    y: randRange(rng, AIR.y + 40, AIR.y + AIR.h),
    rise: randRange(rng, 25, 70),
    sway: randRange(rng, -25, 25),
    life: randRange(rng, 7, 13),
    peakAlpha: randRange(rng, 0.35, 0.65),
    size: randRange(rng, 5, 9),
    color: MOTE_COLORS[Math.floor(rng() * MOTE_COLORS.length)],
  };
}

/**
 * Fade in over the first `inFrac` of a life, hold, fade out over the last `outFrac`; smooth, 0 at both ends.
 * `p` is progress 0..1. Used for every fog patch, wisp and mote so nothing pops in or out.
 */
export function envelope(p: number, inFrac = 0.35, outFrac = 0.4): number {
  const x = Math.min(Math.max(p, 0), 1);
  const a = Math.min(1, x / inFrac);
  const b = Math.min(1, (1 - x) / outFrac);
  const m = Math.min(a, b);
  return m * m * (3 - 2 * m);
}
