import type { BackgroundPlacement } from '../kitchen/zones';

/**
 * Positions of things drawn on top of the static kitchen art, in source-image pixels
 * (1699 x 926) so they stay aligned however the canvas is scaled.
 */
export const SRC_W = 1699;
export const SRC_H = 926;

export const SEATS_X = [893, 570, 1220, 388];
export const SEAT_BOTTOM_Y = 250;
export const VATS: [number, number][] = [[1095, 690], [1205, 690]];
export const BURNERS: [number, number][] = [[1308, 485], [1430, 485], [1308, 550], [1445, 550]];
export const SLOTS: [number, number][] = [[980, 452], [1113, 452], [980, 535], [1113, 535]];

export class Layout {
  constructor(readonly bg: BackgroundPlacement) {}
  get k(): number {
    return this.bg.width / SRC_W;
  }
  x(sx: number): number {
    return this.bg.x + sx * this.k;
  }
  y(sy: number): number {
    return this.bg.y + sy * (this.bg.height / SRC_H);
  }
  /** Source-image distance to logical distance. */
  s(len: number): number {
    return len * this.k;
  }
}
