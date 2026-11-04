import { describe, expect, it } from 'vitest';
import assetsJson from '../data/assets.json';
import {
  CELL_H,
  CELL_W,
  CUSTOMER_LOOKS,
  CUSTOMER_SHEET,
  FIGURE_W,
  HEART_FRAME,
  PERSONALITIES,
  REST,
  SCARES,
  LOOK_ART,
  clipFor,
  warnAlpha,
  warnFrame,
  warnScale,
  warnSeverity,
  SHADOW_FRAME,
  LUNGE_MS,
  floatPose,
  glidePose,
  isGhost,
  lungePose,
  shimmyPose,
  addPose,
  eatPose,
  hopPose,
  idlePose,
  impatiencePose,
  lookIndex,
  lookKey,
  nextWatchDelay,
  phaseFor,
  seedFor,
  ARRIVE_MS,
  POP_MS,
  SETTLE_MS,
  STEP_TILT,
  WALK_MS,
  arrivePose,
  departPose,
  popPose,
  settlePose,
  stepPose,
  watchPose,
} from '../src/anim/customerMotion';
import { CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, KitchenState } from '../src/game/KitchenState';
import { defaultConfig } from '../src/game/config';

const assets = assetsJson.assets;
const files = import.meta.glob('../public/assets/art/customers.webp');

describe('customer art', () => {
  it('is one sprite sheet with a frame for each character, the shadow and the heart', () => {
    const sheet = assets.find((x) => x.key === CUSTOMER_SHEET) as { file: string; type: string; frameWidth: number; frameHeight: number } | undefined;
    expect(sheet).toBeTruthy();
    expect(sheet!.type).toBe('spritesheet');
    expect(sheet!.frameWidth).toBe(CELL_W);
    expect(sheet!.frameHeight).toBe(CELL_H);
    expect(files[`../public/${sheet!.file}`]).toBeTruthy();
    expect(SHADOW_FRAME).toBe(CUSTOMER_LOOKS.length);
    expect(HEART_FRAME).toBe(CUSTOMER_LOOKS.length + 1);
    expect(FIGURE_W).toHaveLength(CUSTOMER_LOOKS.length);
    for (const w of FIGURE_W) expect(w).toBeLessThanOrEqual(CELL_W);
  });
  it('has no leftover generic customer art or per-character textures', () => {
    expect(assets.filter((a) => /^customer_/.test(a.key))).toHaveLength(0);
  });
  it('keeps the model look count equal to the art count', () => {
    expect(CUSTOMER_LOOK_COUNT).toBe(CUSTOMER_LOOKS.length);
    expect(CUSTOMER_LOOKS).toHaveLength(9);
  });
  it('maps any look number to a character, even out of range', () => {
    expect(lookKey(0)).toBe('kid');
    expect(lookKey(9)).toBe('kid');
    expect(lookKey(8)).toBe('mint_ghost');
    expect(lookKey(-1)).toBe('mint_ghost');
    expect(lookIndex(3)).toBe(3);
    expect(lookIndex(12)).toBe(3);
  });
  it('the model only produces ghost looks', () => {
    const s = new KitchenState({ level: 8, xp: 0, coins: 0 }, defaultConfig, 7);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      s.update(1);
      for (const c of s.customers) seen.add(c.look);
      s.customers.length = 0;
    }
    for (const l of seen) expect(l).toBeGreaterThanOrEqual(CUSTOMER_LOOK_MIN), expect(l).toBeLessThan(CUSTOMER_LOOK_COUNT);
    // customers are ghosts only (one so far: the mint ghost) and no person appears
    expect(seen.size).toBe(1);
    for (const l of seen) expect(isGhost(l)).toBe(true);
  });
});

