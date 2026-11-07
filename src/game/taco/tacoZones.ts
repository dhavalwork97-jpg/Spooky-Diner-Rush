import type { TacoKitchenState } from './TacoKitchenState';
import type { Protein, TacoZone } from './tacoConfig';

/**
 * The zone under a normalised point (0-1 of the background), or null. An exact hit always wins; if several zones contain the point
 * (a cup inside its dispenser, the overlapping pans) the one whose centre is closest wins, so one tap never triggers two things.
 * A tap that misses everything gets `slop` extra reach, which makes small zones easier to hit with a finger.
 */
export function hitTestTaco(zones: readonly TacoZone[], nx: number, ny: number, slop = 0): TacoZone | null {
  const pick = (pad: number): TacoZone | null => {
    let best: TacoZone | null = null;
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

/** Run the tap for a zone on the kitchen. A cup lane has no tap: a full cup is dragged to a customer. */
export function tapZone(s: TacoKitchenState, z: TacoZone): void {
  switch (z.action) {
    case 'protein':
      return s.startProtein(z.arg as Protein);
    case 'pan':
      return s.tapPan(z.index ?? 0);
    case 'oven':
      return s.tapOven(z.index ?? 0);
    case 'ingredient':
      return s.tapIngredient(z.arg!);
    case 'plate':
      return s.tapPlate(z.index ?? 0);
    case 'drinks':
      return s.tapDrinks(z.arg!);
    case 'trash':
      return s.tapTrash();
    case 'cup':
      return;
  }
}
