import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/game/rng';
import {
  AIR,
  FLOOR,
  FOG_ASPECT,
  GRADE_STOPS,
  FOG_GAP,
  LAMPS,
  QUALITY_DESKTOP,
  QUALITY_MOBILE,
  envelope,
  STAR_BOX,
  WINDOW_PANES,
  WISP_GAP,
  fogSpec,
  lampIntensity,
  moteSpec,
  nextDelay,
  twinkle,
  wispSpec,
} from '../src/anim/atmosphereMath';
import { SRC_H, SRC_W } from '../src/views/layout';

describe('lamp light', () => {
  it('stays close to 1 and never flashes', () => {
    let min = 9;
    let max = 0;
    let prev = lampIntensity(0, 0.7);
    let maxStep = 0;
    for (let t = 0.05; t < 300; t += 0.05) {
      const v = lampIntensity(t, 0.7);
      min = Math.min(min, v);
      max = Math.max(max, v);
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
    }
    expect(min).toBeGreaterThan(0.88);
    expect(max).toBeLessThan(1.06);
    expect(maxStep).toBeLessThan(0.02); // per 50 ms: smooth
  });
});

describe('dusk grade', () => {
  it('gets lighter from the dark windows down to the counters, so the cooking area stays bright', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
    };
    const stops = GRADE_STOPS.map(([at, c]) => [at, lum(c)]);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      expect(stops[i][1]).toBeGreaterThanOrEqual(stops[i - 1][1]);
    }
    expect(stops[0][1]).toBeGreaterThan(100); // never near-black
    expect(stops[stops.length - 1][1]).toBeGreaterThan(235); // machines at about full brightness
  });
});

describe('envelope', () => {
  it('is 0 at both ends, 1 in the middle and smooth', () => {
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
    expect(envelope(0.5)).toBe(1);
    let prev = 0;
    for (let p = 0.001; p <= 1; p += 0.001) {
      const v = envelope(p);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
  });
});

describe('twinkle', () => {
  it('stays inside its range', () => {
    for (let t = 0; t < 60; t += 0.3) {
      const v = twinkle(t, 0.37);
      expect(v).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(v).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });
});

describe('fog', () => {
  it('is always a small patch inside the floor strip, drifting slowly and faintly', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 500; i++) {
      const f = fogSpec(rng);
      expect(f.width).toBeLessThanOrEqual(310);
      expect(f.x - f.width / 2).toBeGreaterThanOrEqual(FLOOR.x - 1);
      expect(f.x + f.width / 2).toBeLessThanOrEqual(FLOOR.x + FLOOR.w + 1);
      expect(f.y).toBeGreaterThanOrEqual(FLOOR.y);
      expect(f.y).toBeLessThanOrEqual(FLOOR.y + FLOOR.h);
      expect(Math.abs(f.drift)).toBeLessThanOrEqual(90);
      expect(f.peakAlpha).toBeLessThanOrEqual(0.66);
      expect(f.peakAlpha).toBeGreaterThanOrEqual(0.42); // visible, not a rumour
      expect(f.life).toBeGreaterThanOrEqual(9);
      expect([0, 1, 2]).toContain(f.variant);
    }
  });

  it('keeps the floor mostly clear: a fraction of the floor strip on average, a few percent of the whole picture at most', () => {
    // Patches alive on average = life / gap. The soft picture of a patch is about 35 percent solid (blobs fade to nothing).
    const rng = makeRng(5);
    let life = 0;
    let area = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const f = fogSpec(rng);
      life += f.life;
      area += f.width * (f.width * FOG_ASPECT) * 0.35;
    }
    const meanLife = life / n;
    const meanArea = area / n;
    const meanGap = (FOG_GAP[0] + FOG_GAP[1]) / 2;
    const alive = Math.min(QUALITY_DESKTOP.maxFog, meanLife / meanGap);
    expect((alive * meanArea) / (FLOOR.w * FLOOR.h)).toBeLessThan(0.3);
    expect((alive * meanArea) / (FLOOR.w * FLOOR.h)).toBeGreaterThan(0.05); // and it does show up
    expect((QUALITY_DESKTOP.maxFog * 310 * 310 * FOG_ASPECT * 0.35) / (SRC_W * SRC_H)).toBeLessThan(0.04);
  });
});

describe('wisps and motes', () => {
  it('wisps cross the room slowly and stay faint', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 300; i++) {
      const w = wispSpec(rng);
      expect(w.x).toBeGreaterThanOrEqual(AIR.x - 1);
      expect(w.x + w.dx).toBeGreaterThanOrEqual(AIR.x - 1);
      expect(w.x).toBeLessThanOrEqual(AIR.x + AIR.w + 1);
      expect(w.x + w.dx).toBeLessThanOrEqual(AIR.x + AIR.w + 1);
      expect(w.peakAlpha).toBeLessThanOrEqual(0.66);
      expect(Math.abs(w.dx) / w.life).toBeLessThan(70); // px per second
    }
  });

  it('motes are tiny and dim', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 300; i++) {
      const m = moteSpec(rng);
      expect(m.size).toBeLessThanOrEqual(9);
      expect(m.peakAlpha).toBeLessThanOrEqual(0.65);
      expect([0x6fe6f0, 0x7aa8ff, 0xb48cff]).toContain(m.color);
    }
  });

  it('spawn gaps are random inside their ranges and wisps are rarer than fog', () => {
    const rng = makeRng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const g = nextDelay(rng, FOG_GAP);
      expect(g).toBeGreaterThanOrEqual(FOG_GAP[0]);
      expect(g).toBeLessThanOrEqual(FOG_GAP[1]);
      seen.add(Math.round(g * 100));
    }
    expect(seen.size).toBeGreaterThan(40);
    expect(WISP_GAP[0]).toBeGreaterThan(FOG_GAP[0]);
  });
});

describe('quality and placement', () => {
  it('mobile gets fewer effects than desktop', () => {
    expect(QUALITY_MOBILE.pinpoints).toBeLessThan(QUALITY_DESKTOP.pinpoints);
    expect(QUALITY_MOBILE.motes).toBeLessThan(QUALITY_DESKTOP.motes);
    expect(QUALITY_MOBILE.maxWisps).toBeLessThanOrEqual(QUALITY_DESKTOP.maxWisps);
  });

  it('everything lies inside the source picture; pinpoints sit over the window panes', () => {
    for (const b of [FLOOR, AIR, STAR_BOX, ...WINDOW_PANES]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(SRC_W);
      expect(b.y + b.h).toBeLessThanOrEqual(SRC_H);
    }
    for (const l of LAMPS) expect(l.y).toBeLessThan(WINDOW_PANES[0].y + WINDOW_PANES[0].h);
    expect(STAR_BOX.y + STAR_BOX.h).toBeLessThanOrEqual(WINDOW_PANES[0].y + WINDOW_PANES[0].h); // inside the window panes
  });
});
