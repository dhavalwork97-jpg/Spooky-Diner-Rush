import type { EventDef } from './config';
import { randInt, type Rng } from './rng';

/**
 * Spooky events, pure logic (no Phaser): the Bat Delivery flight plan, where the bat is at a given moment, the coin bag, and the
 * check of data/events.json. The model decides who gets coins; the scene only draws what these functions say.
 */

/** Seconds one bat takes to cross the screen. */
export const BAT_FLIGHT_SECONDS = 4.5;
/** A bat never flies within this many seconds of the event's start or end. */
const BAT_MARGIN = 1;
/** Where the bat flies, in the scene's logical pixels: the wall above the stools. */
export const BAT_BAND = { top: 95, bottom: 185, bob: 14 };
/** How much of its slot a flight's start may be pushed back at random (0.4 = up to 40 percent of the slot). */
const BAT_JITTER = 0.4;
/** The bat starts and ends this far outside the screen. */
const BAT_OFFSCREEN = 100;
/** Longest event name that fits the banner. */
export const EVENT_NAME_MAX = 16;

export interface BatFlight {
  /** Seconds after the event started. */
  at: number;
  fromLeft: boolean;
  /** 0 (top of the band) to 1 (bottom). */
  y: number;
}

/** `flights` flights spread over the event, one after another (never two bats at once), alternating direction, from a random side. */
export function batSchedule(flights: number, duration: number, rng: Rng): BatFlight[] {
  const usable = duration - BAT_FLIGHT_SECONDS - BAT_MARGIN * 2;
  const slot = usable / flights;
  let left = rng() < 0.5;
  return Array.from({ length: flights }, (_, i) => {
    const flight: BatFlight = { at: BAT_MARGIN + i * slot + rng() * slot * BAT_JITTER, fromLeft: left, y: 0.1 + rng() * 0.8 };
    left = !left;
    return flight;
  });
}

/** Index of the next flight that should be on screen now (not started yet, time reached), or -1. `started` = how many have started. */
export const nextFlightDue = (plan: readonly BatFlight[], started: number, elapsed: number): number => (started < plan.length && elapsed >= plan[started].at ? started : -1);

/** Where the bat is `elapsed` seconds into the event: x runs from one side to the other, y bobs gently. `progress` is 0 to 1 (outside that the flight is not on screen). */
export function batPosition(flight: BatFlight, elapsed: number, width: number): { x: number; y: number; progress: number; flip: boolean } {
  const progress = (elapsed - flight.at) / BAT_FLIGHT_SECONDS;
  const span = width + BAT_OFFSCREEN * 2;
  const run = -BAT_OFFSCREEN + span * progress;
  const x = flight.fromLeft ? run : width - run;
  const y = BAT_BAND.top + (BAT_BAND.bottom - BAT_BAND.top) * flight.y + BAT_BAND.bob * Math.sin(progress * Math.PI * 4);
  return { x, y, progress, flip: !flight.fromLeft };
}

/** The coins in one dropped bag: a multiple of 5 inside the range (20, 25, 30, 35 or 40 for 20-40). */
export function batBagCoins(range: readonly [number, number], rng: Rng): number {
  const lo = Math.ceil(range[0] / 5);
  const hi = Math.floor(range[1] / 5);
  return randInt(rng, lo, Math.max(lo, hi)) * 5;
}

/** Problems with the events data (empty list = fine). */
export function validateEvents(events: readonly EventDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const e of events) {
    const w = `event ${e.id || '?'}`;
    if (!e.id || ids.has(e.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(e.id);
    if (!e.name || e.name.length > EVENT_NAME_MAX) errors.push(`${w}: name must be 1 to ${EVENT_NAME_MAX} characters (it has to fit the banner)`);
    if (!Number.isInteger(e.minLevel) || e.minLevel < 1) errors.push(`${w}: minLevel must be a whole number >= 1`);
    if (!(e.duration >= 10 && e.duration <= 120)) errors.push(`${w}: duration must be 10 to 120 seconds`);
    if (e.arrivalMult !== undefined && !(e.arrivalMult >= 0.3 && e.arrivalMult <= 1.5)) errors.push(`${w}: arrivalMult must be 0.3 to 1.5`);
    if (e.coinMult !== undefined && !(e.coinMult >= 1 && e.coinMult <= 3)) errors.push(`${w}: coinMult must be 1 to 3`);
    if (e.look !== undefined && e.look !== 'moon' && e.look !== 'lights') errors.push(`${w}: look must be moon or lights`);
    if (e.party) {
      if (!Number.isInteger(e.party.size) || e.party.size < 2 || e.party.size > 3) errors.push(`${w}: party.size must be 2 or 3`);
      if (!(e.party.bonus > 0 && e.party.bonus <= 0.5)) errors.push(`${w}: party.bonus must be above 0 and at most 0.5`);
    }
    if (e.bat) {
      const b = e.bat;
      if (!Number.isInteger(b.flights) || b.flights < 1 || b.flights > 5) errors.push(`${w}: bat.flights must be 1 to 5`);
      if (!(b.coins[0] >= 5 && b.coins[1] >= b.coins[0] && b.coins[1] <= 100)) errors.push(`${w}: bat.coins must be [lo, hi] with 5 <= lo <= hi <= 100`);
      if (!Number.isInteger(b.maxDrops) || b.maxDrops < 1 || b.maxDrops > b.flights) errors.push(`${w}: bat.maxDrops must be 1 to the number of flights`);
      const room = e.duration - BAT_MARGIN * 2 - BAT_FLIGHT_SECONDS;
      // Worst case a flight starts BAT_JITTER late in its slot and must still be over before the next slot opens.
      if (b.flights > 0 && (room / b.flights) * (1 - BAT_JITTER) < BAT_FLIGHT_SECONDS) errors.push(`${w}: the event is too short for ${b.flights} separate flights`);
    }
  }
  return errors;
}
