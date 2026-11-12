import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { meltBlend, pressDown, pressStep, stirStep } from '../src/views/TacoViews';

const DIR = 'public/assets/taco/animations';
const meta = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}_sheet.anim.json`), 'utf8'));
const webpSize = (file: string): { w: number; h: number } => {
  const b = readFileSync(file);
  expect(b.toString('ascii', 12, 16)).toBe('VP8X');
  return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
};
const checkSheet = (n: string, looks: string[], loop: number) => {
  const m = meta(n);
  expect(m.key).toBe(n);
  const { w, h } = webpSize(join(DIR, m.image));
  expect(w).toBe(m.frameWidth * m.columns);
  expect(h).toBe(m.frameHeight * m.rows);
  expect(Math.max(w, h)).toBeLessThanOrEqual(4096);
  expect(statSync(join(DIR, m.image)).size).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  expect(m.frameLabels).toHaveLength(m.frameCount);
  expect(m.frameCount).toBeLessThanOrEqual(m.columns * m.rows);
  expect(m.stir.looks).toEqual(looks);
  expect(m.stir.loop).toBe(loop);
  for (const l of looks) {
    expect(m.stir.clips[l]).toHaveLength(loop);
    for (const f of m.stir.clips[l] as number[]) {
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(m.frameCount);
    }
  }
  return m;
};

describe('burrito press pan sheets', () => {
  const LOOKS = ['pale', 'sear', 'golden', 'burnt'];
  for (const c of ['red', 'blue']) {
    it(`pan_${c}_press: json matches the picture, clips point at real frames, pan box inside the frame`, () => {
      const m = checkSheet(`pan_${c}_press`, LOOKS, 4);
      expect(m.stir.empty).toBe(0);
      expect(m.frameLabels[0]).toBe('empty');
      for (const l of LOOKS) for (const f of m.stir.clips[l] as number[]) expect(f).toBeGreaterThan(0); // 0 is the empty pan
      const b = m.panBox;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(m.frameWidth);
      expect(b.y + b.h).toBeLessThanOrEqual(m.frameHeight);
    });
  }
  it('red and blue have the same frame table', () => {
    const r = meta('pan_red_press'), b = meta('pan_blue_press');
    expect(b.stir.clips).toEqual(r.stir.clips);
    expect(b.frameLabels).toEqual(r.frameLabels);
    expect(b.panBox).toEqual(r.panBox);
    expect([b.frameWidth, b.frameHeight]).toEqual([r.frameWidth, r.frameHeight]);
  });
  it('the known flaws of the source are not used: frames 7 and 13 (golden in the wrong row) and 14 (pressed puffs when burnt)', () => {
    const m = meta('pan_red_press');
    const used = (m.frameLabels as string[]).join(' ');
    expect(used).not.toMatch(/src7\b/);
    expect(used).not.toMatch(/src13\b/);
    expect(used).not.toMatch(/src14\b/);
  });
  it('the burnt loop has no press moment: step 2 repeats a smoke frame', () => {
    const m = meta('pan_red_press');
    const burnt: number[] = m.stir.clips.burnt;
    expect(m.frameLabels[burnt[2]]).not.toMatch(/src14\b/);
  });
  it('press loop: rest steps dwell longer than the pressed step, and the loop wraps', () => {
    const N = 4000;
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) counts[pressStep(i / N)]++;
    expect(counts[2]).toBeGreaterThan(0);
    for (const rest of [0, 1, 3]) expect(counts[rest]).toBeGreaterThan(counts[2]);
    expect(pressStep(0)).toBe(0);
    expect(pressStep(1)).toBe(0);
    expect(pressStep(-0.01)).toBe(3);
  });
  it('press plate hook: up at rest, fully down at the pressed step, never outside 0..1', () => {
    let seenDown = false;
    for (let i = 0; i <= 1000; i++) {
      const u = i / 1000;
      const d = pressDown(u);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      if (pressStep(u) === 2) {
        expect(d).toBe(1);
        seenDown = true;
      }
    }
    expect(seenDown).toBe(true);
    expect(pressDown(0)).toBe(0);
  });
  it('the stir step helper is unchanged: 8 steps, wraps', () => {
    expect(stirStep(0)).toBe(0);
    expect(stirStep(0.999)).toBe(7);
  });
});

describe('nachos melt sheet', () => {
  const LOOKS = ['raw', 'melting', 'melted', 'browned', 'burnt'];
  const m = () => checkSheet('nachos_melt', LOOKS, 4);
  it('json matches the picture; frame size and anchor follow the other nachos sheets', () => {
    const melt = m();
    const other = meta('nachos_chicken');
    expect([melt.frameWidth, melt.frameHeight]).toEqual([other.frameWidth, other.frameHeight]);
    expect(melt.originX).toBe(other.originX);
    expect(melt.anchorPx.x).toBe(other.anchorPx.x);
    expect(Math.abs(melt.anchorPx.y - 199)).toBeLessThanOrEqual(3); // the old frames' pile bottom
  });
  it('the sheet has no protein or toppings picture', () => {
    for (const label of m().frameLabels as string[]) expect(label).not.toMatch(/protein|toppings|finished/i);
  });
  it('the melt oven never shows a frame outside the nachos_melt sheet: every blend, at every time, phase and burn share, uses its own clips', () => {
    const melt = m();
    const all = new Set<number>(LOOKS.flatMap((l) => melt.stir.clips[l] as number[]));
    for (const phase of ['cooking', 'ready', 'danger', 'burnt'] as const) {
      for (const still of [false, true]) {
        for (let t = 0; t < 20; t += 0.07) {
          for (const burn of [0, 0.2, 0.5, 0.8, 1]) {
            const b = meltBlend(melt.stir.clips, phase, t, 5, burn, still);
            expect(all.has(b.a)).toBe(true);
            expect(all.has(b.b)).toBe(true);
            expect(b.f).toBeGreaterThanOrEqual(0);
            expect(b.f).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
  it('the item goes raw > melted while cooking, melted when ready, burnt when burnt (looks, not frames)', () => {
    const melt = m();
    const look = (l: string) => new Set<number>(melt.stir.clips[l]);
    const inLook = (f: number, l: string) => look(l).has(f);
    const start = meltBlend(melt.stir.clips, 'cooking', 0, 5, 0, true);
    expect(inLook(start.a, 'raw')).toBe(true);
    expect(start.f).toBe(0);
    const late = meltBlend(melt.stir.clips, 'cooking', 4.9, 5, 0, true);
    expect(inLook(late.a, 'melted')).toBe(true);
    const ready = meltBlend(melt.stir.clips, 'ready', 6, 5, 0, true);
    expect(inLook(ready.a, 'melted')).toBe(true);
    expect(ready.f).toBe(0);
    const burnt = meltBlend(melt.stir.clips, 'burnt', 30, 5, 1, true);
    expect(inLook(burnt.a, 'burnt')).toBe(true);
    expect(inLook(burnt.b, 'burnt')).toBe(true);
  });
  it('reduced motion holds one step: the frame does not change with time inside a look', () => {
    const melt = m();
    const a = meltBlend(melt.stir.clips, 'ready', 6.0, 5, 0, true);
    const b = meltBlend(melt.stir.clips, 'ready', 6.5, 5, 0, true);
    expect(a).toEqual(b);
  });
});

describe('texture memory of the taco pan and oven sheets', () => {
  // The brief's ~80 MB budget was set for the 8 stir pan sheets (71.2 MB, see taco_stir.test.ts). The press pans (9.0 MB) and the melt sheet (2.7 MB) bring the
  // total to about 83 MB, so this gate is 85 MB and the owner is told in the report; do not raise it without telling the owner.
  it('GPU memory of the 8 stir pans + 2 press pans + the melt sheet is at most 85 MB', () => {
    const names = ['veggies', 'chicken', 'shrimp', 'fish'].flatMap((p) => ['red', 'blue'].map((c) => `pan_${c}_${p}`)).concat(['pan_red_press', 'pan_blue_press', 'nachos_melt']);
    let bytes = 0;
    for (const n of names) {
      const mm = meta(n);
      bytes += mm.frameWidth * mm.columns * mm.frameHeight * mm.rows * 4;
    }
    expect(bytes / 1048576).toBeLessThanOrEqual(85);
  });
});
