import { describe, expect, it } from 'vitest';
import { laneSpan } from '../src/kitchen/grab';

const xs = [0, -50, 50]; // mid, left, right (like the dispenser lanes), lane pitch 50

describe('laneSpan', () => {
  it('a lone ready lane also grabs the free space around it', () => {
    const s = laneSpan(xs, [true, false, false], 0, 50);
    expect(s.right - s.left).toBeCloseTo(90, 5); // 0.9 lane each way
  });
  it('two ready neighbours split the gap and never overlap', () => {
    const a = laneSpan(xs, [true, true, false], 0, 50); // mid next to left
    const b = laneSpan(xs, [true, true, false], 1, 50);
    expect(xs[0] + a.left).toBeCloseTo(xs[1] + b.right, 5); // they meet at the midpoint (-25)
    expect(xs[0] + a.left).toBeCloseTo(-25, 5);
  });
  it('all three ready: each keeps about its own lane', () => {
    for (const i of [0, 1, 2]) {
      const s = laneSpan(xs, [true, true, true], i, 50);
      expect(s.right - s.left).toBeLessThanOrEqual(90);
      expect(s.right - s.left).toBeGreaterThanOrEqual(45);
    }
  });
  it('a lane that is not ready does not shrink its neighbour', () => {
    const s = laneSpan(xs, [true, false, true], 0, 50);
    expect(s.left).toBeCloseTo(-45, 5);
    expect(s.right).toBeCloseTo(25, 5);
  });
});
