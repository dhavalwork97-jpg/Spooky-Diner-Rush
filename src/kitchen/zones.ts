// Pure zone math: no Phaser imports, so it can be unit tested.

export type StationType =
  | 'fryer'
  | 'fries_bin'
  | 'nuggets_bin'
  | 'grill'
  | 'patty_tray'
  | 'buns'
  | 'lettuce'
  | 'tomato'
  | 'side_plate'
  | 'assembly'
  | 'drinks'
  | 'ice_cream'
  | 'oven'
  | 'dough'
  | 'prep'
  | 'trash';

export const STATION_TYPES: readonly StationType[] = [
  'fryer',
  'fries_bin',
  'nuggets_bin',
  'grill',
  'patty_tray',
  'buns',
  'lettuce',
  'tomato',
  'side_plate',
  'assembly',
  'drinks',
  'ice_cream',
  'oven',
  'dough',
  'prep',
  'trash',
];

/** Normalized rectangle, 0..1 relative to the background image. */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneDef extends NormRect {
  id: string;
  station: StationType;
  unlockLevel: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the background sits inside the logical canvas. */
export interface BackgroundPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Contain-fit the background in the canvas, centered. Never distorts. */
export function fitBackground(
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number,
): BackgroundPlacement {
  const scale = Math.min(canvasW / imageW, canvasH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return { x: (canvasW - width) / 2, y: (canvasH - height) / 2, width, height };
}

export function normToLogical(rect: NormRect, bg: BackgroundPlacement): Rect {
  return {
    x: bg.x + rect.x * bg.width,
    y: bg.y + rect.y * bg.height,
    width: rect.width * bg.width,
    height: rect.height * bg.height,
  };
}

export function logicalToNorm(px: number, py: number, bg: BackgroundPlacement): { x: number; y: number } {
  return { x: (px - bg.x) / bg.width, y: (py - bg.y) / bg.height };
}

export function rectContains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Returns the single zone hit by a normalized point, or null.
 * If hit areas ever overlap, the zone whose center is closest wins,
 * so one tap can never trigger two stations.
 */
export function hitTestZone(zones: readonly ZoneDef[], nx: number, ny: number): ZoneDef | null {
  let best: ZoneDef | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    if (nx < z.x || nx > z.x + z.width || ny < z.y || ny > z.y + z.height) continue;
    const cx = z.x + z.width / 2;
    const cy = z.y + z.height / 2;
    const d = (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy);
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best;
}

/** Zones whose on-screen size is below the touch minimum (in CSS px). */
export function undersizedZones(
  zones: readonly ZoneDef[],
  bg: BackgroundPlacement,
  cssPerLogical: number,
  minCssPx = 88,
): { id: string; widthCss: number; heightCss: number }[] {
  const out: { id: string; widthCss: number; heightCss: number }[] = [];
  for (const z of zones) {
    const r = normToLogical(z, bg);
    const w = r.width * cssPerLogical;
    const h = r.height * cssPerLogical;
    if (w < minCssPx || h < minCssPx) out.push({ id: z.id, widthCss: Math.round(w), heightCss: Math.round(h) });
  }
  return out;
}
