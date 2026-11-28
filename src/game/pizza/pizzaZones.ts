import type { PizzaKitchenState } from './PizzaKitchenState';
import type { PizzaZone } from './pizzaConfig';

/**
 * The zone under a normalised point (0-1 of the background), or null. An exact hit wins; several zones containing the point -> the nearest centre wins,
 * so one tap never triggers two things. A tap that misses everything gets `slop` extra reach (small zones are easier to hit with a finger).
 */
export function hitTestPizza(zones: readonly PizzaZone[], nx: number, ny: number, slop = 0): PizzaZone | null {
  const pick = (pad: number): PizzaZone | null => {
    let best: PizzaZone | null = null;
    let bestDist = Infinity;
    for (const z of zones) {
      if (nx < z.x - pad || nx > z.x + z.width + pad || ny < z.y - pad || ny > z.y + z.height + pad) continue;
      const dx = nx - (z.x + z.width / 2);
      const dy = ny - (z.y + z.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = z;
      }
    }
    return best;
  };
  return pick(0) ?? (slop > 0 ? pick(slop) : null);
}

/** The board the trash bin clears: an unfinished pizza first (free), then an unbaked finished one, then a baked one (which costs coins). Never one in the oven. */
export function trashTarget(s: PizzaKitchenState): number | null {
  const rank = (status: string) => (status === 'building' ? 0 : status === 'built' ? 1 : status === 'baked' ? 2 : 9);
  let best: number | null = null;
  let bestRank = 9;
  s.boards.forEach((b, i) => {
    if (!b.item) return;
    const r = rank(b.item.status);
    if (r < bestRank || (r === bestRank && best !== null && i > best)) {
      bestRank = r;
      best = i;
    }
  });
  return bestRank < 9 ? best : null;
}

/** Run the tap for a zone on the kitchen model. Each zone maps to exactly one model call (the model answers with events). */
export function tapPizzaZone(s: PizzaKitchenState, z: PizzaZone): void {
  switch (z.action) {
    case 'dough':
      s.startPizza();
      return;
    case 'sauce':
    case 'cheese':
    case 'topping':
      s.addIngredient(`${z.action}:${z.arg}`);
      return;
    case 'board':
      s.tapBoard(z.index ?? 0);
      return;
    case 'oven':
      s.tapOven(z.index ?? 0);
      return;
    case 'side':
      s.startSide(z.arg!);
      return;
    case 'fryer':
      // The tray (raw food) starts the basket; the basket itself collects.
      if (z.id.startsWith('tray_')) s.startFried(z.arg === 'wings' ? 'chicken_wings' : 'fries');
      else s.tapFryer(z.index ?? 0);
      return;
    case 'small_oven': {
      // One tap area for both trays: collect a ready one, else burnt one, else wobble the first cooking one.
      const i = firstTray(s.smallOven);
      if (i >= 0) s.tapSmallOven(i);
      return;
    }
    case 'plate':
      s.tapPlate(z.index ?? 0);
      return;
    case 'ice': {
      const ready = s.ice.findIndex((l) => l && l.phase !== 'cooking');
      if (ready >= 0) s.tapIce(ready);
      else s.startIce();
      return;
    }
    case 'trash': {
      const b = trashTarget(s);
      if (b === null) s.discardBoard(0);
      else s.discardBoard(b);
      return;
    }
  }
}

function firstTray(list: ReadonlyArray<{ phase: string } | null>): number {
  let best = -1;
  let bestRank = 9;
  list.forEach((t, i) => {
    if (!t) return;
    // Ready/overcooking trays first (the player wants them out), then burnt, then cooking.
    const r = t.phase === 'cooking' ? 2 : t.phase === 'burnt' ? 1 : 0;
    if (r < bestRank) {
      bestRank = r;
      best = i;
    }
  });
  return best;
}
