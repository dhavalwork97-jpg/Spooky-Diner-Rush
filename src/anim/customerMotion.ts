/**
 * Procedural motion for the eight supplied customer PNGs. Pure maths, no Phaser, so it is unit tested.
 *
 * The art is a single static pose, so there is no real face or limb animation here. Motion is limited
 * to small whole-body transforms around the feet: a squash-and-stretch breath (about 1 percent), a few
 * pixels of vertical bounce, tiny tilts and sideways steps. Nothing rotates more than a few degrees.
 * Everything is presentation only: it reads customer state and never changes it.
 */

/** Order matters: it is the index the model stores in `Customer.look`. */
export const CUSTOMER_LOOKS = [
  'kid', 'grandma', 'businessman', 'foodie', 'teen', 'chef_fan', 'athlete', 'sleepy',
  // ghosts (index 8 on). To add one: add it here, in PERSONALITIES, FIGURE_W, LOOK_ART, data/assets.json (lazy) and LOOK_UNLOCK_LEVELS, and raise CUSTOMER_LOOK_COUNT.
  'mint_ghost', 'lilac_ghost',
] as const;
export type CustomerLook = (typeof CUSTOMER_LOOKS)[number];

export function lookIndex(look: number): number {
  const n = CUSTOMER_LOOKS.length;
  return ((Math.floor(look) % n) + n) % n;
}
export const lookKey = (look: number): CustomerLook => CUSTOMER_LOOKS[lookIndex(look)];

/**
 * All customer art is one sprite sheet (`customers`, 192 x 384 cells, built by tools/make_customer_art.py):
 * one texture means one draw batch however many customers are on screen.
 * Frames 0-8 are the people then the ghosts, in CUSTOMER_LOOKS order (the people and the animated mint ghost are blank cells
 * there: the people no longer spawn, and the mint ghost is drawn from its own animation sheets, see LOOK_ART); then the
 * contact shadow and the heart.
 */
export const CUSTOMER_SHEET = 'customers';
export const CELL_W = 192;
export const CELL_H = 384;
/**
 * Cells in the shared sheet that belong to looks: the 8 people and the mint ghost (blank cells). The ghost added after the sheet was built
 * (lilac_ghost) has no cell: it is drawn only from its own animation sheets, so the shadow and heart stay where they are.
 */
export const SHEET_LOOK_CELLS = 9;
export const SHADOW_FRAME = SHEET_LOOK_CELLS;
export const HEART_FRAME = SHEET_LOOK_CELLS + 1;
/** Width of each figure inside its cell, in sheet pixels (same order as CUSTOMER_LOOKS). Used for shadow size. */
export const FIGURE_W = [138, 142, 132, 122, 122, 151, 152, 131, 0, 94] as const;

/**
 * Customers drawn from their own animation sheets instead of a still frame of the shared `customers` sheet.
 * Clips (supplied, converted to 75 percent size by tools/make_mint_ghost_art.py; each has an .anim.json with the measured sizes):
 *   calm = happy idle (patient or happy), upset = impatient (under half patience), angry = angry loop (under a quarter),
 *   leaveHappy / leaveAngry = one-shot reactions played in place when the customer leaves.
 * bodyH / bodyW are the solid body in a calm frame, footY is where the body base sits as a fraction of the frame,
 * and `scale` makes every clip's body the same size as the calm clip's (the happy leave clip has bigger frames).
 */
