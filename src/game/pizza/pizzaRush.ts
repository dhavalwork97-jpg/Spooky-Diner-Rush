// Delivery Rush: pure helpers (no Phaser). Takeout tickets wait at the counter and take no seat.

export interface RushConfig {
  minStep: number;
  duration: number;
  tickets: [number, number];
  coinMult: number;
  completeBonus: number;
}

export const RUSH_ID = 'delivery_rush';

/** How many tickets this rush brings, from the configured range (inclusive). */
export function rushTicketCount(cfg: Pick<RushConfig, 'tickets'>, rng: () => number): number {
  const [lo, hi] = cfg.tickets;
  return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}

/** Coins for one served ticket: the pizza price times the rush multiplier, plus any perfect-bake tip. */
export function rushTicketCoins(price: number, coinMult: number, perfectTip = 0): number {
  return Math.round(price * coinMult) + perfectTip;
}

/** Bonus for serving EVERY ticket of the rush: a fraction of what the tickets paid. */
export function rushCompleteBonus(totalCoins: number, fraction: number): number {
  return Math.round(totalCoins * fraction);
}

/** A rush may start from this menu step on. */
export function rushAvailable(cfg: Pick<RushConfig, 'minStep'>, step: number): boolean {
  return step >= cfg.minStep;
}
