import { describe, expect, it } from 'vitest';
import { cupFrame } from '../src/views/TacoViews';

describe('cupFrame', () => {
  it('shows rising fill levels while filling and a full cup when ready', () => {
    expect(cupFrame(0, 'cooking', 0, 5)).toBe(1);
    expect(cupFrame(0, 'cooking', 2.6, 5)).toBe(2);
    expect(cupFrame(0, 'cooking', 4.9, 5)).toBe(3);
    expect(cupFrame(0, 'ready', 5, 5)).toBe(4);
  });
  it('uses the drink row: 5 frames per drink', () => {
    expect(cupFrame(1, 'cooking', 0, 5)).toBe(6);
    expect(cupFrame(1, 'ready', 5, 5)).toBe(9);
  });
});
