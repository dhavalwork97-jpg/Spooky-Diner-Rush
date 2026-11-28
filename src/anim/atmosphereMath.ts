import { randRange, type Rng } from '../game/rng';

/**
 * Pure numbers for the night atmosphere (no Phaser), so they can be tested.
 * Positions are in source-image pixels (1699 x 948, see `views/layout.ts`); `Layout` maps them to the canvas.
 */

/**
 * The dusk grade is a vertical gradient (`GRADE_STOPS`, dark violet walls and windows at the top, cool blue floor,
 * nearly clear counters and machines at the bottom) so the cooking area stays bright and readable.
 * `NIGHT_GRADE` is the colour at the height of the oven, used to tint art drawn above the grade.
 */
export const NIGHT_GRADE = 0xf2f1ff;
/** Colour multiplied over the window glass: deep blue-purple night sky. */
export const NIGHT_SKY = 0xc4ccf0;
/** How far the grade sits in the depth order: above the background, decor and painted machines, below customers. */
export const GRADE_DEPTH = 249;
/** Gradient stops: fraction of the picture height and the multiply colour there. */
export const GRADE_STOPS: [number, string][] = [
  [0, '#9a9ed6'],
  [0.2, '#b0b6e2'],
  [0.3, '#c4ccef'],
  [0.42, '#dde2ff'],
  [0.55, '#f2f1ff'],
  [1, '#f6f4ff'],
];

export interface BoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The three window panes of the painted kitchen. */
export const WINDOW_PANES: BoxPx[] = [
  { x: 491, y: 185, w: 209, h: 103 },
  { x: 714, y: 185, w: 274, h: 103 },
  { x: 1000, y: 185, w: 247, h: 103 },
];
/** Sky pinpoints stay above the plants that stand in the windows. */
export const STAR_BOX: BoxPx = { x: 495, y: 190, w: 750, h: 70 };
export const MOON = { x: 1058, y: 228, r: 28 };
/** The two painted pendant lamps (where the light comes out under each shade), plus one extra lamp the code draws. */
export const LAMPS: { x: number; y: number; glow: number; drawn: boolean }[] = [
  { x: 562, y: 200, glow: 300, drawn: false },
  { x: 769, y: 181, glow: 280, drawn: false },
  { x: 1105, y: 191, glow: 300, drawn: false },
];
/** The strip of floor between the stools and the counters: fog never leaves it. */
export const FLOOR: BoxPx = { x: 340, y: 318, w: 1240, h: 56 };
/** The room above the counters, where wisps and motes drift (kept off the customers' order bubbles by depth, not position). */
export const AIR: BoxPx = { x: 330, y: 120, w: 1260, h: 250 };

export interface AtmosphereQuality {
  pinpoints: number;
  motes: number;
  maxFog: number;
  maxWisps: number;
}
export const QUALITY_DESKTOP: AtmosphereQuality = { pinpoints: 30, motes: 10, maxFog: 3, maxWisps: 2 };
export const QUALITY_MOBILE: AtmosphereQuality = { pinpoints: 18, motes: 6, maxFog: 2, maxWisps: 1 };

/** Fog patch picture height / width: low and wide, so it hugs the floor. */
export const FOG_ASPECT = 0.5;

/** Seconds to wait before the next fog patch / wisp (randomised so nothing looks scheduled). */
export const FOG_GAP: [number, number] = [5, 11];
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

/**
 * Haunted Lights event: the pendant lamps flicker hard. A quick jitter (0.72 to 1) plus now and then a deep dip (down to about 0.4).
 * Never fully dark (so the room and the order bubbles stay readable) and never above 1 (no flash). Deterministic in `t`.
 */
export const HAUNTED_LAMP_MIN = 0.35;
export function hauntedLampIntensity(t: number, phase: number): number {
  const jitter = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 9 + phase * 4) * Math.sin(t * 5.3 + phase));
  const s = Math.sin(t * 1.7 + phase * 3.3);
  const dip = s > 0.82 ? ((s - 0.82) / 0.18) * 0.35 : 0;
  return Math.min(1, Math.max(HAUNTED_LAMP_MIN, jitter - dip));
}

/** Move `current` toward `target` by at most `rate * dt` (the fade of an event look in and out). */
export const approach = (current: number, target: number, rate: number, dt: number): number =>
  current < target ? Math.min(target, current + rate * dt) : Math.max(target, current - rate * dt);

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
  const width = randRange(rng, 190, 310);
  const x = randRange(rng, FLOOR.x + width / 2, FLOOR.x + FLOOR.w - width / 2);
  const y = randRange(rng, FLOOR.y + 10, FLOOR.y + FLOOR.h - 6);
  const dir = rng() < 0.5 ? -1 : 1;
  return {
    x,
    y,
    width,
    drift: dir * randRange(rng, 40, 90),
    peakAlpha: randRange(rng, 0.42, 0.66),
    life: randRange(rng, 9, 15),
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
