/**
 * Procedural motion for the eight supplied customer PNGs. Pure maths, no Phaser, so it is unit tested.
 *
 * The art is a single static pose, so there is no real face or limb animation here. Motion is limited
 * to small whole-body transforms around the feet: a squash-and-stretch breath (about 1 percent), a few
 * pixels of vertical bounce, tiny tilts and sideways steps. Nothing rotates more than a few degrees.
 * Everything is presentation only: it reads customer state and never changes it.
 */

/** Order matters: it is the index the model stores in `Customer.look`. */
export const CUSTOMER_LOOKS = ['kid', 'grandma', 'businessman', 'foodie', 'teen', 'chef_fan', 'athlete', 'sleepy'] as const;
export type CustomerLook = (typeof CUSTOMER_LOOKS)[number];

export function lookIndex(look: number): number {
  const n = CUSTOMER_LOOKS.length;
  return ((Math.floor(look) % n) + n) % n;
}
export const lookKey = (look: number): CustomerLook => CUSTOMER_LOOKS[lookIndex(look)];

/**
 * All customer art is one sprite sheet (`customers`, 160 x 384 cells, built by tools/make_customer_art.py):
 * one texture means one draw batch however many customers are on screen.
 * Frames 0-7 are the characters in CUSTOMER_LOOKS order; then the contact shadow and the heart.
 */
export const CUSTOMER_SHEET = 'customers';
export const CELL_W = 160;
export const CELL_H = 384;
export const SHADOW_FRAME = CUSTOMER_LOOKS.length;
export const HEART_FRAME = CUSTOMER_LOOKS.length + 1;
/** Width of each figure inside its cell, in sheet pixels (same order as CUSTOMER_LOOKS). Used for shadow size. */
export const FIGURE_W = [138, 142, 132, 122, 122, 151, 152, 131] as const;
/** Width of the ellipse drawn in the shadow frame, in sheet pixels. */
export const SHADOW_ART_W = 132;

export interface Personality {
  /** Breathing: period in ms and height change as a fraction (0.012 = 1.2 percent). */
  breathMs: number;
  breath: number;
  /** Tilt while idle, degrees, slow. */
  sway: number;
  /** Walking in or out: ms per step, bounce in px. */
  stepMs: number;
  stepBounce: number;
  /** Waiting-too-long reaction (foot tap): period ms, lift px. */
  tapMs: number;
  tapLift: number;
  /** Happy bounce after food arrives: lift px, duration ms. */
  hop: number;
  hopMs: number;
  /** Eating: chew period ms, bob px. */
  eatMs: number;
  eat: number;
  /** Sleepy droop: slow forward nod in degrees, 0 for none. */
  nod: number;
  /** Wristwatch check: time between checks in ms, 0 for none. */
  watchEveryMs: [number, number] | null;
  /** Satisfaction effect: hearts released, and sparkle dots. */
  hearts: number;
  sparkles: number;
  /** Where the wristwatch glint sits, as a fraction of the sprite (x from left, y from top). */
  watchAt?: { x: number; y: number };
}

export const PERSONALITIES: Record<CustomerLook, Personality> = {
  // Little Kid: quick, bouncy, can hardly stand still.
  kid: { breathMs: 1500, breath: 0.016, sway: 1.2, stepMs: 150, stepBounce: 6, tapMs: 300, tapLift: 5, hop: 15, hopMs: 340, eatMs: 260, eat: 3, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 5 },
  // Grandma: slow and gentle everywhere.
  grandma: { breathMs: 3400, breath: 0.01, sway: 0.5, stepMs: 300, stepBounce: 2, tapMs: 900, tapLift: 1.5, hop: 6, hopMs: 520, eatMs: 700, eat: 1.5, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 2 },
  // Businessman: composed, checks his watch now and then.
  businessman: { breathMs: 2700, breath: 0.01, sway: 0.4, stepMs: 210, stepBounce: 3, tapMs: 520, tapLift: 3, hop: 8, hopMs: 400, eatMs: 520, eat: 2, nod: 0, watchEveryMs: [4500, 8000], hearts: 2, sparkles: 3, watchAt: { x: 0.64, y: 0.44 } },
  // Foodie Girl: excited when the food lands.
  foodie: { breathMs: 2000, breath: 0.014, sway: 0.9, stepMs: 190, stepBounce: 4, tapMs: 420, tapLift: 4, hop: 17, hopMs: 360, eatMs: 340, eat: 3.5, nod: 0, watchEveryMs: null, hearts: 5, sparkles: 6 },
  // Cool Teen: relaxed, long slow idle.
  teen: { breathMs: 3200, breath: 0.01, sway: 1.4, stepMs: 260, stepBounce: 2.5, tapMs: 700, tapLift: 2, hop: 7, hopMs: 460, eatMs: 600, eat: 2, nod: 0, watchEveryMs: null, hearts: 2, sparkles: 3 },
  // Chef Fan: enthusiastic about the food.
  chef_fan: { breathMs: 1900, breath: 0.014, sway: 0.8, stepMs: 190, stepBounce: 4, tapMs: 400, tapLift: 4, hop: 16, hopMs: 360, eatMs: 320, eat: 3.5, nod: 0, watchEveryMs: null, hearts: 5, sparkles: 6 },
  // Athlete: energetic, always a little on the move.
  athlete: { breathMs: 1400, breath: 0.016, sway: 1, stepMs: 140, stepBounce: 5.5, tapMs: 280, tapLift: 5, hop: 13, hopMs: 320, eatMs: 280, eat: 3, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 5 },
  // Sleepy: very slow, droops, sighs.
  sleepy: { breathMs: 4600, breath: 0.014, sway: 0.4, stepMs: 380, stepBounce: 1.5, tapMs: 1100, tapLift: 1.5, hop: 4, hopMs: 620, eatMs: 900, eat: 1.5, nod: 2.2, watchEveryMs: null, hearts: 2, sparkles: 2 },
};

