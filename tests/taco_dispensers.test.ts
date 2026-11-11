import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { DISPENSER_ART, pourFrame } from '../src/views/TacoDispensers';
import taco from '../data/taco.json';

const dir = 'public/assets/taco/animations/';
const metaOf = (machine: string) => JSON.parse(readFileSync(`${dir}${machine}_sheet.anim.json`, 'utf8')) as {
  key: string; image: string; base: string; frameWidth: number; frameHeight: number; columns: number; rows: number; frameCount: number;
  fullFrame: { width: number; height: number }; bandTop: number; lanes: [number, number][]; clips: Record<string, [number, number]>;
};

describe('pouring dispenser art', () => {
  it('every drink has a machine, and its files exist', () => {
    for (const d of taco.drinks) {
      const art = DISPENSER_ART[d.id];
      expect(art, d.id).toBeDefined();
      const m = metaOf(art.machine);
      expect(m.key).toBe(art.machine);
      expect(statSync(`${dir}${m.image}`).size).toBeGreaterThan(1000);
      expect(statSync(`${dir}${m.base}`).size).toBeGreaterThan(1000);
    }
  });
  it('sheet grid, band and clips are consistent', () => {
    for (const art of Object.values(DISPENSER_ART)) {
      const m = metaOf(art.machine);
      expect(m.rows * m.columns).toBeGreaterThanOrEqual(m.frameCount);
      expect(m.bandTop + m.frameHeight).toBeLessThanOrEqual(m.fullFrame.height);
      expect(m.clips.idle_empty).toEqual([0, 0]);
      expect(m.clips.pour).toEqual([0, m.frameCount - 1]);
      expect(m.clips.idle_full).toEqual([m.frameCount - 1, m.frameCount - 1]);
    }
  });
  it('three lane columns, left to right, side by side across the whole machine width', () => {
    for (const art of Object.values(DISPENSER_ART)) {
      const m = metaOf(art.machine);
      expect(m.lanes).toHaveLength(taco.settings.drinkLanes);
      expect(m.lanes[0][0]).toBe(0);
      expect(m.lanes[2][1]).toBe(m.fullFrame.width);
      expect(m.lanes[0][1]).toBe(m.lanes[1][0]);
      expect(m.lanes[1][1]).toBe(m.lanes[2][0]);
    }
  });
  it('each cup tap area lies inside its own lane column of the drawn machine', () => {
    const cups = taco.zones.filter((z) => z.action === 'cup');
    expect(cups).toHaveLength(6);
    for (const d of taco.drinks) {
      const mine = cups.filter((z) => z.arg === d.id).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      expect(mine.map((z) => z.index)).toEqual([0, 1, 2]);
      for (let i = 1; i < 3; i++) expect(mine[i].x).toBeGreaterThan(mine[i - 1].x + mine[i - 1].width - 0.002);
    }
  });
});

describe('pourFrame (fill progress to clip frame)', () => {
  it('starts on the empty frame and reaches the full frame exactly when the fill is done', () => {
    expect(pourFrame(0, 35)).toEqual({ lo: 0, hi: 1, mix: 0 });
    expect(pourFrame(1, 35)).toEqual({ lo: 34, hi: 34, mix: 0 });
    expect(pourFrame(2, 35).lo).toBe(34);
    expect(pourFrame(-1, 35).lo).toBe(0);
  });
  it('never goes backwards while filling', () => {
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const f = pourFrame(i / 100, 30);
      const pos = f.lo + f.mix;
      expect(pos).toBeGreaterThanOrEqual(last);
      last = pos;
    }
  });
});
