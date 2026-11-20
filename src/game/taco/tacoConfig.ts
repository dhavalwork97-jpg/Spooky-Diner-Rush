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
  /** Chance that an order is as big as `orderSize` allows, when the range spans three or more items. Missing: every size is equally likely (the old behaviour). */
  bigOrderShare?: number;
}
/** How orders are mixed up so the truck does not feel repetitive (see tacoVariety.ts). All numbers are first-pass, tuned in data/taco.json. Missing in a config: every effect is off. */
export interface TacoVariety {
  /** How many of the last ordered dishes are remembered. */
  recentDishes: number;
  /** Chance multiplier for the dish ordered most recently, the one before, and so on. A dish is never fully excluded by this. */
  recencyWeights: number[];
  /** How many of the last ordered items (dishes and drinks) are looked at to see which category is over- or under-used. */
  kindWindow: number;
  /** 0 = categories are ignored. Higher pushes harder towards the categories that have been ordered least lately. */
  kindStrength: number;
  kindMin: number;
  kindMax: number;
  /** Same idea for the drink chance: drinks ordered a lot lately make the next one less likely, and the other way round. */
  drinkStrength: number;
  drinkMin: number;
  drinkMax: number;
  /** One customer does not order the same dish twice while the menu has another dish to offer. */
  avoidDuplicateInOrder: boolean;
}
/** How a new dish is brought in, so the player is never thrown into it (see tacoLearning.ts). All numbers are first-pass, tuned in data/taco.json. */
export interface TacoLearning {
  /** Serves of a dish before it counts as learned and joins the normal rotation. */
  practiceServes: number;
  /** The one-dish introduction order waits this much longer than normal. */
  introPatienceMult: number;
  /** While an introduction order is waiting, at most this many customers are in the truck. */
  introSeats: number;
  /** Seconds after the menu grows before the introduction customer can arrive. */
  introDelay: number;
  /** The next first-time dish waits until every dish before it has been served at least this often. */
  introNeedsServes: number;
  /** A dish that is still being practised is picked this much as often as a learned one. */
  practiceWeight: number;
  /** An order that holds a dish still being practised has at most this many items. */
  practiceMaxItems: number;
  /** Arrivals are this much slower (fraction) for each dish that is not learned yet. */
  gapPerUnfamiliar: number;
  gapMaxUnfamiliar: number;
  /** Most crispy tacos plus nachos (oven dishes) the waiting customers may want at once, and most burritos (pan presses). Keeps one station from being everyone's bottleneck. */
  ovenItemCap: number;
  pressItemCap: number;
}
/** Which kitchen setting an upgrade changes (`pourSpeed` is the truck's own; the others are the shared kitchen mods). */
export type TacoModKey = 'grillSpeed' | 'ovenSpeed' | 'burnWindow' | 'patience' | 'pourSpeed';
export interface TacoUpgradeTier {
  cost: number;
  /** The value the setting has once this tier is bought (a multiplier, not an increment). */
  value: number;
  /** Menu step at which this tier can be bought, so the upgrades arrive with the difficulty. */
  step: number;
}
export interface TacoUpgradeDef {
  id: string;
  name: string;
  description: string;
  mod: TacoModKey;
  tiers: TacoUpgradeTier[];
}
export interface TacoConfig {
  restaurant: { id: string; name: string; unlockLevel: number; cost: number };
  settings: TacoSettings;
  learning: TacoLearning;
  /** Order variety. Optional so older configs (tests) keep the plain random behaviour. */
  variety?: TacoVariety;
  upgrades: TacoUpgradeDef[];
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