describe('customer motion', () => {
  it('breathing stays under 2 percent and tilts under 4 degrees for every character', () => {
    for (const k of CUSTOMER_LOOKS) {
      const p = PERSONALITIES[k];
      for (let t = 0; t < 12000; t += 37) {
        const pose = idlePose(p, t, 1.3);
        expect(Math.abs(pose.sy - 1)).toBeLessThan(0.02);
        expect(Math.abs(pose.sx - 1)).toBeLessThan(0.02);
        expect(Math.abs(pose.angle)).toBeLessThan(4);
      }
    }
  });
  it('never sinks below the floor in the idle, tap, eat or hop poses', () => {
    for (const k of CUSTOMER_LOOKS) {
      const p = PERSONALITIES[k];
      for (let t = 0; t < 3000; t += 23) {
        expect(impatiencePose(p, 'angry', t, 0).dy).toBeLessThanOrEqual(0);
        expect(eatPose(p, t, 0).dy).toBeLessThanOrEqual(0);
        expect(hopPose(p, (t % 1000) / 1000).dy).toBeLessThanOrEqual(0);
      }
    }
  });
  it('calm customers do not tap their feet; worried and angry ones do', () => {
    const p = PERSONALITIES.athlete;
    expect(impatiencePose(p, 'calm', 123, 0)).toEqual(REST);
    let max = 0;
    for (let t = 0; t < 1000; t += 10) max = Math.max(max, -impatiencePose(p, 'worried', t, 0).dy);
    expect(max).toBeGreaterThan(1);
  });
  it('phases follow the patience thresholds', () => {
    expect(phaseFor(1)).toBe('calm');
    expect(phaseFor(0.49)).toBe('worried');
    expect(phaseFor(0.24)).toBe('angry');
  });
  it('personalities differ in the way the brief asks', () => {
    const P = PERSONALITIES;
    expect(P.kid.breathMs).toBeLessThan(P.grandma.breathMs);
    expect(P.kid.hop).toBeGreaterThan(P.grandma.hop);
    expect(P.sleepy.breathMs).toBe(Math.max(...CUSTOMER_LOOKS.map((k) => P[k].breathMs)));
    expect(P.sleepy.nod).toBeGreaterThan(0);
    expect(P.teen.breathMs).toBeGreaterThan(P.athlete.breathMs);
    expect(P.foodie.hearts).toBeGreaterThanOrEqual(P.businessman.hearts);
    expect(P.chef_fan.hop).toBeGreaterThan(P.teen.hop);
    expect(P.athlete.stepMs).toBeLessThan(P.grandma.stepMs);
    // only the businessman checks a wristwatch
    for (const k of CUSTOMER_LOOKS) expect(P[k].watchEveryMs !== null).toBe(k === 'businessman');
    expect(nextWatchDelay(P.kid, 0.5)).toBe(Infinity);
    expect(nextWatchDelay(P.businessman, 0)).toBe(P.businessman.watchEveryMs![0]);
  });
  it('walk timing matches the brief: 1.4 to 1.8 s walk, about 0.22 s steps, 6 to 9 px hops, 0.25 s pop', () => {
    expect(WALK_MS).toBeGreaterThanOrEqual(1400);
    expect(WALK_MS).toBeLessThanOrEqual(1800);
    expect(POP_MS).toBe(250);
    for (const k of CUSTOMER_LOOKS.slice(0, 8)) {
      // people only: ghosts glide with a slower bob
      const p = PERSONALITIES[k];
      expect(p.stepMs).toBeGreaterThanOrEqual(185);
      expect(p.stepMs).toBeLessThanOrEqual(265);
      expect(p.stepBounce).toBeGreaterThanOrEqual(6);
      expect(p.stepBounce).toBeLessThanOrEqual(9);
    }
  });
  it('a step is hop, tilt and squash: foot-down at 0 and the top mid-step, tilt alternates, scaleY 0.97 to 1.03', () => {
    const p = PERSONALITIES.businessman;
    const down = stepPose(p, 0);
    expect(down.dy).toBeCloseTo(0);
    expect(down.sy).toBeCloseTo(0.97);
    const top = stepPose(p, p.stepMs / 2);
    expect(top.dy).toBeCloseTo(-p.stepBounce);
    expect(top.sy).toBeCloseTo(1.03);
    expect(top.angle).toBeCloseTo(STEP_TILT);
    expect(stepPose(p, p.stepMs * 1.5).angle).toBeCloseTo(-STEP_TILT);
    expect(top.sx).toBeLessThan(1);
    for (let t = 0; t < 3000; t += 7) {
      const q = stepPose(p, t);
      expect(q.dy).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(q.angle)).toBeLessThanOrEqual(STEP_TILT + 1e-9);
      expect(q.sy).toBeGreaterThanOrEqual(0.97 - 1e-9);
      expect(q.sy).toBeLessThanOrEqual(1.03 + 1e-9);
    }
  });
  it('no step cycle when amp is zero', () => {
    expect(stepPose(PERSONALITIES.kid, 123, 0)).toEqual(REST);
  });
  it('arrival: starts at the edge, ends at the stool, then settles and pops, and stops moving when done', () => {
    const p = PERSONALITIES.kid;
    const start = arrivePose(p, 0, 500, -1);
    expect(start.phase).toBe('walk');
    expect(start.pose.dx).toBeCloseTo(-500);
    let prev = -Infinity;
    for (let t = 0; t < WALK_MS; t += 20) {
      const dx = arrivePose(p, t, 500, -1).pose.dx;
      expect(dx).toBeGreaterThanOrEqual(prev); // always moving toward the stool
      prev = dx;
    }
    // ease-out: much of the distance is covered early, the last 10 percent of time is slow
    expect(arrivePose(p, WALK_MS * 0.5, 500, -1).pose.dx).toBeGreaterThan(-130);
    expect(Math.abs(arrivePose(p, WALK_MS - 1, 500, -1).pose.dx)).toBeLessThan(1);
    expect(arrivePose(p, WALK_MS + 10, 500, -1).phase).toBe('settle');
    expect(arrivePose(p, WALK_MS + SETTLE_MS + 10, 500, -1).phase).toBe('pop');
    expect(arrivePose(p, ARRIVE_MS, 500, -1)).toEqual({ pose: REST, phase: 'done' });
    // coming from the right
    expect(arrivePose(p, 0, 400, 1).pose.dx).toBeCloseTo(400);
  });
  it('the walk cycle fades out before arriving, so no marching on the spot', () => {
    const p = PERSONALITIES.athlete;
    for (let t = WALK_MS - 60; t < WALK_MS; t += 5) {
      const q = arrivePose(p, t, 300, 1).pose;
      expect(Math.abs(q.dy)).toBeLessThan(1.2);
      expect(Math.abs(q.angle)).toBeLessThan(0.5);
    }
  });
  it('settle and pop start and end at rest; the pop hops about 6 px', () => {
    expect(settlePose(0).dy).toBeCloseTo(0);
    expect(settlePose(1).dy).toBeCloseTo(0);
    expect(popPose(0)).toMatchObject({ dy: 0, sy: 1 });
    let top = 0;
    for (let u = 0; u <= 1; u += 0.01) top = Math.min(top, popPose(u).dy);
    expect(top).toBeCloseTo(-6, 0);
    expect(popPose(1).dy).toBeCloseTo(0);
    expect(popPose(1).sy).toBeCloseTo(1);
  });
  it('departure walks to the edge and accelerates; steps ramp in from rest', () => {
    const p = PERSONALITIES.grandma;
    expect(departPose(p, 0, 500, 1).pose.dx).toBeCloseTo(0);
    expect(departPose(p, WALK_MS, 500, 1).pose.dx).toBeCloseTo(500);
    expect(departPose(p, WALK_MS, 500, -1).pose.dx).toBeCloseTo(-500);
    expect(departPose(p, WALK_MS, 500, 1).done).toBe(true);
    expect(departPose(p, WALK_MS / 2, 500, 1).pose.dx).toBeLessThan(250); // ease-in
    expect(departPose(p, 10, 500, 1).pose.angle).toBeLessThan(0.5);
  });
  it('one-shot poses return to rest', () => {
    expect(hopPose(PERSONALITIES.kid, 1).dy).toBeCloseTo(0);
    const w = watchPose(1);
    expect(w.angle).toBeCloseTo(0);
    expect(addPose(REST, REST)).toEqual(REST);
  });
  it('neighbouring customers get different phase offsets', () => {
    expect(seedFor(1)).not.toBe(seedFor(2));
  });
});