export interface LookClip {
  key: string;
  file: string;
  frames: number;
  /** Frame size in px (square). */
  size: number;
  fps: number;
  loop: boolean;
  footY: number;
  scale: number;
  /** Not needed until a customer leaves, so it is loaded on demand (like the scare sheets). */
  lazy: boolean;
}
export interface LookArt {
  calm: LookClip;
  upset: LookClip;
  angry: LookClip;
  leaveHappy: LookClip;
  leaveAngry: LookClip;
  /** Solid body height and width in a calm frame, in sheet px. */
  bodyH: number;
  bodyW: number;
}
export type LookClipName = 'calm' | 'upset' | 'angry';
/** Which looping clip to show: patience under half is upset, a customer who is angry (patience under a quarter, or gone) is angry. */
export function clipFor(mood: 'normal' | 'worried' | 'angry' | 'happy'): LookClipName {
  return mood === 'angry' ? 'angry' : mood === 'worried' ? 'upset' : 'calm';
}
/** The leave clips are about 5 s at their supplied 24 fps; they are played faster so the seat is free for the next arrival. */
export const LEAVE_FPS = 40;
/** Fade-out at the end of a leave clip (ms). */
export const LEAVE_FADE_MS = 350;
export const LOOK_ART: Partial<Record<CustomerLook, LookArt>> = {
  mint_ghost: {
    calm: { key: 'mint_ghost_happy', file: 'assets/customers/mint_ghost/ghost_idle_happy.webp', frames: 90, size: 192, fps: 24, loop: true, footY: 181 / 192, scale: 1, lazy: false },
    upset: { key: 'mint_ghost_impatient', file: 'assets/customers/mint_ghost/ghost_impatient.webp', frames: 85, size: 192, fps: 24, loop: true, footY: 184 / 192, scale: 1, lazy: false },
    angry: { key: 'mint_ghost_angry', file: 'assets/customers/mint_ghost/ghost_angry.webp', frames: 42, size: 192, fps: 24, loop: true, footY: 177 / 192, scale: 1, lazy: false },
    leaveAngry: { key: 'mint_ghost_leave_angry', file: 'assets/customers/mint_ghost/ghost_leave_angry.webp', frames: 130, size: 192, fps: LEAVE_FPS, loop: false, footY: 178 / 192, scale: 1, lazy: true },
    leaveHappy: { key: 'mint_ghost_leave_happy', file: 'assets/customers/mint_ghost/ghost_leave_happy.webp', frames: 127, size: 216, fps: LEAVE_FPS, loop: false, footY: 197 / 216, scale: 159 / 142, lazy: true },
    bodyH: 159,
    bodyW: 148,
  },
  // The lilac ghost comes from the ghost emotion sheets (24 frames of 192 px each, 12 fps; tools/make_lilac_ghost_art.py converts them). Nothing is fetched at boot:
  // src/views/ghostArt.ts loads calm, waiting and angry in the background once the diner Lv is near LOOK_UNLOCK_LEVELS, and the happy clip is requested like the
  // mint ghost's leave clips. Clips: calm = curious, upset = tired (yawning, "zz"), angry = angry, leaveHappy = laughing. There is no separate angry-leave clip, so
  // leaveAngry plays the angry loop once (same texture key). Its body is smaller in the frame than the other ghosts' (118 px against 159), so bodyH makes the view scale it up to match.
  lilac_ghost: {
    calm: { key: 'lilac_ghost_calm', file: 'assets/customers/lilac_ghost/lilac_ghost_calm.webp', frames: 24, size: 192, fps: 12, loop: true, footY: 144 / 192, scale: 1, lazy: true },
    upset: { key: 'lilac_ghost_upset', file: 'assets/customers/lilac_ghost/lilac_ghost_upset.webp', frames: 24, size: 192, fps: 12, loop: true, footY: 144 / 192, scale: 118 / 120, lazy: true },
    angry: { key: 'lilac_ghost_angry', file: 'assets/customers/lilac_ghost/lilac_ghost_angry.webp', frames: 24, size: 192, fps: 12, loop: true, footY: 154 / 192, scale: 1, lazy: true },
    leaveHappy: { key: 'lilac_ghost_happy', file: 'assets/customers/lilac_ghost/lilac_ghost_happy.webp', frames: 24, size: 192, fps: 12, loop: false, footY: 168 / 192, scale: 118 / 113, lazy: true },
    leaveAngry: { key: 'lilac_ghost_angry', file: 'assets/customers/lilac_ghost/lilac_ghost_angry.webp', frames: 24, size: 192, fps: 12, loop: false, footY: 154 / 192, scale: 1, lazy: true },
    bodyH: 118,
    bodyW: 94,
  },
};
/** Width of the ellipse drawn in the shadow frame, in sheet pixels. */
export const SHADOW_ART_W = 132;

export interface Personality {
  /** Breathing: period in ms and height change as a fraction (0.012 = 1.2 percent). */
  breathMs: number;
  breath: number;
  /** Tilt while idle, degrees, slow. */
  sway: number;
  /** Walking: ms per step (about 0.22 s) and hop height in px (6 to 9). */
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
  /** Ghosts hover above the stool and float instead of breathing; walking is a glide, not footsteps. */
  ghost?: { hover: number; bob: number; bobMs: number };
}

