import type { BackgroundPlacement } from '../kitchen/zones';

/**
 * Positions of things drawn on top of the static kitchen art, in source-image pixels
 * (1699 x 948, the new 2752 x 1536 kitchen art scaled to 1699 wide) so they stay aligned however the
 * canvas is scaled. Lengths from the earlier art (sprite widths) still fit because the scale is unchanged.
 */
export const SRC_W = 1699;
export const SRC_H = 948;

export const SEATS_X = [916, 582, 1249, 1402];
export const SEAT_BOTTOM_Y = 248;
export const VATS: [number, number][] = [[345, 665], [469, 665]];
/** The four grill burners painted in the art: top row first, then the bottom row. */
export const BURNERS: [number, number][] = [[1340, 487], [1489, 487], [1351, 552], [1512, 552]];
/** The timer ring and FLIP label of a bottom-row burner go below the patty, so they never cover the top row. */
export const BURNER_LABEL_BELOW = [false, false, true, true];
/** Size, in source pixels, of fries and nuggets sitting in a vat: kept inside the glass lid (about 114 x 75). */
/** The inner glass of one vat lid, in source pixels around the vat point: half width, top and bottom y. */
export const VAT_GLASS = { halfW: 57, top: 628, bottom: 703 };
export const VAT_FOOD_W = { fries: 104, nuggets: 64 };
/** Where a raw pizza sits on the pulled-out oven door (door open, art at rest). */
export const OVENS: [number, number][] = [[777, 814]];
/** Where the cooked pizza sits on the baking tray once the door has opened (lit interior). */
export const OVENS_LIT: [number, number][] = [[757, 725]];
/** Centre of the raw food piled in the fries and nuggets baskets, where the food leaves from. */
export const FRY_FROM = { fries: [448, 815], nuggets: [308, 815] } as const;
/** Plates on the serving counter (burgers) first, then the two side plates on the left counter (fries). */
export const SLOTS: [number, number][] = [[1005, 450], [1141, 450], [1008, 538], [1144, 539], [378, 546], [522, 545]];

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
  /** Scale an image so it is `srcWidth` source pixels wide. Returns the scale used. */
  fit(img: { width: number; setScale(x: number): unknown }, srcWidth: number): number {
    const k = this.s(srcWidth) / img.width;
    img.setScale(k);
    return k;
  }
  /** Source-image distance to logical distance. */
  s(len: number): number {
    return len * this.k;
  }
}

/** First painted cup under the dispenser and first painted cone in the ice cream machine (x, y, w, h in source pixels). */
export const CUP: [number, number, number, number] = [123, 381, 45, 74];
export const CONE: [number, number, number, number] = [34, 684, 57, 89];
/** Where the progress rings sit on the dispenser and on the ice cream machine. */
export const DRINK_RING: [number, number] = [283, 215];
export const CONE_RING: [number, number] = [192, 527];