const GHOST_NAMES = ['mint_ghost'] as const;
const mintFiles = import.meta.glob('../public/assets/customers/mint_ghost/*.webp', { query: '?url', import: 'default' });
const mintMeta = import.meta.glob('../public/assets/customers/mint_ghost/*.anim.json', { eager: true, import: 'default' }) as Record<string, { frames: number; columns: number; frameWidth: number; frameHeight: number; fps: number; loop: boolean; bodyTop: number; bodyBottom: number; bodyHeight: number; bodyWidth: number; edgeAlpha: number }>;
const oldGhostFiles = import.meta.glob('../public/assets/customers/ghosts/**/*', { query: '?url', import: 'default' });

describe('ghost customers', () => {
  it('are the last looks, flagged as ghosts; people are not', () => {
    GHOST_NAMES.forEach((n, i) => {
      expect(CUSTOMER_LOOKS[8 + i]).toBe(n);
      expect(isGhost(8 + i)).toBe(true);
      expect(PERSONALITIES[n].ghost!.hover).toBeGreaterThan(0);
    });
    for (let i = 0; i < 8; i++) expect(isGhost(i)).toBe(false);
  });
  it('the old ghosts (cutouts and scare sheets) are gone from the game and the asset list', () => {
    expect(Object.keys(oldGhostFiles)).toHaveLength(0);
    expect(assets.filter((a) => /^ghost_scare_/.test(a.key))).toHaveLength(0);
    expect(CUSTOMER_LOOKS as readonly string[]).not.toContain('vest_gentleman');
  });
  it('the mint ghost is drawn from its five supplied animation sheets, and the numbers in LOOK_ART match their sidecar files', () => {
    const art = LOOK_ART.mint_ghost!;
    expect(art).toBeTruthy();
    const clips = { ghost_idle_happy: art.calm, ghost_impatient: art.upset, ghost_angry: art.angry, ghost_leave_angry: art.leaveAngry, ghost_leave_happy: art.leaveHappy };
    const calmMeta = mintMeta['../public/assets/customers/mint_ghost/ghost_idle_happy.anim.json'];
    for (const [side, clip] of Object.entries(clips)) {
      const meta = mintMeta[`../public/assets/customers/mint_ghost/${side}.anim.json`];
      expect(meta, side).toBeTruthy();
      expect(clip.frames, side).toBe(meta.frames);
      expect(clip.size, side).toBe(meta.frameWidth);
      expect(meta.frameHeight).toBe(meta.frameWidth);
      expect(clip.loop, side).toBe(meta.loop);
      expect(meta.fps).toBe(24);
      expect(clip.footY, side).toBeCloseTo(meta.bodyBottom / meta.frameHeight, 3);
      // every clip draws the ghost's body at the calm clip's size
      expect(clip.scale * meta.bodyHeight, side).toBeCloseTo(calmMeta.bodyHeight, 0);
      // the figure never touches the frame edge, so no rectangle can show around it
      expect(meta.edgeAlpha, side).toBe(0);
      expect(mintFiles[`../public/${clip.file}`], clip.file).toBeTruthy();
      const listed = assets.find((x) => x.key === clip.key) as { type: string; file: string; frameWidth: number; frameHeight: number; lazy?: boolean } | undefined;
      expect(listed?.type).toBe('spritesheet');
      expect(listed?.file).toBe(clip.file);
      expect(listed?.frameWidth).toBe(clip.size);
      expect(listed?.frameHeight).toBe(clip.size);
      expect(listed?.lazy, side).toBe(clip.lazy);
    }
    expect(art.bodyH).toBe(calmMeta.bodyHeight);
    expect(art.bodyW).toBe(calmMeta.bodyWidth);
    // only the leave clips are loaded on demand; the three looping clips are ready at start
    expect([art.calm, art.upset, art.angry].every((c) => !c.lazy && c.loop)).toBe(true);
    expect([art.leaveHappy, art.leaveAngry].every((c) => c.lazy && !c.loop)).toBe(true);
    // played faster than supplied so the seat is free again soon, but not so fast it looks wrong
    for (const c of [art.leaveHappy, art.leaveAngry]) {
      expect(c.frames / c.fps).toBeLessThan(3.5);
      expect(c.frames / c.fps).toBeGreaterThan(2.5);
    }
  });
  it('the looping clip follows the mood: calm and happy idle, worried impatient, angry angry', () => {
    expect(clipFor('normal')).toBe('calm');
    expect(clipFor('happy')).toBe('calm');
    expect(clipFor('worried')).toBe('upset');
    expect(clipFor('angry')).toBe('angry');
  });
  it('no ghost has a scare sheet now, so an angry ghost leaves with the code-only lunge', () => {
    expect(Object.keys(SCARES)).toHaveLength(0);
  });
  it('float stays within a few px and a few degrees; calm ghosts do not shimmy', () => {
    for (const n of GHOST_NAMES) {
      const p = PERSONALITIES[n];
      for (let t = 0; t < 9000; t += 41) {
        const f = floatPose(p, t, 0.7);
        expect(f.dy).toBeLessThanOrEqual(1e-9);
        expect(f.dy).toBeGreaterThanOrEqual(-p.ghost!.bob - 1e-9);
        expect(Math.abs(f.angle)).toBeLessThan(2.5);
      }
    }
    expect(shimmyPose('calm', 5, 0)).toEqual(REST);
    expect(Math.abs(shimmyPose('angry', 10, 0).dx)).toBeLessThanOrEqual(2.2);
  });
  it('glide and arrival: no hop or squash, ends at rest', () => {
    const p = PERSONALITIES.mint_ghost;
    for (let t = 0; t < WALK_MS; t += 11) {
      const q = arrivePose(p, t, 400, -1).pose;
      expect(q.sy).toBe(1);
      expect(q.sx).toBe(1);
      expect(q.dy).toBeGreaterThanOrEqual(-p.stepBounce - 1e-9);
      expect(Math.abs(q.angle)).toBeLessThanOrEqual(2 + 1e-9);
    }
    expect(glidePose(p, 100, 0)).toEqual(REST);
    expect(arrivePose(p, ARRIVE_MS, 400, -1).phase).toBe('done');
    expect(departPose(p, WALK_MS, 400, 1).pose.dx).toBeCloseTo(400);
  });
  it('the code-only lunge grows toward the camera, then fades out and ends opaque-free', () => {
    const a = lungePose(0);
    expect(a.pose.sx).toBeCloseTo(1);
    expect(a.alpha).toBe(1);
    const mid = lungePose(0.6);
    expect(mid.pose.sx).toBeGreaterThan(1.2);
    expect(mid.pose.sx).toBeLessThan(1.3); // never grows past the top of the screen
    expect(mid.peak).toBe(true);
    expect(lungePose(1).alpha).toBeCloseTo(0);
    expect(LUNGE_MS).toBeLessThan(1000);
  });
});