export const PERSONALITIES: Record<CustomerLook, Personality> = {
  // Little Kid: quick, bouncy, can hardly stand still.
  kid: { breathMs: 1500, breath: 0.016, sway: 1.2, stepMs: 200, stepBounce: 9, tapMs: 300, tapLift: 5, hop: 15, hopMs: 340, eatMs: 260, eat: 3, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 5 },
  // Grandma: slow and gentle everywhere.
  grandma: { breathMs: 3400, breath: 0.01, sway: 0.5, stepMs: 260, stepBounce: 6, tapMs: 900, tapLift: 1.5, hop: 6, hopMs: 520, eatMs: 700, eat: 1.5, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 2 },
  // Businessman: composed, checks his watch now and then.
  businessman: { breathMs: 2700, breath: 0.01, sway: 0.4, stepMs: 220, stepBounce: 7.5, tapMs: 520, tapLift: 3, hop: 8, hopMs: 400, eatMs: 520, eat: 2, nod: 0, watchEveryMs: [4500, 8000], hearts: 2, sparkles: 3, watchAt: { x: 0.64, y: 0.44 } },
  // Foodie Girl: excited when the food lands.
  foodie: { breathMs: 2000, breath: 0.014, sway: 0.9, stepMs: 210, stepBounce: 8, tapMs: 420, tapLift: 4, hop: 17, hopMs: 360, eatMs: 340, eat: 3.5, nod: 0, watchEveryMs: null, hearts: 5, sparkles: 6 },
  // Cool Teen: relaxed, long slow idle.
  teen: { breathMs: 3200, breath: 0.01, sway: 1.4, stepMs: 230, stepBounce: 7, tapMs: 700, tapLift: 2, hop: 7, hopMs: 460, eatMs: 600, eat: 2, nod: 0, watchEveryMs: null, hearts: 2, sparkles: 3 },
  // Chef Fan: enthusiastic about the food.
  chef_fan: { breathMs: 1900, breath: 0.014, sway: 0.8, stepMs: 210, stepBounce: 8, tapMs: 400, tapLift: 4, hop: 16, hopMs: 360, eatMs: 320, eat: 3.5, nod: 0, watchEveryMs: null, hearts: 5, sparkles: 6 },
  // Athlete: energetic, always a little on the move.
  athlete: { breathMs: 1400, breath: 0.016, sway: 1, stepMs: 190, stepBounce: 9, tapMs: 280, tapLift: 5, hop: 13, hopMs: 320, eatMs: 280, eat: 3, nod: 0, watchEveryMs: null, hearts: 3, sparkles: 5 },
  // Sleepy: very slow, droops, sighs.
  sleepy: { breathMs: 4600, breath: 0.014, sway: 0.4, stepMs: 260, stepBounce: 6, tapMs: 1100, tapLift: 1.5, hop: 4, hopMs: 620, eatMs: 900, eat: 1.5, nod: 2.2, watchEveryMs: null, hearts: 2, sparkles: 2 },
  // Ghosts hover a little above the stool and bob; stepMs / stepBounce describe the glide bob while moving.
  // Mint Ghost: friendly and light. The supplied animation already moves the body, so the extra float is small.
  mint_ghost: { breathMs: 2600, breath: 0, sway: 1, stepMs: 520, stepBounce: 3, tapMs: 420, tapLift: 3, hop: 11, hopMs: 400, eatMs: 380, eat: 2.5, nod: 0, watchEveryMs: null, hearts: 4, sparkles: 5, ghost: { hover: 3, bob: 2, bobMs: 2600 } },
  // Lilac Ghost: shy and curious, floats a little above the stool. Its footage only sways a little, so it keeps the same small extra float as the mint ghost.
  lilac_ghost: { breathMs: 2800, breath: 0, sway: 0.9, stepMs: 520, stepBounce: 3, tapMs: 480, tapLift: 3, hop: 10, hopMs: 420, eatMs: 400, eat: 2.2, nod: 0, watchEveryMs: null, hearts: 4, sparkles: 4, ghost: { hover: 3, bob: 2, bobMs: 2800 } },
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

/** Ghost idle: a slow float bob and gentle sway (no breathing squash). The constant hover height is applied by the view. */
export function floatPose(p: Personality, t: number, seed: number): Pose {
  const g = p.ghost;
  if (!g) return REST;
  const s = Math.sin((t / g.bobMs) * TAU + seed);
  const sway = Math.sin((t / (g.bobMs * 1.7)) * TAU + seed * 1.3) * p.sway;
  return { dx: 0, dy: -g.bob * (0.5 + 0.5 * s), sx: 1, sy: 1 + 0.006 * s, angle: sway };
}

/** Ghost agitation while the wait drags: a shimmy instead of a foot tap. Calm is still. */
export function shimmyPose(phase: Phase, t: number, seed: number): Pose {
  if (phase === 'calm') return REST;
  const fast = phase === 'angry';
  const s = Math.sin(t / (fast ? 45 : 90) + seed);
  return { dx: s * (fast ? 2.2 : 1), dy: 0, sx: 1, sy: 1, angle: s * (fast ? 1.2 : 0.5) };
}

/** Ghost glide while moving: a smooth bob and a slow +/- 2 degree lean, no hop or squash. amp scales it (0 is still). */
export function glidePose(p: Personality, t: number, amp = 1): Pose {
  if (amp <= 0) return REST;
  const n = t / p.stepMs;
  const bob = 0.5 - 0.5 * Math.cos(TAU * (n - Math.floor(n)));
  return { dx: 0, dy: -p.stepBounce * bob * amp, sx: 1, sy: 1, angle: 2 * Math.sin(Math.PI * n) * amp };
}

/** Ghosts do not hop onto the stool: a soft rise and settle. u runs 0..1. */
export function floatUpPose(u: number): Pose {
  return { dx: 0, dy: -4 * Math.sin(Math.PI * clamp01(u)), sx: 1, sy: 1, angle: 0 };
}

/**
 * Scare sheets (supplied, 45 frames of 208 x 370 at 12 fps, play once). They play when a ghost leaves angry, and
 * the camera shakes at the peak frame. Ghosts without a sheet, or a sheet that has not finished loading,
 * get the code-only lunge instead. Peak frames come from each sheet's .anim.json (a test keeps them in step).
 */
export interface ScareDef {
  key: string;
  file: string;
  peakFrame: number;
  /** Ghost box in frame 0 (from the sheet's anim.json): width px, centre x and top y as fractions of the frame. */
  boxW: number;
  boxCx: number;
  boxTop: number;
  /** Last frame used for the "losing patience" expression (before the face turns into the full lunge). */
  warnMax: number;
}
export const SCARE_FRAME_W = 208;
export const SCARE_FRAME_H = 370;
export const SCARE_FRAMES = 45;
export const SCARE_FPS = 12;
/** Overlay scale: head top lines up with the idle ghost's head, centred on the customer, and the frame is drawn at this scale. */
export const SCARE_SCALE = 0.55;
export const SCARE_FADE_MS = 150;
/** No ghost has a scare sheet right now (the new ghosts use the code-only lunge); add an entry here when one is supplied. */
export const SCARES: Partial<Record<CustomerLook, ScareDef>> = {};
export const isGhost = (look: number): boolean => !!PERSONALITIES[lookKey(look)].ghost;

/**
 * Losing-patience expression: below half patience a ghost with a scare sheet fades into the early frames of its
 * sheet (laid over the idle ghost: same width, same head top, same centre), and the face turns more menacing as
 * patience falls: frame = severity * warnMax. Only that face is swapped; the rest still floats and shimmies.
 */
export function warnSeverity(frac: number): number {
  return clamp01((0.5 - frac) / 0.5);
}
export const warnFrame = (def: ScareDef, severity: number): number => Math.round(clamp01(severity) * def.warnMax);
export const warnAlpha = (severity: number): number => clamp01(severity * 3);
/** Overlay scale so the ghost box matches the idle figure's width (px). */
export const warnScale = (def: ScareDef, idleWidth: number): number => idleWidth / def.boxW;

/** Code-only scare lunge (about 0.7 s): the ghost surges toward the camera, then fades. k runs 0..1. */
export const LUNGE_MS = 700;
export function lungePose(k: number): { pose: Pose; alpha: number; peak: boolean } {
  const x = clamp01(k);
  const e = easeOut(Math.min(1, x / 0.6));
  const scale = 1 + 0.25 * e; // kept small: the figure is 136 px tall and the top of the screen is 51 px above its head
  return {
    pose: { dx: Math.sin(x * Math.PI * 14) * 3 * (1 - x), dy: -6 * e, sx: scale, sy: scale, angle: 0 },
    alpha: x < 0.6 ? 1 : 1 - (x - 0.6) / 0.4,
    peak: x >= 0.55,
  };
}

/** Walk-in and walk-out take 1.6 s; after arriving: a short settle bounce, then a 0.25 s pop up onto the stool. */
export const WALK_MS = 1600;
export const SETTLE_MS = 180;
export const POP_MS = 250;
export const ARRIVE_MS = WALK_MS + SETTLE_MS + POP_MS;
/** Tilt in degrees while walking, alternating each step. */
export const STEP_TILT = 3;

/**
 * One walking step cycle at time t (ms since the walk began). Each step is an ease-in-out hop (0 at foot-down,
 * 1 at the top), the body tilts +/- 3 degrees alternating each step, and scaleY goes 0.97 at the bottom of the
 * step to 1.03 at the top (scaleX the other way, so the figure never looks stretched). amp scales it all
 * (0 means no walk cycle at all).
 */
export function stepPose(p: Personality, t: number, amp = 1): Pose {
  if (amp <= 0) return REST;
  const n = t / p.stepMs;
  const bump = 0.5 - 0.5 * Math.cos(TAU * (n - Math.floor(n)));
  const sy = 1 + 0.03 * (2 * bump - 1) * amp;
  return { dx: 0, dy: -p.stepBounce * bump * amp, sx: 1 - (sy - 1) * 0.5, sy, angle: STEP_TILT * Math.sin(Math.PI * n) * amp };
}

/** Settle bounce: a small damped hop after the last step. u runs 0..1. */
export function settlePose(u: number): Pose {
  const x = clamp01(u);
  const s = Math.sin(Math.PI * x);
  return { dx: 0, dy: -3.5 * s * (1 - x * 0.5), sx: 1 + 0.01 * s, sy: 1 - 0.015 * s, angle: 0 };
}

/** The arrival pop (customers now stand on the floor, so it is a small hop): a quick crouch, a small hop of about 6 px with a stretch, then a landing squash. u runs 0..1. */
export function popPose(u: number): Pose {
  const x = clamp01(u);
  if (x < 0.25) {
    const c = easeOut(x / 0.25);
    return { dx: 0, dy: 0, sx: 1 + 0.035 * c, sy: 1 - 0.06 * c, angle: 0 };
  }
  if (x < 0.75) {
    const s = Math.sin(Math.PI * ((x - 0.25) / 0.5));
    return { dx: 0, dy: -6 * s, sx: 1 - 0.02 * s, sy: 1 + 0.04 * s, angle: 0 };
  }
  const s = Math.sin(Math.PI * ((x - 0.75) / 0.25));
  return { dx: 0, dy: 0, sx: 1 + 0.03 * s, sy: 1 - 0.05 * s, angle: 0 };
}

export type ArrivePhase = 'walk' | 'settle' | 'pop' | 'done';

/**
 * Walking in from off-screen. distance is how far the start is from the seat (px), dir is -1 (comes from the
 * left) or 1 (from the right). Ease-out slide; the step cycle fades out over the last quarter so the
 * character is not marching on the spot as they stop.
 */
export function arrivePose(p: Personality, t: number, distance: number, dir: number): { pose: Pose; phase: ArrivePhase } {
  if (t < WALK_MS) {
    const k = t / WALK_MS;
    const amp = Math.min(1, (1 - k) * 4);
    const step = p.ghost ? glidePose(p, t, amp) : stepPose(p, t, amp);
    return { pose: { ...step, dx: (1 - easeOut(k)) * distance * dir }, phase: 'walk' };
  }
  if (t < WALK_MS + SETTLE_MS) return { pose: settlePose((t - WALK_MS) / SETTLE_MS), phase: 'settle' };
  if (t < ARRIVE_MS) {
    const u = (t - WALK_MS - SETTLE_MS) / POP_MS;
    return { pose: p.ghost ? floatUpPose(u) : popPose(u), phase: 'pop' };
  }
  return { pose: REST, phase: 'done' };
}

/** Walking out to the edge the customer came from: the arrival in reverse (ease-in), same step cycle. */
export function departPose(p: Personality, t: number, distance: number, dir: number): { pose: Pose; done: boolean } {
  const k = clamp01(t / WALK_MS);
  const amp = Math.min(1, k * 4);
  const step = p.ghost ? glidePose(p, t, amp) : stepPose(p, t, amp);
  return { pose: { ...step, dx: easeIn(k) * distance * dir }, done: t >= WALK_MS };
}

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
