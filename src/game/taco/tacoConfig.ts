import tacoJson from '../../../data/taco.json';

// Types, defaults and pure helpers for the Taco Truck kitchen. No Phaser.

export type Protein = 'chicken' | 'shrimp' | 'fish' | 'veggies';
export type DishKind = 'soft_taco' | 'crispy_taco' | 'burrito' | 'nachos';

export interface TacoSettings {
  pans: number;
  ovenSlots: number;
  /** The orange plates on the pass counter (four, drawn by TacoViews): every dish in progress sits on one. */
  plateSlots: number;
  seats: number;
  /** Cups each dispenser can fill at once. */
  drinkLanes: number;
  /** Chance that one item of an order is a drink. */
  drinkChance: number;
  maxOrderSize: number;
  /** First-pass ease for a new restaurant: slightly slower arrivals than the diner's table at the same step (patience and seats ease through `ramp`). */
  arrivalGapMult: number;
}
export interface TimedDef {
  readyAfter: number;
  burnWindow: number;
}
export interface DishDef {
  id: string;
  name: string;
  kind: DishKind;
  protein: Protein;
  /** Menu step (1-10) at which the dish joins the menu. Not the global Lv. */
  unlockStep: number;
  price: number;
  xp: number;
  /** Steps in order, using the pack's ids (`protein:chicken`, `topping_lettuce`, `action:wrap`, `pan:press`, `oven:melt` ...). */
  steps: string[];
  /** Build-sheet frame to show after completing step k (index k-1). Null for crispy tacos (no build frames yet). */
  frames: number[] | null;
  /** Animation sheet key (`public/assets/taco/animations/<sheet>_sheet.webp`), or null. */
  sheet: string | null;
  /** Finished sprite key (`public/assets/taco/sprites/<sprite>.webp`). */
  sprite: string;
}
export interface DrinkDef {
  id: string;
  name: string;
  unlockStep: number;
  price: number;
  xp: number;
  fillSeconds: number;
  dispenser: string;
  /** Row of `drink_cups_sheet` (frame = row * 5 + fill level 0-4). */
  sheetRow: number;
}
export type ZoneAction = 'protein' | 'pan' | 'oven' | 'ingredient' | 'plate' | 'drinks' | 'cup' | 'trash';
/** A tap area on the kitchen art, as a 0-1 rectangle of the background image. */
export interface TacoZone {
  id: string;
  action: ZoneAction;
  /** Protein, ingredient step id or drink id, depending on the action. */
  arg?: string;
  /** Pan, oven slot, plate or cup lane number (from 0). */
  index?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TacoRamp {
  step: number;
  seats: number;
  orderSize: [number, number];
  patienceMult: number;
}
export interface TacoConfig {
  restaurant: { id: string; name: string; unlockLevel: number; cost: number };
  settings: TacoSettings;
  proteins: Record<Protein, TimedDef>;
  timed: { crispy_shell: TimedDef; melt: TimedDef; press: TimedDef };
  /** How busy the truck is at each menu step: seats in use, order size and the patience bonus. */
  ramp: TacoRamp[];
  drinks: DrinkDef[];
  stepLabels: Record<string, string>;
  dishes: DishDef[];
  /** The two background layers (customers are drawn between them) under public/<folder>/<name>.webp. */
  art: { folder: string; back: string; front: string; width: number; height: number };
  /** Where customers stand behind the ledge and where a dish can be dropped to serve (all 0-1 of the background). */
  customerWindow: {
    slots: { id: string; x: number; bottomY: number }[];
    bandTop: number;
    bandBottom: number;
    bubbleY: number;
    dropZone: { x: number; y: number; width: number; height: number };
  };
  zones: TacoZone[];
}

export const defaultTacoConfig: TacoConfig = tacoJson as unknown as TacoConfig;

export type StepKind = 'base' | 'shell' | 'protein' | 'ingredient' | 'action' | 'press' | 'melt';

/** What kind of tap a step needs. `index` is the step's position in the recipe (step 0 starts a plate). */
export function stepKind(id: string, index: number): StepKind {
  if (id.startsWith('protein:')) return 'protein';
  if (id.startsWith('action:')) return 'action';
  if (id === 'pan:press') return 'press';
  if (id === 'oven:melt') return 'melt';
  if (id === 'crispy_shell') return 'shell';
  return index === 0 ? 'base' : 'ingredient';
}

/** Dishes the player can make at this menu step. */
export function unlockedDishes(cfg: TacoConfig, step: number): DishDef[] {
  return cfg.dishes.filter((d) => d.unlockStep <= step);
}

/** Unlocked dishes whose first steps are exactly `placed`. A dish in progress can still become any of these. */
export function candidateDishes(cfg: TacoConfig, step: number, placed: readonly string[]): DishDef[] {
  return unlockedDishes(cfg, step).filter((d) => placed.length <= d.steps.length && placed.every((s, i) => d.steps[i] === s));
}

/** The dish finished by exactly these steps, if any. */
export function finishedDish(cfg: TacoConfig, step: number, placed: readonly string[]): DishDef | undefined {
  return candidateDishes(cfg, step, placed).find((d) => d.steps.length === placed.length);
}

/** Step ids that could come next after `placed` (unique, in menu order). */
export function nextStepIds(cfg: TacoConfig, step: number, placed: readonly string[]): string[] {
  const out: string[] = [];
  for (const d of candidateDishes(cfg, step, placed)) {
    const next = d.steps[placed.length];
    if (next !== undefined && !out.includes(next)) out.push(next);
  }
  return out;
}

/** What to draw for a dish in progress: the unique dish if the steps so far decide it, else the first candidate (frame 0 looks alike). */
export function buildView(cfg: TacoConfig, step: number, placed: readonly string[]): { dish: string | null; sheet: string | null; frame: number | null } {
  const c = candidateDishes(cfg, step, placed);
  const d = c.find((x) => x.sheet) ?? c[0];
  if (!d) return { dish: null, sheet: null, frame: null };
  const frame = d.frames && placed.length > 0 ? d.frames[placed.length - 1] : null;
  return { dish: c.length === 1 ? d.id : null, sheet: d.sheet, frame };
}
