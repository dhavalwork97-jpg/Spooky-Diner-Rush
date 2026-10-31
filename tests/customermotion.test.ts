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
  walkPose,
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
  it('walk in starts offset and transparent, ends at rest and opaque; walk out ends away and faded', () => {
    const p = PERSONALITIES.kid;
    const a = walkPose(p, 0, 'in', -1);
    expect(a.alpha).toBe(0);
    expect(a.pose.dx).toBeLessThan(0);
    const b = walkPose(p, 1, 'in', -1);
    expect(b.alpha).toBe(1);
    expect(b.pose.dx).toBeCloseTo(0);
    expect(Math.abs(b.pose.dy)).toBeLessThan(0.01);
    const c = walkPose(p, 1, 'out', 1);
    expect(c.alpha).toBe(0);
    expect(c.pose.dx).toBeGreaterThan(0);
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
