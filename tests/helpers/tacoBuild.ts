import { TacoKitchenState } from '../../src/game/taco/TacoKitchenState';
import { stepKind, type Protein } from '../../src/game/taco/tacoConfig';
import { defaultConfig } from '../../src/game/config';

export const tacoAt = (level: number, seed = 1) => new TacoKitchenState({ level, xp: 0, coins: 0 }, defaultConfig, undefined, seed);

/** Quiet kitchen: no customers and no events unless a test asks for them. */
export function quiet(s: TacoKitchenState): TacoKitchenState {
  s.nextArrival = 1e9;
  s.nextEventIn = 1e9;
  return s;
}

export function run(s: TacoKitchenState, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds - 1e-9; t += step) s.update(step);
}

export const invalids = (s: TacoKitchenState): string[] => s.drainEvents().flatMap((e) => (e.type === 'invalid' ? [e.message] : []));

/** Plays one dish from the first step to the finished plate using only the public taps. Returns the plate index. */
export function buildDish(s: TacoKitchenState, dishId: string): number {
  const d = s.dishDef(dishId)!;
  d.steps.forEach((step, i) => {
    const kind = stepKind(step, i);
    const plate = () => s.plates.findIndex((p) => p.item?.building);
    if (kind === 'base' || kind === 'ingredient') s.tapIngredient(step);
    else if (kind === 'protein') {
      const protein = step.split(':')[1] as Protein;
      s.startProtein(protein);
      run(s, s.taco.proteins[protein].readyAfter + 0.2);
      s.tapPan(s.pans.findIndex((p) => p?.what.kind === 'protein' && p.phase === 'ready'));
    } else if (kind === 'shell') {
      const slot = s.ovens.findIndex((o) => !o);
      s.tapOven(slot);
      run(s, s.taco.timed.crispy_shell.readyAfter + 0.2);
      s.tapOven(slot);
    } else if (kind === 'action') s.tapPlate(plate());
    else if (kind === 'press') {
      s.tapPlate(plate());
      run(s, s.taco.timed.press.readyAfter + 0.2);
      s.tapPan(s.pans.findIndex((p) => p?.what.kind === 'press'));
    } else {
      s.tapPlate(plate());
      run(s, s.taco.timed.melt.readyAfter + 0.2);
      s.tapOven(s.ovens.findIndex((o) => o?.what.kind === 'melt'));
    }
  });
  return s.plates.findIndex((p) => p.item?.dish === dishId);
}