/** One frame of transform. dx/dy are px (negative dy is up); sx/sy multiply the base scale; angle is degrees. */
export interface Pose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  angle: number;
}
export const REST: Pose = { dx: 0, dy: 0, sx: 1, sy: 1, angle: 0 };

export function addPose(a: Pose, b: Pose): Pose {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy, sx: a.sx * b.sx, sy: a.sy * b.sy, angle: a.angle + b.angle };
}

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const easeOut = (k: number): number => 1 - (1 - clamp01(k)) ** 2;
export const easeIn = (k: number): number => clamp01(k) ** 2;

export type Phase = 'calm' | 'worried' | 'angry';

/** Phase from the patience fraction (matches the existing mood thresholds in CustomerView). */
export function phaseFor(frac: number): Phase {
  return frac < 0.25 ? 'angry' : frac < 0.5 ? 'worried' : 'calm';
}

/** Idle breathing plus a slow sway. Feet stay planted because the sprite is scaled about its feet. */
export function idlePose(p: Personality, t: number, seed: number): Pose {
  const b = Math.sin((t / p.breathMs) * TAU + seed);
  const sway = Math.sin((t / (p.breathMs * 2.3)) * TAU + seed * 1.7) * p.sway * 0.5;
  // A sleepy customer droops: the nod rides the slow breath.
  const nod = p.nod ? (Math.sin((t / (p.breathMs * 1.6)) * TAU + seed) * 0.5 + 0.5) * p.nod : 0;
  return { dx: 0, dy: 0, sx: 1 - b * p.breath * 0.35, sy: 1 + b * p.breath, angle: sway + nod };
}

/** Waiting a long time: a foot-tap rhythm (a tiny repeated lift). Angry is a little faster. */
export function impatiencePose(p: Personality, phase: Phase, t: number, seed: number): Pose {
  if (phase === 'calm') return REST;
  const period = phase === 'angry' ? p.tapMs * 0.7 : p.tapMs;
  const s = Math.sin((t / period) * TAU + seed);
  // Only the up half of the wave: it reads as a tap, never as sinking into the floor.
  const lift = Math.max(0, s) ** 2 * p.tapLift;
  return { dx: 0, dy: -lift, sx: 1, sy: 1, angle: Math.sin((t / (period * 2)) * TAU) * 0.6 };
}

/** Happy bounce when food arrives. k runs 0..1. Two decaying hops with a small squash on landing. */
export function hopPose(p: Personality, k: number): Pose {
  const x = clamp01(k);
  const hop = Math.abs(Math.sin(x * Math.PI * 2)) * (1 - x * 0.45);
  // a hair of squash while on the ground between hops
  const squash = hop < 0.12 ? 0.012 : 0;
  return { dx: 0, dy: -hop * p.hop, sx: 1 + squash, sy: 1 - squash, angle: 0 };
}

/** Eating: gentle repeated small movement. */
export function eatPose(p: Personality, t: number, seed: number): Pose {
  const s = Math.sin((t / p.eatMs) * TAU + seed);
  return { dx: 0, dy: -Math.max(0, s) * p.eat, sx: 1, sy: 1 + s * 0.006, angle: s * 0.5 };
}

/** Wristwatch check: lean in and tilt, hold, return. k runs 0..1. */
export function watchPose(k: number): Pose {
  const x = clamp01(k);
  const env = x < 0.2 ? easeOut(x / 0.2) : x > 0.8 ? 1 - easeIn((x - 0.8) / 0.2) : 1;
  return { dx: 2 * env, dy: 0, sx: 1, sy: 1 - 0.012 * env, angle: 2.6 * env };
}
export const WATCH_MS = 1300;

/** Walking: small steps with bounce while sliding sideways. dir is -1 or 1 (side the customer comes from or goes to). */
export function walkPose(p: Personality, k: number, mode: 'in' | 'out', dir: number, distance = 60): { pose: Pose; alpha: number } {
  const x = clamp01(k);
  const total = mode === 'in' ? 520 : 600;
  const steps = Math.max(1, Math.round(total / p.stepMs / 2));
  const bounce = Math.abs(Math.sin(x * Math.PI * steps)) * p.stepBounce;
  const slide = mode === 'in' ? (1 - easeOut(x)) * distance * dir : easeIn(x) * distance * dir;
  const alpha = mode === 'in' ? clamp01(x * 3) : 1 - clamp01((x - 0.35) / 0.65);
  return { pose: { dx: slide, dy: -bounce, sx: 1, sy: 1, angle: dir * (mode === 'in' ? -1 : 1) * Math.sin(x * Math.PI * steps) * 0.8 }, alpha };
}
export const WALK_IN_MS = 520;
export const WALK_OUT_MS = 600;

/** Time until the next wristwatch check, for personalities that have one. */
export function nextWatchDelay(p: Personality, roll: number): number {
  if (!p.watchEveryMs) return Infinity;
  const [lo, hi] = p.watchEveryMs;
  return lo + (hi - lo) * clamp01(roll);
}

/** A stable per-customer phase offset so neighbours never breathe in step. */
export function seedFor(id: number): number {
  return ((id * 2654435761) % 1000) / 1000 * TAU;
}
