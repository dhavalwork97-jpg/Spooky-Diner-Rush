import type { StationType, ZoneDef } from './zones';

/**
 * Seam between the kitchen tap zones and the station gameplay systems.
 * Milestone 1 has no cooking mechanics yet, so handlers here only report the tap.
 * The StationSystem (Milestone 2) registers real handlers with registerStationHandler.
 * A handler returns a short status line for the label, or void.
 */
export type StationHandler = (zone: ZoneDef) => string | void;

const handlers = new Map<StationType, StationHandler>();

export function registerStationHandler(station: StationType, handler: StationHandler): void {
  handlers.set(station, handler);
}

export function clearStationHandlers(): void {
  handlers.clear();
}

export const STATION_LABELS: Record<StationType, string> = {
  fryer: 'Fryer',
  grill: 'Grill',
  assembly: 'Assembly',
  drinks: 'Drinks',
  ice_cream: 'Ice cream',
  oven: 'Pizza oven',
  toppings: 'Toppings',
  dough: 'Dough',
  prep: 'Prep',
  ingredients: 'Ingredients',
  trash: 'Trash',
  chiller: 'Chiller',
};

/** Called by the scene on a tap. Returns the label text to show. */
export function handleStationTap(zone: ZoneDef, level: number): string {
  if (level < zone.unlockLevel) return `${STATION_LABELS[zone.station]}: Lv ${zone.unlockLevel}`;
  const handler = handlers.get(zone.station);
  const result = handler?.(zone);
  return typeof result === 'string' ? result : STATION_LABELS[zone.station];
}
