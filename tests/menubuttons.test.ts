import { describe, expect, it } from 'vitest';
import restaurants from '../data/restaurants.json';
import { fitBackground, normToLogical } from '../src/kitchen/zones';
import { MENU_BUTTON_RECTS } from '../src/views/MenuButtons';

type R = { x: number; y: number; width: number; height: number };
const overlap = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('menu buttons', () => {
  it('cover no tap zone at the logical canvas size', () => {
    const r = restaurants.restaurants[0];
    const bg = fitBackground(1280, 698, r.backgroundSize.width, r.backgroundSize.height);
    for (const z of r.zones) {
      const rect = normToLogical(z as never, bg);
      for (const b of MENU_BUTTON_RECTS) expect(overlap(b, rect), `a button overlaps zone ${z.id}`).toBe(false);
    }
  });
  it('stay inside the canvas and do not overlap each other by more than a few pixels', () => {
    for (const b of MENU_BUTTON_RECTS) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1280);
      expect(b.y + b.height).toBeLessThanOrEqual(698);
    }
    for (let i = 0; i < MENU_BUTTON_RECTS.length - 1; i++) {
      const a = MENU_BUTTON_RECTS[i];
      const c = MENU_BUTTON_RECTS[i + 1];
      expect(Math.abs(a.x - (c.x + c.width))).toBeLessThanOrEqual(2);
    }
  });
});
