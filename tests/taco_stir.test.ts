import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stirStep } from '../src/views/TacoViews';

const DIR = 'public/assets/taco/animations';
const PROTEINS = ['veggies', 'chicken', 'shrimp', 'fish'];
const names = PROTEINS.flatMap((p) => ['red', 'blue'].map((c) => `pan_${c}_${p}`));
const meta = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}_sheet.anim.json`), 'utf8'));
const webpSize = (file: string): { w: number; h: number } => {
  // VP8X (alpha) webp: canvas size is stored as 24-bit values at bytes 24..29 (minus one)
  const b = readFileSync(file);
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  expect(b.toString('ascii', 12, 16)).toBe('VP8X');
  return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
};

describe('pan stir sheets', () => {
  it('there are exactly 8: 4 proteins in red and in blue', () => {
    const found = readdirSync(DIR).filter((f) => /^pan_(red|blue)_(veggies|chicken|shrimp|fish)_sheet\.anim\.json$/.test(f)).map((f) => f.replace('_sheet.anim.json', '')).sort();
    expect(found).toEqual([...names].sort());
  });

  for (const n of names) {
    it(`${n}: json matches the picture and every clip points at a real frame`, () => {
      const m = meta(n);
      expect(m.key).toBe(n);
      const { w, h } = webpSize(join(DIR, m.image));
      expect(w).toBe(m.frameWidth * m.columns);
      expect(h).toBe(m.frameHeight * m.rows);
      expect(w).toBeLessThanOrEqual(4096);
      expect(h).toBeLessThanOrEqual(4096);
      expect(m.frameLabels).toHaveLength(m.frameCount);
      expect(m.frameCount).toBeLessThanOrEqual(m.columns * m.rows);
      expect(m.frameCount).toBeGreaterThan(m.columns * (m.rows - 1)); // no empty rows
      expect(m.stir.looks).toEqual(['raw', 'mid', 'cooked', 'burnt']);
      expect(m.stir.loop).toBe(8);
      expect(m.stir.empty).toBe(0);
      expect(m.frameLabels[0]).toBe('empty');
      for (const st of m.stir.looks) {
        const clip: number[] = m.stir.clips[st];
        expect(clip).toHaveLength(m.stir.loop);
        for (const f of clip) {
          expect(Number.isInteger(f)).toBe(true);
          expect(f).toBeGreaterThan(0); // 0 is the empty pan
          expect(f).toBeLessThan(m.frameCount);
        }
      }
      // the pan box lies inside the frame
      const b = m.panBox;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(m.frameWidth);
      expect(b.y + b.h).toBeLessThanOrEqual(m.frameHeight);
    });
  }

  it('every pan colour of a protein has the same frame table (only the pan colour differs)', () => {
    for (const p of PROTEINS) {
      const r = meta(`pan_red_${p}`), b = meta(`pan_blue_${p}`);
      expect(b.stir).toEqual(r.stir);
      expect(b.panBox).toEqual(r.panBox);
      expect([b.frameWidth, b.frameHeight, b.frameCount]).toEqual([r.frameWidth, r.frameHeight, r.frameCount]);
    }
  });

  it('the pan is drawn the same size in every protein (equal pan box width), so pans never change size when the protein changes', () => {
    const widths = new Set(names.map((n) => meta(n).panBox.w));
    expect(widths.size).toBe(1);
  });

  it('files and texture memory stay within the budget', () => {
    let gpu = 0;
    for (const n of names) {
      const m = meta(n);
      expect(statSync(join(DIR, m.image)).size).toBeLessThanOrEqual(1.5 * 1024 * 1024);
      gpu += m.frameWidth * m.columns * m.frameHeight * m.rows * 4;
    }
    expect(gpu / 1048576).toBeLessThanOrEqual(80);
  });
});

describe('stir loop timing', () => {
  it('covers all 8 steps once, in order, over one loop', () => {
    const seen: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const s = stirStep(i / 1000);
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('the rest steps (0 and 7) stay longer than any toss step', () => {
    const count = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) count[stirStep(i / 8000)]++;
    const toss = Math.max(...count.slice(1, 7));
    expect(count[0]).toBeGreaterThan(toss);
    expect(count[7]).toBeGreaterThan(toss);
  });

  it('wraps around and never leaves 0..7', () => {
    for (const u of [-1.3, -0.0001, 0, 0.5, 0.9999, 1, 2.7, 1e6 + 0.3]) {
      const s = stirStep(u);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(7);
    }
  });
});
