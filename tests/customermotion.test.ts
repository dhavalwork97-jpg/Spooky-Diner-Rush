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
  SHADOW_FRAME,
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
import { CUSTOMER_LOOK_COUNT, KitchenState } from '../src/game/KitchenState';
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
    expect(CUSTOMER_LOOKS).toHaveLength(8);
  });
  it('maps any look number to a character, even out of range', () => {
    expect(lookKey(0)).toBe('kid');
    expect(lookKey(8)).toBe('kid');
    expect(lookKey(-1)).toBe('sleepy');
    expect(lookIndex(3)).toBe(3);
    expect(lookIndex(11)).toBe(3);
  });
  it('the model only produces looks that exist', () => {
    const s = new KitchenState({ level: 8, xp: 0, coins: 0 }, defaultConfig, 7);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      s.update(1);
      for (const c of s.customers) seen.add(c.look);
      s.customers.length = 0;
    }
    for (const l of seen) expect(l).toBeGreaterThanOrEqual(0), expect(l).toBeLessThan(CUSTOMER_LOOK_COUNT);
    expect(seen.size).toBeGreaterThan(4);
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
    for (const k of CUSTOMER_LOOKS) {
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
  it('settle and pop start and end at rest; the pop hops about 10 px', () => {
    expect(settlePose(0).dy).toBeCloseTo(0);
    expect(settlePose(1).dy).toBeCloseTo(0);
    expect(popPose(0)).toMatchObject({ dy: 0, sy: 1 });
    let top = 0;
    for (let u = 0; u <= 1; u += 0.01) top = Math.min(top, popPose(u).dy);
    expect(top).toBeCloseTo(-10, 0);
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