describe('losing-patience expression maths (used again when a ghost gets a scare sheet)', () => {
  it('starts under half patience and gets stronger as patience falls', () => {
    expect(warnSeverity(1)).toBe(0);
    expect(warnSeverity(0.5)).toBe(0);
    expect(warnSeverity(0.25)).toBeCloseTo(0.5);
    expect(warnSeverity(0)).toBe(1);
    const def = { key: 'k', file: 'f', peakFrame: 38, boxW: 201, boxCx: 0.5, boxTop: 0, warnMax: 22 };
    expect(warnFrame(def, 0)).toBe(0);
    expect(warnFrame(def, 1)).toBe(def.warnMax);
    expect(warnFrame(def, 0.5)).toBeGreaterThan(0);
    expect(warnFrame(def, 0.5)).toBeLessThan(def.warnMax);
    expect(warnAlpha(0)).toBe(0);
    expect(warnAlpha(0.34)).toBe(1);
  });
  it('scales the overlay so the ghost box matches the idle figure width', () => {
    const def = { key: 'k', file: 'f', peakFrame: 26, boxW: 125, boxCx: 0.5, boxTop: 0, warnMax: 14 };
    expect(warnScale(def, 125)).toBeCloseTo(1);
    expect(warnScale(def, 75)).toBeCloseTo(0.6);
  });
});
